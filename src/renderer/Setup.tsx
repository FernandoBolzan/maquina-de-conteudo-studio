import { useCallback, useEffect, useState } from 'react';
import {
  AudioLines,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleStop,
  CloudDownload,
  Cpu,
  ExternalLink,
  Film,
  FolderOpen,
  Image,
  KeyRound,
  Layers,
  Link2,
  LogOut,
  PackagePlus,
  Play,
  QrCode,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  Terminal,
  Wrench
} from 'lucide-react';
import type {
  CliId,
  CliOperationResult,
  CliUpdateStatus,
  EngineId,
  EngineStatus,
  Job,
  Project,
  Provider,
  Settings,
  SetupStatus,
  AppUpdateStatus,
  ToolStatus
} from '../shared/contracts';
import { ErrorNotice, ExternalLabel, Loading, PageHeading } from './components';
import { api, errorMessage, invoke, type ScreenProps } from './state';
import { VideoGoVoiceSetup } from './VideoGoVoiceSetup';
import { MobileAccessModal } from './MobileAccessModal';

export type SetupSubmenu = 'engines' | 'elevenlabs';

interface SetupProps extends ScreenProps {
  onGoProjects: (kind: Project['kind']) => void;
  voiceSetupRequested: boolean;
  onVoiceSetupConsumed: () => void;
  activeSubmenu?: SetupSubmenu;
  onSelectSubmenu?: (sub: SetupSubmenu) => void;
}

const CLI_LABELS: Record<CliId, string> = { codex: 'OpenAI Codex', claude: 'Claude Code' };
const CLI_EXPLANATIONS: Record<CliId, string> = {
  codex: 'Assistente de programação da OpenAI. Ele pode ler e editar os arquivos do projeto depois que você autorizar uma sessão.',
  claude: 'Assistente de programação da Anthropic. Ele pode ler e editar os arquivos do projeto depois que você autorizar uma sessão.',
};

const engineLabels: Record<EngineId, { title: string; role: string; access: string }> = {
  videogo: {
    title: 'VideoGo',
    role: 'Monta storyboards, gera vídeos verticais e transcreve localmente com faster-whisper no seu computador.',
    access: 'Instale ou vincule o motor para criar vídeos.'
  },
  postnow: {
    title: 'PostNow',
    role: 'Organiza briefings e cria carrosséis e peças para redes sociais.',
    access: 'Instale ou vincule o motor para criar imagens.'
  },
  maestro: {
    title: 'Orquestrador Maestro',
    role: 'Prepara contexto e ajuda o agente de IA a entender seu projeto.',
    access: 'Opcional. Pode ser conectado quando você quiser usar esse fluxo.'
  },
};

