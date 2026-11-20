import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeArchiveName, nodeArchiveSha256, selectNodeVersion } from '../src/main/setup/managed-node.js';

test('Node tarball name is pinned to supported stable v22 and Linux architectures', () => {
  assert.equal(nodeArchiveName('v22.18.0', 'x64'), 'node-v22.18.0-linux-x64.tar.xz');
  assert.equal(nodeArchiveName('v22.18.0', 'arm64'), 'node-v22.18.0-linux-arm64.tar.xz');
  assert.throws(() => nodeArchiveName('v23.0.0', 'x64'), /inválida/);
  assert.throws(() => nodeArchiveName('v22.18.0', 'ia32'), /arquitetura/);
});

test('Node selector picks the newest stable matching major and minimum minor', () => {
  const releases = [
    { version: 'v24.0.0', lts: false },
    { version: 'v22.23.5', lts: 'Jod' },
    { version: 'v22.23.6-rc.1', lts: 'Jod' },
    { version: 'v22.0.0', lts: 'Jod' },
  ];
  assert.equal(selectNodeVersion(releases, 22, 0), 'v22.23.5');
  assert.equal(selectNodeVersion(releases, 22, 23), 'v22.23.5');
  assert.equal(selectNodeVersion(releases, 22, 24), undefined);
});

test('Node checksum parser selects the exact archive and rejects missing or malformed entries', () => {
  const sha = 'a'.repeat(64);
  assert.equal(nodeArchiveSha256(`${sha}  node-v22.18.0-linux-x64.tar.xz\n${'b'.repeat(64)}  other.tar.xz\n`, 'node-v22.18.0-linux-x64.tar.xz'), sha);
  assert.equal(nodeArchiveSha256(`${sha} *node-v22.18.0-linux-x64.tar.xz\n`, 'node-v22.18.0-linux-x64.tar.xz'), sha);
  assert.throws(() => nodeArchiveSha256(`${sha}  other.tar.xz`, 'node-v22.18.0-linux-x64.tar.xz'), /não contém/);
});
