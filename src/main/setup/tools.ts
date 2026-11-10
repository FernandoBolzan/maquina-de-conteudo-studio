import { access, mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { CliId, CliOperationResult, CliUpdateStatus, Job, ToolStatus } from '../../shared/contracts.js';
import type { Services } from '../context.js';

const names: Record<string, string> = {
  git: 'Git', node: 'Node.js', npm: 'npm', python: 'Python', ffmpeg: 'FFmpeg', ffprobe: 'FFprobe',
  gh: 'GitHub CLI', codex: 'Codex', claude: 'Claude Code', maestro: 'Orquestrador Maestro', hyperframes: 'HyperFrames',
  cloudflared: 'Cloudflare Tunnel',
};
const packages: Record<string, string> = {
  codex: '@openai/codex', claude: '@anthropic-ai/claude-code', maestro: '@iapro/orquestrador-maestro-cli', hyperframes: 'hyperframes',
};
const binaries: Record<string, string[]> = {
  python: process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'],
  maestro: ['orquestrador-maestro'],
  cloudflared: ['cloudflared'],
};

export function normalizeTool(tool: string): string {
  return tool === 'orquestrador-maestro' ? 'maestro' : tool === 'python3' ? 'python' : tool;
}

export function toolPrefix(services: Services, tool: string): string {
  return join(services.dataDir, 'runtime', 'tools', normalizeTool(tool));
}

const CLI_TOOLS: CliId[] = ['codex', 'claude'];
const CLI_REGISTRY = 'https://registry.npmjs.org';

export function compareVersions(left: string, right: string): number | undefined {
  const parse = (version: string) => {
    const match = version.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
    return match ? { parts: match.slice(1, 4).map(Number), prerelease: match[4] } : undefined;
  };
  const a = parse(left), b = parse(right);
  if (!a || !b) return undefined;
  for (let index = 0; index < 3; index++) if (a.parts[index] !== b.parts[index]) return a.parts[index]! > b.parts[index]! ? 1 : -1;
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === undefined) return 1;
  if (b.prerelease === undefined) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}


export function classifyCliUpdate(id: CliId, installed: boolean, currentVersion?: string, latestVersion?: string, source?: 'managed' | 'external', canRollback = false, unavailableReason?: string): CliUpdateStatus {
  if (!latestVersion) return { id, currentVersion, source, state: 'unavailable', canRollback, detail: `${unavailableReason || 'Não foi possível consultar a versão estável no registro oficial.'} ${installed ? 'O CLI instalado continua disponível.' : 'Instale npm e conexão de rede para preparar o CLI.'}` };
  if (!installed && !source) return { id, latestVersion, state: 'missing', canRollback, detail: `Não instalado. A versão estável ${latestVersion} pode ser instalada no diretório privado do app.` };
  if (!installed || !currentVersion) return { id, currentVersion, latestVersion, source, state: 'unverified', canRollback, detail: 'Não foi possível validar a versão instalada.' };
  const comparison = compareVersions(latestVersion, currentVersion);
  if (comparison === undefined) return { id, currentVersion, latestVersion, source, state: 'unverified', canRollback, detail: 'O formato da versão instalada não pôde ser comparado.' };
  if (comparison > 0) {
    const state = source === 'managed' ? 'update-available' : 'external-update-available';
    const detail = source === 'managed'
      ? `Versão ${currentVersion}; versão estável ${latestVersion} disponível para atualização.`
      : `Versão ${currentVersion} instalada fora do app; existe ${latestVersion}. O app pode instalar uma cópia privada sem alterar a global.`;
    return { id, currentVersion, latestVersion, source, state, canRollback, detail };
  }
  return { id, currentVersion, latestVersion, source, state: 'current', canRollback, detail: `Atualizado na versão estável ${currentVersion}.` };
}
function versionFrom(text: string): string | undefined {
  return text.match(/(?:^|\s)v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\s|$)/)?.[1];
}

