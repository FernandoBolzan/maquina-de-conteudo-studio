import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Runtime } from '../src/main/runtime.js';
import type { Brand } from '../src/shared/contracts.js';

const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2sAAAAASUVORK5CYII=', 'base64');

test('a brand keeps an optional PNG logo for dark backgrounds until the owner removes it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-logo-dark-'));
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/',
    secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    decryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    update: async () => ({ available: false, message: 'indisponível' }),
  }, () => undefined);
  try {
    await runtime.init();
    await runtime.invoke('app.settings', { workspace: join(root, 'workspace') });
    const logo = join(root, 'logo.png');
    const dark = join(root, 'logo-branca.png');
    const jpeg = join(root, 'logo.jpg');
    await writeFile(logo, ONE_PIXEL_PNG);
    await writeFile(dark, ONE_PIXEL_PNG);
    await writeFile(jpeg, ONE_PIXEL_PNG);
    const base = { name: 'Marca de teste', tone: 'Claro.', colors: ['#123456'] };

    const created = await runtime.invoke('brands.save', { ...base, logo, logoDark: dark }) as Brand;
    assert.ok(created.logoDark && created.logoDark !== dark, 'a logo escura é copiada para o cofre da marca');
    assert.ok(created.logoDarkUrl);

    const kept = await runtime.invoke('brands.save', { ...base, id: created.id, logo: created.logo }) as Brand;
    assert.equal(kept.logoDark, created.logoDark, 'salvar sem tocar na logo escura a mantém');

    await assert.rejects(runtime.invoke('brands.save', { ...base, id: created.id, logo: created.logo, logoDark: jpeg }), /deve ser PNG/);

    const removed = await runtime.invoke('brands.save', { ...base, id: created.id, logo: created.logo, logoDark: '' }) as Brand;
    assert.equal(removed.logoDark, undefined);
    const listed = (await runtime.invoke('brands.list')) as Brand[];
    assert.equal(listed.find(item => item.id === created.id)?.logoDark, undefined);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
