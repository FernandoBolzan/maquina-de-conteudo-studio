import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, readFile, chmod } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { MobileAuthManager } from '../src/main/mobile/token.js';
import { MobileServer } from '../src/main/mobile/server.js';
import { MobileService } from '../src/main/mobile/service.js';
import { CloudflareTunnel } from '../src/main/mobile/tunnel.js';
import { parseRange } from '../src/main/mobile/media.js';
import { Runtime } from '../src/main/runtime.js';
import { toolPrefix } from '../src/main/setup/tools.js';
import type { AppEvent, Job, MobileTunnelStatus, Project } from '../src/shared/contracts.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2sAAAAASUVORK5CYII=', 'base64');

interface Ctx { runtime: Runtime; workspace: string; root: string; baseUrl: string; session: string; headers: Record<string, string>; events: AppEvent[]; }

async function createRuntime(root: string, events: AppEvent[] = []): Promise<Runtime> {
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: '/api/media/',
    secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('unavailable'); },
    decryptSecret: () => { throw new Error('unavailable'); },
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    update: async () => ({ available: false, message: 'disabled' }),
  }, event => { events.push(event); });
  await runtime.init();
  return runtime;
}

async function withMobileRuntime(pin: string, run: (ctx: Ctx) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'mdc-mobile-transport-'));
  const workspace = join(root, 'workspace');
  await mkdir(workspace, { recursive: true });
  const events: AppEvent[] = [];
  const runtime = await createRuntime(root, events);
  await runtime.invoke('app.settings', { workspace, provider: 'codex' });
  runtime.mobile.authManager.setPin(pin);
  const port = await runtime.mobile.server.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const authRes = await fetch(`${baseUrl}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: pin }) });
    const { sessionToken } = (await authRes.json()) as { sessionToken: string };
    await run({ runtime, workspace, root, baseUrl, session: sessionToken, events, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` } });
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
}

async function mediaUrl(ctx: Ctx, name: string, content: Buffer | string): Promise<string> {
  const file = join(ctx.workspace, name);
  await writeFile(file, content);
  return `${ctx.baseUrl}${ctx.runtime.services.assetUrl(file)}?token=${ctx.session}`;
}

interface SseHandle { frames: Array<Record<string, any>>; headers: Record<string, string | string[] | undefined>; waitFor(predicate: (frame: Record<string, any>) => boolean, ms?: number): Promise<Record<string, any>>; close(): void; closed: Promise<void>; }

function openSse(baseUrl: string, session: string): Promise<SseHandle> {
  const { promise, resolve, reject } = Promise.withResolvers<SseHandle>();
  const frames: Array<Record<string, any>> = [];
  const listeners = new Set<() => void>();
  const closed = Promise.withResolvers<void>();
  const req = httpRequest(`${baseUrl}/api/events?token=${session}`, res => {
    let buffer = '';
    res.setEncoding('utf8');
    res.on('data', (chunk: string) => {
      buffer += chunk;
      let index: number;
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (block.startsWith('data: ')) frames.push(JSON.parse(block.slice(6)) as Record<string, any>);
      }
      for (const listener of listeners) listener();
    });
    res.on('close', () => closed.resolve());
    resolve({
      frames,
      headers: res.headers,
      closed: closed.promise,
      close: () => req.destroy(),
      async waitFor(predicate, ms = 5000) {
        const deadline = Date.now() + ms;
        for (;;) {
          const found = frames.find(predicate);
          if (found) return found;
          if (Date.now() > deadline) throw new Error(`Frame esperado não chegou: ${JSON.stringify(frames).slice(0, 500)}`);
          await new Promise<void>(done => { const tick = () => { listeners.delete(tick); done(); }; listeners.add(tick); setTimeout(tick, 100); });
        }
      },
    });
  });
  req.on('error', err => { closed.resolve(); reject(err); });
  req.end();
  return promise;
}

async function getRev(ctx: Ctx): Promise<number> {
  return ((await (await fetch(`${ctx.baseUrl}/api/rev`, { headers: ctx.headers })).json()) as { rev: number }).rev;
}

