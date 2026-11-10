import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { initializeNative } from '../src/main/content/native.js';
import type { Project } from '../src/shared/contracts.js';

async function pendingBriefPoints(brief: string, format?: Project['format']): Promise<string[]> {
  const root = await mkdtemp(join(tmpdir(), 'mdc-brief-pending-'));
  try {
    const project: Project = { id: 'brief-pending', title: 'Série de teste', kind: 'video', format, brief, createdAt: new Date().toISOString(), path: join(root, 'projeto') };
    await initializeNative(project);
    const document = await readFile(join(project.path, 'planning/brief.md'), 'utf8');
    const list = document.match(/não define: (.+)\.\n/)?.[1] ?? '';
    return list.split(/, | e /);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('audience and format already defined in the briefing are not listed as pending', async () => {
  const points = await pendingBriefPoints('Tema: Dicas de guarda\nPúblico: mães de adolescentes\nFormato: Reels (reels)', 'reels');
  assert.equal(points.includes('público'), false);
  assert.equal(points.includes('formato'), false);
  assert.equal(points.includes('fontes'), true);
});

test('audience missing from the briefing is still listed as pending', async () => {
  const points = await pendingBriefPoints('Tema: Dicas de guarda', 'reels');
  assert.equal(points.includes('público'), true);
  assert.equal(points.includes('formato'), false);
});

test('format is listed as pending only when the project has none', async () => {
  const points = await pendingBriefPoints('Tema: Dicas de guarda\nPúblico: mães de adolescentes');
  assert.equal(points.includes('formato'), true);
  assert.equal(points.includes('público'), false);
});
