import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { AppEvent, Job, Project, ProjectDetail } from '../../shared/contracts.js';
import type { Services } from '../context.js';
import type { Runtime } from '../runtime.js';
import { getMobileHtml } from './client.js';
import { MobileAuthManager } from './token.js';
import { generateSvgQR } from './qr.js';
import { getProjectJourney } from '../../shared/project-journey.js';
import { PROMPT_RECIPES, suggestProjectTitle } from '../../shared/prompt-library.js';
import { DEFAULT_POSTNOW_FORMAT, isPostNowFormat } from '../../shared/formats.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

export interface MobileServerOptions {
  port?: number;
  tunnelUrl?: string;
}

export class MobileServer {
  private server?: Server;
  private sseClients = new Set<(event: AppEvent | { type: 'snapshot'; jobs: Job[]; projects: Project[] }) => void>();
  private activePort = 0;
  private currentTunnelUrl = '';

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

  broadcastEvent(event: AppEvent): void {
    for (const send of this.sseClients) {
      try { send(event); } catch { /* ignore broken client */ }
    }
  }

  async start(preferredPort = 4180): Promise<number> {
    if (this.server) return this.activePort;

    const { promise, resolve, reject } = Promise.withResolvers<number>();

    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch(err => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Erro interno do servidor' }));
        }
      });
    });

    this.server.on('error', (err) => {
      reject(err);
    });

    // Try preferred port, or fall back to OS assigned free port (0)
    this.server.listen(preferredPort, '127.0.0.1', () => {
      const address = this.server?.address();
      this.activePort = typeof address === 'object' && address ? address.port : preferredPort;
      resolve(this.activePort);
    });

    return promise;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    for (const send of this.sseClients) {
      try { send({ type: 'refresh' }); } catch { /* ignore broken client */ }
    }
    this.sseClients.clear();

    const { promise, resolve } = Promise.withResolvers<void>();
    this.server.close(() => {
      this.server = undefined;
      resolve();
    });
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

  private getClientIp(req: IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0]!.trim();
    return req.socket.remoteAddress || '127.0.0.1';
  }

  private async parseJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.activePort}`);

    // CORS headers for API calls
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Serve Mobile Web App
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getMobileHtml());
      return;
    }

    // QR Code SVG
    if (url.pathname === '/api/qr.svg') {
      const targetUrl = this.currentTunnelUrl || `http://${req.headers.host || `127.0.0.1:${this.activePort}`}/`;
      const svg = await generateSvgQR(targetUrl);
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end(svg);
      return;
    }

    // Public Status & Auth Check
    if (url.pathname === '/api/status' && req.method === 'GET') {
      const session = this.extractSessionToken(req, url);
      const authenticated = this.authManager.validateSession(session);
      const settings = this.services.getSettings();
      const runningJobs = this.services.jobs().filter(j => j.status === 'running').length;

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        authenticated,
        workspace: settings.workspace,
        activeJobs: runningJobs,
        tunnelUrl: this.currentTunnelUrl || null,
        token: authenticated ? this.authManager.getPin() : undefined,
        version: this.version,
      }));
      return;
    }

    // Auth Submission
    if (url.pathname === '/api/auth' && req.method === 'POST') {
      const body = await this.parseJsonBody<{ token?: string }>(req);
      const pin = body.token || '';
      const ip = this.getClientIp(req);
      const result = this.authManager.verify(pin, ip);

      if (result.ok) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, sessionToken: result.sessionToken }));
      } else {
        res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: result.error }));
      }
      return;
    }

    // Authenticated Endpoints Barrier
    const session = this.extractSessionToken(req, url);
    if (!this.authManager.validateSession(session)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Sessão não autorizada ou expirada. Informe o token de 6 dígitos.' }));
      return;
    }

    // Logout
    if (url.pathname === '/api/logout' && req.method === 'POST') {
      if (session) this.authManager.revokeSession(session);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // SSE Events Stream
    if (url.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const send = (data: unknown) => {
        try {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch { /* ignore socket error */ }
      };

      this.sseClients.add(send);

      // Send initial snapshot
      try {
        const rawProjects = (await this.runtime.invoke('projects.list', {})) as Project[];
        const jobs = this.services.jobs();
        send({ type: 'snapshot', jobs, projects: rawProjects });
      } catch { /* ignore initial snapshot failure */ }

      // Keepalive ping every 15s to keep tunnel active
      const pingTimer = setInterval(() => {
        try { res.write(': ping\n\n'); } catch { /* ignore socket error */ }
      }, 15000);

      req.on('close', () => {
        clearInterval(pingTimer);
        this.sseClients.delete(send);
      });
      return;
    }

    // Jobs List
    if (url.pathname === '/api/jobs' && req.method === 'GET') {
      const jobs = this.services.jobs();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(jobs));
      return;
    }

    // Single Job Detail
    if (url.pathname.startsWith('/api/jobs/') && req.method === 'GET') {
      const id = url.pathname.slice('/api/jobs/'.length);
      const job = this.services.jobs().find(j => j.id === id);
      if (!job) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Tarefa não encontrada.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(job));
      return;
    }

    // Respond to Job Interaction Prompt
    if (url.pathname.startsWith('/api/jobs/') && url.pathname.endsWith('/respond') && req.method === 'POST') {
      const parts = url.pathname.split('/');
      const id = parts[3];
      const body = await this.parseJsonBody<{ data?: string }>(req);
      if (id && body.data !== undefined) {
        await this.runtime.invoke('jobs.respond', { id, data: body.data });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
    }
    // Prompt Recipes list for creation & briefing
    if (url.pathname === '/api/prompt-recipes' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(PROMPT_RECIPES));
      return;
    }

    // Projects List
    if (url.pathname === '/api/projects' && req.method === 'GET') {
      const rawProjects = (await this.runtime.invoke('projects.list', {})) as Project[];
      const formatMediaUrl = (rawUrl?: string): string | undefined => {
        if (!rawUrl) return undefined;
        let token = rawUrl;
        if (token.startsWith('media://asset/')) {
          token = token.slice('media://asset/'.length);
        } else if (token.includes('/api/media/')) {
          token = token.slice(token.indexOf('/api/media/') + '/api/media/'.length);
        } else if (token.includes('/media/')) {
          token = token.slice(token.lastIndexOf('/') + 1);
        }
        token = token.split('?')[0]!;
        return `/api/media/${token}?token=${session}`;
      };

      // Map asset URLs to mobile media path
      const projects = rawProjects.map(p => ({
        ...p,
        coverUrl: formatMediaUrl(p.coverUrl),
      }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(projects));
      return;
    }

    // Create New Project from Mobile
    if (url.pathname === '/api/projects' && req.method === 'POST') {
      const body = await this.parseJsonBody<{
        title?: string;
        topic?: string;
        kind?: 'image' | 'video';
        format?: string;
        brief?: string;
        pageCount?: number;
        autoStartAgent?: boolean;
        prompt?: string;
        provider?: string;
        brandId?: string;
      }>(req);
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

      const project = (await this.runtime.invoke('projects.create', {
        title,
        kind,
        format,
        brief,
        ...(body.brandId ? { brandId: body.brandId } : {}),
        ...(kind === 'image' && format.startsWith('carousel-') ? { pageCount } : {}),
      })) as Project;
      let jobId: string | undefined;
      if (body.autoStartAgent) {
        try {
          const settings = this.services.getSettings();
          const provider = (body.provider as string) || (kind === 'video' ? 'claude' : (settings.provider || 'codex'));
          const promptText = body.prompt?.trim() || brief;
          const job = (await this.runtime.invoke('agents.start', {
            id: project.id,
            provider,
            prompt: promptText,
            confirm: true,
          })) as Job;
          jobId = job?.id;
        } catch (err) {
          console.error('Falha ao iniciar agente automaticamente:', err);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, project, jobId }));
      return;
    }

    // Project Workflow Actions (Generate Images, Render Video, AI Prompt, Approvals, Text Edits)
    if (url.pathname.startsWith('/api/projects/') && url.pathname.endsWith('/action') && req.method === 'POST') {
      const parts = url.pathname.split('/');
      const id = parts[3];
      if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'ID do projeto não fornecido.' }));
        return;
      }

      const body = await this.parseJsonBody<{
        action: string;
        prompt?: string;
        provider?: string;
        logoPolicy?: string;
        pages?: Array<{ page: number; headline: string; copy: string; depictedPerson?: string }>;
        contentHash?: string;
        path?: string;
        redo?: boolean;
        note?: string;
        brief?: string;
        notes?: string;
      }>(req);

      try {
        const detail = (await this.runtime.invoke('projects.detail', { id })) as ProjectDetail;
        if (!detail) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Projeto não encontrado.' }));
          return;
        }

        if (body.action === 'start-agent' || body.action === 'prepare-texts') {
          const settings = this.services.getSettings();
          const provider = (body.provider as string) || (detail.kind === 'video' ? 'claude' : (settings.provider || 'codex'));
          const prompt = body.prompt?.trim() || (detail.kind === 'image'
            ? 'Prepare os textos e a copy das páginas do carrossel com base no briefing salvo.'
            : 'Prepare o roteiro e o storyboard deste vídeo com base no briefing salvo.');
          const job = await this.runtime.invoke('agents.start', {
            id,
            provider,
            prompt,
            confirm: true,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, job }));
          return;
        }

        if (body.action === 'save-visual') {
          if (!body.pages) throw new Error('Páginas não fornecidas.');
          const updated = await this.runtime.invoke('projects.visual.save', { projectId: id, id, pages: body.pages });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, detail: updated }));
          return;
        }

        if (body.action === 'approve-visual') {
          const contentHash = body.contentHash || detail.visualReview?.contentHash;
          if (!contentHash) throw new Error('Hash do conteúdo não fornecido.');
          const updated = await this.runtime.invoke('projects.visual.approve', {
            id,
            approved: true,
            contentHash,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, detail: updated }));
          return;
        }

        if (body.action === 'approve-storyboard') {
          const updated = await this.runtime.invoke('projects.storyboard.approve', { id, approved: true });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, detail: updated }));
          return;
        }

        if (body.action === 'generate-images') {
          const job = await this.runtime.invoke('agents.generateImages', {
            id,
            logoPolicy: body.logoPolicy || 'corner',
            confirm: true,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, job }));
          return;
        }

        if (body.action === 'revise-images') {
          const job = await this.runtime.invoke('agents.reviseImages', {
            id,
            logoPolicy: body.logoPolicy || 'corner',
            confirm: true,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, job }));
          return;
        }

        if (body.action === 'approve-asset') {
          if (!body.path) throw new Error('Caminho do artefato não fornecido.');
          const updated = await this.runtime.invoke('projects.approve', {
            id,
            path: body.path,
            approved: true,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, detail: updated }));
          return;
        }

        if (body.action === 'review-asset') {
          if (!body.path) throw new Error('Caminho do artefato não fornecido.');
          const updated = await this.runtime.invoke('projects.review', {
            id,
            path: body.path,
            redo: body.redo ?? true,
            note: body.note || '',
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, detail: updated }));
          return;
        }

        if (body.action === 'render') {
          const job = await this.runtime.invoke('projects.render', {
            id,
            logoPolicy: body.logoPolicy || 'corner',
            confirm: true,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, job }));
          return;
        }

        if (body.action === 'update-brief') {
          const updated = await this.runtime.invoke('projects.notes', {
            id,
            brief: body.brief,
            notes: body.notes || detail.notes || '',
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, detail: updated }));
          return;
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Ação não reconhecida.' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
      return;
    }

    // Project Detail with Journey and Steps
    if (url.pathname.startsWith('/api/projects/') && req.method === 'GET') {
      const id = url.pathname.slice('/api/projects/'.length);
      const detail = (await this.runtime.invoke('projects.detail', { id })) as ProjectDetail;
      if (!detail) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Projeto não encontrado.' }));
        return;
      }

      const formatMediaUrl = (rawUrl?: string): string | undefined => {
        if (!rawUrl) return undefined;
        let token = rawUrl;
        if (token.startsWith('media://asset/')) {
          token = token.slice('media://asset/'.length);
        } else if (token.includes('/api/media/')) {
          token = token.slice(token.indexOf('/api/media/') + '/api/media/'.length);
        } else if (token.includes('/media/')) {
          token = token.slice(token.lastIndexOf('/') + 1);
        }
        token = token.split('?')[0]!;
        return `/api/media/${token}?token=${session}`;
      };

      // Map asset URLs
      const assets = (detail.assets || []).map(a => ({
        ...a,
        url: formatMediaUrl(a.url) || a.url,
      }));

      // Map batches assets URLs
      const batches = (detail.batches || []).map(b => ({
        ...b,
        assets: (b.assets || []).map(ba => ({
          ...ba,
          url: formatMediaUrl(ba.url) || ba.url,
        })),
      }));

      // Compute Journey
      const isRunning = this.services.jobs().some(j => j.projectId === id && j.status === 'running');
      const hasBrief = Boolean(detail.brief && detail.brief.trim().length > 0);
      let journey;
      if (detail.kind === 'image') {
        const latestBatch = detail.batches?.[0];
        const batchAssets = latestBatch?.assets || [];
        const outputs = batchAssets.map(a => ({ approved: Boolean(a.approved) }));
        journey = getProjectJourney({
          kind: 'image',
          hasBrief,
          hasScript: false,
          hasRender: false,
          outputs,
          textsApproved: Boolean(detail.visualReview?.approved),
          isRunning,
        });
      } else {
        const videoAssets = assets.filter(a => a.kind === 'video');
        const hasRender = videoAssets.length > 0;
        const outputs = videoAssets.map(a => ({ approved: Boolean(a.approved) }));
        journey = getProjectJourney({
          kind: 'video',
          hasBrief,
          hasScript: Boolean(detail.storyboardAvailable),
          hasRender,
          outputs,
          isRunning,
        });
      }

      // Fetch storyboard scenes for video if available
      let scenes;
      if (detail.kind === 'video' && detail.storyboardAvailable) {
        try {
          scenes = await this.runtime.invoke('projects.storyboard', { id });
        } catch { /* ignore storyboard scene load failure */ }
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ...detail, assets, batches, journey, isRunning, ...(scenes ? { scenes } : {}) }));
      return;
    }

    // Media streaming with HTTP Range support (crucial for mobile video/audio playback!)
    if (url.pathname.startsWith('/api/media/')) {
      const token = url.pathname.slice('/api/media/'.length);
      try {
        const filePath = await this.runtime.mediaPath(token);
        const fileInfo = await stat(filePath);
        const ext = extname(filePath).toLowerCase();
        const contentType = MIME[ext] || 'application/octet-stream';
        const isDownload = url.searchParams.get('download') === '1';

        const baseHeaders: Record<string, string | number> = {
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600',
        };

        if (isDownload) {
          baseHeaders['Content-Disposition'] = `attachment; filename="${encodeURIComponent(basename(filePath))}"`;
        }

        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0]!, 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileInfo.size - 1;
          const chunkSize = (end - start) + 1;

          res.writeHead(206, {
            ...baseHeaders,
            'Content-Range': `bytes ${start}-${end}/${fileInfo.size}`,
            'Content-Length': chunkSize,
          });

          const stream = createReadStream(filePath, { start, end });
          stream.pipe(res);
        } else {
          res.writeHead(200, {
            ...baseHeaders,
            'Content-Length': fileInfo.size,
          });
          createReadStream(filePath).pipe(res);
        }
      } catch {
        if (!res.headersSent) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Mídia não encontrada ou não autorizada.' }));
        }
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rota não encontrada.' }));
  }
}
