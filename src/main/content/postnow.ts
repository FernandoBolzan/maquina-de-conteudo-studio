import type { RevisionSource } from '../../shared/image-revision.js';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { Brand, PostNowFormatId, Project } from '../../shared/contracts.js';
import { POSTNOW_FORMATS, formatCanvas, isPostNowFormat } from '../../shared/formats.js';
import { isLogoPolicy, logoPagesFor, type LogoPolicy } from '../../shared/logo-policy.js';
import { isDepictedPerson, portraitPlanIssues, type DepictedPerson } from '../../shared/depicted-person.js';
import type { Services } from '../context.js';
import { resolveTool, toolEnvironment } from '../setup/tools.js';
import { atomicJson, atomicText, copyLocal, directory, fingerprint, localPath, missing, object, readJson, reserveProject } from './storage.js';
import { CONFORM_SCRIPT, FIND_FREE_AREA_SCRIPT, MAX_CROP_PERCENT_PER_SIDE, PROBE_SCRIPT, parseImageSize, planCenterCrop } from './conform.js';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
export async function nextImageBatchId(projectPath: string): Promise<string> {
  const runsPath = await directory(projectPath, 'generated/runs');
  let latest = 0;
  for (const name of await readdir(runsPath)) {
    const timestamp = name.match(/^(\d{13})-[a-f0-9]{8}$/i)?.[1];
    if (timestamp) latest = Math.max(latest, Number(timestamp));
  }
  return `${Math.max(Date.now(), latest + 1)}-${randomUUID().slice(0, 8)}`;
}
function slug(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72).replace(/-+$/g, '') || 'projeto';
}
/** Mirrors postnow.clients.slugify exactly: the engine, not the Studio, owns client ids. */
function engineClientSlug(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!normalized) throw new Error('O nome da marca precisa conter letras ou números não acentuados para o PostNow.');
  return normalized;
}

export async function postnowRuntimeStatus(services: Services): Promise<{ pythonVersion?: string; pillowVersion?: string }> {
  const root = services.getSettings().enginePaths.postnow;
  try {
    const python = root ? join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python') : await resolveTool('python', services);
    if (!python) return {};
    const env = await toolEnvironment(services);
    if (root) env.PYTHONPATH = root;
    const [version, pillow] = await Promise.all([
      services.capture(python, ['--version'], { cwd: services.dataDir, env, timeoutMs: 15000 }),
      services.capture(python, ['-c', 'import PIL; print(PIL.__version__)'], { cwd: services.dataDir, env, timeoutMs: 15000 }),
    ]);
    const pythonVersion = (version.stdout + '\n' + version.stderr).match(/\b(\d+\.\d+(?:\.\d+)?)/)?.[1];
    const pillowVersion = pillow.code === 0 ? pillow.stdout.trim().match(/^\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?$/)?.[0] : undefined;
    return { pythonVersion, pillowVersion };
  } catch { return {}; }
}

async function checkedCapture(services: Services, python: string, root: string, env: Record<string, string>, args: string[], message: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const result = await services.capture(python, ['-m', 'postnow', ...args], { cwd: root, env, timeoutMs: 60_000, signal });
  if (result.code !== 0) throw new Error(`${message}${result.stderr.trim() ? ` ${result.stderr.trim()}` : ''}`);
  return result.stdout.trim();
}

