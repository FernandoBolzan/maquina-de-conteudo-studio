import { randomUUID } from 'node:crypto';
import { lstat, readFile, readdir, rm } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import type { Asset, Brand, BrandReference, Project, ProjectDetail } from '../shared/contracts.js';
import { text, type Services } from './context.js';
import { resolveTool, toolEnvironment } from './setup.js';
import { atomicJson, atomicText, copyLocal, directory, fingerprint, inside, localPath, missing, object, readJson, requireIdle, safeId, safePath, serialized, UUID, walk, workspace } from './content/storage.js';
import { initializeNative, secureStoryboard, storyboard } from './content/native.js';
import { renderCarousel } from './content/carousel.js';
interface StoredProject { project: Project; notes: string; approvals: Record<string, string>; }
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
  const rawApprovals = object(data.approvals, 'Aprovações');
  const approvals: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [path, stamp] of Object.entries(rawApprovals)) {
    if (typeof stamp !== 'string') throw new Error('Aprovação inválida; original preservado.');
    await localPath(project.path, path);
    approvals[path] = stamp;
  }
  if (!(await lstat(project.path)).isDirectory()) throw new Error('Pasta do projeto não encontrada.');
  return { project, notes: data.notes, approvals };
}
async function save(root: string, stored: StoredProject): Promise<void> { await atomicJson(recordPath(root, stored.project.id), stored); }
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
      if (action === 'projects.readText') {
        const file = await localPath(stored.project.path, text(payload, 'path', 4000));
        if (kinds[extname(file).toLowerCase()] !== 'file') throw new Error('Apenas documentos de texto possuem leitura integrada.');
        const content = (await readFile(file, 'utf8')).slice(0, 64 * 1024);
        return { content };
      }
      requireIdle(services, stored.project.id);
      switch (action) {
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
