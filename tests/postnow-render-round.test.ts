import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { Runtime } from '../src/main/runtime.js';
import type { AppEvent, Brand, Job, Project, ProjectDetail } from '../src/shared/contracts.js';

const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2sAAAAASUVORK5CYII=', 'base64');
const BATCH_ID = '1794112691702-c6c3b30e';

// Regressão: recusa anterior ao processamento não pode gravar `failed` no status da rodada.
// A espera usa o evento final do job emitido pelo Runtime, sem tempo fixo.
function jobWatcher(): { emit: (event: AppEvent) => void; wait: (id: string) => Promise<Job> } {
  const finished = new Map<string, Job>();
  const waiters = new Map<string, (job: Job) => void>();
  return {
    emit(event) {
      const job = event.type === 'job' ? event.job : undefined;
      if (!job || job.status === 'running') return;
      const waiter = waiters.get(job.id);
      if (waiter) { waiters.delete(job.id); waiter(job); return; }
      finished.set(job.id, job);
    },
    wait(id) {
      const job = finished.get(id);
      if (job) return Promise.resolve(job);
      return new Promise(resolve => waiters.set(id, resolve));
    },
  };
}

function openRuntime(root: string, emit: (event: AppEvent) => void): Runtime {
  return new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/',
    secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    decryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    update: async () => ({ available: false, message: 'indisponível' }),
  }, emit);
}

async function createCarousel(runtime: Runtime, root: string): Promise<Project> {
  await runtime.init();
  await runtime.invoke('app.settings', { workspace: join(root, 'workspace') });
  const logo = join(root, 'logo.png');
  await writeFile(logo, ONE_PIXEL_PNG);
  const brand = await runtime.invoke('brands.save', { name: 'Marca de teste', tone: 'Claro e direto.', colors: ['#123456'], logo }) as Brand;
  const project = await runtime.invoke('projects.create', {
    title: 'Carrossel de teste', kind: 'image', format: 'carousel-1x1', brief: 'Explicar um tema com fontes.', brandId: brand.id,
  }) as Project;
  const projectJsonPath = join(project.path, 'project.json');
  const native = JSON.parse(await readFile(projectJsonPath, 'utf8')) as Record<string, unknown>;
  native.title = project.title;
  native.audience = 'Pessoas que estão começando no tema.';
  native.objective = 'Explicar o assunto com fontes verificáveis.';
  native.promise = 'Uma explicação clara em cinco páginas.';
  native.cta = 'Salve para consultar depois.';
  const pages = (native.pages as Record<string, unknown>[]).map((page, index) => ({
    ...page,
    headline: `Título da página ${index + 1}`,
    copy: `Copy editorial da página ${index + 1}.`,
    visual_function: `Função visual da página ${index + 1}.`,
    depicted_person: 'none',
  }));
  native.pages = pages;
  native.editorial = { claims_reviewed: false, copy_approved: false };
  await writeFile(projectJsonPath, `${JSON.stringify(native, null, 2)}\n`);
  for (const page of pages) {
    await writeFile(join(project.path, String(page.prompt_file)), `Copy aprovada: ${page.copy}\nFunção visual: ${page.visual_function}\nDireção visual editorial refinada.\n`);
  }
  await writeFile(join(project.path, 'research', 'claims.json'), `${JSON.stringify({ reviewed: false, claims: [{ id: 'claim-1', claim: 'Fato verificável.', source: 'Fonte oficial', source_url: 'https://example.org/fonte', status: 'approved' }] }, null, 2)}\n`);
  return project;
}

async function approveVisualReview(runtime: Runtime, project: Project): Promise<void> {
  const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
  assert.equal(detail.visualReview?.ready, true);
  const contentHash = detail.visualReview?.contentHash;
  assert.ok(contentHash);
  const approved = await runtime.invoke('projects.visual.approve', { id: project.id, approved: true, contentHash }) as ProjectDetail;
  assert.equal(approved.visualReview?.approved, true);
}

