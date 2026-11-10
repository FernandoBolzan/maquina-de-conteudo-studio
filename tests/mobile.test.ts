import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MobileAuthManager, generatePin, normalizePin, comparePinTimingSafe } from '../src/main/mobile/token.js';
import { MobileServer } from '../src/main/mobile/server.js';
import { generateTerminalQR, generateSvgQR, generateDataUrlQR } from '../src/main/mobile/qr.js';
import { Runtime } from '../src/main/runtime.js';
import { toolStatus, resolveTool } from '../src/main/setup/tools.js';
import type { AppEvent, Brand, Project } from '../src/shared/contracts.js';

test('MobileAuthManager generates valid 6-char PIN and validates correctly', () => {
  const pin = generatePin();
  assert.equal(pin.length, 6);
  // Must use only unambiguous alphanumeric characters (no 0, O, 1, I)
  assert.match(pin, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);

  // Normalization
  assert.equal(normalizePin('a-b 2 3 c 4'), 'AB23C4');
  assert.equal(comparePinTimingSafe('ab23c4', 'AB23C4'), true);
  assert.equal(comparePinTimingSafe('wrong1', 'AB23C4'), false);

  const auth = new MobileAuthManager('K8X2M9');
  assert.equal(auth.getPin(), 'K8X2M9');

  // Verify wrong pin
  const bad = auth.verify('WRONG1', '192.168.1.100');
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 401);

  // Verify correct pin
  const ok = auth.verify('k8x2m9', '192.168.1.100');
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(typeof ok.sessionToken, 'string');
    assert.equal(ok.sessionToken.length, 64);
    assert.equal(auth.validateSession(ok.sessionToken), true);
    assert.equal(auth.getActiveSessionsCount(), 1);

    auth.revokeSession(ok.sessionToken);
    assert.equal(auth.validateSession(ok.sessionToken), false);
    assert.equal(auth.getActiveSessionsCount(), 0);
  }
});

test('MobileAuthManager enforces rate limit after 5 failed attempts', () => {
  const auth = new MobileAuthManager('A7K9X2');
  const ip = '10.0.0.5';

  for (let i = 0; i < 4; i++) {
    const res = auth.verify('FAIL00', ip);
    assert.equal(res.ok, false);
    assert.equal(res.status, 401);
  }

  // 5th failed attempt triggers lockout
  const fifth = auth.verify('FAIL00', ip);
  assert.equal(fifth.ok, false);
  assert.equal(fifth.status, 429);

  // Subsequent attempt remains locked out
  const sixth = auth.verify('A7K9X2', ip);
  assert.equal(sixth.ok, false);
  assert.equal(sixth.status, 429);
});

test('QR code generators produce valid terminal and SVG outputs', async () => {
  const testUrl = 'https://fee-slide-slim.trycloudflare.com';
  const terminalQR = await generateTerminalQR(testUrl);
  assert.ok(terminalQR.length > 50);
  assert.ok(terminalQR.includes('█') || terminalQR.includes('▀') || terminalQR.includes('▄'));

  const svgQR = await generateSvgQR(testUrl);
  assert.ok(svgQR.includes('<svg'));
  assert.ok(svgQR.includes('</svg>'));

  const dataUrlQR = await generateDataUrlQR(testUrl);
  assert.ok(dataUrlQR.startsWith('data:image/png;base64,'));
});

