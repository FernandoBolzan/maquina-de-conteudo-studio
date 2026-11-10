import { writeZipFile, type ZipSource } from './zip.js';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative } from 'node:path';
import { postNowFormatAcceptsPageCount, type Asset, type Brand, type BrandReference, type FormatAdaptation, type GenerationBatch, type NarrationMode, type NarrationState, type PostNowFormatId, type Project, type ProjectDetail, type ProjectFormatId, type VisualGenerationReview } from '../shared/contracts.js';
import { DEFAULT_POSTNOW_FORMAT, POSTNOW_FORMATS, formatCanvas, isPostNowFormat, pagesRangeFor, type PostNowKind } from '../shared/formats.js';
import { isDepictedPerson, portraitDiversityIssues, portraitPlanIssues } from '../shared/depicted-person.js';
import { applyArtText, onScreenItems, onScreenText, validateStoryboardScenes, validateVisualTextPages, type VisualTextEditPage, type VisualTextEditScene } from '../shared/visual-text.js';
import { storyboardContractIssues } from '../shared/storyboard-contract.js';
import { videoGoBrandProfile } from '../shared/brand-profile.js';
import { singleLine, text, type Services } from './context.js';
import { resolveTool, toolEnvironment } from './setup.js';
import { atomicJson, atomicText, copyLocal, directory, fingerprint, inside, localPath, missing, object, privateWorkspaceDirectory, readJson, requireIdle, reserveProject, safeId, safePath, serialized, UUID, walk, workspace } from './content/storage.js';
import { initializeNative, secureStoryboard, storyboard, type StoryboardSourceScene } from './content/native.js';
import { buildInventory, executeDeletion, findNativeCopies, hasPendingDeletions, previewDeletion, recoverDeletions, requireNoPendingDeletion, type DeletionInventory, type RecoveredDeletion } from './content/lifecycle.js';
import { approvedPortraitAt, finalizePostNowBatch, nextImageBatchId, postnowHome, readBatchStatus, requireLogoPolicy, writeBatchStatus } from './content/postnow.js';
import { listElevenLabsVoices } from './elevenlabs.js';
import type { NarrationAudioSource } from '../shared/contracts.js';
import { isNarrationAudioSource, narrationGate, parseNarrationAttachSource } from '../shared/narration.js';
import { stageNarrationAudio } from './narration-audio-attach.js';
import { generateLocalNarration } from './local-narration.js';
import { projectCoverUrl } from './content/project-cover.js';
interface NarrationApproval { hash: string; approvedAt: string; }
interface NarrationAudioEntry { assetPath: string; source: NarrationAudioSource; textHash: string; }
interface NarrationAudio { scenes: Record<string, NarrationAudioEntry>; }
interface LegacyNarrationAudio { hash: string; assetPaths: string[]; }
interface VisualApproval { hash: string; approvedAt: string; }
interface StoredFormatAdaptation extends FormatAdaptation { snapshotId: string; }
interface StoredProject { project: Project; folderName: string; notes: string; approvals: Record<string, string>; redo?: Record<string, { stamp: string; note: string }>; visualApproval?: VisualApproval; formatAdaptation?: StoredFormatAdaptation; narrationMode?: NarrationMode; narrationApproval?: NarrationApproval; narrationAudio?: NarrationAudio; legacyNarrationAudio?: LegacyNarrationAudio; }
interface MappedImagePage { page: number; input: string; output: string; native?: string; }
interface AssetDeletionTarget { scope: 'project' | 'postnow'; path: string; }
interface AssetDeletionJournal {
  schema: 'maquina.asset-deletion/v1';
  projectId: string;
  assetKey: string;
  batchId?: string;
  page?: MappedImagePage;
  sourceFound: boolean;
  targets: AssetDeletionTarget[];
}
const kinds: Record<string, Asset['kind']> = {
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image', '.avif': 'image', '.svg': 'image',
  '.mp4': 'video', '.webm': 'video', '.mov': 'video', '.mkv': 'video', '.m4v': 'video',
  '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.m4a': 'audio', '.aac': 'audio', '.flac': 'audio',
  '.pdf': 'file', '.txt': 'file', '.md': 'file', '.json': 'file', '.srt': 'file', '.vtt': 'file', '.ass': 'file',
};
const refKinds: Record<string, BrandReference['kind']> = {
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image', '.avif': 'image', '.svg': 'image',
  '.pdf': 'pdf', '.txt': 'document', '.md': 'document', '.json': 'document',
};
function freeText(payload: Record<string, unknown>, key: string, max = 100000): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.length > max) throw new Error(`Campo inválido: ${key}`);
  return value;
}
function projectKind(value: unknown): Project['kind'] {
  if (value !== 'image' && value !== 'video') throw new Error('Tipo de projeto inválido.');
  return value;
}
const postNowFormats: readonly ProjectFormatId[] = Object.keys(POSTNOW_FORMATS) as ProjectFormatId[];
const videoGoFormats: readonly ProjectFormatId[] = ['reels', 'story', 'feed-square', 'youtube'];
/** Formato escolhido para criar ou importar; ausente usa o padrão. Valor fora do catálogo é recusado. */
function projectFormat(value: unknown, kind: Project['kind']): ProjectFormatId {
  const allowed = kind === 'image' ? postNowFormats : videoGoFormats;
  const fallback: ProjectFormatId = kind === 'image' ? DEFAULT_POSTNOW_FORMAT : 'reels';
  if (value === undefined) return fallback;
  const format = allowed.find(item => item === value);
  if (format === undefined) throw new Error(`Formato inválido para ${kind === 'image' ? 'PostNow' : 'VideoGo'}.`);
  return format;
}
/** Formato gravado no registro. Formato de imagem fora do catálogo atual fica em `unsupportedFormat`: o projeto abre, mas não gera nem renderiza até nova escolha. */
function storedProjectFormat(value: unknown, kind: Project['kind']): Pick<Project, 'format' | 'unsupportedFormat'> {
  if (kind === 'image' && typeof value === 'string' && !isPostNowFormat(value)) return { unsupportedFormat: value };
  return { format: projectFormat(value, kind) };
}
/** Formato PostNow do projeto. Sem formato válido a operação para com erro; nunca usa padrão em silêncio. */
export function postNowFormatOf(project: Project): PostNowFormatId {
  if (!isPostNowFormat(project.format)) throw new Error('Formato removido ou ausente: escolha outro formato no Studio antes de continuar.');
  return project.format;
}
const postNowImageExtensions: Record<string, true> = { '.png': true, '.jpg': true, '.jpeg': true, '.webp': true };
function postNowFormatForPageCount(requested: ProjectFormatId | undefined, pageCount: number): PostNowFormatId {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('Não há páginas reais para derivar ao PostNow.');
  const format = requested ?? (pageCount === 1 ? 'post-1x1' : 'carousel-1x1');
  if (isPostNowFormat(format) && postNowFormatAcceptsPageCount(format, pageCount)) return format;
  if (pageCount === 1 && format.startsWith('carousel-')) throw new Error('Um carrossel PostNow exige de 3 a 10 páginas; escolha Post único ou Story para uma mídia.');
  if (pageCount !== 1 && (pageCount < 3 || pageCount > 10)) throw new Error('A derivação PostNow aceita uma mídia para Post/Story ou de 3 a 10 mídias para carrossel.');
  throw new Error('Post único e Story exigem uma mídia; para várias mídias escolha carrossel.');
}
function postNowNativeImageName(format: PostNowFormatId, page: number, count: number): string {
  const kind: PostNowKind = POSTNOW_FORMATS[format].kind;
  if (kind === 'post') return '1-post.png';
  if (kind === 'story') return '1-story.png';
  return page === 1 ? '1-capa.png' : page === count ? `${count}-cta.png` : `${page}-pagina.png`;
}
function requestedPageCount(value: unknown, format: ProjectFormatId): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !postNowFormatAcceptsPageCount(format, value)) throw new Error('Quantidade de páginas inválida para o formato escolhido.');
  return value;
}
function postNowFieldMissing(value: unknown): boolean {
  return typeof value !== 'string' || !value.trim() || /\[(?:PREENCHER|TODO)\]/i.test(value);
}
const PROJECT_FOLDER_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function projectFolderName(value: unknown, fallback: string): string {
  const name = value === undefined ? fallback : value;
  if (typeof name !== 'string' || name.length > 100 || !PROJECT_FOLDER_NAME.test(name)) throw new Error('Nome da pasta do projeto inválido; original preservado.');
  return name;
}
function projectFolderSlug(title: string): string {
  let slug = title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '') || 'projeto';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(slug)) slug = `projeto-${slug}`;
  return slug;
}
function alreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
async function createProjectFolder(root: string, title: string): Promise<{ folderName: string; path: string }> {
  const projectsDirectory = await directory(root, 'projects');
  const base = projectFolderSlug(title);
  for (let suffix = 1; suffix <= 10_000; suffix++) {
    const folderName = suffix === 1 ? base : `${base}-${suffix}`;
    const path = join(projectsDirectory, folderName);
    try {
      await mkdir(path);
      return { folderName, path };
    } catch (error) {
      if (!alreadyExists(error)) throw error;
    }
  }
  throw new Error('Não foi possível encontrar um nome de pasta disponível para o projeto.');
}
function recordPath(root: string, id: string): string { return join(root, '.studio', 'projects', `${safeId(id)}.json`); }
async function ids(root: string, folder: string): Promise<string[]> {
  const path = await directory(root, join('.studio', folder));
  return (await readdir(path)).filter((name) => UUID.test(name.replace(/\.json$/, '')) && name.endsWith('.json')).sort().map((name) => name.slice(0, -5));
}
async function load(root: string, id: string): Promise<StoredProject> {
  const data = object(await readJson(recordPath(root, id)), 'Registro do projeto');
  const item = object(data.project, 'Projeto');
  if (item.id !== id || typeof item.title !== 'string' || typeof item.createdAt !== 'string' || typeof item.brief !== 'string' || typeof data.notes !== 'string') throw new Error('Registro de projeto inválido; original preservado.');
  const folderName = projectFolderName(data.folderName, id);
  const kind = projectKind(item.kind);
  const project: Project = { id, title: item.title, createdAt: item.createdAt, brief: item.brief, kind, ...storedProjectFormat(item.format, kind), path: await localPath(root, join('projects', folderName)) };
  if (item.brandId !== undefined) project.brandId = safeId(item.brandId);
  if (item.sourceProjectId !== undefined) project.sourceProjectId = safeId(item.sourceProjectId);
  if (item.voiceId !== undefined) {
    if (typeof item.voiceId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(item.voiceId)) throw new Error('Voz do projeto inválida.');
    project.voiceId = item.voiceId;
  }
  const rawApprovals = object(data.approvals, 'Aprovações');
  const approvals: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [path, stamp] of Object.entries(rawApprovals)) {
    if (typeof stamp !== 'string') throw new Error('Aprovação inválida; original preservado.');
    await localPath(project.path, path);
    approvals[path] = stamp;
  }
  let redo: Record<string, { stamp: string; note: string }> | undefined;
  if (data.redo !== undefined) {
    redo = Object.create(null) as Record<string, { stamp: string; note: string }>;
    for (const [path, value] of Object.entries(object(data.redo, 'Refazer'))) {
      const raw = object(value, 'Marca de refazer');
      if (typeof raw.stamp !== 'string' || typeof raw.note !== 'string' || raw.note.length > 1000) throw new Error('Marca de refazer inválida; original preservado.');
      await localPath(project.path, path);
      redo[path] = { stamp: raw.stamp, note: raw.note };
    }
  }
  let visualApproval: VisualApproval | undefined;
  if (data.visualApproval !== undefined) {
    const raw = object(data.visualApproval, 'Aprovação de geração visual');
    if (typeof raw.hash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.hash) || typeof raw.approvedAt !== 'string') throw new Error('Aprovação de geração visual inválida; original preservado.');
    visualApproval = { hash: raw.hash, approvedAt: raw.approvedAt };
  }
  let formatAdaptation: StoredFormatAdaptation | undefined;
  if (data.formatAdaptation !== undefined) {
    const raw = object(data.formatAdaptation, 'Adaptação de formato');
    if (!isPostNowFormat(raw.sourceFormat) || !isPostNowFormat(raw.targetFormat) || typeof raw.pageCount !== 'number' || !postNowFormatAcceptsPageCount(raw.targetFormat, raw.pageCount) || typeof raw.snapshotId !== 'string' || !UUID.test(raw.snapshotId) || project.format !== raw.targetFormat) throw new Error('Adaptação de formato inválida; original preservado.');
    formatAdaptation = { sourceFormat: raw.sourceFormat, targetFormat: raw.targetFormat, pageCount: raw.pageCount, snapshotId: raw.snapshotId };
  }
  if (data.narrationMode !== undefined && data.narrationMode !== 'silent' && data.narrationMode !== 'narrated') throw new Error('Modo de narração inválido; original preservado.');
  const narrationMode: NarrationMode = data.narrationMode ?? 'narrated';
  let narrationApproval: NarrationApproval | undefined;
  if (data.narrationApproval !== undefined) {
    const raw = object(data.narrationApproval, 'Aprovação da narração');
    if (typeof raw.hash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.hash) || typeof raw.approvedAt !== 'string') throw new Error('Aprovação da narração inválida; original preservado.');
    narrationApproval = { hash: raw.hash, approvedAt: raw.approvedAt };
  }
  let narrationAudio: NarrationAudio | undefined;
  let legacyNarrationAudio: LegacyNarrationAudio | undefined;
  if (data.narrationAudio !== undefined) {
    const raw = object(data.narrationAudio, 'Áudios de narração');
    if (raw.scenes !== undefined) {
      const scenes: Record<string, NarrationAudioEntry> = {};
      for (const [sceneId, value] of Object.entries(object(raw.scenes, 'Áudios por cena'))) {
        const entry = object(value, 'Áudio da cena');
        if (typeof entry.assetPath !== 'string' || typeof entry.textHash !== 'string' || !/^[a-f0-9]{64}$/.test(entry.textHash) || (entry.source !== undefined && !isNarrationAudioSource(entry.source))) throw new Error('Registro de áudio narrativo inválido; original preservado.');
        await localPath(project.path, entry.assetPath);
        scenes[sceneId] = { assetPath: entry.assetPath, source: isNarrationAudioSource(entry.source) ? entry.source : 'elevenlabs', textHash: entry.textHash };
      }
      narrationAudio = { scenes };
    } else {
      if (typeof raw.hash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.hash) || !Array.isArray(raw.assetPaths) || !raw.assetPaths.every((path) => typeof path === 'string')) throw new Error('Registro de áudio narrativo inválido; original preservado.');
      const assetPaths: string[] = raw.assetPaths;
      for (const path of assetPaths) await localPath(project.path, path);
      legacyNarrationAudio = { hash: raw.hash, assetPaths };
    }
  }
  if (!(await lstat(project.path)).isDirectory()) throw new Error('Pasta do projeto não encontrada.');
  return { project, folderName, notes: data.notes, approvals, redo, visualApproval, formatAdaptation, narrationMode, narrationApproval, narrationAudio, legacyNarrationAudio };
}
async function save(root: string, stored: StoredProject): Promise<void> {
  const { legacyNarrationAudio, ...record } = stored;
  await atomicJson(recordPath(root, stored.project.id), legacyNarrationAudio ? { ...record, narrationAudio: legacyNarrationAudio } : record);
}
interface NarrationDocument { data: Record<string, unknown>; scenes: { raw: Record<string, unknown>; audio: Record<string, unknown>; id: string; title: string; narration: string; spokenText: string }[]; }
async function narrationDocument(stored: StoredProject): Promise<NarrationDocument> {
  const path = join(stored.project.path, 'storyboard.json');
  const data = await secureStoryboard(path, stored.project.path, undefined, { allowMissingNarration: true, allowMissingAssets: true });
  if (!Array.isArray(data.scenes)) throw new Error('Storyboard sem cenas válidas.');
  const scenes = data.scenes.map((entry) => {
    const raw = object(entry, 'Cena');
    if (typeof raw.id !== 'string') throw new Error('Cena sem identificador válido.');
    const audio = raw.audio === undefined ? {} : object(raw.audio, 'Áudio da cena');
    return {
      raw: raw as Record<string, unknown>,
      audio,
      id: raw.id,
      title: typeof raw.title === 'string' ? raw.title : raw.id,
      narration: typeof raw.narration === 'string' ? raw.narration : '',
      spokenText: typeof audio.spokenText === 'string' ? audio.spokenText : (typeof raw.narration === 'string' ? raw.narration : ''),
    };
  });
  return { data, scenes };
}

