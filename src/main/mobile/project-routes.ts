import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Brand, Job, Project, ProjectDetail } from '../../shared/contracts.js';
import { PROMPT_RECIPES, suggestProjectTitle } from '../../shared/prompt-library.js';
import { DEFAULT_POSTNOW_FORMAT, isPostNowFormat } from '../../shared/formats.js';
import { exportApprovedZipTo } from '../projects.js';
import { actionErrorStatus, runProjectAction, type ActionBody } from './actions.js';
import { buildProjectView, mapMediaUrl, toMobileProject, type MobileContext } from './project-view.js';

export interface RouteRequest {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  session: string | undefined;
  readBody<T>(): Promise<T>;
}

interface CreateProjectBody {
  title?: string;
  topic?: string;
  kind?: 'image' | 'video';
  format?: string;
  brief?: string;
  pageCount?: number;
  useBrandImages?: boolean;
  autoStartAgent?: boolean;
  prompt?: string;
  provider?: string;
  brandId?: string;
  confirm?: boolean;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const INTERNAL_ERROR = 'Erro interno ao processar o pedido.';

function errorResponse(res: ServerResponse, error: unknown): void {
  const status = actionErrorStatus(error);
  sendJson(res, status, { error: status >= 500 ? INTERNAL_ERROR : error instanceof Error ? error.message : String(error) });
  if (status >= 500) console.error('Falha em rota mobile de projeto:', error);
}

/** Lê o corpo JSON; corpo inválido (ou que não é um objeto) vira 400, preservando o status 4xx de quem leu (ex.: 413). */
async function readObjectBody<T>(request: RouteRequest, res: ServerResponse): Promise<T | undefined> {
  try {
    const body = await request.readBody<T>();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
    sendJson(res, 400, { error: 'Corpo da requisição inválido.' });
  } catch (error) {
    const status = (error as { status?: unknown })?.status;
    sendJson(res, typeof status === 'number' && status >= 400 && status < 500 ? status : 400, { error: status === 413 ? 'Corpo da requisição grande demais.' : 'Corpo da requisição inválido.' });
  }
  return undefined;
}

/** Detalhe bruto do projeto; responde 404 e devolve `undefined` quando ele não existe. */
async function loadDetail(ctx: MobileContext, res: ServerResponse, id: string): Promise<ProjectDetail | undefined> {
  try {
    const detail = (await ctx.runtime.invoke('projects.detail', { id })) as ProjectDetail | undefined;
    if (detail) return detail;
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException)?.code === 'ENOENT' || (error instanceof Error && error.message === 'Identificador inválido.');
    if (!missing) { errorResponse(res, error); return undefined; }
  }
  sendJson(res, 404, { error: 'Projeto não encontrado.' });
  return undefined;
}

