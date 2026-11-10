import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { crc32 } from 'node:zlib';
import { writeZipFile, type ZipSource } from '../src/main/zip.js';

type ReadEntry = { name: string; flags: number; method: number; crc: number; data: Buffer };

// Independent minimal reader: EOCD → central directory → local headers.
function readZip(buffer: Buffer): ReadEntry[] {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  assert.notEqual(eocd, -1, 'EOCD ausente');
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries: ReadEntry[] = [];
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50, 'assinatura do diretório central');
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const size = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    cursor += 46 + nameLength + extraLength + commentLength;

    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50, 'assinatura do cabeçalho local');
    const localName = buffer.readUInt16LE(localOffset + 26);
    const localExtra = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localName + localExtra;
    entries.push({ name, flags, method, crc, data: buffer.subarray(dataStart, dataStart + size) });
  }
  return entries;
}

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'zip-test-'));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('CRC-32 matches the standard check vector', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('Written archive round-trips names, bytes, CRCs and UTF-8 flag', async () => {
  await withTempDir(async (dir) => {
    const pathBytes = Buffer.from(Array.from({ length: 1024 }, (_, i) => i % 256));
    const pathFile = join(dir, 'source.bin');
    await writeFile(pathFile, pathBytes);
    const destination = join(dir, 'out.zip');
    const sources: ZipSource[] = [
      { name: 'notes.txt', data: Buffer.from('olá zip') },
      { name: 'bytes.bin', path: pathFile },
      { name: 'artifacts/Pão-01.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      { name: 'empty.txt', data: Buffer.alloc(0) },
    ];

    const result = await writeZipFile(destination, sources);
    const archive = await readFile(destination);
    assert.equal(result.bytes, archive.length);

    const entries = readZip(archive);
    assert.deepEqual(
      entries.map((entry) => entry.name),
      ['notes.txt', 'bytes.bin', 'artifacts/Pão-01.png', 'empty.txt'],
    );
    for (const entry of entries) {
      assert.equal(entry.flags & 0x0800, 0x0800, `bit 11 em ${entry.name}`);
      assert.equal(entry.method, 0, `método em ${entry.name}`);
      assert.equal(crc32(entry.data), entry.crc, `CRC em ${entry.name}`);
    }
    assert.equal(entries[0].data.toString('utf8'), 'olá zip');
    assert.deepEqual(entries[1].data, pathBytes);
    assert.deepEqual(entries[2].data, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    assert.equal(entries[3].data.length, 0);
  });
});

test('Rejects unsafe or duplicate entry names', async () => {
  await withTempDir(async (dir) => {
    const bad = ['../x', '/abs', 'a\\b', 'a/../b', './a', 'a//b', 'a\0b', ''];
    for (const name of bad) {
      const destination = join(dir, `bad-${bad.indexOf(name)}.zip`);
      await assert.rejects(writeZipFile(destination, [{ name, data: Buffer.from('x') }]), Error, JSON.stringify(name));
      assert.equal(existsSync(destination), false, `nenhum arquivo para ${JSON.stringify(name)}`);
    }
    const duplicate = join(dir, 'dup.zip');
    await assert.rejects(
      writeZipFile(duplicate, [
        { name: 'a.txt', data: Buffer.from('1') },
        { name: 'a.txt', data: Buffer.from('2') },
      ]),
      Error,
    );
    assert.equal(existsSync(duplicate), false);
  });
});

test('Refuses to overwrite an existing destination and leaves it untouched', async () => {
  await withTempDir(async (dir) => {
    const destination = join(dir, 'exists.zip');
    await writeFile(destination, 'original');
    await assert.rejects(writeZipFile(destination, [{ name: 'a.txt', data: Buffer.from('x') }]), Error);
    assert.equal(await readFile(destination, 'utf8'), 'original');
  });
});

test('Missing path source fails and leaves no destination file', async () => {
  await withTempDir(async (dir) => {
    const destination = join(dir, 'partial.zip');
    await assert.rejects(
      writeZipFile(destination, [
        { name: 'ok.txt', data: Buffer.from('ok') },
        { name: 'missing.bin', path: join(dir, 'does-not-exist.bin') },
      ]),
      Error,
    );
    assert.equal(existsSync(destination), false);
  });
});