test('parseRange cobre intervalos, sufixo e entradas inválidas', () => {
  assert.deepEqual(parseRange('bytes=0-9', 100), { start: 0, end: 9 });
  assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-5', 100), { start: 95, end: 99 });
  assert.deepEqual(parseRange('bytes=-500', 100), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=0-99999', 100), { start: 0, end: 99 });
  for (const bad of ['bytes=100-', 'bytes=5-2', 'bytes=-', 'bytes=-0', 'bytes=0-1,5-6', 'items=0-1', 'bytes=a-b']) assert.equal(parseRange(bad, 100), undefined, bad);
  assert.equal(parseRange('bytes=0-0', 0), undefined);
});

test('media: Range, 416, HEAD, ETag/304, headers de segurança e MIME', async () => {
  await withMobileRuntime('R1A2N3', async ctx => {
    const url = await mediaUrl(ctx, 'texto.txt', '0123456789'.repeat(10));

    const suffix = await fetch(url, { headers: { Range: 'bytes=-5' } });
    assert.equal(suffix.status, 206);
    assert.equal(suffix.headers.get('content-range'), 'bytes 95-99/100');
    assert.equal(await suffix.text(), '56789');

    const clamped = await fetch(url, { headers: { Range: 'bytes=0-99999' } });
    assert.equal(clamped.status, 206);
    assert.equal(clamped.headers.get('content-range'), 'bytes 0-99/100');
    assert.equal((await clamped.text()).length, 100);

    const open = await fetch(url, { headers: { Range: 'bytes=95-' } });
    assert.equal(open.status, 206);
    assert.equal(await open.text(), '56789');

    for (const range of ['bytes=999999-', 'bytes=5-2', 'bytes=0-1,5-6']) {
      const res = await fetch(url, { headers: { Range: range } });
      assert.equal(res.status, 416, range);
      assert.equal(res.headers.get('content-range'), 'bytes */100');
      await res.arrayBuffer();
    }

    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), '100');
    assert.equal(head.headers.get('accept-ranges'), 'bytes');
    assert.equal((await head.text()), '');

    const full = await fetch(url);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('cache-control'), 'private, no-cache');
    assert.equal(full.headers.get('x-content-type-options'), 'nosniff');
    assert.match(full.headers.get('content-security-policy') ?? '', /sandbox/);
    assert.match(full.headers.get('content-type') ?? '', /^text\/plain/);
    const etag = full.headers.get('etag');
    const lastModified = full.headers.get('last-modified');
    assert.ok(etag && lastModified);
    await full.arrayBuffer();

    const notModified = await fetch(url, { headers: { 'If-None-Match': etag } });
    assert.equal(notModified.status, 304);
    assert.equal(await notModified.text(), '');
    const byDate = await fetch(url, { headers: { 'If-Modified-Since': lastModified } });
    assert.equal(byDate.status, 304);
    await byDate.arrayBuffer();
    const changed = await fetch(url, { headers: { 'If-None-Match': '"outro"' } });
    assert.equal(changed.status, 200);
    await changed.arrayBuffer();

    const download = await fetch(`${url}&download=1`);
    const disposition = download.headers.get('content-disposition') ?? '';
    assert.match(disposition, /^attachment; filename="texto\.txt"; filename\*=UTF-8''texto\.txt$/);
    await download.arrayBuffer();

    const accented = await mediaUrl(ctx, 'áudio “final”.txt', 'x');
    const accentedRes = await fetch(`${accented}&download=1`);
    const accentedDisposition = accentedRes.headers.get('content-disposition') ?? '';
    assert.match(accentedDisposition, /filename="[\x20-\x7e]*"/);
    assert.ok(accentedDisposition.includes("filename*=UTF-8''%C3%A1udio%20%E2%80%9Cfinal%E2%80%9D.txt"));
    await accentedRes.arrayBuffer();

    const empty = await mediaUrl(ctx, 'vazio.txt', '');
    const emptyRes = await fetch(empty);
    assert.equal(emptyRes.status, 200);
    assert.equal(emptyRes.headers.get('content-length'), '0');
    await emptyRes.arrayBuffer();
    const emptyRange = await fetch(empty, { headers: { Range: 'bytes=0-0' } });
    assert.equal(emptyRange.status, 416);
    assert.equal(emptyRange.headers.get('content-range'), 'bytes */0');
    await emptyRange.arrayBuffer();

    const m4v = await fetch(await mediaUrl(ctx, 'clip.m4v', 'video'), { method: 'HEAD' });
    assert.equal(m4v.headers.get('content-type'), 'video/x-m4v');
    const srt = await fetch(await mediaUrl(ctx, 'legenda.srt', '1'), { method: 'HEAD' });
    assert.match(srt.headers.get('content-type') ?? '', /^application\/x-subrip/);

    const unauthenticated = await fetch(url.replace(/\?token=.*/, ''));
    assert.equal(unauthenticated.status, 401);
    await unauthenticated.arrayBuffer();
    const missing = await fetch(`${ctx.baseUrl}/api/media/inexistente?token=${ctx.session}`);
    assert.equal(missing.status, 404);
    await missing.arrayBuffer();
  });
});

