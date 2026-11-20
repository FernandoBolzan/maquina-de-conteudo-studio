import { readdirSync } from 'node:fs';
import { win32 } from 'node:path';

type ListDirectory = (directory: string) => string[];

const list: ListDirectory = directory => {
  try { return readdirSync(directory); } catch { return []; }
};

/**
 * `%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe` e `python3.exe` existem em todo Windows 10/11 como atalhos da
 * Microsoft Store. Sem Python de verdade, executá-los (até com `--version`) abre a Microsoft Store. Com o Python da
 * Store instalado, o pacote `PythonSoftwareFoundation.Python.*` aparece na mesma pasta e o atalho passa a ser real.
 */
export function isWindowsStorePythonStub(file: string, platform: NodeJS.Platform = process.platform, listDirectory: ListDirectory = list): boolean {
  if (platform !== 'win32') return false;
  const normalized = win32.normalize(file);
  if (!/\\microsoft\\windowsapps\\python3?\.exe$/i.test(normalized)) return false;
  return !listDirectory(win32.dirname(normalized)).some(entry => /^pythonsoftwarefoundation\.python\./i.test(entry));
}

/**
 * Pastas onde o WinGet e os instaladores oficiais colocam as ferramentas. O PATH deste processo é fixado na abertura
 * do app: depois de instalar Python ou Git ele não os enxerga até reiniciar, então procuramos nos destinos conhecidos.
 */
export function windowsInstallDirectories(env: NodeJS.ProcessEnv = process.env, listDirectory: ListDirectory = list): string[] {
  const directories: string[] = [];
  const local = env.LOCALAPPDATA;
  const programFiles = [env.ProgramFiles, env['ProgramFiles(x86)']].filter((value): value is string => !!value);
  const pythonRoots = [local && win32.join(local, 'Programs', 'Python'), ...programFiles].filter((value): value is string => !!value);
  for (const root of pythonRoots) {
    const versions = listDirectory(root)
      .map(name => /^Python(\d)(\d+)$/i.exec(name))
      .filter((match): match is RegExpExecArray => !!match)
      .sort((a, b) => Number(b[1]) - Number(a[1]) || Number(b[2]) - Number(a[2]));
    for (const [name] of versions) directories.push(win32.join(root, name), win32.join(root, name, 'Scripts'));
  }
  if (local) directories.push(win32.join(local, 'Programs', 'Git', 'cmd'), win32.join(local, 'Programs', 'nodejs'), win32.join(local, 'Programs', 'GitHub CLI'));
  for (const root of programFiles) directories.push(win32.join(root, 'nodejs'), win32.join(root, 'Git', 'cmd'), win32.join(root, 'GitHub CLI'));
  return directories;
}

/**
 * Claude Code no Windows exige o `bash.exe` do Git for Windows e só o encontra sozinho quando o `git` está no PATH
 * do processo. Procura-o a partir do `git.exe` achado pelo Studio e dos destinos padrão do instalador.
 */
export function gitBashCandidates(gitExecutable: string | undefined, env: NodeJS.ProcessEnv = process.env): string[] {
  const roots: string[] = [];
  if (gitExecutable) {
    let directory = win32.dirname(gitExecutable);
    for (let level = 0; level < 3; level++) { roots.push(directory); directory = win32.dirname(directory); }
  }
  if (env.LOCALAPPDATA) roots.push(win32.join(env.LOCALAPPDATA, 'Programs', 'Git'));
  for (const root of [env.ProgramFiles, env['ProgramFiles(x86)']]) if (root) roots.push(win32.join(root, 'Git'));
  return [...new Set(roots.map(root => win32.join(root, 'bin', 'bash.exe')))];
}