const ENGINE_GENERATION_POLICY = {
  copy: 'generated_in_image',
  effects: 'generated_in_image',
  logo: 'official_asset_applied_after_generation',
  client_portrait: 'approved_profile_portrait_when_client_is_depicted',
};
/** Espelha postnow/projects.py (GENERATION_POLICY, PROMPT_POLICY_MARKERS e instruções de identidade). O `project check` do motor revalida tudo; divergência aparece como bloqueio do motor. */
const ENGINE_POLICY_MARKERS = [
  'POSTNOW_COPY_RENDERING=generated_in_image',
  'POSTNOW_EFFECTS_RENDERING=generated_in_image',
  'POSTNOW_LOGO_RENDERING=official_asset_applied_after_generation',
  'POSTNOW_PORTRAIT_POLICY=approved_profile_portrait_when_client_is_depicted',
];
const IDENTITY_KEY = 'POSTNOW_DEPICTED_PERSON=';
const NONE_INSTRUCTION = 'Não mostre pessoas nem rostos nesta arte.';
const OTHER_PERSON_INSTRUCTION = 'A pessoa retratada é outra pessoa, não o cliente; não use o retrato do cliente para representá-la.';
const PORTRAIT_INSTRUCTION_PREFIX = 'Use somente o retrato aprovado do cliente em `';
const POLICY_HEADING = '## Política de geração PostNow';
/** Textos idênticos a `_person_identity_instruction` do motor: o `project check` exige a linha literal no prompt. */
function identityInstruction(depictedPerson: DepictedPerson, ownerPortrait: string | undefined): string {
  if (depictedPerson === 'none') return NONE_INSTRUCTION;
  if (depictedPerson === 'other_person') return OTHER_PERSON_INSTRUCTION;
  if (!ownerPortrait) throw new Error('Cliente (retrato aprovado) exige um retrato aprovado no perfil PostNow da marca.');
  return `${PORTRAIT_INSTRUCTION_PREFIX}${ownerPortrait}\` como referência de identidade; preserve seu rosto reconhecível e não o substitua por uma pessoa genérica.`;
}
function isIdentityInstruction(text: string): boolean {
  return text === NONE_INSTRUCTION || text === OTHER_PERSON_INSTRUCTION || text.startsWith(PORTRAIT_INSTRUCTION_PREFIX);
}
function requireDepictedPerson(value: unknown, index: number): DepictedPerson {
  if (!isDepictedPerson(value)) throw new Error(`Página ${index + 1}: defina quem aparece na arte (Ninguém, Outra pessoa ou Cliente (retrato aprovado)) antes de gerar imagens.`);
  return value;
}
/** Texto que o motor lê: o prompt do Studio sem linhas de política anteriores, seguido do bloco canônico. Idempotente. */
export function composeEnginePrompt(prompt: string, depictedPerson: DepictedPerson, ownerPortrait?: string): string {
  const managedPrefixes = [...ENGINE_POLICY_MARKERS.map(marker => marker.slice(0, marker.indexOf('=') + 1)), IDENTITY_KEY];
  const kept = prompt.split(/\r?\n/).filter(line => {
    const text = line.trim();
    return text !== POLICY_HEADING && !isIdentityInstruction(text) && !managedPrefixes.some(prefix => text.startsWith(prefix));
  });
  while (kept.length && !kept[kept.length - 1]!.trim()) kept.pop();
  return [...kept, ...(kept.length ? [''] : []), POLICY_HEADING, ...ENGINE_POLICY_MARKERS, `${IDENTITY_KEY}${depictedPerson}`, identityInstruction(depictedPerson, ownerPortrait), ''].join('\n');
}
/** Nome do perfil da marca no motor. */
function engineClientName(brand: Brand): string {
  return `Studio ${brand.id} ${brand.name}`;
}
/** Id do perfil da marca no motor: slug do nome. */
export function engineClientId(brand: Brand): string {
  return engineClientSlug(engineClientName(brand));
}
/** Pasta de dados do motor: `POSTNOW_HOME` quando definido, senão a pasta padrão do Studio. */
function engineHome(env: Record<string, string>, services: Services): string {
  return env.POSTNOW_HOME || join(services.dataDir, 'engine-data', 'postnow');
}
export async function postnowHome(services: Services): Promise<string> {
  return engineHome(await toolEnvironment(services), services);
}
/** Retrato aprovado da marca (`brand.owner_portrait` no perfil do motor, relativo a `references/`); undefined sem perfil ou sem retrato. */
export async function approvedPortraitAt(home: string, brand: Brand): Promise<string | undefined> {
  const profileDir = join(home, 'clients', engineClientId(brand));
  const profilePath = join(profileDir, 'profile.json');
  if ((await lstat(profilePath).catch(() => undefined))?.isFile()) {
    try {
      const profile = object(await readJson(profilePath), 'Perfil PostNow');
      const portrait = object(profile.brand ?? {}, 'Marca do perfil PostNow').owner_portrait;
      if (typeof portrait === 'string' && portrait.trim()) return portrait;
    } catch { /* Fallback para fotos cadastradas da marca */ }
  }
  const portraitRef = brand.references?.find(r => r.kind === 'image' && /portrait|rosto|perfil|foto|whatsapp/i.test(r.name));
  if (portraitRef) {
    try {
      const refDir = join(profileDir, 'references');
      await mkdir(refDir, { recursive: true });
      const relPath = `references/${basename(portraitRef.path)}`;
      const target = join(profileDir, relPath);
      if (!(await lstat(target).catch(() => undefined))) {
        await copyLocal(portraitRef.path, target).catch(() => undefined);
      }
      const profile = {
        client_id: engineClientId(brand),
        name: brand.name,
        brand: {
          colors: brand.colors,
          owner_portrait: relPath,
          reference_images: [relPath],
        },
      };
      await atomicJson(profilePath, profile);
      return relPath;
    } catch { /* Ignora se houver erro de IO */ }
  }
  return undefined;
}

