import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { approvedPortraitAt, clearMirroredPortrait, composeEnginePrompt, engineClientId, postnowHome, preparePostNowGeneration, withMirroredPortrait } from '../src/main/content/postnow.js';
import { Runtime } from '../src/main/runtime.js';
import type { Brand, Project, ProjectDetail } from '../src/shared/contracts.js';
import { brandImageOptOutIssues, portraitDiversityIssues, portraitPlanIssues } from '../src/shared/depicted-person.js';

const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2sAAAAASUVORK5CYII=', 'base64');
const ENGINE_MARKERS = [
  'POSTNOW_COPY_RENDERING=generated_in_image',
  'POSTNOW_EFFECTS_RENDERING=generated_in_image',
  'POSTNOW_LOGO_RENDERING=official_asset_applied_after_generation',
  'POSTNOW_PORTRAIT_POLICY=approved_profile_portrait_when_client_is_depicted',
];
const NONE_INSTRUCTION = 'Não mostre pessoas nem rostos nesta arte.';
const OTHER_PERSON_INSTRUCTION = 'A pessoa retratada é outra pessoa, não o cliente; não use o retrato do cliente para representá-la.';

test('engineClientId normalizes accents like PostNow slugify', () => {
  assert.equal(engineClientId({ id: 'studio-id', name: 'Clínica Horizonte' } as Brand), 'studio-studio-id-clinica-horizonte');
  assert.equal(engineClientId({ id: 'studio-id', name: 'AÇÃO & Saúde' } as Brand), 'studio-studio-id-acao-saude');
});

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

