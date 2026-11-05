import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve, relative, isAbsolute } from 'node:path';

const PACKAGES: Record<string, string> = { npm: 'npm', npx: 'npm', codex: '@openai/codex', claude: '@anthropic-ai/claude-code', 'orquestrador-maestro': '@iapro/orquestrador-maestro-cli', hyperframes: 'hyperframes' };
/** Resolve known npm Windows launchers without parsing commands through cmd.exe. */
export function executableArgs(executable: string, args: string[]): { executable: string; args: string[] } {
  if (process.platform !== 'win32' || !/\.(cmd|bat)$/i.test(executable)) return { executable, args };
  const name = basename(executable).replace(/\.(cmd|bat)$/i, '').toLowerCase();
  const pkg = PACKAGES[name]; if (!pkg) throw new Error(`Launcher não suportado: ${name}. Instale o executável nativo oficial.`);
  const base = dirname(executable);
  const roots = [join(base, 'node_modules', pkg), join(base, '..', pkg), join(base, '..', 'node_modules', pkg)];
  for (const root of roots) {
    const manifest = join(root, 'package.json'); if (!existsSync(manifest)) continue;
    const data = JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: string | Record<string,string> };
    const entry = typeof data.bin === 'string' ? data.bin : data.bin?.[name]; if (!entry) continue;
    const file = realpathSync(resolve(root, entry)); const rel = relative(realpathSync(root), file);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Launcher fora do pacote instalado.');
    if (/\.exe$/i.test(file)) return { executable: file, args };
    const node = [join(base, 'node.exe'), join(base, '..', 'node.exe')].find(existsSync) || 'node';
    return { executable: node, args: [file, ...args] };
  }
  throw new Error(`Não foi possível resolver ${name} com segurança. Reinstale a ferramenta oficial.`);
}
