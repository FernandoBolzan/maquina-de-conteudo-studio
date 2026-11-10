import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, lstat, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, parse, resolve } from 'node:path';
import type { EngineDependency, EngineId, EngineStatus, Settings } from '../../shared/contracts.js';
import type { RunSpec, Services } from '../context.js';
import { postnowRuntimeStatus } from '../content/postnow.js';
import { environmentWithExecutables, installTool, requireTool, requireVersion, resolveTool, toolEnvironment, toolStatus } from './tools.js';

export const repositories: Record<EngineId, string> = {
  videogo: 'FernandoBolzan/VideoGo',
  postnow: 'FernandoBolzan/PostNow',
  maestro: 'IAPro-Community/Orquestrador-Maestro',
};
const packageNames = { videogo: 'videogo', maestro: '@iapro/orquestrador-maestro-cli' };
interface Installation { engine: EngineId; repository: string; commit: string; version: string; ready: boolean; }
interface History { previous: string[]; }

export function engineId(value: unknown): EngineId {
  if (value !== 'videogo' && value !== 'postnow' && value !== 'maestro') throw new Error('Motor desconhecido.');
  return value;
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function safePath(path: string, directory: boolean): Promise<string> {
  if (!isAbsolute(path) || path.includes('\0')) throw new Error('Selecione um caminho absoluto válido.');
  const absolute = resolve(path);
  let cursor = parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(/[\\/]/).filter(Boolean)) {
    cursor = join(cursor, part);
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw new Error('Links simbólicos e junctions não são aceitos em caminhos de motores.');
  }
  const info = await lstat(absolute);
  if (directory ? !info.isDirectory() : !info.isFile()) throw new Error(`Caminho inválido: ${absolute}`);
  return realpath(absolute);
}

