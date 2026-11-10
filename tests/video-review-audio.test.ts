import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Runtime } from '../src/main/runtime.js';
import { capture } from '../src/main/supervisor.js';
import type { Project, ProjectDetail } from '../src/shared/contracts.js';

test('video review metadata distinguishes real audio, silence and unreadable files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-video-review-'));
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/', secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('unavailable'); }, decryptSecret: () => { throw new Error('unavailable'); },
    pickFile: async () => undefined, openPath: async () => undefined, openExternal: async () => undefined,
    update: async () => ({ available: false, message: '' }),
  }, () => undefined);
  try {
    await runtime.init();
    await runtime.saveSettings({ workspace: join(root, 'workspace') });
    const project = await runtime.invoke('projects.create', { title: 'Revisão', kind: 'video', brief: 'Teste' }) as Project;
    const dir = join(project.path, 'renders', 'review');
    await mkdir(dir, { recursive: true });
    const silent = await capture('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=64x64:d=0.2', '-c:v', 'libx264', '-y', join(dir, 'silent.mp4')]);
    assert.equal(silent.code, 0, silent.stderr);
    const audio = await capture('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=64x64:d=0.2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', '-y', join(dir, 'narrated.mp4')]);
    assert.equal(audio.code, 0, audio.stderr);
    await writeFile(join(dir, 'broken.mp4'), 'not a video');
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.equal(detail.assets.find(asset => asset.name.endsWith('/silent.mp4'))?.hasAudio, false);
    assert.equal(detail.assets.find(asset => asset.name.endsWith('/narrated.mp4'))?.hasAudio, true);
    assert.equal(detail.assets.find(asset => asset.name.endsWith('/broken.mp4'))?.hasAudio, undefined);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