async function ensureClient(services: Services, python: string, engineRoot: string, env: Record<string, string>, brand: Brand, pageCount: number, signal?: AbortSignal): Promise<string> {
  if (!brand.logo) throw new Error(`A marca “${brand.name}” não tem logo oficial. Cadastre uma logo PNG em Marcas & Identidade antes de preparar as imagens no PostNow.`);
  if (extname(brand.logo).toLowerCase() !== '.png') throw new Error('O motor PostNow exige a logo oficial em PNG. Exporte a marca como PNG e atualize o cadastro.');
  const clientName = engineClientName(brand);
  const clientId = engineClientId(brand);
  const clients = await checkedCapture(services, python, engineRoot, env, ['client', 'list'], 'PostNow não conseguiu listar os perfis de marca.', signal);
  const exists = clients.split(/\r?\n/).some(line => line.split(/\s+/)[0] === clientId);
  if (exists) {
    await checkedCapture(services, python, engineRoot, env, ['client', 'set-logo', clientId, '--logo', brand.logo], 'PostNow não conseguiu sincronizar a logo oficial.', signal);
  } else {
    await checkedCapture(services, python, engineRoot, env, ['client', 'add', '--non-interactive', '--name', clientName, '--logo', brand.logo, '--page-count', String(Math.max(3, pageCount))], 'PostNow não conseguiu cadastrar a marca.', signal);
  }
  return clientId;
}
interface NativeProjectSync { clientId: string; nativeProject: string; projectData: Record<string, unknown>; }
async function synchronizeNativeProject(project: Project, format: PostNowFormatId, brand: Brand, batchId: string, pageCount: number, engineRoot: string, python: string, env: Record<string, string>, home: string, services: Services, attempt?: string, signal?: AbortSignal): Promise<NativeProjectSync> {
  const nativePath = await localPath(project.path, 'project.json');
  const native = object(await readJson(nativePath), 'Projeto PostNow');
  const type = POSTNOW_FORMATS[format].kind;
  const sourcePages = Array.isArray(native.pages) ? native.pages : [];
  if (sourcePages.length !== pageCount) throw new Error('A quantidade de imagens deve corresponder ao roteiro aprovado.');
  const identities = sourcePages.map((source, index) => requireDepictedPerson(object(source, 'Página PostNow').depicted_person, index));
  const ownerPortrait = await approvedPortraitAt(home, brand);
  const portraitIssues = portraitPlanIssues(type, identities, ownerPortrait !== undefined);
  if (portraitIssues.length) throw new Error(portraitIssues.join(' '));
  const pages: Record<string, unknown>[] = sourcePages.map((source, index) => {
    const page = object(source, 'Página PostNow');
    return { ...page, page: index + 1, role: type === 'story' ? 'story' : type === 'post' ? 'single' : index === 0 ? 'cover' : index === pageCount - 1 ? 'cta' : 'body', depicted_person: identities[index] };
  });
  const projectData = { ...native, type, format, page_count: pageCount, page_count_approved: true, generation_policy: ENGINE_GENERATION_POLICY, pages };
  const clientId = await ensureClient(services, python, engineRoot, env, brand, pageCount, signal);
  const nativeSlug = `${slug(project.title)}-${attempt ? `tentativa-${attempt}-` : ''}${batchId}`;
  const nativeProject = join(home, 'clients', clientId, 'projects', nativeSlug);
  const existing = await lstat(nativeProject).catch(() => undefined);
  if (!existing) {
    const createArgs = ['project', 'create', '--client', clientId, '--title', project.title, '--type', type, '--format', format, '--slug', nativeSlug];
    if (type === 'carousel') createArgs.push('--page-count', String(pageCount), '--approve-page-count');
    await checkedCapture(services, python, engineRoot, env, createArgs, 'PostNow não conseguiu criar o projeto nativo.', signal);
    await atomicJson(join(nativeProject, '.studio-owner.json'), { projectId: project.id, batchId });
  } else {
    if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error('O caminho nativo PostNow já existe e não é uma pasta segura.');
    const owner = object(await readJson(join(nativeProject, '.studio-owner.json')), 'Proprietário do projeto PostNow');
    if (owner.projectId !== project.id || owner.batchId !== batchId) throw new Error('O projeto nativo pertence a outra rodada. Nenhum arquivo foi alterado.');
  }
  await directory(nativeProject, 'prompts');
  await directory(nativeProject, 'generated');
  await directory(nativeProject, 'research');
  await atomicJson(join(nativeProject, 'project.json'), { ...projectData, project_id: nativeSlug, client_id: clientId, client_name: brand.name, title: project.title });
  for (const [index, page] of pages.entries()) {
    signal?.throwIfAborted();
    const promptPath = await localPath(project.path, String(page.prompt_file));
    if (!(await lstat(promptPath).catch(() => undefined))?.isFile()) throw new Error(`Prompt PostNow ausente: ${page.prompt_file}`);
    await atomicText(join(nativeProject, String(page.prompt_file)), composeEnginePrompt(await readFile(promptPath, 'utf8'), identities[index]!, ownerPortrait));
  }
  const storyboardPath = await localPath(project.path, 'storyboard.md');
  if ((await lstat(storyboardPath).catch(() => undefined))?.isFile()) await atomicText(join(nativeProject, 'storyboard.md'), await readFile(storyboardPath, 'utf8'));
  const claimsPath = await localPath(project.path, 'research/claims.json');
  await atomicJson(join(nativeProject, 'research/claims.json'), await readJson(claimsPath));
  await checkedCapture(services, python, engineRoot, env, ['project', 'check', nativeProject, '--stage', 'generation'], 'PostNow bloqueou a geração por pendências editoriais ou estrutura incompleta.', signal);
  return { clientId, nativeProject, projectData };
}

