import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir, readdir, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Runtime } from '../src/main/runtime.js';
import type { Asset, Brand, NarrationState, Project, ProjectDetail } from '../src/shared/contracts.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2sAAAAASUVORK5CYII=', 'base64');

interface Call { action: string; payload: Record<string, unknown> }
interface Ctx {
  runtime: Runtime;
  root: string;
  baseUrl: string;
  headers: Record<string, string>;
  /** Chamadas pagas interceptadas (`agents.*`, `projects.render`): nada disso executa de verdade. */
  calls: Call[];
  get<T>(path: string): Promise<T>;
  post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }>;
}

async function withMobile(run: (ctx: Ctx) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'mdc-mobile-views-'));
  const workspace = join(root, 'workspace');
  await mkdir(workspace, { recursive: true });
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: '/api/media/',
    secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('unavailable'); },
    decryptSecret: () => { throw new Error('unavailable'); },
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    update: async () => ({ available: false, message: 'disabled' }),
  });
  await runtime.init();
  await runtime.invoke('app.settings', { workspace, provider: 'codex' });
  runtime.mobile.authManager.setPin('V1E2W3');
  const port = await runtime.mobile.server.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  const calls: Call[] = [];
  const original = runtime.invoke.bind(runtime);
  runtime.invoke = (async (action: string, payload: Record<string, unknown> = {}) => {
    if (action.startsWith('agents.') || action === 'projects.render') {
      calls.push({ action, payload });
      return { id: 'job-stub', title: action, status: 'running' };
    }
    return original(action, payload);
  }) as typeof runtime.invoke;
  try {
    const auth = await fetch(`${baseUrl}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'V1E2W3' }) });
    const { sessionToken } = (await auth.json()) as { sessionToken: string };
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` };
    await run({
      runtime, root, baseUrl, headers, calls,
      get: async <T>(path: string) => (await (await fetch(`${baseUrl}${path}`, { headers })).json()) as T,
      post: async (path, body) => {
        const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
        return { status: res.status, body: (await res.json()) as Record<string, unknown> };
      },
    });
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
}

interface View extends ProjectDetail {
  gallery: { items: Asset[]; source: string; batchId?: string; state: string; statusMessage?: string; stale: boolean };
  review: { kept: number; redo: number; pending: number };
  scenes?: unknown;
  video?: { mode: string; reviewVideos: Asset[]; latest?: Asset; previous: Asset[]; emptyReason?: string; narration: { blocked: boolean; scenes: Array<{ id: string; audioUrl?: string; audioApproved: boolean }> } };
  delivery: { approved: Asset[]; zipUrl: string | null };
  footerActions: Record<string, { kind: string; label: string; enabled: boolean } | undefined>;
}

/** Projeto de imagem com uma rodada importada e saída `slide-01.png`; `state` grava o `.status.json` da rodada. */
async function imageProjectWithRound(ctx: Ctx, state?: { state: 'ready' | 'failed'; message?: string }): Promise<{ project: Project; run: string }> {
  const project = (await ctx.runtime.invoke('projects.create', { title: 'Galeria mobile', kind: 'image', format: 'post-1x1', brief: 'Pauta da galeria.' })) as Project;
  const fixture = join(ctx.root, `fixture-${project.id}.png`);
  await writeFile(fixture, PNG);
  const imported = (await ctx.runtime.invoke('projects.importAsset', { id: project.id, path: fixture })) as { batches?: Array<{ id: string }> };
  const batchId = imported.batches![0]!.id;
  const run = join(project.path, 'generated', 'runs', batchId);
  const inputName = (await readdir(join(run, '.input')))[0]!;
  await writeFile(join(run, 'slide-01.png'), PNG);
  await writeFile(join(run, '.mapping.json'), JSON.stringify({ pages: [{ page: 1, input: inputName, output: 'slide-01.png' }] }));
  if (state) await writeFile(join(run, '.status.json'), JSON.stringify({ ...state, format: 'post-1x1', updatedAt: new Date().toISOString() }));
  return { project, run };
}

