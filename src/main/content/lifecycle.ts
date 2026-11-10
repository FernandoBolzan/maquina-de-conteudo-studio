import { randomUUID } from 'node:crypto';
import { lstat, readdir, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { atomicJson, inside, missing, object, privateWorkspaceDirectory, readJson, safeId, safePath, UUID } from './storage.js';

/** Only paths whose ownership can be established are included as deletion targets. */
export interface DeletionInventory {
  projectId: string;
  title: string;
  folder: string;
  registry: string;
  sessions: string[];
  nativeCopies: string[];
  preservedNativeCopies: number;
}
export interface DeletionPreview {
  projectId: string;
  title: string;
  folder: string;
  files: number;
  bytes: number;
  sessions: number;
  nativeCopies: number;
  preservedNativeCopies: number;
}
interface DeletionTargets { sessions: string[]; nativeCopies: string[]; }
export interface RecoveredDeletion { projectId: string; folder: string; }

const BATCH_SUFFIX = /-(\d{13}-[a-f0-9]{8})$/;
const FOLDER_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const nativeHome = (dataDir: string): string => join(dataDir, 'engine-data', 'postnow');
const DELETION_JOURNAL_DIRECTORY = 'deleting';

/** Reject links anywhere in a tree rather than removing a link or traversing it. */
async function inspectTree(path: string, protectExports = false): Promise<{ files: number; bytes: number }> {
  await safePath(path);
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error(`Link simbólico preservado: ${path}`);
  if (!info.isDirectory()) {
    if (!info.isFile()) throw new Error(`Arquivo especial preservado: ${path}`);
    return { files: 1, bytes: info.size };
  }
  if (protectExports && basename(path).startsWith('export-') && (await readdir(path)).includes('MANIFEST.json')) throw new Error(`Exportação independente preservada: ${path}. Mova-a para fora da pasta antes de excluir o projeto.`);
  let files = 0;
  let bytes = 0;
  for (const entry of await readdir(path)) {
    const child = await inspectTree(join(path, entry), protectExports);
    files += child.files;
    bytes += child.bytes;
  }
  return { files, bytes };
}

export async function measureTree(path: string): Promise<{ files: number; bytes: number }> {
  return inspectTree(path, true);
}

async function directoryNames(path: string): Promise<string[]> {
  await safePath(path);
  try { return await readdir(path); } catch (error) { if (missing(error)) return []; throw error; }
}

async function batchIds(folder: string): Promise<Set<string>> {
  const result = new Set<string>();
  for (const name of await directoryNames(join(folder, 'generated', 'runs'))) {
    if (/^\d{13}-[a-f0-9]{8}$/.test(name)) result.add(name);
  }
  return result;
}

interface NativeInventory { owned: string[]; preserved: number; }
async function nativeInventory(dataDir: string, batches: ReadonlySet<string>, projectId?: string): Promise<NativeInventory> {
  const owned: string[] = [];
  let preserved = 0;
  const clients = join(nativeHome(dataDir), 'clients');
  for (const client of await directoryNames(clients)) {
    const clientPath = join(clients, client);
    const clientInfo = await lstat(clientPath);
    if (!clientInfo.isDirectory() || clientInfo.isSymbolicLink()) continue;
    const projects = join(clientPath, 'projects');
    for (const name of await directoryNames(projects)) {
      const batch = name.match(BATCH_SUFFIX)?.[1];
      if (!batch) continue;
      const candidate = join(projects, name);
      const info = await lstat(candidate);
      let matches = false;
      if (projectId && info.isDirectory() && !info.isSymbolicLink()) {
        try {
          const owner = object(await readJson(join(candidate, '.studio-owner.json')), 'Proprietário do espelho');
          matches = owner.projectId === projectId && owner.batchId === batch;
        } catch { /* An unreadable or absent marker does not prove ownership. */ }
      }
      if (matches) owned.push(candidate);
      else if (batches.has(batch)) preserved++;
    }
  }
  return { owned, preserved };
}

/** A batch suffix alone is never proof of ownership. */
export async function findNativeCopies(dataDir: string, batches: ReadonlySet<string>, projectId?: string): Promise<string[]> {
  if (!projectId) return [];
  safeId(projectId);
  return (await nativeInventory(dataDir, batches, projectId)).owned.filter(path => {
    const batch = path.match(BATCH_SUFFIX)?.[1];
    return batch !== undefined && batches.has(batch);
  });
}

async function projectRecord(root: string, projectId: string): Promise<{ folder: string; title: string; registry: string }> {
  safeId(projectId);
  const registryRoot = join(root, '.studio', 'projects');
  const registry = join(registryRoot, `${projectId}.json`);
  const record = object(await readJson(registry), 'Registro do projeto');
  const project = object(record.project, 'Projeto');
  const folderName = record.folderName === undefined ? projectId : record.folderName;
  if (project.id !== projectId || typeof project.title !== 'string' || typeof folderName !== 'string' || folderName.length > 100 || !FOLDER_NAME.test(folderName)) {
    throw new Error('Registro de projeto inválido; exclusão recusada.');
  }
  // A second registry may refer to the same folder. An unreadable record cannot establish exclusivity.
  for (const name of await directoryNames(registryRoot)) {
    if (!name.endsWith('.json') || name === `${projectId}.json`) continue;
    const other = object(await readJson(join(registryRoot, name)), 'Registro de outro projeto');
    const otherProject = object(other.project, 'Outro projeto');
    if (typeof otherProject.id !== 'string' || !UUID.test(otherProject.id)) throw new Error(`Registro de projeto inválido: ${name}`);
    const otherFolder = other.folderName === undefined ? otherProject.id : other.folderName;
    if (typeof otherFolder !== 'string' || !FOLDER_NAME.test(otherFolder)) throw new Error(`Pasta de projeto inválida: ${name}`);
    if (otherFolder === folderName) throw new Error('A pasta é compartilhada por outro projeto; exclusão recusada.');
  }
  return { folder: join(root, 'projects', folderName), title: project.title, registry };
}

async function inventoryFor(root: string, dataDir: string, projectId: string, allowMissingFolder: boolean): Promise<DeletionInventory> {
  const project = await projectRecord(root, projectId);
  const sessions: string[] = [];
  const sessionsRoot = join(root, '.studio', 'sessions');
  for (const name of await directoryNames(sessionsRoot)) {
    const directory = join(sessionsRoot, name);
    const info = await lstat(directory);
    if (info.isSymbolicLink()) throw new Error(`Sessão com link simbólico preservada: ${directory}`);
    if (!info.isDirectory()) continue;
    // Failure to read any session means that a complete inventory cannot be established.
    const record = object(await readJson(join(directory, 'session.json')), 'Sessão');
    if (!UUID.test(name) || record.id !== name || typeof record.projectId !== 'string' || !UUID.test(record.projectId)) throw new Error(`Sessão inválida; original preservado: ${directory}`);
    if (record.projectId === projectId) sessions.push(directory);
  }
  if (inside(resolve(project.folder), resolve(dataDir))) throw new Error('A pasta do projeto contém dados compartilhados do aplicativo; exclusão recusada.');
  await safePath(project.folder);
  let folderExists = true;
  try {
    if (!(await lstat(project.folder)).isDirectory()) throw new Error('A pasta do projeto não é um diretório regular.');
  } catch (error) {
    if (!missing(error) || !allowMissingFolder) throw error;
    folderExists = false;
  }
  const native = await nativeInventory(dataDir, folderExists ? await batchIds(project.folder) : new Set<string>(), projectId);
  return { projectId, title: project.title, folder: project.folder, registry: project.registry, sessions, nativeCopies: native.owned, preservedNativeCopies: native.preserved };
}

export async function buildInventory(root: string, dataDir: string, projectId: string, title: string, folder: string): Promise<DeletionInventory> {
  const inventory = await inventoryFor(root, dataDir, projectId, false);
  if (resolve(folder) !== resolve(inventory.folder) || title !== inventory.title) throw new Error('O projeto mudou; atualize antes de excluir.');
  return inventory;
}

export async function previewDeletion(inventory: DeletionInventory): Promise<DeletionPreview> {
  const tree = await measureTree(inventory.folder);
  return { projectId: inventory.projectId, title: inventory.title, folder: inventory.folder, files: tree.files, bytes: tree.bytes, sessions: inventory.sessions.length, nativeCopies: inventory.nativeCopies.length, preservedNativeCopies: inventory.preservedNativeCopies };
}

async function inspectExisting(target: string, protectExports = false): Promise<boolean> {
  try { await lstat(target); } catch (error) { if (missing(error)) return false; throw error; }
  await inspectTree(target, protectExports);
  return true;
}
async function removeTarget(target: string, protectExports = false): Promise<void> {
  if (!await inspectExisting(target, protectExports)) return;
  await safePath(target);
  await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  try { await lstat(target); } catch (error) { if (missing(error)) return; throw error; }
  throw new Error(`Não foi possível remover ${target}.`);
}

function parseDeletionTargets(value: unknown): DeletionTargets {
  const record = object(value, 'Alvos da exclusão');
  if (!Array.isArray(record.sessions) || !record.sessions.every(path => typeof path === 'string') ||
      !Array.isArray(record.nativeCopies) || !record.nativeCopies.every(path => typeof path === 'string')) {
    throw new Error('Inventário de exclusão inválido; registro preservado.');
  }
  return { sessions: [...record.sessions] as string[], nativeCopies: [...record.nativeCopies] as string[] };
}
function sameTargets(left: DeletionTargets, right: DeletionTargets): boolean {
  return left.sessions.length === right.sessions.length && left.sessions.every((path, index) => path === right.sessions[index]) &&
    left.nativeCopies.length === right.nativeCopies.length && left.nativeCopies.every((path, index) => path === right.nativeCopies[index]);
}
async function authorizedDeletionPaths(root: string, dataDir: string, projectId: string, folder: string, registry: string, targets: DeletionTargets): Promise<string[]> {
  safeId(projectId);
  const expectedFolder = resolve(folder);
  const expectedRegistry = resolve(join(root, '.studio', 'projects', `${projectId}.json`));
  if (dirname(expectedFolder) !== resolve(join(root, 'projects')) || !FOLDER_NAME.test(basename(expectedFolder)) ||
      expectedRegistry !== resolve(registry) || inside(expectedFolder, resolve(dataDir))) {
    throw new Error('Alvo de projeto inválido; registro de exclusão preservado.');
  }
  const all = [...targets.sessions, ...targets.nativeCopies, expectedFolder, expectedRegistry];
  if (new Set(all.map(path => resolve(path))).size !== all.length) throw new Error('Inventário de exclusão duplicado; registro preservado.');
  const sessionsRoot = resolve(join(root, '.studio', 'sessions'));
  for (const target of targets.sessions) {
    const path = resolve(target);
    if (path !== target || dirname(path) !== sessionsRoot || !UUID.test(basename(path))) throw new Error('Alvo de sessão inválido; registro preservado.');
    await safePath(path);
    const info = await lstat(path).catch(error => { if (missing(error)) return undefined; throw error; });
    if (!info) continue;
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Sessão substituída; original preservado: ${path}`);
    const session = await readJson(join(path, 'session.json')).catch(error => { if (missing(error)) return undefined; throw error; });
    if (session !== undefined) {
      const record = object(session, 'Sessão');
      if (record.id !== basename(path) || record.projectId !== projectId) throw new Error(`Sessão sem propriedade confirmada; original preservado: ${path}`);
    }
  }
  const clientsRoot = resolve(join(nativeHome(dataDir), 'clients'));
  for (const target of targets.nativeCopies) {
    const path = resolve(target);
    const client = basename(dirname(dirname(path)));
    const batch = basename(path).match(BATCH_SUFFIX)?.[1];
    if (path !== target || dirname(path) !== resolve(join(clientsRoot, client, 'projects')) ||
        !FOLDER_NAME.test(client) || !FOLDER_NAME.test(basename(path)) || !batch) {
      throw new Error('Alvo de espelho PostNow inválido; registro preservado.');
    }
    await safePath(path);
    const info = await lstat(path).catch(error => { if (missing(error)) return undefined; throw error; });
    if (!info) continue;
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Espelho PostNow substituído; original preservado: ${path}`);
    const owner = await readJson(join(path, '.studio-owner.json')).catch(error => { if (missing(error)) return undefined; throw error; });
    if (owner !== undefined) {
      const record = object(owner, 'Proprietário do espelho');
      if (record.projectId !== projectId || record.batchId !== batch) throw new Error(`Proprietário do espelho divergente; original preservado: ${path}`);
    }
  }
  await safePath(expectedFolder);
  await safePath(expectedRegistry);
  return all;
}
async function finishDeletion(root: string, dataDir: string, projectId: string, expectedFolder: string, token: string, targets: DeletionTargets): Promise<void> {
  const registryPath = join(root, '.studio', 'projects', `${safeId(projectId)}.json`);
  const registry = object(await readJson(registryPath), 'Registro do projeto');
  const deletion = object(registry.deletion, 'Autorização de exclusão');
  if (deletion.token !== token || !UUID.test(token)) throw new Error('Autorização de exclusão inválida; registro pendente preservado.');
  const authorized = parseDeletionTargets(deletion.targets);
  if (!sameTargets(authorized, targets)) throw new Error('O inventário autorizado mudou; registro pendente preservado.');
  const project = await projectRecord(root, projectId);
  if (resolve(project.folder) !== resolve(expectedFolder)) throw new Error('A pasta do projeto mudou; exclusão pendente preservada.');
  const paths = await authorizedDeletionPaths(root, dataDir, projectId, project.folder, project.registry, targets);
  for (const target of paths) await inspectExisting(target, target === project.folder);
  for (const target of paths) await removeTarget(target, target === project.folder);
}

