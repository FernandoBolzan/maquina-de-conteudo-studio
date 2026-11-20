import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gitBashCandidates, isWindowsStorePythonStub, windowsInstallDirectories } from '../src/main/setup/windows-paths.js';
import { mergeEnvironment } from '../src/main/executable.js';

const STUB = 'C:\\Users\\ana\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe';

test('atalho python da Microsoft Store sem Python instalado é ignorado', () => {
  assert.equal(isWindowsStorePythonStub(STUB, 'win32', () => ['winget.exe', 'python.exe', 'python3.exe']), true);
  assert.equal(isWindowsStorePythonStub(STUB.replace('python.exe', 'python3.exe'), 'win32', () => ['python3.exe']), true);
});

test('Python da Store de verdade e outros executáveis do WindowsApps continuam válidos', () => {
  assert.equal(isWindowsStorePythonStub(STUB, 'win32', () => ['python.exe', 'PythonSoftwareFoundation.Python.3.12_qbz5n2kfra8p0']), false);
  assert.equal(isWindowsStorePythonStub('C:\\Users\\ana\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe', 'win32', () => []), false);
  assert.equal(isWindowsStorePythonStub('C:\\Users\\ana\\AppData\\Local\\Programs\\Python\\Python312\\python.exe', 'win32', () => []), false);
  assert.equal(isWindowsStorePythonStub(STUB, 'linux', () => []), false);
});

test('destinos de instalação do Windows listam o Python mais novo primeiro', () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local', ProgramFiles: 'C:\\Program Files' };
  const directories = windowsInstallDirectories(env, root => root.endsWith('\\Programs\\Python') ? ['Python39', 'Python312', 'Launcher', 'Python310'] : []);
  const python = directories.filter(directory => directory.includes('\\Programs\\Python\\Python'));
  assert.deepEqual(python.filter(directory => !directory.endsWith('Scripts')).map(directory => directory.split('\\').pop()), ['Python312', 'Python310', 'Python39']);
  assert.ok(directories.includes('C:\\Users\\ana\\AppData\\Local\\Programs\\Git\\cmd'));
  assert.ok(directories.includes('C:\\Program Files\\nodejs'));
});

test('PATH do Studio substitui o Path do Windows em vez de duplicar a variável', () => {
  const merged = mergeEnvironment({ Path: 'C:\\antigo', Temp: 'C:\\t' }, { PATH: 'C:\\novo', PYTHON: 'C:\\py' }, 'win32');
  assert.deepEqual(merged, { Temp: 'C:\\t', PATH: 'C:\\novo', PYTHON: 'C:\\py' });
  // No Linux maiúsculas diferem: variáveis distintas permanecem.
  assert.deepEqual(mergeEnvironment({ Path: 'a' }, { PATH: 'b' }, 'linux'), { Path: 'a', PATH: 'b' });
});

test('bash do Git é procurado a partir do git.exe e dos destinos padrão', () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local', ProgramFiles: 'C:\\Program Files' };
  const candidates = gitBashCandidates('C:\\Users\\ana\\AppData\\Local\\Programs\\Git\\cmd\\git.exe', env);
  assert.ok(candidates.includes('C:\\Users\\ana\\AppData\\Local\\Programs\\Git\\bin\\bash.exe'));
  assert.ok(candidates.includes('C:\\Program Files\\Git\\bin\\bash.exe'));
  assert.equal(new Set(candidates).size, candidates.length);
});
