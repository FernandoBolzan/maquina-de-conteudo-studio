import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { Runtime } from '../src/main/runtime.js';
import { capture } from '../src/main/supervisor.js';
import type { AppEvent, Brand, Project } from '../src/shared/contracts.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.json': 'application/json; charset=utf-8',
};

const BRIDGE_SCRIPT = `<script>
(() => {
  const listeners = new Set();
  const es = new EventSource('/__maquina/events');
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      listeners.forEach(fn => fn(data));
    } catch {}
  };
  window.maquina = Object.freeze({
    invoke: async (action, payload = {}) => {
      const res = await fetch('/__maquina/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(body.error || 'Erro na chamada');
      return body.result;
    },
    onEvent: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  });
})();
</script>`;

async function main(): Promise<void> {
  const port = Number(process.env.PORT || 4178);
  const root = await mkdtemp(join(tmpdir(), 'mdc-preview-'));
  const dataDir = join(root, 'data');
  const workspace = join(root, 'workspace');
  const distDir = resolve(process.cwd(), 'dist/renderer');
  const clients = new Set<(event: AppEvent) => void>();

  const runtime = new Runtime(dataDir, {
    assetPrefix: '/__maquina/media/',
    secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('Secure storage unavailable in browser preview.'); },
    decryptSecret: () => { throw new Error('Secure storage unavailable in browser preview.'); },
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    update: async () => ({ available: false, message: 'Canal de releases não configurado neste ambiente.' }),
  }, event => {
    for (const send of clients) send(event);
  });

  await runtime.init();
  await runtime.invoke('app.settings', { workspace, provider: 'codex' });

  // Seed one real brand and one real project with a generated PNG slide so the studio preview is immediately exercisable
  const samplePng = join(root, 'capa-coolify.png');
  await capture('ffmpeg', ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=#18181b:s=1080x1350:d=1', '-frames:v', '1', samplePng]);
  const brand = await runtime.invoke('brands.save', {
    name: 'Fernando Bolzan',
    tone: 'Direto, prático e autoral.',
    colors: ['#F97316', '#121110', '#FAFAFA'],
    logo: samplePng,
  }) as Brand;
  const project = await runtime.invoke('projects.create', {
    title: 'Carrossel Coolify v4.5',
    kind: 'image',
    brandId: brand.id,
    brief: '10 slides mostrando a atualização da Coolify do gancho ao CTA.',
  }) as Project;
  await runtime.invoke('projects.importAsset', { id: project.id, path: samplePng });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      if (url.pathname === '/__maquina/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        const send = (event: AppEvent) => { res.write(`data: ${JSON.stringify(event)}\n\n`); };
        clients.add(send);
        req.on('close', () => clients.delete(send));
        return;
      }
      if (url.pathname === '/__maquina/invoke' && req.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { action: string; payload?: Record<string, unknown> };
        try {
          const result = await runtime.invoke(body.action, body.payload || {});
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ result }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
        return;
      }
      if (url.pathname.startsWith('/__maquina/media/')) {
        const token = url.pathname.slice('/__maquina/media/'.length);
        const mediaFile = await runtime.mediaPath(token);
        res.writeHead(200, { 'Content-Type': MIME[extname(mediaFile).toLowerCase()] || 'application/octet-stream' });
        createReadStream(mediaFile).pipe(res);
        return;
      }
      if (url.pathname === '/' || url.pathname === '/index.html') {
        let html = await readFile(join(distDir, 'index.html'), 'utf8');
        html = html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
        html = html.replace('<div id="root"></div>', `${BRIDGE_SCRIPT}<div id="root"></div>`);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      const target = resolve(distDir, `.${url.pathname}`);
      if (!target.startsWith(distDir)) { res.writeHead(403); res.end('Forbidden'); return; }
      const info = await stat(target);
      if (!info.isFile()) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream' });
      createReadStream(target).pipe(res);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`PREVIEW_READY http://127.0.0.1:${port}/`);
  });

  const shutdown = async () => {
    server.close();
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
}

await main();