test('image detail shows the latest round in the gallery even when the texts are not approved', async () => {
  await withMobile(async ctx => {
    const { project } = await imageProjectWithRound(ctx, { state: 'ready' });
    const view = await ctx.get<View>(`/api/projects/${project.id}`);
    assert.equal(view.visualReview?.approved ?? false, false);
    assert.equal(view.gallery.source, 'latest-batch');
    assert.equal(view.gallery.state, 'ready');
    assert.ok(view.gallery.items.length > 0);
    assert.ok(view.gallery.items.every(item => item.url.startsWith('/api/media/') && /[?&]v=\d+/.test(item.url) && item.url.includes('token=')));
    assert.deepEqual(view.review, { kept: 0, redo: 0, pending: view.gallery.items.length });
    assert.equal(typeof (view as unknown as { caption: string }).caption, 'string');
  });
});

test('legacy flat slides populate the gallery when there is no round', async () => {
  await withMobile(async ctx => {
    const project = (await ctx.runtime.invoke('projects.create', { title: 'Legado', kind: 'image', format: 'post-1x1', brief: 'Pauta.' })) as Project;
    await mkdir(join(project.path, 'generated'), { recursive: true });
    await writeFile(join(project.path, 'generated', 'slide-02.png'), PNG);
    await writeFile(join(project.path, 'generated', 'slide-01.png'), PNG);
    const view = await ctx.get<View>(`/api/projects/${project.id}`);
    assert.equal(view.gallery.source, 'legacy');
    assert.deepEqual(view.gallery.items.map(item => item.name), ['generated/slide-01.png', 'generated/slide-02.png']);
  });
});

test('a project without images reports an empty gallery', async () => {
  await withMobile(async ctx => {
    const project = (await ctx.runtime.invoke('projects.create', { title: 'Vazio', kind: 'image', format: 'post-1x1', brief: 'Pauta.' })) as Project;
    const view = await ctx.get<View>(`/api/projects/${project.id}`);
    assert.equal(view.gallery.source, 'none');
    assert.deepEqual(view.gallery.items, []);
  });
});

test('a failed round exposes its state and message', async () => {
  await withMobile(async ctx => {
    const { project } = await imageProjectWithRound(ctx, { state: 'failed', message: 'O ImageGen recusou a página 2.' });
    const view = await ctx.get<View>(`/api/projects/${project.id}`);
    assert.equal(view.gallery.state, 'failed');
    assert.equal(view.gallery.statusMessage, 'O ImageGen recusou a página 2.');
    assert.equal(view.gallery.source, 'latest-batch');
  });
});

async function videoProject(ctx: Ctx): Promise<Project> {
  const project = (await ctx.runtime.invoke('projects.create', { title: 'Reels mobile', kind: 'video', format: 'reels', brief: 'Pauta do vídeo.' })) as Project;
  await mkdir(join(project.path, 'renders', 'review'), { recursive: true });
  return project;
}

/** O desktop só marca `storyboardReady` depois da validação do VideoGo e `storyboardCompositionReady` depois de uma sessão do Opus; o teste força os campos no detalhe lido pelo celular. */
function forceStoryboardReady(ctx: Ctx, composed = true): void {
  const inner = ctx.runtime.invoke.bind(ctx.runtime);
  ctx.runtime.invoke = (async (action: string, payload: Record<string, unknown> = {}) => {
    const result = await inner(action, payload);
    return action === 'projects.detail' ? { ...(result as ProjectDetail), storyboardReady: true, storyboardCompositionReady: composed } : result;
  }) as typeof ctx.runtime.invoke;
}

