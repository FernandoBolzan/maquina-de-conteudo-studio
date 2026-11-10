import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { approvedPortraitAt, composeEnginePrompt, engineClientId } from '../src/main/content/postnow.js';
import { Runtime } from '../src/main/runtime.js';
import type { Brand, Project, ProjectDetail } from '../src/shared/contracts.js';
import { portraitDiversityIssues, portraitPlanIssues, portraitRequiredPages } from '../src/shared/depicted-person.js';

const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2sAAAAASUVORK5CYII=', 'base64');
const ENGINE_MARKERS = [
  'POSTNOW_COPY_RENDERING=generated_in_image',
  'POSTNOW_EFFECTS_RENDERING=generated_in_image',
  'POSTNOW_LOGO_RENDERING=official_asset_applied_after_generation',
  'POSTNOW_PORTRAIT_POLICY=approved_profile_portrait_when_client_is_depicted',
];
const NONE_INSTRUCTION = 'Não mostre pessoas nem rostos nesta arte.';
const OTHER_PERSON_INSTRUCTION = 'A pessoa retratada é outra pessoa, não o cliente; não use o retrato do cliente para representá-la.';

test('composeEnginePrompt writes each engine policy marker once and a single identity line', () => {
  const studioPrompt = [
    'Copy: Acorda com dor?',
    'Função visual: Mostrar a mandíbula.',
    'POSTNOW_DEPICTED_PERSON=client_portrait',
    NONE_INSTRUCTION,
    '',
    '## Política de geração PostNow',
    'POSTNOW_COPY_RENDERING=generated_in_image',
    '',
  ].join('\n');
  const lines = composeEnginePrompt(studioPrompt, 'other_person').split('\n');
  for (const marker of ENGINE_MARKERS) {
    assert.equal(lines.filter((line) => line === marker).length, 1, marker);
  }
  assert.deepEqual(lines.filter((line) => line.startsWith('POSTNOW_DEPICTED_PERSON=')), ['POSTNOW_DEPICTED_PERSON=other_person']);
  assert.ok(lines.includes(OTHER_PERSON_INSTRUCTION));
  assert.ok(!lines.includes(NONE_INSTRUCTION), 'a instrução de identidade anterior precisa sair');
  assert.ok(lines.includes('Copy: Acorda com dor?'));
  assert.ok(lines.includes('Função visual: Mostrar a mandíbula.'));
});

test('composeEnginePrompt is idempotent and switching identity equals composing from the editorial text', () => {
  const editorial = 'Copy: X\nFunção visual: Y\n';
  const once = composeEnginePrompt(editorial, 'none');
  assert.equal(composeEnginePrompt(once, 'none'), once);
  assert.equal(composeEnginePrompt(once, 'other_person'), composeEnginePrompt(editorial, 'other_person'));
});

async function carouselWithIdentities(root: string, identity: (index: number) => string | undefined): Promise<{ runtime: Runtime; project: Project }> {
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
  await runtime.init();
  await runtime.invoke('app.settings', { workspace: join(root, 'workspace') });
  const logo = join(root, 'logo.png');
  await writeFile(logo, ONE_PIXEL_PNG);
  const brand = await runtime.invoke('brands.save', { name: 'Marca de teste', tone: 'Claro e direto.', colors: ['#123456'], logo }) as Brand;
  const project = await runtime.invoke('projects.create', {
    title: 'Carrossel de identidade', kind: 'image', format: 'carousel-1x1', brief: 'Explicar um tema com fontes.', brandId: brand.id,
  }) as Project;
  const projectJsonPath = join(project.path, 'project.json');
  const native = JSON.parse(await readFile(projectJsonPath, 'utf8')) as Record<string, unknown>;
  native.title = project.title;
  native.audience = 'Pessoas que estão começando no tema.';
  native.objective = 'Explicar o assunto com fontes verificáveis.';
  native.promise = 'Uma explicação clara em cinco páginas.';
  native.cta = 'Salve para consultar depois.';
  native.editorial = { claims_reviewed: false, copy_approved: false };
  const pages = (native.pages as Record<string, unknown>[]).map((page, index) => ({
    ...page,
    headline: `Título da página ${index + 1}`,
    copy: `Copy editorial da página ${index + 1}.`,
    visual_function: `Função visual da página ${index + 1}.`,
    depicted_person: identity(index),
  }));
  native.pages = pages;
  await writeFile(projectJsonPath, `${JSON.stringify(native, null, 2)}\n`);
  for (const page of pages) {
    await writeFile(join(project.path, String(page.prompt_file)), `Copy editorial: ${page.copy}\nFunção visual: ${page.visual_function}\nDireção visual editorial refinada.\n`);
  }
  await writeFile(join(project.path, 'research', 'claims.json'), `${JSON.stringify({ reviewed: false, claims: [{ id: 'claim-1', claim: 'Fato verificável.', source: 'Fonte oficial', source_url: 'https://example.org/fonte', status: 'approved' }] }, null, 2)}\n`);
  return { runtime, project };
}

