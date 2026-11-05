import { useCallback, useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, ChevronRight, CloudDownload, ExternalLink, FolderOpen, KeyRound, Link2, PackagePlus, RefreshCw, RotateCcw, ShieldAlert, Wrench } from 'lucide-react';
import type { CliId, CliOperationResult, CliUpdateStatus, EngineId, EngineStatus, Job, Provider, Settings, SetupStatus, ToolStatus } from '../shared/contracts';
import { ErrorNotice, ExternalLabel, Loading, PageHeading } from './components';
import { errorMessage, invoke, type ScreenProps } from './state';

interface SetupProps extends ScreenProps { onGoProjects: () => void; }
const CLI_LABELS: Record<CliId, string> = { codex: 'OpenAI Codex', claude: 'Claude Code' };
const CLI_EXPLANATIONS: Record<CliId, string> = {
  codex: 'Assistente de programação da OpenAI. Ele pode ler e editar os arquivos do projeto depois que você autorizar uma sessão.',
  claude: 'Assistente de programação da Anthropic. Ele pode ler e editar os arquivos do projeto depois que você autorizar uma sessão.',
};
const engineLabels: Record<EngineId, { title: string; role: string; access: string }> = {
  videogo: { title: 'VideoGo', role: 'Monta storyboards e gera vídeos verticais, como Reels, no seu computador.', access: 'Instale ou vincule o motor. A renderização também precisa de FFmpeg; projetos e arquivos continuam na sua pasta de trabalho.' },
  postnow: { title: 'PostNow', role: 'Organiza briefings e cria carrosséis e peças para redes sociais.', access: 'Instale ou vincule o motor. O render de imagens pode precisar de Python e Pillow.' },
  maestro: { title: 'Orquestrador Maestro', role: 'Prepara contexto e ajuda o agente de IA a entender seu projeto.', access: 'Opcional. Pode ser conectado quando você quiser usar esse fluxo.' },
};

