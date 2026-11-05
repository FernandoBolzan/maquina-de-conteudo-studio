import { constants, createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, open, readdir, realpath, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Services } from '../context.js';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function safeId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('Identificador inválido.');
  return value;
}
export function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}
export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: objeto JSON inválido; original preservado.`);
  return value as Record<string, unknown>;
}
export function missing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
/** Reject symlinks in every existing component, not only the leaf. */
export async function safePath(path: string): Promise<string> {
  const absolute = resolve(path);
  const parent = dirname(absolute);
  if (parent !== absolute) await safePath(parent);
  try {
    if ((await lstat(absolute)).isSymbolicLink()) throw new Error(`Links simbólicos não são permitidos: ${absolute}`);
  } catch (error) { if (!missing(error)) throw error; }
  return absolute;
}
export async function localPath(root: string, path: string): Promise<string> {
  const absolute = resolve(root, path);
  if (!inside(root, absolute)) throw new Error('Caminho fora da pasta autorizada.');
  await safePath(absolute);
  return absolute;
}
export async function workspace(services: Services): Promise<string> {
  const configured = services.getSettings().workspace;
  if (!configured || !isAbsolute(configured)) throw new Error('Escolha um workspace absoluto na configuração.');
  const root = await safePath(configured);
  for (const clone of [process.cwd(), ...Object.values(services.getSettings().enginePaths)]) {
    if (!clone) continue;
    const canonical = await realpath(clone).catch(() => resolve(clone));
    if (inside(canonical, root)) throw new Error('O workspace deve ficar fora dos clones do aplicativo e motores.');
  }
  await mkdir(root, { recursive: true });
  return realpath(root);
}
export async function directory(root: string, path: string): Promise<string> {
  const target = await localPath(root, path);
  await mkdir(target, { recursive: true });
  return target;
}
export async function readJson(path: string): Promise<unknown> {
  await safePath(path);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await file.stat()).isFile()) throw new Error(`Não é um arquivo: ${path}`);
    const value = await file.readFile('utf8');
    try { return JSON.parse(value) as unknown; }
    catch { throw new Error(`JSON corrompido: ${path}. O original foi preservado; corrija-o ou restaure um backup.`); }
  } finally { await file.close(); }
}
export async function atomicText(path: string, content: string): Promise<void> {
  await safePath(path);
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.write-${randomUUID()}`);
  const file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile(content, 'utf8');
    await file.sync();
  } finally { await file.close(); }
  try { await safePath(path); await rename(temporary, path); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
  // Directory fsync is unavailable on some Windows filesystems.
  if (process.platform !== 'win32') {
    const parent = await open(dirname(path), 'r');
    try { await parent.sync(); } finally { await parent.close(); }
  }
}
export async function atomicJson(path: string, value: unknown): Promise<void> {
  await atomicText(path, `${JSON.stringify(value, null, 2)}\n`);
}
export async function copyLocal(source: string, target: string): Promise<void> {
  await safePath(source);
  await safePath(target);
  if (!(await lstat(source)).isFile()) throw new Error('A origem deve ser um arquivo regular.');
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target, constants.COPYFILE_EXCL);
}
export async function fingerprint(path: string): Promise<{ sha256: string; stamp: string; size: number }> {
  await safePath(path);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile()) throw new Error(`Arquivo não regular: ${path}`);
    const hash = createHash('sha256');
    const stream = createReadStream(path, { fd: file.fd, autoClose: false });
    for await (const chunk of stream) hash.update(chunk as Buffer);
    const after = await file.stat({ bigint: true });
    if (before.mtimeNs !== after.mtimeNs || before.size !== after.size || before.ctimeNs !== after.ctimeNs) throw new Error('Arquivo mudou durante a leitura; tente novamente após a edição.');
    const sha256 = hash.digest('hex');
    return { sha256, stamp: `${sha256}:${after.size}:${after.mtimeNs}:${after.ctimeNs}:${after.ino}`, size: Number(after.size) };
  } finally { await file.close(); }
}
const ignored: Record<string, true> = { node_modules: true, __pycache__: true };
export async function walk(root: string, base = root): Promise<string[]> {
  await localPath(root, base);
  const result: string[] = [];
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ignored[entry.name]) continue;
    const path = await localPath(root, join(base, entry.name));
    if (entry.isSymbolicLink()) throw new Error(`Link simbólico recusado: ${path}`);
    if (entry.isDirectory()) result.push(...await walk(root, path));
    else if (entry.isFile()) result.push(path);
    else throw new Error(`Arquivo especial recusado: ${path}`);
  }
  return result.sort();
}
const locks = new Map<string, Promise<void>>();
export async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const pending = previous.then(operation);
  const current = pending.then(() => undefined, () => undefined);
  locks.set(key, current);
  try { return await pending; }
  finally { if (locks.get(key) === current) locks.delete(key); }
}
export function requireIdle(services: Services, id: string): void {
  if (services.jobs().some((job) => job.projectId === id && job.status === 'running')) throw new Error('Já existe um processo ativo neste projeto. Aguarde ou cancele-o.');
}
