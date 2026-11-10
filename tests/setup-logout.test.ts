import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AppEvent, Job, Settings } from '../src/shared/contracts.js';
import type { Services } from '../src/main/context.js';
import { handleSetup } from '../src/main/setup.js';

function makeMockServices(dataDir: string, overrides: Partial<Services> = {}): { services: Services; events: AppEvent[]; captures: Array<{ executable: string; args: string[]; input?: string }> } {
  const events: AppEvent[] = [];
  const captures: Array<{ executable: string; args: string[]; input?: string }> = [];
  const settings: Settings = { workspace: '/tmp/test-ws', provider: 'codex', enginePaths: {}, onboardingCompleted: true };
  const base: Services = {
    dataDir,
    getSettings: () => settings,
    saveSettings: async update => Object.assign(settings, update),
    getElevenLabsKey: () => undefined,
    run: async () => { throw new Error('not implemented'); },
    capture: async (executable, args, options) => {
      captures.push({ executable, args, input: options?.input });
      return { code: 0, stdout: 'logged out', stderr: '' };
    },
    waitJob: async () => { throw new Error('not implemented'); },
    jobs: () => [],
    emit: (event: AppEvent) => { events.push(event); },
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    assetUrl: path => path,
    forgetProjectJobs: async () => undefined,
    revokeMedia: () => undefined,
    ...overrides,
  };
  return { services: base, events, captures };
}

test('setup.logout requires explicit confirm: true', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setup-logout-'));
  try {
    const { services } = makeMockServices(root);
    await assert.rejects(
      handleSetup('setup.logout', { provider: 'github' }, services),
      /confirmação explícita/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('setup.logout rejects unknown provider', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setup-logout-'));
  try {
    const { services } = makeMockServices(root);
    await assert.rejects(
      handleSetup('setup.logout', { provider: 'unknown', confirm: true }, services),
      /Provedor de logout desconhecido/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('setup.logout blocks when project jobs are running', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setup-logout-'));
  try {
    const runningJob: Job = {
      id: 'job-1',
      title: 'Tarefa ativa',
      status: 'running',
      createdAt: new Date().toISOString(),
      projectId: 'proj-1',
      log: '',
      interactive: false,
    };
    const { services } = makeMockServices(root, { jobs: () => [runningJob] });
    await assert.rejects(
      handleSetup('setup.logout', { provider: 'codex', confirm: true }, services),
      /Aguarde ou cancele os jobs de projeto/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('setup.logout executes appropriate CLI command and emits refresh', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setup-logout-'));
  try {
    const { services, events, captures } = makeMockServices(root);

    // Test github logout
    const ghRes = await handleSetup('setup.logout', { provider: 'github', confirm: true }, services) as { success: boolean };
    assert.equal(ghRes.success, true);
    assert.ok(captures.some(c => c.args.includes('auth') && c.args.includes('logout') && c.args.includes('--hostname') && c.input === 'Y\n'));

    // Test claude logout
    captures.length = 0;
    const claudeRes = await handleSetup('setup.logout', { provider: 'claude', confirm: true }, services) as { success: boolean };
    assert.equal(claudeRes.success, true);
    assert.ok(captures.some(c => c.args.includes('auth') && c.args.includes('logout') && c.input === 'Y\n'));

    // Test codex logout
    captures.length = 0;
    const codexRes = await handleSetup('setup.logout', { provider: 'codex', confirm: true }, services) as { success: boolean };
    assert.equal(codexRes.success, true);
    assert.ok(captures.some(c => c.args.includes('logout')));

    assert.ok(events.filter(e => e.type === 'refresh').length >= 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
