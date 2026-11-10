import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { Runtime } from '../src/main/runtime.js';
import { capture } from '../src/main/supervisor.js';
import type { Brand, Project, ProjectDetail, SetupStatus, Snapshot } from '../src/shared/contracts.js';

function smokePath(name: string, fallback?: string): string {
  const configured = process.env[name]?.trim();
  if (configured) return resolve(configured);
  if (fallback) return resolve(fallback);
  throw new Error(`Defina ${name} com o caminho necessário para executar o smoke.`);
}

async function main(): Promise<void> {
  const postnowPath = smokePath('MDC_SMOKE_POSTNOW', '../PostNow');
  const videogoPath = smokePath('MDC_SMOKE_VIDEOGO', '../VideoGo');
  const maestroFallback = process.platform === 'linux' ? '/usr/local/lib/node_modules/@iapro/orquestrador-maestro-cli' : undefined;
  const maestroPath = smokePath('MDC_SMOKE_MAESTRO', maestroFallback);
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
      secureStorageAvailable: () => false,
      encryptSecret: () => { throw new Error('Secure storage unavailable in smoke tests.'); },
      decryptSecret: () => { throw new Error('Secure storage unavailable in smoke tests.'); },
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
    const ff2 = await capture('ffmpeg', ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=#26322d:s=1080x1080:d=1', '-frames:v', '1', slidePng]);
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
      format: 'post-1x1',
      brandId: brand.id,
      brief: 'Post único com informação clara sobre bruxismo.',
    }) as Project;
    assert.equal(imageProject.kind, 'image');

    await runtime.invoke('projects.notes', {
      id: imageProject.id,
      notes: 'Priorizar contraste alto e leitura rápida.',
      brief: 'Explicar um sinal de bruxismo com orientação responsável.',
    });
    const projectJsonPath = join(imageProject.path, 'project.json');
    const native = JSON.parse(await readFile(projectJsonPath, 'utf8')) as Record<string, unknown>;
    const page = (native.pages as Record<string, unknown>[])[0]!;
    const copy = 'Dor na mandíbula ao acordar merece atenção.';
    const visualFunction = 'Mostrar uma pessoa percebendo desconforto na mandíbula ao despertar.';
    native.audience = 'Pessoas adultas com desconforto ao acordar.';
    native.page_count_approved = true;
    native.pages = [{ ...page, headline: 'Acorda com dor?', copy, visual_function: visualFunction, depicted_person: 'other_person' }];
    await writeFile(projectJsonPath, `${JSON.stringify(native, null, 2)}\n`);
    await writeFile(join(imageProject.path, String(page.prompt_file)), `Copy: ${copy}\nFunção visual: ${visualFunction}\nComposição editorial refinada, contraste alto, texto legível e margens seguras.\n`);
    await writeFile(join(imageProject.path, 'storyboard.md'), `# ${imageProject.title}\n\n${imageProject.brief}\n`);
    await writeFile(join(imageProject.path, 'research', 'claims.json'), `${JSON.stringify({
      reviewed: false,
      claims: [{ id: 'smoke-claim', claim: 'Dor mandibular pode estar associada ao bruxismo.', source: 'Fonte clínica de teste', source_url: 'https://example.org/bruxismo', status: 'approved' }],
    }, null, 2)}\n`);
    let detail = await runtime.invoke('projects.detail', { id: imageProject.id }) as ProjectDetail;
    assert.equal(detail.visualReview?.ready, true, detail.visualReview?.blocking.join(' '));
    detail = await runtime.invoke('projects.visual.approve', {
      id: imageProject.id,
      approved: true,
      contentHash: detail.visualReview!.contentHash,
    }) as ProjectDetail;
    assert.equal(detail.visualReview?.approved, true);

    detail = await runtime.invoke('projects.importAsset', { id: imageProject.id, path: slidePng }) as ProjectDetail;
    const inputBatch = detail.batches?.[0];
    assert.ok(inputBatch, 'A importação deve criar uma rodada PostNow');
    assert.equal(inputBatch.sourceCount, 1, 'Imagem importada deve permanecer como entrada de uma rodada');

    await runtime.invoke('setup.link', { engine: 'postnow', path: postnowPath, confirm: true });
    const postnowJob = await runtime.invoke('projects.render', { id: imageProject.id, batchId: inputBatch.id, logoPolicy: 'cover-closing' }) as { id: string };
    const postnowResult = await runtime.services.waitJob(postnowJob.id);
    assert.equal(postnowResult.status, 'succeeded', postnowResult.log);
    detail = await runtime.invoke('projects.detail', { id: imageProject.id }) as ProjectDetail;
    const postnowBatch = detail.batches?.find(batch => batch.id === inputBatch.id);
    assert.equal(postnowBatch?.status?.state, 'ready', postnowBatch?.status?.message);
    assert.equal(postnowBatch?.sourceCount, 1);
    assert.equal(postnowBatch?.assets.length, 1);
    const postnowAsset = postnowBatch!.assets[0]!;
    const imageInfo = await capture('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', postnowAsset.path]);
    assert.equal(imageInfo.code, 0, imageInfo.stderr);
    assert.equal(imageInfo.stdout.trim(), '1080,1080');
    assert.notDeepEqual(await readFile(postnowAsset.path), await readFile(slidePng), 'PostNow deve conformar a imagem e aplicar a logo em vez de copiar a entrada.');
    detail = await runtime.invoke('projects.approve', { id: imageProject.id, path: postnowAsset.name, approved: true }) as ProjectDetail;
    assert.equal(detail.assets.find(asset => asset.name === postnowAsset.name)?.approved, true);

    const exportedPath = await runtime.invoke('projects.export', {
      id: imageProject.id,
      destination: exportDir,
    }) as string;
    const manifest = JSON.parse(await readFile(join(exportedPath, 'MANIFEST.json'), 'utf8')) as { artifacts: unknown[] };
    assert.equal(manifest.artifacts.length, 1);


    const derivedVideo = await runtime.invoke('projects.bridge', {
      id: imageProject.id,
      kind: 'video',
      format: 'feed-square',
      batchId: postnowBatch!.id,
    }) as Project;
    assert.equal(derivedVideo.kind, 'video');
    assert.equal(derivedVideo.sourceProjectId, imageProject.id);
    let videoDetail = await runtime.invoke('projects.detail', { id: derivedVideo.id }) as ProjectDetail;
    assert.equal(videoDetail.assets.some(a => a.kind === 'video'), false, 'Derivação não deve iniciar render automaticamente');
    await runtime.invoke('setup.link', { engine: 'videogo', path: videogoPath, confirm: true });
    await runtime.invoke('setup.link', { engine: 'maestro', path: maestroPath, confirm: true });
    await runtime.invoke('projects.narration.setMode', { id: derivedVideo.id, mode: 'silent' });
    const renderJob = await runtime.invoke('projects.render', { id: derivedVideo.id }) as { id: string };
    const renderResult = await runtime.services.waitJob(renderJob.id);
    assert.equal(renderResult.status, 'succeeded', renderResult.log);
    videoDetail = await runtime.invoke('projects.detail', { id: derivedVideo.id }) as ProjectDetail;
    assert.ok(videoDetail.assets.some(a => a.kind === 'video' && a.name.endsWith('.mp4')), 'Render explícito VideoGo deve gerar MP4');
    const renderedVideo = videoDetail.assets.find(a => a.kind === 'video' && a.name.endsWith('.mp4'))!;
    await runtime.invoke('projects.approve', { id: derivedVideo.id, path: renderedVideo.path, approved: true });

    // Video -> image uses FFmpeg to extract an input frame, never a final PostNow output.
    const derivedImage = await runtime.invoke('projects.bridge', {
      id: derivedVideo.id,
      kind: 'image',
    }) as Project;
    assert.equal(derivedImage.kind, 'image');
    const derivedImageDetail = await runtime.invoke('projects.detail', { id: derivedImage.id }) as ProjectDetail;
    assert.equal(derivedImageDetail.batches?.[0]?.sourceCount, 1, 'Quadro PNG extraído deve entrar como fonte de uma rodada PostNow');

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
