import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { roundFormat } from '../src/main/content/postnow.js';

const BATCH_ID = '1794081096157-9d053e34';

async function projectWithRound(status: { state: string; format?: string; message?: string } | undefined): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), 'round-format-'));
  const runPath = join(projectPath, 'generated', 'runs', BATCH_ID);
  await mkdir(runPath, { recursive: true });
  if (status) await writeFile(join(runPath, '.status.json'), JSON.stringify({ ...status, updatedAt: new Date().toISOString() }));
  return projectPath;
}

test('imported round without status takes the current project format', async () => {
  const projectPath = await projectWithRound(undefined);
  try {
    assert.equal(await roundFormat(projectPath, BATCH_ID, 'post-1x1'), 'post-1x1');
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('round with a recorded format keeps it after the project changes format', async () => {
  const projectPath = await projectWithRound({ state: 'ready', format: 'carousel-4x3', message: 'Pronto.' });
  try {
    assert.equal(await roundFormat(projectPath, BATCH_ID, 'post-1x1'), 'carousel-4x3');
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('legacy status without format is not reinterpreted', async () => {
  const projectPath = await projectWithRound({ state: 'failed', message: 'Falhou.' });
  try {
    await assert.rejects(roundFormat(projectPath, BATCH_ID, 'post-1x1'), /não tem formato registrado/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('raw round cannot take a removed or missing project format', async () => {
  const projectPath = await projectWithRound(undefined);
  try {
    await assert.rejects(roundFormat(projectPath, BATCH_ID, 'reels'), /Formato removido ou ausente/);
    await assert.rejects(roundFormat(projectPath, BATCH_ID, undefined), /Formato removido ou ausente/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('unreadable status is refused instead of taking the project format', async () => {
  const projectPath = await projectWithRound(undefined);
  await writeFile(join(projectPath, 'generated', 'runs', BATCH_ID, '.status.json'), '{"state":"ready"}\n');
  try {
    await assert.rejects(roundFormat(projectPath, BATCH_ID, 'post-1x1'), /O estado desta rodada está ilegível/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});
