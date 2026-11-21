import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AppEvent, Job, Project } from '../../shared/contracts.js';
import type { Services } from '../context.js';
import type { Runtime } from '../runtime.js';
import { getMobileHtml } from './client.js';
import { MobileAuthManager } from './token.js';
import { generateSvgQR } from './qr.js';
import { handleProjectRoute } from './project-routes.js';
import { toMobileProject } from './project-view.js';
import { serveMedia } from './media.js';

export interface MobileServerOptions {
  port?: number;
  tunnelUrl?: string;
}

const MAX_BODY_BYTES = 64 * 1024;
const SSE_PING_MS = 15000;
const SSE_MAX_BUFFERED_BYTES = 1024 * 1024;
const MAX_TRACKED_JOBS = 500;
/** Eventos que o celular recebe; `mobile` (carrega o PIN), `update` e `local-voice` são só do desktop. */
const SSE_EVENT_TYPES: ReadonlySet<AppEvent['type']> = new Set(['job', 'output', 'activity', 'refresh']);

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

interface SseClient {
  res: ServerResponse;
  timer: NodeJS.Timeout;
}

type PublicJob = Omit<Job, 'log'>;

function withoutLog(job: Job): PublicJob {
  const { log: _log, ...rest } = job;
  return rest;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export class MobileServer {
  private server?: Server;
  private starting?: Promise<number>;
  private sseClients = new Set<SseClient>();
  private activePort = 0;
  private currentTunnelUrl = '';
  private rev = 0;
  private jobMarks = new Map<string, { status: string; interaction: string }>();

  constructor(
    readonly authManager: MobileAuthManager,
    private runtime: Runtime,
    private services: Services,
    private version = '0.2.0',
  ) {}

  getPort(): number {
    return this.activePort;
  }

  setTunnelUrl(url: string): void {
    this.currentTunnelUrl = url;
  }

  getTunnelUrl(): string {
    return this.currentTunnelUrl;
  }

  /** Sobe a cada refresh, a cada job que muda de status e a cada nova interactionRequest; nunca com output/activity. */
  private trackRev(event: AppEvent): void {
    if (event.type === 'refresh') {
      this.rev++;
      return;
    }
    if (event.type !== 'job' || !event.job) return;
    const job = event.job;
    const previous = this.jobMarks.get(job.id);
    const interaction = job.interactionRequest ? JSON.stringify(job.interactionRequest) : '';
    if (!previous || previous.status !== job.status || (interaction !== '' && interaction !== previous.interaction)) this.rev++;
    this.jobMarks.delete(job.id);
    this.jobMarks.set(job.id, { status: job.status, interaction });
    if (this.jobMarks.size > MAX_TRACKED_JOBS) this.jobMarks.delete(this.jobMarks.keys().next().value!);
  }

  broadcastEvent(event: AppEvent): void {
    if (!SSE_EVENT_TYPES.has(event.type)) return;
    this.trackRev(event);
    if (this.sseClients.size === 0) return;
    const frame: unknown = event.type === 'job' && event.job ? { ...event, job: withoutLog(event.job) } : event;
    for (const client of [...this.sseClients]) this.writeFrame(client, frame);
  }

  private writeFrame(client: SseClient, data: unknown): void {
    try {
      if (client.res.writableLength > SSE_MAX_BUFFERED_BYTES) {
        this.dropClient(client);
        return;
      }
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      this.dropClient(client);
    }
  }

  private dropClient(client: SseClient): void {
    clearInterval(client.timer);
    this.sseClients.delete(client);
    if (!client.res.writableEnded) client.res.destroy();
  }

  start(preferredPort = 4180): Promise<number> {
    if (this.server?.listening) return Promise.resolve(this.activePort);
    if (this.starting) return this.starting;
    const starting = this.listen(preferredPort).finally(() => {
      if (this.starting === starting) this.starting = undefined;
    });
    this.starting = starting;
    return starting;
  }

  private async listen(preferredPort: number): Promise<number> {
    const server = createServer((req, res) => {
      this.handleRequest(req, res).catch(err => {
        if (res.headersSent) {
          res.destroy();
          return;
        }
        const status = err instanceof HttpError ? err.status : 500;
        if (status === 413) res.setHeader('Connection', 'close');
        sendJson(res, status, { error: err instanceof Error ? err.message : 'Erro interno do servidor' });
      });
    });
    this.server = server;

    const listenOn = (port: number) => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      const onError = (err: Error) => reject(err);
      server.once('error', onError);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', onError);
        resolve();
      });
      return promise;
    };

    try {
      try {
        await listenOn(preferredPort);
      } catch (err) {
        // Porta ocupada: cai para uma porta livre atribuída pelo sistema.
        if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || preferredPort === 0) throw err;
        await listenOn(0);
      }
    } catch (err) {
      this.server = undefined;
      server.close();
      throw err;
    }
    // Erros posteriores à partida não podem derrubar o processo.
    server.on('error', () => {});
    this.activePort = (server.address() as AddressInfo).port;
    return this.activePort;
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (this.starting) await this.starting.catch(() => {});
    if (!server) return;
    for (const client of [...this.sseClients]) this.dropClient(client);
    this.server = undefined;
    this.activePort = 0;

    const { promise, resolve } = Promise.withResolvers<void>();
    server.close(() => resolve());
    server.closeAllConnections();
    return promise;
  }

  private extractSessionToken(req: IncomingMessage, url: URL): string | undefined {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    const queryToken = url.searchParams.get('token');
    if (queryToken) return queryToken;
    return undefined;
  }

  /** Chave do limite de tentativas: IP real entregue pela Cloudflare, senão o par do socket. `x-forwarded-for` é forjável e ignorado. */
  private getClientIp(req: IncomingMessage): string {
    const cloudflare = req.headers['cf-connecting-ip'];
    if (typeof cloudflare === 'string' && cloudflare.trim()) return cloudflare.trim();
    return req.socket.remoteAddress || '127.0.0.1';
  }

  private async parseJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new HttpError(413, 'Corpo da requisição grande demais (máximo 64 KB).');
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      total += (chunk as Buffer).length;
      if (total > MAX_BODY_BYTES) throw new HttpError(413, 'Corpo da requisição grande demais (máximo 64 KB).');
      chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text.trim()) return {} as T;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new HttpError(400, 'JSON inválido.');
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(400, 'O corpo da requisição deve ser um objeto JSON.');
    return parsed as T;
  }

  private async handleEvents(req: IncomingMessage, res: ServerResponse, session: string | undefined): Promise<void> {
    let closed = false;
    const client: SseClient = {
      res,
      timer: setInterval(() => this.writeFrame(client, { type: 'ping' }), SSE_PING_MS),
    };
    // Registrado antes de qualquer await: uma desconexão durante o snapshot não pode vazar timer nem cliente.
    const onClose = () => {
      closed = true;
      this.dropClient(client);
    };
    req.on('close', onClose);
    res.on('close', onClose);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    this.sseClients.add(client);
    this.writeFrame(client, { type: 'ping' });

    try {
      const rawProjects = (await this.runtime.invoke('projects.list', {})) as Project[];
      if (closed) return;
      this.writeFrame(client, {
        type: 'snapshot',
        jobs: this.services.jobs().map(withoutLog),
        projects: rawProjects.map(project => toMobileProject(project, session)),
      });
    } catch { /* snapshot opcional: o cliente recarrega ao receber `refresh` */ }
  }

  private async jobCommand(res: ServerResponse, id: string, action: 'jobs.respond' | 'jobs.dismissInteraction' | 'jobs.cancel', payload: Record<string, unknown>): Promise<void> {
    if (!this.services.jobs().some(job => job.id === id)) {
      sendJson(res, 404, { error: 'Tarefa não encontrada.' });
      return;
    }
    try {
      await this.runtime.invoke(action, { id, ...payload });
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : 'Não foi possível concluir a operação.' });
      return;
    }
    sendJson(res, 200, { ok: true });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.activePort}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';
    const isRead = method === 'GET' || method === 'HEAD';

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');

    // Serve Mobile Web App
    if ((path === '/' || path === '/index.html') && isRead) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(method === 'HEAD' ? undefined : getMobileHtml());
      return;
    }

    const session = this.extractSessionToken(req, url);

    // Public Status: anônimo só informa a versão
    if (path === '/api/status' && method === 'GET') {
      if (!this.authManager.validateSession(session)) {
        sendJson(res, 200, { authenticated: false, version: this.version });
        return;
      }
      sendJson(res, 200, {
        authenticated: true,
        version: this.version,
        workspace: this.services.getSettings().workspace,
        activeJobs: this.services.jobs().filter(job => job.status === 'running').length,
        tunnelUrl: this.currentTunnelUrl || null,
      });
      return;
    }

    // Auth Submission
    if (path === '/api/auth' && method === 'POST') {
      const body = await this.parseJsonBody<{ token?: unknown }>(req);
      const result = this.authManager.verify(typeof body.token === 'string' ? body.token : '', this.getClientIp(req));
      if (result.ok) sendJson(res, 200, { ok: true, sessionToken: result.sessionToken });
      else sendJson(res, result.status, { ok: false, error: result.error });
      return;
    }

    // Authenticated Endpoints Barrier
    if (!this.authManager.validateSession(session)) {
      sendJson(res, 401, { error: 'Sessão não autorizada ou expirada. Informe o token de 6 dígitos.' });
      return;
    }

    if (path === '/api/logout' && method === 'POST') {
      if (session) this.authManager.revokeSession(session);
      sendJson(res, 200, { ok: true });
      return;
    }

    // QR Code SVG
    if (path === '/api/qr.svg' && method === 'GET') {
      const targetUrl = this.currentTunnelUrl || `http://${req.headers.host || `127.0.0.1:${this.activePort}`}/`;
      const svg = await generateSvgQR(targetUrl);
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' });
      res.end(svg);
      return;
    }

    if (path === '/api/rev' && method === 'GET') {
      sendJson(res, 200, { rev: this.rev });
      return;
    }

    // SSE Events Stream
    if (path === '/api/events' && method === 'GET') {
      await this.handleEvents(req, res, session);
      return;
    }

    if (path === '/api/jobs' && method === 'GET') {
      sendJson(res, 200, this.services.jobs().map(withoutLog));
      return;
    }

    const jobMatch = /^\/api\/jobs\/([^/]+)(?:\/(respond|dismiss|cancel))?$/.exec(path);
    if (jobMatch) {
      let id: string;
      try { id = decodeURIComponent(jobMatch[1]!); } catch { throw new HttpError(400, 'Identificador de tarefa inválido.'); }
      const command = jobMatch[2];
      if (!command && method === 'GET') {
        const job = this.services.jobs().find(candidate => candidate.id === id);
        if (job) sendJson(res, 200, job);
        else sendJson(res, 404, { error: 'Tarefa não encontrada.' });
        return;
      }
      if (command === 'respond' && method === 'POST') {
        const body = await this.parseJsonBody<{ data?: unknown }>(req);
        if (typeof body.data !== 'string') {
          sendJson(res, 400, { error: 'Resposta inválida: informe o texto em "data".' });
          return;
        }
        await this.jobCommand(res, id, 'jobs.respond', { data: body.data });
        return;
      }
      if (command === 'dismiss' && method === 'POST') {
        await this.jobCommand(res, id, 'jobs.dismissInteraction', {});
        return;
      }
      if (command === 'cancel' && method === 'POST') {
        await this.jobCommand(res, id, 'jobs.cancel', {});
        return;
      }
    }

    // Project, brand and prompt-library routes
    if (await handleProjectRoute({ runtime: this.runtime, services: this.services }, {
      req, res, url, session,
      readBody: <T>() => this.parseJsonBody<T>(req) as Promise<T>,
    })) return;

    // Media streaming with HTTP Range support (crucial for mobile video/audio playback!)
    const mediaMatch = /^\/api\/media\/([^/]+)$/.exec(path);
    if (mediaMatch && isRead) {
      try {
        const filePath = await this.runtime.mediaPath(decodeURIComponent(mediaMatch[1]!));
        await serveMedia(req, res, filePath, url.searchParams.get('download') === '1');
      } catch {
        if (!res.headersSent) sendJson(res, 404, { error: 'Mídia não encontrada ou não autorizada.' });
        else res.destroy();
      }
      return;
    }

    sendJson(res, 404, { error: 'Rota não encontrada.' });
  }
}
