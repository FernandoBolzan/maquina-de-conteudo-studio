import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMacDeveloperToolsShim, MACOS_TOOL_DIRECTORIES } from '../src/main/setup/macos-paths.js';

test('git e python3 de /usr/bin sem as Ferramentas de Linha de Comando são atalhos que abrem o instalador da Apple', () => {
  assert.equal(isMacDeveloperToolsShim('/usr/bin/git', 'darwin', () => false), true);
  assert.equal(isMacDeveloperToolsShim('/usr/bin/python3', 'darwin', () => false), true);
});

test('com as ferramentas instaladas, ou fora de /usr/bin, ou em outros sistemas, o executável é válido', () => {
  assert.equal(isMacDeveloperToolsShim('/usr/bin/git', 'darwin', path => path === '/Library/Developer/CommandLineTools/usr/bin/git'), false);
  assert.equal(isMacDeveloperToolsShim('/opt/homebrew/bin/git', 'darwin', () => false), false);
  assert.equal(isMacDeveloperToolsShim('/usr/bin/ffmpeg', 'darwin', () => false), false);
  assert.equal(isMacDeveloperToolsShim('/usr/bin/git', 'linux', () => false), false);
});

test('o Homebrew do Apple Silicon vem antes do /usr/local', () => {
  assert.ok(MACOS_TOOL_DIRECTORIES.indexOf('/opt/homebrew/bin') < MACOS_TOOL_DIRECTORIES.indexOf('/usr/local/bin'));
});