test('video detail has array scenes, the lexicographically newest render as latest and a narrated-without-audio empty reason', async () => {
  await withMobile(async ctx => {
    const project = await videoProject(ctx);
    const silent = join(ctx.root, 'silent.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=64x64:d=0.2', '-c:v', 'libx264', '-y', silent]);
    const older = join(project.path, 'renders', 'review', 'a-1700000000001-aaaaaaaa.mp4');
    const newer = join(project.path, 'renders', 'review', 'a-1700000000002-bbbbbbbb.mp4');
    await writeFile(older, Buffer.from('mp4-old'));
    await writeFile(newer, Buffer.from('mp4-new'));

    await ctx.runtime.invoke('projects.narration.setMode', { id: project.id, mode: 'silent' });
    const silentView = await ctx.get<View>(`/api/projects/${project.id}`);
    assert.ok(Array.isArray(silentView.scenes));
    assert.ok((silentView.scenes as Array<{ onScreen: unknown }>).every(scene => typeof scene.onScreen === 'string'));
    assert.equal(silentView.video?.mode, 'silent');
    assert.equal(silentView.video?.latest?.name, 'renders/review/a-1700000000002-bbbbbbbb.mp4');
    assert.deepEqual(silentView.video?.previous.map(asset => asset.name), ['renders/review/a-1700000000001-aaaaaaaa.mp4']);
    assert.equal(silentView.video?.emptyReason, undefined);

    // Modo narrado e só renders sem áudio verificado: nada para revisar, com a razão explicada.
    await rm(older); await rm(newer);
    const { copyFile } = await import('node:fs/promises');
    await copyFile(silent, join(project.path, 'renders', 'review', 'a-1700000000003-cccccccc.mp4'));
    await ctx.runtime.invoke('projects.narration.setMode', { id: project.id, mode: 'narrated' });
    const narratedView = await ctx.get<View>(`/api/projects/${project.id}`);
    assert.equal(narratedView.video?.mode, 'narrated');
    assert.deepEqual(narratedView.video?.reviewVideos, []);
    assert.equal(narratedView.video?.latest, undefined);
    assert.equal(typeof narratedView.video?.emptyReason, 'string');
    assert.ok(narratedView.video!.emptyReason!.length > 0);
  });
});

test('approve-video leaves at most one approved review video and approves the newest', async () => {
  await withMobile(async ctx => {
    const project = await videoProject(ctx);
    await ctx.runtime.invoke('projects.narration.setMode', { id: project.id, mode: 'silent' });
    const names = ['a-1700000000001-aaaaaaaa.mp4', 'a-1700000000002-bbbbbbbb.mp4', 'a-1700000000003-cccccccc.mp4'];
    for (const name of names) await writeFile(join(project.path, 'renders', 'review', name), Buffer.from(`mp4-${name}`));
    forceStoryboardReady(ctx);
    const oldest = (await ctx.runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail).assets.find(asset => asset.name.endsWith(names[0]!))!;
    await ctx.runtime.invoke('projects.approve', { id: project.id, path: oldest.path, approved: true });

    const res = await ctx.post(`/api/projects/${project.id}/action`, { action: 'approve-video' });
    assert.equal(res.status, 200);
    const after = await ctx.get<View>(`/api/projects/${project.id}`);
    const approved = after.assets.filter(asset => asset.kind === 'video' && asset.approved);
    assert.deepEqual(approved.map(asset => asset.name), ['renders/review/a-1700000000003-cccccccc.mp4']);
    assert.ok(typeof (res.body.detail as ProjectDetail).assets[0]!.url === 'string' && (res.body.detail as ProjectDetail).assets.every(asset => asset.url.startsWith('/api/media/')));
  });
});

test('approve-video is refused while the storyboard is not approved', async () => {
  await withMobile(async ctx => {
    const project = await videoProject(ctx);
    await ctx.runtime.invoke('projects.narration.setMode', { id: project.id, mode: 'silent' });
    await writeFile(join(project.path, 'renders', 'review', 'a-1700000000001-aaaaaaaa.mp4'), Buffer.from('mp4'));
    const res = await ctx.post(`/api/projects/${project.id}/action`, { action: 'approve-video' });
    assert.equal(res.status, 400);
    assert.equal(typeof res.body.error, 'string');
  });
});

