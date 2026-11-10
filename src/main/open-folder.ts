import { spawn } from 'node:child_process';

export interface OpenFolderOptions {
  platform?: NodeJS.Platform;
  command?: string;
  openPath?: (path: string) => Promise<string>;
}

// shell.openPath blocks the Electron main thread on Linux while xdg-open runs, so Linux
// launches the opener detached and resolves once the process has started.
export async function openFolder(path: string, options: OpenFolderOptions = {}): Promise<void> {
  const platform = options.platform ?? process.platform;
  if (platform === 'linux') return spawnOpener(options.command ?? 'xdg-open', path);
  const openPath = options.openPath ?? defaultOpenPath;
  const error = await openPath(path);
  if (error) throw new Error(error);
}

function spawnOpener(command: string, path: string): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const child = spawn(command, [path], { detached: true, stdio: 'ignore' });
  child.once('error', error => reject(new Error(`Não foi possível abrir a pasta: ${error.message}`)));
  child.once('spawn', () => {
    child.unref();
    resolve();
  });
  return promise;
}

// Loaded lazily: 'electron' is only importable inside the Electron runtime, so tests and tsx can load this module without it.
async function defaultOpenPath(path: string): Promise<string> {
  const { shell } = await import('electron');
  return shell.openPath(path);
}
