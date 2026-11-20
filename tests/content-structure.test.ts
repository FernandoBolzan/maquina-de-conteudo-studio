import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Runtime } from '../src/main/runtime.js';
import { carouselCoverIssue, singleImageCtaIssue, structureHint } from '../src/shared/content-structure.js';
import type { Brand, Project, ProjectDetail } from '../src/shared/contracts.js';

const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2sAAAAASUVORK5CYII=', 'base64');

test('a carousel cover with a list, numbered steps or bullets is refused; a plain hook is accepted', () => {
  assert.ok(carouselCoverIssue('Defina: 1) objetivo, 2) contexto, 3) como conferir o resultado.'));
  assert.ok(carouselCoverIssue('1. Objetivo claro\n2. Contexto'));
  assert.ok(carouselCoverIssue('• objetivo • contexto'));
  assert.ok(carouselCoverIssue('objetivo; contexto; conferência'));
  assert.equal(carouselCoverIssue('Três hábitos simples mudam a resposta da IA.'), undefined);
  assert.equal(carouselCoverIssue('Desde 2026. Deslize para ver.'), undefined);
  assert.equal(carouselCoverIssue(''), undefined);
});

test('a single image must point to the description', () => {
  assert.ok(singleImageCtaIssue('Resumo genérico?', 'Diga o foco e o tamanho desejado.'));
  assert.equal(singleImageCtaIssue('Resumo genérico?', 'Diga o foco. Leia a descrição.'), undefined);
  assert.equal(singleImageCtaIssue('Leia a descrição', 'Diga o foco.'), undefined);
  assert.equal(singleImageCtaIssue('Resumo?', 'Veja a DESCRIÇÃO.'), undefined);
});

test('the editor hint only appears for a carousel cover or a single post', () => {
  assert.match(structureHint('carousel', 3) ?? '', /só o gancho/);
  assert.match(structureHint('post', 1) ?? '', /Leia a descrição/);
  assert.equal(structureHint('story', 1), undefined);
  assert.equal(structureHint('carousel', 1), undefined);
});

async function withProject(format: 'post-4x5' | 'carousel-4x5', bodies: string[], run: (runtime: Runtime, project: Project) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'mdc-structure-'));
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
    await runtime.invoke('app.settings', { workspace: join(root, 'workspace') });
    const logo = join(root, 'logo.png');
    await writeFile(logo, ONE_PIXEL_PNG);
    const brand = await runtime.invoke('brands.save', { name: 'Marca', tone: 'Claro.', colors: ['#123456'], logo }) as Brand;
    const project = await runtime.invoke('projects.create', { title: 'Estrutura', kind: 'image', format, ...(format.startsWith('carousel') ? { pageCount: bodies.length } : {}), brief: 'Tema.', brandId: brand.id }) as Project;
    const file = join(project.path, 'project.json');
    const native = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    native.audience = 'Pessoas leigas.'; native.objective = 'Explicar.'; native.promise = 'Aprender.'; native.cta = 'Salve.';
    const pages = (native.pages as Record<string, unknown>[]).map((page, index) => ({
      ...page, headline: `Título ${index + 1}`, body: bodies[index]!, copy: `Legenda ${index + 1}.\n\n#tema #assunto #dicas #conteudo #social`,
      visual_function: `Composição ${index + 1}.`, depicted_person: 'none',
    }));
    native.pages = pages;
    await writeFile(file, `${JSON.stringify(native, null, 2)}\n`);
    for (const page of pages) {
      await writeFile(join(project.path, String(page.prompt_file)), `## Texto na arte\nHeadline: ${page.headline}\nBody: ${page.body}\n\n## Composição\n${page.visual_function}\n\n## Copy para publicação/legenda, NÃO imprimir na arte:\n${page.copy}\n`);
    }
    await writeFile(join(project.path, 'storyboard.md'), '# Estrutura\n');
    await writeFile(join(project.path, 'research', 'claims.json'), JSON.stringify({ reviewed: false, claims: [{ id: 'c1', claim: 'Fato.', status: 'approved', source: 'Fonte' }] }));
    await run(runtime, project);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
}

test('a carousel whose cover carries the content blocks approval; moving the content out of the cover releases it', () => withProject('carousel-4x5', [
  'Defina: 1) objetivo, 2) contexto, 3) como conferir.', 'Explique o objetivo e o contexto.', 'Revise o resultado e salve.',
], async (runtime, project) => {
  const blocked = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
  assert.equal(blocked.visualReview?.ready, false);
  assert.ok(blocked.visualReview?.blocking.some(item => item.startsWith('Página 1: a capa do carrossel não pode trazer o conteúdo')), blocked.visualReview?.blocking.join(' | '));
  assert.ok(!blocked.visualReview?.blocking.some(item => item.startsWith('Página 2:') || item.startsWith('Página 3:')), 'só a capa é limitada');
  const pages = blocked.visualReview!.pages.map(page => ({ page: page.page, headline: page.headline, body: page.page === 1 ? 'Deslize e veja como pedir melhor.' : page.body, copy: page.copy, depictedPerson: page.depictedPerson }));
  const fixed = await runtime.invoke('projects.visual.save', { projectId: project.id, id: project.id, pages }) as ProjectDetail;
  assert.equal(fixed.visualReview?.ready, true, fixed.visualReview?.blocking.join(' | '));
}));

test('a post without the description call blocks approval; ending the body with it releases it', () => withProject('post-4x5', ['Diga o foco e o tamanho desejado.'], async (runtime, project) => {
  const blocked = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
  assert.equal(blocked.visualReview?.ready, false);
  assert.ok(blocked.visualReview?.blocking.some(item => item.startsWith('Página 1: na imagem única a arte precisa chamar para ler a descrição')), blocked.visualReview?.blocking.join(' | '));
  const page = blocked.visualReview!.pages[0]!;
  const fixed = await runtime.invoke('projects.visual.save', { projectId: project.id, id: project.id, pages: [{ page: 1, headline: page.headline, body: 'Diga o foco e o tamanho desejado. Leia a descrição.', copy: page.copy, depictedPerson: page.depictedPerson }] }) as ProjectDetail;
  assert.equal(fixed.visualReview?.ready, true, fixed.visualReview?.blocking.join(' | '));
}));
