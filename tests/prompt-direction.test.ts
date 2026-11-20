import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { Runtime } from '../src/main/runtime.js';
import type { RunSpec } from '../src/main/context.js';
import { depictedPersonLine, usageLimitNotice } from '../src/main/agents.js';
import { approvedPortraitAt, postnowHome } from '../src/main/content/postnow.js';
import type { Brand, Job, Project, ProjectDetail } from '../src/shared/contracts.js';
import { ELEMENT_ATTACH_LIMIT, IMAGEGEN_REFERENCE_LIMIT, PORTRAIT_ATTACH_LIMIT, imageGenerationReferences } from '../src/shared/brand-references.js';

const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2sAAAAASUVORK5CYII=', 'base64');

async function withRuntime(run: (runtime: Runtime, root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'mdc-prompt-direction-'));
  const dataDir = join(root, 'data');
  const codex = join(dataDir, 'runtime', 'tools', 'codex', 'node_modules', '.bin', 'codex');
  const runtime = new Runtime(dataDir, {
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
    await mkdir(dirname(codex), { recursive: true });
    await writeFile(codex, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    await chmod(codex, 0o700);
    await runtime.init();
    await runtime.invoke('app.settings', { workspace: join(root, 'workspace') });
    const engine = join(root, 'PostNow');
    await mkdir(join(engine, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin'), { recursive: true });
    await writeFile(join(engine, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'), '');
    await runtime.services.saveSettings({ enginePaths: { postnow: engine } });
    await run(runtime, root);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
}

test('generation keeps what the person asked for: the typed request and project instructions reach the agent, third-party logos are allowed, and every attached image is named by role', () => withRuntime(async (runtime, root) => {
  const specs: RunSpec[] = [];
  const fakeJob: Job = { id: 'fake-codex-job', title: 'Codex em teste', status: 'running', createdAt: new Date().toISOString(), log: '', interactive: false };
  runtime.services.run = async spec => { specs.push(spec); return { ...fakeJob, title: spec.title }; };
  runtime.services.waitJob = async id => ({ ...fakeJob, id, status: 'failed' });
  runtime.services.capture = async () => ({ code: 0, stdout: '{}', stderr: '' });

  const logo = join(root, 'logo.png');
  await writeFile(logo, ONE_PIXEL_PNG);
  const sources = ['arte-a.png', 'arte-b.png', 'rosto.png', 'rosto-2.png', 'logo-terceiro.png'].map(name => join(root, name));
  for (const source of sources) await writeFile(source, ONE_PIXEL_PNG);
  const brand = await runtime.invoke('brands.save', {
    name: 'Marca X', tone: 'Claro.', colors: ['#123456'], logo,
    references: [
      { path: sources[0], name: 'arte-a.png' },
      { path: sources[1], name: 'arte-b.png' },
      { path: sources[2], name: 'rosto.png', portrait: true },
      { path: sources[3], name: 'rosto-2.png', portrait: true },
      { path: sources[4], name: 'logo-terceiro.png', element: true },
    ],
  }) as Brand;
  const project = await runtime.invoke('projects.create', { title: 'Post sobre outra marca', kind: 'image', format: 'post-1x1', brief: 'Tema: outra marca', brandId: brand.id, useBrandImages: true }) as Project;

  await runtime.invoke('agents.start', { id: project.id, provider: 'codex', prompt: 'Prepare os textos.', directive: 'Fazer a logo da outra marca em 3D', confirm: true });
  await runtime.invoke('projects.notes', { id: project.id, notes: 'Mostrar a logo grande, em fundo escuro.', brief: 'Tema: outra marca' });
  await runtime.invoke('agents.start', { id: project.id, provider: 'codex', prompt: 'Ajuste de novo.', directive: '   ', confirm: true });

  const nativePath = join(project.path, 'project.json');
  const native = JSON.parse(await readFile(nativePath, 'utf8')) as { pages: Record<string, unknown>[]; [key: string]: unknown };
  Object.assign(native, { audience: 'Pessoas leigas.', objective: 'Explicar.', editorial: { claims_reviewed: false, copy_approved: false } });
  for (const page of native.pages) {
    Object.assign(page, { headline: 'Título curto', body: 'Resumo curto.', copy: 'Legenda.\n\n#tema #assunto #dicas #conteudo #social', visual_function: 'Logo da outra marca em 3D, grande.', depicted_person: 'client_portrait' });
    await writeFile(join(project.path, String(page.prompt_file)), `## Texto na arte\nHeadline: Título curto\nBody: Resumo curto.\n\n## Composição\nLogo da outra marca em 3D, grande.\n\n## Copy para publicação/legenda, NÃO imprimir na arte:\nLegenda.\n\n#tema #assunto #dicas #conteudo #social\n`);
  }
  await writeFile(nativePath, `${JSON.stringify(native, null, 2)}\n`);
  await writeFile(join(project.path, 'research', 'claims.json'), JSON.stringify({ reviewed: false, claims: [{ id: 'c1', claim: 'Fato.', source: 'Fonte', source_url: 'https://example.org', status: 'approved' }] }));
  const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
  assert.equal(detail.visualReview?.ready, true, detail.visualReview?.blocking.join(' | '));
  await runtime.invoke('projects.visual.approve', { id: project.id, approved: true, contentHash: detail.visualReview!.contentHash });

  specs.length = 0;
  const contextDir = join(project.path, '.studio-context');
  const before = new Set(await readdir(contextDir));
  await runtime.invoke('agents.generateImages', { id: project.id, confirm: true });
  assert.equal(specs.length, 1);
  const [contextFile] = (await readdir(contextDir)).filter(name => name.endsWith('.txt') && !before.has(name));
  const context = await readFile(join(contextDir, contextFile!), 'utf8');

  assert.ok(context.includes('Fazer a logo da outra marca em 3D'), 'o pedido digitado ao preparar os textos continua valendo na geração');
  assert.ok(context.includes('Mostrar a logo grande, em fundo escuro.'), 'as instruções do projeto chegam ao gerador');
  assert.ok(context.includes('PRIORIDADE DO PEDIDO DA PESSOA'));
  assert.ok(context.includes('logos, produtos e marcas de terceiros'), 'o veto vale só para a logo da marca vinculada');
  assert.ok(!context.includes('Nunca desenhe nem invente logos na arte'));

  const manifest = context.slice(context.indexOf('## Imagens anexadas a este pedido'));
  const attached = specs[0]!.args.flatMap((arg, index) => arg === '--image' ? [specs[0]!.args[index + 1]!] : []);
  assert.equal(attached.length, 5);
  const roles = [/rosto\.png.*FOTO DA PESSOA/, /rosto-2\.png.*FOTO DA PESSOA/, /logo-terceiro\.png.*ELEMENTO PARA USAR NA ARTE/, /arte-a\.png.*ARTE DE REFERÊNCIA DA MARCA/, /arte-b\.png.*ARTE DE REFERÊNCIA DA MARCA/];
  attached.forEach((path, index) => {
    const line = manifest.split('\n').find(item => item.startsWith(`${index + 1}. `));
    assert.ok(line, `linha ${index + 1} do manifesto`);
    assert.ok(line.includes(basename(path)), `o número ${index + 1} do manifesto aponta para o mesmo arquivo do --image`);
    assert.match(line, roles[index]!);
  });
  assert.ok(context.includes('Quem aparece: Marca X. Mostre esta pessoa na arte, com o rosto fiel às imagens anexas 1, 2 (FOTO DA PESSOA)'), 'a página 1 diz quem aparece e quais anexos são a foto da pessoa');
  assert.ok(context.includes('NÃO use o rosto, o corpo nem a roupa de pessoas que apareçam nela'), 'as artes de referência não emprestam rosto');
  assert.ok(context.includes('Pessoas que aparecem nas artes de referência NÃO são a pessoa da marca'));
}));

test('brand image roles: portrait and element exclude each other, only images have a role, and the roles survive reloading', () => withRuntime(async (runtime, root) => {
  const logo = join(root, 'logo.png');
  const image = join(root, 'foto.png');
  const pdf = join(root, 'manual.pdf');
  await writeFile(logo, ONE_PIXEL_PNG);
  await writeFile(image, ONE_PIXEL_PNG);
  await writeFile(pdf, '%PDF-1.4 teste');
  const base = { name: 'Marca Y', tone: '', colors: ['#123456'], logo };
  await assert.rejects(runtime.invoke('brands.save', { ...base, references: [{ path: image, name: 'foto.png', portrait: true, element: true }] }), /retrato da cliente e elemento da arte/);

  const saved = await runtime.invoke('brands.save', { ...base, references: [{ path: image, name: 'foto.png', element: true }, { path: pdf, name: 'manual.pdf', element: true }] }) as Brand;
  assert.deepEqual(saved.references.map(ref => ref.element === true), [true, false], 'PDF não vira elemento');
  const reloaded = (await runtime.invoke('brands.list', {}) as Brand[]).find(item => item.id === saved.id)!;
  assert.deepEqual(reloaded.references.map(ref => ref.element === true), [true, false]);

  const cleared = await runtime.invoke('brands.save', { ...base, id: saved.id, references: reloaded.references.map(ref => ({ id: ref.id, name: ref.name, path: ref.path })) }) as Brand;
  assert.ok(cleared.references.every(ref => ref.element !== true), 'salvar sem marcação volta a imagem a arte de referência');
}));

test('ImageGen attachments put portrait and elements first, then reference arts in brand order, inside the limit', () => {
  const art = (index: number) => ({ id: `a${index}`, name: `arte-${index}`, path: `/brand/arte-${index}.png`, kind: 'image' as const, url: '' });
  const refs = [
    ...Array.from({ length: IMAGEGEN_REFERENCE_LIMIT }, (_, index) => art(index + 1)),
    { ...art(99), name: 'rosto', portrait: true },
    { ...art(98), name: 'logo-terceiro', element: true },
  ];
  const { attached, skipped } = imageGenerationReferences(refs);
  assert.equal(attached.length, IMAGEGEN_REFERENCE_LIMIT);
  assert.deepEqual(attached.slice(0, 3).map(ref => ref.name), ['rosto', 'logo-terceiro', 'arte-1']);
  assert.deepEqual(skipped.map(ref => ref.name), ['arte-9', 'arte-10'], 'o que não cabe no limite são as últimas artes, nunca o retrato ou o elemento');
});

test('imageGenerationReferences caps person photos and elements so reference arts always fit', () => {
  const image = (name: string, extra: object = {}) => ({ id: name, name, path: `/brand/${name}.png`, kind: 'image' as const, url: '', ...extra });
  const refs = [
    ...Array.from({ length: PORTRAIT_ATTACH_LIMIT + 3 }, (_, index) => image(`pessoa-${index + 1}`, { portrait: true })),
    ...Array.from({ length: ELEMENT_ATTACH_LIMIT + 2 }, (_, index) => image(`elemento-${index + 1}`, { element: true })),
    ...Array.from({ length: 12 }, (_, index) => image(`arte-${index + 1}`)),
  ];
  const { attached, skipped } = imageGenerationReferences(refs);
  assert.equal(attached.length, IMAGEGEN_REFERENCE_LIMIT);
  assert.equal(attached.filter(ref => ref.portrait).length, PORTRAIT_ATTACH_LIMIT);
  assert.equal(attached.filter(ref => ref.element).length, ELEMENT_ATTACH_LIMIT);
  const arts = attached.filter(ref => !ref.portrait && !ref.element);
  assert.deepEqual(arts.map(ref => ref.name), Array.from({ length: IMAGEGEN_REFERENCE_LIMIT - PORTRAIT_ATTACH_LIMIT - ELEMENT_ATTACH_LIMIT }, (_, index) => `arte-${index + 1}`), 'as artes de referência que sobram vêm na ordem da lista');
  assert.deepEqual(attached.slice(0, PORTRAIT_ATTACH_LIMIT).map(ref => ref.name), ['pessoa-1', 'pessoa-2', 'pessoa-3', 'pessoa-4'], 'a primeira foto da pessoa vem primeiro');
  assert.ok(skipped.some(ref => ref.name === 'pessoa-5') && skipped.some(ref => ref.name === 'elemento-4'));
});

test('each page tells the generator who appears: the client with the person photos, someone else, or nobody', () => {
  const who = { brandName: 'Marca X', portraitSlots: [1, 3] };
  assert.match(depictedPersonLine('client_portrait', who), /Quem aparece: Marca X\. Mostre esta pessoa na arte, com o rosto fiel às imagens anexas 1, 3 \(FOTO DA PESSOA\)/);
  assert.match(depictedPersonLine('client_portrait', { brandName: 'Marca X', portraitSlots: [] }), /nenhuma foto da pessoa foi anexada.*Não invente o rosto/);
  assert.match(depictedPersonLine('other_person', who), /outra pessoa, que NÃO é Marca X\. Não use o rosto das fotos da pessoa da marca/);
  assert.match(depictedPersonLine('none', who), /ninguém\. Sem pessoas nem rostos/);
});

test('a brand can keep several photos of the person and the first one is the official portrait for the engine', () => withRuntime(async (runtime, root) => {
  const logo = join(root, 'logo.png');
  await writeFile(logo, ONE_PIXEL_PNG);
  const photos = ['pessoa-1.png', 'pessoa-2.png', 'pessoa-3.png'].map(name => join(root, name));
  for (const photo of photos) await writeFile(photo, ONE_PIXEL_PNG);
  const saved = await runtime.invoke('brands.save', { name: 'Marca Z', tone: '', colors: ['#123456'], logo, references: photos.map((path, index) => ({ path, name: `pessoa-${index + 1}.png`, portrait: true })) }) as Brand;
  assert.equal(saved.references.filter(ref => ref.portrait).length, 3, 'mais de uma foto da pessoa é aceita');
  const reloaded = (await runtime.invoke('brands.list', {}) as Brand[]).find(item => item.id === saved.id)!;
  assert.deepEqual(reloaded.references.map(ref => ref.name), ['pessoa-1.png', 'pessoa-2.png', 'pessoa-3.png']);
  assert.ok(reloaded.references.every(ref => ref.portrait === true));
  const home = await postnowHome(runtime.services);
  assert.equal(await approvedPortraitAt(home, reloaded), `references/${basename(reloaded.references[0]!.path)}`, 'a primeira foto da pessoa é o retrato oficial do motor');
}));

test('usageLimitNotice explains a Codex usage limit with the time it comes back, and stays silent for other failures', () => {
  const log = '2026-11-20T13:29:41Z ERROR codex_core::tools::router: error=image generation failed: http 429 Too Many Requests: Some("{\\"error\\":{\\"type\\":\\"usage_limit_reached\\",\\"message\\":\\"The usage limit has been reached\\",\\"plan_type\\":\\"plus\\",\\"resets_at\\":1795193073,\\"limit_window_minutes\\":1440,\\"resets_in_seconds\\":11692}}")';
  const notice = usageLimitNotice(log, Date.UTC(2026, 10, 20, 13, 30));
  assert.ok(notice);
  assert.match(notice, /limite de uso de imagens do seu plano do ChatGPT/);
  assert.match(notice, /cerca de 3h15 /);
  assert.match(notice, /Gerar de novo/);
  assert.match(usageLimitNotice('usage_limit_reached', 0) ?? '', /Gerar de novo/);
  assert.equal(usageLimitNotice('Comando falhou (código 128): git status'), undefined);
});