interface PostNowRuntime { engineRoot: string; python: string; env: Record<string, string>; home: string; }
async function resolvePostNow(services: Services): Promise<PostNowRuntime> {
  const engineRoot = services.getSettings().enginePaths.postnow;
  if (!engineRoot) throw new Error('PostNow não está configurado. Instale ou vincule o motor em Motores & Setup.');
  const python = join(engineRoot, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!(await stat(python).catch(() => undefined))?.isFile()) throw new Error('O ambiente Python do PostNow não está instalado. Reinstale o motor em Motores & Setup.');
  const env = await toolEnvironment(services);
  env.PYTHONPATH = engineRoot;
  const home = engineHome(env, services);
  env.POSTNOW_HOME = home;
  return { engineRoot, python, env, home };
}

export interface BatchStatus { state: 'generating' | 'processing' | 'ready' | 'failed'; format?: PostNowFormatId; stage?: string; message?: string; updatedAt: string; }
const BATCH_ID = /^[0-9]{13}-[a-f0-9]{8}$/;
/** Grava o estado da rodada; sem `format` informado, mantém o formato já gravado. */
export async function writeBatchStatus(projectPath: string, batchId: string, status: Omit<BatchStatus, 'updatedAt'>): Promise<void> {
  if (!BATCH_ID.test(batchId)) throw new Error('Rodada de geração inválida.');
  const format = status.format ?? (await readBatchStatus(projectPath, batchId))?.format;
  await atomicJson(await localPath(projectPath, join('generated', 'runs', batchId, '.status.json')), { ...status, ...(format ? { format } : {}), updatedAt: new Date().toISOString() });
}
export async function readBatchStatus(projectPath: string, batchId: string): Promise<BatchStatus | undefined> {
  if (!BATCH_ID.test(batchId)) return undefined;
  try {
    const value = object(await readJson(await localPath(projectPath, join('generated', 'runs', batchId, '.status.json'))), 'Estado da rodada');
    if (!['generating', 'processing', 'ready', 'failed'].includes(String(value.state)) || typeof value.updatedAt !== 'string') return undefined;
    return { state: value.state as BatchStatus['state'], updatedAt: value.updatedAt, ...(isPostNowFormat(value.format) ? { format: value.format } : {}), ...(typeof value.stage === 'string' ? { stage: value.stage } : {}), ...(typeof value.message === 'string' ? { message: value.message } : {}) };
  } catch { return undefined; }
}

