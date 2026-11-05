import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, readdir, rm } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import type { Asset, Brand, BrandReference, NarrationState, Project, ProjectDetail } from '../shared/contracts.js';
import { text, type Services } from './context.js';
import { resolveTool, toolEnvironment } from './setup.js';
import { atomicJson, atomicText, copyLocal, directory, fingerprint, inside, localPath, missing, object, readJson, requireIdle, safeId, safePath, serialized, UUID, walk, workspace } from './content/storage.js';
import { initializeNative, secureStoryboard, storyboard } from './content/native.js';
import { renderCarousel } from './content/carousel.js';
import { listElevenLabsVoices } from './elevenlabs.js';
interface NarrationApproval { hash: string; approvedAt: string; }
interface NarrationAudio { hash: string; assetPaths: string[]; voiceId: string; }
interface StoredProject { project: Project; notes: string; approvals: Record<string, string>; narrationApproval?: NarrationApproval; narrationAudio?: NarrationAudio; }
const kinds: Record<string, Asset['kind']> = {
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image', '.avif': 'image', '.svg': 'image',
  '.mp4': 'video', '.webm': 'video', '.mov': 'video', '.mkv': 'video', '.m4v': 'video',
  '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.m4a': 'audio', '.flac': 'audio',
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
function recordPath(root: string, id: string): string { return join(root, '.studio', 'projects', `${safeId(id)}.json`); }
async function ids(root: string, folder: string): Promise<string[]> {
  const path = await directory(root, join('.studio', folder));
  return (await readdir(path)).filter((name) => UUID.test(name.replace(/\.json$/, '')) && name.endsWith('.json')).sort().map((name) => name.slice(0, -5));
}
async function load(root: string, id: string): Promise<StoredProject> {
  const data = object(await readJson(recordPath(root, id)), 'Registro do projeto');
  const item = object(data.project, 'Projeto');
  if (item.id !== id || typeof item.title !== 'string' || typeof item.createdAt !== 'string' || typeof item.brief !== 'string' || typeof data.notes !== 'string') throw new Error('Registro de projeto inválido; original preservado.');
  const project: Project = { id, title: item.title, createdAt: item.createdAt, brief: item.brief, kind: projectKind(item.kind), path: await localPath(root, join('projects', id)) };
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
  let narrationApproval: NarrationApproval | undefined;
  if (data.narrationApproval !== undefined) {
    const raw = object(data.narrationApproval, 'Aprovação da narração');
    if (typeof raw.hash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.hash) || typeof raw.approvedAt !== 'string') throw new Error('Aprovação da narração inválida; original preservado.');
    narrationApproval = { hash: raw.hash, approvedAt: raw.approvedAt };
  }
  let narrationAudio: NarrationAudio | undefined;
  if (data.narrationAudio !== undefined) {
    const raw = object(data.narrationAudio, 'Áudios de narração');
    if (typeof raw.hash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.hash) || typeof raw.voiceId !== 'string' || !Array.isArray(raw.assetPaths) || !raw.assetPaths.every((path) => typeof path === 'string')) throw new Error('Registro de áudio narrativo inválido; original preservado.');
    for (const path of raw.assetPaths as string[]) await localPath(project.path, path);
    narrationAudio = { hash: raw.hash, voiceId: raw.voiceId, assetPaths: raw.assetPaths as string[] };
  }
  if (!(await lstat(project.path)).isDirectory()) throw new Error('Pasta do projeto não encontrada.');
  return { project, notes: data.notes, approvals, narrationApproval, narrationAudio };
}
async function save(root: string, stored: StoredProject): Promise<void> { await atomicJson(recordPath(root, stored.project.id), stored); }
interface NarrationDocument { data: Record<string, unknown>; scenes: { raw: Record<string, unknown>; audio: Record<string, unknown>; id: string; title: string; narration: string; spokenText: string }[]; }
async function narrationDocument(stored: StoredProject): Promise<NarrationDocument> {
  const path = join(stored.project.path, 'storyboard.json');
  const data = await secureStoryboard(path, stored.project.path);
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
function narrationHash(scenes: NarrationDocument['scenes'], voiceId?: string): string {
  const payload = {
    modelId: 'eleven_v4',
    voiceId: voiceId ?? null,
    scenes: scenes.map((scene) => ({ id: scene.id, narration: scene.narration, spokenText: scene.spokenText })),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
async function narrationState(stored: StoredProject): Promise<unknown> {
  const { scenes } = await narrationDocument(stored);
  const hash = narrationHash(scenes, stored.project.voiceId);
  const audioRecordMatches = !!stored.narrationAudio?.assetPaths.length && stored.narrationAudio.hash === hash && stored.narrationAudio.voiceId === stored.project.voiceId;
  let audioReady = audioRecordMatches;
  let audioApproved = audioRecordMatches;
  if (audioRecordMatches) {
    for (const path of stored.narrationAudio!.assetPaths) {
      try {
        const file = await localPath(stored.project.path, path);
        if (kinds[extname(file).toLowerCase()] !== 'audio') throw new Error('Asset não é áudio.');
        const current = await fingerprint(file);
        if (!stored.approvals[path] || current.stamp !== stored.approvals[path]) audioApproved = false;
      } catch {
        audioReady = false;
        audioApproved = false;
        break;
      }
    }
  }
  return {
    voiceId: stored.project.voiceId,
    modelId: 'eleven_v4',
    scenes: scenes.map(({ id, title, narration, spokenText }) => ({ id, title, narration, spokenText })),
    approved: stored.narrationApproval?.hash === hash,
    audioReady,
    audioApproved,
  };
}
async function saveNarration(root: string, stored: StoredProject, payload: Record<string, unknown>): Promise<NarrationState> {
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
  if (oldHash !== newHash) {
    for (const path of stored.narrationAudio?.assetPaths ?? []) {
      delete stored.approvals[path];
      for (const scene of document.scenes) {
        const audio = scene.audio.narration;
        if (audio && typeof audio === 'object' && 'assetPath' in audio && audio.assetPath === path) delete scene.audio.narration;
      }
    }
    stored.narrationApproval = undefined;
    stored.narrationAudio = undefined;
  }
  stored.project.voiceId = voiceId;
  await atomicJson(join(stored.project.path, 'storyboard.json'), document.data);
  await save(root, stored);
  return await narrationState(stored) as NarrationState;
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
  return await narrationState(stored) as NarrationState;
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
  const voices = await listElevenLabsVoices(key);
  if (!voices.some((voice) => voice.id === stored.project.voiceId)) throw new Error('A voz escolhida não está mais disponível na conta ElevenLabs.');
  const engine = services.getSettings().enginePaths.videogo;
  if (!engine) throw new Error('VideoGo não está configurado. Instale ou vincule o motor em Configuração.');
  const cli = await localPath(await safePath(engine), 'dist/cli/index.js');
  if (!(await lstat(cli)).isFile()) throw new Error('VideoGo sem CLI compilada. Reinstale ou atualize o motor.');
  const node = await resolveTool('node', services);
  if (!node) throw new Error('Node.js não está instalado.');
  const storyboardPath = join(stored.project.path, 'storyboard.json');
  const env = {
    ...await toolEnvironment(services),
    ELEVENLABS_API_KEY: key,
    ELEVENLABS_MODEL: 'eleven_v4',
    VIDEOGO_NO_VOICE_CACHE: '1',
  };
  const job = await services.run({
    title: `VideoGo: gerar narração Eleven v4 — ${stored.project.title}`,
    executable: node,
    args: [cli, 'project', 'narration', storyboardPath, '--generate-audio', '--voice', stored.project.voiceId, '--allow-paid'],
    cwd: engine,
    env,
    projectId: stored.project.id,
    timeoutMs: 15 * 60 * 1000,
  });
  void services.waitJob(job.id).then(async (completed) => {
    if (completed.status !== 'succeeded') return;
    await serialized(root, async () => {
      const latest = await load(root, stored.project.id);
      const latestDocument = await narrationDocument(latest);
      if (narrationHash(latestDocument.scenes, latest.project.voiceId) !== hash) return;
      const assetPaths: string[] = [];
      for (const scene of latestDocument.scenes) {
        if (!scene.narration.trim()) continue;
        const attached = scene.audio.narration;
        if (!attached || typeof attached !== 'object' || !('assetPath' in attached) || typeof attached.assetPath !== 'string') throw new Error('O VideoGo terminou sem associar áudio às cenas narradas.');
        const path = await localPath(latest.project.path, attached.assetPath);
        if (!(await lstat(path)).isFile() || kinds[extname(path).toLowerCase()] !== 'audio') throw new Error('O VideoGo associou um asset de narração inválido.');
        assetPaths.push(relative(latest.project.path, path).split('\\').join('/'));
      }
      if (!assetPaths.length) throw new Error('O VideoGo não gerou áudios para o roteiro aprovado.');
      latest.narrationAudio = { hash, voiceId: stored.project.voiceId!, assetPaths };
      await save(root, latest);
      services.emit({ type: 'refresh' });
    });
  }).catch(() => {
    services.emit({ type: 'output', jobId: job.id, data: 'Geração concluída sem validação dos assets narrativos; revise o projeto antes de continuar.\\n' });
  });
  return job;
}
export async function listProjects(services: Services): Promise<Project[]> {
  const root = await workspace(services);
  const projects: Project[] = [];
  for (const id of await ids(root, 'projects')) projects.push((await load(root, id)).project);
  return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function readProject(id: string, services: Services): Promise<Project> { return (await load(await workspace(services), safeId(id))).project; }
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
    assets.push({ name: key, path, kind, url: services.assetUrl(path), approved });
  }
  for (const key of Object.keys(stored.approvals)) if (!current[key]) { delete stored.approvals[key]; changed = true; }
  if (changed) await save(root, stored);
  const rank = (asset: Asset): number => {
    if (asset.kind === 'image' && /^generated\/slide-\d+\.png$/i.test(asset.name)) return 0;
    if (asset.kind === 'video') return 1;
    if (asset.kind === 'image') return 2;
    if (asset.kind === 'audio') return 3;
    return 4;
  };
  assets.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return { ...stored.project, notes: stored.notes, assets };
}
export async function readProjectDetail(id: string, services: Services): Promise<ProjectDetail> {
  const root = await workspace(services);
  return serialized(root, async () => detail(root, await load(root, safeId(id)), services));
}
async function create(root: string, payload: Record<string, unknown>): Promise<StoredProject> {
  const id = randomUUID();
  const project: Project = { id, title: text(payload, 'title', 200), kind: projectKind(payload.kind), brief: payload.brief === undefined ? '' : freeText(payload, 'brief'), createdAt: new Date().toISOString(), path: await directory(root, join('projects', id)) };
  let brand: Brand | undefined;
  if (payload.brandId) { project.brandId = safeId(payload.brandId); brand = await brandAt(root, project.brandId); }
  try { await initializeNative(project, brand); }
  catch (error) { await rm(project.path, { recursive: true, force: true }); throw error; }
  return { project, notes: '', approvals: {} };
}
async function saveBrand(root: string, payload: Record<string, unknown>, services: Services): Promise<Brand> {
  const id = payload.id === undefined ? randomUUID() : safeId(payload.id);
  const existing = payload.id === undefined ? undefined : await brandAt(root, id, services);
  const name = text(payload, 'name', 200);
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
      const refName = (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string' && item.name.trim()) ? item.name.trim() : basename(source);
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
  const id = randomUUID();
  const path = await directory(root, join('projects', id));
  try {
    for (const file of files) await copyLocal(file, await localPath(path, relative(source, file)));
    if (kind === 'video') {
      const storyPath = join(path, 'storyboard.json');
      const secured = await secureStoryboard(storyPath, path, source);
      await atomicJson(storyPath, secured);
    }
    const project: Project = { id, title: native.title, kind, createdAt: new Date().toISOString(), path, brief: typeof native.objective === 'string' ? native.objective : '' };
    return { project, notes: '', approvals: {} };
  } catch (error) { await rm(path, { recursive: true, force: true }); throw error; }
}
async function exportProject(root: string, stored: StoredProject, payload: Record<string, unknown>, services: Services): Promise<string> {
  const view = await detail(root, stored, services);
  const approved = view.assets.filter((asset) => asset.approved);
  if (!approved.length) throw new Error('Aprove pelo menos um artefato antes de exportar.');
  const destination = await safePath(text(payload, 'destination', 4000));
  if (inside(stored.project.path, destination)) throw new Error('Exporte para fora da pasta do projeto.');
  await directory(destination, '.');
  const output = join(destination, `export-${stored.project.id}-${randomUUID()}`);
  await directory(destination, output);
  const manifest: { path: string; sha256: string; bytes: number; kind: Asset['kind'] }[] = [];
  try {
    for (const asset of approved) {
      const key = relative(stored.project.path, asset.path).split('\\').join('/');
      const before = await fingerprint(asset.path);
      if (before.stamp !== stored.approvals[key]) throw new Error(`A aprovação expirou: ${key}`);
      const target = await localPath(output, join('artifacts', key));
      await copyLocal(asset.path, target);
      const copied = await fingerprint(target);
      if (copied.sha256 !== before.sha256 || (await fingerprint(asset.path)).stamp !== before.stamp) throw new Error(`O artefato mudou durante a exportação: ${key}`);
      manifest.push({ path: `artifacts/${key}`, sha256: copied.sha256, bytes: copied.size, kind: asset.kind });
    }
    await atomicJson(join(output, 'MANIFEST.json'), { schema: 'maquina.export/v1', project: { id: stored.project.id, title: stored.project.title, kind: stored.project.kind, sourceProjectId: stored.project.sourceProjectId }, exportedAt: new Date().toISOString(), approval: 'explicit-human-per-artifact', artifacts: manifest });
    return output;
  } catch (error) { await rm(output, { recursive: true, force: true }); throw error; }
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
  const view = await detail(root, stored, services);
  const allInputs = view.assets.filter((asset) => asset.kind === stored.project.kind);
  const slideInputs = allInputs.filter((asset) => /^generated\/slide-\d+\.png$/i.test(asset.name));
  const inputs = slideInputs.length > 0 ? slideInputs : allInputs;
  if (!inputs.length) throw new Error('Importe ou produza mídia real antes de derivar o projeto.');
  const created = await create(root, { title: `${stored.project.title} — ${kind === 'video' ? 'vídeo' : 'imagens'}`, kind, brief: stored.project.brief, brandId: stored.project.brandId });
  created.project.sourceProjectId = stored.project.id;
  const path = created.project.path;
  const provenance: { source: string; sha256: string; artifact: string }[] = [];
  try {
    if (kind === 'video') {
      const imagePaths: string[] = [];
      const segments: string[] = [];
      const work = await directory(path, '.bridge');
      for (const [index, asset] of inputs.entries()) {
        const target = join('assets', 'visuals', 'generated', `${randomUUID()}${extname(asset.path).toLowerCase()}`);
        await copyLocal(asset.path, await localPath(path, target));
        imagePaths.push(target.split('\\').join('/'));
        provenance.push({ source: asset.name, sha256: (await fingerprint(join(path, target))).sha256, artifact: imagePaths[index]! });
        const segment = `segment-${index}.mp4`;
        await runMedia(services, stored.project.id, `Derivar imagem ${index + 1}/${inputs.length}`, ['-loop', '1', '-i', join(path, target), '-t', '5', '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1', '-r', '30', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-threads', '2', join(work, segment)], path);
        segments.push(`file '${segment}'`);
      }
      const concat = join(work, 'segments.ffconcat');
      await atomicText(concat, `ffconcat version 1.0\n${segments.join('\n')}\n`);
      await runMedia(services, stored.project.id, 'Montar vídeo derivado (sem áudio)', ['-f', 'concat', '-safe', '1', '-i', concat, '-c', 'copy', '-movflags', '+faststart', join(path, 'renders', 'review', 'derived.mp4')], path);
      await atomicJson(join(path, 'storyboard.json'), storyboard(created.project, imagePaths));
      await rm(work, { recursive: true, force: true });
    } else {
      for (const [index, asset] of inputs.entries()) {
        const source = join('assets', 'source', `${randomUUID()}${extname(asset.path).toLowerCase()}`);
        await copyLocal(asset.path, await localPath(path, source));
        const output = inputs.length === 1 ? 'generated/1-post.png' : `generated/${index + 1}-frame.png`;
        await runMedia(services, stored.project.id, `Extrair quadro ${index + 1}/${inputs.length}`, ['-i', join(path, source), '-frames:v', '1', '-vf', 'scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=black', '-threads', '2', join(path, output)], path);
        provenance.push({ source: asset.name, sha256: (await fingerprint(join(path, source))).sha256, artifact: output });
      }
      if (inputs.length > 1) {
        const file = join(path, 'project.json');
        const native = object(await readJson(file), 'Projeto');
        // PostNow carousels require cover, body and CTA; two clips remain a one-art post with an extra reference.
        if (inputs.length >= 3) {
          native.type = 'carousel'; native.page_count = inputs.length;
          native.pages = inputs.map((_, index) => ({ page: index + 1, role: index === 0 ? 'cover' : index === inputs.length - 1 ? 'cta' : 'body', copy: '', visual_function: 'Quadro extraído de vídeo; revisão editorial pendente.', prompt_file: `prompts/${String(index + 1).padStart(2, '0')}.md` }));
          for (let index = 0; index < inputs.length; index++) await atomicText(join(path, 'prompts', `${String(index + 1).padStart(2, '0')}.md`), '# Quadro derivado\n\nMídia extraída localmente com FFmpeg; revise narrativa, direitos e copy antes da entrega.\n');
        } else await copyLocal(join(path, 'generated/1-frame.png'), join(path, 'generated/1-post.png'));
        await atomicJson(file, native);
      }
    }
    await atomicJson(join(path, 'DERIVATION.json'), { schema: 'maquina.derivation/v1', sourceProjectId: stored.project.id, createdAt: new Date().toISOString(), method: kind === 'video' ? 'ffmpeg-still-slideshow-5s-per-image-no-audio' : 'ffmpeg-first-frame-per-video', artifacts: provenance });
    created.notes = 'Derivação local determinística com FFmpeg. Não é geração por IA. Os artefatos precisam de nova aprovação humana.';
    await save(root, created);
    return created.project;
  } catch (error) { await rm(path, { recursive: true, force: true }); throw error; }
}
async function render(root: string, stored: StoredProject, services: Services): Promise<unknown> {
  if (stored.project.kind === 'image') {
    const brand = stored.project.brandId ? await brandAt(root, stored.project.brandId, services) : undefined;
    const job = await renderCarousel(stored.project, brand, services);
    void services.waitJob(job.id).then(() => services.emit({ type: 'refresh' })).catch(() => undefined);
    return job;
  }
  if (stored.project.voiceId) {
    const document = await narrationDocument(stored);
    if (document.scenes.some((scene) => scene.narration.trim())) {
      const narration = await narrationState(stored) as NarrationState;
      if (!narration.approved) throw new Error('A narração mudou após a aprovação. Revise-a novamente antes do render.');
      if (!narration.audioReady) throw new Error('Gere novamente os áudios da narração aprovada antes do render.');
      if (!narration.audioApproved) throw new Error('Aprove cada áudio gerado na prévia antes do render final.');
    }
  }
  const engine = services.getSettings().enginePaths.videogo;
  if (!engine) throw new Error('VideoGo não está configurado. Instale ou vincule o motor em Configuração.');
  const cli = await localPath(await safePath(engine), 'dist/cli/index.js');
  if (!(await lstat(cli)).isFile()) throw new Error('VideoGo sem CLI compilada. Reinstale ou atualize o motor.');
  const node = await resolveTool('node', services);
  if (!node) throw new Error('Node.js não está instalado.');
  const path = join(stored.project.path, 'storyboard.json');
  await secureStoryboard(path, stored.project.path);
  const job = await services.run({ title: `VideoGo: ${stored.project.title} (revisão silenciosa)`, executable: node, args: [cli, 'project', 'render', path, '--voice', 'demo'], cwd: engine, env: await toolEnvironment(services), projectId: stored.project.id, timeoutMs: 60 * 60 * 1000 });
  void services.waitJob(job.id).then(() => services.emit({ type: 'refresh' })).catch(() => undefined);
  return job;
}
export async function handleProjects(action: string, payload: Record<string, unknown>, services: Services): Promise<unknown> {
  if (action === 'projects.list') return listProjects(services);
  if (action === 'brands.list') return listBrands(services);
  const root = await workspace(services);
  return serialized(root, async () => {
    let result: unknown;
    if (action === 'brands.save') result = await saveBrand(root, payload, services);
    else if (action === 'projects.create' || action === 'projects.import') {
      const stored = action === 'projects.create' ? await create(root, payload) : await importProject(root, payload);
      await save(root, stored); result = stored.project;
    } else {
      const stored = await load(root, safeId(payload.id));
      if (action === 'projects.detail') return detail(root, stored, services);
      if (action === 'projects.narration') return narrationState(stored);
      if (action === 'projects.readText') {
        const file = await localPath(stored.project.path, text(payload, 'path', 4000));
        if (kinds[extname(file).toLowerCase()] !== 'file') throw new Error('Apenas documentos de texto possuem leitura integrada.');
        const content = (await readFile(file, 'utf8')).slice(0, 64 * 1024);
        return { content };
      }
      requireIdle(services, stored.project.id);
      switch (action) {
        case 'projects.narration.save': result = await saveNarration(root, stored, payload); break;
        case 'projects.narration.approve': result = await approveNarration(root, stored, services, payload); break;
        case 'projects.narration.generate': result = await generateNarration(root, stored, services, payload); break;
        case 'projects.notes':
          stored.notes = freeText(payload, 'notes');
          if (payload.brief !== undefined) stored.project.brief = freeText(payload, 'brief');
          await save(root, stored); result = await detail(root, stored, services); break;
        case 'projects.importAsset': {
          const source = await safePath(text(payload, 'path', 4000));
          const extension = extname(source).toLowerCase();
          if (!kinds[extension]) throw new Error('Formato de artefato não suportado.');
          const target = join(stored.project.kind === 'video' ? 'assets/imported' : 'generated', `${randomUUID()}${extension}`);
          await copyLocal(source, await localPath(stored.project.path, target));
          result = await detail(root, stored, services); break;
        }
        case 'projects.approve': {
          if (typeof payload.approved !== 'boolean') throw new Error('A aprovação deve ser explícita.');
          const path = await localPath(stored.project.path, text(payload, 'path', 4000));
          if (!kinds[extname(path).toLowerCase()] || relative(stored.project.path, path).split(/[\\/]/).some((part) => part.startsWith('.'))) throw new Error('Artefato não aprovável.');
          const key = relative(stored.project.path, path).split('\\').join('/');
          if (payload.approved) stored.approvals[key] = (await fingerprint(path)).stamp;
          else delete stored.approvals[key];
          await save(root, stored); result = await detail(root, stored, services); break;
        }
        case 'projects.export': result = await exportProject(root, stored, payload, services); break;
        case 'projects.bridge': result = await bridge(root, stored, payload, services); break;
        case 'projects.render': result = await render(root, stored, services); break;
        default: throw new Error(`Ação desconhecida: ${action}`);
      }
    }
    services.emit({ type: 'refresh' });
    return result;
  });
}
