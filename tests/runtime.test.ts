import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Runtime } from '../src/main/runtime.js';
import { capture } from '../src/main/supervisor.js';
import type { Project, ProjectDetail } from '../src/shared/contracts.js';

test('Runtime enforces consent, path containment, symlink rejection, and hash-bound approvals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-test-'));
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/',
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

test('Runtime treats existing profiles without onboarding state as already configured', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-legacy-'));
  const dataDir = join(root, 'data');
  const workspace = join(root, 'workspace');
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'settings.json'), JSON.stringify({ workspace, provider: 'codex', enginePaths: {} }));
  const runtime = new Runtime(dataDir, {
    assetPrefix: 'media://asset/',
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
