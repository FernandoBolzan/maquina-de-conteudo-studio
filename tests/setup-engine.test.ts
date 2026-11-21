import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppEvent, Settings } from '../src/shared/contracts.js';
import type { Services } from '../src/main/context.js';
import { checkEngineUpdates, classifyEngineUpdate } from '../src/main/setup/engines.js';
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

test('engine update state follows the stable release version, not the commit', () => {
  assert.equal(classifyEngineUpdate('postnow').state, 'missing');
  assert.equal(classifyEngineUpdate('postnow', '0.2.0', '0.3.0').state, 'update-available');
  assert.equal(classifyEngineUpdate('videogo', '0.12.0', '0.12.0').state, 'current');
  assert.equal(classifyEngineUpdate('videogo', '0.13.0-dev', '0.12.0').state, 'current');
  assert.equal(classifyEngineUpdate('postnow', 'desconhecida', '0.3.0').state, 'unverified');
  assert.equal(classifyEngineUpdate('postnow', '0.2.0', undefined, 'offline').state, 'unavailable');
});

test('engine update check reports a release that the default branch never received', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-engine-updates-'));
  const realFetch = globalThis.fetch;
  try {
    const postnow = join(root, 'postnow-engine');
    await mkdir(join(postnow, 'postnow'), { recursive: true });
    await writeFile(join(postnow, 'pyproject.toml'), 'name = "postnow"\nversion = "0.2.0"\npostnow = "postnow.cli:main"\n');
    await writeFile(join(postnow, 'postnow', '__main__.py'), '');
    await writeFile(join(postnow, 'postnow', 'cli.py'), '');
    const runtime = services();
    runtime.getSettings().enginePaths = { postnow };
    const requested: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      const body = url.endsWith('/releases/latest') ? { tag_name: 'v0.3.0' } : { sha: 'f'.repeat(40) };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    const updates = await checkEngineUpdates(runtime);
    const postnowUpdate = updates.find(item => item.id === 'postnow');
    assert.equal(postnowUpdate?.state, 'update-available');
    assert.equal(postnowUpdate?.currentVersion, '0.2.0');
    assert.equal(postnowUpdate?.latestVersion, '0.3.0');
    assert.deepEqual(updates.filter(item => item.id !== 'postnow').map(item => item.state), ['missing', 'missing']);
    assert.ok(requested.every(url => url.includes('/repos/IAPro-Community/PostNow/')), 'engines that are not installed must not hit the network');
  } finally {
    globalThis.fetch = realFetch;
    await rm(root, { recursive: true, force: true });
  }
});
