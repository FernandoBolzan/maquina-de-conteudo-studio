import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Project } from '../../shared/contracts.js';
import type { Services } from '../context.js';
import { readBatchStatus } from './postnow.js';
import { localPath, missing } from './storage.js';

async function existingFile(root: string, name: string): Promise<{ path: string; version: number } | undefined> {
  try {
    const path = await localPath(root, name);
    const info = await lstat(path);
    return info.isFile() ? { path, version: info.mtimeMs } : undefined;
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
}

/** Uses finished outputs only; references and source images are not project covers. */
export async function projectCoverUrl(project: Project, services: Services): Promise<string | undefined> {
  const root = project.path;
  let cover: { path: string; version: number } | undefined;
  if (project.kind === 'video') {
    const preferred = project.format === 'youtube' ? 'youtube' : project.format === 'feed-square' ? 'feed-square' : 'reels';
    for (const format of [preferred, ...['youtube', 'reels', 'feed-square'].filter(value => value !== preferred)]) {
      cover = await existingFile(root, `delivery/cover-${format}.png`);
      if (cover) break;
    }
  } else {
    const runs = await localPath(root, 'generated/runs');
    let names: string[] = [];
    try { names = await readdir(runs); } catch (error) { if (!missing(error)) throw error; }
    for (const name of names.filter(name => /^\d{13}-[a-f0-9]{8}$/.test(name)).sort().reverse()) {
      if ((await readBatchStatus(root, name))?.state !== 'ready') continue;
      cover = await existingFile(root, join('generated/runs', name, 'slide-01.png'));
      if (cover) break;
    }
    cover ??= await existingFile(root, 'generated/slide-01.png');
    cover ??= await existingFile(root, 'generated/slide-1.png');
  }
  return cover ? `${services.assetUrl(cover.path)}?v=${cover.version}` : undefined;
}