async function objectFile(path: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Manifesto inválido: ${path}`);
  return value as Record<string, unknown>;
}

async function inspect(engine: EngineId, root: string, built: boolean): Promise<string> {
  await safePath(root, true);
  if (engine === 'postnow') {
    await safePath(join(root, 'pyproject.toml'), false);
    const project = await readFile(join(root, 'pyproject.toml'), 'utf8');
    if (!/^name\s*=\s*["']postnow["']\s*$/m.test(project) || !/^postnow\s*=\s*["']postnow\.cli:main["']\s*$/m.test(project)) throw new Error('Esta pasta não contém o pacote PostNow esperado.');
    await safePath(join(root, 'postnow', '__main__.py'), false);
    await safePath(join(root, 'postnow', 'cli.py'), false);
    return project.match(/^version\s*=\s*["']([^"']+)["']/m)?.[1] ?? 'desconhecida';
  }
  await safePath(join(root, 'package.json'), false);
  const manifest = await objectFile(join(root, 'package.json'));
  if (manifest.name !== packageNames[engine]) throw new Error('Esta pasta não contém o pacote do motor selecionado.');
  if (engine === 'maestro') await safePath(join(root, 'bin', 'orquestrador-maestro.js'), false);
  else await safePath(join(root, built ? 'dist/cli/index.js' : 'src/cli/index.ts'), false);
  if (typeof manifest.version !== 'string' || !/^[\w.+-]{1,80}$/.test(manifest.version)) throw new Error('Versão inválida no manifesto do motor.');
  return manifest.version;
}

function versionAtLeast(version: string | undefined, major: number, minor: number): boolean {
  const [foundMajor = 0, foundMinor = 0] = (version ?? '').split('.').map(Number);
  return foundMajor > major || (foundMajor === major && foundMinor >= minor);
}

async function engineDependencies(engine: EngineId, services: Services): Promise<EngineDependency[]> {
  const specs = engine === 'postnow' ? []
    : engine === 'videogo' ? [{ id: 'node', name: 'Node.js', required: '22+', major: 22, minor: 0 }, { id: 'npm', name: 'npm', required: 'incluído com Node.js', major: 0, minor: 0 }, { id: 'ffmpeg', name: 'FFmpeg', required: 'instalado', major: 0, minor: 0 }, { id: 'ffprobe', name: 'FFprobe', required: 'instalado', major: 0, minor: 0 }, { id: 'python', name: 'Python', required: '3.11+ (para faster-whisper)', major: 3, minor: 11 }]
      : [{ id: 'node', name: 'Node.js', required: '20.19+', major: 20, minor: 19 }, { id: 'npm', name: 'npm', required: 'incluído com Node.js', major: 0, minor: 0 }];
  const dependencies: EngineDependency[] = await Promise.all(specs.map(async spec => {
    const status = await toolStatus(spec.id, services);
    let installed = status.installed;
    if (spec.id === 'node' || spec.id === 'python') installed &&= versionAtLeast(status.version, spec.major, spec.minor);
    return { id: spec.id, name: spec.name, required: spec.required, installed, version: status.version,
      guidance: installed ? `${spec.name} pronto.` : spec.id === 'ffprobe' ? 'Instale o pacote FFmpeg da sua distribuição, que inclui ffprobe.' : status.installed ? `Atualize para ${spec.required} ou mais recente e reabra o Studio.` : `Instale ${spec.name} e execute o diagnóstico novamente.` };
  }));
  if (engine === 'postnow') {
    const runtime = await postnowRuntimeStatus(services);
    const pythonReady = versionAtLeast(runtime.pythonVersion, 3, 11);
    dependencies.push({ id: 'python', name: 'Python', required: '3.11+', installed: pythonReady, ...(runtime.pythonVersion ? { version: runtime.pythonVersion } : {}),
      guidance: pythonReady ? `Python ${runtime.pythonVersion} pronto no ambiente usado pelo PostNow.` : runtime.pythonVersion ? 'Atualize o Python selecionado pelo PostNow para 3.11 ou mais recente.' : 'Instale Python 3.11+ ou conecte uma instalação que tenha um ambiente virtual válido.' });
    dependencies.push({ id: 'pillow', name: 'Pillow', required: 'instalado no Python usado pelo PostNow', installed: !!runtime.pillowVersion, ...(runtime.pillowVersion ? { version: runtime.pillowVersion } : {}),
      guidance: runtime.pillowVersion ? `Pillow ${runtime.pillowVersion} pronto para operações oficiais de imagem do PostNow.` : 'Instale Pillow no ambiente virtual do PostNow e execute o teste local; o Studio não usa Pillow para fabricar artes.' });
  }
  return dependencies;
}

export async function engineStatuses(services: Services): Promise<EngineStatus[]> {
  return Promise.all((Object.keys(repositories) as EngineId[]).map(async id => {
    const path = services.getSettings().enginePaths[id];
    const result: EngineStatus = { id, repository: `https://github.com/${repositories[id]}`, installed: false, dependencies: await engineDependencies(id, services) };
    if (!path) return result;
    result.path = path;
    try { result.version = await inspect(id, path, true); result.installed = true; } catch { /* Broken paths remain visible so the user can relink them. */ }
    return result;
  }));
}

async function stage(services: Services, spec: RunSpec): Promise<void> {
  const job = await services.run({ timeoutMs: 15 * 60 * 1000, ...spec });
  const completed = await services.waitJob(job.id);
  if (completed.status !== 'succeeded') throw new Error(`${spec.title}: ${completed.status === 'cancelled' ? 'cancelado' : 'falhou'}. A versão ativa não foi alterada. Consulte o job ${job.id}.`);
}

async function checkedCapture(services: Services, executable: string, args: string[], options: { cwd?: string; env?: Record<string, string>; timeoutMs?: number }, message: string): Promise<string> {
  const result = await services.capture(executable, args, options);
  if (result.code !== 0) throw new Error(message);
  return result.stdout;
}
async function ensureTool(tool: string, services: Services): Promise<void> {
  if (await resolveTool(tool, services)) return;
  const job = await installTool(tool, services);
  const completed = await services.waitJob(job.id);
  services.emit({ type: 'refresh' });
  if (completed.status !== 'succeeded') throw new Error(`Instalação de ${tool} ${completed.status === 'cancelled' ? 'cancelada' : 'não concluída'}. Consulte o job ${job.id}; a versão ativa do motor não foi alterada.`);
  if (!await resolveTool(tool, services)) throw new Error(`${tool} foi instalado, mas não foi encontrado. Reinicie o aplicativo e tente novamente; a versão ativa do motor não foi alterada.`);
}