test('carousel pages without a valid depicted_person block the visual review', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-depicted-person-'));
  const identities: (string | undefined)[] = [undefined, 'desconhecido', 'none', 'none', 'none'];
  const { runtime, project } = await carouselWithIdentities(root, (index) => identities[index]);
  try {
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    const blocking = detail.visualReview?.blocking ?? [];
    assert.equal(detail.visualReview?.ready, false);
    assert.ok(blocking.some((item) => item.startsWith('Página 1: defina quem aparece na arte')), blocking.join(' | '));
    assert.ok(blocking.some((item) => item.startsWith('Página 2: defina quem aparece na arte')), blocking.join(' | '));
    assert.ok(!blocking.some((item) => item.startsWith('Página 3:')), blocking.join(' | '));
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('a carousel with a valid depicted_person on every page is ready and exposes each choice', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-depicted-person-'));
  const values = ['none', 'other_person', 'none', 'none', 'none'];
  const { runtime, project } = await carouselWithIdentities(root, (index) => values[index]);
  try {
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.equal(detail.visualReview?.ready, true, detail.visualReview?.blocking.join(' | '));
    assert.deepEqual(detail.visualReview?.pages.map((page) => page.depictedPerson), values);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('agents.generateImages stops before any PostNow round when a page has no depicted_person', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-depicted-person-'));
  const { runtime, project } = await carouselWithIdentities(root, (index) => (index === 0 ? undefined : 'none'));
  try {
    await assert.rejects(
      runtime.invoke('agents.generateImages', { id: project.id, confirm: true, logoPolicy: 'cover-closing' }),
      /Página 1: defina quem aparece na arte/,
    );
    assert.deepEqual(await readdir(join(project.path, 'generated', 'runs')).catch(() => []), []);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('composeEnginePrompt puts the approved portrait instruction on the page and removes it when the identity changes', () => {
  const portrait = 'references/54f0e063-6ff3-494d-898e-7f125c3cd03c.jpeg';
  const portraitInstruction = `Use somente o retrato aprovado do cliente em \`${portrait}\` como referência de identidade; preserve seu rosto reconhecível e não o substitua por uma pessoa genérica.`;
  const editorial = 'Copy: X\nFunção visual: Y\n';
  const cover = composeEnginePrompt(editorial, 'client_portrait', portrait);
  const lines = cover.split('\n');
  assert.ok(lines.includes(portraitInstruction));
  assert.deepEqual(lines.filter((line) => line.startsWith('POSTNOW_DEPICTED_PERSON=')), ['POSTNOW_DEPICTED_PERSON=client_portrait']);
  assert.equal(composeEnginePrompt(cover, 'none'), composeEnginePrompt(editorial, 'none'));
  assert.throws(() => composeEnginePrompt(editorial, 'client_portrait'), /retrato aprovado/);
});

test('portraitRequiredPages covers the carousel cover and closing page, or the single page of a post or story', () => {
  assert.deepEqual(portraitRequiredPages('carousel', 6), [1, 6]);
  assert.deepEqual(portraitRequiredPages('post', 1), [1]);
  assert.deepEqual(portraitRequiredPages('story', 1), [1]);
});

test('portraitPlanIssues blocks client_portrait without an approved portrait and missing client pages when there is one', () => {
  const none = ['none', 'none', 'none', 'none', 'none'];
  assert.deepEqual(portraitPlanIssues('carousel', ['client_portrait', ...none.slice(1)], false), ['Página 1: Cliente (retrato aprovado) exige um retrato aprovado no perfil PostNow da marca. Cadastre-o com `postnow client set-portrait`.']);
  assert.deepEqual(portraitPlanIssues('carousel', none, false), []);
  assert.equal(portraitPlanIssues('carousel', none, true).length, 2);
  assert.match(portraitPlanIssues('carousel', none, true)[0]!, /^Página 1: com retrato aprovado/);
  assert.deepEqual(portraitPlanIssues('carousel', ['client_portrait', 'other_person', 'none', 'none', 'client_portrait'], true), []);
  assert.deepEqual(portraitPlanIssues('post', ['client_portrait'], true), []);
});

test('approvedPortraitAt reads brand.owner_portrait from the engine profile and reports none when the profile has no portrait', async () => {
  const home = await mkdtemp(join(tmpdir(), 'mdc-portrait-home-'));
  const brand = { id: '472fe881-1dc2-41e0-a83d-8469cc34ca40', name: 'Patricia Ramos' } as Brand;
  const profileDir = join(home, 'clients', engineClientId(brand));
  try {
    assert.equal(await approvedPortraitAt(home, brand), undefined);
    await mkdir(profileDir, { recursive: true });
    await writeFile(join(profileDir, 'profile.json'), JSON.stringify({ brand: { reference_images: [] } }));
    assert.equal(await approvedPortraitAt(home, brand), undefined);
    await writeFile(join(profileDir, 'profile.json'), JSON.stringify({ brand: { owner_portrait: 'references/a.jpeg' } }));
    assert.equal(await approvedPortraitAt(home, brand), 'references/a.jpeg');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

async function approveClientPortrait(root: string, project: Project): Promise<void> {
  const brand = { id: project.brandId, name: 'Marca de teste' } as Brand;
  const profileDir = join(root, 'data', 'engine-data', 'postnow', 'clients', engineClientId(brand));
  await mkdir(profileDir, { recursive: true });
  await writeFile(join(profileDir, 'profile.json'), JSON.stringify({ brand: { owner_portrait: 'references/54f0e063-6ff3-494d-898e-7f125c3cd03c.jpeg' } }));
}

test('client_portrait without an approved portrait in the engine profile blocks the visual review', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-depicted-person-'));
  const identities = ['client_portrait', 'none', 'none', 'none', 'none'];
  const { runtime, project } = await carouselWithIdentities(root, (index) => identities[index]);
  try {
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    const blocking = detail.visualReview?.blocking ?? [];
    assert.equal(detail.visualReview?.ready, false);
    assert.ok(blocking.some((item) => item.startsWith('Página 1: Cliente (retrato aprovado) exige um retrato aprovado')), blocking.join(' | '));
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('with an approved portrait, the carousel cover and closing page must show the client', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-depicted-person-'));
  const identities = ['none', 'none', 'none', 'none', 'none'];
  const { runtime, project } = await carouselWithIdentities(root, (index) => identities[index]);
  try {
    await approveClientPortrait(root, project);
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    const blocking = detail.visualReview?.blocking ?? [];
    assert.equal(detail.visualReview?.ready, false);
    assert.ok(blocking.some((item) => item.startsWith('Página 1: com retrato aprovado')), blocking.join(' | '));
    assert.ok(blocking.some((item) => item.startsWith('Página 5: com retrato aprovado')), blocking.join(' | '));
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('with an approved portrait, a carousel with the client on the cover and closing page is ready', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-depicted-person-'));
  const values = ['client_portrait', 'other_person', 'none', 'none', 'client_portrait'];
  const { runtime, project } = await carouselWithIdentities(root, (index) => values[index]);
  try {
    await approveClientPortrait(root, project);
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.equal(detail.visualReview?.ready, true, detail.visualReview?.blocking.join(' | '));
    assert.deepEqual(detail.visualReview?.pages.map((page) => page.depictedPerson), values);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('portraitDiversityIssues blocks identical visual descriptions on cover and closing', () => {
  const identical = [
    { visualFunction: 'Mulher profissional no escritório à mesa.' },
    { visualFunction: 'Diagrama' },
    { visualFunction: 'Diagrama 2' },
    { visualFunction: 'Diagrama 3' },
    { visualFunction: 'Mulher profissional no escritório à mesa.' },
  ];
  assert.equal(portraitDiversityIssues('carousel', identical).length, 1);
  const different = [
    { visualFunction: 'Mulher profissional no escritório à mesa olhando documento.' },
    { visualFunction: 'Diagrama' },
    { visualFunction: 'Diagrama 2' },
    { visualFunction: 'Diagrama 3' },
    { visualFunction: 'Mulher profissional em pé com postura aberta acolhedora.' },
  ];
  assert.equal(portraitDiversityIssues('carousel', different).length, 0);
  assert.equal(portraitDiversityIssues('post', identical).length, 0);
});