export function Setup({
  snapshot,
  run,
  busy,
  confirm,
  choose,
  openJob,
  refresh,
  onGoProjects,
  voiceSetupRequested,
  onVoiceSetupConsumed,
  activeSubmenu,
  onSelectSubmenu
}: SetupProps) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loadError, setLoadError] = useState('');
  const [cliUpdates, setCliUpdates] = useState<CliUpdateStatus[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updatesError, setUpdatesError] = useState('');
  const [guideOpen, setGuideOpen] = useState(!snapshot.settings.onboardingCompleted);
  const [provider, setProvider] = useState<Provider>(snapshot.settings.provider);
  const [firstGoal, setFirstGoal] = useState<Project['kind']>('image');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);
  const [mobileModalOpen, setMobileModalOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState<Partial<Record<EngineId, boolean>>>({});

  const [localSubmenu, setLocalSubmenu] = useState<SetupSubmenu>(voiceSetupRequested ? 'elevenlabs' : 'engines');
  const currentSubmenu = activeSubmenu ?? localSubmenu;
  const setSubmenu = (next: SetupSubmenu) => {
    setLocalSubmenu(next);
    onSelectSubmenu?.(next);
  };

  const selectedEngineId: EngineId = firstGoal === 'image' ? 'postnow' : 'videogo';
  const selectedEngine = status?.engines.find(engine => engine.id === selectedEngineId);
  const selectedAgent = status?.tools.find(tool => tool.id === provider);
  const githubReady = status?.github?.authenticated === true;
  const selectedEngineReady = Boolean(selectedEngine?.installed && selectedEngine.dependencies.every(dependency => dependency.installed));
  const integrationsReady = Boolean(selectedAgent?.installed && selectedAgent.authenticated && selectedEngineReady && (provider !== 'codex' || githubReady));
  const canFinishOnboarding = integrationsReady && (!voiceEnabled || snapshot.integrations.elevenLabs.configured);

  const readyEngines = status?.engines.filter(engine => engine.installed && engine.dependencies.every(d => d.installed)).length ?? 0;
  const systemTools = status?.tools.filter(tool => tool.id !== 'codex' && tool.id !== 'claude') ?? [];
  const installedSystemTools = systemTools.filter(tool => tool.installed).length;

  const checkCliVersions = useCallback(async () => {
    setUpdatesLoading(true);
    setUpdatesError('');
    try {
      setCliUpdates(await invoke<CliUpdateStatus[]>('setup.cliUpdates'));
    } catch (error) {
      setUpdatesError(errorMessage(error));
    } finally {
      setUpdatesLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setStatus(await invoke<SetupStatus>('setup.status'));
      void checkCliVersions();
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, [checkCliVersions]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setProvider(snapshot.settings.provider);
    if (!snapshot.settings.onboardingCompleted) setGuideOpen(true);
  }, [snapshot.settings.provider, snapshot.settings.onboardingCompleted]);

  useEffect(() => {
    if (voiceSetupRequested) {
      setSubmenu('elevenlabs');
      setShowAdvancedSetup(true);
    }
  }, [voiceSetupRequested]);

  useEffect(() => {
    if (!voiceSetupRequested || !status) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('videogo-voice-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onVoiceSetupConsumed();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [voiceSetupRequested, status, onVoiceSetupConsumed]);

  async function login(id: 'github' | CliId, label: string) {
    if (!await confirm(`Autenticar ${label}`, 'A autorização oficial será iniciada sem deixar o terminal aberto. Se o provedor pedir um código, o Studio mostrará um popup; senhas nunca são guardadas pelo Studio.', 'Iniciar autenticação')) return;
    const job = await run(`login-${id}`, () => invoke<Job>('setup.login', { provider: id, confirm: true }));
    if (job) openJob(job);
  }

  async function logout(id: 'github' | CliId, label: string) {
    if (!await confirm(`Desconectar ${label}`, 'Você sairá da conta conectada. O CLI permanecerá instalado no computador.', 'Desconectar')) return;
    await run(`logout-${id}`, () => invoke<{ success: boolean }>('setup.logout', { provider: id, confirm: true }), 'Conta desconectada com sucesso.');
  }

  async function switchAccount(id: 'github' | CliId, label: string) {
    if (!await confirm(`Trocar conta do ${label}`, 'A conta atual será desconectada e você poderá entrar com outra conta no navegador.', 'Trocar de conta')) return;
    const ok = await run(`logout-${id}`, () => invoke<{ success: boolean }>('setup.logout', { provider: id, confirm: true }), 'Desconectado da conta anterior.');
    if (ok) {
      const job = await run(`login-${id}`, () => invoke<Job>('setup.login', { provider: id, confirm: true }));
      if (job) openJob(job);
    }
  }

  async function manageCli(tool: CliId, operation: 'install' | 'update' | 'rollback') {
    const title = CLI_LABELS[tool];
    const label = operation === 'install' ? 'Instalar cópia gerenciada' : operation === 'update' ? 'Atualizar' : 'Restaurar versão anterior de';
    const explanation = operation === 'rollback'
      ? 'Restaurar a última versão que o Studio atualizou. A versão atual ficará guardada para poder reverter novamente.'
      : operation === 'update'
        ? 'Baixar a versão estável oficial em uma pasta temporária, testá-la e só então ativá-la. A versão anterior fica disponível para rollback.'
        : 'Instalar a versão estável oficial em uma pasta privada do Studio. Uma eventual instalação global não será alterada.';
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
    const job = await run(`install-${tool.id}`, () => invoke<Job>('setup.install', { tool: tool.id, confirm: true }), `Instalação de ${tool.name} iniciada.`);
    if (job) openJob(job);
    await load();
    await refresh();
  }

  async function testEngine(engine: EngineStatus) {
    const title = engineLabels[engine.id].title;
    if (!await confirm(`Testar ${title}`, 'O Studio vai executar uma verificação local em uma pasta temporária isolada e apagá-la ao terminar. VideoGo e PostNow renderizam um arquivo de teste; Maestro apenas verifica a montagem de contexto, sem chamar IA.', 'Executar teste local')) return;
    await run(`engine-${engine.id}-test`, async () => {
      const result = await invoke<{ message: string }>('setup.engineTest', { engine: engine.id, confirm: true });
      await load();
      return result;
    }, `${title}: teste local concluído.`);
  }

  async function manage(engine: EngineStatus, operation: 'install' | 'update' | 'rollback') {
    const label = operation === 'install' ? 'Instalar' : operation === 'update' ? 'Atualizar' : 'Restaurar versão anterior de';
    if (!await confirm(`${label} ${engineLabels[engine.id].title}`, operation === 'rollback' ? 'Restaurar a versão anterior do motor?' : 'O Studio também instalará as dependências necessárias. Isso pode alterar pacotes do sistema e solicitar autorização administrativa.', 'Confirmar operação')) return;
    await run(`engine-${engine.id}-${operation}`, async () => {
      setAccessDenied(previous => ({ ...previous, [engine.id]: false }));
      try {
        await invoke('setup.engine', { engine: engine.id, operation, confirm: true });
      } catch (error) {
        if (errorMessage(error).includes('ENGINE_ACCESS_DENIED')) {
          setAccessDenied(previous => ({ ...previous, [engine.id]: true }));
        }
        throw error;
      }
      await load();
      await refresh();
    }, `${engineLabels[engine.id].title}: operação concluída.`);
  }

  async function link(engine: EngineStatus) {
    const picked = await invoke<string | undefined>('app.pick', { directory: true });
    if (!picked) return;
    if (!await confirm(`Vincular ${engineLabels[engine.id].title}`, `Validar e usar a instalação local em ${picked}? Seus projetos permanecem fora do clone do motor.`, 'Vincular pasta')) return;
    await run(`link-${engine.id}`, async () => {
      await invoke<Settings>('setup.link', { engine: engine.id, path: picked, confirm: true });
      setAccessDenied(previous => ({ ...previous, [engine.id]: false }));
      await load();
      await refresh();
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
    if (saved) {
      setGuideOpen(false);
      await refresh();
      onGoProjects(firstGoal);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow={currentSubmenu === 'elevenlabs' ? 'SÍNTESE DE VOZ & NARRAÇÃO' : snapshot.settings.onboardingCompleted ? 'DIAGNÓSTICO E PROVISIONAMENTO' : 'BEM-VINDO AO STUDIO'}
        title={currentSubmenu === 'elevenlabs' ? 'ElevenLabs & Voz' : snapshot.settings.onboardingCompleted ? 'Motores & Ambiente' : 'Primeiros passos'}
        description={currentSubmenu === 'elevenlabs' ? 'Gerencie chaves seguras, biblioteca de vozes e clonagem instantânea com consentimento para os vídeos do VideoGo.' : snapshot.settings.onboardingCompleted ? 'Veja o que está instalado, atualize os CLIs oficiais e conecte os motores que você usa.' : 'Vamos preparar o básico. Você pode concluir agora ou voltar a estas etapas depois.'}
        actions={
          <div className="heading-actions">
            {currentSubmenu === 'engines' && (!guideOpen || snapshot.settings.onboardingCompleted) && (
              <button className="button secondary" onClick={() => setGuideOpen(true)}>
                <BookOpen size={15} />Guia inicial
              </button>
            )}
            <button
              className="button"
              disabled={busy.has('setup-refresh')}
              onClick={() => { void run('setup-refresh', load, 'Diagnóstico atualizado.'); }}
            >
              <RefreshCw size={15} className={busy.has('setup-refresh') ? 'spin' : ''} />
              Verificar novamente
            </button>
          </div>
        }
      />

      {/* Submenu Segmented Navigation Bar */}
      <div className="setup-subnav" role="tablist" aria-label="Seções de Motores e Setup">
        <button
          type="button"
          role="tab"
          id="tab-engines"
          aria-selected={currentSubmenu === 'engines'}
          aria-controls="panel-engines"
          className={`setup-tab-btn ${currentSubmenu === 'engines' ? 'active' : ''}`}
          onClick={() => setSubmenu('engines')}
        >
          <Wrench size={15} />
          <span>Motores &amp; CLIs</span>
          <span className="setup-tab-badge">
            {status ? `${readyEngines}/${status.engines.length}` : '…'}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-elevenlabs"
          aria-selected={currentSubmenu === 'elevenlabs'}
          aria-controls="panel-elevenlabs"
          className={`setup-tab-btn ${currentSubmenu === 'elevenlabs' ? 'active' : ''}`}
          onClick={() => setSubmenu('elevenlabs')}
        >
          <AudioLines size={15} />
          <span>ElevenLabs &amp; Voz</span>
          <span className={`status-pill ${snapshot.integrations.elevenLabs.configured ? 'ok' : 'warn'} mini`}>
            {snapshot.integrations.elevenLabs.configured ? 'Conectado' : 'Configurar'}
          </span>
        </button>
      </div>

      {loadError && <ErrorNotice message={loadError} />}

      {!status ? (
        <Loading label="Verificando ferramentas deste computador…" />
      ) : currentSubmenu === 'elevenlabs' ? (
        <VideoGoVoiceSetup
          snapshot={snapshot}
          run={run}
          refresh={refresh}
          busy={busy}
          confirm={confirm}
          choose={choose}
          openJob={openJob}
          onGoEngines={() => setSubmenu('engines')}
        />
      ) : (
        <div className="setup-stack" role="tabpanel" id="panel-engines" aria-labelledby="tab-engines">
          {/* Executive Overview Banner */}
          <div className="setup-overview-banner" role="region" aria-label="Resumo do ambiente operacional">
            <div className="setup-stat-card">
              <div className="setup-stat-icon"><Terminal size={18} /></div>
              <div className="setup-stat-info">
                <span className="setup-stat-label">Assistente de IA</span>
                <span className="setup-stat-value">
                  <span>{provider === 'codex' ? 'Codex' : 'Claude Code'}</span>
                  <span className={`status-pill ${selectedAgent?.authenticated ? 'ok' : 'warn'} mini`}>
                    {selectedAgent?.authenticated ? 'Conectado' : 'Aguardando'}
                  </span>
                </span>
              </div>
            </div>

            <div className="setup-stat-card">
              <div className="setup-stat-icon"><Layers size={18} /></div>
              <div className="setup-stat-info">
                <span className="setup-stat-label">Motores de Produção</span>
                <span className="setup-stat-value">
                  <span>{readyEngines} de {status.engines.length}</span>
                  <span className={`status-pill ${readyEngines === status.engines.length ? 'ok' : 'warn'} mini`}>
                    {readyEngines === status.engines.length ? 'Prontos' : 'Atenção'}
                  </span>
                </span>
              </div>
            </div>

            <div className="setup-stat-card">
              <div className="setup-stat-icon"><Cpu size={18} /></div>
              <div className="setup-stat-info">
                <span className="setup-stat-label">Ferramentas de Sistema</span>
                <span className="setup-stat-value">
                  <span>{installedSystemTools} de {systemTools.length}</span>
                  <span className={`status-pill ${installedSystemTools === systemTools.length ? 'ok' : 'warn'} mini`}>
                    {installedSystemTools === systemTools.length ? 'OK' : 'Faltam'}
                  </span>
                </span>
              </div>
            </div>

            <div
              className="setup-stat-card clickable"
              onClick={() => setSubmenu('elevenlabs')}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSubmenu('elevenlabs');
                }
              }}
              aria-label="Abrir submenu ElevenLabs & Voz"
              title="Abrir submenu ElevenLabs & Voz"
            >
              <div className="setup-stat-icon"><AudioLines size={18} /></div>
              <div className="setup-stat-info">
                <span className="setup-stat-label">Narração VideoGo</span>
                <span className="setup-stat-value">
                  <span>ElevenLabs</span>
                  <span className={`status-pill ${snapshot.integrations.elevenLabs.configured ? 'ok' : 'warn'} mini`}>
                    {snapshot.integrations.elevenLabs.configured ? 'Ativo' : 'Setup'}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {guideOpen && (
            <section className="onboarding-guide" aria-labelledby="onboarding-title">
              <div className="onboarding-heading">
                <span className="eyebrow">PRIMEIRO USO</span>
                <h2 id="onboarding-title">O que você quer criar primeiro?</h2>
                <p>Escolha um objetivo. O Studio prepara o agente e o motor necessários; os outros ficam para quando você precisar.</p>
              </div>
              <div className="onboarding-goals" role="group" aria-label="Primeiro conteúdo">
                <button
                  type="button"
                  className={`onboarding-goal ${firstGoal === 'image' ? 'selected' : ''}`}
                  aria-pressed={firstGoal === 'image'}
                  onClick={() => { setFirstGoal('image'); setVoiceEnabled(false); }}
                >
                  <span className="onboarding-step-number">1</span>
                  <span><strong>Carrossel ou post</strong><small>{provider === 'codex' ? 'Codex + GitHub' : 'Claude Code'} + PostNow</small></span>
                  <Image size={20} />
                </button>
                <button
                  type="button"
                  className={`onboarding-goal ${firstGoal === 'video' ? 'selected' : ''}`}
                  aria-pressed={firstGoal === 'video'}
                  onClick={() => setFirstGoal('video')}
                >
                  <span className="onboarding-step-number">2</span>
                  <span><strong>Vídeo de curiosidades</strong><small>{provider === 'codex' ? 'Codex + GitHub' : 'Claude Code'} + VideoGo</small></span>
                  <Film size={20} />
                </button>
              </div>
              {firstGoal === 'video' && (
                <label className="onboarding-voice-choice">
                  <input type="checkbox" checked={voiceEnabled} onChange={event => setVoiceEnabled(event.target.checked)} />
                  Quero narração com uma voz ElevenLabs <small>Opcional; a geração de áudio continua exigindo aprovação.</small>
                </label>
              )}
              <ol className="onboarding-steps">
                <li className="onboarding-step">
                  <span className="onboarding-step-number">A</span>
                  <div>
                    <h3>Pasta dos projetos</h3>
                    <p>Marcas e arquivos ficam aqui. Nada será movido.</p>
                    <code className="mono-path">{snapshot.settings.workspace}</code>
                  </div>
                  <button type="button" className="button small" onClick={() => { void chooseWorkspace(); }}>
                    <FolderOpen size={14} />Alterar pasta
                  </button>
                </li>
                <li className="onboarding-step">
                  <span className="onboarding-step-number">B</span>
                  <div>
                    <h3>Agente: {provider === 'codex' ? 'Codex' : 'Claude Code'}</h3>
                    <p>Instale e conecte sua conta. O Studio abre o login oficial e não guarda sua senha.</p>
                    <label className="onboarding-provider">
                      Agente
                      <select value={provider} disabled={busy.has('onboarding-provider')} onChange={event => { void saveProvider(event.target.value as Provider); }}>
                        <option value="codex">OpenAI Codex</option>
                        <option value="claude">Claude Code</option>
                      </select>
                    </label>
                  </div>
                  <span className={`status-pill ${selectedAgent?.installed && selectedAgent.authenticated ? 'ok' : 'warn'}`}>
                    {selectedAgent?.installed && selectedAgent.authenticated ? 'Conectado' : !selectedAgent?.installed ? 'Instalar' : 'Entrar'}
                  </span>
                </li>
                <li className="onboarding-step">
                  <span className="onboarding-step-number">C</span>
                  <div>
                    <h3>GitHub</h3>
                    <p>Conecte sua conta para instalar os motores privados VideoGo e PostNow. O Studio não guarda sua senha.</p>
                  </div>
                  <span className={`status-pill ${githubReady ? 'ok' : 'warn'}`}>
                    {githubReady ? 'Conectado' : 'Conectar'}
                  </span>
                </li>
                <li className="onboarding-step">
                  <span className="onboarding-step-number">D</span>
                  <div>
                    <h3>Motor: {engineLabels[selectedEngineId].title}</h3>
                    <p>{engineLabels[selectedEngineId].role}</p>
                  </div>
                  <span className={`status-pill ${selectedEngineReady ? 'ok' : 'warn'}`}>
                    {selectedEngineReady ? 'Pronto' : selectedEngine?.installed ? 'Precisa de atenção' : 'Instalar'}
                  </span>
                </li>
              </ol>
              <div className="onboarding-integrations">
                {!selectedAgent?.installed && (
                  <button type="button" className="button small primary" disabled={busy.has(`cli-${provider}-install`)} onClick={() => { void manageCli(provider, 'install'); }}>
                    <PackagePlus size={14} />Instalar {CLI_LABELS[provider]}
                  </button>
                )}
                {selectedAgent?.installed && !selectedAgent.authenticated && (
                  <button type="button" className="button small primary" disabled={busy.has(`login-${provider}`)} onClick={() => { void login(provider, CLI_LABELS[provider]); }}>
                    <KeyRound size={14} />Entrar no {CLI_LABELS[provider]}
                  </button>
                )}
                {selectedAgent?.installed && selectedAgent.authenticated && (
                  <button type="button" className="button small secondary" disabled={busy.has(`login-${provider}`) || busy.has(`logout-${provider}`)} onClick={() => { void switchAccount(provider, CLI_LABELS[provider]); }}>
                    <RefreshCw size={14} />Trocar conta do {CLI_LABELS[provider]}
                  </button>
                )}
                {!githubReady && (status.tools.find(tool => tool.id === 'gh')?.installed
                  ? <button type="button" className="button small primary" disabled={busy.has('login-github')} onClick={() => { void login('github', 'GitHub CLI'); }}><KeyRound size={14} />Conectar GitHub</button>
                  : <button type="button" className="button small primary" disabled={busy.has('install-gh')} onClick={() => { const tool = status.tools.find(item => item.id === 'gh'); if (tool) void install(tool); }}><PackagePlus size={14} />Instalar GitHub CLI</button>)}
                {githubReady && (
                  <button type="button" className="button small secondary" disabled={busy.has('login-github') || busy.has('logout-github')} onClick={() => { void switchAccount('github', 'GitHub CLI'); }}>
                    <RefreshCw size={14} />Trocar conta do GitHub
                  </button>
                )}
                {selectedEngine && !selectedEngine.installed && (
                  <button type="button" className="button small primary" disabled={busy.has(`engine-${selectedEngine.id}-install`)} onClick={() => { void manage(selectedEngine, 'install'); }}>
                    <CloudDownload size={14} />Instalar {engineLabels[selectedEngineId].title}
                  </button>
                )}
                {selectedEngine?.installed && !selectedEngineReady && (
                  <button type="button" className="button small" disabled={busy.has(`engine-${selectedEngine.id}-update`)} onClick={() => { void manage(selectedEngine, 'update'); }}>
                    <RefreshCw size={14} />Preparar {engineLabels[selectedEngineId].title}
                  </button>
                )}
                {accessDenied[selectedEngineId] && (
                  <button type="button" className="button small secondary" onClick={() => { void run('engine-acquire', () => invoke('app.external', { url: 'https://www.fernandobolzan.com/maquina-de-conteudo' })); }}>
                    <ExternalLink size={14} />Adquirir agora
                  </button>
                )}
                {selectedEngineReady && (
                  <button type="button" className="button small secondary" disabled={busy.has(`engine-${selectedEngineId}-test`)} onClick={() => { if (selectedEngine) void testEngine(selectedEngine); }}>
                    <Play size={14} />Testar {engineLabels[selectedEngineId].title}
                  </button>
                )}
              </div>
              {voiceEnabled && !snapshot.integrations.elevenLabs.configured && (
                <p className="field-help">Configure a API key no submenu “ElevenLabs &amp; Voz”. Nenhum áudio será gerado sem aprovar a narração.</p>
              )}
              {voiceEnabled && (
                <button type="button" className="button small secondary onboarding-voice-setup" onClick={() => setSubmenu('elevenlabs')}>
                  <AudioLines size={14} />Ir para ElevenLabs &amp; Voz
                </button>
              )}
              <div className="onboarding-footer">
                <p>{canFinishOnboarding ? 'Integrações necessárias prontas. Você poderá ajustar marca e roteiro ao criar o primeiro projeto.' : `Conecte o agente${provider === 'codex' ? ' e o GitHub' : ''}, o ${engineLabels[selectedEngineId].title}${voiceEnabled ? ' e configure a voz ElevenLabs' : ''} para começar.`}</p>
                <div className="card-actions">
                  <button type="button" className="button primary" disabled={!canFinishOnboarding || busy.has('onboarding-complete')} onClick={() => { void finishOnboarding(); }}>
                    {canFinishOnboarding ? `Começar ${firstGoal === 'image' ? 'carrossel' : 'vídeo'}` : 'Concluir configuração'}
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </section>
          )}

          {guideOpen && (
            <button
              type="button"
              className="button small secondary onboarding-advanced-toggle"
              aria-expanded={showAdvancedSetup}
              onClick={() => setShowAdvancedSetup(value => !value)}
            >
              <Wrench size={14} />{showAdvancedSetup ? 'Ocultar integrações extras' : 'Ver todas as integrações'}
            </button>
          )}

          {(!guideOpen || showAdvancedSetup) && (
            <>
              {/* Assistentes e Login Oficial */}
              <section className="setup-section">
                <div className="section-heading">
                  <div>
                    <h2>Assistentes e login oficial</h2>
                    <p className="field-help">Instale ou atualize Codex/Claude Code aqui. A autorização acontece no navegador; respostas necessárias aparecem no Studio, não dependem do terminal aberto.</p>
                  </div>
                  <button
                    type="button"
                    className="button small"
                    disabled={updatesLoading}
                    onClick={() => { void run('cli-version-check', checkCliVersions, 'Versões verificadas.'); }}
                  >
                    <RefreshCw size={14} className={updatesLoading ? 'spin' : ''} />
                    {updatesLoading ? 'Consultando versões…' : 'Verificar versões'}
                  </button>
                </div>
                {updatesError && <p className="warning-text" role="status">{updatesError} Os CLIs instalados continuam disponíveis.</p>}
                <div className="auth-grid">
                  {([
                    ['github', 'GitHub CLI', status.tools.find(tool => tool.id === 'gh')],
                    ['codex', CLI_LABELS.codex, status.tools.find(tool => tool.id === 'codex')],
                    ['claude', CLI_LABELS.claude, status.tools.find(tool => tool.id === 'claude')],
                  ] as const).map(([id, title, tool]) => {
                    const cliId: CliId | undefined = id === 'codex' || id === 'claude' ? id : undefined;
                    const update = cliId ? cliUpdates.find(item => item.id === cliId) : undefined;
                    const authenticated = id === 'github' ? githubReady : tool?.authenticated;
                    const statusLabel = update?.state === 'update-available' || update?.state === 'external-update-available' ? 'Atualização disponível' : authenticated ? 'Autenticado' : tool?.installed ? 'Sessão pendente' : 'CLI ausente';
                    return (
                      <article className="setup-card" key={id}>
                        <div className="setup-card-head">
                          <strong>{title}</strong>
                          <span className={`status-pill ${authenticated && update?.state !== 'update-available' && update?.state !== 'external-update-available' ? 'ok' : 'warn'}`}>
                            {statusLabel}
                          </span>
                        </div>
                        {tool?.version && <span className="status-pill" aria-label={`Versão ${tool.version}`}>v{tool.version}</span>}
                        {cliId && <p>{CLI_EXPLANATIONS[cliId]}</p>}
                        <p>{tool?.detail || (authenticated ? (tool?.account ? `Conectado como ${tool.account}.` : 'Conta conectada e pronta para uso.') : tool?.installed ? 'Instalado; entre na conta para continuar.' : 'Ainda não instalado.')}</p>
                        {update && <p className="field-help">{update.detail}</p>}
                        {updatesLoading && cliId && !update && <p className="field-help">Consultando a versão estável no registro oficial…</p>}
                        <div className="card-actions">
                          {cliId && update?.state === 'missing' && (
                            <button type="button" className="button small primary" disabled={busy.has(`cli-${cliId}-install`)} onClick={() => { void manageCli(cliId, 'install'); }}>
                              <PackagePlus size={14} />Instalar CLI
                            </button>
                          )}
                          {cliId && update?.state === 'update-available' && (
                            <button type="button" className="button small primary" disabled={busy.has(`cli-${cliId}-update`)} onClick={() => { void manageCli(cliId, 'update'); }}>
                              <CloudDownload size={14} />Atualizar
                            </button>
                          )}
                          {cliId && update?.state === 'external-update-available' && (
                            <button type="button" className="button small primary" disabled={busy.has(`cli-${cliId}-install`)} onClick={() => { void manageCli(cliId, 'install'); }}>
                              <PackagePlus size={14} />Instalar cópia do Studio
                            </button>
                          )}
                          {cliId && update?.canRollback && (
                            <button type="button" className="button small" disabled={busy.has(`cli-${cliId}-rollback`)} onClick={() => { void manageCli(cliId, 'rollback'); }}>
                              <RotateCcw size={14} />Reverter versão
                            </button>
                          )}
                          {!authenticated && (
                            <button type="button" className="button small primary" disabled={!tool?.installed || busy.has(`login-${id}`)} onClick={() => { void login(id, title); }}>
                              <KeyRound size={14} />Entrar na conta
                            </button>
                          )}
                          {authenticated && (
                            <>
                              <button type="button" className="button small secondary" disabled={busy.has(`login-${id}`) || busy.has(`logout-${id}`)} onClick={() => { void switchAccount(id, title); }}>
                                <RefreshCw size={14} />Trocar conta
                              </button>
                              <button type="button" className="button small ghost" disabled={busy.has(`login-${id}`) || busy.has(`logout-${id}`)} onClick={() => { void logout(id, title); }}>
                                <LogOut size={14} />Desconectar
                              </button>
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              {/* Motores de Conteúdo */}
              <section className="setup-section">
                <div className="section-heading">
                  <div>
                    <h2>Motores de conteúdo</h2>
                    <p className="field-help">Instale os motores quando quiser criar imagens ou vídeos. Você também pode vincular uma instalação existente.</p>
                  </div>
                </div>
                <div className="engine-grid">
                  {status.engines.map(engine => {
                    const meta = engineLabels[engine.id];
                    return (
                      <article className="setup-card" key={engine.id}>
                        <div className="setup-card-head">
                          <strong>{meta.title}</strong>
                          <span className={`status-pill ${engine.installed && engine.dependencies.every(dependency => dependency.installed) ? 'ok' : 'warn'}`}>
                            {engine.installed ? engine.dependencies.every(dependency => dependency.installed) ? 'Pronto' : 'Precisa de atenção' : 'Não instalado'}
                          </span>
                        </div>
                        {engine.version && <span className="status-pill" aria-label={`Versão ${engine.version}`}>v{engine.version}</span>}
                        <p>{meta.role}</p>
                        <p className="field-help">{meta.access}</p>
                        <div className="card-actions">
                          {!engine.installed ? (
                            <button type="button" className="button small primary" disabled={busy.has(`engine-${engine.id}-install`)} onClick={() => { void manage(engine, 'install'); }}>
                              <CloudDownload size={14} />Instalar motor
                            </button>
                          ) : (
                            <button type="button" className="button small" disabled={busy.has(`engine-${engine.id}-update`)} onClick={() => { void manage(engine, 'update'); }}>
                              <RefreshCw size={14} />Atualizar
                            </button>
                          )}
                          {accessDenied[engine.id] && (
                            <button type="button" className="button small secondary" onClick={() => { void run('engine-acquire', () => invoke('app.external', { url: 'https://www.fernandobolzan.com/maquina-de-conteudo' })); }}>
                              <ExternalLink size={14} />Adquirir agora
                            </button>
                          )}
                          {engine.installed && (
                            <button type="button" className="button small" disabled={engine.dependencies.some(dependency => !dependency.installed) || busy.has(`engine-${engine.id}-test`)} onClick={() => { void testEngine(engine); }}>
                              <Play size={14} />Testar
                            </button>
                          )}
                        </div>
                        <details>
                          <summary>Mais opções</summary>
                          <div className="card-actions">
                            <button type="button" className="button small" disabled={busy.has(`link-${engine.id}`)} onClick={() => { void link(engine); }}>
                              <Link2 size={14} />Vincular pasta
                            </button>
                            {engine.installed && (
                              <button type="button" className="button small" disabled={busy.has(`engine-${engine.id}-rollback`)} onClick={() => { void manage(engine, 'rollback'); }}>
                                <RotateCcw size={14} />Reverter versão
                              </button>
                            )}
                            <button type="button" className="button small ghost" onClick={() => { void invoke('app.external', { url: engine.repository }); }}>
                              <ExternalLabel>Repositório</ExternalLabel>
                            </button>
                          </div>
                        </details>
                      </article>
                    );
                  })}
                  {(() => {
                    const tool = status.tools.find(t => t.id === 'cloudflared');
                    const mobile = snapshot.mobile;
                    const active = Boolean(mobile?.active && mobile?.url);
                    return (
                      <article className="setup-card" key="cloudflared">
                        <div className="setup-card-head">
                          <strong>Cloudflare Tunnel</strong>
                          <span className={`status-pill ${active ? 'ok' : tool?.installed ? 'ok' : 'warn'}`}>
                            {active ? 'Túnel ativo' : tool?.installed ? 'Pronto' : 'Não instalado'}
                          </span>
                        </div>
                        {tool?.version && <span className="status-pill" aria-label={`Versão ${tool.version}`}>v{tool.version}</span>}
                        <p>Túnel seguro para acesso mobile e monitoramento remoto de tarefas e arquivos pelo celular.</p>
                        <p className="field-help">Gera QR Code e token alfanumérico de 6 dígitos sem abrir portas no roteador.</p>
                        <div className="card-actions">
                          {!tool?.installed ? (
                            <button type="button" className="button small primary" disabled={busy.has('install-cloudflared')} onClick={() => { if (tool) void install(tool); }}>
                              <PackagePlus size={14} />Instalar motor
                            </button>
                          ) : !active ? (
                            <>
                              <button type="button" className="button small primary" disabled={busy.has('mobile-toggle')} onClick={() => setMobileModalOpen(true)}>
                                <Smartphone size={14} />Iniciar Acesso Mobile
                              </button>
                              <button type="button" className="button small" onClick={() => setMobileModalOpen(true)}>
                                <QrCode size={14} />QR Code &amp; Link
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="button small primary" onClick={() => setMobileModalOpen(true)}>
                                <QrCode size={14} />Ver QR Code e Token
                              </button>
                              <button
                                type="button"
                                className="button small secondary"
                                disabled={busy.has('mobile-toggle')}
                                onClick={async () => {
                                  await run('mobile-toggle', async () => {
                                    await invoke('mobile.stop');
                                    await refresh();
                                  }, 'Túnel mobile encerrado.');
                                }}
                              >
                                <CircleStop size={14} />Parar Túnel
                              </button>
                            </>
                          )}
                        </div>
                        <details>
                          <summary>Mais opções</summary>
                          <div className="card-actions">
                            <button type="button" className="button small" onClick={() => setMobileModalOpen(true)}>
                              <Smartphone size={14} />Painel Remoto
                            </button>
                            {active && (
                              <button type="button" className="button small ghost" onClick={() => { void invoke('app.external', { url: mobile?.url }); }}>
                                <ExternalLabel>Abrir no navegador</ExternalLabel>
                              </button>
                            )}
                          </div>
                        </details>
                      </article>
                    );
                  })()}
                </div>
              </section>

              {/* Ferramentas do Computador */}
              <section className="setup-section">
                <div className="section-heading">
                  <div>
                    <h2>Ferramentas necessárias no computador ({status.platform})</h2>
                    <p className="field-help">Node.js, Python, FFmpeg, FFprobe e Git são dependências técnicas. O Studio avisa quando alguma faltar e pede confirmação antes de instalar.</p>
                  </div>
                </div>
                <div className="tool-list">
                  {status.tools.filter(tool => tool.id !== 'codex' && tool.id !== 'claude').map(tool => (
                    <div className="tool-row" key={tool.id}>
                      <div className="tool-main">
                        {tool.installed ? <CheckCircle2 size={18} className="icon-ok" /> : <ShieldAlert size={18} className="icon-warn" />}
                        <div>
                          <strong>{tool.name}</strong>
                          <span className="mono-note">{tool.version ? `v${tool.version}` : 'não instalado'}</span>
                          {tool.detail && <p>{tool.detail}</p>}
                        </div>
                      </div>
                      <div className="card-actions">
                        {!tool.installed && (
                          <button type="button" className="button small" disabled={busy.has(`install-${tool.id}`)} onClick={() => { void install(tool); }}>
                            <PackagePlus size={14} />Instalar
                          </button>
                        )}
                        {tool.id === 'cloudflared' && tool.installed && (
                          <button type="button" className="button small primary" onClick={() => setMobileModalOpen(true)}>
                            <Smartphone size={14} />{snapshot.mobile?.active ? 'Ver QR Code' : 'Iniciar Painel Mobile'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {mobileModalOpen && (
        <MobileAccessModal
          snapshot={snapshot}
          refresh={refresh}
          run={run}
          busy={busy}
          onClose={() => setMobileModalOpen(false)}
        />
      )}
    </>
  );
}

export function Preferences({ snapshot, run, refresh, busy, confirm }: ScreenProps) {
  const [provider, setProvider] = useState<Provider>(snapshot.settings.provider);
  const [appUpdate, setAppUpdate] = useState<AppUpdateStatus | undefined>();

  useEffect(() => {
    if (!api) return;
    void invoke<AppUpdateStatus>('app.updateStatus').then(setAppUpdate).catch(() => undefined);
    return api.onEvent(event => { if (event.type === 'update' && event.update) setAppUpdate(event.update); });
  }, []);

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
      setAppUpdate(await invoke<AppUpdateStatus>('app.updateCheck'));
    });
  }

  async function installUpdate() {
    if (!await confirm('Reiniciar para atualizar', 'Aplicar a atualização agora? O aplicativo fecha e reabre na nova versão. Finalize as tarefas em andamento antes de continuar.', 'Reiniciar e atualizar')) return;
    await run('update-install', async () => {
      setAppUpdate(await invoke<AppUpdateStatus>('app.updateInstall', { confirm: true }));
    });
  }

  return (
    <>
      <PageHeading
        eyebrow="PREFERÊNCIAS DO ESTÚDIO"
        title="Preferências"
        description="Defina onde seus projetos ficam salvos e consulte atualizações do aplicativo."
      />
      <div className="setup-stack">
        <section className="setup-card">
          <div className="setup-card-head">
            <strong>Workspace de projetos e marcas</strong>
            <span className="status-pill ok">Local</span>
          </div>
          <p>Todos os projetos, logos, aprovações e pacotes exportados ficam fora dos repositórios dos motores.</p>
          <p className="mono-path">{snapshot.settings.workspace}</p>
          <div className="card-actions">
            <button className="button small" disabled={busy.has('save-workspace')} onClick={() => { void pickWorkspace(); }}>
              <FolderOpen size={14} />Escolher outra pasta
            </button>
            <button className="button small" onClick={() => { void run('open-workspace', () => invoke('app.open', { path: snapshot.settings.workspace })); }}>
              <ExternalLink size={14} />Abrir no sistema
            </button>
          </div>
        </section>

        <section className="setup-card">
          <div className="setup-card-head">
            <strong>Agente de IA padrão</strong>
            <Wrench size={16} />
          </div>
          <p>Escolha qual CLI oficial será pré-selecionado ao abrir o estúdio de um projeto.</p>
          <label>
            Provedor padrão
            <select value={provider} disabled={busy.has('save-provider')} onChange={event => { void saveProvider(event.target.value as Provider); }}>
              <option value="codex">OpenAI Codex</option>
              <option value="claude">Anthropic Claude Code</option>
            </select>
          </label>
        </section>

        <section className="setup-card">
          <div className="setup-card-head">
            <strong>Atualização do aplicativo desktop</strong>
            <span className={`status-pill ${appUpdate?.state === 'downloaded' ? 'warn' : 'ok'}`}>
              {appUpdate?.state === 'downloaded' ? `v${appUpdate.version} pronta` : `v${snapshot.version}`}
            </span>
          </div>
          <p className={appUpdate?.state === 'downloaded' ? 'warning-text' : ''} role="status">
            {appUpdate?.message || 'O aplicativo verifica novas versões sozinho e baixa em segundo plano.'}
          </p>
          <div className="card-actions">
            <button className="button small" disabled={busy.has('update-check')} onClick={() => { void checkUpdates(); }}>
              <RefreshCw size={14} />Verificar atualização
            </button>
            {appUpdate?.state === 'downloaded' && (
              <button className="button small primary" disabled={busy.has('update-install')} onClick={() => { void installUpdate(); }}>
                <CloudDownload size={14} />Reiniciar e atualizar
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
