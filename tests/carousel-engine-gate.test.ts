import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { Runtime } from '../src/main/runtime.js';
import type { Brand, Job, Project } from '../src/shared/contracts.js';

const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2sAAAAASUVORK5CYII=', 'base64');

async function openCarousel(root: string): Promise<{ runtime: Runtime; project: Project }> {
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/', secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    decryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    pickFile: async () => undefined, openPath: async () => undefined,
    openExternal: async () => undefined, update: async () => ({ available: false, message: '' }),
  }, () => undefined);
  await runtime.init();
  await runtime.invoke('app.settings', { workspace: join(root, 'workspace') });
  const logo = join(root, 'logo.png');
  await writeFile(logo, ONE_PIXEL_PNG);
  const brand = await runtime.invoke('brands.save', { name: 'Marca de teste', tone: 'Claro e direto.', colors: ['#123456'], logo }) as Brand;
  const project = await runtime.invoke('projects.create', {
    title: 'Carrossel de teste', kind: 'image', format: 'carousel-1x1', brief: 'Explicar um tema com fontes.', brandId: brand.id,
  }) as Project;
  return { runtime, project };
}

/** Writes headline, copy and visual function only on the 1-based pages listed in `filled`; the others stay empty placeholders. */
async function writeFilledPages(project: Project, filled: number[]): Promise<void> {
  const projectJsonPath = join(project.path, 'project.json');
  const native = JSON.parse(await readFile(projectJsonPath, 'utf8')) as { pages: Record<string, unknown>[] };
  native.pages = native.pages.map((page, index) => (filled.includes(index + 1)
    ? { ...page, headline: `Título da página ${index + 1}`, copy: `Copy da página ${index + 1}.`, visual_function: `Função da página ${index + 1}.` }
    : page));
  await writeFile(projectJsonPath, `${JSON.stringify(native, null, 2)}\n`);
}

async function entriesOf(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

test('carousel generation requires an explicit logo policy before any round or engine call', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-carousel-policy-'));
  const { runtime, project } = await openCarousel(root);
  let engineCalls = 0;
  runtime.services.run = async () => { engineCalls += 1; throw new Error('O motor não deve iniciar sem política de logo.'); };
  try {
    await assert.rejects(runtime.invoke('agents.generateImages', { id: project.id, confirm: true }), /Escolha onde aplicar a logo/);
    await assert.rejects(runtime.invoke('agents.generateImages', { id: project.id, confirm: true, logoPolicy: 'sempre' }), /Escolha onde aplicar a logo/);
    assert.equal(engineCalls, 0);
    assert.deepEqual(await entriesOf(join(project.path, 'generated', 'runs')), []);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('carousel generation with empty pages stops before creating a round, context, or engine run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-carousel-empty-'));
  const { runtime, project } = await openCarousel(root);
  let engineCalls = 0;
  runtime.services.run = async () => { engineCalls += 1; throw new Error('O motor não deve iniciar com páginas vazias.'); };
  try {
    await assert.rejects(runtime.invoke('agents.generateImages', { id: project.id, confirm: true, logoPolicy: 'cover-closing' }), /copy vazia/);
    assert.equal(engineCalls, 0);
    assert.deepEqual(await entriesOf(join(project.path, 'generated', 'runs')), []);
    assert.deepEqual(await entriesOf(join(project.path, '.studio-context')), []);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('carousel engine context lists only written slides and never the whole-project Maestro brief', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-carousel-context-'));
  const { runtime, project } = await openCarousel(root);
  const binDir = join(root, 'bin');
  const fakeCodex = join(binDir, process.platform === 'win32' ? 'codex.cmd' : 'codex');
  await mkdir(binDir, { recursive: true });
  await writeFile(fakeCodex, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\nexit 0\n');
  await chmod(fakeCodex, 0o755);
  const previousPath = process.env.PATH;
  process.env.PATH = `${binDir}${delimiter}${previousPath ?? ''}`;
  let engineStarts = 0;
  runtime.services.run = async () => { engineStarts += 1; return { id: 'job-contexto' } as unknown as Job; };
  runtime.services.waitJob = () => new Promise<Job>(() => undefined);
  try {
    await writeFilledPages(project, [1, 5]);
    await runtime.invoke('agents.start', { id: project.id, provider: 'codex', prompt: 'Escreva a sequência do carrossel.', confirm: true });
    assert.equal(engineStarts, 1);
    const contextDirectory = join(project.path, '.studio-context');
    const contextFiles = (await entriesOf(contextDirectory)).filter(name => name.endsWith('.txt'));
    assert.equal(contextFiles.length, 1);
    const context = await readFile(join(contextDirectory, contextFiles[0]!), 'utf8');
    assert.match(context, /## Carrossel \(ordem de leitura\)/);
    assert.match(context, /Título: Título da página 1 ·/);
    assert.match(context, /Título: Título da página 5 ·/);
    assert.doesNotMatch(context, /Título da página 2/);
    assert.doesNotMatch(context, /Título: —/);
    assert.doesNotMatch(context, /Brief Maestro/);
  } finally {
    process.env.PATH = previousPath ?? '';
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
