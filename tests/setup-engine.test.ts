import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AppEvent, Settings } from '../src/shared/contracts.js';
import type { Services } from '../src/main/context.js';
import { handleSetup } from '../src/main/setup.js';

function services(): Services {
  const settings: Settings = { workspace: '/tmp/studio-test', provider: 'codex', enginePaths: {}, onboardingCompleted: true };
  return {
    dataDir: '/tmp/studio-test-data', getSettings: () => settings, saveSettings: async update => Object.assign(settings, update),
    getElevenLabsKey: () => undefined,
    run: async () => { throw new Error('Unexpected process execution'); }, capture: async () => { throw new Error('Unexpected process capture'); },
    waitJob: async () => { throw new Error('Unexpected job wait'); }, jobs: () => [], emit: (_event: AppEvent) => undefined,
    pickFile: async () => undefined, openPath: async () => undefined, openExternal: async () => undefined, assetUrl: path => path,
  };
}

test('engine local test requires explicit consent and a linked engine', async () => {
  const runtime = services();
  await assert.rejects(handleSetup('setup.engineTest', { engine: 'videogo' }, runtime), /confirmação explícita/);
  await assert.rejects(handleSetup('setup.engineTest', { engine: 'videogo', confirm: true }, runtime), /Instale ou vincule/);
});