test('cabeçalhos: nosniff, no-store, sem CORS aberto', async () => {
  await withMobileRuntime('H1D2R3', async ctx => {
    for (const [path, init] of [['/', {}], ['/api/status', {}], ['/api/projects', { headers: ctx.headers }], ['/api/nao-existe', { headers: ctx.headers }]] as const) {
      const res = await fetch(`${ctx.baseUrl}${path}`, init);
      assert.equal(res.headers.get('cache-control'), 'no-store', path);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
      assert.equal(res.headers.get('access-control-allow-origin'), null, path);
      await res.arrayBuffer();
    }
    const preflight = await fetch(`${ctx.baseUrl}/api/projects`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);
    await preflight.arrayBuffer();
  });
});

test('auth: status anônimo, X-Forwarded-For não burla o bloqueio, corpo inválido', async () => {
  await withMobileRuntime('A1U2T3', async ctx => {
    const anonymous = (await (await fetch(`${ctx.baseUrl}/api/status`)).json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(anonymous).sort(), ['authenticated', 'version']);
    assert.equal(anonymous.authenticated, false);
    const wrongSession = (await (await fetch(`${ctx.baseUrl}/api/status`, { headers: { Authorization: 'Bearer nope' } })).json()) as Record<string, unknown>;
    assert.equal(wrongSession.authenticated, false);
    const authed = (await (await fetch(`${ctx.baseUrl}/api/status?token=${ctx.session}`)).json()) as Record<string, unknown>;
    assert.equal(authed.authenticated, true);
    assert.ok(!JSON.stringify(authed).includes('A1U2T3'));

    const post = (body: string, extra: Record<string, string> = {}) => fetch(`${ctx.baseUrl}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body });
    assert.equal((await post('{bad')).status, 400);
    assert.equal((await post('null')).status, 400);
    assert.equal((await post('[]')).status, 400);
    assert.equal((await post('"texto"')).status, 400);
    const oversized = await post(JSON.stringify({ token: 'x'.repeat(70 * 1024) }));
    assert.equal(oversized.status, 413);
    await oversized.arrayBuffer();

    // token que não é string conta como tentativa (401), e a 5ª tentativa trava mesmo trocando o X-Forwarded-For
    const statuses: number[] = [];
    statuses.push((await post(JSON.stringify({ token: 123456 }), { 'X-Forwarded-For': '1.1.1.1' })).status);
    for (let i = 2; i <= 5; i++) statuses.push((await post(JSON.stringify({ token: 'ERRADO' }), { 'X-Forwarded-For': `1.1.1.${i}` })).status);
    assert.deepEqual(statuses, [401, 401, 401, 401, 429]);
    const locked = await post(JSON.stringify({ token: 'A1U2T3' }), { 'X-Forwarded-For': '9.9.9.9' });
    assert.equal(locked.status, 429);
  });
});

test('regeneratePin e mobile.revokeSessions derrubam as sessões abertas', async () => {
  await withMobileRuntime('S1E2S3', async ctx => {
    const ok = await fetch(`${ctx.baseUrl}/api/projects`, { headers: ctx.headers });
    assert.equal(ok.status, 200);
    await ok.arrayBuffer();
    const status = (await ctx.runtime.invoke('mobile.revokeSessions')) as MobileTunnelStatus;
    assert.equal(status.connectedClients, 0);
    const revoked = await fetch(`${ctx.baseUrl}/api/projects`, { headers: ctx.headers });
    assert.equal(revoked.status, 401);
    await revoked.arrayBuffer();

    const login = await fetch(`${ctx.baseUrl}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'S1E2S3' }) });
    const { sessionToken } = (await login.json()) as { sessionToken: string };
    const alive = await fetch(`${ctx.baseUrl}/api/projects`, { headers: { Authorization: `Bearer ${sessionToken}` } });
    assert.equal(alive.status, 200);
    await alive.arrayBuffer();
    ctx.runtime.mobile.regeneratePin();
    const afterRegen = await fetch(`${ctx.baseUrl}/api/projects`, { headers: { Authorization: `Bearer ${sessionToken}` } });
    assert.equal(afterRegen.status, 401);
    await afterRegen.arrayBuffer();
  });
});

