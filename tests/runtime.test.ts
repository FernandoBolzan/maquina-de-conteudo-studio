import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Runtime } from '../src/main/runtime.js';
import { capture } from '../src/main/supervisor.js';
import type { NarrationState, Project, ProjectDetail } from '../src/shared/contracts.js';

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
      kind: 'image',
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
    const linkPath = join(project.path, 'generated', 'symlink.png');
    await symlink(outside, linkPath);
    await assert.rejects(() => runtime.invoke('projects.detail', { id: project.id }), /Link simbólico recusado|Links simbólicos não são permitidos/);
  } finally {
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
    const assetPath = 'assets/audio/narration/synthetic.mp3';
    const audioDirectory = join(project.path, 'assets', 'audio', 'narration');
    await mkdir(audioDirectory, { recursive: true });
    await writeFile(join(audioDirectory, 'synthetic.mp3'), 'fixture');
    const recordPath = join(root, 'workspace', '.studio', 'projects', `${project.id}.json`);
    const record = JSON.parse(await readFile(recordPath, 'utf8')) as Record<string, unknown>;
    record.narrationAudio = { hash, voiceId: 'voice-test', assetPaths: [assetPath] };
    await writeFile(recordPath, JSON.stringify(record));
    const ready = await runtime.invoke('projects.narration', { id: project.id }) as NarrationState;
    assert.equal(ready.audioReady, true);
    await rm(join(audioDirectory, 'synthetic.mp3'));
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
