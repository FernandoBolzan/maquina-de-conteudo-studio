import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectCoverUrl } from '../src/main/content/project-cover.js';
import type { Services } from '../src/main/context.js';
import type { Project } from '../src/shared/contracts.js';

test('project covers select finished images and video cover matching the project format', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-cover-'));
  const project: Project = { id: 'project', title: 'Projeto', kind: 'image', createdAt: '', path: root, brief: '' };
  const services = { assetUrl: (path: string) => `media://asset/${encodeURIComponent(path)}` } as Services;
  try {
    assert.equal(await projectCoverUrl(project, services), undefined);
    for (const [id, state] of [['1700000000000-aaaaaaaa', 'ready'], ['1700000000001-bbbbbbbb', 'processing']] as const) {
      const run = join(root, 'generated', 'runs', id);
      await mkdir(run, { recursive: true });
      await writeFile(join(run, '.status.json'), JSON.stringify({ state, updatedAt: 'now' }));
      await writeFile(join(run, 'slide-01.png'), id);
    }
    assert.match(decodeURIComponent((await projectCoverUrl(project, services))!), /1700000000000-aaaaaaaa\/slide-01\.png/);
    await mkdir(join(root, 'delivery'));
    await writeFile(join(root, 'delivery', 'cover-reels.png'), 'reels');
    await writeFile(join(root, 'delivery', 'cover-youtube.png'), 'youtube');
    project.kind = 'video'; project.format = 'youtube';
    assert.match(decodeURIComponent((await projectCoverUrl(project, services))!), /cover-youtube\.png/);
    await rm(join(root, 'delivery', 'cover-youtube.png'));
    assert.match(decodeURIComponent((await projectCoverUrl(project, services))!), /cover-reels\.png/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