function managedPath(tool: CliId, executablePath: string, services: Services): boolean {
  const bin = resolve(toolPrefix(services, tool), 'node_modules', '.bin');
  const path = relative(bin, resolve(executablePath));
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function existingPath(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

async function managedExecutable(tool: CliId, prefix: string): Promise<string> {
  for (const name of binaries[tool] ?? [tool]) {
    for (const extension of process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']) {
      const path = join(prefix, 'node_modules', '.bin', name + extension);
      if (await executable(path)) return path;
    }
  }
  throw new Error(`${names[tool]} não gerou o executável esperado.`);
}

async function latestCliVersion(tool: CliId, services: Services): Promise<string> {
  const npm = await requireTool('npm', services);
  const result = await services.capture(npm, ['view', `${packages[tool]}@latest`, 'version', '--json', `--registry=${CLI_REGISTRY}`], { env: await toolEnvironment(services), timeoutMs: 20000 });
  if (result.code !== 0) throw new Error('Não foi possível consultar a versão estável no registro oficial do npm.');
  let value: unknown;
  try { value = JSON.parse(result.stdout); } catch { value = result.stdout.trim().replace(/^['"]|['"]$/g, ''); }
  if (typeof value !== 'string' || compareVersions(value, value) !== 0) throw new Error('O registro oficial retornou uma versão inválida.');
  return value;
}

async function executable(path: string): Promise<boolean> {
  try {
    await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return (await stat(path)).isFile();
  } catch { return false; }
}

function searchDirectories(services: Services): string[] {
  const local = [
    ...Object.keys(packages).map(tool => join(toolPrefix(services, tool), 'node_modules', '.bin')),
    toolPrefix(services, 'cloudflared'),
  ];
  const system = (process.env.PATH ?? process.env.Path ?? '')
    .split(delimiter)
    .map(path => path.replace(/^"|"$/g, ''))
    .filter(path => isAbsolute(path) && !path.replace(/\\/g, '/').endsWith('/node_modules/.bin'));
  const user = [join(homedir(), '.local', 'bin'), ...(process.platform === 'win32' ? [] : ['/usr/local/bin'])];
  if (process.platform === 'win32') {
    if (process.env.APPDATA) user.push(join(process.env.APPDATA, 'npm'));
    if (process.env.LOCALAPPDATA) user.push(join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'));
    if (process.env.ProgramFiles) user.push(join(process.env.ProgramFiles, 'nodejs'), join(process.env.ProgramFiles, 'Git', 'cmd'));
  }
  return [...new Set([...local, ...user, ...system])];
}

/** Resolve the same user-local installation for diagnostics and actual launchers. */
export async function resolveTool(tool: string, services: Services): Promise<string | undefined> {
  tool = normalizeTool(tool);
  if (!/^[a-z][a-z0-9-]*$/.test(tool)) return undefined;
  const candidates = binaries[tool] ?? [tool];
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  if (tool === 'maestro') {
    const root = services.getSettings().enginePaths.maestro;
    if (root) {
      const script = join(root, 'bin', 'orquestrador-maestro.js');
      if (await executable(script)) return script;
    }
  }
  for (const directory of searchDirectories(services)) {
    for (const name of candidates) {
      for (const extension of extensions) {
        const path = join(directory, name + extension);
        if (await executable(path)) return path;
      }
    }
  }
  return undefined;
}

export async function toolEnvironment(services: Services): Promise<Record<string, string>> {
  const codexHome = join(services.dataDir, 'codex-home');
  // Codex CLI exits with code 1 when CODEX_HOME is missing; create it before any login or run.
  await mkdir(codexHome, { recursive: true, mode: 0o700 });
  const env: Record<string, string> = {
    PATH: searchDirectories(services).join(delimiter),
    POSTNOW_HOME: join(services.dataDir, 'engine-data', 'postnow'),
    ORQUESTRADOR_MAESTRO_TELEMETRY: '0',
    ORQUESTRADOR_MAESTRO_SKIP_CLI_UPDATE: '1',
    DISABLE_AUTOUPDATER: '1',
    DISABLE_UPDATES: '1',
    // The Studio keeps its own Claude and Codex logins; terminal and desktop apps keep theirs in ~/.claude and ~/.codex.
    CLAUDE_CONFIG_DIR: join(services.dataDir, 'claude-config'),
    CODEX_HOME: codexHome,
  };
  const videogoPython = join(homedir(), '.local', 'share', 'videogo-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (await executable(videogoPython)) {
    env.PYTHON = videogoPython;
  }
  return env;
}

export async function requireTool(tool: string, services: Services): Promise<string> {
  const path = await resolveTool(tool, services);
  if (!path) throw new Error(`${names[tool] ?? tool} não encontrado. Instale-o em Configuração e execute o diagnóstico novamente.`);
  return path;
}

export async function captureTool(tool: string, args: string[], services: Services, timeoutMs = 15000) {
  const path = await requireTool(tool, services);
  const env = await toolEnvironment(services);
  if (path.endsWith('.js')) return services.capture(await requireTool('node', services), [path, ...args], { env, timeoutMs });
  return services.capture(path, args, { env, timeoutMs });
}

export async function toolStatus(tool: string, services: Services): Promise<ToolStatus> {
  const result: ToolStatus = { id: tool, name: names[tool] ?? tool, installed: false };
  const path = await resolveTool(tool, services);
  if (!path) {
    result.detail = 'Não encontrado. A instalação exige sua confirmação.';
    return result;
  }
  if (tool === 'codex' || tool === 'claude') result.source = managedPath(tool, path, services) ? 'managed' : 'external';
  try {
    const version = await captureTool(tool, tool === 'ffmpeg' || tool === 'ffprobe' ? ['-version'] : ['--version'], services);
    result.installed = version.code === 0;
    // Only a version token crosses IPC; raw process output may contain account information.
    result.version = versionFrom(version.stdout + '\n' + version.stderr) ?? (version.stdout + '\n' + version.stderr).match(/\b\d+\.\d+(?:\.\d+)?(?:[-+][a-zA-Z0-9.-]+)?\b/)?.[0];
    if (!result.installed) result.detail = 'Executável encontrado, mas não pôde iniciar. Verifique dependências/permissões no sistema.';
    if (result.installed && tool === 'node' && Number(result.version?.split('.')[0] ?? 0) < 22) result.detail = 'VideoGo exige Node.js 22 ou mais recente. Atualize pelo instalador oficial; nenhuma versão global será sobrescrita automaticamente.';
    if (result.installed && tool === 'python') {
      const [major = 0, minor = 0] = (result.version ?? '').split('.').map(Number);
      if (major < 3 || (major === 3 && minor < 11)) result.detail = 'PostNow exige Python 3.11 ou mais recente.';
    }
    if (tool === 'cloudflared') {
      if (result.installed) {
        result.detail = 'Instalado. Permite criar túneis seguros para acesso remoto pelo celular.';
      } else {
        result.detail = 'Não encontrado. Permite conectar o celular pelo túnel seguro Cloudflare para acesso remoto.';
      }
    }
    if (result.installed && ['gh', 'codex', 'claude'].includes(tool)) {
      const args = tool === 'gh' ? ['auth', 'status', '--hostname', 'github.com'] : tool === 'codex' ? ['login', 'status'] : ['auth', 'status', '--json'];
      try {
        const auth = await captureTool(tool, args, services);
        result.authenticated = auth.code === 0;
        if (tool === 'claude' && auth.code === 0) {
          try {
            const data: unknown = JSON.parse(auth.stdout);
            result.authenticated = typeof data === 'object' && data !== null && 'loggedIn' in data && data.loggedIn === true;
            if (result.authenticated && typeof data === 'object' && data !== null && 'email' in data && typeof data.email === 'string') {
              // O plano explica limites de uso (ex.: Pro esgota a janela de 5 h rápido com Opus).
              const plan = 'subscriptionType' in data && typeof data.subscriptionType === 'string' && /^[a-z0-9_-]{1,20}$/i.test(data.subscriptionType) ? ` · plano ${data.subscriptionType}` : '';
              result.account = data.email + plan;
            }
          } catch { /* Formato não-JSON */ }
        }
        if (tool === 'gh' && (auth.code === 0 || auth.stdout.includes('Logged in to') || auth.stderr.includes('Logged in to'))) {
          const combined = auth.stdout + '\n' + auth.stderr;
          const login = combined.match(/Logged in to [^\s]+ account ([A-Za-z0-9_-]+)/i)?.[1];
          // E-mail principal só com o escopo user:email (pedido no login); sem ele, vale o e-mail público do perfil.
          const emails = await captureTool('gh', ['api', 'user/emails', '--jq', '.[] | select(.primary) | .email'], services).catch(() => undefined);
          const profile = await captureTool('gh', ['api', 'user', '--jq', '.email // ""'], services).catch(() => undefined);
          const email = [emails, profile].map(item => item?.code === 0 ? item.stdout.trim() : '').find(value => EMAIL.test(value));
          if (login || email) result.account = email && login ? `${email} (@${login})` : email ?? `@${login}`;
        }
        if (tool === 'codex' && auth.code === 0) {
          const combined = auth.stdout + '\n' + auth.stderr;
          const method = combined.match(/Logged in using ([^\r\n]+)/i)?.[1]?.trim();
          const account = await codexAccount(await requireTool('codex', services), await toolEnvironment(services)).catch(() => undefined);
          result.account = account ? `${account.email}${account.plan ? ` · plano ${account.plan}` : ''}` : method;
        }
        if (!result.authenticated) result.detail = 'Sessão não confirmada pelo CLI. Faça login ou verifique a conexão. Nenhuma credencial é lida pelo aplicativo.';
      } catch { result.detail = 'Não foi possível consultar a sessão. Verifique o CLI e a conexão.'; }
    }
  } catch { result.detail = 'O diagnóstico não pôde executar este programa. Verifique permissões e dependências.'; }
  return result;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/**
 * E-mail e plano da conta ChatGPT do Codex pela API oficial do CLI (`app-server` → `account/read`), sem ler arquivos de
 * credencial. O servidor precisa do stdin aberto até responder, por isso não usa `services.capture`.
 */
function codexAccount(executable: string, env: Record<string, string>): Promise<{ email: string; plan?: string } | undefined> {
  const { promise, resolve: resolvePromise } = Promise.withResolvers<{ email: string; plan?: string } | undefined>();
  const child = spawn(executable, ['app-server'], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, shell: process.platform === 'win32' });
  let buffer = '';
  const finish = (value: { email: string; plan?: string } | undefined) => { clearTimeout(timer); child.kill(); resolvePromise(value); };
  const timer = setTimeout(() => finish(undefined), 10_000);
  child.on('error', () => finish(undefined));
  child.on('close', () => finish(undefined));
  child.stdout.on('data', chunk => {
    buffer += chunk;
    for (const line of buffer.split('\n').slice(0, -1)) {
      try {
        const message = JSON.parse(line) as { id?: number; result?: { account?: { email?: unknown; planType?: unknown } | null } };
        if (message.id !== 2) continue;
        const account = message.result?.account;
        const email = typeof account?.email === 'string' && EMAIL.test(account.email) ? account.email : undefined;
        const plan = typeof account?.planType === 'string' && /^[a-z0-9_-]{1,20}$/i.test(account.planType) ? account.planType : undefined;
        return finish(email ? { email, plan } : undefined);
      } catch { /* linha parcial ou não JSON */ }
    }
    buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
  });
  child.stdin.on('error', () => undefined);
  child.stdin.write([
    { method: 'initialize', id: 1, params: { clientInfo: { name: 'maquina-de-conteudo', title: 'Máquina de Conteúdo', version: '0.2.0' } } },
    { method: 'initialized' },
    { method: 'account/read', id: 2, params: { refreshToken: false } },
  ].map(message => JSON.stringify(message)).join('\n') + '\n');
  return promise;
}
export async function checkCliUpdates(services: Services): Promise<CliUpdateStatus[]> {
  return Promise.all(CLI_TOOLS.map(async (id): Promise<CliUpdateStatus> => {
    const status = await toolStatus(id, services);
    const canRollback = status.source === 'managed' && await existingPath(`${toolPrefix(services, id)}.previous`);
    try {
      const latestVersion = await latestCliVersion(id, services);
      return classifyCliUpdate(id, status.installed, status.version, latestVersion, status.source, canRollback);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao consultar o registro oficial.';
      return classifyCliUpdate(id, status.installed, status.version, undefined, status.source, canRollback, message);
    }
  }));
}

async function validateManagedCli(tool: CliId, prefix: string, expectedVersion: string, services: Services): Promise<void> {
  const path = await managedExecutable(tool, prefix);
  const result = await services.capture(path, ['--version'], { env: await toolEnvironment(services), timeoutMs: 15000 });
  const actualVersion = versionFrom(result.stdout + '\n' + result.stderr);
  if (result.code !== 0 || !actualVersion || compareVersions(actualVersion, expectedVersion) !== 0) {
    throw new Error(`${names[tool]} não passou no teste de versão após a instalação. A instalação ativa foi preservada.`);
  }
}

async function rollbackCli(tool: CliId, services: Services): Promise<CliOperationResult> {
  const prefix = toolPrefix(services, tool);
  const previous = `${prefix}.previous`;
  const status = await toolStatus(tool, services);
  if (status.source !== 'managed' || !await existingPath(previous)) throw new Error(`Não há uma versão anterior gerenciada de ${names[tool]} para restaurar.`);
  const previousVersion = await services.capture(await managedExecutable(tool, previous), ['--version'], { env: await toolEnvironment(services), timeoutMs: 15000 });
  const version = versionFrom(previousVersion.stdout + '\n' + previousVersion.stderr);
  if (previousVersion.code !== 0 || !version) throw new Error(`A versão anterior de ${names[tool]} falhou no diagnóstico; a versão ativa foi preservada.`);
  const temporary = `${prefix}.rollback-${randomUUID()}`;
  let activeMoved = false, previousMoved = false, currentPreserved = false;
  try {
    await rename(prefix, temporary); activeMoved = true;
    await rename(previous, prefix); previousMoved = true;
    await validateManagedCli(tool, prefix, version, services);
    await rename(temporary, previous); currentPreserved = true;
    services.emit({ type: 'refresh' });
    return { message: `${names[tool]} restaurado para ${version}; a versão substituída ficou disponível para novo rollback.`, version };
  } catch (error) {
    try {
      if (currentPreserved) await rename(previous, temporary);
      if (previousMoved) await rename(prefix, previous);
      if (activeMoved) await rename(temporary, prefix);
    } catch { throw new Error(`Falha ao restaurar ${names[tool]}; os diretórios de versão foram preservados para recuperação manual.`, { cause: error }); }
    throw error;
  }
}

export async function manageCliTool(tool: CliId, operation: 'install' | 'update' | 'rollback', services: Services): Promise<CliOperationResult> {
  if (!CLI_TOOLS.includes(tool)) throw new Error('CLI de provedor desconhecido.');
  if (operation === 'rollback') return rollbackCli(tool, services);
  const status = await toolStatus(tool, services);
  if (operation === 'install' && status.source === 'managed' && status.installed) throw new Error(`${names[tool]} já está instalado pelo app.`);
  if (operation === 'update' && (status.source !== 'managed' || !status.installed)) throw new Error('Atualize somente uma cópia gerenciada pelo app; instalações externas não serão alteradas.');
  const targetVersion = await latestCliVersion(tool, services);
  if (operation === 'update' && status.version && compareVersions(targetVersion, status.version) !== 1) throw new Error(`${names[tool]} já está na versão estável mais recente.`);
  const npm = await requireTool('npm', services);
  await requireTool('node', services);
  const prefix = toolPrefix(services, tool);
  const parent = dirname(prefix);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  if (await existingPath(prefix) && status.source !== 'managed') throw new Error(`O diretório gerenciado de ${names[tool]} existe, mas não passou no diagnóstico. A instalação não será sobrescrita.`);
  const staging = await mkdtemp(join(parent, `.${tool}-staging-`));
  const env = await toolEnvironment(services);
  let committed = false;
  try {
    const job = await services.run({
      title: `${operation === 'update' ? 'Atualizar' : 'Instalar'} ${names[tool]} ${targetVersion} no diretório privado`,
      executable: npm,
      args: ['install', '--prefix', staging, '--save-exact', '--package-lock=true', '--no-audit', '--no-fund', `--registry=${CLI_REGISTRY}`, `${packages[tool]}@${targetVersion}`],
      cwd: staging, env, interactive: false, timeoutMs: 15 * 60 * 1000,
    });
    const completed = await services.waitJob(job.id);
    if (completed.status !== 'succeeded') throw new Error(`A instalação de ${names[tool]} não foi concluída. Consulte o job ${job.id}; a versão ativa não foi alterada.`);
    await validateManagedCli(tool, staging, targetVersion, services);
    const previous = `${prefix}.previous`;
    const hadCurrent = await existingPath(prefix);
    if (hadCurrent) {
      await rm(previous, { recursive: true, force: true });
      await rename(prefix, previous);
    }
    try {
      await rename(staging, prefix);
      await validateManagedCli(tool, prefix, targetVersion, services);
      committed = true;
    } catch (error) {
      await rm(prefix, { recursive: true, force: true });
      if (hadCurrent && await existingPath(previous)) await rename(previous, prefix);
      throw error;
    }
    services.emit({ type: 'refresh' });
    return { job: completed, version: targetVersion, message: `${names[tool]} ${targetVersion} instalado e validado em uma pasta privada. A instalação global e os dados de login permanecem intactos.` };
  } finally {
    if (!committed) await rm(staging, { recursive: true, force: true });
  }
}


export async function installTool(tool: string, services: Services): Promise<Job> {
  tool = normalizeTool(tool);
  if (!(tool in names)) throw new Error('Ferramenta de instalação desconhecida.');
  const status = await toolStatus(tool, services);
  if (status.installed) throw new Error(`${status.name} já está instalado. A instalação automática não sobrescreve ferramentas existentes.`);
  if (await resolveTool(tool, services)) throw new Error(`${status.name} está presente, mas falhou no diagnóstico. Corrija essa instalação antes de instalar outra versão.`);
  const env = await toolEnvironment(services);
  if (packages[tool]) {
    const npm = await requireTool('npm', services);
    await requireTool('node', services);
    const prefix = toolPrefix(services, tool);
    await mkdir(prefix, { recursive: true, mode: 0o700 });
    // Official npm publishers. --prefix is app-local, never global or sudo.
    return services.run({ title: `Instalar ${names[tool]} — pacote oficial, diretório privado`, executable: npm,
      args: ['install', '--prefix', prefix, '--save-exact', '--package-lock=true', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', packages[tool]!],
      cwd: prefix, env, interactive: false, timeoutMs: 15 * 60 * 1000 });
  }
  if (tool === 'cloudflared') {
    let nodeExecutable = await resolveTool('node', services);
    const executionEnv = { ...env };
    if (!nodeExecutable && process.versions.electron) {
      nodeExecutable = process.execPath;
      executionEnv.ELECTRON_RUN_AS_NODE = '1';
    }
    if (!nodeExecutable) {
      nodeExecutable = await requireTool('node', services);
    }
    const prefix = toolPrefix(services, tool);
    await mkdir(prefix, { recursive: true, mode: 0o755 });
    const targetBin = join(prefix, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    const downloadUrl = process.platform === 'win32'
      ? `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-${arch}.exe`
      : `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}`;
    const code = [
      'const fs = require("node:fs");',
      'const fsp = require("node:fs/promises");',
      'const stream = require("node:stream/promises");',
      '(async () => {',
      `  const res = await fetch(${JSON.stringify(downloadUrl)});`,
      '  if (!res.ok) throw new Error("Falha no download do cloudflared: " + res.statusText);',
      `  const out = fs.createWriteStream(${JSON.stringify(targetBin)});`,
      '  await stream.pipeline(res.body, out);',
      `  await fsp.chmod(${JSON.stringify(targetBin)}, 0o755);`,
      '  console.log("cloudflared instalado com sucesso em ' + targetBin + '");',
      '})().catch(err => { console.error(err); process.exit(1); });',
    ].join(' ');
    return services.run({
      title: `Instalar ${names[tool]} — download oficial Cloudflare`,
      executable: nodeExecutable,
      args: ['-e', code],
      cwd: prefix,
      env: executionEnv,
      interactive: false,
      timeoutMs: 5 * 60 * 1000,
    });
  }
  if (process.platform === 'win32') {
    const winget = await resolveTool('winget', services);
    if (!winget) throw new Error('Instale o App Installer da Microsoft Store para disponibilizar winget. Depois reinicie o aplicativo. Nenhum instalador foi executado.');
    const ids: Record<string, string> = { git: 'Git.Git', node: 'OpenJS.NodeJS.LTS', npm: 'OpenJS.NodeJS.LTS', python: 'Python.Python.3.12', ffmpeg: 'Gyan.FFmpeg', ffprobe: 'Gyan.FFmpeg', gh: 'GitHub.cli', cloudflared: 'Cloudflare.cloudflared' };
    const id = ids[tool];
    if (!id) throw new Error('Não existe receita Windows verificada para esta ferramenta.');
    return services.run({ title: `Instalar ${names[tool]} — WinGet, escopo usuário, instalação silenciosa`, executable: winget,
      args: ['install', '--id', id, '--exact', '--source', 'winget', '--scope', 'user', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--no-upgrade'], env, interactive: false });
  }
  if (process.platform !== 'linux') throw new Error('Instalação automática disponível apenas para Linux e Windows. Use a distribuição oficial da ferramenta.');
  const recipes: Array<{ manager: string; args: string[]; tools: Record<string, string[]> }> = [
    { manager: 'apt-get', args: ['install', '--no-upgrade'], tools: { git: ['git'], node: ['nodejs', 'npm'], npm: ['npm'], python: ['python3', 'python3-venv', 'python3-pip'], ffmpeg: ['ffmpeg'], ffprobe: ['ffmpeg'], gh: ['gh'] } },
    { manager: 'dnf', args: ['install'], tools: { git: ['git'], node: ['nodejs', 'npm'], npm: ['npm'], python: ['python3', 'python3-pip'], ffmpeg: ['ffmpeg-free'], ffprobe: ['ffmpeg-free'], gh: ['gh'] } },
    { manager: 'pacman', args: ['-S', '--needed'], tools: { git: ['git'], node: ['nodejs', 'npm'], npm: ['npm'], python: ['python', 'python-pip'], ffmpeg: ['ffmpeg'], ffprobe: ['ffmpeg'], gh: ['github-cli'] } },
    { manager: 'zypper', args: ['install'], tools: { git: ['git'], node: ['nodejs22', 'npm22'], npm: ['npm22'], python: ['python311', 'python311-pip'], ffmpeg: ['ffmpeg'], ffprobe: ['ffmpeg'], gh: ['gh'] } },
  ];
  const pkexec = await resolveTool('pkexec', services);
  if (!pkexec) throw new Error('A instalação de pré-requisitos Linux exige autorização administrativa humana. O serviço gráfico pkexec não está disponível. Peça ao administrador para instalar a ferramenta com o gerenciador oficial da distribuição; o aplicativo não executa sudo.');
  for (const recipe of recipes) {
    const manager = await resolveTool(recipe.manager, services);
    const list = recipe.tools[tool];
    if (manager && list) return services.run({ title: `Instalar ${names[tool]} — autorize no diálogo gráfico do sistema`, executable: pkexec,
      args: [manager, ...recipe.args, ...list], env, interactive: false, timeoutMs: 15 * 60 * 1000 });
  }
  throw new Error('Distribuição não reconhecida. Instale a ferramenta pelos repositórios oficiais do sistema e reabra o aplicativo. Nenhum script remoto ou sudo foi executado.');
}

export async function requireVersion(tool: 'node' | 'python', major: number, minor: number, services: Services): Promise<string> {
  const path = await requireTool(tool, services);
  const status = await toolStatus(tool, services);
  const [foundMajor = 0, foundMinor = 0] = (status.version ?? '').split('.').map(Number);
  if (!status.installed || foundMajor < major || (foundMajor === major && foundMinor < minor)) throw new Error(`${names[tool]} ${major}.${minor}+ é obrigatório. Instale a versão oficial adequada e reinicie o aplicativo.`);
  return path;
}

export async function environmentWithExecutables(services: Services, paths: string[]): Promise<Record<string, string>> {
  const env = await toolEnvironment(services);
  env.PATH = [...new Set([...paths.map(dirname), ...env.PATH!.split(delimiter)])].join(delimiter);
  return env;
}
