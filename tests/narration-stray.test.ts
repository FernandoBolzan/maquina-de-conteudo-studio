import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../src/main/runtime.js';
import type { NarrationState, Project, ProjectDetail } from '../src/shared/contracts.js';

test('narration audio whose file disappeared is reported as stray and can be removed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-narration-stray-'));
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
    const project = await runtime.invoke('projects.create', { title: 'Cena órfã', kind: 'video', brief: '' }) as Project;
    const tone = join(root, 'tom.wav');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', tone]);

    const initial = await runtime.invoke('projects.narration', { id: project.id }) as NarrationState;
    const sceneId = initial.scenes[0]!.id;
    const attached = await runtime.invoke('projects.attachNarrationAudio', { projectId: project.id, sceneId, source: { kind: 'file', path: tone } }) as NarrationState;

    const storyboard = JSON.parse(await readFile(join(project.path, 'storyboard.json'), 'utf8')) as { scenes: Array<{ id: string; audio?: { narration?: { assetPath: string } } }> };
    const assetPath = storyboard.scenes.find(scene => scene.id === sceneId)!.audio!.narration!.assetPath;
    assert.equal(attached.scenes.find(scene => scene.id === sceneId)!.audioPath, assetPath);
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    const asset = detail.assets.find(item => item.name === assetPath);
    assert.ok(asset);
    const reviewed = await runtime.invoke('projects.approve', { id: project.id, path: asset.path, approved: true }) as ProjectDetail;
    assert.equal(reviewed.assets.find(item => item.name === assetPath)?.approved, true);
    await rm(join(project.path, assetPath));

    const orphaned = await runtime.invoke('projects.narration', { id: project.id }) as NarrationState;
    assert.equal(orphaned.scenes.find(scene => scene.id === sceneId)!.audioAttached, false);
    assert.equal(orphaned.scenes.find(scene => scene.id === sceneId)!.stray, true);
    assert.equal(orphaned.scenes.find(scene => scene.id === sceneId)!.audioPath, undefined);

    const removed = await runtime.invoke('projects.narration.removeAudio', { projectId: project.id, sceneId, confirm: true }) as NarrationState;
    assert.equal(removed.scenes.find(scene => scene.id === sceneId)!.stray, false);
    assert.equal(removed.active, false);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
