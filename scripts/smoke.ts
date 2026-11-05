import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { Runtime } from '../src/main/runtime.js';
import { capture } from '../src/main/supervisor.js';
import type { Brand, Project, ProjectDetail, SetupStatus, Snapshot } from '../src/shared/contracts.js';

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'mdc-smoke-'));
  const dataDir = join(root, 'data');
  const workspace = join(root, 'workspace');
  const exportDir = join(root, 'exports');
  let runtime: Runtime | undefined;
  try {
    await writeFile(join(root, 'dummy.txt'), 'ok');
    const events: string[] = [];
    runtime = new Runtime(dataDir, {
      assetPrefix: 'media://asset/',
      pickFile: async () => undefined,
      openPath: async () => undefined,
      openExternal: async () => undefined,
      update: async () => ({ available: false, message: 'Canal de releases não configurado.' }),
    }, event => { events.push(event.type); });
    await runtime.init();
    await runtime.invoke('app.settings', { workspace, provider: 'codex' });

    const status = await runtime.invoke('setup.status') as SetupStatus;
    assert.ok(status.tools.some(t => t.id === 'node' && t.installed), 'Node deve ser detectado no setup.status');
    assert.ok(status.tools.some(t => t.id === 'ffmpeg' && t.installed), 'FFmpeg deve ser detectado no setup.status');

    // Generate two real PNG images with FFmpeg
    const logoPng = join(root, 'logo.png');
    const slidePng = join(root, 'slide-1.png');
    const ff1 = await capture('ffmpeg', ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=#173323:s=256x256:d=1', '-frames:v', '1', logoPng]);
    assert.equal(ff1.code, 0, `Falha ao gerar logo PNG: ${ff1.stderr}`);
    const ff2 = await capture('ffmpeg', ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=#26322d:s=1080x1350:d=1', '-frames:v', '1', slidePng]);
    assert.equal(ff2.code, 0, `Falha ao gerar slide PNG: ${ff2.stderr}`);
    const brandbookPdf = join(root, 'brandbook-horizonte.pdf');
    await writeFile(brandbookPdf, '%PDF-1.4\n% Manual da Marca Clínica Horizonte\n');
    const brand = await runtime.invoke('brands.save', {
      name: 'Clínica Horizonte',
      tone: 'Direto, acolhedor e técnico.',
      colors: ['#F97316', '#121110'],
      logo: logoPng,
      references: [
        { name: 'referencia-estilo.png', path: slidePng },
        { name: 'brandbook-horizonte.pdf', path: brandbookPdf },
      ],
    }) as Brand;
    assert.ok(brand.id && brand.logo && brand.logoUrl);
    assert.equal(brand.references.length, 2);
    const imageProject = await runtime.invoke('projects.create', {
      title: 'Campanha Bruxismo',
      kind: 'image',
      brandId: brand.id,
      brief: 'Explicar 3 sinais claros de bruxismo.',
    }) as Project;
    assert.equal(imageProject.kind, 'image');

    await runtime.invoke('projects.notes', {
      id: imageProject.id,
      notes: 'Priorizar contraste alto na capa.',
      brief: 'Explicar 3 sinais claros de bruxismo com CTA final.',
    });

    let detail = await runtime.invoke('projects.importAsset', {
      id: imageProject.id,
      path: slidePng,
    }) as ProjectDetail;
    const importedImage = detail.assets.find(a => a.kind === 'image');
    assert.ok(importedImage, 'Imagem importada deve estar presente');
    const assetPath = importedImage.path;

    detail = await runtime.invoke('projects.approve', {
      id: imageProject.id,
      path: assetPath,
      approved: true,
    }) as ProjectDetail;
    assert.equal(detail.assets.find(a => a.path === assetPath)?.approved, true);

    const exportedPath = await runtime.invoke('projects.export', {
      id: imageProject.id,
      destination: exportDir,
    }) as string;
    const manifest = JSON.parse(await readFile(join(exportedPath, 'MANIFEST.json'), 'utf8')) as { artifacts: unknown[] };
    assert.equal(manifest.artifacts.length, 1);

    // Bridge image -> video using real FFmpeg
    const derivedVideo = await runtime.invoke('projects.bridge', {
      id: imageProject.id,
      kind: 'video',
    }) as Project;
    assert.equal(derivedVideo.kind, 'video');
    assert.equal(derivedVideo.sourceProjectId, imageProject.id);
    const videoDetail = await runtime.invoke('projects.detail', { id: derivedVideo.id }) as ProjectDetail;
    assert.ok(videoDetail.assets.some(a => a.kind === 'video' && a.name.endsWith('derived.mp4')), 'Vídeo derivado MP4 deve existir');

    // Bridge video -> image using real FFmpeg
    const derivedImage = await runtime.invoke('projects.bridge', {
      id: derivedVideo.id,
      kind: 'image',
    }) as Project;
    assert.equal(derivedImage.kind, 'image');
    const derivedImageDetail = await runtime.invoke('projects.detail', { id: derivedImage.id }) as ProjectDetail;
    assert.ok(derivedImageDetail.assets.some(a => a.kind === 'image' && a.name.endsWith('.png')), 'Quadro PNG extraído deve existir');

    // Unprepared PostNow checkout without .venv/Pillow must be rejected by health check
    const postnowSibling = resolve(process.cwd(), '../PostNow');
    await assert.rejects(() => runtime!.invoke('setup.link', { engine: 'postnow', path: postnowSibling, confirm: true }), /PostNow falhou no diagnóstico/);

    // Link built VideoGo and Orquestrador Maestro installations and verify health checks pass
    const videogoSibling = resolve(process.cwd(), '../VideoGo');
    await runtime.invoke('setup.link', { engine: 'videogo', path: videogoSibling, confirm: true });
    const maestroGlobal = '/usr/local/lib/node_modules/@iapro/orquestrador-maestro-cli';
    await runtime.invoke('setup.link', { engine: 'maestro', path: maestroGlobal, confirm: true });

    // Exercise interactive PTY job, resize, input, and cancellation
    const interactiveJob = await runtime.services.run({
      title: 'PTY interativo de teste',
      executable: process.execPath,
      args: ['-e', 'process.stdin.on("data", d => { process.stdout.write("ECHO:" + d.toString()); }); setInterval(() => {}, 1000);'],
      interactive: true,
    });
    await runtime.invoke('jobs.resize', { id: interactiveJob.id, cols: 110, rows: 30 });
    await runtime.invoke('jobs.input', { id: interactiveJob.id, data: 'ola\n' });
    await delay(250);
    await runtime.invoke('jobs.cancel', { id: interactiveJob.id });
    const finished = await runtime.services.waitJob(interactiveJob.id);
    assert.equal(finished.status, 'cancelled');
    assert.ok(finished.log.includes('ECHO:ola'), 'Saída do PTY deve registrar dados enviados');

    const snap = await runtime.invoke('app.snapshot') as Snapshot;
    assert.equal(snap.projects.length, 3);
    assert.equal(snap.brands.length, 1);
    assert.ok(events.length > 0);
    console.log(JSON.stringify({
      ok: true,
      projects: snap.projects.length,
      brands: snap.brands.length,
      videoAssets: videoDetail.assets.map(a => a.name),
      imageAssets: derivedImageDetail.assets.map(a => a.name),
      enginesLinked: snap.settings.enginePaths,
      ptyCancelled: finished.status,
    }, null, 2));
  } finally {
    await runtime?.dispose();
    await rm(root, { recursive: true, force: true });
  }
}

await main();
