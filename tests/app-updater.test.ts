import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { AppUpdater } from 'electron-updater';
import { createAppUpdater } from '../src/main/app-updater.js';
import type { AppUpdateStatus } from '../src/shared/contracts.js';

function fakeUpdater() {
  const emitter = new EventEmitter();
  const calls = { quitAndInstall: 0, feed: [] as unknown[] };
  const updater = Object.assign(emitter, {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    setFeedURL: (feed: unknown) => { calls.feed.push(feed); },
    quitAndInstall: () => { calls.quitAndInstall += 1; },
    checkForUpdates: async () => undefined,
  });
  return { updater: updater as unknown as AppUpdater, emitter, calls, raw: updater };
}

function setup(prepareInstall = async () => undefined) {
  const fake = fakeUpdater();
  const published: AppUpdateStatus[] = [];
  const service = createAppUpdater({ updater: fake.updater, publish: status => published.push(status), prepareInstall });
  return { ...fake, service, published };
}

test('updates download automatically from the GitHub release feed and install on quit', () => {
  const { raw, calls } = setup();
  assert.equal(raw.autoDownload, true);
  assert.equal(raw.autoInstallOnAppQuit, true);
  assert.deepEqual(calls.feed, [{ provider: 'github', owner: 'FernandoBolzan', repo: 'maquina-de-conteudo-studio' }]);
});

test('a downloaded update is published with its version and ready to install', () => {
  const { emitter, service, published } = setup();
  emitter.emit('update-available', { version: '0.2.0' });
  emitter.emit('update-downloaded', { version: '0.2.0' });
  assert.equal(service.status().state, 'downloaded');
  assert.equal(service.status().version, '0.2.0');
  assert.deepEqual(published.map(status => status.state), ['downloading', 'downloaded']);
});

test('installing is refused until an update is downloaded', async () => {
  const { service, calls } = setup();
  await assert.rejects(service.installDownloaded(), /Nenhuma atualização pronta/);
  assert.equal(calls.quitAndInstall, 0);
});

test('a failed prepareInstall prevents the restart', async () => {
  const { emitter, service, calls } = setup(async () => { throw new Error('Finalize as tarefas antes de reiniciar para atualizar.'); });
  emitter.emit('update-downloaded', { version: '0.2.0' });
  await assert.rejects(service.installDownloaded(), /Finalize as tarefas/);
  assert.equal(calls.quitAndInstall, 0);
});

test('an install that is allowed prepares the app and then restarts into the update', async () => {
  const order: string[] = [];
  const { emitter, service, calls } = setup(async () => { order.push('prepare'); });
  emitter.emit('update-downloaded', { version: '0.2.0' });
  const status = await service.installDownloaded();
  assert.equal(status.state, 'downloaded');
  assert.deepEqual(order, ['prepare']);
  assert.equal(calls.quitAndInstall, 1);
});

test('a later check error does not hide an update that is already downloaded', () => {
  const { emitter, service } = setup();
  emitter.emit('update-downloaded', { version: '0.2.0' });
  emitter.emit('error', new Error('rede indisponível'));
  assert.equal(service.status().state, 'downloaded');
  assert.equal(service.status().version, '0.2.0');
});

test('an error before any download is shown to the user', () => {
  const { emitter, service } = setup();
  emitter.emit('error', new Error('rede indisponível'));
  assert.equal(service.status().state, 'error');
  assert.match(service.status().message, /rede indisponível/);
});