export function Setup({ snapshot, run, busy, confirm, openJob, refresh, onGoProjects }: SetupProps) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loadError, setLoadError] = useState('');
  const [cliUpdates, setCliUpdates] = useState<CliUpdateStatus[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updatesError, setUpdatesError] = useState('');
  const [guideOpen, setGuideOpen] = useState(!snapshot.settings.onboardingCompleted);
  const [provider, setProvider] = useState<Provider>(snapshot.settings.provider);

  const checkCliVersions = useCallback(async () => {
    setUpdatesLoading(true);
    setUpdatesError('');
    try { setCliUpdates(await invoke<CliUpdateStatus[]>('setup.cliUpdates')); }
    catch (error) { setUpdatesError(errorMessage(error)); }
    finally { setUpdatesLoading(false); }
  }, []);
  const load = useCallback(async () => {
    setLoadError('');
    try {
      setStatus(await invoke<SetupStatus>('setup.status'));
      void checkCliVersions();
    } catch (error) { setLoadError(errorMessage(error)); }
  }, [checkCliVersions]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setProvider(snapshot.settings.provider);
    if (!snapshot.settings.onboardingCompleted) setGuideOpen(true);
  }, [snapshot.settings.provider, snapshot.settings.onboardingCompleted]);

  async function login(id: 'github' | CliId, label: string) {
    if (!await confirm(`Autenticar ${label}`, `O login oficial será aberto no console. Siga as instruções do provedor; suas credenciais ficam na ferramenta oficial, não no Studio.`, 'Abrir login no console')) return;
    const job = await run(`login-${id}`, () => invoke<Job>('setup.login', { provider: id, confirm: true }));
    if (job) openJob(job);
  }
  async function manageCli(tool: CliId, operation: 'install' | 'update' | 'rollback') {
    const title = CLI_LABELS[tool];
    const label = operation === 'install' ? 'Instalar cópia gerenciada' : operation === 'update' ? 'Atualizar' : 'Restaurar versão anterior de';
    const explanation = operation === 'rollback'
      ? 'Restaurar a última versão que o Studio atualizou. A versão atual ficará guardada para poder reverter novamente.'
      : operation === 'update'
        ? 'Baixar a versão estável oficial em uma pasta temporária, testá-la e só então ativá-la. A versão anterior fica disponível para rollback.'
        : `Instalar a versão estável oficial em uma pasta privada do Studio. Uma eventual instalação global não será alterada.`;
    if (!await confirm(`${label} ${title}`, explanation, `${label} ${title}`)) return;
    const result = await run(`cli-${tool}-${operation}`, () => invoke<CliOperationResult>('setup.cli', { tool, operation, confirm: true }));
    if (result?.job) openJob(result.job);
    if (result) {
      await load();
      await refresh();
    }
  }
  async function install(tool: ToolStatus) {
    if (!await confirm(`Instalar ${tool.name}`, `Instalar ${tool.name} usando a origem oficial configurada para a plataforma? Ferramentas já instaladas nunca são sobrescritas automaticamente.`, 'Confirmar instalação')) return;
    const job = await run(`install-${tool.id}`, () => invoke<Job>('setup.install', { tool: tool.id, confirm: true }), `${tool.name} instalado.`);
    if (job) openJob(job);
    await load(); await refresh();
  }
  async function manage(engine: EngineStatus, operation: 'install' | 'update' | 'rollback') {
    const label = operation === 'install' ? 'Instalar' : operation === 'update' ? 'Atualizar' : 'Restaurar versão anterior de';
    if (!await confirm(`${label} ${engineLabels[engine.id].title}`, `Operação transacional em diretório isolado para ${engineLabels[engine.id].title}. A versão ativa só muda se o diagnóstico passar.`, 'Confirmar operação')) return;
    await run(`engine-${engine.id}-${operation}`, async () => {
      await invoke('setup.engine', { engine: engine.id, operation, confirm: true });
      await load(); await refresh();
    }, `${engineLabels[engine.id].title}: operação concluída.`);
  }
  async function link(engine: EngineStatus) {
    const picked = await invoke<string | undefined>('app.pick', { directory: true });
    if (!picked) return;
    if (!await confirm(`Vincular ${engineLabels[engine.id].title}`, `Validar e usar a instalação local em ${picked}? Seus projetos permanecem fora do clone do motor.`, 'Vincular pasta')) return;
    await run(`link-${engine.id}`, async () => {
      await invoke<Settings>('setup.link', { engine: engine.id, path: picked, confirm: true });
      await load(); await refresh();
    }, `${engineLabels[engine.id].title} vinculado.`);
  }
  async function chooseWorkspace() {
    const picked = await invoke<string | undefined>('app.pick', { directory: true });
    if (!picked || !await confirm('Escolher pasta de projetos', `Usar ${picked} para novas marcas e projetos? Arquivos existentes não serão movidos.`, 'Usar esta pasta')) return;
    const saved = await run('onboarding-workspace', () => invoke<Settings>('app.settings', { workspace: picked }), 'Pasta de projetos atualizada.');
    if (saved) await refresh();
  }
  async function saveProvider(next: Provider) {
    setProvider(next);
    await run('onboarding-provider', async () => {
      await invoke<Settings>('app.settings', { provider: next });
      await refresh();
    }, 'Assistente padrão atualizado.');
  }
  async function finishOnboarding() {
    const saved = await run('onboarding-complete', () => invoke<Settings>('app.onboarding.complete'), 'Primeiros passos concluídos. Você pode voltar a esta configuração quando quiser.');
    if (saved) { setGuideOpen(false); await refresh(); onGoProjects(); }
  }
  return <>
    <PageHeading eyebrow={snapshot.settings.onboardingCompleted ? 'DIAGNÓSTICO E PROVISIONAMENTO' : 'BEM-VINDO AO STUDIO'} title={snapshot.settings.onboardingCompleted ? 'Configuração do ambiente' : 'Primeiros passos'} description={snapshot.settings.onboardingCompleted ? 'Veja o que está instalado, atualize os CLIs e conecte os motores que você usa.' : 'Vamos preparar o básico. Você pode concluir agora ou voltar a estas etapas depois.'} actions={<div className="heading-actions">{(!guideOpen || snapshot.settings.onboardingCompleted) && <button className="button secondary" onClick={() => setGuideOpen(true)}><BookOpen size={15} />Guia inicial</button>}<button className="button" disabled={busy.has('setup-refresh')} onClick={() => { void run('setup-refresh', load, 'Diagnóstico atualizado.'); }}><RefreshCw size={16} />Verificar novamente</button></div>} />
    {loadError && <ErrorNotice message={loadError} />}
    {!status ? <Loading label="Verificando ferramentas deste computador…" /> : <div className="setup-stack">
      {guideOpen && <section className="onboarding-guide" aria-labelledby="onboarding-title">
        <div className="onboarding-heading">
          <span className="eyebrow">UM GUIA RÁPIDO</span>
          <h2 id="onboarding-title">Deixe o Studio pronto para criar</h2>
          <p>Os projetos ficam no seu computador. Para usar um assistente de IA, instale o CLI e entre na sua conta; motores de imagem e vídeo são opcionais.</p>
        </div>
        <ol className="onboarding-steps">
          <li className="onboarding-step">
            <span className="onboarding-step-number">1</span>
            <div><h3>Escolha onde salvar</h3><p>Esta pasta guarda projetos, marcas e arquivos. Nada será movido da pasta atual.</p><code className="mono-path">{snapshot.settings.workspace}</code></div>
            <button type="button" className="button small" onClick={() => { void chooseWorkspace(); }}><FolderOpen size={14} />Escolher pasta</button>
          </li>
          <li className="onboarding-step">
            <span className="onboarding-step-number">2</span>
            <div><h3>Prepare seu assistente de IA</h3><p>Escolha Codex ou Claude Code. O CLI e o login são independentes; suas credenciais ficam no provedor.</p><label className="onboarding-provider">Assistente padrão<select value={provider} disabled={busy.has('onboarding-provider')} onChange={event => { void saveProvider(event.target.value as Provider); }}><option value="codex">OpenAI Codex</option><option value="claude">Claude Code</option></select></label></div>
            {(() => {
              const cli = status.tools.find(tool => tool.id === provider);
              const latest = cliUpdates.find(item => item.id === provider);
              const outdated = latest?.state === 'update-available' || latest?.state === 'external-update-available';
              const ready = cli?.installed && cli.authenticated && !outdated;
              return <span className={`status-pill ${ready ? 'ok' : 'warn'}`}>{ready ? 'Pronto' : !cli?.installed ? 'Instale abaixo' : !cli.authenticated ? 'Precisa entrar' : outdated ? 'Atualize abaixo' : 'Verificando'}</span>;
            })()}
          </li>
          <li className="onboarding-step">
            <span className="onboarding-step-number">3</span>
            <div><h3>Instale só os motores que usar</h3><p>PostNow cria peças e carrosséis; VideoGo monta vídeos; Maestro prepara contexto para o assistente. Você pode instalar cada um nesta mesma página quando precisar.</p></div>
            <span className="status-pill">{status.engines.some(engine => engine.installed) ? `${status.engines.filter(engine => engine.installed).length} ativo(s)` : 'Opcionais'}</span>
          </li>
        </ol>
        <div className="onboarding-footer">
          <p>Não é obrigatório configurar tudo agora. Sem CLI autenticado, você ainda pode criar projetos e preparar briefings; ações de IA ficam indisponíveis até o login.</p>
          <div className="card-actions"><button type="button" className="button primary" disabled={busy.has('onboarding-complete')} onClick={() => { void finishOnboarding(); }}>Concluir e começar<ChevronRight size={15} /></button><button type="button" className="button ghost" onClick={() => { void finishOnboarding(); }}>Agora não</button></div>
        </div>
      </section>}
      <section className="setup-section">
        <div className="section-heading"><div><h2>Assistentes e login oficial</h2><p className="field-help">Instale ou atualize Codex/Claude Code aqui. O login abre o terminal oficial; o Studio não vê nem guarda senhas.</p></div><button type="button" className="button small" disabled={updatesLoading} onClick={() => { void run('cli-version-check', checkCliVersions, 'Versões verificadas.'); }}><RefreshCw size={14} className={updatesLoading ? 'spin' : ''} />{updatesLoading ? 'Consultando versões…' : 'Verificar versões'}</button></div>
        {updatesError && <p className="warning-text" role="status">{updatesError} Os CLIs instalados continuam disponíveis.</p>}
        <div className="auth-grid">
          {([
            ['github', 'GitHub CLI', status.tools.find(tool => tool.id === 'gh')],
            ['codex', CLI_LABELS.codex, status.tools.find(tool => tool.id === 'codex')],
            ['claude', CLI_LABELS.claude, status.tools.find(tool => tool.id === 'claude')],
          ] as const).map(([id, title, tool]) => {
            const cliId: CliId | undefined = id === 'codex' || id === 'claude' ? id : undefined;
            const update = cliId ? cliUpdates.find(item => item.id === cliId) : undefined;
            const statusLabel = update?.state === 'update-available' || update?.state === 'external-update-available' ? 'Atualização disponível' : tool?.authenticated ? 'Autenticado' : tool?.installed ? 'Sessão pendente' : 'CLI ausente';
            return <article className="setup-card" key={id}>
              <div className="setup-card-head"><strong>{title}</strong><span className={`status-pill ${tool?.authenticated && update?.state !== 'update-available' && update?.state !== 'external-update-available' ? 'ok' : 'warn'}`}>{statusLabel}</span></div>
              {cliId && <p>{CLI_EXPLANATIONS[cliId]}</p>}
              <p>{tool?.detail || (tool?.authenticated ? `Versão ${tool.version ?? 'instalada'} pronta para uso.` : tool?.installed ? 'CLI instalado; entre na conta para iniciar sessões de IA.' : 'CLI não encontrado. Instale a versão oficial em uma pasta privada do Studio.')}</p>
              {update && <p className="field-help">{update.detail}</p>}
              {updatesLoading && cliId && !update && <p className="field-help">Consultando a versão estável no registro oficial…</p>}
              <div className="card-actions">
                {cliId && update?.state === 'missing' && <button type="button" className="button small primary" disabled={busy.has(`cli-${cliId}-install`)} onClick={() => { void manageCli(cliId, 'install'); }}><PackagePlus size={14} />Instalar CLI</button>}
                {cliId && update?.state === 'update-available' && <button type="button" className="button small primary" disabled={busy.has(`cli-${cliId}-update`)} onClick={() => { void manageCli(cliId, 'update'); }}><CloudDownload size={14} />Atualizar</button>}
                {cliId && update?.state === 'external-update-available' && <button type="button" className="button small primary" disabled={busy.has(`cli-${cliId}-install`)} onClick={() => { void manageCli(cliId, 'install'); }}><PackagePlus size={14} />Instalar cópia do Studio</button>}
                {cliId && update?.canRollback && <button type="button" className="button small" disabled={busy.has(`cli-${cliId}-rollback`)} onClick={() => { void manageCli(cliId, 'rollback'); }}><RotateCcw size={14} />Reverter versão</button>}
                <button type="button" className="button small primary" disabled={!tool?.installed || busy.has(`login-${id}`)} onClick={() => { if (id === 'github' || id === 'codex' || id === 'claude') void login(id, title); }}><KeyRound size={14} />{tool?.authenticated ? 'Abrir login' : 'Entrar na conta'}</button>
              </div>
            </article>;
          })}
        </div>
      </section>

      <section className="setup-section">
        <div className="section-heading"><div><h2>Motores de conteúdo</h2><p className="field-help">Motores são opcionais e podem ser instalados quando você precisar criar imagens ou vídeos. A instalação é isolada, validada antes de ativar e permite rollback.</p></div></div>
        <div className="engine-grid">
          {status.engines.map(engine => {
            const meta = engineLabels[engine.id];
            return <article className="setup-card" key={engine.id}>
              <div className="setup-card-head"><div><strong>{meta.title}</strong><small className="mono-note">{engine.version ? `v${engine.version}` : 'Não instalado'}</small></div><span className={`status-pill ${engine.installed ? 'ok' : 'warn'}`}>{engine.installed ? 'Pronto' : 'Opcional'}</span></div>
              <p>{meta.role}</p><p className="field-help">{meta.access}</p>
              {engine.path && <p className="mono-path" title={engine.path}>{engine.path}</p>}
              <div className="card-actions">
                {!engine.installed ? <button type="button" className="button small primary" disabled={busy.has(`engine-${engine.id}-install`)} onClick={() => { void manage(engine, 'install'); }}><CloudDownload size={14} />Instalar motor</button> : <button type="button" className="button small" disabled={busy.has(`engine-${engine.id}-update`)} onClick={() => { void manage(engine, 'update'); }}><RefreshCw size={14} />Atualizar</button>}
                <button type="button" className="button small" disabled={busy.has(`link-${engine.id}`)} onClick={() => { void link(engine); }}><Link2 size={14} />Vincular pasta</button>
                <button type="button" className="button small" disabled={!engine.installed || busy.has(`engine-${engine.id}-rollback`)} onClick={() => { void manage(engine, 'rollback'); }}><RotateCcw size={14} />Reverter versão</button>
                <button type="button" className="button small ghost" onClick={() => { void invoke('app.external', { url: engine.repository }); }}><ExternalLabel>Repositório</ExternalLabel></button>
              </div>
            </article>;
          })}
        </div>
      </section>

      <section className="setup-section">
        <div className="section-heading"><div><h2>Ferramentas necessárias no computador ({status.platform})</h2><p className="field-help">Node.js, Python, FFmpeg e Git são dependências técnicas. O Studio avisa quando alguma faltar e pede confirmação antes de instalar.</p></div></div>
        <div className="tool-list">
          {status.tools.filter(tool => tool.id !== 'codex' && tool.id !== 'claude').map(tool => (
            <div className="tool-row" key={tool.id}>
              <div className="tool-main">
                {tool.installed ? <CheckCircle2 size={18} className="icon-ok" /> : <ShieldAlert size={18} className="icon-warn" />}
                <div><strong>{tool.name}</strong><span className="mono-note">{tool.version ? `v${tool.version}` : 'não instalado'}</span>{tool.detail && <p>{tool.detail}</p>}</div>
              </div>
              <div className="card-actions">{!tool.installed && <button type="button" className="button small" disabled={busy.has(`install-${tool.id}`)} onClick={() => { void install(tool); }}><PackagePlus size={14} />Instalar</button>}</div>
            </div>
          ))}
        </div>
      </section>
    </div>}
  </>;
}