test('SSE: ping imediato, snapshot sem log e com capas /api/media/, refresh e rev', async () => {
  await withMobileRuntime('E1V2T3', async ctx => {
    const project = (await ctx.runtime.invoke('projects.create', { title: 'Capa', kind: 'image', format: 'post-1x1', brief: 'Pauta.' })) as Project;
    await mkdir(join(project.path, 'generated'), { recursive: true });
    await writeFile(join(project.path, 'generated', 'slide-01.png'), PNG);
    const job = await ctx.runtime.services.run({ title: 'Tarefa longa', executable: process.execPath, args: ['-e', "console.log('linha-secreta-de-log'); setInterval(() => {}, 1000)"] });

    const sse = await openSse(ctx.baseUrl, ctx.session);
    try {
      assert.match(String(sse.headers['content-type']), /text\/event-stream/);
      assert.equal(sse.frames[0]?.type, 'ping');
      const snapshot = await sse.waitFor(frame => frame.type === 'snapshot');
      const raw = JSON.stringify(sse.frames);
      assert.ok(!raw.includes('media://'));
      assert.ok(!raw.includes('linha-secreta-de-log'));
      const jobs = snapshot.jobs as Array<Record<string, unknown>>;
      assert.ok(jobs.some(item => item.id === job.id));
      assert.ok(jobs.every(item => !('log' in item)));
      const projects = snapshot.projects as Project[];
      assert.ok(projects[0]?.coverUrl?.startsWith('/api/media/'), `coverUrl: ${projects[0]?.coverUrl}`);

      const before = await getRev(ctx);
      await ctx.runtime.invoke('projects.notes', { id: project.id, notes: 'nova nota' });
      await sse.waitFor(frame => frame.type === 'refresh');
      assert.ok(await getRev(ctx) > before);

      // leituras puras não geram refresh
      const refreshes = sse.frames.filter(frame => frame.type === 'refresh').length;
      await ctx.runtime.invoke('brands.list', {});
      await ctx.runtime.invoke('projects.list', {});
      await ctx.runtime.invoke('projects.storyboard', { id: project.id }).catch(() => {});
      await sleep(150);
      assert.equal(sse.frames.filter(frame => frame.type === 'refresh').length, refreshes);

      // job que muda de status: frame sem log e rev sobe; output não sobe rev
      const revBeforeJob = await getRev(ctx);
      await ctx.runtime.supervisor.cancel(job.id);
      const jobFrame = await sse.waitFor(frame => frame.type === 'job' && frame.job.id === job.id && frame.job.status !== 'running');
      assert.ok(!('log' in jobFrame.job));
      assert.ok(await getRev(ctx) > revBeforeJob);

      const jobs2 = (await (await fetch(`${ctx.baseUrl}/api/jobs`, { headers: ctx.headers })).json()) as Array<Record<string, unknown>>;
      assert.ok(jobs2.length > 0 && jobs2.every(item => !('log' in item)));
      const detail = (await (await fetch(`${ctx.baseUrl}/api/jobs/${job.id}`, { headers: ctx.headers })).json()) as Job;
      assert.ok(detail.log.includes('linha-secreta-de-log'));
    } finally {
      sse.close();
    }
  });
});