function zipFileName(path: string): string {
  return basename(path).replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Gera o pacote de entrega numa pasta temporária, envia com `Content-Length` e apaga a pasta ao terminar ou se o celular desistir. */
async function sendPackageZip(ctx: MobileContext, res: ServerResponse, id: string): Promise<void> {
  // safePath recusa ancestrais que sejam links simbólicos (ex.: /tmp -> /private/tmp), por isso a pasta é resolvida antes.
  const folder = await realpath(await mkdtemp(join(tmpdir(), 'mdc-zip-')));
  try {
    const zip = await exportApprovedZipTo(ctx.services, id, folder);
    const size = (await stat(zip.path)).size;
    const name = zipFileName(zip.path);
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': size,
      'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
    await pipeline(createReadStream(zip.path), res);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** Rotas de conteúdo (`/api/projects*`, `/api/brands`, `/api/prompt-recipes`). Devolve `true` quando tratou a requisição. */
export async function handleProjectRoute(ctx: MobileContext, request: RouteRequest): Promise<boolean> {
  const { req, res, url, session } = request;
  const { runtime, services } = ctx;
  const path = url.pathname;

  // Prompt Recipes list for creation & briefing
  if (path === '/api/prompt-recipes' && req.method === 'GET') {
    sendJson(res, 200, PROMPT_RECIPES);
    return true;
  }

  // Brands available to link to a project (id, name and logo only)
  if (path === '/api/brands' && req.method === 'GET') {
    try {
      const brands = (await runtime.invoke('brands.list', {})) as Brand[];
      sendJson(res, 200, brands.map(brand => ({
        id: brand.id,
        name: brand.name,
        hasLogo: Boolean(brand.logo),
        ...(brand.logoUrl ? { logoUrl: mapMediaUrl(brand.logoUrl, session) } : {}),
      })));
    } catch (error) { errorResponse(res, error); }
    return true;
  }

  // Projects List
  if (path === '/api/projects' && req.method === 'GET') {
    try {
      const rawProjects = (await runtime.invoke('projects.list', {})) as Project[];
      sendJson(res, 200, rawProjects.map(p => toMobileProject(p, session)));
    } catch (error) { errorResponse(res, error); }
    return true;
  }

  // Create New Project from Mobile
  if (path === '/api/projects' && req.method === 'POST') {
    const body = await readObjectBody<CreateProjectBody>(request, res);
    if (!body) return true;
    const kind = body.kind === 'video' ? 'video' : 'image';
    let format = body.format;
    if (kind === 'image') {
      if (!format || !isPostNowFormat(format)) format = DEFAULT_POSTNOW_FORMAT;
    } else {
      if (!format || !['reels', 'story', 'feed-square', 'youtube'].includes(format)) format = 'reels';
    }
    const pageCount = Number(body.pageCount) || 5;
    const title = body.title?.trim() || suggestProjectTitle(kind, body.topic || '') || (kind === 'image' ? 'Carrossel Mobile' : 'Vídeo Mobile');
    const brief = body.brief?.trim() || `Produza um conteúdo dinâmico e envolvente no formato ${format}.`;

    try {
      const project = (await runtime.invoke('projects.create', {
        title,
        kind,
        format,
        brief,
        ...(body.brandId ? { brandId: body.brandId } : {}),
        ...(body.useBrandImages !== undefined ? { useBrandImages: body.useBrandImages } : {}),
        ...(kind === 'image' && format.startsWith('carousel-') ? { pageCount } : {}),
      })) as Project;
      let jobId: string | undefined;
      // O agente gasta crédito: só inicia com a confirmação explícita do celular.
      if (body.autoStartAgent === true && body.confirm === true) {
        try {
          const settings = services.getSettings();
          const provider = (body.provider as string) || (kind === 'video' ? 'claude' : (settings.provider || 'codex'));
          const job = (await runtime.invoke('agents.start', {
            id: project.id,
            provider,
            prompt: body.prompt?.trim() || brief,
            confirm: true,
          })) as Job;
          jobId = job?.id;
        } catch (err) {
          console.error('Falha ao iniciar agente automaticamente:', err);
        }
      }
      sendJson(res, 200, { ok: true, project: toMobileProject(project, session), jobId });
    } catch (error) { errorResponse(res, error); }
    return true;
  }

  const actionMatch = /^\/api\/projects\/([^/]+)\/action$/.exec(path);
  if (actionMatch && req.method === 'POST') {
    const id = decodeURIComponent(actionMatch[1]!);
    const body = await readObjectBody<ActionBody>(request, res);
    if (!body) return true;
    try {
      const detail = await loadDetail(ctx, res, id);
      if (!detail) return true;
      const result = await runProjectAction(ctx, id, detail, body, session);
      sendJson(res, result.status, result.body);
    } catch (error) { errorResponse(res, error); }
    return true;
  }

  const zipMatch = /^\/api\/projects\/([^/]+)\/package\.zip$/.exec(path);
  if (zipMatch && req.method === 'GET') {
    try {
      await sendPackageZip(ctx, res, decodeURIComponent(zipMatch[1]!));
    } catch (error) {
      if (res.headersSent) res.destroy();
      else if ((error as NodeJS.ErrnoException)?.code === 'ENOENT' || (error instanceof Error && error.message === 'Identificador inválido.')) sendJson(res, 404, { error: 'Projeto não encontrado.' });
      else errorResponse(res, error);
    }
    return true;
  }

  const detailMatch = /^\/api\/projects\/([^/]+)$/.exec(path);
  if (detailMatch && req.method === 'GET') {
    try {
      const detail = await loadDetail(ctx, res, decodeURIComponent(detailMatch[1]!));
      if (detail) sendJson(res, 200, await buildProjectView(ctx, detail, session));
    } catch (error) { errorResponse(res, error); }
    return true;
  }

  return false;
}
