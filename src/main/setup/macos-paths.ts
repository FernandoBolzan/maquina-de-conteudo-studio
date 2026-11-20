import { existsSync } from 'node:fs';

/**
 * Apps abertos pelo Finder herdam só `/usr/bin:/bin:/usr/sbin:/sbin`. No Apple Silicon o Homebrew vive em
 * `/opt/homebrew`, então sem estas pastas o Studio não enxerga Node, Git, FFmpeg nem Python instalados por ele.
 */
export const MACOS_TOOL_DIRECTORIES = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin'];

const CLT_MARKERS = ['/Library/Developer/CommandLineTools/usr/bin/git', '/Applications/Xcode.app/Contents/Developer/usr/bin/git'];

/**
 * `/usr/bin/git` e `/usr/bin/python3` do macOS são só atalhos das Ferramentas de Linha de Comando do Xcode. Sem elas,
 * executá-los (até com `--version`) abre o diálogo "instalar as ferramentas de desenvolvedor". Com elas, são reais.
 */
export function isMacDeveloperToolsShim(file: string, platform: NodeJS.Platform = process.platform, exists: (path: string) => boolean = existsSync): boolean {
  if (platform !== 'darwin' || (file !== '/usr/bin/git' && file !== '/usr/bin/python3')) return false;
  return !CLT_MARKERS.some(marker => exists(marker));
}
