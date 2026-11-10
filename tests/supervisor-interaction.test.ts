import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capture, Supervisor } from '../src/main/supervisor.js';
import type { AppEvent, JobInteractionRequest } from '../src/shared/contracts.js';

function eventCollector() {
  const events: AppEvent[] = [];
  const waiters = new Map<string, (request: JobInteractionRequest) => void>();
  return {
    events,
    emit(event: AppEvent) {
      events.push(event);
      const request = event.type === 'job' ? event.job?.interactionRequest : undefined;
      if (request && event.job) waiters.get(event.job.id)?.(request);
    },
    async waitForInteraction(jobId: string): Promise<JobInteractionRequest> {
      const existing = events.find(event => event.type === 'job' && event.job?.id === jobId && event.job.interactionRequest)?.job?.interactionRequest;
      if (existing) return existing;
      const { promise, resolve, reject } = Promise.withResolvers<JobInteractionRequest>();
      waiters.set(jobId, resolve);
      // This integration test waits on output from a real PTY/child process; fake timers cannot advance OS process I/O.
      const timer = setTimeout(() => reject(new Error('The process did not publish its interaction request.')), 5000);
      try { return await promise; }
      finally { clearTimeout(timer); waiters.delete(jobId); }
    },
  };
}

test('interactive choices can be answered in the app without opening the terminal', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'studio-interaction-choice-'));
  const collected = eventCollector();
  const supervisor = new Supervisor(dataDir, event => collected.emit(event));
  try {
    await supervisor.init();
    const job = await supervisor.run({
      title: 'Choice prompt fixture',
      executable: process.execPath,
      args: ['-e', 'process.stdout.write("Continue? (y/n) "); process.stdin.once("data", value => { process.stdout.write(`chosen:${value.toString().trim()}`); process.exit(0); });'],
      cwd: dataDir,
      interactive: true,
      timeoutMs: 10000,
    });
    const request = await collected.waitForInteraction(job.id);
    assert.equal(request.kind, 'choice');
    assert.deepEqual(request.choices?.map(choice => choice.value), ['y', 'n']);
    supervisor.respond(job.id, 'y');
    const completed = await supervisor.wait(job.id);
    assert.equal(completed.status, 'succeeded');
    assert.match(completed.log, /chosen:y/);
  } finally {
    await supervisor.dispose();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('password answers are not recorded in subsequent process output', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'studio-interaction-password-'));
  const collected = eventCollector();
  const supervisor = new Supervisor(dataDir, event => collected.emit(event));
  try {
    await supervisor.init();
    const job = await supervisor.run({
      title: 'Password prompt fixture',
      executable: process.execPath,
      args: ['-e', 'process.stdout.write("Password: "); process.stdin.once("data", () => { process.stdout.write("accepted"); process.exit(0); });'],
      cwd: dataDir,
      interactive: true,
      timeoutMs: 10000,
    });
    const request = await collected.waitForInteraction(job.id);
    assert.equal(request.kind, 'password');
    supervisor.respond(job.id, 'fixture-secret-123');
    const completed = await supervisor.wait(job.id);
    assert.equal(completed.status, 'succeeded');
    assert.doesNotMatch(completed.log, /fixture-secret-123|accepted/);
    assert.match(completed.log, /saída ocultada/);
  } finally {
    await supervisor.dispose();
    await rm(dataDir, { recursive: true, force: true });
  }
});
test('a completed job releases its project slot for the next native engine step', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'studio-project-job-slot-'));
  const supervisor = new Supervisor(dataDir, () => undefined);
  try {
    await supervisor.init();
    const first = await supervisor.run({ title: 'First native step', executable: process.execPath, args: ['-e', 'process.exit(0)'], cwd: dataDir, projectId: 'project-test', timeoutMs: 5000 });
    assert.equal((await supervisor.wait(first.id)).status, 'succeeded');
    const second = await supervisor.run({ title: 'Second native step', executable: process.execPath, args: ['-e', 'process.exit(0)'], cwd: dataDir, projectId: 'project-test', timeoutMs: 5000 });
    assert.equal((await supervisor.wait(second.id)).status, 'succeeded');
  } finally {
    await supervisor.dispose();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('forgetProject preserves memory when persistence fails and removes only the target project on retry', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'studio-forget-project-'));
  const supervisor = new Supervisor(dataDir, () => undefined);
  try {
    await supervisor.init();
    const target = await supervisor.run({ title: 'Target job', executable: process.execPath, args: ['-e', 'process.exit(0)'], cwd: dataDir, projectId: 'project-target', timeoutMs: 5000 });
    assert.equal((await supervisor.wait(target.id)).status, 'succeeded');
    const other = await supervisor.run({ title: 'Other job', executable: process.execPath, args: ['-e', 'process.exit(0)'], cwd: dataDir, projectId: 'project-other', timeoutMs: 5000 });
    assert.equal((await supervisor.wait(other.id)).status, 'succeeded');
    await supervisor.dispose();

    await mkdir(join(dataDir, 'jobs.json.tmp'));
    await assert.rejects(supervisor.forgetProject('project-target'));
    assert.deepEqual(supervisor.list().map(job => job.id).sort(), [target.id, other.id].sort());

    await rm(join(dataDir, 'jobs.json.tmp'), { recursive: true, force: true });
    await supervisor.forgetProject('project-target');
    assert.deepEqual(supervisor.list().map(job => job.id), [other.id]);
    const persisted = JSON.parse(await readFile(join(dataDir, 'jobs.json'), 'utf8'));
    assert.deepEqual(persisted.map((job: { id: string }) => job.id), [other.id]);
  } finally {
    await supervisor.dispose();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('a zero-exit process remains active until output validation and fails if validation fails', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'studio-job-validation-'));
  const supervisor = new Supervisor(dataDir, () => undefined);
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  try {
    await supervisor.init();
    const job = await supervisor.run({
      title: 'Validar saída', executable: process.execPath, args: ['-e', 'process.exit(0)'], projectId: 'project-test',
      onSuccess: async () => { started.resolve(); await release.promise; throw new Error('Faltam páginas'); },
    });
    await started.promise;
    assert.equal(supervisor.list().find(item => item.id === job.id)?.status, 'running');
    await assert.rejects(supervisor.run({ title: 'Concorrente', executable: process.execPath, args: ['-e', ''], projectId: 'project-test' }), /tarefa ativa/);
    release.resolve();
    const result = await supervisor.wait(job.id);
    assert.equal(result.status, 'failed');
    assert.match(result.log, /Faltam páginas/);
  } finally {
    release.resolve();
    await supervisor.dispose();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('cancellation stops the native child used during post-processing', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'studio-cancel-finalization-'));
  const supervisor = new Supervisor(dataDir, () => undefined);
  const started = Promise.withResolvers<void>();
  try {
    await supervisor.init();
    const job = await supervisor.run({
      title: 'Processamento', executable: process.execPath, args: ['-e', ''],
      onSuccess: async signal => {
        started.resolve();
        const child = await capture(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal, timeoutMs: 10000 });
        if (child.code !== 0) throw new Error('Processamento cancelado');
      },
    });
    await started.promise;
    await supervisor.cancel(job.id);
    assert.equal((await supervisor.wait(job.id)).status, 'cancelled');
  } finally {
    await supervisor.dispose();
    await rm(dataDir, { recursive: true, force: true });
  }
});
