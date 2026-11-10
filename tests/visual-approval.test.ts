import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { Runtime } from '../src/main/runtime.js';
import { completeFormatAdaptation, readFormatAdaptation } from '../src/main/projects.js';
import type { Brand, Project, ProjectDetail } from '../src/shared/contracts.js';

const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2sAAAAASUVORK5CYII=', 'base64');
const CLAIM = { id: 'claim-1', claim: 'Fato verificável.', source: 'Fonte oficial', source_url: 'https://example.org/fonte', status: 'approved' };

interface ReviewableProject {
  runtime: Runtime;
  project: Project;
  pages: Record<string, unknown>[];
  projectJsonPath: string;
  claimsPath: string;
}

/** Carrossel com copy, prompts e fontes completos, sem aprovação humana. */
async function withReviewableProject(run: (fixture: ReviewableProject) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'mdc-visual-approval-'));
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/',
    secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    decryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    update: async () => ({ available: false, message: 'indisponível' }),
  }, () => undefined);

  try {
    await runtime.init();
    const workspace = join(root, 'workspace');
    await runtime.invoke('app.settings', { workspace });
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
    const pages = (native.pages as Record<string, unknown>[]).map((page, index) => {
      const headline = `Título da página ${index + 1}`;
      const copy = `Copy editorial da página ${index + 1}.`;
      const visualFunction = `Função visual da página ${index + 1}.`;
      const promptFile = String(page.prompt_file);
      return { ...page, headline, copy, visual_function: visualFunction, depicted_person: 'none', prompt_file: promptFile };
    });
    native.pages = pages;
    native.editorial = { claims_reviewed: false, copy_approved: false };
    await writeFile(projectJsonPath, `${JSON.stringify(native, null, 2)}\n`);
    for (const page of pages) {
      await writeFile(join(project.path, String(page.prompt_file)), `Copy aprovada: ${page.copy}\nFunção visual: ${page.visual_function}\nDireção visual editorial refinada.\n`);
    }
    const claimsPath = join(project.path, 'research', 'claims.json');
    await writeFile(claimsPath, `${JSON.stringify({ reviewed: false, claims: [CLAIM] }, null, 2)}\n`);
    await run({ runtime, project, pages, projectJsonPath, claimsPath });
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
}
test('format adaptation preserves the original snapshot, blocks approval and validates retries in both directions', () => withReviewableProject(async ({ runtime, project, pages, projectJsonPath }) => {
  const workspace = runtime.services.getSettings().workspace;
  const original = await readFile(projectJsonPath, 'utf8');
  let detail = await runtime.invoke('projects.imageFormat', { id: project.id, format: 'post-1x1' }) as ProjectDetail;
  assert.deepEqual(detail.formatAdaptation, { sourceFormat: 'carousel-1x1', targetFormat: 'post-1x1', pageCount: 1 });
  const first = await readFormatAdaptation(workspace, project.id);
  assert.equal((first.snapshot as { files: Record<string, string> }).files['project.json'], original);
  assert.match((first.snapshot as { files: Record<string, string> }).files[String(pages[4]!.prompt_file)]!, /Copy editorial da página 5/);
  await assert.rejects(runtime.invoke('projects.visual.approve', { id: project.id, approved: true, contentHash: detail.visualReview!.contentHash }), /Adapte os textos/);
  await assert.rejects(runtime.invoke('agents.generateImages', { id: project.id, confirm: true, logoPolicy: 'all-pages' }), /Adapte os textos/);
  await assert.rejects(completeFormatAdaptation(workspace, project.id, first.adaptation, new AbortController().signal), /quantidade/);
  assert.deepEqual((await readFormatAdaptation(workspace, project.id)).snapshot, first.snapshot);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(completeFormatAdaptation(workspace, project.id, first.adaptation, aborted.signal));
  const native = JSON.parse(await readFile(projectJsonPath, 'utf8')) as Record<string, unknown>;
  native.page_count = 1;
  native.pages = [pages[0]];
  await writeFile(projectJsonPath, JSON.stringify(native));
  await completeFormatAdaptation(workspace, project.id, first.adaptation, new AbortController().signal);
  detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
  assert.equal(detail.formatAdaptation, undefined);
  assert.equal(detail.visualReview?.approved, false);
  detail = await runtime.invoke('projects.imageFormat', { id: project.id, format: 'carousel-1x1' }) as ProjectDetail;
  assert.equal(detail.formatAdaptation?.pageCount, 5);
  const second = await readFormatAdaptation(workspace, project.id);
  assert.match((second.snapshot as { files: Record<string, string> }).files['project.json']!, /Copy editorial da página 1/);
  native.format = 'carousel-1x1';
  native.type = 'carousel';
  native.page_count = 5;
  native.pages = pages;
  await writeFile(projectJsonPath, JSON.stringify(native));
  await completeFormatAdaptation(workspace, project.id, second.adaptation, new AbortController().signal);
  detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
  assert.equal(detail.formatAdaptation, undefined);
  assert.equal(detail.visualReview?.approved, false);
}));


