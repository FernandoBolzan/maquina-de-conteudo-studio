import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { Runtime } from '../src/main/runtime.js';
import type { RunSpec } from '../src/main/context.js';
import type { Job, Project, ProjectDetail } from '../src/shared/contracts.js';
import { visualStyleFor } from '../src/shared/prompt-library.js';

async function withRuntime(run: (runtime: Runtime, root: string, codex: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'mdc-visual-style-'));
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
    await run(runtime, root, codex);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
}

test('visual style and image background mode are stored with the project and survive reloading', () => withRuntime(async (runtime, root) => {
  const project = await runtime.invoke('projects.create', { title: 'Post com estilo', kind: 'image', format: 'post-1x1', brief: 'Tema', visualStyleId: 'collage-carousel', imageBackgroundMode: 'dark' }) as Project;
  const expected = visualStyleFor('collage-carousel');
  assert.ok(expected);
  assert.deepEqual(project.visualStyle, expected);
  assert.equal(project.imageBackgroundMode, 'dark');
  const reloaded = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
  assert.deepEqual(reloaded.visualStyle, expected);
  assert.equal(reloaded.imageBackgroundMode, 'dark');

  const plain = await runtime.invoke('projects.create', { title: 'Sem estilo', kind: 'image', brief: 'Tema' }) as Project;
  assert.equal(plain.visualStyle, undefined);
  assert.equal(plain.imageBackgroundMode, 'light');

  const before = await readdir(join(root, 'workspace', 'projects'));
  await assert.rejects(runtime.invoke('projects.create', { title: 'Estilo inválido', kind: 'image', brief: 'x', visualStyleId: 'nao-existe' }), /Estilo visual desconhecido/);
  await assert.rejects(runtime.invoke('projects.create', { title: 'Fundo inválido', kind: 'image', brief: 'x', imageBackgroundMode: 'auto' }), /Escolha fundo claro ou escuro/);
  await assert.rejects(runtime.invoke('projects.create', { title: 'Carrossel inválido', kind: 'image', format: 'carousel-1x1', pageCount: 2, brief: 'x' }), /Quantidade de páginas inválida/);
  await assert.rejects(runtime.invoke('projects.create', { title: 'Vídeo com estilo', kind: 'video', brief: 'x', visualStyleId: 'collage-carousel' }), /Estilo visual desconhecido/);
  await assert.rejects(runtime.invoke('projects.create', { title: 'Vídeo com fundo', kind: 'video', brief: 'x', imageBackgroundMode: 'dark' }), /só podem ser escolhidos para projetos PostNow/);
  assert.deepEqual(await readdir(join(root, 'workspace', 'projects')), before, 'rejected input does not leave a project folder behind');
}));


test('the chosen style reaches the agent context directly, and projects without one add nothing', () => withRuntime(async (runtime) => {
  let captured: RunSpec | undefined;
  const fakeJob: Job = { id: 'fake-codex-job', title: 'Codex em teste', status: 'running', createdAt: new Date().toISOString(), log: '', interactive: false };
  runtime.services.run = async spec => { captured = spec; return { ...fakeJob, title: spec.title }; };
  runtime.services.waitJob = async id => ({ ...fakeJob, id, status: 'failed' });
  runtime.services.capture = async () => ({ code: 1, stdout: '', stderr: 'Maestro isolado neste teste.' });

  async function contextOf(project: Project): Promise<string> {
    await runtime.invoke('agents.start', { id: project.id, provider: 'codex', prompt: 'Prepare os textos.', confirm: true });
    assert.ok(captured, 'a sessão deve chegar ao lançador');
    const dir = join(project.path, '.studio-context');
    const [file] = (await readdir(dir)).filter(name => name.endsWith('.txt'));
    return readFile(join(dir, file!), 'utf8');
  }

  const styled = await runtime.invoke('projects.create', { title: 'Com estilo', kind: 'image', brief: 'Tema', visualStyleId: 'image-dark-mode-carousel' }) as Project;
  const context = await contextOf(styled);
  const style = visualStyleFor('image-dark-mode-carousel')!;
  assert.ok(context.includes(`DIREÇÃO VISUAL ESCOLHIDA NA BIBLIOTECA (“${style.title}”): ${style.direction}`));

  const plain = await runtime.invoke('projects.create', { title: 'Sem estilo', kind: 'image', brief: 'Tema' }) as Project;
  assert.ok(!(await contextOf(plain)).includes('DIREÇÃO VISUAL ESCOLHIDA NA BIBLIOTECA'));
}));