test('MobileServer handles auth, serves SPA, streams media, and supports HTTP Range', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-mobile-test-'));
  const dataDir = join(root, 'data');
  const workspace = join(root, 'workspace');
  await mkdir(workspace, { recursive: true });

  const runtime = new Runtime(dataDir, {
    assetPrefix: '/api/media/',
    secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('unavailable'); },
    decryptSecret: () => { throw new Error('unavailable'); },
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    update: async () => ({ available: false, message: 'disabled' }),
  });

  await runtime.init();
  await runtime.invoke('app.settings', { workspace, provider: 'codex' });

  // Create a sample project with an asset
  const sampleFile = join(workspace, 'sample.txt');
  await writeFile(sampleFile, 'Hello from Mobile Test File! '.repeat(20));

  const project = (await runtime.invoke('projects.create', {
    title: 'Projeto Mobile Teste',
    kind: 'image',
    brief: 'Briefing para teste do painel mobile.',
  })) as Project;
  await runtime.invoke('projects.importAsset', { id: project.id, path: sampleFile });

  // Set known PIN
  runtime.mobile.authManager.setPin('M7K9X2');
  const port = await runtime.mobile.server.start(0); // auto-assign free port

  try {
    const baseUrl = `http://127.0.0.1:${port}`;

    // 1. GET / serves the mobile web app HTML
    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    assert.equal(htmlRes.headers.get('content-type')?.includes('text/html'), true);
    const htmlText = await htmlRes.text();
    assert.ok(htmlText.includes('Máquina Mobile'));
    assert.ok(htmlText.includes('Acesso Remoto'));
    assert.ok(htmlText.includes('detailStepBar'));
    assert.ok(htmlText.includes('detailStepShell'));
    assert.ok(htmlText.includes('createRecipe'));

    // 2. GET /api/qr.svg returns SVG
    const qrRes = await fetch(`${baseUrl}/api/qr.svg`);
    assert.equal(qrRes.status, 200);
    assert.equal(qrRes.headers.get('content-type')?.includes('image/svg+xml'), true);
    const qrSvg = await qrRes.text();
    assert.ok(qrSvg.includes('<svg'));

    // 3. GET /api/projects without auth returns 401
    const unauthProjects = await fetch(`${baseUrl}/api/projects`);
    assert.equal(unauthProjects.status, 401);

    // 4. POST /api/auth with wrong PIN fails
    const badAuth = await fetch(`${baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '000000' }),
    });
    assert.equal(badAuth.status, 401);

    // 5. POST /api/auth with correct PIN succeeds and returns sessionToken
    const goodAuth = await fetch(`${baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'M7K9X2' }),
    });
    assert.equal(goodAuth.status, 200);
    const authData = (await goodAuth.json()) as { ok: boolean; sessionToken: string };
    assert.equal(authData.ok, true);
    const sessionToken = authData.sessionToken;

    // 6. GET /api/status with auth returns full status
    const statusRes = await fetch(`${baseUrl}/api/status`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
    assert.equal(statusRes.status, 200);
    const statusData = (await statusRes.json()) as { authenticated: boolean; token?: string; workspace: string };
    assert.equal(statusData.authenticated, true);
    assert.equal(statusData.token, 'M7K9X2');

    // 7. GET /api/projects with session returns project list
    const projectsRes = await fetch(`${baseUrl}/api/projects`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
    assert.equal(projectsRes.status, 200);
    const projectsList = (await projectsRes.json()) as Project[];
    assert.equal(projectsList.length, 1);
    assert.equal(projectsList[0]?.id, project.id);

    // 8. GET /api/projects/:id returns detail with assets and computed journey
    const detailRes = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
    assert.equal(detailRes.status, 200);
    const detail = (await detailRes.json()) as {
      id: string;
      assets: Array<{ name: string; url: string }>;
      journey?: { steps: Array<{ id: string; title: string; status: string }>; nextStep: { id: string } };
    };
    assert.equal(detail.id, project.id);
    assert.ok(detail.assets.length > 0);
    assert.ok(detail.journey);
    assert.equal(detail.journey.steps.length, 5);
    assert.equal(detail.journey.steps[0]?.id, 'brief');
    assert.equal(detail.journey.steps[1]?.id, 'texts');
    assert.equal(detail.journey.steps[2]?.id, 'images');
    assert.equal(detail.journey.steps[3]?.id, 'review');
    assert.equal(detail.journey.steps[4]?.id, 'export');
    const assetUrl = detail.assets[0]!.url;
    assert.ok(assetUrl.startsWith('/api/media/'));
    // 9. Stream asset file via GET /api/media/:token
    const mediaRes = await fetch(`${baseUrl}${assetUrl}`);
    assert.equal(mediaRes.status, 200);
    const mediaText = await mediaRes.text();
    assert.ok(mediaText.startsWith('Hello from Mobile Test File!'));

    // 10. HTTP Range request for media (206 Partial Content)
    const rangeRes = await fetch(`${baseUrl}${assetUrl}`, {
      headers: { 'Range': 'bytes=0-10' },
    });
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get('content-range')?.startsWith('bytes 0-10/'), true);
    const partialText = await rangeRes.text();
    assert.equal(partialText.length, 11);
    assert.equal(partialText, 'Hello from ');
    // 11. POST /api/projects (Create new project from mobile)
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
      body: JSON.stringify({
        title: 'Novo Carrossel Mobile',
        kind: 'image',
        format: 'carousel-4x5',
        pageCount: 5,
        brief: 'Pauta de teste criada pelo celular',
      }),
    });
    assert.equal(createRes.status, 200);
    const createData = (await createRes.json()) as { ok: boolean; project: { id: string; title: string; kind: string } };
    assert.equal(createData.ok, true);
    assert.equal(createData.project.title, 'Novo Carrossel Mobile');
    assert.equal(createData.project.kind, 'image');

    // 12. GET /api/jobs (Check jobs list returned to mobile)
    const jobsRes = await fetch(`${baseUrl}/api/jobs`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
    assert.equal(jobsRes.status, 200);
    const jobsList = await jobsRes.json();
    assert.ok(Array.isArray(jobsList));
    // 12b. GET /api/prompt-recipes returns available templates
    const recipesRes = await fetch(`${baseUrl}/api/prompt-recipes`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
    assert.equal(recipesRes.status, 200);
    const recipes = (await recipesRes.json()) as Array<{ id: string; title: string; kind: string }>;
    assert.ok(Array.isArray(recipes));
    assert.ok(recipes.length > 0);
    assert.ok(recipes.some(r => r.id === 'curiosity-carousel'));

    // 12c. POST /api/projects/:id/action handles step actions (e.g. update-brief)
    const updateBriefRes = await fetch(`${baseUrl}/api/projects/${project.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
      body: JSON.stringify({ action: 'update-brief', brief: 'Nova pauta atualizada pelo celular' }),
    });
    assert.equal(updateBriefRes.status, 200);
    const updateBriefData = (await updateBriefRes.json()) as { ok: boolean; detail: { brief: string } };
    assert.equal(updateBriefData.ok, true);
    assert.equal(updateBriefData.detail.brief, 'Nova pauta atualizada pelo celular');

    // 12d. Verify updated project detail reflects saved brief
    const updatedDetailRes = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
    const updatedDetail = (await updatedDetailRes.json()) as { brief: string };
    assert.equal(updatedDetail.brief, 'Nova pauta atualizada pelo celular');

    // 13. POST /api/logout revokes session
    const logoutRes = await fetch(`${baseUrl}/api/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
    assert.equal(logoutRes.status, 200);

    const revokedCheck = await fetch(`${baseUrl}/api/projects`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
    assert.equal(revokedCheck.status, 401);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('cloudflared tool is recognized by toolStatus and searchDirectories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-cloudflared-test-'));
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/',
    secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('unavailable'); },
    decryptSecret: () => { throw new Error('unavailable'); },
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    update: async () => ({ available: false, message: 'disabled' }),
  });
  await runtime.init();

  try {
    const status = await toolStatus('cloudflared', runtime.services);
    assert.equal(status.id, 'cloudflared');
    assert.equal(status.name, 'Cloudflare Tunnel');
    // On this Linux machine, cloudflared is installed at /usr/local/bin/cloudflared
    if (status.installed) {
      assert.ok(status.version);
      assert.ok(status.detail?.includes('acesso remoto'));
    } else {
      assert.ok(status.detail?.includes('acesso remote') || status.detail?.includes('acesso remoto'));
    }
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
test('Mobile creation advances journey steps from brief to texts and images', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-mobile-journey-test-'));
  const dataDir = join(root, 'data');
  const workspace = join(root, 'workspace');
  await mkdir(workspace, { recursive: true });

  const runtime = new Runtime(dataDir, {
    assetPrefix: '/api/media/',
    secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('unavailable'); },
    decryptSecret: () => { throw new Error('unavailable'); },
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    update: async () => ({ available: false, message: 'disabled' }),
  });

  await runtime.init();
  await runtime.invoke('app.settings', { workspace, provider: 'codex' });

  runtime.mobile.authManager.setPin('A2B3C4');
  const port = await runtime.mobile.server.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Auth
    const authRes = await fetch(`${baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'A2B3C4' }),
    });
    const { sessionToken } = (await authRes.json()) as { sessionToken: string };
    assert.ok(sessionToken);
    const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2sAAAAASUVORK5CYII=', 'base64');
    const logoPath = join(root, 'logo.png');
    await writeFile(logoPath, ONE_PIXEL_PNG);
    const brand = (await runtime.invoke('brands.save', {
      name: 'Marca Mobile',
      tone: 'Claro e direto',
      colors: ['#F97316'],
      logo: logoPath,
    })) as Brand;

    // 1. Create project from mobile with brandId
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
      body: JSON.stringify({
        title: 'Carrossel — Hábitos Saudáveis',
        kind: 'image',
        format: 'carousel-1x1',
        pageCount: 3,
        brandId: brand.id,
        brief: 'Tema: 3 hábitos para manter o foco no trabalho.',
      }),
    });
    assert.equal(createRes.status, 200);
    const createData = (await createRes.json()) as { ok: boolean; project: { id: string } };
    assert.equal(createData.ok, true);
    const projectId = createData.project.id;

    const projectDetail = (await runtime.invoke('projects.detail', { id: projectId })) as { path: string };
    const projectJsonPath = join(projectDetail.path, 'project.json');
    const native = JSON.parse(await readFile(projectJsonPath, 'utf8')) as Record<string, unknown>;
    native.audience = 'Profissionais';
    native.promise = 'Mais foco no dia a dia';
    native.cta = 'Compartilhe este post';

    // Prepare claims file
    const claimsPath = join(projectDetail.path, 'research/claims.json');
    await writeFile(claimsPath, JSON.stringify({
      reviewed: false,
      claims: [{ id: 'claim-1', claim: 'Fato verificável', source: 'Estudo 2026', status: 'approved' }],
    }, null, 2));

    // 2. Initial journey: nextStep is 'texts'
    const detailRes1 = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
    const detail1 = (await detailRes1.json()) as {
      journey: { nextStep: { id: string; status: string }; steps: Array<{ id: string; status: string }> };
    };
    assert.equal(detail1.journey.nextStep.id, 'texts');
    assert.equal(detail1.journey.steps.find(s => s.id === 'brief')?.status, 'done');
    assert.equal(detail1.journey.steps.find(s => s.id === 'texts')?.status, 'current');

    // Initial pages prepared
    const initialPages = (native.pages as Record<string, unknown>[]).map((page, index) => {
      const headline = `Título da página ${index + 1}`;
      const copy = `Copy editorial da página ${index + 1}.`;
      const visual_function = index === 0 ? 'Capa com tipografia de destaque' : index === 2 ? 'Fechamento com checklist e chamada' : 'Card central explicativo';
      return { ...page, headline, copy, visual_function, depicted_person: 'none' };
    });
    native.pages = initialPages;
    await writeFile(projectJsonPath, `${JSON.stringify(native, null, 2)}\n`);
    for (const page of initialPages) {
      await writeFile(join(projectDetail.path, String(page.prompt_file)), `${page.headline}\n${page.copy}\nFunção visual: ${page.visual_function}\nArte oficial.\n`);
    }
    // 3. Save visual texts from mobile (updating headline)
    const updatedPages = [
      { page: 1, headline: 'Novo Título Capa', copy: 'Copy editorial da página 1.', depictedPerson: 'none' },
      { page: 2, headline: 'Título da página 2', copy: 'Copy editorial da página 2.', depictedPerson: 'none' },
      { page: 3, headline: 'Título da página 3', copy: 'Copy editorial da página 3.', depictedPerson: 'none' },
    ];
    const saveRes = await fetch(`${baseUrl}/api/projects/${projectId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
      body: JSON.stringify({ action: 'save-visual', pages: updatedPages }),
    });
    assert.equal(saveRes.status, 200);
    // 4. Retrieve detail with contentHash and approve texts
    const detailRes2 = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
    const detail2 = (await detailRes2.json()) as { visualReview: { contentHash: string; ready: boolean } };
    assert.ok(detail2.visualReview?.contentHash);

    const approveRes = await fetch(`${baseUrl}/api/projects/${projectId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
      body: JSON.stringify({ action: 'approve-visual', contentHash: detail2.visualReview.contentHash }),
    });
    assert.equal(approveRes.status, 200);
    const approveData = (await approveRes.json()) as { ok: boolean };
    assert.equal(approveData.ok, true);

    // 5. Journey now advances to 'images'!
    const detailRes3 = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
    const detail3 = (await detailRes3.json()) as {
      journey: { nextStep: { id: string; status: string }; steps: Array<{ id: string; status: string }> };
      visualReview: { approved: boolean };
    };
    assert.equal(detail3.visualReview.approved, true);
    assert.equal(detail3.journey.nextStep.id, 'images');
    assert.equal(detail3.journey.steps.find(s => s.id === 'texts')?.status, 'done');
    assert.equal(detail3.journey.steps.find(s => s.id === 'images')?.status, 'current');
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