test('PostNow image generation requires a hash-matching human review of copy, claims, prompts, and brand', () => withReviewableProject(async ({ runtime, project, pages }) => {
  let detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
  assert.equal(detail.visualReview?.ready, true);
  assert.equal(detail.visualReview?.approved, false);
  await assert.rejects(runtime.invoke('agents.generateImages', { id: project.id, confirm: true, logoPolicy: 'all-pages' }), /aprov/i);
  await assert.rejects(runtime.invoke('projects.visual.approve', { id: project.id, approved: true, contentHash: '0'.repeat(64) }), /mudou depois da revisão/i);

  detail = await runtime.invoke('projects.visual.approve', {
    id: project.id, approved: true, contentHash: detail.visualReview!.contentHash,
  }) as ProjectDetail;
  assert.equal(detail.visualReview?.approved, true);

  const promptPath = join(project.path, String(pages[0]!.prompt_file));
  await writeFile(promptPath, `${await readFile(promptPath, 'utf8')}Alteração posterior.\n`);
  detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
  assert.equal(detail.visualReview?.approved, false);
  await assert.rejects(runtime.invoke('agents.generateImages', { id: project.id, confirm: true, logoPolicy: 'all-pages' }), /aprov/i);
}));

test('editorial flags set outside the Studio are cleared unless they match the approved content', () => withReviewableProject(async ({ runtime, project, pages, projectJsonPath, claimsPath }) => {
  const flags = async () => {
    const native = JSON.parse(await readFile(projectJsonPath, 'utf8')) as { editorial: { copy_approved: boolean; claims_reviewed: boolean } };
    const claims = JSON.parse(await readFile(claimsPath, 'utf8')) as { reviewed: boolean };
    return { copy_approved: native.editorial.copy_approved, claims_reviewed: native.editorial.claims_reviewed, reviewed: claims.reviewed };
  };
  const preMark = async () => {
    const native = JSON.parse(await readFile(projectJsonPath, 'utf8')) as { editorial: Record<string, boolean> };
    native.editorial = { copy_approved: true, claims_reviewed: true };
    await writeFile(projectJsonPath, `${JSON.stringify(native, null, 2)}\n`);
    await writeFile(claimsPath, `${JSON.stringify({ reviewed: true, claims: [CLAIM] }, null, 2)}\n`);
  };

  await preMark();
  let detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
  assert.equal(detail.visualReview?.approved, false);
  assert.deepEqual(await flags(), { copy_approved: false, claims_reviewed: false, reviewed: false });

  detail = await runtime.invoke('projects.visual.approve', {
    id: project.id, approved: true, contentHash: detail.visualReview!.contentHash,
  }) as ProjectDetail;
  assert.equal(detail.visualReview?.approved, true);

  const promptPath = join(project.path, String(pages[0]!.prompt_file));
  await writeFile(promptPath, `${await readFile(promptPath, 'utf8')}Alteração fora do Studio.\n`);
  await preMark();
  detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
  assert.equal(detail.visualReview?.approved, false);
  assert.deepEqual(await flags(), { copy_approved: false, claims_reviewed: false, reviewed: false });

  detail = await runtime.invoke('projects.visual.approve', {
    id: project.id, approved: true, contentHash: detail.visualReview!.contentHash,
  }) as ProjectDetail;
  assert.equal(detail.visualReview?.approved, true);
}));

test('a malformed claims.json blocks the visual review and the approval', () => withReviewableProject(async ({ runtime, project, claimsPath }) => {
  await writeFile(claimsPath, `${JSON.stringify({ reviewed: false, claims: 'Fato verificável.' }, null, 2)}\n`);
  let detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
  assert.equal(detail.visualReview?.ready, false);
  assert.equal(detail.visualReview?.approved, false);

  await writeFile(claimsPath, `${JSON.stringify({ reviewed: 'sim', claims: [CLAIM] }, null, 2)}\n`);
  detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
  assert.equal(detail.visualReview?.ready, false);
  await assert.rejects(runtime.invoke('projects.visual.approve', {
    id: project.id, approved: true, contentHash: detail.visualReview!.contentHash,
  }), /Ainda não é seguro aprovar/);
}));