test('video style: preset, free text or both are stored with the project, reach every video agent session, and bad choices are refused', () => withRuntime(async (runtime) => {
  let captured: RunSpec | undefined;
  const fakeJob: Job = { id: 'fake-claude-job', title: 'Claude em teste', status: 'running', createdAt: new Date().toISOString(), log: '', interactive: false };
  runtime.services.run = async spec => { captured = spec; return { ...fakeJob, title: spec.title }; };
  runtime.services.waitJob = async id => ({ ...fakeJob, id, status: 'failed' });
  runtime.services.capture = async () => ({ code: 1, stdout: '', stderr: 'Maestro isolado neste teste.' });

  const video = await runtime.invoke('projects.create', { title: 'Vídeo', kind: 'video', brief: 'Tema' }) as Project;
  assert.equal(video.visualStyle, undefined);

  const preset = visualStyleFor('video-vox-explainer', 'video')!;
  assert.equal((await runtime.invoke('projects.videoStyle', { id: video.id, styleId: preset.id }) as ProjectDetail).visualStyle?.direction, preset.direction);

  const adjusted = (await runtime.invoke('projects.videoStyle', { id: video.id, styleId: preset.id, custom: '  fundo   escuro\ncortes secos ' }) as ProjectDetail).visualStyle!;
  assert.equal(adjusted.id, preset.id);
  assert.equal(adjusted.direction, `${preset.direction} Ajustes pedidos: fundo escuro cortes secos`);

  const free = (await runtime.invoke('projects.videoStyle', { id: video.id, custom: 'Minimalista, texto grande amarelo' }) as ProjectDetail).visualStyle!;
  assert.deepEqual(free, { id: 'custom', title: 'Estilo personalizado', direction: 'Minimalista, texto grande amarelo' });
  assert.deepEqual((await runtime.invoke('projects.detail', { id: video.id }) as ProjectDetail).visualStyle, free, 'o estilo sobrevive ao recarregar o projeto');

  await assert.rejects(runtime.invoke('projects.videoStyle', { id: video.id }), /Escolha um estilo pronto ou descreva/);
  await assert.rejects(runtime.invoke('projects.videoStyle', { id: video.id, styleId: 'nao-existe' }), /Estilo de vídeo desconhecido/);
  await assert.rejects(runtime.invoke('projects.videoStyle', { id: video.id, styleId: 'collage-carousel' }), /Estilo de vídeo desconhecido/, 'receita de imagem não é estilo de vídeo');
  await assert.rejects(runtime.invoke('projects.videoStyle', { id: video.id, custom: 'x'.repeat(1501) }), /até 1500 caracteres/);
  assert.deepEqual((await runtime.invoke('projects.detail', { id: video.id }) as ProjectDetail).visualStyle, free, 'recusa preserva o estilo anterior');

  const image = await runtime.invoke('projects.create', { title: 'Post', kind: 'image', brief: 'Tema' }) as Project;
  await assert.rejects(runtime.invoke('projects.videoStyle', { id: image.id, custom: 'qualquer' }), /só existe em projetos de vídeo/);

  await runtime.invoke('agents.start', { id: video.id, provider: 'claude', prompt: 'Corrija o título da cena 2.', confirm: true });
  assert.ok(captured, 'a sessão deve chegar ao lançador');
  const dir = join(video.path, '.studio-context');
  const [file] = (await readdir(dir)).filter(name => name.endsWith('.txt'));
  const context = await readFile(join(dir, file!), 'utf8');
  assert.ok(context.includes('ESTILO VISUAL ESCOLHIDO PARA O VÍDEO (“Estilo personalizado”): Minimalista, texto grande amarelo'));
}));
