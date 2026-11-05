import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Job, Settings } from '../src/shared/contracts.js';
import type { Services } from '../src/main/context.js';
import { checkCliUpdates, classifyCliUpdate, compareVersions, manageCliTool } from '../src/main/setup/tools.js';

function makeServices(root: string, latest: { codex: string; claude: string }): Services {
  const jobs = new Map<string, Job>();
  let nextJob = 0;
  const settings: Settings = { workspace: root, provider: 'codex', enginePaths: {}, onboardingCompleted: true };
  return {
    dataDir: join(root, 'data'),
    getSettings: () => settings,
    saveSettings: async update => Object.assign(settings, update),
    run: async spec => {
      const id = `job-${++nextJob}`;
      const prefix = spec.cwd!;
      const packageSpec = spec.args.at(-1)!;
      const version = packageSpec.slice(packageSpec.lastIndexOf('@') + 1);
      const tool = packageSpec.startsWith('@anthropic-ai/') ? 'claude' : 'codex';
      const binary = join(prefix, 'node_modules', '.bin', tool);
      await mkdir(dirname(binary), { recursive: true });
      await writeFile(binary, 'test executable');
      await chmod(binary, 0o700);
      await writeFile(join(prefix, '.test-version'), version);
      const job: Job = { id, title: spec.title, status: 'running', createdAt: new Date().toISOString(), log: '', interactive: false };
      jobs.set(id, job);
      return job;
    },
    capture: async (executable, args) => {
      if (args[0] === 'view') {
        const version = args[1]?.startsWith('@anthropic-ai/') ? latest.claude : latest.codex;
        return { code: 0, stdout: JSON.stringify(version), stderr: '' };
      }
      if (args[0] === '--version') {
        const prefix = dirname(dirname(dirname(resolve(executable))));
        try { return { code: 0, stdout: `codex ${await readFile(join(prefix, '.test-version'), 'utf8')}`, stderr: '' }; }
        catch { return { code: 0, stdout: 'codex 0.9.0', stderr: '' }; }
      }
      return { code: 1, stdout: '', stderr: 'not authenticated' };
    },
    waitJob: async id => {
      const job = jobs.get(id);
      assert.ok(job);
      const completed = { ...job, status: 'succeeded' as const, exitCode: 0, endedAt: new Date().toISOString() };
      jobs.set(id, completed);
      return completed;
    },
    jobs: () => [...jobs.values()],
    emit: () => undefined,
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    assetUrl: path => path,
  };
}

async function makeFakeNodeTools(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  for (const name of ['node', 'npm']) {
    const path = join(directory, name);
    await writeFile(path, 'test executable');
    await chmod(path, 0o700);
  }
}

test('CLI versions compare numeric components and prerelease boundaries', () => {
  assert.equal(compareVersions('1.10.0', '1.9.99'), 1);
  assert.equal(compareVersions('2.0.0', '2.0.0-rc.10'), 1);
  assert.equal(compareVersions('1.0.0-rc.2', '1.0.0-rc.10'), -1);
  assert.equal(compareVersions('not-a-version', '1.0.0'), undefined);
  assert.equal(classifyCliUpdate('codex', false, undefined, '1.2.0').state, 'missing');
  assert.equal(classifyCliUpdate('codex', true, '1.2.0', '1.2.0', 'managed').state, 'current');
  assert.equal(classifyCliUpdate('codex', true, '1.1.0', '1.2.0', 'managed').state, 'update-available');
  assert.equal(classifyCliUpdate('codex', true, '1.1.0', '1.2.0', 'external').state, 'external-update-available');
  assert.equal(classifyCliUpdate('codex', true, '1.2.0', undefined, 'managed', false, 'offline').state, 'unavailable');
});

test('managed CLI install, update, and rollback preserve validated versions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-cli-'));
  const fakeBin = join(root, 'bin');
  await makeFakeNodeTools(fakeBin);
  const originalPath = process.env.PATH;
  const originalHome = process.env.HOME;
  process.env.PATH = fakeBin;
  process.env.HOME = join(root, 'home');
  const latest = { codex: '1.2.0', claude: '2.0.0' };
  const services = makeServices(root, latest);
  try {
    const installed = await manageCliTool('codex', 'install', services);
    assert.equal(installed.version, '1.2.0');
    assert.equal(installed.job?.status, 'succeeded');
    assert.equal((await checkCliUpdates(services)).find(item => item.id === 'codex')?.state, 'current');

    latest.codex = '1.3.0';
    const available = (await checkCliUpdates(services)).find(item => item.id === 'codex');
    assert.equal(available?.state, 'update-available');
    assert.equal(available?.currentVersion, '1.2.0');

    const runPackage = services.run;
    services.run = async spec => {
      const job = await runPackage(spec);
      await writeFile(join(spec.cwd!, '.test-version'), '9.9.9');
      return job;
    };
    await assert.rejects(() => manageCliTool('codex', 'update', services), /não passou no teste de versão/);
    services.run = runPackage;
    const preserved = (await checkCliUpdates(services)).find(item => item.id === 'codex');
    assert.equal(preserved?.currentVersion, '1.2.0');
    assert.equal(preserved?.canRollback, false);

    const updated = await manageCliTool('codex', 'update', services);
    assert.equal(updated.version, '1.3.0');
    const current = (await checkCliUpdates(services)).find(item => item.id === 'codex');
    assert.equal(current?.state, 'current');
    assert.equal(current?.canRollback, true);

    const rolledBack = await manageCliTool('codex', 'rollback', services);
    assert.equal(rolledBack.version, '1.2.0');
    const restored = (await checkCliUpdates(services)).find(item => item.id === 'codex');
    assert.equal(restored?.state, 'update-available');
    assert.equal(restored?.canRollback, true);
  } finally {
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    if (originalHome === undefined) delete process.env.HOME; else process.env.HOME = originalHome;
    await rm(root, { recursive: true, force: true });
  }
});
