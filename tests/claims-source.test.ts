import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { Runtime } from '../src/main/runtime.js';
import type { Project, ProjectDetail } from '../src/shared/contracts.js';

test('claims with source as array of objects or object are extracted and do not block visual review', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-claims-source-'));
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/',
    secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('unavailable'); },
    decryptSecret: () => { throw new Error('unavailable'); },
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    update: async () => ({ available: false, message: '' }),
  }, () => undefined);

  try {
    await runtime.init();
    await runtime.saveSettings({ workspace: join(root, 'workspace') });
    const project = await runtime.invoke('projects.create', {
      title: 'Projeto Claims',
      kind: 'image',
      format: 'post-1x1',
      brief: 'Teste de claims.',
    }) as Project;

    // Overwrite claims.json with source as array of objects (like the user project had)
    const claimsJson = {
      reviewed: false,
      claims: [
        {
          id: 'claim-1',
          claim: 'O divórcio pode ser feito em cartório.',
          status: 'qualified',
          qualification: 'Depende de requisitos legais e ausência de litígio.',
          source: [
            {
              title: 'Lei nº 13.105/2015 — CPC art. 733',
              organization: 'Câmara dos Deputados',
              url: 'https://gov.br/lei-cpc',
            },
          ],
        },
      ],
    };
    await writeFile(join(project.path, 'research', 'claims.json'), JSON.stringify(claimsJson, null, 2));

    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    const blocking = detail.visualReview?.blocking ?? [];
    assert.ok(
      !blocking.some(b => b.includes('afirmação e fonte são obrigatórias')),
      `Expected source not to be blocked, but got: ${blocking.join(', ')}`
    );
    assert.equal(detail.visualReview?.claims.length, 1);
    assert.equal(detail.visualReview?.claims[0]?.source, 'Lei nº 13.105/2015 — CPC art. 733');
    assert.equal(detail.visualReview?.claims[0]?.sourceUrl, 'https://gov.br/lei-cpc');
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
