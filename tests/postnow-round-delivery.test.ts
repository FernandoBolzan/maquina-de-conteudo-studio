import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isRoundDelivered } from '../src/main/content/postnow.js';

const BATCH_ID = '1794081096157-9d053e34';

async function projectWithRound(status: { state: string; message?: string } | undefined, withMapping: boolean): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), 'round-delivery-'));
  const runPath = join(projectPath, 'generated', 'runs', BATCH_ID);
  await mkdir(runPath, { recursive: true });
  if (status) await writeFile(join(runPath, '.status.json'), JSON.stringify({ ...status, updatedAt: new Date().toISOString() }));
  if (withMapping) await writeFile(join(runPath, '.mapping.json'), JSON.stringify({ pages: [] }));
  return projectPath;
}

test('ready status without the app mapping does not deliver the round', async () => {
  const projectPath = await projectWithRound({ state: 'ready', message: 'Pronto.' }, false);
  try {
    assert.equal(await isRoundDelivered(projectPath, BATCH_ID), false);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('ready status with the app mapping delivers the round', async () => {
  const projectPath = await projectWithRound({ state: 'ready', message: '6 página(s) prontas para revisão.' }, true);
  try {
    assert.equal(await isRoundDelivered(projectPath, BATCH_ID), true);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('round without status is not delivered', async () => {
  const projectPath = await projectWithRound(undefined, false);
  try {
    assert.equal(await isRoundDelivered(projectPath, BATCH_ID), false);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('mapping with an unreadable status still delivers the round', async () => {
  const projectPath = await projectWithRound(undefined, true);
  await writeFile(join(projectPath, 'generated', 'runs', BATCH_ID, '.status.json'), '{"state":"ready"}\n');
  try {
    assert.equal(await isRoundDelivered(projectPath, BATCH_ID), true);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('mapping without any status still delivers the round', async () => {
  const projectPath = await projectWithRound(undefined, true);
  try {
    assert.equal(await isRoundDelivered(projectPath, BATCH_ID), true);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});