/** Availability is editorial; render readiness remains the native explicit `ready` status. */
async function storyboardStatus(projectPath: string): Promise<{ available: boolean; ready: boolean; issues: string[] }> {
  let data: unknown;
  try {
    data = await readJson(await localPath(projectPath, 'storyboard.json'));
  } catch {
    return { available: false, ready: false, issues: ['storyboard.json ausente ou ilegível.'] };
  }
  const record: Record<string, unknown> = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
  const scenes = Array.isArray(record.scenes) ? record.scenes : [];
  const ready = record.status === 'ready' && scenes.length > 0;
  const available = record.schema === 'videogo.storyboard/v1' && (ready || scenes.some(scene => {
    if (typeof scene !== 'object' || scene === null || Array.isArray(scene)) return false;
    const item = scene as Record<string, unknown>;
    return (typeof item.narration === 'string' && !!item.narration.trim()) || (Array.isArray(item.onScreen) && item.onScreen.some(line => typeof line === 'string' && !!line.trim()));
  }));
  return { available, ready, issues: storyboardContractIssues(data) };
}

function narrationHash(scenes: NarrationDocument['scenes'], voiceId?: string): string {
  const payload = {
    modelId: 'eleven_v4',
    voiceId: voiceId ?? null,
    scenes: scenes.map((scene) => ({ id: scene.id, narration: scene.narration, spokenText: scene.spokenText })),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
interface NarrationView { id: string; title: string; narrates: boolean; attached: boolean; approved: boolean; stray: boolean; audioPath?: string; source?: NarrationAudioSource; }
function sceneTextHash(scene: { narration: string; spokenText: string }): string {
  return createHash('sha256').update(JSON.stringify({ narration: scene.narration, spokenText: scene.spokenText })).digest('hex');
}
function storyboardAssetPath(scene: NarrationDocument['scenes'][number]): string | undefined {
  const ref = scene.audio.narration;
  return ref && typeof ref === 'object' && 'assetPath' in ref && typeof ref.assetPath === 'string' ? ref.assetPath : undefined;
}
function narrationEntries(stored: StoredProject, document: NarrationDocument): Record<string, NarrationAudioEntry> {
  if (stored.narrationAudio) return stored.narrationAudio.scenes;
  const legacy = stored.legacyNarrationAudio;
  if (!legacy || legacy.hash !== narrationHash(document.scenes, stored.project.voiceId)) return {};
  const entries: Record<string, NarrationAudioEntry> = {};
  for (const path of legacy.assetPaths) {
    const id = basename(path, extname(path));
    const scene = document.scenes.find(item => item.id === id);
    if (scene) entries[id] = { assetPath: path, source: 'elevenlabs', textHash: sceneTextHash(scene) };
  }
  return entries;
}
async function narrationAudioFile(root: string, path: string): Promise<string | undefined> {
  try {
    const file = await localPath(root, path);
    if (kinds[extname(file).toLowerCase()] !== 'audio') return undefined;
    const info = await lstat(file);
    return info.isFile() && !info.isSymbolicLink() ? file : undefined;
  } catch {
    return undefined;
  }
}
async function narrationViews(stored: StoredProject, document: NarrationDocument, entries: Record<string, NarrationAudioEntry>): Promise<NarrationView[]> {
  const views: NarrationView[] = [];
  for (const scene of document.scenes) {
    const entry = entries[scene.id];
    const ref = storyboardAssetPath(scene);
    const file = entry && entry.textHash === sceneTextHash(scene) && ref === entry.assetPath ? await narrationAudioFile(stored.project.path, entry.assetPath) : undefined;
    const approved = !!entry && !!file && stored.approvals[entry.assetPath] === (await fingerprint(file)).stamp;
    views.push({ id: scene.id, title: scene.title, narrates: scene.narration.trim().length > 0, attached: file !== undefined, approved, stray: ref !== undefined && file === undefined, audioPath: file ? entry?.assetPath : undefined, source: entry?.source });
  }
  return views;
}
async function narrationEvaluation(stored: StoredProject, services: Services) {
  const document = await narrationDocument(stored);
  const entries = narrationEntries(stored, document);
  const hash = narrationHash(document.scenes, stored.project.voiceId);
  const views = await narrationViews(stored, document, entries);
  const approved = stored.narrationApproval?.hash === hash;
  const gate = narrationGate({
    mode: stored.narrationMode ?? 'narrated',
    voiceId: stored.project.voiceId,
    scenes: views,
    elevenLabsAttached: views.some(view => view.attached && view.source === 'elevenlabs'),
    voiceApproved: approved,
    elevenLabsReady: Boolean(services.getElevenLabsKey()),
  });
  return { document, views, approved, gate };
}
async function narrationState(stored: StoredProject, services: Services): Promise<NarrationState> {
  const { document, views, approved, gate } = await narrationEvaluation(stored, services);
  const narrated = views.filter(view => view.narrates);
  return {
    mode: stored.narrationMode ?? 'narrated',
    active: gate.active,
    ready: gate.issues.length === 0,
    voiceId: stored.project.voiceId,
    modelId: 'eleven_v4',
    scenes: document.scenes.map(({ id, title, narration, spokenText }, index) => {
      const view = views[index]!;
      return { id, title, narration, spokenText, audioAttached: view.attached, audioPath: view.audioPath, audioSource: view.attached ? view.source : undefined, stray: view.stray };
    }),
    approved,
    audioReady: narrated.length > 0 && narrated.every(view => view.attached),
    audioApproved: narrated.length > 0 && narrated.every(view => view.attached && view.approved),
  };
}
async function saveNarration(root: string, stored: StoredProject, services: Services, payload: Record<string, unknown>): Promise<NarrationState> {
  const document = await narrationDocument(stored);
  if (!Array.isArray(payload.scenes) || payload.scenes.length !== document.scenes.length) throw new Error('Revise todas as cenas da narração antes de salvar.');
  const drafts = new Map<string, { narration: string; spokenText: string }>();
  for (const item of payload.scenes) {
    const draft = object(item, 'Cena da narração');
    if (typeof draft.id !== 'string' || typeof draft.narration !== 'string' || draft.narration.length > 10_000 || typeof draft.spokenText !== 'string' || draft.spokenText.length > 10_000) throw new Error('Texto inválido ou acima de 10.000 caracteres por cena.');
    if (drafts.has(draft.id)) throw new Error('A narração contém cenas duplicadas.');
    drafts.set(draft.id, { narration: draft.narration, spokenText: draft.spokenText || draft.narration });
  }
  const oldHash = narrationHash(document.scenes, stored.project.voiceId);
  const voiceId = payload.voiceId === undefined || payload.voiceId === '' ? undefined : text(payload, 'voiceId', 128);
  if (voiceId && !/^[a-zA-Z0-9_-]{1,128}$/.test(voiceId)) throw new Error('ID de voz inválido.');
  const entries = narrationEntries(stored, document);
  const oldTextHashes = new Map(document.scenes.map(scene => [scene.id, sceneTextHash(scene)]));
  for (const scene of document.scenes) {
    const draft = drafts.get(scene.id);
    if (!draft) throw new Error('A lista de cenas mudou; recarregue o projeto antes de salvar.');
    scene.raw.narration = draft.narration;
    scene.audio.spokenText = draft.spokenText;
    scene.raw.audio = scene.audio;
    scene.narration = draft.narration;
    scene.spokenText = draft.spokenText;
  }
  const newHash = narrationHash(document.scenes, voiceId);
  const voiceChanged = stored.project.voiceId !== voiceId;
  const nextEntries: Record<string, NarrationAudioEntry> = {};
  const detached: string[] = [];
  for (const scene of document.scenes) {
    const entry = entries[scene.id];
    if (!entry) continue;
    const textChanged = oldTextHashes.get(scene.id) !== sceneTextHash(scene);
    if (textChanged || (voiceChanged && entry.source === 'elevenlabs')) {
      detached.push(entry.assetPath);
      delete scene.audio.narration;
      continue;
    }
    nextEntries[scene.id] = entry;
  }
  if (oldHash !== newHash) stored.narrationApproval = undefined;
  for (const path of detached) delete stored.approvals[path];
  stored.project.voiceId = voiceId;
  stored.narrationAudio = { scenes: nextEntries };
  stored.legacyNarrationAudio = undefined;
  await atomicJson(join(stored.project.path, 'storyboard.json'), document.data);
  await save(root, stored);
  for (const path of detached) await rm(join(stored.project.path, path), { force: true });
  return await narrationState(stored, services);
}
function narrationSceneId(payload: Record<string, unknown>): string {
  if (typeof payload.sceneId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(payload.sceneId)) throw new Error('Cena inválida.');
  return payload.sceneId;
}
/** Envia (arquivo ou gravação) o áudio próprio de uma cena. Só altera o projeto depois de copiar e validar o arquivo. */
async function attachNarrationAudio(root: string, payload: Record<string, unknown>, services: Services, local = false): Promise<NarrationState> {
  const stored = await editableProject(root, services, payload, 'video');
  const sceneId = narrationSceneId(payload);
  const source = parseNarrationAttachSource(payload.source);
  const document = await narrationDocument(stored);
  const scene = document.scenes.find(item => item.id === sceneId);
  if (!scene) throw new Error('Cena não encontrada no storyboard.');
  const staged = await stageNarrationAudio(source, services);
  const assetPath = `assets/audio/narration/${randomUUID()}/${sceneId}${staged.extension}`;
  const target = await localPath(stored.project.path, assetPath);
  try {
    await copyLocal(staged.path, target);
  } finally {
    await staged.release();
  }
  let storyboardCommitted = false;
  try {
    const entries = narrationEntries(stored, document);
    const previous = entries[sceneId];
    scene.audio.narration = { assetPath, startOffsetSeconds: 0, gain: 1 };
    scene.raw.audio = scene.audio;
    // atomicJson can throw after rename (e.g. directory fsync); retain the audio in that case.
    storyboardCommitted = true;
    await atomicJson(join(stored.project.path, 'storyboard.json'), document.data);
    const replacedPath = previous && previous.assetPath !== assetPath ? previous.assetPath : undefined;
    stored.narrationAudio = { scenes: { ...entries, [sceneId]: { assetPath, source: local ? 'local' : source.kind === 'file' ? 'upload' : 'recording', textHash: sceneTextHash(scene) } } };
    stored.legacyNarrationAudio = undefined;
    if (replacedPath) delete stored.approvals[replacedPath];
    await save(root, stored);
    if (replacedPath) await rm(join(stored.project.path, replacedPath), { force: true });
    return await narrationState(stored, services);
  } catch (error) {
    if (!storyboardCommitted) await rm(target, { force: true });
    throw error;
  }
}
async function generateLocalScene(root: string, stored: StoredProject, payload: Record<string, unknown>, services: Services): Promise<NarrationState> {
  if (stored.project.kind !== 'video') throw new Error('A narração só existe em projetos de vídeo.');
  if ((stored.narrationMode ?? 'narrated') !== 'narrated') throw new Error('Selecione o modo narrado antes de gerar áudio.');
  const sceneId = narrationSceneId(payload);
  const modelPath = text(payload, 'modelPath', 4096);
  const document = await narrationDocument(stored);
  const scene = document.scenes.find(item => item.id === sceneId);
  if (!scene) throw new Error('Cena não encontrada no storyboard.');
  if (!scene.narration.trim()) throw new Error('Escreva a narração da cena antes de gerar áudio.');
  const temp = await mkdtemp(join(tmpdir(), 'maquina-narracao-'));
  try {
    const outputPath = join(temp, 'scene.wav');
    await generateLocalNarration({ text: scene.narration, modelPath, outputPath });
    const latest = await narrationDocument(stored);
    const latestScene = latest.scenes.find(item => item.id === sceneId);
    if (!latestScene || sceneTextHash(latestScene) !== sceneTextHash(scene)) throw new Error('A narração mudou durante a geração; o áudio não foi anexado.');
    return await attachNarrationAudio(root, { projectId: stored.project.id, sceneId, source: { kind: 'file', path: outputPath } }, services, true);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
/** Remove o áudio de uma cena (volta ao estado sem áudio). Exige confirmação explícita. */
async function removeNarrationAudio(root: string, payload: Record<string, unknown>, services: Services): Promise<NarrationState> {
  const stored = await editableProject(root, services, payload, 'video');
  if (payload.confirm !== true) throw new Error('Confirme a remoção do áudio da cena.');
  const sceneId = narrationSceneId(payload);
  const document = await narrationDocument(stored);
  const scene = document.scenes.find(item => item.id === sceneId);
  if (!scene) throw new Error('Cena não encontrada no storyboard.');
  const entries = narrationEntries(stored, document);
  const entry = entries[sceneId];
  if (!entry && scene.audio.narration === undefined) throw new Error('A cena não tem áudio para remover.');
  const nextEntries = { ...entries };
  delete nextEntries[sceneId];
  delete scene.audio.narration;
  await atomicJson(join(stored.project.path, 'storyboard.json'), document.data);
  stored.narrationAudio = { scenes: nextEntries };
  stored.legacyNarrationAudio = undefined;
  if (entry) delete stored.approvals[entry.assetPath];
  await save(root, stored);
  if (entry) await rm(join(stored.project.path, entry.assetPath), { force: true });
  return await narrationState(stored, services);
}
function requireTaskIdle(services: Services, id: string): void {
  try { requireIdle(services, id); } catch { throw new Error('Há uma tarefa ativa para este projeto.'); }
}
async function editableProject(root: string, services: Services, payload: Record<string, unknown>, kind: Project['kind']): Promise<StoredProject> {
  const stored = await load(root, safeId(payload.projectId));
  if (stored.project.kind !== kind) throw new Error(kind === 'image' ? 'O texto por página só existe em projetos de imagem.' : 'O storyboard só existe em projetos de vídeo.');
  requireTaskIdle(services, stored.project.id);
  await requireNoPendingDeletion(root, services.dataDir, stored.project.id);
  await requireNoPendingAssetDeletion(root, services.dataDir, stored.project.id);
  return stored;
}
async function saveVisualText(root: string, payload: Record<string, unknown>, services: Services): Promise<ProjectDetail> {
  const stored = await editableProject(root, services, payload, 'image');
  const projectFile = await localPath(stored.project.path, 'project.json');
  const native = object(await readJson(projectFile), 'Projeto PostNow');
  if (!Array.isArray(native.pages)) throw new Error('Projeto sem páginas válidas.');
  const pages = native.pages.map((page, index) => object(page, `Página ${index + 1}`));
  const check = validateVisualTextPages(payload.pages, pages.length);
  if (check.errors.length) throw new Error(check.errors.join(' '));
  const drafts = payload.pages as VisualTextEditPage[];
  const claimsFile = await localPath(stored.project.path, 'research/claims.json');
  const claims = object(await readJson(claimsFile), 'Revisão de claims');
  const prompts: { path: string; content: string }[] = [];
  const nextPages: Record<string, unknown>[] = [];
  let textChanged = false;
  for (const [index, page] of pages.entries()) {
    const draft = drafts[index];
    if (typeof page.prompt_file !== 'string') throw new Error(`Página ${index + 1}: arquivo de arte ausente.`);
    const artPath = await localPath(stored.project.path, page.prompt_file);
    const currentArt = await readFile(artPath, 'utf8').catch(error => { if (missing(error)) throw new Error(`Página ${index + 1}: arquivo de arte não encontrado.`); throw error; });
    const fields = { headline: draft.headline.trim(), copy: draft.copy.trim(), depicted_person: draft.depictedPerson };
    const previous = { headline: typeof page.headline === 'string' ? page.headline : '', copy: typeof page.copy === 'string' ? page.copy : '' };
    const art = applyArtText(currentArt, previous, { headline: fields.headline, copy: fields.copy });
    if (art.missing.length) {
      const labels = art.missing.map(field => field === 'headline' ? 'a headline atual' : 'a copy atual').join(' e ');
      throw new Error(`Página ${index + 1}: não encontrei ${labels} no arquivo de arte, então a arte não acompanharia a mudança. Use Preparar textos para o agente refazer esta página.`);
    }
    if (Object.entries(fields).some(([key, value]) => page[key] !== value) || art.text !== currentArt) textChanged = true;
    if (art.text !== currentArt) prompts.push({ path: artPath, content: art.text });
    nextPages.push({ ...page, ...fields });
  }
  if (!textChanged) return detail(root, stored, services);
  if (native.editorial !== undefined) {
    const editorial = object(native.editorial, 'Aprovação editorial');
    if ('copy_approved' in editorial) editorial.copy_approved = false;
    if ('claims_reviewed' in editorial) editorial.claims_reviewed = false;
  }
  if ('reviewed' in claims) claims.reviewed = false;
  native.pages = nextPages;
  for (const prompt of prompts) await atomicText(prompt.path, prompt.content);
  await atomicJson(projectFile, native);
  await atomicJson(claimsFile, claims);
  stored.visualApproval = undefined;
  await save(root, stored);
  return detail(root, stored, services);
}
async function saveStoryboardText(root: string, payload: Record<string, unknown>, services: Services): Promise<ProjectDetail> {
  const stored = await editableProject(root, services, payload, 'video');
  const document = await narrationDocument(stored);
  const check = validateStoryboardScenes(payload.scenes, document.scenes.map(scene => scene.id));
  if (check.errors.length) throw new Error(check.errors.join(' '));
  for (const draft of payload.scenes as VisualTextEditScene[]) {
    const scene = document.scenes.find(entry => entry.id === draft.id);
    if (scene) scene.raw.onScreen = onScreenItems(draft.onScreen);
  }
  await atomicJson(join(stored.project.path, 'storyboard.json'), document.data);
  return detail(root, stored, services);
}
async function storyboardScenes(stored: StoredProject): Promise<{ scenes: { id: string; title: string; onScreen: string }[] }> {
  if (stored.project.kind !== 'video') throw new Error('O storyboard só existe em projetos de vídeo.');
  const document = await narrationDocument(stored);
  return { scenes: document.scenes.map(scene => ({ id: scene.id, title: scene.title, onScreen: onScreenText(scene.raw.onScreen) })) };
}
async function approveNarration(root: string, stored: StoredProject, services: Services, payload: Record<string, unknown>): Promise<NarrationState> {
  if (payload.approved !== true) throw new Error('A aprovação da narração precisa ser explícita.');
  if (!stored.project.voiceId) throw new Error('Selecione uma voz ElevenLabs antes de aprovar a narração.');
  const key = services.getElevenLabsKey();
  if (!key) throw new Error('Configure a API key ElevenLabs antes de aprovar a voz.');
  const voices = await listElevenLabsVoices(key);
  if (!voices.some((voice) => voice.id === stored.project.voiceId)) throw new Error('A voz escolhida não está mais disponível na conta ElevenLabs.');
  const { scenes } = await narrationDocument(stored);
  if (!scenes.some((scene) => scene.narration.trim())) throw new Error('Escreva a narração antes de aprová-la.');
  stored.narrationApproval = { hash: narrationHash(scenes, stored.project.voiceId), approvedAt: new Date().toISOString() };
  await save(root, stored);
  return await narrationState(stored, services) as NarrationState;
}
async function generateNarration(root: string, stored: StoredProject, services: Services, payload: Record<string, unknown>): Promise<unknown> {
  if (payload.confirm !== true) throw new Error('Confirme a geração ElevenLabs, que pode consumir créditos.');
  const key = services.getElevenLabsKey();
  if (!key) throw new Error('Configure a API key ElevenLabs antes de gerar áudio.');
  if (!stored.project.voiceId) throw new Error('Selecione uma voz ElevenLabs antes de gerar áudio.');
  const document = await narrationDocument(stored);
  const hash = narrationHash(document.scenes, stored.project.voiceId);
  if (stored.narrationApproval?.hash !== hash) throw new Error('A narração ou a voz mudou após a aprovação. Revise e aprove novamente antes de gerar áudio.');
  if (!document.scenes.some((scene) => scene.narration.trim())) throw new Error('Escreva a narração antes de gerar áudio.');
  // Check the installed engine before sending credentials or starting a paid operation.
  const engine = services.getSettings().enginePaths.videogo;
  if (!engine) throw new Error('VideoGo não está configurado. Instale ou vincule o motor em Configuração.');
  const cli = await localPath(await safePath(engine), 'dist/cli/index.js');
  if (!(await lstat(cli)).isFile()) throw new Error('VideoGo sem CLI compilada. Reinstale ou atualize o motor.');
  const node = await resolveTool('node', services);
  if (!node) throw new Error('Node.js não está instalado.');
  const capability = await services.capture(node, [cli, 'project', 'narration', '--help'], { cwd: engine, env: await toolEnvironment(services), timeoutMs: 20_000 });
  if (capability.code !== 0 || !['--generate-audio', '--voice', '--allow-paid'].every(option => capability.stdout.includes(option))) {
    throw new Error('O VideoGo instalado não suporta geração ElevenLabs por esta interface. Atualize o motor em Motores & Setup antes de gerar áudio.');
  }
  const voices = await listElevenLabsVoices(key);
  if (!voices.some((voice) => voice.id === stored.project.voiceId)) throw new Error('A voz escolhida não está mais disponível na conta ElevenLabs.');
  const storyboardPath = join(stored.project.path, 'storyboard.json');
  await secureStoryboard(storyboardPath, stored.project.path, undefined, { allowMissingNarration: true, allowMissingAssets: true });
  const brand = stored.project.brandId ? await brandAt(root, stored.project.brandId, services) : undefined;
  const profile = brand ? await writeBrandProfile(stored.project.path, brand, services) : undefined;
  const env = {
    ...await toolEnvironment(services),
    ELEVENLABS_API_KEY: key,
    ELEVENLABS_MODEL: 'eleven_v4',
    VIDEOGO_NO_VOICE_CACHE: '1',
    ...(profile ? { VIDEOGO_PROFILES_DIR: profile.profilesDirectory } : {}),
  };
  const job = await services.run({
    title: `VideoGo: gerar narração Eleven v4 — ${stored.project.title}`,
    executable: node,
    args: [cli, 'project', 'narration', storyboardPath, '--generate-audio', '--voice', stored.project.voiceId, '--allow-paid'],
    cwd: engine,
    env,
    projectId: stored.project.id,
    timeoutMs: 15 * 60 * 1000,
    onSuccess: async () => serialized(root, async () => {
      const latest = await load(root, stored.project.id);
      const latestDocument = await narrationDocument(latest);
      if (narrationHash(latestDocument.scenes, latest.project.voiceId) !== hash) throw new Error('A narração mudou durante a geração; os áudios não foram aprovados.');
      const entries: Record<string, NarrationAudioEntry> = {};
      for (const scene of latestDocument.scenes) {
        if (!scene.narration.trim()) continue;
        const attached = scene.audio.narration;
        if (!attached || typeof attached !== 'object' || !('assetPath' in attached) || typeof attached.assetPath !== 'string') throw new Error('O VideoGo terminou sem associar áudio às cenas narradas.');
        const path = await localPath(latest.project.path, attached.assetPath);
        if (!(await lstat(path)).isFile() || kinds[extname(path).toLowerCase()] !== 'audio') throw new Error('O VideoGo associou um asset de narração inválido.');
        entries[scene.id] = { assetPath: relative(latest.project.path, path).split('\\').join('/'), source: 'elevenlabs', textHash: sceneTextHash(scene) };
      }
      if (!Object.keys(entries).length) throw new Error('O VideoGo não gerou áudios para o roteiro aprovado.');
      const previous = narrationEntries(latest, latestDocument);
      const previousPaths = Object.entries(previous).filter(([id]) => entries[id] !== undefined).map(([, entry]) => entry.assetPath);
      const kept = new Set(Object.values(entries).map(entry => entry.assetPath));
      latest.narrationAudio = { scenes: { ...Object.fromEntries(Object.entries(previous).filter(([id]) => entries[id] === undefined)), ...entries } };
      latest.legacyNarrationAudio = undefined;
      for (const path of previousPaths) delete latest.approvals[path];
      await save(root, latest);
      // Caminho reutilizado pelo VideoGo já contém o áudio novo: apagá-lo destruiria o áudio pago.
      for (const path of previousPaths) if (!kept.has(path)) await rm(join(latest.project.path, path), { force: true });
      return previousPaths.length
        ? 'Áudios gerados e associados às cenas. Os uploads das cenas narradas foram substituídos. Revise e aprove cada áudio antes do render.'
        : 'Áudios gerados e associados às cenas. Revise e aprove cada áudio antes do render.';
    }),
  });
  void services.waitJob(job.id).then(() => services.emit({ type: 'refresh' })).catch(() => undefined);
  return job;
}
async function recoverPendingDeletions(root: string, services: Services): Promise<RecoveredDeletion[]> {
  if (!(await hasPendingDeletions(root, services.dataDir))) return [];
  return serialized(root, async () => {
    const recovered = await recoverDeletions(root, services.dataDir, async id => { requireIdle(services, id); await services.forgetProjectJobs(id); });
    for (const done of recovered) services.revokeMedia(done.folder);
    return recovered;
  });
}
export async function listProjects(services: Services): Promise<Project[]> {
  const root = await workspace(services);
  await recoverPendingDeletions(root, services);
  await recoverPendingAssetDeletions(root, services);
  return serialized(root, async () => {
    const projects: Project[] = [];
    for (const id of await ids(root, 'projects')) {
      const project = (await load(root, id)).project;
      const coverUrl = await projectCoverUrl(project, services);
      projects.push(coverUrl ? { ...project, coverUrl } : project);
    }
    return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}
export async function readProject(id: string, services: Services): Promise<Project> { return (await load(await workspace(services), safeId(id))).project; }
async function deletionInventory(root: string, stored: StoredProject, services: Services): Promise<DeletionInventory> {
  const folder = await localPath(root, join('projects', stored.folderName));
  if (!(await lstat(folder)).isDirectory()) throw new Error('A pasta do projeto não é um diretório regular.');
  return buildInventory(root, services.dataDir, stored.project.id, stored.project.title, folder);
}
async function deleteProject(root: string, stored: StoredProject, payload: Record<string, unknown>, services: Services): Promise<{ deleted: true; id: string }> {
  if (payload.confirm !== true) throw new Error('A exclusão permanente exige confirmação explícita.');
  if (text(payload, 'confirmTitle', 200) !== stored.project.title) throw new Error('Digite exatamente o nome do projeto para confirmar a exclusão.');
  requireIdle(services, stored.project.id);
  const release = reserveProject(stored.project.id);
  try {
    const inventory = await deletionInventory(root, stored, services);
    await executeDeletion(root, services.dataDir, inventory, async id => services.forgetProjectJobs(id));
    services.revokeMedia(inventory.folder);
    return { deleted: true, id: stored.project.id };
  } finally { release(); }
}
const IMAGE_BATCH_ID = /^[0-9]{13}-[a-f0-9]{8}$/;
const ASSET_DELETION_DIRECTORY = 'asset-deletions';
function safeJournalPath(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || value.length > 4000 || value.includes('\\') || value.startsWith('/') || /^[a-z]:/i.test(value) ||
      value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`${label} inválido; exclusão preservada.`);
  return value;
}
function parseAssetDeletionJournal(value: unknown): AssetDeletionJournal {
  const raw = object(value, 'Exclusão de imagem pendente');
  if (raw.schema !== 'maquina.asset-deletion/v1' || typeof raw.sourceFound !== 'boolean' || !Array.isArray(raw.targets) || !raw.targets.length) {
    throw new Error('Registro de exclusão de imagem inválido; preservado para recuperação.');
  }
  const projectId = safeId(raw.projectId);
  const assetKey = safeJournalPath(raw.assetKey, 'Imagem');
  let batchId: string | undefined;
  if (raw.batchId !== undefined) {
    if (typeof raw.batchId !== 'string' || !IMAGE_BATCH_ID.test(raw.batchId)) throw new Error('Rodada inválida no registro de exclusão; preservado.');
    batchId = raw.batchId;
  }
  let page: MappedImagePage | undefined;
  if (raw.page !== undefined) {
    const item = object(raw.page, 'Página mapeada');
    const input = safeJournalPath(item.input, 'Imagem-fonte');
    const output = safeJournalPath(item.output, 'Imagem final');
    if (!Number.isInteger(item.page) || typeof item.page !== 'number' || basename(input) !== input || basename(output) !== output ||
        !postNowImageExtensions[extname(input).toLowerCase()] || (item.native !== undefined && (typeof item.native !== 'string' || basename(item.native) !== item.native))) {
      throw new Error('Página mapeada inválida; registro de exclusão preservado.');
    }
    page = { page: item.page, input, output, ...(typeof item.native === 'string' ? { native: item.native } : {}) };
  }
  if (batchId) {
    const match = assetKey.match(/^generated\/runs\/([0-9]{13}-[a-f0-9]{8})\/slide-(\d{2})\.png$/);
    if (!match || match[1] !== batchId || (page && (page.page !== Number(match[2]) || page.output !== basename(assetKey)))) {
      throw new Error('Imagem e rodada divergem no registro de exclusão; preservado.');
    }
  } else if (page) throw new Error('Página mapeada sem rodada; registro de exclusão preservado.');
  const targets = raw.targets.map((entry: unknown) => {
    const target = object(entry, 'Alvo de exclusão');
    if (target.scope !== 'project' && target.scope !== 'postnow') throw new Error('Escopo de exclusão inválido; preservado.');
    return { scope: target.scope, path: safeJournalPath(target.path, 'Caminho de exclusão') } as AssetDeletionTarget;
  });
  if (new Set(targets.map(target => `${target.scope}\0${target.path}`)).size !== targets.length ||
      !targets.some(target => target.scope === 'project' && target.path === assetKey)) {
    throw new Error('Alvos duplicados ou sem a imagem final; exclusão preservada.');
  }
  return { schema: 'maquina.asset-deletion/v1', projectId, assetKey, ...(batchId ? { batchId } : {}), ...(page ? { page } : {}), sourceFound: raw.sourceFound, targets };
}
function sameMappedPage(left: MappedImagePage | undefined, right: MappedImagePage | undefined): boolean {
  return left === undefined ? right === undefined : right !== undefined &&
    left.page === right.page && left.input === right.input && left.output === right.output && left.native === right.native;
}
async function mappedImagePageForDeletion(stored: StoredProject, batchId: string, assetKey: string): Promise<MappedImagePage | undefined> {
  const match = assetKey.match(/^generated\/runs\/([0-9]{13}-[a-f0-9]{8})\/slide-(\d{2})\.png$/);
  if (!match || match[1] !== batchId) throw new Error('Imagem não corresponde à rodada PostNow; nada foi apagado.');
  const runPath = await localPath(stored.project.path, join('generated', 'runs', batchId));
  const manifestPath = await localPath(runPath, '.mapping.json');
  const manifest = await readJson(manifestPath).catch(error => { if (missing(error)) return undefined; throw error; });
  if (manifest === undefined) return undefined;
  const document = object(manifest, 'Mapeamento da rodada');
  if (!Array.isArray(document.pages)) throw new Error('Mapeamento de imagens inválido; nada foi apagado.');
  const native = object(await readJson(await localPath(stored.project.path, 'project.json')), 'Projeto PostNow');
  const format = postNowFormatOf(stored.project);
  const type = POSTNOW_FORMATS[format].kind;
  if ((native.format !== undefined && native.format !== format) || (native.type !== undefined && native.type !== type)) throw new Error('O formato do mapeamento difere do projeto; nada foi apagado.');
  const count = Number(native.page_count);
  if (!postNowFormatAcceptsPageCount(format, count) || document.pages.length !== count) {
    throw new Error('Quantidade de páginas divergente no mapeamento; nada foi apagado.');
  }
  const pages = document.pages.map((entry: unknown, index: number): MappedImagePage => {
    const item = object(entry, `Mapeamento da página ${index + 1}`);
    const expectedOutput = `slide-${String(index + 1).padStart(2, '0')}.png`;
    if (item.page !== index + 1 || item.output !== expectedOutput || typeof item.input !== 'string' || basename(item.input) !== item.input ||
        !postNowImageExtensions[extname(item.input).toLowerCase()]) throw new Error(`Mapeamento da página ${index + 1} inconsistente; nada foi apagado.`);
    const numberedInput = item.input.match(/^slide-(\d+)\./i);
    if (numberedInput && Number(numberedInput[1]) !== index + 1) throw new Error(`A página ${index + 1} aponta para outra imagem-fonte; nada foi apagado.`);
    const nativeName = postNowNativeImageName(format, index + 1, count);
    if (item.native !== undefined && (typeof item.native !== 'string' || item.native !== nativeName)) throw new Error(`A página ${index + 1} aponta para outro arquivo nativo; nada foi apagado.`);
    return { page: index + 1, input: item.input, output: expectedOutput, ...(typeof item.native === 'string' ? { native: item.native } : {}) };
  });
  const page = pages[Number(match[2]) - 1];
  if (!page || page.output !== basename(assetKey)) throw new Error('A página, saída e fonte não correspondem; nada foi apagado.');
  return page;
}
async function resolveAssetDeletionTarget(dataDir: string, stored: StoredProject, journal: AssetDeletionJournal, target: AssetDeletionTarget): Promise<string> {
  if (target.scope === 'project') {
    const allowed = new Set([journal.assetKey]);
    if (journal.batchId && journal.page) {
      allowed.add(`generated/runs/${journal.batchId}/.input/${journal.page.input}`);
      allowed.add(`generated/runs/${journal.batchId}/.conformed/${basename(journal.assetKey)}`);
    }
    if (!allowed.has(target.path)) throw new Error('Alvo interno não corresponde à imagem mapeada; exclusão preservada.');
    return localPath(stored.project.path, target.path);
  }
  if (!journal.batchId || !journal.page?.native) throw new Error('Espelho PostNow sem página proprietária; exclusão preservada.');
  const parts = target.path.split('/');
  if (parts.length < 6 || parts[0] !== 'clients' || parts[2] !== 'projects' ||
      !parts[1] || !PROJECT_FOLDER_NAME.test(parts[1]) || !parts[3] || !PROJECT_FOLDER_NAME.test(parts[3]) || !parts[3].endsWith(`-${journal.batchId}`)) {
    throw new Error('Caminho do espelho PostNow inválido; exclusão preservada.');
  }
  const relativeFile = parts.slice(4).join('/');
  const allowedFiles = new Set([`generated/${journal.page.native}`, 'qa/contact-sheet.jpg', 'qa/contact-sheet.json', 'qa/approval.json']);
  if (!allowedFiles.has(relativeFile)) throw new Error('Arquivo PostNow fora do escopo da página; exclusão preservada.');
  const nativeRoot = join(dataDir, 'engine-data', 'postnow');
  const mirror = await localPath(nativeRoot, parts.slice(0, 4).join('/'));
  const ownerPath = await localPath(mirror, '.studio-owner.json');
  const owner = await readJson(ownerPath).catch(error => { if (missing(error)) return undefined; throw error; });
  const targetPath = await localPath(nativeRoot, target.path);
  const info = await lstat(targetPath).catch(error => { if (missing(error)) return undefined; throw error; });
  if (owner === undefined) {
    if (info) throw new Error('O espelho PostNow perdeu a prova de propriedade; arquivo preservado.');
    return targetPath;
  }
  const record = object(owner, 'Proprietário do espelho');
  if (record.projectId !== stored.project.id || record.batchId !== journal.batchId) throw new Error('O espelho PostNow pertence a outro projeto; arquivo preservado.');
  if (info && (!info.isFile() || info.isSymbolicLink())) throw new Error('Arquivo do espelho PostNow inválido; exclusão preservada.');
  return targetPath;
}
function validateAssetDeletionKey(stored: StoredProject, journal: AssetDeletionJournal): void {
  const key = journal.assetKey;
  if (journal.batchId) {
    if (stored.project.kind !== 'image' || !/^generated\/runs\/[0-9]{13}-[a-f0-9]{8}\/slide-\d{2}\.png$/.test(key)) throw new Error('Imagem e projeto não correspondem ao registro de exclusão.');
  } else if (stored.project.kind === 'image') {
    if (!key.startsWith('generated/') || key.split('/').some(part => part.startsWith('.')) || kinds[extname(key).toLowerCase()] !== 'image') throw new Error('Imagem PostNow fora da pasta de geração; exclusão preservada.');
  } else if (!key.startsWith('assets/visuals/generated/') || key.split('/').length !== 4 || kinds[extname(key).toLowerCase()] !== 'image') {
    throw new Error('Imagem VideoGo fora da pasta de geração; exclusão preservada.');
  }
}
async function finishAssetDeletion(root: string, dataDir: string, journalPath: string, journal: AssetDeletionJournal, current?: StoredProject): Promise<void> {
  const stored = current ?? await load(root, journal.projectId);
  if (stored.project.id !== journal.projectId) throw new Error('Projeto do registro de exclusão divergente; preservado.');
  await requireNoPendingDeletion(root, dataDir, journal.projectId);
  validateAssetDeletionKey(stored, journal);
  if (journal.batchId) {
    const mapped = await mappedImagePageForDeletion(stored, journal.batchId, journal.assetKey);
    if (!sameMappedPage(mapped, journal.page)) throw new Error('O mapeamento mudou durante a exclusão; arquivos relacionados foram preservados.');
  }
  const paths = new Set<string>();
  for (const target of journal.targets) paths.add(await resolveAssetDeletionTarget(dataDir, stored, journal, target));
  for (const path of paths) {
    const info = await lstat(path).catch(error => { if (missing(error)) return undefined; throw error; });
    if (!info) continue;
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Alvo de exclusão deixou de ser um arquivo regular: ${path}`);
  }
  for (const path of paths) await unlink(path).catch(error => { if (!missing(error)) throw error; });
  if (journal.batchId) {
    const message = journal.sourceFound
      ? 'A imagem e sua fonte mapeada foram apagadas; a rodada foi invalidada. Crie uma nova rodada.'
      : 'A imagem final foi apagada sem remover uma fonte sem vínculo seguro; a rodada foi invalidada. Crie uma nova rodada.';
    await writeBatchStatus(stored.project.path, journal.batchId, { state: 'failed', message });
  }
  delete stored.approvals[journal.assetKey];
  await save(root, stored);
  await safePath(journalPath);
  await rm(journalPath);
}
async function executeAssetDeletion(root: string, dataDir: string, services: Services, input: AssetDeletionJournal, stored: StoredProject): Promise<void> {
  const journal = parseAssetDeletionJournal(input);
  requireIdle(services, journal.projectId);
  const release = reserveProject(journal.projectId);
  try {
    await requireNoPendingDeletion(root, dataDir, journal.projectId);
    await requireNoPendingAssetDeletion(root, dataDir, journal.projectId);
    validateAssetDeletionKey(stored, journal);
    if (journal.batchId) {
      const mapped = await mappedImagePageForDeletion(stored, journal.batchId, journal.assetKey);
      if (!sameMappedPage(mapped, journal.page)) throw new Error('O mapeamento mudou antes da exclusão; nada foi apagado.');
    }
    for (const target of journal.targets) {
      const path = await resolveAssetDeletionTarget(dataDir, stored, journal, target);
      const info = await lstat(path).catch(error => { if (missing(error)) return undefined; throw error; });
      if (info && (!info.isFile() || info.isSymbolicLink())) throw new Error(`Alvo de exclusão inválido; nada foi apagado: ${path}`);
    }
    const journalDirectory = await privateWorkspaceDirectory(dataDir, root, ASSET_DELETION_DIRECTORY);
    const journalPath = await localPath(journalDirectory, `${journal.projectId}-${randomUUID()}.json`);
    await atomicJson(journalPath, journal);
    try { await finishAssetDeletion(root, dataDir, journalPath, journal, stored); }
    catch (error) {
      services.emit({ type: 'refresh' });
      throw new Error(`Exclusão incompleta; a recuperação será repetida ao atualizar o projeto. ${error instanceof Error ? error.message : String(error)}`);
    }
  } finally { release(); }
}
export async function recoverPendingAssetDeletions(root: string, services: Services): Promise<void> {
  const directoryPath = await privateWorkspaceDirectory(services.dataDir, root, ASSET_DELETION_DIRECTORY);
  await serialized(root, async () => {
    const names = await readdir(directoryPath).catch(error => { if (missing(error)) return []; throw error; });
    for (const name of names.filter(item => item.endsWith('.json')).sort()) {
      const journalPath = await localPath(directoryPath, name);
      const journal = parseAssetDeletionJournal(await readJson(journalPath));
      const suffix = name.slice(journal.projectId.length + 1, -5);
      if (name !== `${journal.projectId}-${suffix}.json` || !UUID.test(suffix)) throw new Error(`Nome de journal de mídia inválido; preservado: ${name}`);
      requireIdle(services, journal.projectId);
      const release = reserveProject(journal.projectId);
      try { await finishAssetDeletion(root, services.dataDir, journalPath, journal); }
      finally { release(); }
    }
  });
}
async function deleteProjectAsset(root: string, stored: StoredProject, payload: Record<string, unknown>, services: Services): Promise<ProjectDetail> {
  if (payload.confirm !== true) throw new Error('Confirme a exclusão permanente da imagem.');
  const path = await localPath(stored.project.path, text(payload, 'path', 4000));
  const key = relative(stored.project.path, path).split('\\').join('/');
  const isImage = kinds[extname(path).toLowerCase()] === 'image';
  const inGeneratedArea = stored.project.kind === 'image' ? key.startsWith('generated/') : key.startsWith('assets/visuals/generated/');
  if (!isImage || !inGeneratedArea || key.split('/').some(part => part.startsWith('.'))) throw new Error('Só imagens geradas dentro da pasta de geração do projeto podem ser apagadas.');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('A imagem não é um arquivo regular.');
  const targets = new Set<string>([path]);
  const includeExistingFile = async (candidate: string): Promise<void> => {
    try {
      const candidateInfo = await lstat(candidate);
      if (!candidateInfo.isFile() || candidateInfo.isSymbolicLink()) throw new Error(`Arquivo relacionado inválido; nada foi apagado: ${candidate}`);
      targets.add(candidate);
    } catch (error) { if (!missing(error)) throw error; }
  };
  const batchMatch = key.match(/^generated\/runs\/([0-9]{13}-[a-f0-9]{8})\/slide-(\d{2})\.png$/);
  if (stored.project.kind === 'image' && key.startsWith('generated/runs/') && !batchMatch) throw new Error('Só saídas PNG finais e numeradas de uma rodada PostNow podem ser excluídas.');
  let batchId: string | undefined;
  let page: MappedImagePage | undefined;
  let sourceFound = false;
  if (batchMatch?.[1]) {
    batchId = batchMatch[1];
    page = await mappedImagePageForDeletion(stored, batchId, key);
    const runPath = await localPath(stored.project.path, join('generated', 'runs', batchId));
    if (page) {
      const source = await localPath(runPath, join('.input', page.input));
      await includeExistingFile(source);
      sourceFound = targets.has(source);
      if (page.native) {
        const mirrors = await findNativeCopies(services.dataDir, new Set([batchId]), stored.project.id);
        for (const mirror of mirrors) {
          for (const file of [join('generated', page.native), 'qa/contact-sheet.jpg', 'qa/contact-sheet.json', 'qa/approval.json']) {
            await includeExistingFile(await localPath(mirror, file));
          }
        }
      }
    }
    await includeExistingFile(await localPath(runPath, join('.conformed', basename(path))));
  }
  const nativeRoot = join(services.dataDir, 'engine-data', 'postnow');
  const targetRecords = [...targets].map(target => {
    if (inside(stored.project.path, target)) return { scope: 'project' as const, path: relative(stored.project.path, target).split('\\').join('/') };
    if (inside(nativeRoot, target)) return { scope: 'postnow' as const, path: relative(nativeRoot, target).split('\\').join('/') };
    throw new Error('Um arquivo relacionado está fora das pastas autorizadas; nada foi apagado.');
  });
  const journal: AssetDeletionJournal = {
    schema: 'maquina.asset-deletion/v1', projectId: stored.project.id, assetKey: key,
    ...(batchId ? { batchId } : {}), ...(page ? { page } : {}), sourceFound, targets: targetRecords,
  };
  await executeAssetDeletion(root, services.dataDir, services, journal, stored);
  return detail(root, stored, services);
}
export async function requireNoPendingAssetDeletion(root: string, dataDir: string, id: string): Promise<void> {
  const directoryPath = await privateWorkspaceDirectory(dataDir, root, ASSET_DELETION_DIRECTORY);
  const names = await readdir(directoryPath);
  if (names.some(name => name.startsWith(`${safeId(id)}-`) && name.endsWith('.json'))) throw new Error('Este projeto possui uma exclusão de imagem pendente; atualize para concluir a recuperação.');
}
/** "Usar como base": carries guidelines only. Media, copy, claims, approvals, audio and logs never travel. */
async function cloneProject(root: string, stored: StoredProject, payload: Record<string, unknown>): Promise<StoredProject> {
  const kind = payload.kind === undefined ? stored.project.kind : projectKind(payload.kind);
  const sameEngine = kind === stored.project.kind;
  const format = payload.format === undefined ? (sameEngine ? stored.project.format : undefined) : payload.format;
  const brief = payload.brief === undefined ? stored.project.brief : freeText(payload, 'brief');
  const created = await create(root, { title: text(payload, 'title', 200), kind, format, brief, brandId: stored.project.brandId });
  created.project.sourceProjectId = stored.project.id;
  try {
    if (payload.copyNotes !== false) created.notes = stored.notes;
    if (!sameEngine) return created;
    const nativeName = kind === 'video' ? 'storyboard.json' : 'project.json';
    const source = object(await readJson(await localPath(stored.project.path, nativeName)), 'Projeto base');
    const targetPath = await localPath(created.project.path, nativeName);
    const target = object(await readJson(targetPath), 'Projeto novo');
    const portable = kind === 'video' ? ['audience', 'tone', 'style', 'language'] : ['audience', 'safe_area_percent'];
    for (const key of portable) if (source[key] !== undefined) target[key] = source[key];
    await atomicJson(targetPath, target);
    if (kind === 'video' && stored.project.voiceId) created.project.voiceId = stored.project.voiceId;
    return created;
  } catch (error) { await rm(created.project.path, { recursive: true, force: true }); throw error; }
}
async function brandAt(root: string, id: string, services?: Services): Promise<Brand> {
  const value = object(await readJson(join(root, '.studio', 'brands', `${safeId(id)}.json`)), 'Marca');
  if (value.id !== id || typeof value.name !== 'string' || typeof value.tone !== 'string' || !Array.isArray(value.colors) || !value.colors.every((color) => typeof color === 'string')) throw new Error('Registro de marca inválido; original preservado.');
  const brand: Brand = { id, name: value.name, tone: value.tone, colors: value.colors as string[], references: [] };
  if (value.logo !== undefined) {
    if (typeof value.logo !== 'string') throw new Error('Logo inválida.');
    brand.logo = await localPath(join(root, 'brands', id), value.logo);
    if (!(await lstat(brand.logo)).isFile()) throw new Error('Logo da marca não encontrada.');
    if (services) brand.logoUrl = services.assetUrl(brand.logo);
  }
  if (Array.isArray(value.references)) {
    for (const raw of value.references) {
      const entry = object(raw, 'Referência da marca');
      const refId = safeId(entry.id);
      const refName = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Referência';
      if (typeof entry.path !== 'string') throw new Error('Caminho de referência inválido.');
      const refPath = await localPath(join(root, 'brands', id), entry.path);
      if (!(await lstat(refPath)).isFile()) continue;
      const kind = refKinds[extname(refPath).toLowerCase()];
      if (!kind) continue;
      brand.references.push({ id: refId, name: refName, path: refPath, kind, url: services ? services.assetUrl(refPath) : '' });
    }
  }
  return brand;
}
export async function listBrands(services: Services): Promise<Brand[]> {
  const root = await workspace(services);
  const brands: Brand[] = [];
  for (const id of await ids(root, 'brands')) brands.push(await brandAt(root, id, services));
  return brands.sort((a, b) => a.name.localeCompare(b.name));
}
interface InternalVisualReview extends VisualGenerationReview { contentHash: string; }
async function buildVisualReview(stored: StoredProject, services: Services): Promise<InternalVisualReview> {
  const blocking: string[] = [];
  if (stored.formatAdaptation) blocking.push('Adapte os textos ao novo formato antes de aprovar ou gerar imagens.');
  const projectPath = await localPath(stored.project.path, 'project.json');
  const claimsPath = await localPath(stored.project.path, 'research/claims.json');
  const storyboardPath = await localPath(stored.project.path, 'storyboard.md');
  const native = object(await readJson(projectPath), 'Projeto PostNow');
  const claimsDocument = object(await readJson(claimsPath), 'Claims PostNow');
  const rawPages = Array.isArray(native.pages) ? native.pages : [];
  const pages: InternalVisualReview['pages'] = [];
  const promptContents: { path: string; content: string }[] = [];
  for (const [index, raw] of rawPages.entries()) {
    const page = object(raw, `Página ${index + 1}`);
    const promptFile = typeof page.prompt_file === 'string' ? page.prompt_file : '';
    let prompt = '';
    if (!promptFile) blocking.push(`Página ${index + 1}: arquivo de arte não definido.`);
    else {
      const path = await localPath(stored.project.path, promptFile);
      try {
        if (!(await lstat(path)).isFile()) throw new Error('não é arquivo');
        prompt = await readFile(path, 'utf8');
        promptContents.push({ path: promptFile, content: prompt });
      } catch { blocking.push(`Página ${index + 1}: arquivo de arte ausente ou ilegível. Use Preparar textos para o agente refazer esta página.`); }
    }
    const copy = typeof page.copy === 'string' ? page.copy : '';
    const visualFunction = typeof page.visual_function === 'string' ? page.visual_function : '';
    const headline = typeof page.headline === 'string' ? page.headline : '';
    if (!copy.trim()) blocking.push(`Página ${index + 1}: copy vazia.`);
    if (!visualFunction.trim()) blocking.push(`Página ${index + 1}: função visual vazia. Use Preparar textos para o agente refazer esta página.`);
    if (copy.trim() && visualFunction.trim() && (!prompt.includes(copy) || !prompt.includes(visualFunction))) blocking.push(`Página ${index + 1}: a copy ou a função visual não está no arquivo de arte. Use Preparar textos para o agente refazer esta página.`);
    const depictedPerson = typeof page.depicted_person === 'string' ? page.depicted_person : '';
    if (!isDepictedPerson(depictedPerson)) blocking.push(`Página ${index + 1}: defina quem aparece na arte (Ninguém, Outra pessoa ou Cliente (retrato aprovado)).`);
    pages.push({ page: index + 1, headline, copy, depictedPerson });
  }
  if (claimsDocument.reviewed !== undefined && typeof claimsDocument.reviewed !== 'boolean') blocking.push('research/claims.json: "reviewed" precisa ser true ou false.');
  if (!Array.isArray(claimsDocument.claims)) blocking.push('research/claims.json precisa conter a lista "claims".');
  const rawClaims = Array.isArray(claimsDocument.claims) ? claimsDocument.claims : [];
  const claims = rawClaims.map((raw, index) => {
    const claim = object(raw, `Claim ${index + 1}`);
    let source = '';
    let sourceUrl = typeof claim.source_url === 'string' ? claim.source_url : typeof claim.sourceUrl === 'string' ? claim.sourceUrl : '';
    if (typeof claim.source === 'string') {
      source = claim.source;
    } else if (Array.isArray(claim.source) && claim.source.length > 0) {
      const titles: string[] = [];
      for (const item of claim.source) {
        if (typeof item === 'string' && item.trim()) titles.push(item.trim());
        else if (typeof item === 'object' && item !== null) {
          const rec = item as Record<string, unknown>;
          const t = typeof rec.title === 'string' ? rec.title.trim() : typeof rec.organization === 'string' ? rec.organization.trim() : '';
          if (t) titles.push(t);
          if (!sourceUrl && typeof rec.url === 'string' && rec.url.trim()) sourceUrl = rec.url.trim();
        }
      }
      source = titles.join('; ');
    } else if (typeof claim.source === 'object' && claim.source !== null) {
      const srcRec = claim.source as Record<string, unknown>;
      source = typeof srcRec.title === 'string' ? srcRec.title.trim() : typeof srcRec.organization === 'string' ? srcRec.organization.trim() : '';
      if (!sourceUrl && typeof srcRec.url === 'string' && srcRec.url.trim()) sourceUrl = srcRec.url.trim();
    }
    const qualification = typeof claim.qualification === 'string' ? claim.qualification : '';
    const value = {
      id: typeof claim.id === 'string' ? claim.id : `claim-${index + 1}`,
      claim: typeof claim.claim === 'string' ? claim.claim : '',
      source,
      sourceUrl,
      qualification,
    };
    if (!value.claim.trim() || !value.source.trim()) blocking.push(`Claim ${index + 1}: afirmação e fonte são obrigatórias.`);
    if (!['approved', 'qualified'].includes(String(claim.status))) blocking.push(`Claim ${index + 1}: somente afirmações aprovadas ou qualificadas podem seguir para a geração.`);
    if (claim.status === 'qualified' && !value.qualification.trim()) blocking.push(`Claim ${index + 1}: informe a ressalva para a afirmação qualificada.`);
    return value;
  });
  if (!claims.length) blocking.push('Inclua as afirmações e fontes usadas no conteúdo.');
  let storyboardContent = '';
  try {
    if (!(await lstat(storyboardPath)).isFile()) blocking.push('O storyboard editorial está ausente.');
    else {
      storyboardContent = await readFile(storyboardPath, 'utf8');
      if (!storyboardContent.trim()) blocking.push('O storyboard editorial está vazio.');
    }
  } catch { blocking.push('O storyboard editorial está ausente.'); }
  const brand = stored.project.brandId ? (await listBrands(services)).find(item => item.id === stored.project.brandId) : undefined;
  if (!brand?.logo || !brand.logo.toLowerCase().endsWith('.png')) blocking.push('Cadastre uma logo oficial PNG na marca antes de gerar.');
  let logoHash = '';
  if (brand?.logo) {
    try {
      const logoPath = await safePath(brand.logo);
      const logo = await readFile(logoPath);
      logoHash = createHash('sha256').update(logo).digest('hex');
    } catch { blocking.push('A logo oficial cadastrada não está acessível.'); }
  }
  const referenceHashes: { id: string; name: string; kind: string; sha256: string }[] = [];
  for (const reference of brand?.references ?? []) {
    try {
      const path = await safePath(reference.path);
      referenceHashes.push({ id: reference.id, name: reference.name, kind: reference.kind, sha256: (await fingerprint(path)).sha256 });
    } catch { blocking.push(`A referência de marca “${reference.name}” não está acessível.`); }
  }
  const formatRemoved = stored.project.unsupportedFormat !== undefined;
  if (formatRemoved) blocking.push('O formato escolhido foi removido do app; escolha outro formato no Studio.');
  // Formato removido: selectedFormat é só o padrão de dimensões; checagens que dependem do formato são puladas.
  const selectedFormat: PostNowFormatId = isPostNowFormat(stored.project.format) ? stored.project.format : DEFAULT_POSTNOW_FORMAT;
  const nativeType = POSTNOW_FORMATS[selectedFormat].kind;
  if (!formatRemoved) {
    if (native.format !== selectedFormat) blocking.push('O formato nativo difere do formato selecionado no projeto.');
    if (native.type !== nativeType) blocking.push('O tipo nativo difere do formato selecionado no projeto.');
    const requiredFields = ['title', 'audience', 'objective', ...(nativeType === 'carousel' ? ['promise', 'cta'] : [])];
    for (const field of requiredFields) if (postNowFieldMissing(native[field])) blocking.push(`Preencha project.json: ${field}.`);
    const pageRange = pagesRangeFor(nativeType);
    if (!postNowFormatAcceptsPageCount(selectedFormat, pages.length)) blocking.push(pageRange.min === pageRange.max ? `O formato ${selectedFormat} exige exatamente uma página.` : `Um carrossel PostNow precisa ter de ${pageRange.min} a ${pageRange.max} páginas.`);
  }
  if (pages.length !== Number(native.page_count) || pages.length < 1) blocking.push('A quantidade de páginas nativas não confere com o roteiro.');
  const portraitApproved = brand ? (await approvedPortraitAt(await postnowHome(services), brand)) !== undefined : false;
  if (brand && !formatRemoved) {
    blocking.push(...portraitPlanIssues(nativeType, pages.map(page => page.depictedPerson), portraitApproved));
    blocking.push(...portraitDiversityIssues(nativeType, rawPages.map(p => ({ visualFunction: typeof (p as Record<string, unknown>).visual_function === 'string' ? (p as Record<string, unknown>).visual_function as string : undefined }))));
  }
  const projectForHash = { ...native };
  delete projectForHash.editorial;
  const claimsForHash = { ...claimsDocument };
  delete claimsForHash.reviewed;
  const contentHash = createHash('sha256').update(JSON.stringify({
    project: projectForHash,
    brief: stored.project.brief,
    notes: stored.notes,
    format: stored.project.format,
    brand: brand ? { id: brand.id, name: brand.name, tone: brand.tone, colors: brand.colors, references: referenceHashes } : null,
    claims: claimsForHash,
    storyboardContent,
    prompts: promptContents.sort((a, b) => a.path.localeCompare(b.path)),
    logoHash,
  })).digest('hex');
  const editorials = object(native.editorial ?? {}, 'Aprovação editorial');
  const approved = !stored.formatAdaptation && stored.visualApproval?.hash === contentHash
    && editorials.copy_approved === true
    && editorials.claims_reviewed === true
    && claimsDocument.reviewed === true;
  const canvas = formatCanvas(selectedFormat);
  return {
    ready: blocking.length === 0,
    approved,
    ...(approved && stored.visualApproval ? { approvedAt: stored.visualApproval.approvedAt } : {}),
    blocking,
    format: selectedFormat,
    width: canvas.width,
    height: canvas.height,
    pages,
    claims,
    contentHash,
  };
}
async function approveVisualContent(root: string, stored: StoredProject, payload: Record<string, unknown>, services: Services): Promise<ProjectDetail> {
  if (payload.approved !== true) throw new Error('A aprovação editorial precisa ser explícita.');
  if (stored.formatAdaptation) throw new Error('Adapte os textos ao novo formato antes de aprovar ou gerar imagens.');
  const expectedHash = text(payload, 'contentHash', 64);
  const review = await buildVisualReview(stored, services);
  if (expectedHash !== review.contentHash) throw new Error('O conteúdo mudou depois da revisão. Recarregue e revise novamente antes de aprovar.');
  if (!review.ready) throw new Error(`Ainda não é seguro aprovar a geração: ${review.blocking.join(' ')}`);
  const nativePath = await localPath(stored.project.path, 'project.json');
  const claimsPath = await localPath(stored.project.path, 'research/claims.json');
  const native = object(await readJson(nativePath), 'Projeto PostNow');
  const claims = object(await readJson(claimsPath), 'Claims PostNow');
  const editorial = object(native.editorial ?? {}, 'Aprovação editorial');
  native.editorial = { ...editorial, copy_approved: true, claims_reviewed: true };
  claims.reviewed = true;
  await atomicJson(nativePath, native);
  await atomicJson(claimsPath, claims);
  const approvedReview = await buildVisualReview(stored, services);
  stored.visualApproval = { hash: approvedReview.contentHash, approvedAt: new Date().toISOString() };
  await save(root, stored);
  return detail(root, stored, services);
}
/** Aprovação editorial só vale para o conteúdo aprovado no Studio: flags escritas fora dele são zeradas na leitura. */
async function reconcileEditorialApprovals(stored: StoredProject, services: Services): Promise<InternalVisualReview> {
  const review = await buildVisualReview(stored, services);
  if (stored.visualApproval?.hash === review.contentHash) return review;
  const nativePath = await localPath(stored.project.path, 'project.json');
  const claimsPath = await localPath(stored.project.path, 'research/claims.json');
  const native = object(await readJson(nativePath), 'Projeto PostNow');
  const claims = object(await readJson(claimsPath), 'Claims PostNow');
  const editorial = object(native.editorial ?? {}, 'Aprovação editorial');
  if (editorial.copy_approved !== true && editorial.claims_reviewed !== true && claims.reviewed !== true) return review;
  native.editorial = { ...editorial, copy_approved: false, claims_reviewed: false };
  claims.reviewed = false;
  await atomicJson(nativePath, native);
  await atomicJson(claimsPath, claims);
  return buildVisualReview(stored, services);
}
const GENERATED_IMAGE = /^generated\/runs\/([0-9]{13}-[a-f0-9]{8})\/slide-(\d{2,3})\.png$/;
export interface RevisionPageState { page: number; path: string; sha256: string; decision?: 'keep' | 'redo'; note?: string; }
export interface RevisionSnapshot { batchId: string; format?: PostNowFormatId; pages: RevisionPageState[]; }
async function readBatchRevision(projectPath: string, batchId: string): Promise<GenerationBatch['revision']> {
  let mapping: Record<string, unknown>;
  try { mapping = object(await readJson(await localPath(projectPath, join('generated', 'runs', batchId, '.mapping.json'))), 'Mapa da rodada'); } catch (error) { if (missing(error)) return undefined; throw error; }
  if (mapping.revision === undefined) return undefined;
  const raw = object(mapping.revision, 'Revisão da rodada');
  const numbers = (value: unknown): number[] => {
    if (!Array.isArray(value) || !value.every((item) => Number.isInteger(item) && item > 0)) throw new Error('Revisão da rodada inválida; original preservado.');
    return value as number[];
  };
  if (typeof raw.of !== 'string' || !/^[0-9]{13}-[a-f0-9]{8}$/.test(raw.of)) throw new Error('Revisão da rodada inválida; original preservado.');
  return { of: raw.of, keptPages: numbers(raw.keptPages), redonePages: numbers(raw.redonePages) };
}
/** Latest ready round with one decision per page: kept (approved as-is) or redo (marked for regeneration). */
export async function readRevisionSnapshot(root: string, id: string, services: Services): Promise<RevisionSnapshot> {
  const stored = await load(root, safeId(id));
  if (stored.project.kind !== 'image') throw new Error('A revisão de imagens só existe em projetos de imagem.');
  const view = await detail(root, stored, services);
  const latest = view.batches?.[0];
  const expected = view.visualReview?.pages.length ?? 0;
  if (!latest || latest.status?.state !== 'ready' || expected < 1) throw new Error('Só é possível revisar a rodada mais recente, já pronta.');
  const byPage = new Map<number, Asset>();
  for (const asset of latest.assets) {
    const match = asset.name.match(GENERATED_IMAGE);
    if (match?.[1] === latest.id) byPage.set(Number(match[2]), asset);
  }
  const pages: RevisionPageState[] = [];
  for (let page = 1; page <= expected; page++) {
    const asset = byPage.get(page);
    if (!asset) throw new Error('A rodada precisa estar completa e verificada antes da revisão.');
    const current = await fingerprint(asset.path);
    const mark = stored.redo?.[asset.name];
    const redo = mark && mark.stamp === current.stamp ? mark : undefined;
    const decision = redo ? 'redo' : stored.approvals[asset.name] === current.stamp ? 'keep' : undefined;
    pages.push({ page, path: asset.path, sha256: current.sha256, ...(decision ? { decision } : {}), ...(redo ? { note: redo.note } : {}) });
  }
  return { batchId: latest.id, format: latest.format, pages };
}
/** Marks one image of the latest ready round for regeneration, or clears the mark. Approval is cleared when marking. */
async function reviewAsset(root: string, stored: StoredProject, payload: Record<string, unknown>, services: Services): Promise<ProjectDetail> {
  if (stored.project.kind !== 'image') throw new Error('A revisão de imagens só existe em projetos de imagem.');
  if (typeof payload.redo !== 'boolean') throw new Error('Informe se a imagem deve ser refeita.');
  const path = await localPath(stored.project.path, text(payload, 'path', 4000));
  const key = relative(stored.project.path, path).split('\\').join('/');
  const batch = key.match(GENERATED_IMAGE)?.[1];
  if (!batch) throw new Error('Só é possível revisar as imagens geradas de uma rodada.');
  const view = await detail(root, stored, services);
  const latest = view.batches?.[0];
  if (!latest || latest.id !== batch || latest.status?.state !== 'ready') throw new Error('Só é possível revisar a rodada mais recente, já pronta.');
  if (!latest.assets.some((asset) => asset.name === key)) throw new Error('Imagem não encontrada na rodada.');
  if (payload.redo) {
    const note = typeof payload.note === 'string' ? payload.note.trim().slice(0, 1000) : '';
    stored.redo = { ...stored.redo, [key]: { stamp: (await fingerprint(path)).stamp, note } };
    delete stored.approvals[key];
  } else if (stored.redo) delete stored.redo[key];
  await save(root, stored);
  return detail(root, stored, services);
}
/** Replaces a superseded round: kept pages keep their approval only when byte-identical; old round marks are dropped. */
export async function commitImageRevision(root: string, id: string, input: { previousBatchId: string; nextBatchId: string; keptPages: number[] }): Promise<void> {
  await serialized(root, async () => {
    const stored = await load(root, safeId(id));
    const previous = `generated/runs/${input.previousBatchId}/`;
    const kept = input.keptPages.map((page) => {
      const name = `slide-${String(page).padStart(2, '0')}.png`;
      return { before: `${previous}${name}`, after: `generated/runs/${input.nextBatchId}/${name}` };
    });
    const transfer = kept.filter((item) => stored.approvals[item.before] !== undefined);
    for (const key of Object.keys(stored.approvals)) if (key.startsWith(previous)) delete stored.approvals[key];
    if (stored.redo) for (const key of Object.keys(stored.redo)) if (key.startsWith(previous)) delete stored.redo[key];
    for (const item of transfer) {
      const before = await fingerprint(await localPath(stored.project.path, item.before));
      const after = await fingerprint(await localPath(stored.project.path, item.after));
      if (before.sha256 === after.sha256) stored.approvals[item.after] = after.stamp;
    }
    await save(root, stored);
  });
}
async function detail(root: string, stored: StoredProject, services: Services): Promise<ProjectDetail> {
  const assets: Asset[] = [];
  const current: Record<string, true> = Object.create(null) as Record<string, true>;
  let changed = false;
  for (const path of await walk(stored.project.path)) {
    const kind = kinds[extname(path).toLowerCase()];
    if (!kind) continue;
    const key = relative(stored.project.path, path).split('\\').join('/');
    current[key] = true;
    let approved = false;
    if (stored.approvals[key]) {
      approved = (await fingerprint(path)).stamp === stored.approvals[key];
      if (!approved) { delete stored.approvals[key]; changed = true; }
    }
    let redo: Asset['redo'];
    const mark = stored.redo?.[key];
    if (mark) {
      if ((await fingerprint(path)).stamp === mark.stamp) redo = { note: mark.note };
      else { if (stored.redo) delete stored.redo[key]; changed = true; }
    }
    assets.push({ name: key, path, kind, url: services.assetUrl(path), approved, ...(redo ? { redo } : {}) });
  }
  const videoOutputs = assets.filter(asset => asset.kind === 'video' && /^renders\/(?:review|final)\//i.test(asset.name));
  if (stored.project.kind === 'video' && videoOutputs.length) {
    const ffprobe = await resolveTool('ffprobe', services);
    if (ffprobe) await Promise.all(videoOutputs.map(async asset => {
      try {
        const result = await services.capture(ffprobe, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'json', asset.path], { timeoutMs: 30000 });
        if (result.code !== 0) return;
        const probe: unknown = JSON.parse(result.stdout);
        if (typeof probe === 'object' && probe !== null && 'streams' in probe && Array.isArray(probe.streams)) {
          asset.hasAudio = probe.streams.some((stream: unknown) => typeof stream === 'object' && stream !== null && 'codec_type' in stream && stream.codec_type === 'audio');
        }
      } catch { /* A prévia informa que o áudio não pôde ser verificado. */ }
    }));
  }
  for (const key of Object.keys(stored.approvals)) if (!current[key]) { delete stored.approvals[key]; changed = true; }
  if (stored.redo) for (const key of Object.keys(stored.redo)) if (!current[key]) { delete stored.redo[key]; changed = true; }
  if (changed) await save(root, stored);
  const rank = (asset: Asset): number => {
    if (asset.kind === 'image' && /^generated\/slide-\d+\.png$/i.test(asset.name)) return 0;
    if (asset.kind === 'video') return 1;
    if (asset.kind === 'image') return 2;
    if (asset.kind === 'audio') return 3;
    return 4;
  };
  assets.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  let visualReview: InternalVisualReview | undefined;
  if (stored.project.kind === 'image') {
    try { visualReview = await reconcileEditorialApprovals(stored, services); }
    catch (error) {
      if (!stored.formatAdaptation) throw error;
      const format = stored.formatAdaptation.targetFormat;
      const canvas = formatCanvas(format);
      visualReview = { ready: false, approved: false, contentHash: '', blocking: ['A adaptação foi interrompida ou os arquivos estão incompletos. Tente novamente; o material original está preservado.'], format, width: canvas.width, height: canvas.height, pages: [], claims: [] };
    }
  }
  const batches: GenerationBatch[] = [];
  if (stored.project.kind === 'image') {
    const runsPath = await localPath(stored.project.path, 'generated/runs');
    try {
      for (const entry of await readdir(runsPath, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        await localPath(runsPath, entry.name);
        const inputPath = await localPath(stored.project.path, join('generated', 'runs', entry.name, '.input'));
        let sourceCount = 0;
        try {
          for (const name of await readdir(inputPath)) {
            if (kinds[extname(name).toLowerCase()] === 'image' && (await lstat(await localPath(inputPath, name))).isFile()) sourceCount++;
          }
        } catch (error) { if (!missing(error)) throw error; }
        let status = await readBatchStatus(stored.project.path, entry.name);
        if (status && ['generating', 'processing'].includes(status.state) && !services.jobs().some(job => job.projectId === stored.project.id && job.status === 'running')) {
          await writeBatchStatus(stored.project.path, entry.name, { state: 'failed', message: 'A execução foi interrompida. Os originais existentes foram preservados; confira a rodada antes de tentar novamente.' });
          status = await readBatchStatus(stored.project.path, entry.name);
        }
        const batchAssets = assets.filter(asset => asset.name.startsWith(`generated/runs/${entry.name}/`) && asset.kind === 'image');
        if (status?.state === 'ready' && !stored.formatAdaptation) {
          const expectedPages = visualReview?.pages.length ?? 0;
          if (expectedPages < 1 || sourceCount !== expectedPages || batchAssets.length !== expectedPages) {
            const message = sourceCount !== expectedPages
              ? `Esta rodada tem ${sourceCount} imagem(ns)-fonte; o roteiro exige ${expectedPages}. Importe ou gere o conjunto completo em uma nova rodada.`
              : `Esta rodada tem ${batchAssets.length} saída(s); o roteiro exige ${expectedPages}. O conjunto está incompleto e não pode ser aprovado ou derivado.`;
            await writeBatchStatus(stored.project.path, entry.name, { state: 'failed', message });
            status = await readBatchStatus(stored.project.path, entry.name);
          }
        }
        const revision = await readBatchRevision(stored.project.path, entry.name);
        batches.push({ id: entry.name, assets: batchAssets, sourceCount, ...(status?.format ? { format: status.format } : {}), ...(status ? { status } : {}), ...(revision ? { revision } : {}) });
      }
    } catch (error) { if (!missing(error)) throw error; }
    batches.sort((a, b) => b.id.localeCompare(a.id));
  }
  const result: ProjectDetail = { ...stored.project, notes: stored.notes, assets, ...(stored.project.kind === 'image' ? { batches } : {}) };
  if (stored.formatAdaptation) {
    const { sourceFormat, targetFormat, pageCount } = stored.formatAdaptation;
    result.formatAdaptation = { sourceFormat, targetFormat, pageCount };
  }
  if (stored.project.kind === 'image') {
    if (visualReview) result.visualReview = visualReview;
  }
  if (stored.project.kind === 'video') {
    const status = await storyboardStatus(stored.project.path);
    result.storyboardAvailable = status.available;
    result.storyboardReady = status.ready;
    if (status.issues.length) result.storyboardIssues = status.issues;
  }
  return result;
}
export async function readProjectDetail(id: string, services: Services): Promise<ProjectDetail> {
  const root = await workspace(services);
  return serialized(root, async () => detail(root, await load(root, safeId(id)), services));
}
/** Escolhe o formato PostNow das imagens. Trocar de formato alinha o projeto nativo e limpa a aprovação visual, cujo hash inclui o formato. Chame somente sob `serialized(root)` (ex.: handleProjects); não aninhe. */
export async function chooseImageFormat(root: string, id: string, format: PostNowFormatId): Promise<void> {
  const stored = await load(root, safeId(id));
  if (stored.project.kind !== 'image') throw new Error('O formato de imagem só existe em projetos PostNow.');
  if (stored.project.format === format && stored.project.unsupportedFormat === undefined) return;
  const nativePath = await localPath(stored.project.path, 'project.json');
  const native = object(await readJson(nativePath), 'Projeto PostNow');
  const sourceFormat = stored.formatAdaptation?.sourceFormat ?? (isPostNowFormat(stored.project.format) ? stored.project.format : isPostNowFormat(native.format) ? native.format : DEFAULT_POSTNOW_FORMAT);
  let snapshotId = stored.formatAdaptation?.snapshotId;
  if (!snapshotId) {
    const files: Record<string, string> = {};
    const paths = new Set(['project.json', 'storyboard.md', 'research/claims.json']);
    const promptDir = await localPath(stored.project.path, 'prompts');
    try {
      for (const path of await walk(stored.project.path, promptDir)) paths.add(relative(stored.project.path, path));
    } catch (error) { if (!missing(error)) throw error; }
    if (typeof native.story_prompt_file === 'string' && native.story_prompt_file) paths.add(native.story_prompt_file);
    for (const page of Array.isArray(native.pages) ? native.pages : []) {
      const item = object(page, 'Página');
      if (typeof item.prompt_file === 'string' && item.prompt_file) paths.add(item.prompt_file);
    }
    for (const path of paths) {
      const source = await localPath(stored.project.path, path);
      try { files[path] = await readFile(source, 'utf8'); } catch (error) { if (!missing(error)) throw error; }
    }
    snapshotId = randomUUID();
    const folder = await directory(root, join('.studio', 'format-adaptations', id));
    await atomicJson(join(folder, `${snapshotId}.json`), { project: stored.project, notes: stored.notes, files });
  }
  const currentCount = Array.isArray(native.pages) ? native.pages.length : 0;
  const pageCount = postNowFormatAcceptsPageCount(format, currentCount) ? currentCount : POSTNOW_FORMATS[format].kind === 'carousel' ? 5 : 1;
  // Nativo primeiro: se a segunda escrita falhar, o retry reaplica o mesmo formato em vez de retornar cedo.
  native.format = format;
  native.type = POSTNOW_FORMATS[format].kind;
  await atomicJson(nativePath, native);
  stored.project.format = format;
  delete stored.project.unsupportedFormat;
  delete stored.visualApproval;
  stored.formatAdaptation = { sourceFormat, targetFormat: format, pageCount, snapshotId };
  await save(root, stored);
}
/** Retorna a fonte imutável para cada tentativa explícita, inclusive após falha ou reinício. */
export async function readFormatAdaptation(root: string, id: string): Promise<{ adaptation: FormatAdaptation; snapshot: unknown }> {
  const stored = await load(root, safeId(id));
  const pending = stored.formatAdaptation;
  if (!pending) throw new Error('Não há adaptação de formato pendente.');
  const path = await localPath(root, join('.studio', 'format-adaptations', id, `${pending.snapshotId}.json`));
  const snapshot = await readJson(path);
  const { sourceFormat, targetFormat, pageCount } = pending;
  return { adaptation: { sourceFormat, targetFormat, pageCount }, snapshot };
}

/** Só libera revisão quando o resultado completo corresponde ao contrato solicitado. */
export async function completeFormatAdaptation(root: string, id: string, expected: FormatAdaptation, signal: AbortSignal): Promise<void> {
  await serialized(root, async () => {
    signal.throwIfAborted();
    const stored = await load(root, safeId(id));
    const pending = stored.formatAdaptation;
    if (!pending || pending.sourceFormat !== expected.sourceFormat || pending.targetFormat !== expected.targetFormat || pending.pageCount !== expected.pageCount) throw new Error('A adaptação pendente mudou durante a execução.');
    const native = object(await readJson(await localPath(stored.project.path, 'project.json')), 'Projeto PostNow');
    const pages = Array.isArray(native.pages) ? native.pages : [];
    if (native.format !== pending.targetFormat || native.type !== POSTNOW_FORMATS[pending.targetFormat].kind || native.page_count !== pending.pageCount || pages.length !== pending.pageCount) throw new Error('A adaptação não produziu o formato e a quantidade de páginas solicitados.');
    for (const [index, value] of pages.entries()) {
      const page = object(value, `Página ${index + 1}`);
      if (typeof page.copy !== 'string' || !page.copy.trim() || typeof page.visual_function !== 'string' || !page.visual_function.trim() || typeof page.prompt_file !== 'string' || !page.prompt_file) throw new Error(`Página ${index + 1} incompleta após adaptação.`);
      const prompt = await readFile(await localPath(stored.project.path, page.prompt_file), 'utf8');
      if (!prompt.includes(page.copy) || !prompt.includes(page.visual_function)) throw new Error(`Prompt da página ${index + 1} não corresponde à copy e função visual.`);
    }
    const storyboard = await readFile(await localPath(stored.project.path, 'storyboard.md'), 'utf8');
    const claims = object(await readJson(await localPath(stored.project.path, 'research/claims.json')), 'Claims PostNow');
    if (!storyboard.trim() || !Array.isArray(claims.claims)) throw new Error('Storyboard ou fontes incompletos após adaptação.');
    signal.throwIfAborted();
    delete stored.formatAdaptation;
    delete stored.visualApproval;
    await save(root, stored);
  });
}
export async function requireVisualGenerationApproval(id: string, services: Services): Promise<VisualGenerationReview> {
  const root = await workspace(services);
  const stored = await load(root, safeId(id));
  if (stored.formatAdaptation) throw new Error('Adapte os textos ao novo formato antes de aprovar ou gerar imagens.');
  const review = await buildVisualReview(stored, services);
  if (!review.ready) throw new Error(`O conteúdo não está completo para gerar imagens: ${review.blocking.join(' ')}`);
  if (!review.approved) throw new Error('Revise e aprove copy, claims e prompts no Studio antes de gerar imagens.');
  return review;
}
async function create(root: string, payload: Record<string, unknown>): Promise<StoredProject> {
  const id = randomUUID();
  const title = text(payload, 'title', 200);
  const kind = projectKind(payload.kind);
  const brief = payload.brief === undefined ? '' : freeText(payload, 'brief');
  let brand: Brand | undefined;
  let brandId: string | undefined;
  if (payload.brandId) { brandId = safeId(payload.brandId); brand = await brandAt(root, brandId); }
  const folder = await createProjectFolder(root, title);
  const format = projectFormat(payload.format, kind);
  const pageCount = requestedPageCount(payload.pageCount, format);
  const project: Project = { id, title, kind, format, brief, createdAt: new Date().toISOString(), path: folder.path };
  if (brandId) project.brandId = brandId;
  try { await initializeNative(project, brand, pageCount); }
  catch (error) { await rm(project.path, { recursive: true, force: true }); throw error; }
  return { project, folderName: folder.folderName, notes: '', approvals: {} };
}
async function saveBrand(root: string, payload: Record<string, unknown>, services: Services): Promise<Brand> {
  const id = payload.id === undefined ? randomUUID() : safeId(payload.id);
  const existing = payload.id === undefined ? undefined : await brandAt(root, id, services);
  const name = singleLine(text(payload, 'name', 200));
  const tone = freeText(payload, 'tone', 10000);
  if (!Array.isArray(payload.colors) || payload.colors.length > 30 || !payload.colors.every((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) throw new Error('Use cores hexadecimais completas, como #00aa88.');
  const brand: Brand = { id, name, tone, colors: payload.colors as string[], references: [] };
  if (payload.logo === undefined) {
    brand.logo = existing?.logo;
    brand.logoUrl = existing?.logoUrl;
  } else if (payload.logo !== '') {
    const source = await safePath(text(payload, 'logo', 4000));
    const extension = extname(source).toLowerCase();
    if (kinds[extension] !== 'image') throw new Error('A logo deve ser PNG, JPEG, WebP, SVG, GIF ou AVIF.');
    if (source === existing?.logo) {
      brand.logo = source;
      brand.logoUrl = services.assetUrl(source);
    } else {
      brand.logo = await localPath(root, join('brands', id, `${randomUUID()}${extension}`));
      await copyLocal(source, brand.logo);
      brand.logoUrl = services.assetUrl(brand.logo);
    }
  }
  if (payload.references === undefined) {
    brand.references = existing?.references ?? [];
  } else if (Array.isArray(payload.references)) {
    if (payload.references.length > 60) throw new Error('Limite máximo de 60 arquivos de referência por marca.');
    for (const item of payload.references) {
      const rawPath = typeof item === 'string' ? item : (item && typeof item === 'object' && 'path' in item && typeof item.path === 'string' ? item.path : '');
      if (!rawPath) throw new Error('Referência inválida.');
      const kept = existing?.references.find(ref => ref.path === rawPath);
      if (kept) {
        brand.references.push(kept);
        continue;
      }
      const source = await safePath(rawPath);
      const extension = extname(source).toLowerCase();
      const kind = refKinds[extension];
      if (!kind) throw new Error('As referências devem ser fotos (PNG, JPG, WebP, SVG, GIF, AVIF), PDFs ou documentos (MD, TXT, JSON).');
      const refId = randomUUID();
      const target = await localPath(root, join('brands', id, 'references', `${refId}${extension}`));
      await copyLocal(source, target);
      const refName = singleLine((item && typeof item === 'object' && 'name' in item && typeof item.name === 'string' && item.name.trim()) ? item.name : basename(source));
      brand.references.push({ id: refId, name: refName.slice(0, 160), path: target, kind, url: services.assetUrl(target) });
    }
  }
  await atomicJson(join(root, '.studio', 'brands', `${id}.json`), {
    id: brand.id,
    name: brand.name,
    tone: brand.tone,
    colors: brand.colors,
    ...(brand.logo ? { logo: brand.logo } : {}),
    references: brand.references.map(({ id: rId, name: rName, path: rPath, kind: rKind }) => ({ id: rId, name: rName, path: rPath, kind: rKind })),
  });
  return brand;
}
async function importProject(root: string, payload: Record<string, unknown>): Promise<StoredProject> {
  const selected = await safePath(text(payload, 'path', 4000));
  const stat = await lstat(selected);
  const source = stat.isDirectory() ? selected : dirname(selected);
  if (!stat.isDirectory() && !['project.json', 'storyboard.json'].includes(basename(selected))) throw new Error('Selecione a pasta do projeto ou project.json/storyboard.json.');
  if (inside(source, root)) throw new Error('Não é possível importar uma pasta que contém o workspace.');
  let kind: Project['kind'];
  if (payload.kind !== undefined) kind = projectKind(payload.kind);
  else if (basename(selected) === 'storyboard.json') kind = 'video';
  else {
    try { await lstat(await localPath(source, 'storyboard.json')); kind = 'video'; }
    catch (error) { if (!missing(error)) throw error; kind = 'image'; }
  }
  const native = object(await readJson(await localPath(source, kind === 'video' ? 'storyboard.json' : 'project.json')), 'Projeto importado');
  if (kind === 'video' ? native.schema !== 'videogo.storyboard/v1' : native.schema_version !== 1 || !['post', 'story', 'carousel'].includes(String(native.type))) throw new Error('Contrato nativo de projeto não reconhecido.');
  if (typeof native.title !== 'string' || !native.title.trim()) throw new Error('Projeto importado sem título.');
  const files = await walk(source);
  const title = native.title.trim();
  const id = randomUUID();
  const folder = await createProjectFolder(root, title);
  try {
    for (const file of files) await copyLocal(file, await localPath(folder.path, relative(source, file)));
    const nativeFormat = typeof native.format === 'string' ? native.format : kind === 'image' ? native.type === 'story' ? 'story-9x16' : native.type === 'post' ? 'post-1x1' : 'carousel-1x1' : undefined;
    const format = projectFormat(nativeFormat, kind);
    if (kind === 'video') {
      const storyPath = join(folder.path, 'storyboard.json');
      const secured = await secureStoryboard(storyPath, folder.path, source);
      secured.id = folder.folderName;
      secured.title = title;
      secured.format = format;
      await atomicJson(storyPath, secured);
    } else {
      const projectPath = join(folder.path, 'project.json');
      const importedNative = object(await readJson(projectPath), 'Projeto PostNow');
      importedNative.format = format;
      await atomicJson(projectPath, importedNative);
    }
    const project: Project = {
      id,
      title,
      kind,
      format,
      createdAt: new Date().toISOString(),
      path: folder.path,
      brief: typeof native.objective === 'string' ? native.objective : '',
    };
    return { project, folderName: folder.folderName, notes: '', approvals: {} };
  } catch (error) { await rm(folder.path, { recursive: true, force: true }); throw error; }
}
interface ExportArtifact { key: string; path: string; kind: Asset['kind']; sha256: string; bytes: number; stamp: string; }
/** Re-verifies every approved artifact (round ready, approval stamp still current) before any byte is copied. */
async function verifiedArtifacts(stored: StoredProject, approved: Asset[]): Promise<ExportArtifact[]> {
  const artifacts: ExportArtifact[] = [];
  for (const asset of approved) {
    const batch = asset.name.match(/^generated\/runs\/([0-9]{13}-[a-f0-9]{8})\//i)?.[1];
    if (batch) {
      const status = await readBatchStatus(stored.project.path, batch);
      if (!status || status.state !== 'ready') throw new Error(`A rodada ${batch} não tem conclusão verificada para exportação.`);
    }
    const key = relative(stored.project.path, asset.path).split('\\').join('/');
    const before = await fingerprint(asset.path);
    if (before.stamp !== stored.approvals[key]) throw new Error(`A aprovação expirou: ${key}`);
    artifacts.push({ key, path: asset.path, kind: asset.kind, sha256: before.sha256, bytes: before.size, stamp: before.stamp });
  }
  return artifacts;
}
function manifestFor(stored: StoredProject, artifacts: ExportArtifact[]): object {
  return { schema: 'maquina.export/v1', project: { id: stored.project.id, title: stored.project.title, kind: stored.project.kind, sourceProjectId: stored.project.sourceProjectId }, exportedAt: new Date().toISOString(), approval: 'explicit-human-per-artifact', artifacts: artifacts.map((artifact) => ({ path: `artifacts/${artifact.key}`, sha256: artifact.sha256, bytes: artifact.bytes, kind: artifact.kind })) };
}
async function exportProject(root: string, stored: StoredProject, payload: Record<string, unknown>, services: Services): Promise<string> {
  const view = await detail(root, stored, services);
  const approved = view.assets.filter((asset) => asset.approved);
  if (!approved.length) throw new Error('Aprove pelo menos um artefato antes de exportar.');
  const destination = await safePath(text(payload, 'destination', 4000));
  if (inside(join(root, 'projects'), destination)) throw new Error('Exporte para fora das pastas de projetos, para preservar os pacotes ao excluir um projeto.');
  if (inside(stored.project.path, destination)) throw new Error('Exporte para fora da pasta do projeto.');
  await directory(destination, '.');
  const artifacts = await verifiedArtifacts(stored, approved);
  const output = join(destination, `export-${stored.project.id}-${randomUUID()}`);
  await directory(destination, output);
  try {
    for (const artifact of artifacts) {
      const target = await localPath(output, join('artifacts', artifact.key));
      await copyLocal(artifact.path, target);
      const copied = await fingerprint(target);
      if (copied.sha256 !== artifact.sha256 || (await fingerprint(artifact.path)).stamp !== artifact.stamp) throw new Error(`O artefato mudou durante a exportação: ${artifact.key}`);
    }
    await atomicJson(join(output, 'MANIFEST.json'), manifestFor(stored, artifacts));
    return output;
  } catch (error) { await rm(output, { recursive: true, force: true }); throw error; }
}
/** Writes the approved artifacts plus MANIFEST.json into one ZIP inside the picked folder; artifacts must stay unchanged until written. */
async function exportZip(root: string, stored: StoredProject, payload: Record<string, unknown>, services: Services): Promise<{ path: string; files: number }> {
  const view = await detail(root, stored, services);
  const approved = view.assets.filter((asset) => asset.approved);
  if (!approved.length) throw new Error('Aprove pelo menos um artefato antes de exportar.');
  const folder = await safePath(text(payload, 'destination', 4000));
  if (inside(join(root, 'projects'), folder)) throw new Error('Exporte para fora das pastas de projetos, para preservar os pacotes ao excluir um projeto.');
  if (inside(stored.project.path, folder)) throw new Error('Exporte para fora da pasta do projeto.');
  if (!(await lstat(folder)).isDirectory()) throw new Error('Escolha uma pasta de destino válida.');
  const artifacts = await verifiedArtifacts(stored, approved);
  const sources: ZipSource[] = [
    { name: 'MANIFEST.json', data: Buffer.from(`${JSON.stringify(manifestFor(stored, artifacts), null, 2)}\n`) },
    ...artifacts.map((artifact) => ({ name: `artifacts/${artifact.key}`, path: artifact.path })),
  ];
  const slug = stored.project.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'projeto';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const destination = join(folder, `${slug}-${stamp}.zip`);
  await writeZipFile(destination, sources);
  for (const artifact of artifacts) {
    if ((await fingerprint(artifact.path)).stamp !== artifact.stamp) {
      await rm(destination, { force: true });
      throw new Error(`O artefato mudou durante a exportação: ${artifact.key}`);
    }
  }
  return { path: destination, files: sources.length };
}
async function runMedia(services: Services, projectId: string, title: string, args: string[], cwd: string): Promise<void> {
  const executable = await resolveTool('ffmpeg', services);
  if (!executable) throw new Error('FFmpeg não está instalado. Instale-o em Configuração antes da derivação.');
  const job = await services.run({ title, executable, args: ['-hide_banner', '-nostdin', '-n', ...args], cwd, env: await toolEnvironment(services), projectId, timeoutMs: 30 * 60 * 1000 });
  const result = await services.waitJob(job.id);
  if (result.status !== 'succeeded') throw new Error(`FFmpeg não concluiu a derivação. Consulte o job ${job.id}.`);
}
async function bridge(root: string, stored: StoredProject, payload: Record<string, unknown>, services: Services): Promise<Project> {
  const kind = projectKind(payload.kind);
  if (kind === stored.project.kind) throw new Error('A derivação deve alternar entre imagem e vídeo.');
  const requestedFormat = payload.format === undefined ? undefined : projectFormat(payload.format, kind);
  const view = await detail(root, stored, services);
  const allInputs = view.assets.filter(asset => asset.kind === stored.project.kind);
  let inputs = allInputs;
  if (stored.project.kind === 'image') {
    const batchId = payload.batchId === undefined ? undefined : text(payload, 'batchId', 100);
    if (batchId && !/^[0-9]{13}-[a-f0-9]{8}$/.test(batchId)) throw new Error('Rodada de geração inválida.');
    const slides = allInputs.filter(asset => /^generated\/(?:slide-\d+\.png|runs\/[^/]+\/slide-\d+\.png)$/i.test(asset.name));
    const batches = view.batches ?? [];
    const expectedPages = view.visualReview?.pages.length ?? 0;
    if (batches.length > 0 && !batchId) throw new Error('Selecione uma versão específica antes de derivar; “Todas as versões” não é uma rodada.');
    if (batchId) {
      const status = await readBatchStatus(stored.project.path, batchId);
      const selected = batches.find(batch => batch.id === batchId);
      if (!status || status.state !== 'ready') throw new Error('Esta rodada não tem conclusão verificada; prepare e revise as imagens antes de derivar.');
      if (!selected || expectedPages < 1 || selected.sourceCount !== expectedPages || selected.assets.length !== expectedPages) {
        throw new Error('Esta rodada não contém todas as imagens exigidas pelo roteiro; selecione ou crie outra rodada completa.');
      }
    } else {
      const legacySlides = slides.filter(asset => /^generated\/slide-\d+\.png$/i.test(asset.name));
      if (expectedPages < 1 || legacySlides.length !== expectedPages) throw new Error('As imagens antigas não contêm o conjunto completo exigido pelo roteiro; crie uma rodada nova.');
    }
    inputs = slides.filter(asset => batchId ? asset.name.startsWith(`generated/runs/${batchId}/`) : /^generated\/slide-\d+\.png$/i.test(asset.name));
  }
  if (!inputs.length) throw new Error('Não há mídia final revisável para derivar. Gere e revise os arquivos PostNow/VideoGo primeiro.');
  if (inputs.some(asset => !asset.approved)) throw new Error('Aprove todas as mídias da rodada selecionada antes de criar o projeto derivado.');
  const postNowFormat = kind === 'image' ? postNowFormatForPageCount(requestedFormat, inputs.length) : undefined;
  const format: ProjectFormatId = postNowFormat ?? requestedFormat ?? projectFormat(undefined, kind);
  const created = await create(root, { title: `${stored.project.title} — ${kind === 'video' ? 'vídeo' : 'imagens'}`, kind, format, brief: stored.project.brief, brandId: stored.project.brandId });
  created.project.sourceProjectId = stored.project.id;
  const path = created.project.path;
  const provenance: { source: string; sha256: string; artifact: string }[] = [];
  try {
    if (kind === 'video') {
      const imagePaths: string[] = [];
      for (const [index, asset] of inputs.entries()) {
        const target = join('assets', 'visuals', 'generated', `${String(index + 1).padStart(2, '0')}${extname(asset.path).toLowerCase()}`);
        await copyLocal(asset.path, await localPath(path, target));
        imagePaths.push(target.split('\\').join('/'));
        provenance.push({ source: asset.name, sha256: (await fingerprint(join(path, target))).sha256, artifact: imagePaths[index]! });
      }
      // Extrai os textos do projeto de imagem de origem (headline e copy de cada slide)
      let sourceScenes: StoryboardSourceScene[] = [];
      try {
        const sourceNative = object(await readJson(await localPath(stored.project.path, 'project.json')), 'Projeto PostNow');
        const pages = Array.isArray(sourceNative.pages) ? sourceNative.pages : [];
        sourceScenes = pages.map((pageRaw, index) => {
          const page = object(pageRaw, `Página ${index + 1}`);
          const headline = typeof page.headline === 'string' ? page.headline.trim() : '';
          const copy = typeof page.copy === 'string' ? page.copy.trim() : '';
          const role = typeof page.role === 'string' ? page.role : '';

          let narration = '';
          if (copy) {
            narration = copy.toLowerCase().startsWith(headline.toLowerCase())
              ? copy
              : (headline ? `${headline}. ${copy}` : copy);
          } else if (headline) {
            narration = headline;
          }

          const spokenText = narration.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
          const cleanNarration = narration.replace(/\n{3,}/g, '\n\n').trim();
          const onScreen = headline ? [headline.slice(0, 100)] : [];
          const words = spokenText.split(/\s+/).filter(Boolean).length;
          const targetSeconds = Math.max(4, Math.min(25, Math.ceil(words / 2.3) || 5));
          const purpose = role === 'cover' || index === 0 ? 'hook' : role === 'cta' || index === pages.length - 1 ? 'cta' : 'explain';

          return {
            title: headline || (index === 0 ? 'Abertura' : index === pages.length - 1 ? 'Encerramento' : `Cena ${index + 1}`),
            narration: cleanNarration,
            spokenText,
            onScreen,
            purpose,
            targetSeconds,
          };
        });
      } catch {
        // Fallback caso project.json não esteja legível
      }

      await atomicJson(join(path, 'storyboard.json'), storyboard(created.project, imagePaths, sourceScenes));

      // Copia arquivos de briefing e pesquisa de fontes para o novo projeto de vídeo
      try {
        const sourceBrief = await localPath(stored.project.path, join('planning', 'brief.md'));
        if ((await lstat(sourceBrief)).isFile()) {
          await directory(path, 'planning');
          await copyLocal(sourceBrief, await localPath(path, join('planning', 'brief.md')));
        }
      } catch { /* ignora se ausente */ }

      try {
        const sourceClaims = await localPath(stored.project.path, join('research', 'claims.json'));
        if ((await lstat(sourceClaims)).isFile()) {
          await directory(path, 'research');
          await copyLocal(sourceClaims, await localPath(path, join('research', 'claims.json')));
        }
      } catch { /* ignora se ausente */ }

      created.notes = 'Imagens e textos de narração derivados do carrossel PostNow. Storyboard VideoGo preenchido com as falas e pronto para aprovação de voz ou render.';
    } else {
      const runId = await nextImageBatchId(path);
      const inputDirectory = await directory(path, join('generated', 'runs', runId, '.input'));
      if (postNowFormat === undefined) throw new Error('Formato PostNow ausente para a derivação.');
      const { width, height } = formatCanvas(postNowFormat);
      for (const [index, asset] of inputs.entries()) {
        const source = join(inputDirectory, `slide-${String(index + 1).padStart(2, '0')}.png`);
        const filter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
        await runMedia(services, stored.project.id, `FFmpeg: extrair quadro ${index + 1}/${inputs.length}`, ['-i', asset.path, '-vf', filter, '-frames:v', '1', '-an', source], stored.project.path);
        provenance.push({ source: asset.name, sha256: (await fingerprint(source)).sha256, artifact: relative(path, source).split('\\').join('/') });
      }
      const file = join(path, 'project.json');
      const native = object(await readJson(file), 'Projeto PostNow');
      const type = POSTNOW_FORMATS[postNowFormat].kind;
      native.type = type;
      native.format = format;
      native.page_count = inputs.length;
      native.page_count_approved = true;
      native.pages = inputs.map((_, index) => ({
        page: index + 1,
        role: type !== 'carousel' ? 'single' : index === 0 ? 'cover' : index === inputs.length - 1 ? 'cta' : 'body',
        copy: '',
        visual_function: 'Quadro extraído de vídeo com FFmpeg; revisão editorial pendente.',
        prompt_file: `prompts/${String(index + 1).padStart(2, '0')}.md`,
      }));
      for (let index = 0; index < inputs.length; index++) await atomicText(join(path, 'prompts', `${String(index + 1).padStart(2, '0')}.md`), '# Quadro derivado\n\nImagem extraída localmente com FFmpeg; revise narrativa, direitos e copy antes de preparar no PostNow.\n');
      await atomicJson(file, native);
      created.notes = 'Quadros reais extraídos localmente com FFmpeg para uma rodada PostNow. Isso não é geração por IA; aplique a identidade e revise cada imagem no PostNow.';
    }
    await atomicJson(join(path, 'DERIVATION.json'), { schema: 'maquina.derivation/v1', sourceProjectId: stored.project.id, createdAt: new Date().toISOString(), method: kind === 'video' ? 'videogo-storyboard-assets-no-render' : 'ffmpeg-frame-extraction-awaiting-postnow', artifacts: provenance });
    await save(root, created);
    return created.project;
  } catch (error) { await rm(path, { recursive: true, force: true }); throw error; }
}
function omitNarrationAssets(native: Record<string, unknown>): void {
  for (const item of native.scenes as unknown[]) {
    const scene = object(item, 'Cena');
    if (scene.audio) delete object(scene.audio, 'Áudio').narration;
  }
}

async function approveStoryboard(root: string, stored: StoredProject, payload: Record<string, unknown>, services: Services): Promise<ProjectDetail> {
  if (stored.project.kind !== 'video') throw new Error('O storyboard só existe em projetos de vídeo.');
  if (payload.confirm !== true) throw new Error('Confirme a revisão do storyboard antes de aprová-lo.');
  const path = await localPath(stored.project.path, 'storyboard.json');
  const before = await fingerprint(path);
  const silent = stored.narrationMode === 'silent';
  await secureStoryboard(path, stored.project.path, undefined, { allowMissingNarration: silent });
  const native = object(await readJson(path), 'Storyboard');
  if (native.status !== 'draft' && native.status !== 'ready') throw new Error('Status do storyboard inválido.');
  if (native.format !== (stored.project.format ?? 'reels')) throw new Error('O formato do storyboard difere do formato selecionado.');
  const engine = services.getSettings().enginePaths.videogo;
  if (!engine) throw new Error('VideoGo não está configurado. Instale ou vincule o motor em Configuração.');
  const cli = await localPath(await safePath(engine), 'dist/cli/index.js');
  if (!(await lstat(cli)).isFile()) throw new Error('VideoGo sem CLI compilada. Reinstale ou atualize o motor.');
  const node = await resolveTool('node', services);
  if (!node) throw new Error('Node.js não está instalado.');
  const temporary = silent ? await localPath(stored.project.path, `.studio-silent-${randomUUID()}.json`) : undefined;
  try {
    if (temporary) {
      const copy = structuredClone(native);
      omitNarrationAssets(copy);
      await atomicJson(temporary, copy);
    }
    const brand = stored.project.brandId ? await brandAt(root, stored.project.brandId, services) : undefined;
    const profile = brand ? await writeBrandProfile(stored.project.path, brand, services) : undefined;
    const env = {
      ...await toolEnvironment(services),
      ...(profile ? { VIDEOGO_PROFILES_DIR: profile.profilesDirectory } : {}),
    };
    const validation = await services.capture(node, [cli, 'project', 'validate', temporary ?? path], { cwd: engine, env, timeoutMs: 60_000 });
    if (validation.code !== 0) throw new Error(`O VideoGo encontrou pendências no storyboard: ${validation.stderr.trim() || validation.stdout.trim()}`);
  } finally {
    if (temporary) await rm(temporary, { force: true });
  }
  if ((await fingerprint(path)).stamp !== before.stamp) throw new Error('O storyboard mudou durante a validação. Revise novamente antes de aprovar.');
  if (native.status !== 'ready') {
    native.status = 'ready';
    await atomicJson(path, native);
  }
  return detail(root, stored, services);
}

/** Escreve o perfil VideoGo da marca dentro do projeto; o render aplica paleta e logo com `--style profile:<id>`. */
export async function writeBrandProfile(projectPath: string, brand: Brand, services?: Services): Promise<{ profilesDirectory: string; style: string }> {
  const profileId = brand.id.toLowerCase();
  const logo = brand.logo ? `logo${extname(brand.logo).toLowerCase()}` : undefined;
  const profile = videoGoBrandProfile(brand, logo);
  const profilesDirectory = await localPath(projectPath, join('.studio', 'videogo-profiles'));
  const directory = await localPath(profilesDirectory, profileId);
  await mkdir(directory, { recursive: true });
  if (brand.logo && logo) {
    await rm(join(directory, logo), { force: true });
    await copyLocal(brand.logo, join(directory, logo));
  }
  await atomicJson(join(directory, 'profile.json'), profile);
  const engine = services?.getSettings().enginePaths.videogo;
  if (engine) {
    try {
      const engineProfiles = await localPath(engine, join('storage', 'profiles', profileId));
      await mkdir(engineProfiles, { recursive: true });
      if (brand.logo && logo) {
        await rm(join(engineProfiles, logo), { force: true });
        await copyLocal(brand.logo, join(engineProfiles, logo));
      }
      await atomicJson(join(engineProfiles, 'profile.json'), profile);
    } catch { /* Ignora se pasta externa de engine estiver inacessível */ }
  }
  return { profilesDirectory, style: `profile:${profile.id}` };
}
async function render(root: string, stored: StoredProject, payload: Record<string, unknown>, services: Services): Promise<unknown> {
  if (stored.project.kind === 'image') {
    const brand = stored.project.brandId ? await brandAt(root, stored.project.brandId, services) : undefined;
    const batchId = text(payload, 'batchId', 100);
    const logoPolicy = requireLogoPolicy(payload.logoPolicy);
    const review = await requireVisualGenerationApproval(stored.project.id, services);
    const node = await resolveTool('node', services);
    if (!node) throw new Error('Node.js não está instalado.');
    const job = await services.run({
      title: `PostNow: preparar ${stored.project.title}`, executable: node, args: ['-e', ''], cwd: stored.project.path, projectId: stored.project.id,
      onSuccess: async (signal) => {
        // Pré-checagens não tocam o status da rodada; finalizePostNowBatch grava failed se o processamento falhar.
        const current = await requireVisualGenerationApproval(stored.project.id, services);
        if (current.contentHash !== review.contentHash) throw new Error('O conteúdo aprovado mudou antes do processamento.');
        const result = await finalizePostNowBatch(stored.project, brand, batchId, services, logoPolicy, review.pages.length, signal);
        try {
          signal.throwIfAborted();
          const after = await requireVisualGenerationApproval(stored.project.id, services);
          if (after.contentHash !== review.contentHash) throw new Error('O conteúdo aprovado mudou durante o processamento.');
        } catch (error) {
          await writeBatchStatus(stored.project.path, batchId, { state: 'failed', message: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
          throw error;
        }
        return `PostNow: ${result.pages} imagens prontas para revisão.${result.adjusted.length ? ` Páginas ajustadas ao tamanho final (redimensionadas; recorte centralizado só quando necessário): ${result.adjusted.join(', ')}.` : ''}`;
      },
    });
    void services.waitJob(job.id).then(() => services.emit({ type: 'refresh' })).catch(() => undefined);
    return job;
  }
  const { gate } = await narrationEvaluation(stored, services);
  if (gate.issues.length) throw new Error(gate.issues.join(' '));
  const engine = services.getSettings().enginePaths.videogo;
  if (!engine) throw new Error('VideoGo não está configurado. Instale ou vincule o motor em Configuração.');
  const cli = await localPath(await safePath(engine), 'dist/cli/index.js');
  if (!(await lstat(cli)).isFile()) throw new Error('VideoGo sem CLI compilada. Reinstale ou atualize o motor.');
  const node = await resolveTool('node', services);
  if (!node) throw new Error('Node.js não está instalado.');
  const originalPath = join(stored.project.path, 'storyboard.json');
  const silent = stored.narrationMode === 'silent';
  const native = await secureStoryboard(originalPath, stored.project.path, undefined, { allowMissingNarration: silent });
  const format = stored.project.format ?? 'reels';
  if (native.format !== format) throw new Error('O formato do storyboard difere do formato selecionado. Ajuste o roteiro antes de renderizar.');
  if (native.status !== 'ready') throw new Error('O storyboard está em rascunho. Complete e revise as cenas no VideoGo antes de renderizar.');
  const env = await toolEnvironment(services);
  const ffprobe = await resolveTool('ffprobe', services);
  if (!ffprobe) throw new Error('FFprobe é necessário para verificar o vídeo final. Instale FFmpeg em Motores & Setup.');
  const output = await localPath(stored.project.path, join('renders', 'review', `${basename(stored.project.path)}-${Date.now()}-${randomUUID().slice(0, 8)}.mp4`));
  // VideoGo resolves media relative to the storyboard: keep the temporary copy in the same directory.
  const temporary = silent ? await localPath(stored.project.path, `.studio-silent-${randomUUID()}.json`) : undefined;
  const path = temporary ?? originalPath;
  try {
    if (temporary) {
      omitNarrationAssets(native);
      await atomicJson(temporary, native);
    }
    const validation = await services.capture(node, [cli, 'project', 'validate', path], { cwd: engine, env, timeoutMs: 60_000 });
    if (validation.code !== 0) throw new Error(`O VideoGo encontrou pendências no storyboard: ${validation.stderr.trim() || validation.stdout.trim()}`);
    const brand = stored.project.brandId ? await brandAt(root, stored.project.brandId, services) : undefined;
    const profile = brand ? await writeBrandProfile(stored.project.path, brand, services) : undefined;
    const job = await services.run({
      title: `VideoGo: ${stored.project.title} · ${format}`, executable: node, args: [cli, 'project', 'render', path, '--voice', 'demo', '--no-hud', '--output', output, ...(profile ? ['--style', profile.style] : [])], cwd: engine, env: profile ? { ...env, VIDEOGO_PROFILES_DIR: profile.profilesDirectory } : env, projectId: stored.project.id, timeoutMs: 60 * 60 * 1000,
      onSuccess: async (signal) => {
        const info = await lstat(output).catch(() => undefined);
        if (!info?.isFile() || info.isSymbolicLink() || !info.size) throw new Error('O VideoGo terminou sem produzir o vídeo esperado.');
        const checked = await services.capture(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', output], { timeoutMs: 30_000, signal });
        if (checked.code !== 0) throw new Error(`O vídeo gerado não passou na verificação FFprobe: ${checked.stderr.trim()}`);
        const probe = object(JSON.parse(checked.stdout), 'Verificação do vídeo');
        if (!Array.isArray(probe.streams) || !probe.streams.length) throw new Error('O vídeo gerado não contém faixa de vídeo.');
        return 'Vídeo VideoGo gerado e verificado. Revise-o antes de aprovar.';
      },
    });
    void services.waitJob(job.id).then(async () => {
      if (temporary) await rm(temporary, { force: true });
      services.emit({ type: 'refresh' });
    }).catch(async () => { if (temporary) await rm(temporary, { force: true }).catch(() => undefined); });
    return job;
  } catch (error) {
    if (temporary) await rm(temporary, { force: true });
    throw error;
  }
}
export async function handleProjects(action: string, payload: Record<string, unknown>, services: Services): Promise<unknown> {
  if (action === 'projects.list') return listProjects(services);
  if (action === 'brands.list') return listBrands(services);
  const root = await workspace(services);
  const recovered = await recoverPendingDeletions(root, services);
  await recoverPendingAssetDeletions(root, services);
  const completedDeletion = action === 'projects.delete' ? recovered.find(item => item.projectId === payload.id) : undefined;
  if (completedDeletion) {
    services.emit({ type: 'refresh' });
    return { deleted: true, id: completedDeletion.projectId };
  }
  return serialized(root, async () => {
    let result: unknown;
    if (action === 'brands.save') result = await saveBrand(root, payload, services);
    else if (action === 'projects.visual.save') result = await saveVisualText(root, payload, services);
    else if (action === 'projects.storyboard.save') result = await saveStoryboardText(root, payload, services);
    else if (action === 'projects.attachNarrationAudio') result = await attachNarrationAudio(root, payload, services);
    else if (action === 'projects.narration.removeAudio') result = await removeNarrationAudio(root, payload, services);
    else if (action === 'projects.create' || action === 'projects.import') {
      const stored = action === 'projects.create' ? await create(root, payload) : await importProject(root, payload);
      await save(root, stored); result = stored.project;
    } else {
      const stored = await load(root, safeId(payload.id));
      if (action === 'projects.detail') return detail(root, stored, services);
      if (action === 'projects.narration') return narrationState(stored, services);
      if (action === 'projects.storyboard') return storyboardScenes(stored);
      if (action === 'projects.readText') {
        const file = await localPath(stored.project.path, text(payload, 'path', 4000));
        if (kinds[extname(file).toLowerCase()] !== 'file') throw new Error('Apenas documentos de texto possuem leitura integrada.');
        const content = (await readFile(file, 'utf8')).slice(0, 64 * 1024);
        return { content };
      }
      requireIdle(services, stored.project.id);
      await requireNoPendingDeletion(root, services.dataDir, stored.project.id);
      await requireNoPendingAssetDeletion(root, services.dataDir, stored.project.id);
      switch (action) {
        case 'projects.narration.save': result = await saveNarration(root, stored, services, payload); break;
        case 'projects.narration.setMode': {
          if (stored.project.kind !== 'video') throw new Error('A narração só existe em projetos de vídeo.');
          if (payload.mode !== 'silent' && payload.mode !== 'narrated') throw new Error('Modo de narração inválido.');
          stored.narrationMode = payload.mode;
          result = await narrationState(stored, services);
          await save(root, stored); break;
        }
        case 'projects.narration.approve': result = await approveNarration(root, stored, services, payload); break;
        case 'projects.narration.generateLocal': result = await generateLocalScene(root, stored, payload, services); break;
        case 'projects.narration.generate': result = await generateNarration(root, stored, services, payload); break;
        case 'projects.visual.approve': result = await approveVisualContent(root, stored, payload, services); break;
        case 'projects.storyboard.approve': result = await approveStoryboard(root, stored, payload, services); break;
        case 'projects.imageFormat': {
          if (typeof payload.format !== 'string' || !isPostNowFormat(payload.format)) throw new Error('Escolha um formato PostNow disponível.');
          await chooseImageFormat(root, stored.project.id, payload.format);
          result = await detail(root, await load(root, stored.project.id), services); break;
        }
        case 'projects.notes':
          stored.notes = freeText(payload, 'notes');
          if (payload.brief !== undefined) stored.project.brief = freeText(payload, 'brief');
          await save(root, stored); result = await detail(root, stored, services); break;
        case 'projects.importAsset': {
          const requested = Array.isArray(payload.paths) ? payload.paths : [payload.path];
          if (!requested.length || requested.length > 100 || requested.some(path => typeof path !== 'string' || !path || path.length > 4000)) throw new Error('Selecione de 1 a 100 arquivos válidos.');
          const sources = await Promise.all((requested as string[]).map(path => safePath(path)));
          if (new Set(sources).size !== sources.length) throw new Error('Não selecione o mesmo arquivo mais de uma vez.');
          for (const source of sources) {
            if (!kinds[extname(source).toLowerCase()] || !(await lstat(source)).isFile()) throw new Error('Há um arquivo inválido ou formato não suportado.');
          }
          const containsPostNowImage = stored.project.kind === 'image' && sources.some(source => kinds[extname(source).toLowerCase()] === 'image');
          if (containsPostNowImage && sources.some(source => kinds[extname(source).toLowerCase()] === 'image' && !postNowImageExtensions[extname(source).toLowerCase()])) {
            throw new Error('O PostNow só aceita PNG, JPEG ou WebP em rodadas de imagem. Converta os arquivos antes de importar.');
          }
          const imageBatch = stored.project.kind === 'image' && sources.every(source => kinds[extname(source).toLowerCase()] === 'image' && postNowImageExtensions[extname(source).toLowerCase()]);
          if (sources.length > 1 && !imageBatch) throw new Error('A importação múltipla aceita somente PNG, JPEG ou WebP em projetos PostNow.');
          const batchId = imageBatch ? await nextImageBatchId(stored.project.path) : undefined;
          const batchPath = batchId ? await localPath(stored.project.path, join('generated', 'runs', batchId)) : undefined;
          let ownsBatchPath = false;
          const copiedTargets: string[] = [];
          try {
            if (batchPath) {
              await directory(stored.project.path, 'generated/runs');
              await mkdir(batchPath);
              ownsBatchPath = true;
              await mkdir(join(batchPath, '.input'));
            }
            for (const [index, source] of sources.entries()) {
              const extension = extname(source).toLowerCase();
              const target = batchId
                ? join('generated', 'runs', batchId, '.input', `slide-${String(index + 1).padStart(2, '0')}${extension}`)
                : join(stored.project.kind === 'video' ? 'assets/imported' : 'generated', `${randomUUID()}${extension}`);
              const destination = await localPath(stored.project.path, target);
              try {
                await copyLocal(source, destination);
                copiedTargets.push(destination);
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') await rm(destination, { force: true });
                throw error;
              }
            }
          } catch (error) {
            if (ownsBatchPath && batchPath) await rm(batchPath, { recursive: true, force: true });
            else for (const target of copiedTargets) await rm(target, { force: true });
            throw error;
          }
          result = await detail(root, stored, services); break;
        }
        case 'projects.deleteAsset': {
          result = await deleteProjectAsset(root, stored, payload, services);
          break;
        }
        case 'projects.approve': {
          if (typeof payload.approved !== 'boolean') throw new Error('A aprovação deve ser explícita.');
          if (payload.approved && stored.formatAdaptation && stored.project.kind === 'image') throw new Error('Adapte os textos ao novo formato antes de aprovar imagens.');
          const path = await localPath(stored.project.path, text(payload, 'path', 4000));
          if (!kinds[extname(path).toLowerCase()] || relative(stored.project.path, path).split(/[\\/]/).some((part) => part.startsWith('.'))) throw new Error('Artefato não aprovável.');
          const key = relative(stored.project.path, path).split('\\').join('/');
          const batch = key.match(/^generated\/runs\/([0-9]{13}-[a-f0-9]{8})\//i)?.[1];
          if (payload.approved && batch) {
            const view = await detail(root, stored, services);
            const selected = view.batches?.find(candidate => candidate.id === batch);
            const expectedPages = view.visualReview?.pages.length ?? 0;
            if (!selected || selected.status?.state !== 'ready' || expectedPages < 1 || selected.sourceCount !== expectedPages || selected.assets.length !== expectedPages) {
              throw new Error('A rodada precisa estar completa e verificada antes da aprovação.');
            }
          }
          if (payload.approved) {
            stored.approvals[key] = (await fingerprint(path)).stamp;
            if (stored.redo) delete stored.redo[key];
          } else delete stored.approvals[key];
          await save(root, stored); result = await detail(root, stored, services); break;
        }
        case 'projects.export': result = await exportProject(root, stored, payload, services); break;
        case 'projects.review': result = await reviewAsset(root, stored, payload, services); break;
        case 'projects.exportZip': result = await exportZip(root, stored, payload, services); break;
        case 'projects.bridge': result = await bridge(root, stored, payload, services); break;
        case 'projects.deletePreview': return previewDeletion(await deletionInventory(root, stored, services));
        case 'projects.delete': result = await deleteProject(root, stored, payload, services); break;
        case 'projects.clone': { const cloned = await cloneProject(root, stored, payload); await save(root, cloned); result = cloned.project; break; }
        case 'projects.render': result = await render(root, stored, payload, services); break;
        default: throw new Error(`Ação desconhecida: ${action}`);
      }
    }
    services.emit({ type: 'refresh' });
    return result;
  });
}
