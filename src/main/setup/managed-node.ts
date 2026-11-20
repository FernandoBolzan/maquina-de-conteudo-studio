import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Services } from '../context.js';

const NODE_DIST = 'https://nodejs.org/dist';

export function nodeArchiveName(version: string, arch: string): string {
  if (!/^v22\.\d+\.\d+$/.test(version)) throw new Error('Versão Node.js inválida para instalação privada.');
  if (arch !== 'x64' && arch !== 'arm64') throw new Error(`Node.js privado não suporta arquitetura Linux ${arch}.`);
  return `node-${version}-linux-${arch}.tar.xz`;
}

export function nodeArchiveSha256(manifest: string, archive: string): string {
  for (const line of manifest.split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/.exec(line.trim());
    if (match?.[2] === archive) return match[1]!;
  }
  throw new Error('O manifesto oficial não contém o checksum do pacote Node.js esperado.');
}

export function selectNodeVersion(metadata: unknown, major: number, minimumMinor: number): string | undefined {
  if (!Array.isArray(metadata)) return undefined;
  return metadata
    .filter((item): item is { version: string; lts: string | false } => !!item && typeof item === 'object' && 'version' in item && typeof item.version === 'string' && 'lts' in item && (typeof item.lts === 'string' || item.lts === false))
    .map(item => item.version)
    .find(candidate => {
      const match = new RegExp(`^v${major}\\.(\\d+)\\.(\\d+)$`).exec(candidate);
      return !!match && Number(match[1]) >= minimumMinor;
    });
}

async function getOfficial(url: string, timeoutMs: number): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
  if (!response.ok) throw new Error(`Download oficial Node.js falhou (HTTP ${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

/** Instala Node.js 22 em diretório privado quando o Linux fornece uma versão antiga, sem substituir a global. */
export async function ensureManagedLinuxNode(major: number, minor: number, services: Services): Promise<string> {
  if (process.platform !== 'linux') throw new Error('A instalação privada de Node.js está disponível apenas no Linux.');
  const arch = process.arch;
  if (arch !== 'x64' && arch !== 'arm64') throw new Error(`Não há pacote oficial de Node.js 22 para Linux ${arch}.`);
  const metadata = JSON.parse((await getOfficial(`${NODE_DIST}/index.json`, 30_000)).toString('utf8')) as unknown;
  const version = selectNodeVersion(metadata, major, minor);
  if (!version) throw new Error(`Node.js ${major}.${minor}+ estável não foi encontrado no índice oficial.`);
  const archive = nodeArchiveName(version, arch);
  const [archiveBytes, checksumBytes] = await Promise.all([
    getOfficial(`${NODE_DIST}/${version}/${archive}`, 120_000),
    getOfficial(`${NODE_DIST}/${version}/SHASUMS256.txt`, 30_000),
  ]);
  const expected = nodeArchiveSha256(checksumBytes.toString('utf8'), archive);
  const actual = createHash('sha256').update(archiveBytes).digest('hex');
  if (actual !== expected) throw new Error('Checksum SHA-256 do pacote Node.js inválido; pacote descartado.');

  const parent = join(services.dataDir, 'runtime', 'tools', 'node');
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(parent, '.managed-staging-'));
  const unpacked = join(staging, 'unpacked');
  const archivePath = join(staging, archive);
  const target = join(parent, 'managed');
  const previous = join(parent, '.managed-previous');
  let oldMoved = false;
  let newMoved = false;
  try {
    await writeFile(archivePath, archiveBytes, { mode: 0o600, flag: 'wx' });
    await mkdir(unpacked, { mode: 0o700 });
    const tar = await services.capture('tar', ['-xJf', archivePath, '-C', unpacked, '--strip-components=1'], { timeoutMs: 120_000 });
    if (tar.code !== 0) throw new Error(`Não foi possível extrair Node.js: ${tar.stderr.trim() || 'tar falhou'}`);
    const stagedNode = join(unpacked, 'bin', 'node');
    const stagedVersion = await services.capture(stagedNode, ['--version'], { timeoutMs: 15_000 });
    if (stagedVersion.code !== 0 || stagedVersion.stdout.trim() !== version) throw new Error('O Node.js baixado não passou no teste de versão; a instalação anterior foi preservada.');

    await rm(previous, { recursive: true, force: true });
    try { await rename(target, previous); oldMoved = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await rename(unpacked, target); newMoved = true;
    const installed = await services.capture(join(target, 'bin', 'node'), ['--version'], { timeoutMs: 15_000 });
    if (installed.code !== 0 || installed.stdout.trim() !== version) throw new Error('A instalação privada do Node.js falhou no teste após ativação.');
    await rm(previous, { recursive: true, force: true }).catch(() => undefined);
    return join(target, 'bin', 'node');
  } catch (error) {
    if (newMoved) await rm(target, { recursive: true, force: true });
    if (oldMoved) await rename(previous, target);
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