test('SSE: eventos mobile (com PIN) nunca vão para o celular e rev ignora output', async () => {
  await withMobileRuntime('M1O2B3', async ctx => {
    const sse = await openSse(ctx.baseUrl, ctx.session);
    try {
      await sse.waitFor(frame => frame.type === 'snapshot');
      const before = await getRev(ctx);
      const hostRefreshes = ctx.events.filter(event => event.type === 'refresh').length;
      ctx.runtime.services.emit({ type: 'mobile', mobile: { active: true, token: 'ZZ9ZZ9' } });
      ctx.runtime.services.emit({ type: 'output', jobId: 'x', data: 'saida' });
      ctx.runtime.services.emit({ type: 'refresh' });
      await sse.waitFor(frame => frame.type === 'output');
      await sse.waitFor(frame => frame.type === 'refresh');
      assert.equal(await getRev(ctx), before + 1);
      assert.ok(!sse.frames.some(frame => frame.type === 'mobile'));
      assert.ok(!JSON.stringify(sse.frames).includes('ZZ9ZZ9'));
      // o desktop (host) recebe cada evento uma vez só
      assert.equal(ctx.events.filter(event => event.type === 'refresh').length, hostRefreshes + 1);
    } finally {
      sse.close();
    }
  });
});

test('stop() resolve mesmo com cliente SSE conectado', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-mobile-stop-'));
  const runtime = await createRuntime(root);
  try {
    const server = new MobileServer(new MobileAuthManager('S1T2O3'), runtime, runtime.services);
    const port = await server.start(0);
    const baseUrl = `http://127.0.0.1:${port}`;
    const login = await fetch(`${baseUrl}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'S1T2O3' }) });
    const { sessionToken } = (await login.json()) as { sessionToken: string };
    const sse = await openSse(baseUrl, sessionToken);
    await sse.waitFor(frame => frame.type === 'snapshot');
    await Promise.race([server.stop(), sleep(5000).then(() => { throw new Error('stop() não resolveu'); })]);
    await Promise.race([sse.closed, sleep(2000).then(() => { throw new Error('SSE não foi encerrado'); })]);
    await assert.rejects(fetch(`${baseUrl}/api/status`));
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('porta ocupada cai para uma porta livre e a porta real é retornada', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-mobile-port-'));
  const runtime = await createRuntime(root);
  const blocker = createNetServer();
  await new Promise<void>(done => blocker.listen(0, '127.0.0.1', done));
  const busyPort = (blocker.address() as { port: number }).port;
  const server = new MobileServer(new MobileAuthManager('P1O2R3'), runtime, runtime.services);
  try {
    const port = await server.start(busyPort);
    assert.notEqual(port, busyPort);
    assert.equal(server.getPort(), port);
    const res = await fetch(`http://127.0.0.1:${port}/api/status`);
    assert.equal(res.status, 200);
    await res.arrayBuffer();
  } finally {
    await server.stop();
    await new Promise<void>(done => blocker.close(() => done()));
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('jobs: respond sem data é 400, dismiss/cancel chamam o runtime, id desconhecido é 404', async () => {
  await withMobileRuntime('J1O2B3', async ctx => {
    const job = await ctx.runtime.services.run({ title: 'Espera', executable: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] });
    const calls: Array<{ action: string; payload: Record<string, unknown> }> = [];
    const original = ctx.runtime.invoke.bind(ctx.runtime);
    ctx.runtime.invoke = (async (action: string, payload: Record<string, unknown> = {}) => {
      if (action.startsWith('jobs.')) {
        calls.push({ action, payload });
        return undefined;
      }
      return original(action, payload);
    }) as typeof ctx.runtime.invoke;
    const post = (path: string, body?: unknown) => fetch(`${ctx.baseUrl}/api/jobs/${path}`, { method: 'POST', headers: ctx.headers, body: body === undefined ? undefined : JSON.stringify(body) });

    assert.equal((await post(`${job.id}/respond`, {})).status, 400);
    assert.equal((await post(`${job.id}/respond`, { data: 42 })).status, 400);
    assert.equal(calls.length, 0);
    assert.equal((await post(`${job.id}/respond`, { data: 'sim' })).status, 200);
    assert.equal((await post(`${job.id}/dismiss`)).status, 200);
    assert.equal((await post(`${job.id}/cancel`)).status, 200);
    assert.deepEqual(calls.map(call => call.action), ['jobs.respond', 'jobs.dismissInteraction', 'jobs.cancel']);
    assert.ok(calls.every(call => call.payload.id === job.id));
    assert.equal(calls[0]!.payload.data, 'sim');
    assert.equal((await post('nao-existe/cancel')).status, 404);
    assert.equal((await post(`${job.id}/outra-coisa`)).status, 404);

    // sem stub, responder a um processo que não pergunta nada é erro do usuário (400), não 500
    ctx.runtime.invoke = original as typeof ctx.runtime.invoke;
    const refused = await post(`${job.id}/respond`, { data: 'sim' });
    assert.equal(refused.status, 400);
  });
});

// ---- CloudflareTunnel / MobileService com um cloudflared falso ----

async function fakeCloudflared(dir: string, body: string): Promise<string> {
  const path = join(dir, 'cloudflared');
  await writeFile(path, `#!/usr/bin/env node\n${body}\n`);
  await chmod(path, 0o755);
  return path;
}

const unixOnly = process.platform === 'win32' ? { skip: 'script de shell falso só em unix' } : {};

test('CloudflareTunnel ignora api.trycloudflare.com e só resolve após "Registered tunnel connection" + sonda', unixOnly, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdc-fake-cf-'));
  try {
    const script = await fakeCloudflared(dir, `
console.error('Requesting new quick Tunnel on https://api.trycloudflare.com ...');
console.error('|  https://fake-quick-demo.trycloudflare.com  |');
setTimeout(() => console.error('INF Registered tunnel connection connIndex=0'), 500);
setInterval(() => {}, 1000);`);
    const probed: Array<{ url: string; at: number }> = [];
    const started = Date.now();
    let attempts = 0;
    const tunnel = new CloudflareTunnel({ cloudflaredPath: script, port: 1, probe: async url => { probed.push({ url, at: Date.now() - started }); return ++attempts >= 3; } });
    const url = await tunnel.start();
    assert.equal(url, 'https://fake-quick-demo.trycloudflare.com');
    assert.ok(probed.length >= 3, 'a sonda é repetida até responder');
    assert.ok(probed.every(call => call.url === url));
    assert.ok(probed[0]!.at >= 450, `sonda antes do registro (${probed[0]!.at}ms)`);
    assert.equal(tunnel.getStatus().state, 'connected');
    await tunnel.stop();
    assert.equal(tunnel.getStatus().state, 'stopped');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CloudflareTunnel: DNS local que não resolve o host novo não impede o link de ser entregue', unixOnly, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdc-fake-cf-'));
  try {
    const script = await fakeCloudflared(dir, `
console.error('|  https://dns-lento.trycloudflare.com  |');
console.error('INF Registered tunnel connection connIndex=0');
setInterval(() => {}, 1000);`);
    const tunnel = new CloudflareTunnel({ cloudflaredPath: script, port: 1, probe: async () => false, probeGraceMs: 700 });
    const started = Date.now();
    const url = await tunnel.start();
    assert.equal(url, 'https://dns-lento.trycloudflare.com');
    assert.ok(Date.now() - started >= 650, 'o probe tem a carência antes de ser dispensado');
    assert.equal(tunnel.getStatus().state, 'connected');
    await tunnel.stop();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CloudflareTunnel: partida dupla gera um único processo e saída prematura rejeita', unixOnly, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdc-fake-cf-'));
  try {
    const spawnLog = join(dir, 'spawns.log');
    const script = await fakeCloudflared(dir, `
require('node:fs').appendFileSync(${JSON.stringify(spawnLog)}, 'x\\n');
console.error('https://double-start.trycloudflare.com');
console.error('Registered tunnel connection');
setInterval(() => {}, 1000);`);
    const tunnel = new CloudflareTunnel({ cloudflaredPath: script, port: 1, probe: async () => true });
    const [a, b] = await Promise.all([tunnel.start(), tunnel.start()]);
    assert.equal(a, b);
    assert.equal(await tunnel.start(), a);
    assert.equal((await readFile(spawnLog, 'utf8')).trim().split('\n').length, 1);
    await tunnel.stop();

    const dying = await fakeCloudflared(join(await mkdtemp(join(dir, 'd-')), '.'), "console.error('boom'); process.exit(2);");
    const failing = new CloudflareTunnel({ cloudflaredPath: dying, port: 1, probe: async () => true });
    await assert.rejects(failing.start(), /encerrou prematuramente/);
    assert.equal(failing.getStatus().state, 'error');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('MobileService: queda inesperada do túnel desativa o serviço e limpa a URL; partida dupla = 1 processo', unixOnly, async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-mobile-svc-'));
  const events: AppEvent[] = [];
  const runtime = await createRuntime(root, events);
  try {
    const toolDir = toolPrefix(runtime.services, 'cloudflared');
    await mkdir(toolDir, { recursive: true });
    const spawnLog = join(root, 'spawns.log');
    const dieFile = join(root, 'die');
    await fakeCloudflared(toolDir, `
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(spawnLog)}, 'x\\n');
console.error('https://svc-demo.trycloudflare.com');
console.error('Registered tunnel connection');
setInterval(() => { if (fs.existsSync(${JSON.stringify(dieFile)})) process.exit(3); }, 50);`);
    const emitted: MobileTunnelStatus[] = [];
    const service = new MobileService(runtime, runtime.services, event => { if (event.mobile) emitted.push(event.mobile); }, '0.2.0', { initialPin: 'S1V2C3', tunnelProbe: async () => true });
    try {
      const [first, second] = await Promise.all([service.start({ port: 0 }), service.start({ port: 0 })]);
      assert.equal(first.url, 'https://svc-demo.trycloudflare.com');
      assert.equal(second.url, first.url);
      assert.equal((await readFile(spawnLog, 'utf8')).trim().split('\n').length, 1);
      assert.equal(service.getStatus().active, true);
      assert.equal(service.server.getTunnelUrl(), first.url);

      await writeFile(dieFile, '1');
      const deadline = Date.now() + 5000;
      while (service.getStatus().active && Date.now() < deadline) await sleep(50);
      const status = service.getStatus();
      assert.equal(status.active, false);
      assert.equal(status.url, undefined);
      assert.ok(status.error);
      assert.equal(service.server.getTunnelUrl(), '');
      assert.equal(emitted.at(-1)?.active, false);
      assert.ok(emitted.at(-1)?.error);
    } finally {
      await service.stop();
    }
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('MobileService: falha na partida preserva o erro e deixa o serviço inativo', unixOnly, async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-mobile-svc-'));
  const runtime = await createRuntime(root);
  try {
    const toolDir = toolPrefix(runtime.services, 'cloudflared');
    await mkdir(toolDir, { recursive: true });
    await fakeCloudflared(toolDir, "console.error('sem rede'); process.exit(2);");
    const service = new MobileService(runtime, runtime.services, () => {}, '0.2.0', { initialPin: 'F1A2L3', tunnelProbe: async () => true });
    await assert.rejects(service.start({ port: 0 }), /encerrou prematuramente/);
    const status = service.getStatus();
    assert.equal(status.active, false);
    assert.match(status.error ?? '', /encerrou prematuramente/);
    await service.stop();
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
