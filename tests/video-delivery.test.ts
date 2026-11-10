import assert from 'node:assert/strict';
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { Runtime } from '../src/main/runtime.js';
import type { RunSpec } from '../src/main/context.js';
import type { Job, Project, ProjectDetail } from '../src/shared/contracts.js';

test('video delivery takes the cover from Codex ImageGen and the copy from Claude Opus before publishing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-video-delivery-'));
  const data = join(root, 'data');
  const codex = join(data, 'runtime', 'tools', 'codex', 'node_modules', '.bin', 'codex');
  const claude = join(data, 'runtime', 'tools', 'claude', 'node_modules', '.bin', 'claude');
  const runtime = new Runtime(data, {
    assetPrefix: 'media://asset/', secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('not available'); }, decryptSecret: () => { throw new Error('not available'); },
    pickFile: async () => undefined, openPath: async () => undefined, openExternal: async () => undefined,
    update: async () => ({ available: false, message: '' }),
  }, () => undefined);
  try {
    for (const tool of [codex, claude]) {
      await mkdir(dirname(tool), { recursive: true });
      await writeFile(tool, '#!/bin/sh\nexit 0\n'); await chmod(tool, 0o700);
    }
    await runtime.init(); await runtime.invoke('app.settings', { workspace: join(root, 'workspace') });
    const project = await runtime.invoke('projects.create', { title: 'Vídeo', kind: 'video', format: 'youtube', brief: 'Vídeo para publicação' }) as Project;
    let spec: RunSpec | undefined;
    const job: Job = { id: 'job', title: 'Codex', status: 'running', createdAt: '', log: '', interactive: false, projectId: project.id };
    runtime.services.run = async input => { spec = input; return job; };
    runtime.services.waitJob = async () => ({ ...job, status: 'failed' });
    // Claude stand-in: writes the copy only when told to, and records which model was asked.
    let claudeCopy: string | undefined;
    const claudeModels: string[] = [];
    const realCapture = runtime.services.capture.bind(runtime.services);
    runtime.services.capture = async (executable, args, options) => {
      if (executable !== claude) return realCapture(executable, args, options);
      claudeModels.push(args[args.indexOf('--model') + 1]!);
      const target = /Salve somente o texto final em (\S+\.txt)\./.exec(args[args.indexOf('-p') + 1]!)?.[1];
      if (claudeCopy !== undefined && target) await writeFile(target, claudeCopy);
      return { code: 0, stdout: '', stderr: '' };
    };
    await assert.rejects(runtime.invoke('agents.generateVideoDelivery', { id: project.id, format: 'youtube' }), /confirmação explícita/);
    await runtime.invoke('agents.generateVideoDelivery', { id: project.id, format: 'youtube', confirm: true });
    assert.ok(spec?.onSuccess);
    const stageName = (await readdir(join(project.path, '.studio-context'))).find(name => name.startsWith('delivery-'))!;
    const stage = join(project.path, '.studio-context', stageName);
    await copyFile('public/icon.png', join(stage, 'cover.png'));
    // Claude without copy (ex.: account limit): the paid cover is kept and only the copy is missing.
    await assert.rejects(spec.onSuccess(new AbortController().signal), /Capa salva em delivery\/cover-youtube\.png/);
    assert.ok((await readFile(join(project.path, 'delivery', 'cover-youtube.png'))).length > 0);
    await assert.rejects(readFile(join(project.path, 'delivery', 'copy-youtube.txt')), { code: 'ENOENT' });
    claudeCopy = 'Uma descrição para o YouTube.';
    await spec.onSuccess(new AbortController().signal);
    assert.deepEqual(claudeModels, ['claude-opus-5-5', 'claude-opus-5-5']);
    assert.match(spec.title, /Codex ImageGen capa \+ Claude copy/);
    assert.equal(await readFile(join(project.path, 'delivery', 'copy-youtube.txt'), 'utf8'), 'Uma descrição para o YouTube.');
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    const cover = detail.assets.find(asset => asset.name === 'delivery/cover-youtube.png');
    const copy = detail.assets.find(asset => asset.name === 'delivery/copy-youtube.txt');
    assert.ok(cover && copy);
    await runtime.invoke('projects.approve', { id: project.id, path: cover.path, approved: true });
    const snapshot = await runtime.invoke('app.snapshot') as { projects: Project[] };
    assert.match(snapshot.projects[0]!.coverUrl!, /^media:\/\/asset\//);
    // Copy-only reruns Claude Opus without touching the cover.
    const coverBefore = await readFile(join(project.path, 'delivery', 'cover-youtube.png'));
    await runtime.invoke('agents.generateVideoCopy', { id: project.id, format: 'youtube', confirm: true });
    assert.equal(spec.executable, claude);
    assert.equal(spec.args[spec.args.indexOf('--model') + 1], 'claude-opus-5-5');
    const target = /Salve somente o texto final em (\S+\.txt)\./.exec(spec.args[spec.args.indexOf('-p') + 1]!)![1]!;
    await assert.rejects(spec.onSuccess!(new AbortController().signal));
    await writeFile(target, 'Nova descrição.');
    await spec.onSuccess!(new AbortController().signal);
    assert.equal(await readFile(join(project.path, 'delivery', 'copy-youtube.txt'), 'utf8'), 'Nova descrição.');
    assert.deepEqual(await readFile(join(project.path, 'delivery', 'cover-youtube.png')), coverBefore);
    // Cover-only never calls Claude and succeeds with the cover alone.
    claudeModels.length = 0;
    await runtime.invoke('agents.generateVideoDelivery', { id: project.id, format: 'youtube', coverOnly: true, confirm: true });
    assert.match(spec.title, /^Codex ImageGen capa ·/);
    const coverStage = join(project.path, '.studio-context', (await readdir(join(project.path, '.studio-context'))).find(name => name.startsWith('delivery-') && name !== stageName)!);
    await copyFile('public/icon.png', join(coverStage, 'cover.png'));
    assert.match(await spec.onSuccess!(new AbortController().signal) as string, /^Capa gerada/);
    assert.deepEqual(claudeModels, []);
  } finally { await runtime.dispose(); await rm(root, { recursive: true, force: true }); }
});
