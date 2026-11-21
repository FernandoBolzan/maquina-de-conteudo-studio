import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Runtime } from '../src/main/runtime.js';
import { capture } from '../src/main/supervisor.js';
import { postNowFormatAcceptsPageCount, VIDEO_AGENT_MODEL, type NarrationState, type Project, type ProjectDetail } from '../src/shared/contracts.js';
import { privateWorkspaceDirectory, serialized } from '../src/main/content/storage.js';
import { recordVideoComposition } from '../src/main/projects.js';

test('Runtime enforces consent, path containment, symlink rejection, and hash-bound approvals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-test-'));
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
    assert.equal((await runtime.invoke('app.snapshot') as { settings: { onboardingCompleted: boolean } }).settings.onboardingCompleted, false);
    const completedSettings = await runtime.invoke('app.onboarding.complete') as { onboardingCompleted: boolean };
    assert.equal(completedSettings.onboardingCompleted, true);
    const workspace = join(root, 'workspace');
    await runtime.invoke('app.settings', { workspace });

    // Privileged actions require explicit confirm: true
    await assert.rejects(() => runtime.invoke('setup.login', { provider: 'github' }), /confirmação explícita/);
    await assert.rejects(() => runtime.invoke('setup.cli', { tool: 'codex', operation: 'install' }), /confirmação explícita/);
    await assert.rejects(() => runtime.invoke('agents.start', { id: '00000000-0000-4000-8000-000000000000', provider: 'codex', prompt: 'oi' }), /confirmação explícita/);

    // External URL allowlist blocks arbitrary hosts and schemes
    await assert.rejects(() => runtime.invoke('app.external', { url: 'https://evil.example.com' }), /não autorizado/);
    await assert.rejects(() => runtime.invoke('app.external', { url: 'file:///etc/passwd' }), /não autorizado/);

    // Create project and test approval invalidation when file is modified
    const project = await runtime.invoke('projects.create', {
      title: 'Teste Segurança',
      kind: 'video',
      brief: 'Brief inicial',
    }) as Project;

    const img = join(root, 'arte.png');
    const gen = await capture('ffmpeg', ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=#112233:s=320x320:d=1', '-frames:v', '1', img]);
    assert.equal(gen.code, 0);

    let detail = await runtime.invoke('projects.importAsset', { id: project.id, path: img }) as ProjectDetail;
    const importedPath = detail.assets[0]!.path;

    detail = await runtime.invoke('projects.approve', { id: project.id, path: importedPath, approved: true }) as ProjectDetail;
    assert.equal(detail.assets[0]!.approved, true);

    // Tamper with the approved file on disk -> approval must auto-invalidate on next read
    await writeFile(importedPath, 'conteudo-alterado');
    detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.equal(detail.assets[0]!.approved, false);

    // Symlink inside project is rejected
    const outside = join(root, 'outside.png');
    await writeFile(outside, 'x');
    const linkPath = join(project.path, 'assets', 'imported', 'symlink.png');
    await symlink(outside, linkPath);
    await assert.rejects(() => runtime.invoke('projects.detail', { id: project.id }), /Link simbólico recusado|Links simbólicos não são permitidos/);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('PostNow derivation count rules match native accepted boundaries', () => {
  assert.equal(postNowFormatAcceptsPageCount('post-1x1', 1), true);
  assert.equal(postNowFormatAcceptsPageCount('story-9x16', 1), true);
  assert.equal(postNowFormatAcceptsPageCount('carousel-1x1', 2), false);
  assert.equal(postNowFormatAcceptsPageCount('carousel-1x1', 3), true);
  assert.equal(postNowFormatAcceptsPageCount('carousel-1x1', 10), true);
  assert.equal(postNowFormatAcceptsPageCount('carousel-1x1', 11), false);
  assert.equal(postNowFormatAcceptsPageCount('post-1x1', 3), false);
  assert.equal(postNowFormatAcceptsPageCount('reels', 1), false);
});

test('Projects use readable folder names and pass the name to the VideoGo storyboard', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-project-name-'));
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
    const workspace = join(root, 'workspace');
    await runtime.invoke('app.settings', { workspace });
    const projectsDirectory = join(workspace, 'projects');
    await mkdir(projectsDirectory, { recursive: true });
    const occupied = join(projectsDirectory, 'por-que-o-cafe-esta-caro');
    await mkdir(occupied);
    const sentinel = join(occupied, 'preservar.txt');
    await writeFile(sentinel, 'não sobrescrever');

    await assert.rejects(runtime.invoke('projects.create', {
      title: 'Brief inválido',
      kind: 'video',
      brief: 42,
    }));
    assert.equal((await readdir(projectsDirectory)).includes('brief-invalido'), false);
    const project = await runtime.invoke('projects.create', {
      title: 'Por que o café está caro?',
      kind: 'video',
      brief: 'Explicar o preço do café.',
    }) as Project;
    assert.equal(basename(project.path), 'por-que-o-cafe-esta-caro-2');
    assert.notEqual(project.id, basename(project.path));
    assert.equal(await readFile(sentinel, 'utf8'), 'não sobrescrever');

    const storyboard = JSON.parse(await readFile(join(project.path, 'storyboard.json'), 'utf8')) as { id: string; title: string };
    assert.equal(storyboard.id, basename(project.path));
    assert.equal(storyboard.title, project.title);

    const duplicate = await runtime.invoke('projects.create', {
      title: project.title,
      kind: 'video',
      brief: project.brief,
    }) as Project;
    assert.equal(basename(duplicate.path), 'por-que-o-cafe-esta-caro-3');
    assert.notEqual(duplicate.id, project.id);
    assert.equal((await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail).path, project.path);

    const source = join(root, 'projeto-importado');
    await mkdir(source);
    await writeFile(join(source, 'project.json'), JSON.stringify({
      schema_version: 1,
      type: 'post',
      title: 'Uma história de importação',
    }));
    const imported = await runtime.invoke('projects.import', { path: source }) as Project;
    assert.equal(basename(imported.path), 'uma-historia-de-importacao');
    const importedImageNative = JSON.parse(await readFile(join(imported.path, 'project.json'), 'utf8')) as { format?: string };
    assert.equal(importedImageNative.format, 'post-1x1');
    const videoSource = join(root, 'videogo-importado');
    await mkdir(videoSource);
    await writeFile(join(videoSource, 'storyboard.json'), JSON.stringify({
      schema: 'videogo.storyboard/v1',
      id: 'id-legado',
      title: 'Série importada para o VideoGo',
      scenes: [{ id: 'scene-1', visual: {} }],
    }));
    const importedVideo = await runtime.invoke('projects.import', { path: videoSource, kind: 'video' }) as Project;
    assert.equal(basename(importedVideo.path), 'serie-importada-para-o-videogo');
    const importedStoryboard = JSON.parse(await readFile(join(importedVideo.path, 'storyboard.json'), 'utf8')) as { id: string; title: string };
    assert.equal(importedStoryboard.id, basename(importedVideo.path));
    assert.equal(importedStoryboard.title, importedVideo.title);
    assert.equal(importedVideo.format, 'reels');
    assert.equal(importedStoryboard.format, 'reels');
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('narration provider switches preserve independent ElevenLabs and local voice identities', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-voice-switch-'));
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
    const project = await runtime.invoke('projects.create', { title: 'Troca de provedor', kind: 'video', brief: '' }) as Project;
    const initial = await runtime.invoke('projects.narration', { id: project.id }) as NarrationState;
    const scenes = initial.scenes.map(scene => ({ ...scene, narration: 'Olá.', spokenText: 'Olá.' }));
    const elevenLabs = await runtime.invoke('projects.narration.save', {
      id: project.id, provider: 'elevenlabs', voiceId: 'eleven-voice-one', scenes,
    }) as NarrationState;
    assert.equal(elevenLabs.voiceId, 'eleven-voice-one');
    const local = await runtime.invoke('projects.narration.save', {
      id: project.id, provider: 'local', localVoice: { engine: 'kokoro', modelId: 'kokoro-v1.0', voiceId: 'af_heart' }, scenes,
    }) as NarrationState;
    assert.equal(local.provider, 'local');
    assert.equal(local.voiceId, 'eleven-voice-one');
    assert.deepEqual(local.localVoice, { engine: 'kokoro', modelId: 'kokoro-v1.0', voiceId: 'af_heart' });
    const restored = await runtime.invoke('projects.narration', { id: project.id }) as NarrationState;
    assert.equal(restored.provider, 'local');
    assert.deepEqual(restored.localVoice, local.localVoice);
    const switchedBack = await runtime.invoke('projects.narration.save', {
      id: project.id, provider: 'elevenlabs', voiceId: 'eleven-voice-two', scenes,
    }) as NarrationState;
    assert.equal(switchedBack.provider, 'elevenlabs');
    assert.equal(switchedBack.voiceId, 'eleven-voice-two');
    assert.deepEqual(switchedBack.localVoice, local.localVoice);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('switching local narration to ElevenLabs regenerates without deleting local audio', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-local-to-eleven-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => String(input).includes('/v2/voices')
    ? new Response(JSON.stringify({ voices: [{ voice_id: 'voice-test', name: 'Teste PT-BR', category: 'professional' }], has_more: false }), { status: 200 })
    : new Response('{}', { status: 200 });
  const engine = join(root, 'engine');
  const cli = join(engine, 'dist', 'cli', 'index.js');
  await mkdir(join(engine, 'dist', 'cli'), { recursive: true });
  await writeFile(cli, `
const fs = require('node:fs');
const path = require('node:path');
if (process.argv.includes('--help')) {
  console.log('--generate-audio --voice --allow-paid');
} else {
  const input = process.argv[4];
  const storyboard = JSON.parse(fs.readFileSync(input, 'utf8'));
  const generationId = require('node:crypto').randomUUID();
  for (const scene of storyboard.scenes) {
    if (!String(scene.narration || '').trim()) continue;
    const assetPath = 'assets/audio/narration/' + generationId + '/' + scene.id + '.mp3';
    const output = path.join(path.dirname(input), assetPath);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, Buffer.from('new-eleven-audio'));
    scene.audio = { ...(scene.audio || {}), narration: { assetPath, startOffsetSeconds: 0, gain: 1 } };
  }
  fs.writeFileSync(input, JSON.stringify(storyboard));
}
`);
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/',
    secureStorageAvailable: () => true,
    encryptSecret: secret => `encrypted:${Buffer.from(secret).toString('base64')}`,
    decryptSecret: value => Buffer.from(value.replace(/^encrypted:/, ''), 'base64').toString('utf8'),
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    update: async () => ({ available: false, message: 'indisponível' }),
  }, () => undefined);
  try {
    await runtime.init();
    await runtime.invoke('elevenlabs.configure', { key: 'xi_test_voice_switch_secret' });
    await runtime.services.saveSettings({ workspace: join(root, 'workspace'), enginePaths: { videogo: engine } });
    const project = await runtime.invoke('projects.create', { title: 'Regenerar narração', kind: 'video', brief: '' }) as Project;
    const initial = await runtime.invoke('projects.narration', { id: project.id }) as NarrationState;
    const scenes = initial.scenes.map((scene, index) => ({ ...scene, narration: index === 0 ? 'Olá.' : '', spokenText: index === 0 ? 'Olá.' : '' }));
    const localVoice = { engine: 'kokoro' as const, modelId: 'kokoro-v1.0', voiceId: 'af_heart' };
    await runtime.invoke('projects.narration.save', { id: project.id, provider: 'local', localVoice, scenes });
    const sceneId = scenes[0]!.id;
    const oldAssetPath = `assets/audio/narration/local-existing/${sceneId}.mp3`;
    const oldAudio = Buffer.from('old-local-audio-bytes');
    await mkdir(join(project.path, 'assets', 'audio', 'narration', 'local-existing'), { recursive: true });
    await writeFile(join(project.path, oldAssetPath), oldAudio);
    const storyboardPath = join(project.path, 'storyboard.json');
    const storyboard = JSON.parse(await readFile(storyboardPath, 'utf8')) as { scenes: Array<{ id: string; audio?: Record<string, unknown> }> };
    const targetScene = storyboard.scenes.find(scene => scene.id === sceneId)!;
    targetScene.audio = { ...targetScene.audio, narration: { assetPath: oldAssetPath, startOffsetSeconds: 0, gain: 1 } };
    await writeFile(storyboardPath, JSON.stringify(storyboard));
    const recordPath = join(root, 'workspace', '.studio', 'projects', `${project.id}.json`);
    const record = JSON.parse(await readFile(recordPath, 'utf8')) as Record<string, unknown>;
    record.narrationAudio = {
      scenes: {
        [sceneId]: {
          assetPath: oldAssetPath, source: 'local',
          textHash: createHash('sha256').update(JSON.stringify({ narration: 'Olá.', spokenText: 'Olá.' })).digest('hex'),
          provenance: { schema: 1, provider: 'local', engine: 'kokoro', modelId: localVoice.modelId, voiceId: localVoice.voiceId },
        },
      },
    };
    await writeFile(recordPath, JSON.stringify(record));
    const localState = await runtime.invoke('projects.narration', { id: project.id }) as NarrationState;
    assert.equal(localState.scenes[0]!.audioAttached, true);
    assert.equal(localState.scenes[0]!.audioSource, 'local');
    const switched = await runtime.invoke('projects.narration.save', {
      id: project.id, provider: 'elevenlabs', voiceId: 'voice-test', scenes,
    }) as NarrationState;
    assert.equal(switched.scenes[0]!.audioAttached, false);
    assert.equal(switched.scenes[0]!.stray, true);
    assert.deepEqual(await readFile(join(project.path, oldAssetPath)), oldAudio);
    await runtime.invoke('projects.narration.approve', { id: project.id, approved: true });
    const job = await runtime.invoke('projects.narration.generate', { id: project.id, confirm: true }) as { id: string };
    assert.equal((await runtime.services.waitJob(job.id)).status, 'succeeded');
    const regenerated = await runtime.invoke('projects.narration', { id: project.id }) as NarrationState;
    assert.equal(regenerated.scenes[0]!.audioAttached, true);
    assert.equal(regenerated.scenes[0]!.audioSource, 'elevenlabs');
    assert.equal(regenerated.audioReady, true);
    assert.equal(regenerated.audioApproved, false);
    assert.deepEqual(await readFile(join(project.path, oldAssetPath)), oldAudio);
    const savedRecord = JSON.parse(await readFile(recordPath, 'utf8')) as { narrationAudio: { history?: Array<{ sceneId: string; assetPath: string; source: string }> } };
    assert.ok(savedRecord.narrationAudio.history?.some(entry => entry.sceneId === sceneId && entry.assetPath === oldAssetPath && entry.source === 'local'));
    const successfulStoryboard = await readFile(storyboardPath);
    const currentAudioPath = regenerated.scenes[0]!.audioPath!;
    const currentAudio = await readFile(join(project.path, currentAudioPath));
    const successfulRecord = await readFile(recordPath);
    await writeFile(cli, `
const fs = require('node:fs');
const path = require('node:path');
if (process.argv.includes('--help')) {
  console.log('--generate-audio --voice --allow-paid');
} else {
  const input = process.argv[4];
  const storyboard = JSON.parse(fs.readFileSync(input, 'utf8'));
  for (const scene of storyboard.scenes) {
    if (!String(scene.narration || '').trim()) continue;
    const output = path.join(path.dirname(input), 'assets', 'audio', 'narration', require('node:crypto').randomUUID(), scene.id + '.mp3');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, Buffer.from('partial replacement'));
  }
  process.exit(1);
}
`);
    const failedJob = await runtime.invoke('projects.narration.generate', { id: project.id, confirm: true }) as { id: string };
    assert.equal((await runtime.services.waitJob(failedJob.id)).status, 'failed');
    assert.deepEqual(await readFile(storyboardPath), successfulStoryboard);
    assert.deepEqual(await readFile(recordPath), successfulRecord);
    assert.deepEqual(await readFile(join(project.path, oldAssetPath)), oldAudio);
    assert.deepEqual(await readFile(join(project.path, currentAudioPath)), currentAudio);
  } finally {
    globalThis.fetch = originalFetch;
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('ElevenLabs armazena segredo criptografado e bloqueia geração paga antes de aprovar narração', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-elevenlabs-'));
  const originalFetch = globalThis.fetch;
  let synthesisRequests = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/v2/voices')) {
      return new Response(JSON.stringify({ voices: [{ voice_id: 'voice-test', name: 'Teste PT-BR', category: 'professional' }], has_more: false }), { status: 200 });
    }
    if (url.includes('/text-to-speech/')) synthesisRequests++;
    return new Response('{}', { status: 200 });
  };
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/',
    secureStorageAvailable: () => true,
    encryptSecret: secret => `encrypted:${Buffer.from(secret).toString('base64')}`,
    decryptSecret: value => Buffer.from(value.replace(/^encrypted:/, ''), 'base64').toString('utf8'),
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    update: async () => ({ available: false, message: 'indisponível' }),
  }, () => undefined);

  try {
    await runtime.init();
    const secret = 'xi_test_secret_value_123456';
    await runtime.invoke('elevenlabs.configure', { key: secret });
    await runtime.invoke('app.settings', { workspace: join(root, 'workspace') });
    const settings = await readFile(join(root, 'data', 'settings.json'), 'utf8');
    const encrypted = await readFile(join(root, 'data', 'elevenlabs.key'), 'utf8');
    assert.doesNotMatch(settings, /xi_test_secret_value_123456/);
    assert.doesNotMatch(encrypted, /xi_test_secret_value_123456/);
    assert.match(encrypted, /^encrypted:/);

    const project = await runtime.invoke('projects.create', { title: 'Narração aprovada primeiro', kind: 'video', brief: '' }) as Project;
    const state = await runtime.invoke('projects.narration', { id: project.id }) as {
      scenes: Array<{ id: string; title: string }>;
    };
    await runtime.invoke('projects.narration.save', {
      id: project.id,
      voiceId: 'voice-test',
      scenes: state.scenes.map(scene => ({ ...scene, narration: 'Olá, mundo.', spokenText: '[warm] Olá, mundo.' })),
    });
    await assert.rejects(
      () => runtime.invoke('projects.narration.generate', { id: project.id, confirm: true }),
      /aprove novamente|aprovação/
    );
    const approved = await runtime.invoke('projects.narration.approve', { id: project.id, approved: true }) as { approved: boolean; scenes: Array<{ id: string; title: string; narration: string; spokenText: string }> };
    assert.equal(approved.approved, true);
    await runtime.invoke('projects.narration.save', {
      id: project.id,
      voiceId: 'voice-test',
      scenes: approved.scenes.map(scene => ({ ...scene, narration: `${scene.narration} Alteração.` })),
    });
    await assert.rejects(
      () => runtime.invoke('projects.narration.generate', { id: project.id, confirm: true }),
      /mudou após a aprovação|aprove novamente/
    );
    const current = await runtime.invoke('projects.narration', { id: project.id }) as NarrationState;
    const hash = createHash('sha256').update(JSON.stringify({
      modelId: 'eleven_v4',
      voiceId: 'voice-test',
      scenes: current.scenes.map(({ id, narration, spokenText }) => ({ id, narration, spokenText })),
    })).digest('hex');
    const assetPathOf = (sceneId: string) => `assets/audio/narration/legado/${sceneId}.mp3`;
    const assetPaths = current.scenes.map(scene => assetPathOf(scene.id));
    await mkdir(join(project.path, 'assets', 'audio', 'narration', 'legado'), { recursive: true });
    await Promise.all(assetPaths.map(path => writeFile(join(project.path, path), 'fixture')));
    const storyboardPath = join(project.path, 'storyboard.json');
    const storyboard = JSON.parse(await readFile(storyboardPath, 'utf8')) as { scenes: { id: string; audio?: Record<string, unknown> }[] };
    await writeFile(storyboardPath, JSON.stringify({
      ...storyboard,
      scenes: storyboard.scenes.map(scene => ({ ...scene, audio: { ...scene.audio, narration: { assetPath: assetPathOf(scene.id), startOffsetSeconds: 0, gain: 1 } } })),
    }));
    const recordPath = join(root, 'workspace', '.studio', 'projects', `${project.id}.json`);
    const record = JSON.parse(await readFile(recordPath, 'utf8')) as Record<string, unknown>;
    record.narrationAudio = { hash, voiceId: 'voice-test', assetPaths };
    await writeFile(recordPath, JSON.stringify(record));
    const ready = await runtime.invoke('projects.narration', { id: project.id }) as NarrationState;
    assert.equal(ready.audioReady, true);
    const silent = await runtime.invoke('projects.narration.setMode', { id: project.id, mode: 'silent' }) as NarrationState;
    assert.equal(silent.mode, 'silent');
    assert.equal(silent.audioReady, true);
    const restored = await runtime.invoke('projects.narration.setMode', { id: project.id, mode: 'narrated' }) as NarrationState;
    assert.equal(restored.audioReady, true);
    await Promise.all(assetPaths.map(path => rm(join(project.path, path))));
    const missing = await runtime.invoke('projects.narration', { id: project.id }) as NarrationState;
    assert.equal(missing.audioReady, false);
    assert.equal(missing.audioApproved, false);
    assert.equal(synthesisRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('Runtime treats existing profiles without onboarding state as already configured', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-legacy-'));
  const dataDir = join(root, 'data');
  const workspace = join(root, 'workspace');
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'settings.json'), JSON.stringify({ workspace, provider: 'codex', enginePaths: {} }));
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
    await runtime.init();
    assert.equal((await runtime.invoke('app.snapshot') as { settings: { onboardingCompleted: boolean } }).settings.onboardingCompleted, true);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
test('deleting a rendered image removes its file, source image, and approval record', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-image-delete-'));
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
    const workspace = join(root, 'workspace');
    await runtime.invoke('app.settings', { workspace });
    const project = await runtime.invoke('projects.create', { title: 'Exclusão real', kind: 'image', format: 'post-1x1', brief: 'Teste de exclusão.' }) as Project;
    const fixture = join(root, 'fixture.png');
    const generated = await capture('ffmpeg', ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=#334455:s=1080x1080:d=1', '-frames:v', '1', fixture]);
    assert.equal(generated.code, 0);
    let detail = await runtime.invoke('projects.importAsset', { id: project.id, path: fixture }) as ProjectDetail;
    const batch = detail.batches?.[0];
    assert.ok(batch);
    assert.equal(batch.sourceCount, 1);
    const inputDirectory = join(project.path, 'generated', 'runs', batch.id, '.input');
    const [sourceName] = await readdir(inputDirectory);
    assert.ok(sourceName);
    const source = join(inputDirectory, sourceName);
    const output = join(project.path, 'generated', 'runs', batch.id, 'slide-01.png');
    await writeFile(output, await readFile(source));
    await writeFile(join(project.path, 'generated', 'runs', batch.id, '.mapping.json'), JSON.stringify({ pages: [{ page: 1, input: sourceName, output: 'slide-01.png' }] }));
    await writeFile(join(project.path, 'generated', 'runs', batch.id, '.status.json'), JSON.stringify({ state: 'ready', format: 'post-1x1', updatedAt: new Date().toISOString() }));
    detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    detail = await runtime.invoke('projects.approve', { id: project.id, path: output, approved: true }) as ProjectDetail;
    assert.equal(detail.assets.find(asset => asset.path === output)?.approved, true);
    detail = await runtime.invoke('projects.deleteAsset', { id: project.id, path: `generated/runs/${batch.id}/slide-01.png`, confirm: true }) as ProjectDetail;
    assert.equal(detail.assets.some(asset => asset.path === output), false);
    assert.equal(detail.batches?.find(item => item.id === batch.id)?.sourceCount, 0);
    assert.equal(detail.batches?.find(item => item.id === batch.id)?.status?.state, 'failed');
    await assert.rejects(readFile(output));
    await assert.rejects(readFile(source));
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('PostNow rejects SVG imports before creating an image batch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-svg-import-'));
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/',
    secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    decryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    pickFile: async () => undefined, openPath: async () => undefined,
    openExternal: async () => undefined, update: async () => ({ available: false, message: 'indisponível' }),
  }, () => undefined);
  try {
    await runtime.init();
    await runtime.invoke('app.settings', { workspace: join(root, 'workspace') });
    const project = await runtime.invoke('projects.create', { title: 'SVG recusado', kind: 'image', format: 'post-1x1' }) as Project;
    const svg = join(root, 'fixture.svg');
    await writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await assert.rejects(runtime.invoke('projects.importAsset', { id: project.id, path: svg }), /PostNow só aceita PNG, JPEG ou WebP/);
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.deepEqual(detail.batches, []);
    await assert.rejects(readdir(join(project.path, 'generated', 'runs')));
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('PostNow visual readiness blocks empty and placeholder native fields', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-postnow-fields-'));
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/',
    secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    decryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    pickFile: async () => undefined, openPath: async () => undefined,
    openExternal: async () => undefined, update: async () => ({ available: false, message: 'indisponível' }),
  }, () => undefined);
  try {
    await runtime.init();
    await runtime.invoke('app.settings', { workspace: join(root, 'workspace') });
    const project = await runtime.invoke('projects.create', { title: 'Campos nativos', kind: 'image', format: 'carousel-1x1' }) as Project;
    const path = join(project.path, 'project.json');
    const native = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    native.title = '';
    native.audience = '[PREENCHER]';
    native.objective = '[TODO]';
    native.promise = '[TODO]';
    native.cta = '[PREENCHER]';
    await writeFile(path, JSON.stringify(native));
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.equal(detail.visualReview?.ready, false);
    assert.ok(detail.visualReview?.blocking.some(item => item.includes('title')));
    assert.ok(detail.visualReview?.blocking.some(item => item.includes('audience')));
    assert.ok(detail.visualReview?.blocking.some(item => item.includes('objective')));
    assert.ok(detail.visualReview?.blocking.some(item => item.includes('promise')));
    assert.ok(detail.visualReview?.blocking.some(item => item.includes('cta')));
    await assert.rejects(runtime.invoke('projects.visual.approve', {
      id: project.id, approved: true, contentHash: detail.visualReview!.contentHash,
    }), /Ainda não é seguro aprovar a geração/);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('agent actions recover pending asset deletions before preparing work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-agent-delete-gate-'));
  const dataDir = join(root, 'data');
  const workspace = join(root, 'workspace');
  const runtime = new Runtime(dataDir, {
    assetPrefix: 'media://asset/', secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    decryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    pickFile: async () => undefined, openPath: async () => undefined,
    openExternal: async () => undefined, update: async () => ({ available: false, message: '' }),
  }, () => undefined);
  let runAttempts = 0;
  try {
    await runtime.init();
    await runtime.invoke('app.settings', { workspace });
    const project = await runtime.invoke('projects.create', { title: 'Proteção de exclusão', kind: 'image' }) as Project;
    const journalDirectory = await privateWorkspaceDirectory(dataDir, workspace, 'asset-deletions');
    const journalPath = join(journalDirectory, `${project.id}-${randomUUID()}.json`);
    await writeFile(journalPath, '{');
    runtime.services.capture = async () => ({ code: 1, stdout: '', stderr: '' });
    runtime.services.run = async () => { runAttempts++; throw new Error('A sessão não deve iniciar durante recuperação inválida.'); };
    await assert.rejects(runtime.invoke('agents.start', {
      id: project.id, provider: 'codex', prompt: 'Não iniciar durante recuperação.', confirm: true,
    }), /JSON corrompido/);
    await assert.rejects(runtime.invoke('agents.generateImages', {
      id: project.id, confirm: true,
    }), /JSON corrompido/);
    assert.equal(runAttempts, 0);
    assert.deepEqual(runtime.services.jobs(), []);
    assert.equal(await readFile(journalPath, 'utf8'), '{');
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('project listing recovers a partially completed asset deletion journal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-delete-recovery-'));
  const dataDir = join(root, 'data');
  const runtime = new Runtime(dataDir, {
    assetPrefix: 'media://asset/',
    secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    decryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    pickFile: async () => undefined, openPath: async () => undefined,
    openExternal: async () => undefined, update: async () => ({ available: false, message: 'indisponível' }),
  }, () => undefined);
  try {
    await runtime.init();
    const workspace = join(root, 'workspace');
    await runtime.invoke('app.settings', { workspace });
    const project = await runtime.invoke('projects.create', { title: 'Recuperação de exclusão', kind: 'image', format: 'post-1x1' }) as Project;
    const batchId = '1730000000000-a1b2c3d4';
    const run = join(project.path, 'generated', 'runs', batchId);
    const input = 'slide-01.png';
    const source = join(run, '.input', input);
    const output = join(run, 'slide-01.png');
    await mkdir(join(run, '.input'), { recursive: true });
    await writeFile(source, 'source');
    await writeFile(output, 'rendered');
    await writeFile(join(run, '.mapping.json'), JSON.stringify({ pages: [{ page: 1, input, output: 'slide-01.png' }] }));
    await writeFile(join(run, '.status.json'), JSON.stringify({ state: 'ready', format: 'post-1x1', updatedAt: new Date().toISOString() }));
    const recordPath = join(workspace, '.studio', 'projects', `${project.id}.json`);
    const record = JSON.parse(await readFile(recordPath, 'utf8')) as Record<string, unknown>;
    record.approvals = { [`generated/runs/${batchId}/slide-01.png`]: 'approved-stamp' };
    await writeFile(recordPath, JSON.stringify(record));
    const journalDirectory = await privateWorkspaceDirectory(dataDir, workspace, 'asset-deletions');
    const journalPath = join(journalDirectory, `${project.id}-${randomUUID()}.json`);
    await writeFile(journalPath, JSON.stringify({
      schema: 'maquina.asset-deletion/v1', projectId: project.id,
      assetKey: `generated/runs/${batchId}/slide-01.png`, batchId,
      page: { page: 1, input, output: 'slide-01.png' }, sourceFound: true,
      targets: [
        { scope: 'project', path: `generated/runs/${batchId}/slide-01.png` },
        { scope: 'project', path: `generated/runs/${batchId}/.input/${input}` },
      ],
    }));
    const legacyOutput = join(project.path, 'generated', 'legacy.png');
    await mkdir(join(project.path, 'generated'), { recursive: true });
    await writeFile(legacyOutput, 'keep');
    const legacyDirectory = join(workspace, '.studio', 'asset-deletions');
    await mkdir(legacyDirectory, { recursive: true });
    const legacyJournal = join(legacyDirectory, `${project.id}-${randomUUID()}.json`);
    await writeFile(legacyJournal, JSON.stringify({
      schema: 'maquina.asset-deletion/v1', projectId: project.id,
      assetKey: 'generated/legacy.png', sourceFound: false,
      targets: [{ scope: 'project', path: 'generated/legacy.png' }],
    }));
    // Simulate a crash after the rendered image was deleted but before source cleanup.
    await rm(output);
    await runtime.invoke('projects.list', {});
    await assert.rejects(readFile(source));
    await assert.rejects(readFile(output));
    assert.equal(await readFile(legacyOutput, 'utf8'), 'keep');
    assert.ok(await readFile(legacyJournal));
    if (process.platform !== 'win32') assert.equal((await stat(journalDirectory)).mode & 0o777, 0o700);
    assert.deepEqual(await readdir(journalDirectory), []);
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.equal(detail.batches?.find(batch => batch.id === batchId)?.status?.state, 'failed');
    const recoveredRecord = JSON.parse(await readFile(recordPath, 'utf8')) as Record<string, unknown>;
    assert.equal(Object.keys(recoveredRecord.approvals as Record<string, unknown>).length, 0);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('app.open accepts folders registered by a directory pick and rejects other folders outside the workspace and dataDir', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-test-'));
  const picked = join(root, 'picked');
  const outside = join(root, 'outside');
  await mkdir(picked);
  await mkdir(outside);
  const opened: string[] = [];
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/',
    secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    decryptSecret: () => { throw new Error('Secure storage unavailable in tests.'); },
    pickFile: async options => options?.directory ? picked : undefined,
    openPath: async path => { opened.push(path); },
    openExternal: async () => undefined,
    update: async () => ({ available: false, message: 'indisponível' }),
  }, () => undefined);

  try {
    await runtime.init();
    await runtime.invoke('app.settings', { workspace: join(root, 'workspace') });
    assert.equal(await runtime.invoke('app.pick', { directory: true }), picked);
    await runtime.invoke('app.open', { path: picked });
    assert.deepEqual(opened, [await realpath(picked)]);
    await assert.rejects(() => runtime.invoke('app.open', { path: outside }), /Pasta não autorizada\./);
    assert.deepEqual(opened, [await realpath(picked)]);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('roteiro draft preenchido fica disponível à edição e narração sem liberar render; modo silencioso preserva o documento', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-storyboard-'));
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
    const project = await runtime.invoke('projects.create', { title: 'Roteiro draft', kind: 'video', brief: 'Teste' }) as Project;
    const initial = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.equal(initial.storyboardAvailable, false);
    assert.equal(initial.storyboardCompositionReady, false);
    const path = join(project.path, 'storyboard.json');
    const data = JSON.parse(await readFile(path, 'utf8')) as { status: string; scenes: { id: string; narration: string; onScreen: string[]; visual: Record<string, unknown>; audio: Record<string, unknown> }[]; composition?: { path: string } };
    data.scenes[0]!.narration = 'Texto gerado pelo agente.';
    data.scenes[0]!.onScreen = ['Texto na tela'];
    data.scenes[0]!.audio.spokenText = '[calm] Texto gerado pelo agente.';
    data.scenes[0]!.audio.narration = { assetPath: 'assets/audio/narration/missing.wav', startOffsetSeconds: 0, gain: 1 };
    data.scenes[0]!.visual.assetPath = 'assets/visuals/generated/ainda-nao-gerada.png';
    data.composition = { path: '.videogo/composition' };
    const compositionDir = join(project.path, '.videogo', 'composition');
    await mkdir(compositionDir, { recursive: true });
    await writeFile(join(compositionDir, 'index.html'), '<!doctype html><html></html>');
    await writeFile(path, JSON.stringify(data));
    const original = await readFile(path, 'utf8');
    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    assert.equal(detail.storyboardAvailable, true);
    assert.equal(detail.storyboardReady, false);
    assert.equal(detail.storyboardCompositionReady, false, 'composição escrita fora de uma sessão do Opus não libera o render');
    const workspaceRoot = join(root, 'workspace');
    await serialized(workspaceRoot, () => recordVideoComposition(workspaceRoot, project.id, 'gpt-6-luna'));
    assert.equal((await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail).storyboardCompositionReady, false, 'outro modelo não conta');
    await serialized(workspaceRoot, () => recordVideoComposition(workspaceRoot, project.id, VIDEO_AGENT_MODEL));
    assert.equal((await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail).storyboardCompositionReady, true);
    await writeFile(join(compositionDir, 'index.html'), '<!doctype html><html><body>editado fora do Opus</body></html>');
    assert.equal((await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail).storyboardCompositionReady, false, 'edição depois da sessão invalida a autoria');
    const scenes = await runtime.invoke('projects.storyboard', { id: project.id }) as { scenes: { onScreen: string }[] };
    assert.equal(scenes.scenes[0]!.onScreen, 'Texto na tela');
    const narrated = await runtime.invoke('projects.narration', { id: project.id }) as NarrationState;
    assert.equal(narrated.mode, 'narrated');
    assert.equal(narrated.ready, false);
    assert.equal(narrated.scenes[0]!.stray, true);
    assert.equal(narrated.scenes[0]!.narration, 'Texto gerado pelo agente.');
    assert.equal(narrated.scenes[0]!.spokenText, '[calm] Texto gerado pelo agente.');
    const silent = await runtime.invoke('projects.narration.setMode', { id: project.id, mode: 'silent' }) as NarrationState;
    assert.equal(silent.mode, 'silent');
    assert.equal(silent.ready, true);
    assert.equal((await runtime.invoke('projects.narration', { id: project.id }) as NarrationState).mode, 'silent');
    assert.equal(await readFile(path, 'utf8'), original);
    await assert.rejects(runtime.invoke('projects.storyboard.approve', { id: project.id }), /Confirme/);
    assert.equal(await readFile(path, 'utf8'), original);
    assert.equal((await runtime.invoke('projects.narration.setMode', { id: project.id, mode: 'narrated' }) as NarrationState).ready, false);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