// Escrita depois da aprovação: projects.detail reconcilia rodadas ready sem saídas completas e as marca failed.
// Texto cru simula status que o app não valida (sem updatedAt), como um agente poderia gravar.
async function writeRound(projectPath: string, status: Record<string, unknown> | string, delivered: boolean): Promise<{ statusPath: string; original: string }> {
  const runDir = join(projectPath, 'generated', 'runs', BATCH_ID);
  await mkdir(runDir, { recursive: true });
  const statusPath = join(runDir, '.status.json');
  const original = typeof status === 'string' ? `${status}\n` : `${JSON.stringify({ updatedAt: '2026-11-07T12:00:00.000Z', ...status }, null, 2)}\n`;
  await writeFile(statusPath, original);
  if (delivered) await writeFile(join(runDir, '.mapping.json'), '{}\n');
  return { statusPath, original };
}

test('render não rebaixa rodada legada pronta sem formato registrado', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-render-legacy-'));
  const jobs = jobWatcher();
  const runtime = openRuntime(root, jobs.emit);
  try {
    const project = await createCarousel(runtime, root);
    await approveVisualReview(runtime, project);
    const round = await writeRound(project.path, { state: 'ready' }, false);
    const started = await runtime.invoke('projects.render', { id: project.id, batchId: BATCH_ID, logoPolicy: 'all-pages' }) as Job;
    const finished = await jobs.wait(started.id);
    assert.equal(finished.status, 'failed');
    assert.match(finished.log, /Esta rodada não tem formato registrado/);
    assert.equal(await readFile(round.statusPath, 'utf8'), round.original);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('render não rebaixa rodada já entregue', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-render-delivered-'));
  const jobs = jobWatcher();
  const runtime = openRuntime(root, jobs.emit);
  try {
    const project = await createCarousel(runtime, root);
    await approveVisualReview(runtime, project);
    const round = await writeRound(project.path, { state: 'ready', format: 'carousel-1x1' }, true);
    const started = await runtime.invoke('projects.render', { id: project.id, batchId: BATCH_ID, logoPolicy: 'all-pages' }) as Job;
    const finished = await jobs.wait(started.id);
    assert.equal(finished.status, 'failed');
    assert.match(finished.log, /Esta rodada já está pronta e não será sobrescrita\./);
    assert.equal(await readFile(round.statusPath, 'utf8'), round.original);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('render recusa status ilegível sem reescrevê-lo', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-render-unreadable-'));
  const jobs = jobWatcher();
  const runtime = openRuntime(root, jobs.emit);
  try {
    const project = await createCarousel(runtime, root);
    await approveVisualReview(runtime, project);
    const round = await writeRound(project.path, '{"state":"ready"}', false);
    const started = await runtime.invoke('projects.render', { id: project.id, batchId: BATCH_ID, logoPolicy: 'all-pages' }) as Job;
    const finished = await jobs.wait(started.id);
    assert.equal(finished.status, 'failed');
    assert.match(finished.log, /O estado desta rodada está ilegível/);
    assert.equal(await readFile(round.statusPath, 'utf8'), round.original);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('render não reescreve rodada entregue com estado ilegível', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-render-unreadable-delivered-'));
  const jobs = jobWatcher();
  const runtime = openRuntime(root, jobs.emit);
  try {
    const project = await createCarousel(runtime, root);
    await approveVisualReview(runtime, project);
    const round = await writeRound(project.path, '{"state":"ready","format":"carousel-1x1"}', true);
    const started = await runtime.invoke('projects.render', { id: project.id, batchId: BATCH_ID, logoPolicy: 'all-pages' }) as Job;
    const finished = await jobs.wait(started.id);
    assert.equal(finished.status, 'failed');
    assert.match(finished.log, /Esta rodada já está pronta e não será sobrescrita\./);
    assert.equal(await readFile(round.statusPath, 'utf8'), round.original);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