test('approve-video is refused when the video was not produced by Claude Opus 5.5', async () => {
  await withMobile(async ctx => {
    const project = await videoProject(ctx);
    await ctx.runtime.invoke('projects.narration.setMode', { id: project.id, mode: 'silent' });
    await writeFile(join(project.path, 'renders', 'review', 'a-1700000000001-aaaaaaaa.mp4'), Buffer.from('mp4'));
    forceStoryboardReady(ctx, false);
    const res = await ctx.post(`/api/projects/${project.id}/action`, { action: 'approve-video' });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error), /Claude Opus 5\.5/);
  });
});

test('approve-audio approves each pending scene audio and exposes it on the video view', async () => {
  await withMobile(async ctx => {
    const project = await videoProject(ctx);
    const tone = join(ctx.root, 'tom.wav');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', tone]);
    const initial = (await ctx.runtime.invoke('projects.narration', { id: project.id })) as NarrationState;
    const sceneId = initial.scenes[0]!.id;
    await ctx.runtime.invoke('projects.attachNarrationAudio', { projectId: project.id, sceneId, source: { kind: 'file', path: tone } });
    const before = await ctx.get<View>(`/api/projects/${project.id}`);
    const scene = before.video!.narration.scenes.find(item => item.id === sceneId)!;
    assert.ok(scene.audioUrl?.startsWith('/api/media/'));
    assert.equal(scene.audioApproved, false);

    const res = await ctx.post(`/api/projects/${project.id}/action`, { action: 'approve-audio' });
    assert.equal(res.status, 200);
    const after = await ctx.get<View>(`/api/projects/${project.id}`);
    assert.equal(after.video!.narration.scenes.find(item => item.id === sceneId)!.audioApproved, true);
  });
});

test('paid actions without confirm are refused with 400 and never reach the runtime', async () => {
  await withMobile(async ctx => {
    const image = (await ctx.runtime.invoke('projects.create', { title: 'Custo imagem', kind: 'image', format: 'post-1x1', brief: 'Pauta.' })) as Project;
    const video = await videoProject(ctx);
    await ctx.runtime.invoke('projects.narration.setMode', { id: video.id, mode: 'silent' });
    await writeFile(join(video.path, 'renders', 'review', 'a-1700000000001-aaaaaaaa.mp4'), Buffer.from('mp4'));
    forceStoryboardReady(ctx);

    const paid: Array<[string, string, Record<string, unknown>, string]> = [
      [image.id, 'start-agent', {}, 'agents.start'],
      [image.id, 'prepare-texts', {}, 'agents.start'],
      [image.id, 'generate-images', {}, 'agents.generateImages'],
      [image.id, 'revise-images', {}, 'agents.reviseImages'],
      [image.id, 'render', {}, 'projects.render'],
      [video.id, 'request-video-revision', { note: 'Troque o ritmo.' }, 'agents.start'],
      [video.id, 'render', {}, 'projects.render'],
    ];
    for (const [id, action, extra] of paid) {
      const refused = await ctx.post(`/api/projects/${id}/action`, { action, ...extra });
      assert.equal(refused.status, 400, `${action} sem confirm`);
      assert.equal(refused.body.error, 'Confirme a ação no celular para continuar.');
    }
    assert.deepEqual(ctx.calls, []);

    for (const [id, action, extra, expected] of paid) {
      ctx.calls.length = 0;
      const accepted = await ctx.post(`/api/projects/${id}/action`, { action, confirm: true, ...extra });
      assert.equal(accepted.status, 200, `${action} com confirm: ${JSON.stringify(accepted.body)}`);
      assert.equal(ctx.calls.length, 1, action);
      assert.equal(ctx.calls[0]!.action, expected);
      assert.equal(ctx.calls[0]!.payload.id, id);
      if (expected !== 'projects.render') assert.equal(ctx.calls[0]!.payload.confirm, true);
      assert.equal((accepted.body.job as { id: string }).id, 'job-stub');
    }
  });
});