/** `.status.json` existe, mesmo que ilegível. Só ausência (ENOENT) conta como rodada sem estado. */
async function statusFileExists(projectPath: string, batchId: string): Promise<boolean> {
  try {
    await lstat(await localPath(projectPath, join('generated', 'runs', batchId, '.status.json')));
    return true;
  } catch (error) {
    if (missing(error)) return false;
    throw error;
  }
}

/**
 * Rodada entregue: o app gravou `.mapping.json` antes de `ready`. `ready` sem mapping pode ter sido escrito pelo agente e não entrega.
 * Estado ausente ou ilegível com mapping conta como entregue (falha fechada): a rodada não é reescrita.
 */
export async function isRoundDelivered(projectPath: string, batchId: string): Promise<boolean> {
  const mapping = await lstat(await localPath(projectPath, join('generated', 'runs', batchId, '.mapping.json'))).catch(() => undefined);
  if (mapping?.isFile() !== true) return false;
  const status = await readBatchStatus(projectPath, batchId);
  return status === undefined || status.state === 'ready';
}

export async function preparePostNowGeneration(project: Project, brand: Brand | undefined, batchId: string, services: Services): Promise<void> {
  if (project.kind !== 'image' || !BATCH_ID.test(batchId)) throw new Error('Projeto ou rodada inválida para geração PostNow.');
  if (!brand) throw new Error('Selecione uma marca com logo oficial antes de gerar imagens.');
  const { engineRoot, python, env, home } = await resolvePostNow(services);
  const native = object(await readJson(await localPath(project.path, 'project.json')), 'Projeto PostNow');
  const pageCount = Number(native.page_count);
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('O roteiro PostNow não tem quantidade de páginas válida.');
  if (!isPostNowFormat(project.format)) throw new Error('Formato removido ou ausente: escolha outro formato no Studio antes de continuar.');
  await synchronizeNativeProject(project, project.format, brand, batchId, pageCount, engineRoot, python, env, home, services);
}

/** A round must name its logo policy; the Studio asks the person before any engine or paid call. */
export function requireLogoPolicy(value: unknown): LogoPolicy {
  if (!isLogoPolicy(value)) throw new Error('Escolha onde aplicar a logo: capa e fechamento, todas as páginas ou nenhuma.');
  return value;
}
/** Slides in reading order, as stored. Empty slides are included; callers decide what reaches the engine. */
export async function readCarouselSlides(projectPath: string): Promise<CarouselSlide[]> {
  const native = object(await readJson(await localPath(projectPath, 'project.json')), 'Projeto PostNow');
  const pages = Array.isArray(native.pages) ? native.pages : [];
  const field = (value: unknown): string => (typeof value === 'string' ? value : '');
  return pages.map((raw: unknown, index: number): CarouselSlide => {
    const page = object(raw, `Página ${index + 1}`);
    return { page: index + 1, role: field(page.role), headline: field(page.headline), copy: field(page.copy), visualFunction: field(page.visual_function), promptFile: field(page.prompt_file) };
  });
}
function nativeImageName(type: string, index: number, count: number): string {
  if (type === 'post') return '1-post.png';
  if (type === 'story') return '1-story.png';
  return index === 1 ? '1-capa.png' : index === count ? `${count}-cta.png` : `${index}-pagina.png`;
}

export interface CarouselSlide { page: number; role: string; headline: string; copy: string; visualFunction: string; promptFile: string; }
export interface FinalizeResult { pages: number; adjusted: number[]; logoPages: number[]; }

