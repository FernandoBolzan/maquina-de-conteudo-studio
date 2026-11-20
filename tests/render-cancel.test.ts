import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { discardIncompleteRender } from '../src/main/projects.js';
import { Supervisor } from '../src/main/supervisor.js';

test('discarding an unfinished render removes its own files and keeps other renders and the posters', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-render-cancel-'));
  try {
    const review = join(root, 'renders', 'review');
    await mkdir(review, { recursive: true });
    const unfinished = join(review, 'projeto-1794000000002-bbbbbbbb.mp4');
    const finished = join(review, 'projeto-1794000000001-aaaaaaaa.mp4');
    for (const name of [
      unfinished, `${unfinished}.storyboard-hash`, join(review, 'projeto-1794000000002-bbbbbbbb.videogo.json'),
      finished, `${finished}.storyboard-hash`, join(review, 'projeto-1794000000001-aaaaaaaa.videogo.json'), join(review, 'capa.png'),
    ]) await writeFile(name, 'x');

    await discardIncompleteRender(unfinished);
    assert.deepEqual((await readdir(review)).sort(), [
      'capa.png', 'projeto-1794000000001-aaaaaaaa.mp4', 'projeto-1794000000001-aaaaaaaa.mp4.storyboard-hash', 'projeto-1794000000001-aaaaaaaa.videogo.json',
    ]);
    await discardIncompleteRender(unfinished);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a cancelled render job reports cancelled, never succeeded, and stops its process', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mdc-render-cancel-job-'));
  const supervisor = new Supervisor(dataDir, () => undefined);
  try {
    const job = await supervisor.run({ title: 'Render longo', executable: process.execPath, args: ['-e', 'setTimeout(() => {}, 60000)'], cwd: dataDir, projectId: 'p1' });
    await supervisor.cancel(job.id);
    const finished = await supervisor.wait(job.id);
    assert.equal(finished.status, 'cancelled');
    assert.notEqual(finished.exitCode, 0);
    assert.equal(supervisor.list().some(item => item.status === 'running'), false);
  } finally {
    await supervisor.dispose();
    await rm(dataDir, { recursive: true, force: true });
  }
});