test('video render is refused when narration is not ready or the storyboard is not approved', async () => {
  await withMobile(async ctx => {
    const project = await videoProject(ctx);
    const notReady = await ctx.post(`/api/projects/${project.id}/action`, { action: 'render', confirm: true });
    assert.equal(notReady.status, 400);
    await ctx.runtime.invoke('projects.narration.setMode', { id: project.id, mode: 'narrated' });
    forceStoryboardReady(ctx);
    const noAudio = await ctx.post(`/api/projects/${project.id}/action`, { action: 'render', confirm: true });
    assert.equal(noAudio.status, 400);
    assert.deepEqual(ctx.calls, []);
  });
});

test('an invalid JSON body is answered with 400', async () => {
  await withMobile(async ctx => {
    const project = (await ctx.runtime.invoke('projects.create', { title: 'JSON ruim', kind: 'image', format: 'post-1x1', brief: 'Pauta.' })) as Project;
    const res = await fetch(`${ctx.baseUrl}/api/projects/${project.id}/action`, { method: 'POST', headers: ctx.headers, body: '{nope' });
    assert.equal(res.status, 400);
    assert.equal(typeof ((await res.json()) as { error: string }).error, 'string');
    assert.deepEqual(ctx.calls, []);
  });
});

test('creating a project from the phone only starts the agent with an explicit confirm', async () => {
  await withMobile(async ctx => {
    const without = await ctx.post('/api/projects', { title: 'Sem confirmar', kind: 'image', autoStartAgent: true });
    assert.equal(without.status, 200);
    assert.equal(without.body.jobId, undefined);
    assert.deepEqual(ctx.calls, []);
    const confirmed = await ctx.post('/api/projects', { title: 'Confirmado', kind: 'image', autoStartAgent: true, confirm: true });
    assert.equal(confirmed.body.jobId, 'job-stub');
    assert.equal(ctx.calls.length, 1);
    assert.equal(ctx.calls[0]!.payload.confirm, true);
  });
});

test('GET /api/brands lists id, name and whether there is a logo, with the logo URL mapped', async () => {
  await withMobile(async ctx => {
    const logo = join(ctx.root, 'logo.png');
    await writeFile(logo, PNG);
    const withLogo = (await ctx.runtime.invoke('brands.save', { name: 'Marca com logo', tone: 'direto', colors: ['#112233'], logo })) as Brand;
    const without = (await ctx.runtime.invoke('brands.save', { name: 'Marca sem logo', tone: 'direto', colors: ['#112233'] })) as Brand;
    const brands = await ctx.get<Array<{ id: string; name: string; hasLogo: boolean; logoUrl?: string; tone?: string }>>('/api/brands');
    const a = brands.find(brand => brand.id === withLogo.id)!;
    const b = brands.find(brand => brand.id === without.id)!;
    assert.equal(a.name, 'Marca com logo');
    assert.equal(a.hasLogo, true);
    assert.ok(a.logoUrl?.startsWith('/api/media/'));
    assert.equal(b.hasLogo, false);
    assert.equal(b.logoUrl, undefined);
    assert.equal(a.tone, undefined);

    const project = (await ctx.runtime.invoke('projects.create', { title: 'Marca no projeto', kind: 'image', format: 'post-1x1', brief: 'Pauta.' })) as Project;
    const set = await ctx.post(`/api/projects/${project.id}/action`, { action: 'set-brand', brandId: withLogo.id });
    assert.equal(set.status, 200);
    assert.equal((await ctx.get<View>(`/api/projects/${project.id}`)).brandId, withLogo.id);
  });
});

async function zipTempDirs(): Promise<string[]> {
  return (await readdir(tmpdir())).filter(name => name.startsWith('mdc-zip-')).sort();
}