export function Preferences({ snapshot, run, refresh, busy, confirm }: ScreenProps) {
  const [provider, setProvider] = useState<Provider>(snapshot.settings.provider);
  const [updateNote, setUpdateNote] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);

  async function pickWorkspace() {
    const picked = await invoke<string | undefined>('app.pick', { directory: true });
    if (!picked) return;
    if (!await confirm('Alterar pasta de trabalho', `Usar ${picked} como pasta de projetos e marcas? Os arquivos atuais permanecem onde estão.`, 'Salvar workspace')) return;
    await run('save-workspace', async () => {
      await invoke<Settings>('app.settings', { workspace: picked });
      await refresh();
    }, 'Pasta de trabalho atualizada.');
  }
  async function saveProvider(next: Provider) {
    setProvider(next);
    await run('save-provider', async () => {
      await invoke<Settings>('app.settings', { provider: next });
      await refresh();
    }, 'Agente padrão atualizado.');
  }
  async function checkUpdates() {
    await run('update-check', async () => {
      const result = await invoke<{ available: boolean; version?: string; message: string }>('app.updateCheck');
      setUpdateAvailable(result.available);
      setUpdateNote(result.message + (result.version ? ` (${result.version})` : ''));
    });
  }
  async function installUpdate() {
    if (!await confirm('Instalar atualização do aplicativo', 'Baixar a atualização e reiniciar o aplicativo agora? Finalize as tarefas em andamento antes de continuar.', 'Atualizar e reiniciar')) return;
    await run('update-install', async () => {
      const result = await invoke<{ message: string }>('app.updateInstall', { confirm: true });
      setUpdateNote(result.message);
    });
  }

  return <>
    <PageHeading eyebrow="PREFERÊNCIAS DO ESTÚDIO" title="Preferências" description="Defina onde seus projetos ficam salvos, qual agente abre por padrão e consulte atualizações do aplicativo." />
    <div className="setup-stack">
      <section className="setup-card">
        <div className="setup-card-head"><strong>Workspace de projetos e marcas</strong><span className="status-pill ok">Local</span></div>
        <p>Todos os projetos, logos, aprovações e pacotes exportados ficam fora dos repositórios dos motores.</p>
        <p className="mono-path">{snapshot.settings.workspace}</p>
        <div className="card-actions">
          <button className="button small" disabled={busy.has('save-workspace')} onClick={() => { void pickWorkspace(); }}><FolderOpen size={14} />Escolher outra pasta</button>
          <button className="button small" onClick={() => { void run('open-workspace', () => invoke('app.open', { path: snapshot.settings.workspace })); }}><ExternalLink size={14} />Abrir no sistema</button>
        </div>
      </section>

      <section className="setup-card">
        <div className="setup-card-head"><strong>Agente de IA padrão</strong><Wrench size={16} /></div>
        <p>Escolha qual CLI oficial será pré-selecionado ao abrir o estúdio de um projeto.</p>
        <label>Provedor padrão
          <select value={provider} disabled={busy.has('save-provider')} onChange={event => { void saveProvider(event.target.value as Provider); }}>
            <option value="codex">OpenAI Codex</option>
            <option value="claude">Anthropic Claude Code</option>
          </select>
        </label>
      </section>

      <section className="setup-card">
        <div className="setup-card-head"><strong>Atualização do aplicativo desktop</strong><span className="mono-note">v{snapshot.version}</span></div>
        <p>{updateNote || 'Verifique se há uma nova versão publicada no canal configurado pelo mantenedor.'}</p>
        <div className="card-actions">
          <button className="button small" disabled={busy.has('update-check')} onClick={() => { void checkUpdates(); }}><RefreshCw size={14} />Verificar atualização</button>
          {updateAvailable && <button className="button small primary" disabled={busy.has('update-install')} onClick={() => { void installUpdate(); }}><CloudDownload size={14} />Baixar e instalar</button>}
        </div>
      </section>
    </div>
  </>;
}
