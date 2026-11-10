import { createReadStream } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { crc32 } from 'node:zlib';

export type ZipSource = { name: string; data: Buffer } | { name: string; path: string };

const ZIP_LIMIT = 0xffffffff;
const MAX_ENTRIES = 65535;
const FLAG_UTF8 = 0x0800;
const METHOD_STORED = 0;
const VERSION = 20;
const VERSION_NEEDED = 10;
const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
// Timestamps: fixed DOS date 1980-01-01 00:00 so identical inputs yield identical archives.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

type Measured = { name: Buffer; source: ZipSource; size: number; crc: number; offset: number };
type Layout = { entries: Measured[]; cdOffset: number; cdSize: number; total: number };

function encodeName(name: string): Buffer {
  if (name.length === 0) throw new Error('Nome de arquivo do ZIP não pode ser vazio.');
  if (name.includes('\0')) throw new Error(`Nome de arquivo do ZIP inválido (caractere nulo): ${JSON.stringify(name)}`);
  if (name.includes('\\')) throw new Error(`Nome de arquivo do ZIP inválido (use "/" como separador): ${name}`);
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw new Error(`Nome de arquivo do ZIP não pode ser caminho absoluto: ${name}`);
  for (const segment of name.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') throw new Error(`Nome de arquivo do ZIP inválido: ${name}`);
  }
  const bytes = Buffer.from(name, 'utf8');
  if (bytes.length > 0xffff) throw new Error(`Nome de arquivo do ZIP longo demais: ${name}`);
  return bytes;
}

function checkLimit(value: number, what: string): void {
  if (value >= ZIP_LIMIT) throw new Error(`${what} excede o limite do formato ZIP sem Zip64 (4 GB).`);
}

async function writeAll(handle: FileHandle, buffer: Buffer): Promise<void> {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset);
    offset += bytesWritten;
  }
}

async function scanPath(path: string, onChunk: (chunk: Buffer) => void | Promise<void>): Promise<number> {
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    await onChunk(buffer);
  }
  return size;
}

// Pass 1: size and CRC of every entry, plus the offsets needed by the headers.
async function measure(sources: ZipSource[], names: Buffer[]): Promise<Layout> {
  const entries: Measured[] = [];
  let cursor = 0;
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const name = names[i];
    let size: number;
    let crc: number;
    if ('data' in source) {
      size = source.data.length;
      crc = crc32(source.data);
    } else {
      crc = 0;
      size = await scanPath(source.path, (chunk) => {
        crc = crc32(chunk, crc);
      });
    }
    checkLimit(size, `Entrada "${source.name}"`);
    checkLimit(cursor, 'O arquivo ZIP');
    entries.push({ name, source, size, crc, offset: cursor });
    cursor += 30 + name.length + size;
  }
  const cdOffset = cursor;
  checkLimit(cdOffset, 'O arquivo ZIP');
  let cdSize = 0;
  for (const entry of entries) cdSize += 46 + entry.name.length;
  const total = cdOffset + cdSize + 22;
  checkLimit(total, 'O arquivo ZIP');
  return { entries, cdOffset, cdSize, total };
}

function localHeader(entry: Measured): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(SIG_LOCAL, 0);
  header.writeUInt16LE(VERSION_NEEDED, 4);
  header.writeUInt16LE(FLAG_UTF8, 6);
  header.writeUInt16LE(METHOD_STORED, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.size, 18);
  header.writeUInt32LE(entry.size, 22);
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, entry.name]);
}

function centralHeader(entry: Measured): Buffer {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(SIG_CENTRAL, 0);
  header.writeUInt16LE(VERSION, 4);
  header.writeUInt16LE(VERSION_NEEDED, 6);
  header.writeUInt16LE(FLAG_UTF8, 8);
  header.writeUInt16LE(METHOD_STORED, 10);
  header.writeUInt16LE(DOS_TIME, 12);
  header.writeUInt16LE(DOS_DATE, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.size, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.offset, 42);
  return Buffer.concat([header, entry.name]);
}

function endRecord(count: number, cdSize: number, cdOffset: number): Buffer {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(SIG_EOCD, 0);
  record.writeUInt16LE(0, 4);
  record.writeUInt16LE(0, 6);
  record.writeUInt16LE(count, 8);
  record.writeUInt16LE(count, 10);
  record.writeUInt32LE(cdSize, 12);
  record.writeUInt32LE(cdOffset, 16);
  record.writeUInt16LE(0, 20);
  return record;
}

// Pass 2: write local headers and data, then central directory and end record.
async function writeEntries(handle: FileHandle, layout: Layout): Promise<void> {
  for (const entry of layout.entries) {
    await writeAll(handle, localHeader(entry));
    const { source } = entry;
    if ('data' in source) {
      await writeAll(handle, source.data);
      continue;
    }
    let size = 0;
    let crc = 0;
    await scanPath(source.path, async (chunk) => {
      size += chunk.length;
      crc = crc32(chunk, crc);
      await writeAll(handle, chunk);
    });
    if (size !== entry.size || crc !== entry.crc) throw new Error('Arquivo mudou durante a exportação.');
  }
  for (const entry of layout.entries) await writeAll(handle, centralHeader(entry));
  await writeAll(handle, endRecord(layout.entries.length, layout.cdSize, layout.cdOffset));
}

export async function writeZipFile(destination: string, sources: ZipSource[]): Promise<{ bytes: number }> {
  if (sources.length > MAX_ENTRIES) throw new Error(`O ZIP não pode ter mais de ${MAX_ENTRIES} arquivos.`);
  const names = sources.map((source) => encodeName(source.name));
  const seen = new Set<string>();
  for (const source of sources) {
    if (seen.has(source.name)) throw new Error(`Nome de arquivo duplicado no ZIP: ${source.name}`);
    seen.add(source.name);
  }
  // 'wx' fails on an existing destination before anything is removed, so only files created here are cleaned up.
  const handle = await open(destination, 'wx');
  try {
    const layout = await measure(sources, names);
    await writeEntries(handle, layout);
    await handle.close();
    return { bytes: layout.total };
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(destination).catch(() => undefined);
    throw error;
  }
}