test('package.zip carries MANIFEST.json and only approved artifacts, and removes its temp folder', async () => {
  await withMobile(async ctx => {
    const { project } = await imageProjectWithRound(ctx, { state: 'ready' });
    const detail = (await ctx.runtime.invoke('projects.detail', { id: project.id })) as ProjectDetail;
    const keep = detail.batches![0]!.assets.find(asset => asset.name.endsWith('slide-01.png'))!;
    const skip = detail.assets.find(asset => asset.name === 'storyboard.md')!;
    assert.ok(keep && skip);
    await ctx.runtime.invoke('projects.approve', { id: project.id, path: keep.path, approved: true });

    const before = await zipTempDirs();
    const empty = await fetch(`${ctx.baseUrl}/api/projects/${(await imageProjectWithRound(ctx)).project.id}/package.zip`, { headers: ctx.headers });
    assert.equal(empty.status, 400);
    assert.deepEqual(await empty.json(), { error: 'Aprove pelo menos um arquivo.' });

    const res = await fetch(`${ctx.baseUrl}/api/projects/${project.id}/package.zip`, { headers: ctx.headers });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/zip');
    assert.match(res.headers.get('content-disposition') ?? '', /^attachment; filename="[^"]+\.zip"/);
    const body = Buffer.from(await res.arrayBuffer());
    assert.equal(Number(res.headers.get('content-length')), body.length);
    assert.ok(body.includes(Buffer.from('MANIFEST.json')));
    assert.ok(body.includes(Buffer.from(`artifacts/${keep.name}`)));
    assert.ok(!body.includes(Buffer.from(`artifacts/${skip.name}`)));

    const view = await ctx.get<View>(`/api/projects/${project.id}`);
    assert.match(view.delivery.zipUrl ?? '', new RegExp(`^/api/projects/${project.id}/package\\.zip`));
    for (let attempt = 0; attempt < 20 && (await zipTempDirs()).join() !== before.join(); attempt += 1) await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepEqual(await zipTempDirs(), before);
  });
});

test('asset URLs carry a version that changes when the file is rewritten', async () => {
  await withMobile(async ctx => {
    const project = (await ctx.runtime.invoke('projects.create', { title: 'Versão', kind: 'image', format: 'post-1x1', brief: 'Pauta.' })) as Project;
    await mkdir(join(project.path, 'generated'), { recursive: true });
    const file = join(project.path, 'generated', 'slide-01.png');
    await writeFile(file, PNG);
    await utimes(file, new Date(1_700_000_000_000), new Date(1_700_000_000_000));
    const first = (await ctx.get<View>(`/api/projects/${project.id}`)).gallery.items[0]!.url;
    await writeFile(file, Buffer.concat([PNG, Buffer.from('x')]));
    await utimes(file, new Date(1_700_000_100_000), new Date(1_700_000_100_000));
    const second = (await ctx.get<View>(`/api/projects/${project.id}`)).gallery.items[0]!.url;
    const parse = (url: string) => ({ path: url.split('?')[0], v: new URL(url, 'http://x').searchParams.get('v') });
    assert.equal(parse(first).path, parse(second).path);
    assert.ok(parse(first).v && parse(second).v);
    assert.notEqual(parse(first).v, parse(second).v);
  });
});

test('reading project details from the phone does not emit refresh events', async () => {
  await withMobile(async ctx => {
    const { project } = await imageProjectWithRound(ctx, { state: 'ready' });
    const video = await videoProject(ctx);
    const events: string[] = [];
    const inner = ctx.runtime.invoke.bind(ctx.runtime);
    ctx.runtime.invoke = (async (action: string, payload: Record<string, unknown> = {}) => { events.push(action); return inner(action, payload); }) as typeof ctx.runtime.invoke;
    await ctx.get(`/api/projects/${project.id}`);
    await ctx.get(`/api/projects/${video.id}`);
    assert.ok(events.every(action => ['projects.detail', 'projects.narration', 'projects.storyboard', 'brands.list'].includes(action)), events.join());
  });
});
