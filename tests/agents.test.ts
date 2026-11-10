import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { Runtime } from '../src/main/runtime.js';
import type { RunSpec } from '../src/main/context.js';
import type { Job, Project, ProjectDetail } from '../src/shared/contracts.js';

test('Codex auto-approval keeps its workspace-write sandbox without conflicting --sandbox', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-agent-args-'));
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
    const project = await runtime.invoke('projects.create', {
      title: 'Teste de execução Codex',
      kind: 'image',
      brief: 'Crie um carrossel de teste.',
    }) as Project;

    let captured: RunSpec | undefined;
    const fakeJob: Job = {
      id: 'fake-codex-job',
      title: 'Codex em teste',
      status: 'running',
      createdAt: new Date().toISOString(),
      log: '',
      interactive: false,
      projectId: project.id,
    };
    runtime.services.run = async spec => { captured = spec; return { ...fakeJob, title: spec.title }; };
    runtime.services.waitJob = async id => ({ ...fakeJob, id, status: 'failed' });
    runtime.services.capture = async () => ({ code: 1, stdout: '', stderr: 'Maestro isolado neste teste.' });

    await runtime.invoke('agents.start', {
      id: project.id,
      provider: 'codex',
      prompt: 'Prepare os arquivos do carrossel.',
      confirm: true,
    });
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.equal(detail.batches?.length, 0, 'preparar conteúdo não deve abrir rodada de imagem vazia');
    assert.ok(captured, 'a sessão autorizada deve chegar ao lançador');
    assert.equal(captured.executable, codex);
    assert.equal(captured.args[0], 'exec');
    assert.ok(captured.args.includes('--approve-for-me'));
    assert.equal(captured.args.includes('--sandbox'), false);
    assert.equal(captured.args[captured.args.indexOf('--cd') + 1], project.path);
    const nativePath = join(project.path, 'project.json');
    const native = JSON.parse(await readFile(nativePath, 'utf8')) as { pages: { copy: string }[] };
    native.pages[4]!.copy = 'Conteúdo anterior da quinta página';
    await writeFile(nativePath, JSON.stringify(native));
    await runtime.invoke('projects.imageFormat', { id: project.id, format: 'post-1x1' });
    await writeFile(nativePath, '{');
    const interrupted = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.ok(interrupted.formatAdaptation, 'projeto continua acessível após escrita parcial');
    await runtime.invoke('agents.start', { id: project.id, provider: 'codex', prompt: 'Adapte a copy.', confirm: true, adaptation: true });
    assert.ok(captured?.onSuccess, 'a sessão de adaptação deve validar o resultado');
    const contextDir = join(project.path, '.studio-context');
    const contexts = await Promise.all((await readdir(contextDir)).filter(name => name.endsWith('.txt')).map(name => readFile(join(contextDir, name), 'utf8')));
    assert.ok(contexts.some(content => content.includes('Conteúdo anterior da quinta página') && content.includes('exatamente 1 página')));
    assert.ok((await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail).formatAdaptation, 'falha preserva pendência para nova tentativa');
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('video projects run pinned Claude Opus 5.5 with read access to VideoGo and its composition commands', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-video-opus-'));
  const dataDir = join(root, 'data');
  const claude = join(dataDir, 'runtime', 'tools', 'claude', 'node_modules', '.bin', 'claude');
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
    // Fake HyperFrames in the managed tool dir keeps the test independent of the host install.
    const hyperframes = join(dataDir, 'runtime', 'tools', 'hyperframes', 'node_modules', '.bin', 'hyperframes');
    for (const tool of [claude, hyperframes]) {
      await mkdir(dirname(tool), { recursive: true });
      await writeFile(tool, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
      await chmod(tool, 0o700);
    }
    await runtime.init();
    await runtime.invoke('app.settings', { workspace: join(root, 'workspace') });
    // Linked engine with a compiled CLI: the agent must be able to read its contract and run its validator.
    const engine = join(root, 'VideoGo');
    await mkdir(join(engine, 'dist', 'cli'), { recursive: true });
    await writeFile(join(engine, 'dist', 'cli', 'index.js'), '');
    await runtime.services.saveSettings({ enginePaths: { videogo: engine } });
    const project = await runtime.invoke('projects.create', {
      title: 'Projeto de Vídeo com Opus',
      kind: 'video',
      brief: 'Crie um vídeo explicativo com Opus.',
    }) as Project;

    let captured: RunSpec | undefined;
    const fakeJob: Job = {
      id: 'fake-claude-job',
      title: 'Claude Opus em teste',
      status: 'running',
      createdAt: new Date().toISOString(),
      log: '',
      interactive: false,
      projectId: project.id,
    };
    runtime.services.run = async spec => { captured = spec; return { ...fakeJob, title: spec.title }; };
    runtime.services.waitJob = async id => ({ ...fakeJob, id, status: 'succeeded' });
    runtime.services.capture = async () => ({ code: 1, stdout: '', stderr: 'Maestro isolado neste teste.' });

    // Even if requested with provider 'codex' or model 'gpt-6-luna', video project must route to Claude Opus
    await runtime.invoke('agents.start', {
      id: project.id,
      provider: 'codex',
      model: 'gpt-6-luna',
      prompt: 'Construa o roteiro e a direção visual.',
      confirm: true,
    });

    assert.ok(captured);
    assert.ok(captured.args.includes('--model'));
    assert.equal(captured.args[captured.args.indexOf('--model') + 1], 'claude-opus-5-5');
    assert.equal(captured.args[captured.args.indexOf('--effort') + 1], 'medium');
    const allowed = captured.args.slice(captured.args.indexOf('--allowedTools') + 1);
    assert.ok(allowed.includes(`Read(/${engine}/**)`), 'o agente precisa ler o contrato e a skill do VideoGo');
    assert.ok(allowed.some(rule => rule.startsWith('Bash(') && rule.endsWith(`${join(engine, 'dist', 'cli', 'index.js')} project validate:*)`)), 'o agente precisa validar o storyboard');
    assert.ok(allowed.some(rule => rule.endsWith(' project composition:*)')), 'o agente precisa montar a composição autoral');
    assert.ok(allowed.includes(`Bash(${hyperframes} snapshot:*)`), 'o agente precisa ver quadros da composição');
    assert.ok(!allowed.some(rule => /^Bash\([^)]*\*\)$/.test(rule) && !/ (project (validate|sound|composition|render|sheet)|lint|snapshot|docs):\*\)$/.test(rule)), 'nenhum shell irrestrito');
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
