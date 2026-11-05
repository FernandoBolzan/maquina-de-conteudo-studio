import type { CliId, SetupStatus } from '../shared/contracts.js';
import { consent, text, type Services } from './context.js';
import { engineId, engineStatuses, linkEngine, manageEngine } from './setup/engines.js';
import { checkCliUpdates, installTool, manageCliTool, requireTool, toolEnvironment, toolStatus } from './setup/tools.js';
export { resolveTool, toolEnvironment } from './setup/tools.js';

const queues = new Map<string, Promise<void>>();
const logins = new Set<string>();
const toolIds = ['git', 'node', 'npm', 'python', 'ffmpeg', 'gh', 'codex', 'claude', 'maestro', 'hyperframes'];

async function serialize<T>(services: Services, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(services.dataDir) ?? Promise.resolve();
  const { promise: pending, resolve: release } = Promise.withResolvers<void>();
  const queued = previous.then(() => pending);
  queues.set(services.dataDir, queued);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (queues.get(services.dataDir) === queued) queues.delete(services.dataDir);
  }
}

async function status(services: Services): Promise<SetupStatus> {
  const [tools, engines] = await Promise.all([
    Promise.all(toolIds.map(id => toolStatus(id, services))),
    engineStatuses(services),
  ]);
  const github = tools.find(tool => tool.id === 'gh');
  return { tools, engines, github: { authenticated: github?.authenticated === true }, platform: process.platform };
}

export async function handleSetup(action: string, payload: Record<string, unknown>, services: Services): Promise<unknown> {
  if (action === 'setup.status') return status(services);
  if (action === 'setup.cliUpdates') return checkCliUpdates(services);
  if (!['setup.install', 'setup.login', 'setup.engine', 'setup.link', 'setup.cli'].includes(action)) throw new Error('Ação de configuração desconhecida.');
  consent(payload);
  if (action === 'setup.login') {
    const provider = text(payload, 'provider', 20);
    if (!['github', 'codex', 'claude'].includes(provider)) throw new Error('Provedor de login desconhecido.');
    const key = `${services.dataDir}:${provider}`;
    if (logins.has(key)) throw new Error('Já existe um login em andamento para este provedor. Use o terminal aberto.');
    logins.add(key);
    try {
      const executable = await requireTool(provider === 'github' ? 'gh' : provider, services);
      const args = provider === 'github' ? ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web']
        : provider === 'claude' ? ['auth', 'login'] : ['login'];
      const job = await services.run({ title: `Login ${provider} — conclua a autorização no navegador/terminal`, executable, args,
        env: await toolEnvironment(services), interactive: true });
      // Interactive jobs are supervised without persisted credential-bearing terminal logs.
      void services.waitJob(job.id).then(() => services.emit({ type: 'refresh' })).catch(() => undefined).finally(() => logins.delete(key));
      return job;
    } catch (error) { logins.delete(key); throw error; }
  }
  if (action === 'setup.cli') {
    const tool = text(payload, 'tool', 20);
    const operation = text(payload, 'operation', 20);
    if (tool !== 'codex' && tool !== 'claude') throw new Error('CLI de provedor desconhecido.');
    if (!['install', 'update', 'rollback'].includes(operation)) throw new Error('Operação de CLI desconhecida.');
    return serialize(services, async () => {
      if (services.jobs().some(job => job.status === 'running' && job.projectId)) throw new Error('Aguarde ou cancele os jobs de projeto antes de alterar ferramentas.');
      return manageCliTool(tool as CliId, operation as 'install' | 'update' | 'rollback', services);
    });
  }
  return serialize(services, async () => {
    if (services.jobs().some(job => job.status === 'running' && job.projectId)) throw new Error('Aguarde ou cancele os jobs de projeto antes de alterar instalações de ferramentas/motores.');
    if (action === 'setup.install') {
      const tool = text(payload, 'tool', 40);
      if (tool === 'codex' || tool === 'claude') throw new Error('Use o fluxo de instalação e atualização gerenciada do cartão do CLI.');
      const job = await installTool(tool, services);
      const completed = await services.waitJob(job.id);
      services.emit({ type: 'refresh' });
      if (completed.status !== 'succeeded') throw new Error(`Instalação ${completed.status === 'cancelled' ? 'cancelada' : 'não concluída'}. Consulte o terminal do job ${job.id}. No Linux, autorize o diálogo administrativo; no Windows, instaladores sem escopo usuário exigem instalação manual pelo administrador. Nenhuma elevação automática é feita.`);
      return completed;
    }
    const engine = engineId(payload.engine);
    if (action === 'setup.link') return linkEngine(engine, text(payload, 'path', 4096), services);
    return manageEngine(engine, text(payload, 'operation', 20), services);
  });
}
