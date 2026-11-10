import { randomUUID } from 'node:crypto';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Runtime } from '../src/main/runtime.js';
import { capture } from '../src/main/supervisor.js';
import type { Project, ProjectDetail } from '../src/shared/contracts.js';
import { buildInventory, recoverDeletions } from '../src/main/content/lifecycle.js';
import { nextImageBatchId } from '../src/main/content/postnow.js';
import { privateWorkspaceDirectory } from '../src/main/content/storage.js';


test('new image batch ids sort after existing runs even when the clock moves backward', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-batch-order-'));
  try {
    const projectPath = join(root, 'project');
    const existingTimestamp = Date.now() + 60 * 60 * 1000;
    await mkdir(join(projectPath, 'generated', 'runs', `${existingTimestamp}-abcdef12`), { recursive: true });
    const nextId = await nextImageBatchId(projectPath);
    assert.match(nextId, new RegExp(`^${existingTimestamp + 1}-[a-f0-9]{8}$`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('clone keeps directions without media; deletion requires confirmation and preserves the other project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-lifecycle-'));
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/', secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('unavailable'); }, decryptSecret: () => { throw new Error('unavailable'); },
    pickFile: async () => undefined, openPath: async () => undefined, openExternal: async () => undefined,
    update: async () => ({ available: false, message: '' }),
  }, () => undefined);
  try {
    await runtime.init();
    await runtime.saveSettings({ workspace: join(root, 'workspace') });
    const original = await runtime.invoke('projects.create', { title: 'Projeto original', kind: 'image', brief: 'Diretrizes próprias.' }) as Project;
    await runtime.invoke('projects.notes', { id: original.id, notes: 'Tom acolhedor.', brief: original.brief });
    await writeFile(join(original.path, 'generated', 'slide-01.png'), 'original');
    const copy = await runtime.invoke('projects.clone', { id: original.id, title: 'Novo vídeo', kind: 'video' }) as Project;
    const detail = await runtime.invoke('projects.detail', { id: copy.id }) as ProjectDetail;
    assert.equal(detail.brief, original.brief);
    assert.equal(detail.notes, 'Tom acolhedor.');
    assert.equal(detail.assets.some(asset => asset.kind === 'image' || asset.kind === 'video'), false);
    assert.equal(copy.sourceProjectId, original.id);
    const embeddedExport = join(copy.path, 'export-independent');
    await mkdir(embeddedExport);
    await writeFile(join(embeddedExport, 'MANIFEST.json'), '{}');
    await assert.rejects(runtime.invoke('projects.deletePreview', { id: copy.id }), /Exportação independente preservada/);
    const nativePath = join(original.path, 'project.json');
    const native = JSON.parse(await readFile(nativePath, 'utf8')) as Record<string, unknown>;
    native.type = 'story';
    delete native.format;
    await writeFile(nativePath, JSON.stringify(native));
    const importedStory = await runtime.invoke('projects.import', { path: original.path, kind: 'image' }) as Project;
    assert.equal(importedStory.format, 'story-9x16');
    const importedStoryNative = JSON.parse(await readFile(join(importedStory.path, 'project.json'), 'utf8')) as { format?: string };
    assert.equal(importedStoryNative.format, 'story-9x16');
    await rm(embeddedExport, { recursive: true });
    const preview = await runtime.invoke('projects.deletePreview', { id: copy.id }) as { folder: string; files: number };
    assert.equal(preview.folder, copy.path);
    assert.ok(preview.files > 0);
    await assert.rejects(runtime.invoke('projects.delete', { id: copy.id, confirm: true, confirmTitle: 'errado' }), /nome do projeto/i);
    assert.ok(await readFile(join(copy.path, 'storyboard.json')));
    const previousJobs = runtime.services.jobs;
    runtime.services.jobs = () => [{ id: randomUUID(), title: 'Tarefa ativa', status: 'running', createdAt: new Date().toISOString(), projectId: copy.id, log: '', interactive: false }];
    try {
      await assert.rejects(runtime.invoke('projects.delete', { id: copy.id, confirm: true, confirmTitle: copy.title }), /processo ativo/i);
    } finally { runtime.services.jobs = previousJobs; }
    const deletionJournalDirectory = await privateWorkspaceDirectory(join(root, 'data'), join(root, 'workspace'), 'deleting');
    await assert.rejects(readFile(join(deletionJournalDirectory, `${copy.id}.json`)), { code: 'ENOENT' });
    assert.ok(await readFile(join(copy.path, 'storyboard.json')));
    const blockedHistory = join(root, 'data', 'history', 'jobs.json.tmp');
    await mkdir(blockedHistory);
    await assert.rejects(runtime.invoke('projects.delete', { id: copy.id, confirm: true, confirmTitle: copy.title }));
    assert.ok(await readFile(join(copy.path, 'storyboard.json')));
    await rm(blockedHistory, { recursive: true });
    await runtime.invoke('projects.delete', { id: copy.id, confirm: true, confirmTitle: copy.title });
    await assert.rejects(readFile(join(copy.path, 'storyboard.json')), { code: 'ENOENT' });
    assert.equal(await readFile(join(original.path, 'generated', 'slide-01.png'), 'utf8'), 'original');
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('imported PostNow rounds bridge only complete approved batches and mapped deletion invalidates the round', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-batches-'));
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/', secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('unavailable'); }, decryptSecret: () => { throw new Error('unavailable'); },
    pickFile: async () => undefined, openPath: async () => undefined, openExternal: async () => undefined,
    update: async () => ({ available: false, message: '' }),
  }, () => undefined);
  try {
    await runtime.init();
    await runtime.saveSettings({ workspace: join(root, 'workspace') });
    const project = await runtime.invoke('projects.create', { title: 'Rodadas PostNow', kind: 'image', brief: 'Direção visual.' }) as Project;
    const rounds: { id: string; sources: string[]; outputs: string[]; nativeProject: string }[] = [];
    for (let round = 0; round < 2; round++) {
      const sources: string[] = [];
      for (let image = 0; image < 5; image++) {
        const source = join(root, `round-${round + 1}-image-${image + 1}.png`);
        const color = ['red', 'blue', 'green', 'yellow', 'purple'][image]!;
        const generated = await capture('ffmpeg', ['-hide_banner', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=64x64:d=1`, '-frames:v', '1', source]);
        assert.equal(generated.code, 0, generated.stderr);
        sources.push(source);
      }
      const imported = await runtime.invoke('projects.importAsset', { id: project.id, paths: sources }) as ProjectDetail;
      const batch = imported.batches?.[0];
      assert.ok(batch);
      assert.equal(batch.sourceCount, 5);
      const outputs: string[] = [];
      const inputDirectory = join(project.path, 'generated', 'runs', batch.id, '.input');
      const inputNames = (await readdir(inputDirectory)).sort();
      assert.equal(inputNames.length, 5);
      const run = join(project.path, 'generated', 'runs', batch.id);
      const nativeProject = join(root, 'data', 'engine-data', 'postnow', 'clients', `studio-test-${round + 1}`, 'projects', `round-${batch.id}`);
      await mkdir(join(nativeProject, 'generated'), { recursive: true });
      await mkdir(join(nativeProject, 'qa'), { recursive: true });
      await writeFile(join(nativeProject, '.studio-owner.json'), JSON.stringify({ projectId: project.id, batchId: batch.id }));
      await writeFile(join(nativeProject, 'qa', 'contact-sheet.jpg'), 'contact sheet');
      await writeFile(join(nativeProject, 'qa', 'contact-sheet.json'), '{}');
      await writeFile(join(nativeProject, 'qa', 'approval.json'), '{}');
      const pages = [];
      for (let index = 0; index < 5; index++) {
        const output = `slide-${String(index + 1).padStart(2, '0')}.png`;
        outputs.push(join(project.path, 'generated', 'runs', batch.id, output));
        const bytes = await readFile(join(inputDirectory, inputNames[index]!));
        const nativeName = index === 0 ? '1-capa.png' : index === 4 ? '5-cta.png' : `${index + 1}-pagina.png`;
        await writeFile(outputs[index]!, bytes);
        await writeFile(join(nativeProject, 'generated', nativeName), bytes);
        pages.push({ page: index + 1, input: inputNames[index], output, native: nativeName });
      }
      await writeFile(join(run, '.mapping.json'), JSON.stringify({ pages }));
      await writeFile(join(run, '.status.json'), JSON.stringify({ state: 'ready', updatedAt: new Date().toISOString() }));
      rounds.push({ id: batch.id, sources, outputs, nativeProject });
    }
    const [older, latest] = rounds as [typeof rounds[number], typeof rounds[number]];
    const sortedRounds = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.equal(sortedRounds.batches?.[0]?.id, latest.id);
    assert.notEqual(older.id, latest.id);
    await assert.rejects(runtime.invoke('projects.bridge', { id: project.id, kind: 'video' }), /versão específica/i);
    for (const output of latest.outputs) {
      await runtime.invoke('projects.approve', { id: project.id, path: output.slice(project.path.length + 1), approved: true });
    }
    const latestRun = join(project.path, 'generated', 'runs', latest.id);
    const latestMapping = join(latestRun, '.mapping.json');
    const validLatestMapping = await readFile(latestMapping);
    await writeFile(latestMapping, '{');
    await assert.rejects(runtime.invoke('projects.deleteAsset', { id: project.id, path: latest.outputs[0]!.slice(project.path.length + 1), confirm: true }), /JSON corrompido/i);
    assert.ok(await readFile(latest.outputs[0]!));
    await writeFile(latestMapping, validLatestMapping);
    await rm(latest.outputs[4]!);
    await assert.rejects(runtime.invoke('projects.bridge', { id: project.id, kind: 'video', batchId: latest.id }), /conclusão verificada/i);
    const incompleteLatest = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.equal(incompleteLatest.batches?.find(batch => batch.id === latest.id)?.status?.state, 'failed');
    assert.equal((await readdir(join(root, 'workspace', 'projects'))).length, 1);
    await rm(latestMapping);
    await runtime.invoke('projects.deleteAsset', { id: project.id, path: latest.outputs[0]!.slice(project.path.length + 1), confirm: true });
    assert.ok(await readFile(join(latestRun, '.input', 'slide-01.png')));
    await assert.rejects(readFile(latest.outputs[0]!));
    const missingMappingDetail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.equal(missingMappingDetail.batches?.find(batch => batch.id === latest.id)?.status?.state, 'failed');
    for (const output of older.outputs.slice(0, 2)) {
      await runtime.invoke('projects.approve', { id: project.id, path: output.slice(project.path.length + 1), approved: true });
    }
    await assert.rejects(runtime.invoke('projects.bridge', { id: project.id, kind: 'video', batchId: older.id }), /aprove/i);
    for (const output of older.outputs.slice(2)) {
      await runtime.invoke('projects.approve', { id: project.id, path: output.slice(project.path.length + 1), approved: true });
    }
    const video = await runtime.invoke('projects.bridge', { id: project.id, kind: 'video', batchId: older.id }) as Project;
    const videoDetail = await runtime.invoke('projects.detail', { id: video.id }) as ProjectDetail;
    const storyboard = JSON.parse(await readFile(join(video.path, 'storyboard.json'), 'utf8')) as { scenes: unknown[] };
    assert.equal((await readdir(join(video.path, 'assets/visuals/generated'))).length, 5);
    assert.deepEqual(await Promise.all(Array.from({ length: 5 }, (_, index) => readFile(join(video.path, 'assets/visuals/generated', `${String(index + 1).padStart(2, '0')}.png`)))), await Promise.all(older.outputs.map(path => readFile(path))));
    assert.equal(storyboard.scenes.length, 5);
    assert.equal(videoDetail.assets.some(asset => asset.kind === 'video'), false);
    assert.equal((await readdir(join(video.path, 'renders/final'))).length, 0);
    const deleted = older.outputs[2]!;
    const mappingPath = join(project.path, 'generated', 'runs', older.id, '.mapping.json');
    const mapping = JSON.parse(await readFile(mappingPath, 'utf8')) as { pages: { page: number; input: string; output: string; native?: string }[] };
    const deletedSource = join(project.path, 'generated', 'runs', older.id, '.input', mapping.pages.find(page => page.output === 'slide-03.png')!.input);
    const siblingSource = join(project.path, 'generated', 'runs', older.id, '.input', mapping.pages.find(page => page.output === 'slide-04.png')!.input);
    const wrongInput = { ...mapping, pages: mapping.pages.map((page, index) => index === 2 ? { ...page, input: 'slide-04.png' } : page) };
    await writeFile(mappingPath, JSON.stringify(wrongInput));
    await assert.rejects(runtime.invoke('projects.deleteAsset', { id: project.id, path: deleted.slice(project.path.length + 1), confirm: true }), /outra imagem-fonte/i);
    assert.ok(await readFile(deleted));
    assert.ok(await readFile(deletedSource));
    const wrongPage = { ...mapping, pages: mapping.pages.map((page, index) => index === 2 ? { ...page, page: 4 } : page) };
    await writeFile(mappingPath, JSON.stringify(wrongPage));
    await assert.rejects(runtime.invoke('projects.deleteAsset', { id: project.id, path: deleted.slice(project.path.length + 1), confirm: true }), /Mapeamento da página 3 inconsistente/i);
    assert.ok(await readFile(siblingSource));
    await writeFile(mappingPath, JSON.stringify(mapping));
    await assert.rejects(runtime.invoke('projects.deleteAsset', { id: project.id, path: deleted.slice(project.path.length + 1) }), /confirme/i);
    assert.ok(await readFile(deleted));
    const afterDelete = await runtime.invoke('projects.deleteAsset', { id: project.id, path: deleted.slice(project.path.length + 1), confirm: true }) as ProjectDetail;
    await assert.rejects(readFile(deleted));
    await assert.rejects(readFile(deletedSource));
    assert.ok(await readFile(siblingSource));
    assert.ok(await readFile(join(older.nativeProject, 'generated', '4-pagina.png')));
    await assert.rejects(readFile(join(older.nativeProject, 'generated', '3-pagina.png')));
    await assert.rejects(readFile(join(older.nativeProject, 'qa', 'contact-sheet.jpg')));
    await assert.rejects(readFile(join(older.nativeProject, 'qa', 'contact-sheet.json')));
    await assert.rejects(readFile(join(older.nativeProject, 'qa', 'approval.json')));
    assert.ok(afterDelete.assets.some(asset => asset.name === `generated/runs/${older.id}/slide-04.png`));
    const failedRound = afterDelete.batches?.find(batch => batch.id === older.id);
    assert.equal(failedRound?.status?.state, 'failed');
    await assert.rejects(runtime.invoke('projects.bridge', { id: project.id, kind: 'video', batchId: older.id }));
    const workspaceProjects = join(root, 'workspace', 'projects');
    assert.equal((await readdir(workspaceProjects)).length, 2);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
test('VideoGo-to-PostNow derivation accepts only compatible page counts and extracts real frames', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-video-to-postnow-'));
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/', secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('unavailable'); }, decryptSecret: () => { throw new Error('unavailable'); },
    pickFile: async () => undefined, openPath: async () => undefined, openExternal: async () => undefined,
    update: async () => ({ available: false, message: '' }),
  }, () => undefined);
  try {
    await runtime.init();
    const workspace = join(root, 'workspace');
    await runtime.saveSettings({ workspace });
    const video = await runtime.invoke('projects.create', { title: 'Vídeo de teste', kind: 'video', brief: 'Clipes aprovados.' }) as Project;
    const reviewPath = join(video.path, 'renders', 'review');
    await mkdir(reviewPath, { recursive: true });
    const firstClip = join(reviewPath, 'clip-01.mp4');
    const firstRender = await capture('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=1', '-t', '1', '-c:v', 'mpeg4', '-pix_fmt', 'yuv420p', firstClip]);
    assert.equal(firstRender.code, 0, firstRender.stderr);
    await runtime.invoke('projects.approve', { id: video.id, path: 'renders/review/clip-01.mp4', approved: true });

    const derived = await runtime.invoke('projects.bridge', { id: video.id, kind: 'image' }) as Project;
    assert.equal(derived.kind, 'image');
    assert.equal(derived.format, 'post-1x1');
    const native = JSON.parse(await readFile(join(derived.path, 'project.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(native.type, 'post');
    assert.equal(native.page_count, 1);
    assert.equal(native.page_count_approved, true);
    const [runId] = await readdir(join(derived.path, 'generated', 'runs'));
    assert.ok(runId);
    const frame = await readFile(join(derived.path, 'generated', 'runs', runId!, '.input', 'slide-01.png'));
    assert.equal(frame.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    await assert.rejects(runtime.invoke('projects.bridge', { id: video.id, kind: 'image', format: 'carousel-1x1' }), /carrossel PostNow exige de 3 a 10 páginas/i);
    assert.equal((await readdir(join(workspace, 'projects'))).length, 2);

    const secondClip = join(reviewPath, 'clip-02.mp4');
    const secondRender = await capture('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=1', '-t', '1', '-c:v', 'mpeg4', '-pix_fmt', 'yuv420p', secondClip]);
    assert.equal(secondRender.code, 0, secondRender.stderr);
    await runtime.invoke('projects.approve', { id: video.id, path: 'renders/review/clip-02.mp4', approved: true });
    await assert.rejects(runtime.invoke('projects.bridge', { id: video.id, kind: 'image' }), /uma mídia para Post\/Story ou de 3 a 10 mídias para carrossel/i);
    assert.equal((await readdir(join(workspace, 'projects'))).length, 2);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});


test('deletion recovery removes partial session and PostNow mirror using journaled targets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-recovery-'));
  const dataDir = join(root, 'data');
  const runtime = new Runtime(dataDir, {
    assetPrefix: 'media://asset/', secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('unavailable'); }, decryptSecret: () => { throw new Error('unavailable'); },
    pickFile: async () => undefined, openPath: async () => undefined, openExternal: async () => undefined,
    update: async () => ({ available: false, message: '' }),
  }, () => undefined);
  try {
    await runtime.init();
    await runtime.saveSettings({ workspace: join(root, 'workspace') });
    const project = await runtime.invoke('projects.create', { title: 'Projeto PostNow', kind: 'image', brief: 'Direção visual.' }) as Project;
    const sessionId = randomUUID();
    const sessionDirectory = join(root, 'workspace', '.studio', 'sessions', sessionId);
    await mkdir(sessionDirectory, { recursive: true });
    await writeFile(join(sessionDirectory, 'session.json'), JSON.stringify({ id: sessionId, projectId: project.id }));
    const batchId = `1730000000000-${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const generated = join(project.path, 'generated', 'runs', batchId);
    await mkdir(generated, { recursive: true });
    await writeFile(join(generated, 'partial.txt'), 'partial');
    const nativeCopy = join(dataDir, 'engine-data', 'postnow', 'clients', 'studio-test', 'projects', `test-${batchId}`);
    await mkdir(nativeCopy, { recursive: true });
    await writeFile(join(nativeCopy, '.studio-owner.json'), JSON.stringify({ projectId: project.id, batchId }));
    await writeFile(join(nativeCopy, 'partial.txt'), 'partial');

    const inventory = await buildInventory(join(root, 'workspace'), dataDir, project.id, project.title, project.path);
    assert.deepEqual(inventory.sessions, [sessionDirectory]);
    assert.deepEqual(inventory.nativeCopies, [nativeCopy]);
    const registryPath = join(root, 'workspace', '.studio', 'projects', `${project.id}.json`);
    const registry = JSON.parse(await readFile(registryPath, 'utf8')) as Record<string, unknown>;
    const targets = { sessions: inventory.sessions, nativeCopies: inventory.nativeCopies };
    const legacyDirectory = join(root, 'workspace', '.studio', 'deleting');
    await mkdir(legacyDirectory, { recursive: true });
    const legacyTombstone = join(legacyDirectory, `${project.id}.json`);
    const forgedToken = randomUUID();
    await writeFile(registryPath, JSON.stringify({ ...registry, deletion: { token: forgedToken, targets } }));
    await writeFile(legacyTombstone, JSON.stringify({ projectId: project.id, folder: project.path, token: forgedToken, createdAt: new Date().toISOString(), targets }));
    const ignored = await recoverDeletions(join(root, 'workspace'), dataDir);
    assert.deepEqual(ignored, []);
    assert.ok(await readFile(join(project.path, 'project.json')));
    assert.ok(await readFile(join(sessionDirectory, 'session.json')));
    assert.ok(await readFile(legacyTombstone));
    await rm(legacyTombstone);
    const token = randomUUID();
    await writeFile(registryPath, JSON.stringify({ ...registry, deletion: { token, targets } }));
    const tombstoneDirectory = await privateWorkspaceDirectory(dataDir, join(root, 'workspace'), 'deleting');
    const tombstone = join(tombstoneDirectory, `${project.id}.json`);
    await writeFile(tombstone, JSON.stringify({ projectId: project.id, folder: project.path, token, createdAt: new Date().toISOString(), targets }));
    const otherWorkspace = join(root, 'other-workspace');
    await mkdir(otherWorkspace);
    assert.deepEqual(await recoverDeletions(otherWorkspace, dataDir), []);
    assert.ok(await readFile(tombstone));
    assert.ok(await readFile(join(project.path, 'project.json')));

    await rm(join(sessionDirectory, 'session.json'));
    await rm(join(nativeCopy, '.studio-owner.json'));
    let callbackProjectId: string | undefined;
    const recovered = await recoverDeletions(join(root, 'workspace'), dataDir, async id => { callbackProjectId = id; });

    assert.equal(callbackProjectId, project.id);
    assert.deepEqual(recovered.map(item => item.projectId), [project.id]);
    await assert.rejects(readFile(registryPath), { code: 'ENOENT' });
    await assert.rejects(readdir(project.path), { code: 'ENOENT' });
    await assert.rejects(readdir(sessionDirectory), { code: 'ENOENT' });
    await assert.rejects(readdir(nativeCopy), { code: 'ENOENT' });
    await assert.rejects(readFile(tombstone), { code: 'ENOENT' });
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