async function prepareTools(engine: EngineId, services: Services): Promise<void> {
  await ensureTool('git', services);
  if (engine === 'postnow') {
    await ensureTool('python', services);
    await requireVersion('python', 3, 11, services);
  } else {
    await ensureTool('node', services);
    await requireVersion('node', engine === 'videogo' ? 22 : 20, engine === 'videogo' ? 0 : 19, services);
    await ensureTool('npm', services);
    await requireTool('npm', services);
    if (engine === 'videogo') {
      await ensureTool('ffmpeg', services);
      await ensureTool('ffprobe', services);
      await ensureTool('python', services);
      await requireVersion('python', 3, 11, services);
    }
  }
}


async function githubJson(endpoint: string, services: Services, privateRepository = false): Promise<Record<string, unknown>> {
  // Anonymous public access first; gh owns all private credentials. Neither tokens nor auth output are returned.
  try {
    const response = await fetch(`https://api.github.com/${endpoint}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MaquinaDeConteudo-desktop' },
      signal: AbortSignal.timeout(20000), redirect: 'error',
    });
    if (response.ok) {
      const body: unknown = await response.json();
      if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
    }
  } catch { /* A private repository or network policy may require GitHub CLI authentication. */ }
  if (privateRepository) await ensureTool('gh', services);
  const gh = await resolveTool('gh', services);
  if (!gh) throw new Error('Não foi possível confirmar acesso ao GitHub. Verifique a conexão; para repositórios privados, instale GitHub CLI e faça login. Acesso público não comprova licença de uso.');
  const options = { timeoutMs: 30000, env: { GH_PROMPT_DISABLED: '1' } };
  const result = await services.capture(gh, ['api', '--hostname', 'github.com', '--include', endpoint], options);
  if (result.code !== 0) {
    // Only a confirmed authenticated GitHub response for the fixed repository can prove denial.
    const status = result.stdout.match(/^HTTP\/[\d.]+\s+(\d{3})\b/m)?.[1];
    const bodyText = result.stdout.split(/\r?\n\r?\n/).slice(1).join('\n\n');
    let message = '';
    try {
      const body: unknown = JSON.parse(bodyText);
      if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') message = body.message;
    } catch { /* Malformed or non-GitHub responses never establish denial. */ }
    const permissionDenied = status === '404' && message === 'Not Found'
      || status === '403' && /^Resource not accessible by (?:integration|personal access token)$/i.test(message);
    if (privateRepository && permissionDenied && !/^x-ratelimit-remaining:\s*0\s*$/im.test(result.stdout)) {
      const user = await services.capture(gh, ['api', '--hostname', 'github.com', 'user'], options);
      if (user.code === 0) {
        try {
          const identity: unknown = JSON.parse(user.stdout);
          if (identity && typeof identity === 'object' && 'id' in identity && typeof identity.id === 'number' && 'login' in identity && typeof identity.login === 'string') {
            throw new Error('ENGINE_ACCESS_DENIED: O GitHub não permitiu acessar este repositório com a conta conectada. Verifique o acesso ou adquira o curso.');
          }
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('ENGINE_ACCESS_DENIED:')) throw error;
        }
      }
    }
    if (status === '401') throw new Error('Autenticação GitHub inválida ou expirada. Faça login novamente.');
    if (status === '403' && (/rate limit/i.test(message) || /^x-ratelimit-remaining:\s*0\s*$/im.test(result.stdout))) throw new Error('Limite da API GitHub atingido. Aguarde e tente novamente.');
    if (status === '403') throw new Error('GitHub recusou a consulta sem comprovar falta de acesso ao repositório. Verifique autenticação, políticas de organização e limites da API.');
    if (status === '404') throw new Error('GitHub não encontrou o repositório ou a versão; não foi possível confirmar uma sessão autenticada com acesso.');
    if (status && Number(status) >= 500) throw new Error('O GitHub informou uma falha no servidor. Tente novamente mais tarde.');
    if (!status) throw new Error('Não foi possível obter uma resposta do GitHub. Verifique a conexão e a autenticação do GitHub CLI.');
    throw new Error(`GitHub recusou a consulta (HTTP ${status}). Verifique a conexão e o login; permissão de download e licença comercial são verificações distintas.`);
  }
  const body: unknown = JSON.parse(result.stdout.split(/\r?\n\r?\n/).slice(1).join('\n\n'));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Resposta inesperada do GitHub.');
  return body as Record<string, unknown>;
}

async function sourceVersion(engine: EngineId, services: Services): Promise<{ sha: string; private: boolean }> {
  const repo = repositories[engine];
  const metadata = await githubJson(`repos/${repo}`, services, engine !== 'maestro');
  if (typeof metadata.full_name !== 'string' || metadata.full_name.toLowerCase() !== repo.toLowerCase() || typeof metadata.default_branch !== 'string') throw new Error('O repositório remoto não corresponde ao motor fixado.');
  // Resolve a concrete commit before any clone. Never update an existing checkout or pull a moving branch.
  const commit = await githubJson(`repos/${repo}/commits/${encodeURIComponent(metadata.default_branch)}`, services);
  if (typeof commit.sha !== 'string' || !/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('O GitHub não retornou um commit imutável válido.');
  return { sha: commit.sha, private: metadata.private === true };
}

async function health(engine: EngineId, root: string, services: Services): Promise<void> {
  await inspect(engine, root, true);
  const env = await toolEnvironment(services);
  const cwd = services.dataDir;
  if (engine === 'postnow') {
    const managedPython = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const python = await exists(managedPython) ? managedPython : await requireVersion('python', 3, 11, services);
    // Running from a neutral directory prevents unrelated project configuration from influencing setup.
    env.PYTHONPATH = root;
    await checkedCapture(services, python, ['-m', 'postnow', 'doctor'], { cwd, env, timeoutMs: 30000 }, 'PostNow falhou no diagnóstico. Verifique Python 3.11+, Pillow e o armazenamento externo; a versão anterior foi preservada.');
  } else {
    const node = await requireVersion('node', engine === 'videogo' ? 22 : 20, engine === 'videogo' ? 0 : 19, services);
    const entry = join(root, engine === 'videogo' ? 'dist/cli/index.js' : 'bin/orquestrador-maestro.js');
    await checkedCapture(services, node, [entry, '--help'], { cwd, env, timeoutMs: 30000 }, 'O CLI do motor não iniciou. Instale suas dependências antes de vinculá-lo.');
    if (engine === 'videogo') {
      for (const tool of ['ffmpeg', 'ffprobe']) {
        const binary = await requireTool(tool, services);
        await checkedCapture(services, binary, ['-version'], { env, timeoutMs: 15000 }, `${tool} não está funcional. A versão anterior foi preservada.`);
      }
      const output = await checkedCapture(services, node, [entry, 'engines', 'doctor', '--json'], { cwd, env, timeoutMs: 30000 }, 'VideoGo falhou no diagnóstico de motores.');
      const report: unknown = JSON.parse(output);
      if (!Array.isArray(report) || report.length === 0) throw new Error('VideoGo retornou um diagnóstico de motores inválido.');
      // Optional render backends may be absent; do not claim their availability from the CLI exit code.
    } else {
      const output = await checkedCapture(services, node, [entry, 'context', 'brief', '--project-path', services.dataDir, '--task', 'Verificar contexto local de instalação', '--max-chars', '1000', '--json'], { cwd, env, timeoutMs: 30000 }, 'Maestro não conseguiu montar um contexto local. Nenhuma chamada de modelo foi executada.');
      JSON.parse(output);
    }
  }
}

export async function testEngine(engine: EngineId, services: Services): Promise<{ message: string }> {
  const root = services.getSettings().enginePaths[engine];
  if (!root) throw new Error('Instale ou vincule este motor antes de executar o teste local.');
  await health(engine, root, services);
  const testRoot = join(services.dataDir, 'engine-tests');
  await mkdir(testRoot, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(testRoot, `${engine}-`));
  try {
    if (engine === 'postnow') {
      const python = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
      const env = await toolEnvironment(services);
      env.POSTNOW_HOME = directory;
      env.PYTHONPATH = root;
      const fixture = join(directory, 'fixture.png');
      const made = await services.capture(python, ['-c', `from PIL import Image; Image.new("RGBA", (1080, 1080), (18, 17, 16, 255)).save(${JSON.stringify(fixture)})`], { cwd: directory, env, timeoutMs: 15000 });
      if (made.code !== 0) throw new Error('Não foi possível criar a imagem-fixture temporária do teste PostNow.');
      const added = await services.capture(python, ['-m', 'postnow', 'client', 'add', '--non-interactive', '--name', 'Studio engine test', '--logo', fixture, '--page-count', '3'], { cwd: root, env, timeoutMs: 30000 });
      if (added.code !== 0) throw new Error('PostNow não conseguiu cadastrar o perfil temporário de teste.');
      const outputPath = join(directory, 'logo-applied.png');
      const applied = await services.capture(python, ['-m', 'postnow', 'logo', 'apply', '--client', 'studio-engine-test', '--input', fixture, '--output', outputPath, '--x', '824', '--y', '876', '--width', '180'], { cwd: root, env, timeoutMs: 30000 });
      if (applied.code !== 0) throw new Error(`PostNow não conseguiu aplicar a logo oficial na fixture: ${applied.stderr.trim()}`);
      const image = await readFile(outputPath);
      if (image.toString('hex', 0, 8) !== '89504e470d0a1a0a' || image.readUInt32BE(16) !== 1080 || image.readUInt32BE(20) !== 1080) throw new Error('PostNow não gerou a saída PNG esperada de 1080 × 1080.');
      return { message: 'PostNow respondeu ao diagnóstico e aplicou a logo pelo CLI oficial em uma imagem-fixture temporária. O motor não gera imagens por IA.' };
    }
    const node = await requireVersion('node', engine === 'videogo' ? 22 : 20, engine === 'videogo' ? 0 : 19, services);
    const entry = join(root, engine === 'videogo' ? 'dist/cli/index.js' : 'bin/orquestrador-maestro.js');
    if (engine === 'maestro') {
      const result = await services.capture(node, [entry, 'context', 'brief', '--project-path', directory, '--task', 'Teste local do Studio', '--max-chars', '1000', '--json'], { cwd: directory, env: await toolEnvironment(services), timeoutMs: 30000 });
      if (result.code !== 0) throw new Error('Maestro não concluiu o teste local de contexto. Nenhuma chamada de IA foi feita.');
      JSON.parse(result.stdout);
      return { message: 'Maestro montou um contexto local de teste. Nenhum modelo foi chamado e a pasta temporária foi removida.' };
    }
    const storyboard = {
      schema: 'videogo.storyboard/v1', status: 'ready', id: 'studio-local-test', title: 'Teste local do Studio',
      language: 'pt-BR', objective: 'Validar renderização local', audience: 'Teste', format: 'reels', style: 'auto', fps: 30,
      durationTargetSeconds: 3, tone: ['claro'],
      scenes: [{ id: 'studio-test-scene', purpose: 'hook', engine: 'auto', targetSeconds: 3, narration: '', onScreen: ['Teste local'],
        visual: { kind: 'typography', direction: 'Cartão simples para validar o render.', layout: 'none', camera: 'static' },
        audio: { sfx: [], sfxCues: [], sourceAudio: false }, sources: [] }],
      soundDesign: { whooshes: false }, review: { factual: false, visual: false, audio: false },
    };
    const storyboardPath = join(directory, 'storyboard.json');
    const outputPath = join(directory, 'test.mp4');
    await writeFile(storyboardPath, JSON.stringify(storyboard));
    const job = await services.run({ title: 'VideoGo: teste local isolado (voz demo silenciosa)', executable: node,
      args: [entry, 'project', 'render', storyboardPath, '--voice', 'demo', '--output', outputPath],
      cwd: root, env: await toolEnvironment(services), timeoutMs: 10 * 60 * 1000 });
    const completed = await services.waitJob(job.id);
    if (completed.status !== 'succeeded') throw new Error(`O teste local do VideoGo falhou. Consulte o job ${job.id}.`);
    const probe = await services.capture(await requireTool('ffprobe', services), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', outputPath], { timeoutMs: 15000 });
    if (probe.code !== 0 || !(Number(probe.stdout.trim()) > 0)) throw new Error('VideoGo não gerou um vídeo MP4 válido no teste local.');
    return { message: 'VideoGo renderizou um vídeo de teste sem voz paga. A pasta temporária foi removida.' };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function installPython(root: string, services: Services): Promise<void> {
  const python = await requireVersion('python', 3, 11, services);
  const env = await toolEnvironment(services);
  const venvDir = join(root, '.venv');
  const uv = await resolveTool('uv', services);
  const runtime = join(venvDir, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (uv) {
    await stage(services, { title: 'PostNow: criar ambiente Python isolado via uv', executable: uv, args: ['venv', '--seed', venvDir, '--python', python], cwd: root, env });
  } else {
    await stage(services, { title: 'PostNow: criar ambiente Python isolado', executable: python, args: ['-m', 'venv', '--without-pip', venvDir], cwd: root, env });
    const bootstrapPip = [
      'import hashlib, io, json, sysconfig, urllib.request, zipfile',
      'meta = json.loads(urllib.request.urlopen("https://pypi.org/pypi/pip/json", timeout=30).read())',
      'wheel = next(u for u in meta["urls"] if u["packagetype"] == "bdist_wheel" and u["filename"].endswith("-py3-none-any.whl"))',
      'data = urllib.request.urlopen(wheel["url"], timeout=60).read()',
      'assert hashlib.sha256(data).hexdigest() == wheel["digests"]["sha256"], "SHA-256 inválido"',
      'zipfile.ZipFile(io.BytesIO(data)).extractall(sysconfig.get_paths()["purelib"])',
    ].join('; ');
    await stage(services, { title: 'PostNow: provisionar pip oficial no ambiente isolado', executable: runtime, args: ['-c', bootstrapPip], cwd: root, env });
  }
  const dependencyJson = await checkedCapture(services, runtime, ['-c', 'import json,tomllib; p=tomllib.load(open("pyproject.toml","rb")); print(json.dumps(p["project"].get("dependencies",[])+p["build-system"]["requires"]))'], { cwd: root, env, timeoutMs: 15000 }, 'Não foi possível ler as dependências Python declaradas.');
  const dependencies: unknown = JSON.parse(dependencyJson);
  if (!Array.isArray(dependencies) || dependencies.some(value => typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.[\],<>=!~ ;'"()-]*$/.test(value))) throw new Error('Dependências Python contêm fontes não suportadas. Apenas pacotes declarados do PyPI são aceitos.');
  const lockRoot = join(root, '.studio-lock');
  const wheels = join(lockRoot, 'wheels');
  await mkdir(wheels, { recursive: true, mode: 0o700 });
  await stage(services, { title: 'PostNow: resolver e baixar wheels oficiais para lock local', executable: runtime,
    args: ['-m', 'pip', '--isolated', 'download', '--index-url', 'https://pypi.org/simple', '--only-binary=:all:', '--dest', wheels, ...dependencies as string[]], cwd: root, env });
  const records: string[] = [];
  for (const filename of (await readdir(wheels)).sort()) {
    const match = filename.match(/^([A-Za-z0-9_.]+)-([A-Za-z0-9_.+!]+)-.+\.whl$/);
    if (!match) throw new Error('O download Python contém um artefato inesperado.');
    records.push(`${match[1]!.replace(/_/g, '-')}==${match[2]} --hash=sha256:${await hashFile(join(wheels, filename))}`);
  }
  if (!records.length) throw new Error('Nenhuma dependência Python foi resolvida.');
  const lock = join(lockRoot, 'requirements.lock');
  await writeFile(lock, records.join('\n') + '\n', { mode: 0o600 });
  await stage(services, { title: 'PostNow: instalar dependências offline com hashes fixados', executable: runtime,
    args: ['-m', 'pip', '--isolated', 'install', '--no-index', '--find-links', wheels, '--require-hashes', '-r', lock], cwd: root, env });
  await stage(services, { title: 'PostNow: instalar pacote sem resolver novas dependências', executable: runtime,
    args: ['-m', 'pip', '--isolated', 'install', '--no-index', '--no-deps', '--no-build-isolation', '.'], cwd: root, env });
}

async function historyFile(engine: EngineId, services: Services): Promise<{ path: string; value: History }> {
  const directory = join(services.dataDir, 'engines', engine);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'history.json');
  if (!await exists(path)) return { path, value: { previous: [] } };
  const parsed = await objectFile(path);
  if (!Array.isArray(parsed.previous) || parsed.previous.some(item => typeof item !== 'string' || !isAbsolute(item))) throw new Error('Histórico de versões inválido. A configuração ativa foi preservada.');
  return { path, value: { previous: parsed.previous as string[] } };
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}

async function activate(engine: EngineId, root: string, services: Services): Promise<Settings> {
  const current = services.getSettings().enginePaths[engine];
  const history = await historyFile(engine, services);
  const previous = [...new Set([...(current ? [current] : []), ...history.value.previous])].filter(path => path !== root);
  // Persist the rollback pointer before publishing the new active path.
  await atomicJson(history.path, { previous });
  try {
    const settings = await services.saveSettings({ enginePaths: { ...services.getSettings().enginePaths, [engine]: root } });
    services.emit({ type: 'refresh' });
    return settings;
  } catch (error) {
    await atomicJson(history.path, history.value);
    throw error;
  }
}

export async function linkEngine(engine: EngineId, path: string, services: Services): Promise<Settings> {
  const root = await safePath(path, true);
  await health(engine, root, services);
  return activate(engine, root, services);
}

export async function manageEngine(engine: EngineId, operation: string, services: Services): Promise<{ message: string; path: string; version: string }> {
  if (!['install', 'update', 'rollback'].includes(operation)) throw new Error('Operação de motor desconhecida.');
  const current = services.getSettings().enginePaths[engine];
  if (operation === 'rollback') {
    const history = await historyFile(engine, services);
    const previous = history.value.previous.find(path => path !== current);
    if (!previous) throw new Error('Não há versão anterior registrada para restaurar.');
    await health(engine, previous, services);
    const version = await inspect(engine, previous, true);
    await activate(engine, previous, services);
    return { message: 'Versão anterior validada e restaurada. Seus projetos não foram alterados.', path: previous, version };
  }
  if (operation === 'install' && current) throw new Error('Motor já configurado. Use atualizar ou vincule outra instalação validada.');
  if (operation === 'update' && !current) throw new Error('Instale ou vincule o motor antes de atualizar.');
  await prepareTools(engine, services);
  const git = await requireTool('git', services);
  const source = await sourceVersion(engine, services);
  if (current && await exists(join(current, '.studio-install.json'))) {
    const active = await objectFile(join(current, '.studio-install.json'));
    if (active.commit === source.sha && active.ready === true) {
      await health(engine, current, services);
      return { message: 'O commit remoto já está instalado e passou no diagnóstico.', path: current, version: await inspect(engine, current, true) };
    }
  }
  const versions = join(services.dataDir, 'engines', engine, 'versions');
  await mkdir(versions, { recursive: true, mode: 0o700 });
  // The final immutable location doubles as staging: moving a Python venv would break its launchers.
  // Only saveSettings makes this path active; unfinished stages can never replace a working version.
  const root = join(versions, `${source.sha.slice(0, 12)}-${randomUUID()}`);
  let activated = false;
  try {
    const gh = source.private ? await requireTool('gh', services) : undefined;
    const env = await environmentWithExecutables(services, gh ? [gh] : []);
    env.GIT_TERMINAL_PROMPT = '0';
    env.GH_PROMPT_DISABLED = '1';
    const credentials = source.private ? ['-c', 'credential.helper=', '-c', 'credential.https://github.com.helper=!gh auth git-credential'] : [];
    await stage(services, { title: `${engine}: baixar repositório autorizado (acesso não equivale a licença)`, executable: git,
      args: [...credentials, 'clone', '--no-checkout', '--filter=blob:none', '--', `https://github.com/${repositories[engine]}.git`, root], env });
    await stage(services, { title: `${engine}: fixar commit ${source.sha.slice(0, 12)}`, executable: git,
      args: [...credentials, '-C', root, 'checkout', '--detach', source.sha], env });
    const actual = await checkedCapture(services, git, ['-C', root, 'rev-parse', 'HEAD'], { env, timeoutMs: 15000 }, 'Não foi possível confirmar o commit instalado.');
    if (actual.trim() !== source.sha) throw new Error('O checkout não corresponde ao commit aprovado.');
    const version = await inspect(engine, root, false);
    if (engine === 'postnow') await installPython(root, services);
    else {
      await safePath(join(root, 'package-lock.json'), false);
      const npm = await requireTool('npm', services);
      await stage(services, { title: `${engine}: instalar dependências do lock versionado`, executable: npm,
        args: ['ci', '--include=dev', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'], cwd: root, env });
      if (engine === 'videogo') await stage(services, { title: 'VideoGo: compilar CLI da versão isolada', executable: npm, args: ['run', 'build'], cwd: root, env });
    }
    await health(engine, root, services);
    const metadata: Installation = { engine, repository: repositories[engine], commit: source.sha, version, ready: true };
    await atomicJson(join(root, '.studio-install.json'), metadata);
    await activate(engine, root, services);
    activated = true;
    return { message: 'Motor validado e ativado. Versão anterior preservada para rollback. Acesso ao código não substitui a licença de uso; motores opcionais de render podem exigir dependências adicionais.', path: root, version };
  } finally {
    if (!activated) await rm(root, { recursive: true, force: true });
  }
}