export async function executeDeletion(root: string, dataDir: string, inventory: DeletionInventory, beforeRemoval?: (projectId: string) => Promise<void>): Promise<void> {
  const current = await inventoryFor(root, dataDir, inventory.projectId, false);
  if (resolve(current.folder) !== resolve(inventory.folder) || current.title !== inventory.title || resolve(current.registry) !== resolve(inventory.registry)) throw new Error('O projeto mudou; atualize antes de excluir.');
  const targets: DeletionTargets = { sessions: [...current.sessions], nativeCopies: [...current.nativeCopies] };
  const journalDirectory = await privateWorkspaceDirectory(dataDir, root, DELETION_JOURNAL_DIRECTORY);
  const tombstone = join(journalDirectory, `${current.projectId}.json`);
  await safePath(tombstone);
  try { await lstat(tombstone); throw new Error('Já existe uma exclusão pendente para este projeto.'); } catch (error) { if (!missing(error)) throw error; }
  const token = randomUUID();
  await atomicJson(tombstone, { projectId: current.projectId, folder: current.folder, token, createdAt: new Date().toISOString(), targets });
  const record = object(await readJson(current.registry), 'Registro do projeto');
  await atomicJson(current.registry, { ...record, deletion: { token, targets } });
  try {
    await beforeRemoval?.(current.projectId);
    await finishDeletion(root, dataDir, current.projectId, current.folder, token, targets);
  }
  catch (error) { throw new Error(`Exclusão incompleta; registro preservado para recuperação. ${error instanceof Error ? error.message : String(error)}`); }
  await safePath(tombstone);
  await rm(tombstone);
}