async function carouselWithIdentities(root: string, identity: (index: number) => string | undefined, useBrandImages = true): Promise<{ runtime: Runtime; project: Project }> {
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
    title: 'Carrossel de identidade', kind: 'image', format: 'carousel-1x1', brief: 'Explicar um tema com fontes.', brandId: brand.id, useBrandImages,
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
    body: `Resumo curto da página ${index + 1}.`,
    copy: `Copy editorial da página ${index + 1}.\n\n#tema #assunto #dicas #conteudo #social`,
    visual_function: `Função visual da página ${index + 1}.`,
    depicted_person: identity(index),
  }));
  native.pages = pages;
  await writeFile(projectJsonPath, `${JSON.stringify(native, null, 2)}\n`);
  for (const page of pages) {
    await writeFile(join(project.path, String(page.prompt_file)), `## Texto na arte\nHeadline: ${page.headline}\nBody: ${page.body}\n\n## Composição\n${page.visual_function}\n\n## Copy para publicação/legenda, NÃO imprimir na arte:\n${page.copy}\n`);
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

test('saving the project preference rewrites every prepared page and asks for a new approval', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-depicted-person-'));
  const { runtime, project } = await carouselWithIdentities(root, () => 'none');
  try {
    let detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    detail = await runtime.invoke('projects.visual.approve', { id: project.id, approved: true, contentHash: detail.visualReview!.contentHash }) as ProjectDetail;
    assert.equal(detail.visualReview?.approved, true);
    detail = await runtime.invoke('projects.visualPreferences', { id: project.id, depictedPersonPolicy: 'other_person' }) as ProjectDetail;
    assert.deepEqual(detail.visualReview?.pages.map((page) => page.depictedPerson), Array(5).fill('other_person'));
    assert.equal(detail.visualReview?.approved, false);
    const manual = detail.visualReview!.pages.map((page, index) => ({ page: page.page, headline: page.headline, body: page.body, copy: page.copy, depictedPerson: index === 0 ? 'none' : page.depictedPerson }));
    detail = await runtime.invoke('projects.visual.save', { projectId: project.id, id: project.id, pages: manual }) as ProjectDetail;
    assert.equal(detail.depictedPersonPolicy, 'auto', 'uma escolha página a página que contradiz a preferência a devolve para Automático');
    detail = await runtime.invoke('projects.visualPreferences', { id: project.id, depictedPersonPolicy: 'other_person' }) as ProjectDetail;
    await approveClientPortrait(root, project);
    detail = await runtime.invoke('projects.visualPreferences', { id: project.id, depictedPersonPolicy: 'client_portrait' }) as ProjectDetail;
    assert.deepEqual(detail.visualReview?.pages.map((page) => page.depictedPerson), Array(5).fill('client_portrait'));
    assert.equal(detail.visualReview?.ready, true, detail.visualReview?.blocking.join(' | '));
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('approving the texts copies a claim recorded as "sources" into the "source" key the PostNow engine validates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-depicted-person-'));
  const { runtime, project } = await carouselWithIdentities(root, () => 'none');
  try {
    const claimsFile = join(project.path, 'research', 'claims.json');
    const sources = [{ title: 'Best practices', publisher: 'Anthropic', url: 'https://example.org/bp' }];
    await writeFile(claimsFile, `${JSON.stringify({ reviewed: false, claims: [{ id: 'c1', claim: 'Fato verificável.', status: 'approved', sources }] }, null, 2)}\n`);
    let detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.equal(detail.visualReview?.ready, true, detail.visualReview?.blocking.join(' | '));
    detail = await runtime.invoke('projects.visual.approve', { id: project.id, approved: true, contentHash: detail.visualReview!.contentHash }) as ProjectDetail;
    assert.equal(detail.visualReview?.approved, true);
    const saved = JSON.parse(await readFile(claimsFile, 'utf8')) as { reviewed: boolean; claims: { source?: unknown; sources?: unknown }[] };
    assert.equal(saved.reviewed, true);
    assert.deepEqual(saved.claims[0]?.source, sources);
    assert.deepEqual(saved.claims[0]?.sources, sources);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('a caption that differs from the copy field only by blank lines is aligned instead of blocking; a different caption still blocks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-depicted-person-'));
  const { runtime, project } = await carouselWithIdentities(root, () => 'none');
  try {
    const native = JSON.parse(await readFile(join(project.path, 'project.json'), 'utf8')) as { pages: { prompt_file: string; copy: string }[] };
    const first = native.pages[0]!;
    const second = native.pages[1]!;
    const firstFile = join(project.path, first.prompt_file);
    const original = await readFile(firstFile, 'utf8');
    assert.ok(original.includes(first.copy), 'o arquivo de arte começa com a legenda idêntica ao campo copy');
    await writeFile(firstFile, original.replace(first.copy, first.copy.replace('\n\n#', '\n\n\n#')));
    const secondFile = join(project.path, second.prompt_file);
    await writeFile(secondFile, (await readFile(secondFile, 'utf8')).replace(second.copy, 'Outra legenda, com texto diferente.'));
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    const blocking = detail.visualReview?.blocking ?? [];
    assert.ok(!blocking.some((item) => item.startsWith('Página 1: a legenda não corresponde')), blocking.join(' | '));
    assert.ok(blocking.some((item) => item.startsWith('Página 2: a legenda não corresponde')), blocking.join(' | '));
    assert.ok((await readFile(firstFile, 'utf8')).includes(first.copy), 'a legenda do arquivo de arte voltou a ser idêntica ao campo copy');
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
      runtime.invoke('agents.generateImages', { id: project.id, confirm: true }),
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

test('composeEnginePrompt injects the library visual direction once, before the policy, and replaces or drops it cleanly', () => {
  const editorial = 'Copy: X\nFunção visual: Y\n';
  const dark = { id: 'image-dark-mode-carousel', title: 'Modo Escuro', direction: 'Fundo escuro e acentos luminosos.' };
  const collage = { id: 'collage-carousel', title: 'Colagem', direction: 'Recortes e blocos de cor.' };
  const withDark = composeEnginePrompt(editorial, 'none', undefined, dark);
  const lines = withDark.split('\n');
  const styleLines = lines.filter((line) => line.startsWith('Direção visual da biblioteca ('));
  assert.deepEqual(styleLines, ['Direção visual da biblioteca (Modo Escuro): Fundo escuro e acentos luminosos.']);
  assert.ok(lines.indexOf(styleLines[0]!) < lines.indexOf('## Política de geração PostNow'));
  for (const marker of ENGINE_MARKERS) assert.equal(lines.filter((line) => line === marker).length, 1, marker);
  assert.equal(composeEnginePrompt(withDark, 'none', undefined, dark), withDark);
  assert.equal(composeEnginePrompt(withDark, 'none', undefined, collage), composeEnginePrompt(editorial, 'none', undefined, collage));
  assert.equal(composeEnginePrompt(withDark, 'none'), composeEnginePrompt(editorial, 'none'));
});

test('portraitPlanIssues only blocks client_portrait when the brand has no approved portrait; having one never forces a page', () => {
  const none = ['none', 'none', 'none', 'none', 'none'];
  assert.equal(portraitPlanIssues(['client_portrait', ...none.slice(1)], false).length, 1);
  assert.match(portraitPlanIssues(['client_portrait', ...none.slice(1)], false)[0]!, /^Página 1: /);
  assert.deepEqual(portraitPlanIssues(none, false), []);
  assert.deepEqual(portraitPlanIssues(none, true), []);
  assert.deepEqual(portraitPlanIssues(['client_portrait', 'none', 'client_portrait'], true), []);
  assert.deepEqual(portraitPlanIssues(['other_person'], true), []);
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

test('approvedPortraitAt repairs a legacy portrait profile without dropping its client identity', async () => {
  const home = await mkdtemp(join(tmpdir(), 'mdc-portrait-profile-repair-'));
  const brand = { id: '5e90b759-01c1-41c2-874d-edf468c74020', name: 'Fernando Bolzan', colors: ['#15f919'] } as Brand;
  const profileDir = join(home, 'clients', engineClientId(brand));
  const profilePath = join(profileDir, 'profile.json');
  try {
    await mkdir(profileDir, { recursive: true });
    await writeFile(profilePath, JSON.stringify({
      client_id: engineClientId(brand),
      name: 'Fernando Bolzan',
      preserved_setting: 'keep',
      brand: { owner_portrait: 'references/portrait.png', reference_images: ['references/portrait.png'] },
    }));
    assert.equal(await approvedPortraitAt(home, brand), 'references/portrait.png');
    const repaired = JSON.parse(await readFile(profilePath, 'utf8')) as {
      preserved_setting: string;
      logo: { required: boolean; required_on: string[] };
      formats: { carousel: { page_count: number }; post: { width: number }; story: { height: number } };
      brand: { owner_portrait: string };
    };
    assert.equal(repaired.preserved_setting, 'keep');
    assert.equal(repaired.logo.required, true);
    assert.deepEqual(repaired.logo.required_on, ['cover', 'cta', 'single', 'story']);
    assert.equal(repaired.formats.carousel.page_count, 10);
    assert.equal(repaired.formats.post.width, 1080);
    assert.equal(repaired.formats.story.height, 1920);
    assert.equal(repaired.brand.owner_portrait, 'references/portrait.png');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('approvedPortraitAt never guesses the portrait from a file name; only the brand photo marked as portrait counts', async () => {
  const home = await mkdtemp(join(tmpdir(), 'mdc-portrait-flag-home-'));
  const source = await mkdtemp(join(tmpdir(), 'mdc-portrait-flag-src-'));
  const slide = join(source, '02-ideia-01-whatsapp.png');
  const face = join(source, 'retrato-cliente.png');
  const base = { id: '5e90b759-01c1-41c2-874d-edf468c74020', name: 'Fernando Bolzan', tone: '', colors: [] };
  const photo = (name: string, path: string, portrait = false) => ({ id: name, name, path, kind: 'image' as const, url: '', ...(portrait ? { portrait: true } : {}) });
  try {
    await writeFile(slide, ONE_PIXEL_PNG);
    await writeFile(face, ONE_PIXEL_PNG);
    assert.equal(await approvedPortraitAt(home, { ...base, references: [photo('02-ideia-01-whatsapp.png', slide)] } as Brand), undefined);
    assert.equal(await approvedPortraitAt(home, { ...base, references: [photo('retrato-cliente.png', face)] } as Brand), undefined);
    assert.equal(await approvedPortraitAt(home, { ...base, references: [photo('02-ideia-01-whatsapp.png', slide), photo('retrato-cliente.png', face, true)] } as Brand), 'references/retrato-cliente.png');
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});

test('a portrait copied into the engine profile from a brand photo follows the brand mark: shown, replaced and cleared', async () => {
  const home = await mkdtemp(join(tmpdir(), 'mdc-portrait-mirror-home-'));
  const source = await mkdtemp(join(tmpdir(), 'mdc-portrait-mirror-src-'));
  const slide = join(source, '0430f342-slide.png');
  const face = join(source, 'face.png');
  const base = { id: '5e90b759-01c1-41c2-874d-edf468c74020', name: 'Fernando Bolzan', tone: '', colors: [] };
  const photo = (name: string, path: string, portrait = false) => ({ id: name, name, path, kind: 'image' as const, url: '', ...(portrait ? { portrait: true } : {}) });
  const profileDir = join(home, 'clients', engineClientId(base as Brand));
  const profilePath = join(profileDir, 'profile.json');
  const ownerPortrait = async () => (JSON.parse(await readFile(profilePath, 'utf8')) as { brand: { owner_portrait?: string; reference_images: string[] } }).brand;
  try {
    await mkdir(profileDir, { recursive: true });
    await writeFile(slide, ONE_PIXEL_PNG);
    await writeFile(face, ONE_PIXEL_PNG);
    const stale = { ...base, references: [photo('slide', slide), photo('face', face)] } as Brand;
    await writeFile(profilePath, JSON.stringify({ brand: { owner_portrait: 'references/0430f342-slide.png', reference_images: ['references/0430f342-slide.png'] } }));

    const shown = await withMirroredPortrait(home, stale);
    assert.deepEqual(shown.references.filter(ref => ref.portrait).map(ref => ref.name), ['slide'], 'o retrato antigo do perfil aparece marcado na marca');

    const marked = { ...base, references: [photo('slide', slide), photo('face', face, true)] } as Brand;
    assert.equal(await approvedPortraitAt(home, marked), 'references/face.png', 'a foto marcada vale mais que o perfil antigo');
    const replaced = await ownerPortrait();
    assert.equal(replaced.owner_portrait, 'references/face.png');
    assert.deepEqual(replaced.reference_images, ['references/face.png']);

    await clearMirroredPortrait(home, { ...base, references: [photo('slide', slide)] } as Brand);
    assert.equal((await ownerPortrait()).owner_portrait, 'references/face.png', 'só limpa quando o retrato do perfil é cópia de uma foto da marca');
    await clearMirroredPortrait(home, marked);
    assert.equal((await ownerPortrait()).owner_portrait, undefined);
    assert.equal(await approvedPortraitAt(home, stale), undefined, 'sem marca e sem retrato no perfil, não há retrato');

    await writeFile(profilePath, JSON.stringify({ brand: { owner_portrait: 'references/cadastrado-no-motor.jpg' } }));
    await clearMirroredPortrait(home, marked);
    assert.equal((await ownerPortrait()).owner_portrait, 'references/cadastrado-no-motor.jpg', 'retrato cadastrado fora da marca é preservado');
    assert.equal(await approvedPortraitAt(home, stale), 'references/cadastrado-no-motor.jpg');
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});

async function approveClientPortrait(root: string, project: Project): Promise<void> {
  const brand = { id: project.brandId, name: 'Marca de teste' } as Brand;
  const profileDir = join(root, 'data', 'engine-data', 'postnow', 'clients', engineClientId(brand));
  await mkdir(profileDir, { recursive: true });
  await writeFile(join(profileDir, 'profile.json'), JSON.stringify({ brand: { owner_portrait: 'references/54f0e063-6ff3-494d-898e-7f125c3cd03c.jpeg' } }));
}

test('photo opt-out blocks client portraits before PostNow profile lookup or engine execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-photo-opt-out-'));
  const identities = ['client_portrait', 'none', 'none', 'none', 'none'];
  const { runtime, project } = await carouselWithIdentities(root, index => identities[index], false);
  let engineCalls = 0;
  runtime.services.run = async () => { engineCalls += 1; throw new Error('Engine must not run.'); };
  try {
    assert.deepEqual(brandImageOptOutIssues(['none', 'other_person']), []);
    assert.match(brandImageOptOutIssues(['client_portrait'])[0]!, /foto\/retrato da marca foi desativado/);
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.equal(detail.visualReview?.ready, false);
    assert.ok(detail.visualReview?.blocking.some(message => /foto\/retrato da marca foi desativado/.test(message)));
    await assert.rejects(runtime.invoke('agents.generateImages', { id: project.id, confirm: true }), /foto\/retrato da marca foi desativado/);
    assert.equal(engineCalls, 0);
    assert.deepEqual(await readdir(join(project.path, 'generated', 'runs')).catch(() => []), []);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
test('PostNow mirror keeps the visual subtitle local and strips it from the engine schema', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-postnow-body-schema-'));
  const { runtime, project } = await carouselWithIdentities(root, () => 'none', false);
  const batchId = '1794112691702-c6c3b30e';
  try {
    const engine = join(root, 'PostNow');
    const python = join(engine, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    await mkdir(join(engine, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin'), { recursive: true });
    await writeFile(python, '');
    await runtime.services.saveSettings({ enginePaths: { postnow: engine } });
    runtime.services.capture = async () => ({ code: 0, stdout: '', stderr: '' });
    const brand = (await runtime.invoke('brands.list', {} ) as Brand[]).find(item => item.id === project.brandId)!;
    await preparePostNowGeneration(project, brand, batchId, runtime.services);
    const home = await postnowHome(runtime.services);
    const projects = await readdir(join(home, 'clients', engineClientId(brand), 'projects'));
    const external = JSON.parse(await readFile(join(home, 'clients', engineClientId(brand), 'projects', projects[0]!, 'project.json'), 'utf8')) as { pages: Record<string, unknown>[] };
    const local = JSON.parse(await readFile(join(project.path, 'project.json'), 'utf8')) as { pages: Record<string, unknown>[] };
    assert.equal(local.pages[0]!.body, 'Resumo curto da página 1.');
    assert.equal(external.pages[0]!.body, undefined);
    assert.equal(external.pages[0]!.headline, local.pages[0]!.headline);
    assert.equal(external.pages[0]!.copy, local.pages[0]!.copy);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});


test('client_portrait without an approved portrait in the engine profile blocks the visual review', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-depicted-person-'));
  const identities = ['client_portrait', 'none', 'none', 'none', 'none'];
  const { runtime, project } = await carouselWithIdentities(root, (index) => identities[index]);
  try {
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    const blocking = detail.visualReview?.blocking ?? [];
    assert.equal(detail.visualReview?.ready, false);
    assert.ok(blocking.some((item) => item.startsWith('Página 1: ')), blocking.join(' | '));
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('with an approved portrait, choosing nobody on every page is accepted and kept as chosen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-depicted-person-'));
  const identities = ['none', 'none', 'none', 'none', 'none'];
  const { runtime, project } = await carouselWithIdentities(root, (index) => identities[index]);
  try {
    await approveClientPortrait(root, project);
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.equal(detail.visualReview?.ready, true, detail.visualReview?.blocking.join(' | '));
    assert.deepEqual(detail.visualReview?.pages.map((page) => page.depictedPerson), identities);
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
