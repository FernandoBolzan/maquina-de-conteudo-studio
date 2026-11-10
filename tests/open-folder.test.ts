import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openFolder } from '../src/main/open-folder.js';

test('Linux opener resolves before the opener process exits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-open-folder-'));
  const release = join(root, 'release');
  const script = join(root, 'opener.sh');
  await writeFile(script, `#!/bin/sh\ni=0\nwhile [ ! -e '${release}' ] && [ $i -lt 200 ]; do sleep 0.025; i=$((i+1)); done\n`);
  await chmod(script, 0o755);

  await openFolder(root, { platform: 'linux', command: script });
  assert.equal(existsSync(release), false, 'the opener must still be running when openFolder resolves');

  await writeFile(release, '');
});

test('Linux opener rejects with a pt-BR message when the command does not exist', async () => {
  await assert.rejects(
    () => openFolder(tmpdir(), { platform: 'linux', command: 'mdc-opener-inexistente-0001' }),
    { message: /^Não foi possível abrir a pasta: / },
  );
});

test('Non-Linux platforms use the injected openPath and reject with its non-empty result', async () => {
  const opened: string[] = [];
  await openFolder('/pasta', { platform: 'darwin', openPath: async path => { opened.push(path); return ''; } });
  assert.deepEqual(opened, ['/pasta']);
  await assert.rejects(
    () => openFolder('/pasta', { platform: 'win32', openPath: async () => 'Acesso negado' }),
    { message: 'Acesso negado' },
  );
});