/**
 * Turns the real images of one round into final PostNow art: validate raw inputs, scale them to the exact frame without cropping,
 * apply the official logo only on the pages that the round's logo policy names, mirror canonical names/COPY.md into the native project.
 */
export async function finalizePostNowBatch(project: Project, brand: Brand | undefined, batchId: string, services: Services, logoPolicy: LogoPolicy, expectedPages?: number, signal?: AbortSignal, revision?: RevisionSource): Promise<FinalizeResult> {
  if (project.kind !== 'image') throw new Error('O PostNow só executa projetos de imagem.');
  if (!BATCH_ID.test(batchId)) throw new Error('Rodada de geração inválida.');
  if (!brand) throw new Error('Selecione uma marca com logo oficial antes de aplicar o motor PostNow.');
  if (await isRoundDelivered(project.path, batchId)) throw new Error('Esta rodada já está pronta e não será sobrescrita.');
  const format = await roundFormat(project.path, batchId, project.format);
  const release = reserveProject(project.id);
  try {
    await writeBatchStatus(project.path, batchId, { state: 'processing', format, stage: 'validando', message: 'Conferindo as imagens da rodada.' });
    return await runFinalize(project, brand, batchId, services, logoPolicy, format, expectedPages, signal, revision);
  } catch (error) {
    await writeBatchStatus(project.path, batchId, { state: 'failed', message: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
    throw error;
  } finally { release(); }
}

/**
 * Formato com que a rodada é processada. Rodada com status válido (gerada pelo Studio) mantém o formato dela; rodada sem arquivo
 * de status é entrada crua (importada ou derivada) e recebe o formato atual do projeto. Status sem formato é legado e status
 * ilegível não é reinterpretado: ambos são recusados.
 */
export async function roundFormat(projectPath: string, batchId: string, projectFormat: unknown): Promise<PostNowFormatId> {
  const status = await readBatchStatus(projectPath, batchId);
  if (status) {
    if (!status.format) throw new Error('Esta rodada não tem formato registrado; gere uma nova rodada com o formato escolhido.');
    return status.format;
  }
  if (await statusFileExists(projectPath, batchId)) throw new Error('O estado desta rodada está ilegível; gere uma nova rodada com o formato escolhido.');
  if (!isPostNowFormat(projectFormat)) throw new Error('Formato removido ou ausente: escolha outro formato no Studio antes de continuar.');
  return projectFormat;
}
async function runFinalize(project: Project, brand: Brand, batchId: string, services: Services, logoPolicy: LogoPolicy, format: PostNowFormatId, expectedPages?: number, signal?: AbortSignal, revision?: RevisionSource): Promise<FinalizeResult> {
  const { engineRoot, python, env, home } = await resolvePostNow(services);
  const runPath = await localPath(project.path, join('generated', 'runs', batchId));
  const inputPath = await localPath(runPath, '.input');
  const names: string[] = [];
  for (const name of (await readdir(inputPath)).sort()) {
    if (!IMAGE_EXTENSIONS.has(extname(name).toLowerCase())) continue;
    const stat = await lstat(await localPath(inputPath, name));
    if (!stat.isFile() || stat.nlink > 1) throw new Error(`A entrada PostNow precisa ser arquivo comum, sem vínculos extras: ${name}`);
    names.push(name);
  }
  if (names.length === 0) throw new Error('Esta rodada ainda não tem imagens reais. Gere-as com a ferramenta de imagem ou importe os arquivos; o PostNow CLI não inventa imagens.');
  const numbered = names.every(name => /^slide-\d{2,3}\./.test(name));
  const byPage = new Map<number, string>();
  for (const [position, name] of names.entries()) {
    const page = numbered ? Number(name.match(/^slide-(\d+)\./)![1]) : position + 1;
    if (byPage.has(page)) throw new Error(`A rodada tem mais de uma imagem para a página ${page}.`);
    byPage.set(page, name);
  }
  const native = object(await readJson(await localPath(project.path, 'project.json')), 'Projeto PostNow');
  const type = POSTNOW_FORMATS[format].kind;
  const count = expectedPages ?? byPage.size;
  const keptPages = revision?.keptPages ?? [];
  const missing = Array.from({ length: count }, (_, index) => index + 1).filter(page => !byPage.has(page));
  if (missing.length) throw new Error(`Faltam as páginas ${missing.join(', ')} de ${count}. A rodada só continua com todas as artes; gere ou importe as que faltam.`);
  if (byPage.size > count) throw new Error(`A rodada tem ${byPage.size} imagens, mas o roteiro tem ${count} páginas.`);
  if (type === 'carousel' && count < 3) throw new Error('Um carrossel PostNow exige ao menos 3 imagens reais. Complete a rodada ou escolha Post único.');
  if (type !== 'carousel' && count !== 1) throw new Error(`O formato ${format} usa exatamente uma imagem por projeto.`);
  if (revision && keptPages.some(page => page < 1 || page > count || revision.redonePages.includes(page))) throw new Error('Revisão inválida: as páginas mantidas não correspondem ao roteiro.');
  const { width, height } = formatCanvas(format);

  const conformedPath = await directory(runPath, '.conformed');
  const adjusted: number[] = [];
  for (let page = 1; page <= count; page++) {
    if (keptPages.includes(page)) continue;
    signal?.throwIfAborted();
    const target = join(conformedPath, `slide-${String(page).padStart(2, '0')}.png`);
    await rm(target, { force: true });
    await writeBatchStatus(project.path, batchId, { state: 'processing', stage: 'ajustando', message: `Ajustando a página ${page} de ${count} ao formato ${width}×${height}.` });
    const source = await localPath(inputPath, byPage.get(page)!);
    const probe = await services.capture(python, ['-c', PROBE_SCRIPT, source], { cwd: engineRoot, env, timeoutMs: 60_000, signal });
    if (probe.code !== 0) throw new Error(`Não foi possível ler a imagem da página ${page}. ${probe.stderr.trim()}`);
    const size = parseImageSize(probe.stdout);
    const plan = planCenterCrop(size, { width, height });
    if (!plan) throw new Error(`A página ${page} tem ${size.width}×${size.height}; fechar ${width}×${height} exigiria recortar mais de ${MAX_CROP_PERCENT_PER_SIDE}% por lado. Gere uma nova rodada.`);
    const result = await services.capture(python, ['-c', CONFORM_SCRIPT, source, target, String(width), String(height), String(size.width), String(size.height), String(plan.left), String(plan.top), String(plan.width), String(plan.height)], { cwd: engineRoot, env, timeoutMs: 60_000, signal });
    if (result.code !== 0) throw new Error(`Não foi possível ajustar a imagem da página ${page}. ${result.stderr.trim()}`);
    if (plan.cropped || size.width !== width || size.height !== height) adjusted.push(page);
  }

  const attempt = randomUUID().slice(0, 8);
  const { clientId, nativeProject } = await synchronizeNativeProject(project, format, brand, batchId, count, engineRoot, python, env, home, services, attempt, signal);
  const stagingPath = await directory(runPath, `.staging-${attempt}`);
  try {
  const withLogo = logoPagesFor(logoPolicy, count).filter(page => !keptPages.includes(page));
  const logoPng = await readFile(brand.logo!);
  if (logoPng.length < 24 || logoPng.readUInt32BE(0) !== 0x89504e47) throw new Error('A logo oficial não é um PNG válido.');
  const aspect = logoPng.readUInt32BE(16) / Math.max(1, logoPng.readUInt32BE(20));
  const box = Math.round(width * 0.18);
  const logoWidth = aspect >= 1 ? box : Math.max(1, Math.round(box * aspect));
  const logoHeight = aspect >= 1 ? Math.max(1, Math.round(box / aspect)) : box;
  const x = width - Math.round(width * 0.07) - logoWidth;
  const y = height - Math.round(height * 0.12) - logoHeight;

  const mirrorGenerated = await directory(nativeProject, 'generated');
  for (let page = 1; page <= count; page++) {
    const output = join(runPath, `slide-${String(page).padStart(2, '0')}.png`);
    if (await lstat(output).catch(() => undefined)) throw new Error('Esta rodada já possui saídas. Para preservá-las, crie outra rodada em vez de sobrescrevê-las.');
  }
  for (let page = 1; page <= count; page++) {
    signal?.throwIfAborted();
    const input = keptPages.includes(page) ? join(inputPath, byPage.get(page)!) : join(conformedPath, `slide-${String(page).padStart(2, '0')}.png`);
    const output = join(stagingPath, `slide-${String(page).padStart(2, '0')}.png`);
    if (await lstat(join(mirrorGenerated, nativeImageName(type, page, count))).catch(() => undefined)) throw new Error('A rodada nativa já possui imagens; nenhuma saída existente será sobrescrita.');
    if (withLogo.includes(page)) {
      await writeBatchStatus(project.path, batchId, { state: 'processing', stage: 'logo', message: `Aplicando a logo oficial na página ${page} em área livre com máxima visibilidade.` });
      let posX = x;
      let posY = y;
      try {
        const probe = await services.capture(python, ['-c', FIND_FREE_AREA_SCRIPT, input, brand.logo!, String(logoWidth), String(logoHeight)], { cwd: engineRoot, env, timeoutMs: 30000, signal });
        if (probe.code === 0 && probe.stdout.trim()) {
          const parsed: unknown = JSON.parse(probe.stdout.trim());
          if (typeof parsed === 'object' && parsed !== null && 'x' in parsed && 'y' in parsed) {
            const { x: px, y: py } = parsed as { x: number; y: number };
            if (typeof px === 'number' && typeof py === 'number' && px >= 0 && py >= 0) {
              posX = px;
              posY = py;
            }
          }
        }
      } catch { /* Mantém coordenadas padrão */ }
      const result = await services.capture(python, ['-m', 'postnow', 'logo', 'apply', '--client', clientId, '--input', input, '--output', output, '--x', String(posX), '--y', String(posY), '--width', String(logoWidth)], { cwd: engineRoot, env, timeoutMs: 60_000, signal });
      if (result.code !== 0) throw new Error(`O PostNow não aplicou a logo na página ${page}: ${result.stderr.trim() || result.stdout.trim()}`);
    } else await copyLocal(input, output);
    await copyLocal(output, join(mirrorGenerated, nativeImageName(type, page, count)));
  }
  const pages = Array.isArray(native.pages) ? native.pages : [];
  const copy = Array.from({ length: count }, (_, index) => {
    const page = pages[index] ? object(pages[index], 'Página PostNow') : {};
    return `## Página ${index + 1}\n\n${typeof page.copy === 'string' ? page.copy : ''}\n`;
  }).join('\n');
  await atomicText(join(nativeProject, 'COPY.md'), `# Copy final\n\n${copy}`);
  await checkedCapture(services, python, engineRoot, env, ['qa', 'contact-sheet', nativeProject], 'PostNow não conseguiu preparar a folha de contato para revisão.', signal);
  const published: string[] = [];
  try {
    for (let page = 1; page <= count; page++) {
      signal?.throwIfAborted();
      const name = `slide-${String(page).padStart(2, '0')}.png`;
      await copyLocal(join(stagingPath, name), join(runPath, name));
      published.push(name);
    }
    signal?.throwIfAborted();
    await atomicJson(join(runPath, '.mapping.json'), { logoPolicy, ...(revision ? { revision: { of: revision.of, keptPages: revision.keptPages, redonePages: revision.redonePages } } : {}), pages: Array.from({ length: count }, (_, index) => ({ page: index + 1, input: byPage.get(index + 1), output: `slide-${String(index + 1).padStart(2, '0')}.png`, native: nativeImageName(type, index + 1, count), logo: withLogo.includes(index + 1), ...(revision && keptPages.includes(index + 1) ? { reusedFrom: revision.of } : {}) })) });
    await writeBatchStatus(project.path, batchId, { state: 'ready', message: `${count} página(s) prontas para revisão.${adjusted.length ? ` Algumas imagens foram ajustadas ao tamanho final (redimensionadas; recorte centralizado de até ${MAX_CROP_PERCENT_PER_SIDE}% por lado só quando necessário); revise antes de aprovar.` : ''}` });
  } catch (error) {
    for (const name of published) {
      const output = join(runPath, name);
      const staged = join(stagingPath, name);
      if ((await fingerprint(output)).sha256 === (await fingerprint(staged)).sha256) await rm(output);
    }
    throw error;
  }
  return { pages: count, adjusted, logoPages: withLogo };
  } finally {
    await rm(stagingPath, { recursive: true, force: true });
  }
}