export async function hasPendingDeletions(root: string, dataDir: string): Promise<boolean> {
  const directory = await privateWorkspaceDirectory(dataDir, root, DELETION_JOURNAL_DIRECTORY);
  return (await directoryNames(directory)).some(name => name.endsWith('.json'));
}
export async function requireNoPendingDeletion(root: string, dataDir: string, id: string): Promise<void> {
  const directory = await privateWorkspaceDirectory(dataDir, root, DELETION_JOURNAL_DIRECTORY);
  const file = join(directory, `${safeId(id)}.json`);
  await safePath(file);
  const pending = await lstat(file).catch(error => { if (missing(error)) return undefined; throw error; });
  if (pending) throw new Error('Este projeto possui uma exclusão pendente. Aguarde a recuperação antes de iniciar outra ação.');
}

export async function recoverDeletions(root: string, dataDir: string, beforeRecovery?: (projectId: string) => Promise<void>): Promise<RecoveredDeletion[]> {
  const recovered: RecoveredDeletion[] = [];
  const directory = await privateWorkspaceDirectory(dataDir, root, DELETION_JOURNAL_DIRECTORY);
  for (const name of await directoryNames(directory)) {
    if (!name.endsWith('.json')) continue;
    const id = name.slice(0, -5);
    if (!UUID.test(id)) throw new Error(`Registro de exclusão pendente inválido: ${name}`);
    const file = join(directory, name);
    let journal = object(await readJson(file), 'Exclusão pendente');
    if (journal.projectId !== id || typeof journal.folder !== 'string' || typeof journal.token !== 'string' || !UUID.test(journal.token)) throw new Error('Registro de exclusão pendente inválido; preserve-o para recuperação.');
    if (dirname(resolve(journal.folder)) !== resolve(root, 'projects') || !FOLDER_NAME.test(basename(journal.folder))) throw new Error('Pasta de exclusão pendente inválida; registro preservado.');
    await safePath(journal.folder);
    const registryPath = join(root, '.studio', 'projects', `${id}.json`);
    const registryValue = await readJson(registryPath).catch(error => { if (missing(error)) return undefined; throw error; });
    if (registryValue === undefined) {
      if (journal.targets === undefined) throw new Error('Registro de exclusão antigo sem inventário; preservado para recuperação manual.');
      const targets = parseDeletionTargets(journal.targets);
      const paths = await authorizedDeletionPaths(root, dataDir, id, journal.folder, registryPath, targets);
      for (const target of paths.slice(0, -1)) {
        if (await lstat(target).catch(error => { if (missing(error)) return undefined; throw error; })) throw new Error(`Registro do projeto ausente e alvo ainda presente; exclusão preservada: ${target}`);
      }
    } else {
      const projectRecordValue = object(registryValue, 'Registro do projeto');
      if (projectRecordValue.deletion === undefined) { await safePath(file); await rm(file); continue; }
      const deletion = object(projectRecordValue.deletion, 'Autorização de exclusão');
      if (deletion.token !== journal.token) throw new Error('A autorização e o journal de exclusão não conferem; ambos foram preservados.');
      let targets: DeletionTargets;
      if (journal.targets !== undefined) {
        targets = parseDeletionTargets(journal.targets);
        if (deletion.targets !== undefined && !sameTargets(targets, parseDeletionTargets(deletion.targets))) throw new Error('O inventário do journal difere do registro; ambos foram preservados.');
        if (deletion.targets === undefined) throw new Error('O registro perdeu o inventário autorizado; exclusão preservada.');
      } else if (deletion.targets !== undefined) {
        targets = parseDeletionTargets(deletion.targets);
        await authorizedDeletionPaths(root, dataDir, id, journal.folder, registryPath, targets);
        journal = { ...journal, targets };
        await atomicJson(file, journal);
      } else {
        const folderInfo = await lstat(journal.folder).catch(error => { if (missing(error)) return undefined; throw error; });
        if (!folderInfo?.isDirectory() || folderInfo.isSymbolicLink()) throw new Error('Journal antigo sem inventário e pasta indisponível; exclusão preservada para recuperação manual.');
        const legacy = await inventoryFor(root, dataDir, id, true);
        if (legacy.preservedNativeCopies > 0) throw new Error('O journal antigo não consegue provar propriedade de todas as cópias nativas; exclusão preservada.');
        targets = { sessions: [...legacy.sessions], nativeCopies: [...legacy.nativeCopies] };
        await authorizedDeletionPaths(root, dataDir, id, journal.folder, registryPath, targets);
        await atomicJson(registryPath, { ...projectRecordValue, deletion: { ...deletion, targets } });
        journal = { ...journal, targets };
        await atomicJson(file, journal);
      }
      await beforeRecovery?.(id);
      await finishDeletion(root, dataDir, id, journal.folder as string, journal.token as string, targets);
    }
    await safePath(file);
    await rm(file);
    recovered.push({ projectId: id, folder: journal.folder as string });
  }
  return recovered;
}
