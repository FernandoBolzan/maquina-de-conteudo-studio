import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, AudioLines, Check, ChevronRight, CircleStop, Film, FolderOpen, Image, LayoutGrid, LoaderCircle, Monitor, Palette, RefreshCw, Settings2, ShieldCheck, SlidersHorizontal, Smartphone, TerminalSquare, Wrench, X } from 'lucide-react';
import type { Job, Project, Snapshot } from '../shared/contracts';
import { api, errorMessage, invoke, jobStore, useJobs, type ChoiceRequest, type Choose, type Confirm, type Run } from './state';
import { ChoiceDialog, ErrorNotice, Loading, Modal } from './components';
import { Projects } from './Projects';
import { Studio } from './Studio';
import { Brands } from './Brands';
import { Setup, Preferences, type SetupSubmenu } from './Setup';
import { JobsConsole } from './Console';
import { MobileAccessModal } from './MobileAccessModal';
import './shell-refined.css';

type Page = 'projects' | 'studio' | 'brands' | 'setup' | 'settings';
interface Consent { title: string; description: string; action: string; resolve: (answer: boolean) => void; }
interface PendingChoice { id: number; request: ChoiceRequest; resolve: (value: string | undefined) => void; }
type TerminalJobStatus = 'succeeded' | 'failed' | 'cancelled';
interface JobNotice { id: string; projectId: string; title: string; status: TerminalJobStatus; }
const NOTICE_LABELS: Record<TerminalJobStatus, string> = { succeeded: 'Concluído', failed: 'Falhou', cancelled: 'Cancelado' };
const SUCCESS_NOTICE_MS = 8000;

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<Page>('projects');
  const [setupSubmenu, setSetupSubmenu] = useState<SetupSubmenu>('engines');
  const [studioDirty, setStudioDirty] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [initialPrompt, setInitialPrompt] = useState('');
  const [voiceSetupRequested, setVoiceSetupRequested] = useState(false);
  const [initialProjectKind, setInitialProjectKind] = useState<Project['kind'] | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(new Set<string>());
  const [consent, setConsent] = useState<Consent | null>(null);
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [interactionResponse, setInteractionResponse] = useState('');
  const [mobileModalOpen, setMobileModalOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const jobs = useJobs();
  const [jobNotices, setJobNotices] = useState<JobNotice[]>([]);
  const pending = useRef(new Set<string>());
  const consentRef = useRef<Consent | null>(null);
  const pendingChoiceRef = useRef<PendingChoice | null>(null);
  const choiceSeq = useRef(0);
  const initialized = useRef(false);
  const refreshPromise = useRef<Promise<void> | null>(null);

  const refresh = useCallback((): Promise<void> => {
    if (refreshPromise.current) return refreshPromise.current;
    const work = invoke<Snapshot>('app.snapshot').then(next => {
      setSnapshot(next);
      jobStore.merge(next.jobs);
      if (!initialized.current) {
        initialized.current = true;
        if (!next.settings.onboardingCompleted) setPage('setup');
      }
    }).finally(() => { refreshPromise.current = null; });
    refreshPromise.current = work;
    return work;
  }, []);

  const run: Run = useCallback(async <T,>(key: string, operation: () => Promise<T>, message?: string) => {
    if (pending.current.has(key)) return undefined;
    pending.current.add(key); setBusy(new Set(pending.current)); setError('');
    try { const result = await operation(); if (message) setSuccess(message); return result; }
    catch (caught) { setError(errorMessage(caught)); return undefined; }
    finally { pending.current.delete(key); setBusy(new Set(pending.current)); }
  }, []);

  const confirm: Confirm = useCallback((title, description, action = 'Continuar') => {
    const { promise, resolve } = Promise.withResolvers<boolean>();
    consentRef.current?.resolve(false);
    const next = { title, description, action, resolve };
    consentRef.current = next; setConsent(next);
    return promise;
  }, []);

  function resolveConsent(answer: boolean) { consentRef.current?.resolve(answer); consentRef.current = null; setConsent(null); }

  const choose: Choose = useCallback((request) => {
    const { promise, resolve } = Promise.withResolvers<string | undefined>();
    pendingChoiceRef.current?.resolve(undefined);
    const next = { id: ++choiceSeq.current, request, resolve };
    pendingChoiceRef.current = next; setPendingChoice(next);
    return promise;
  }, []);

  function resolveChoice(value: string | undefined) { pendingChoiceRef.current?.resolve(value); pendingChoiceRef.current = null; setPendingChoice(null); }

  const queueJobNotice = useCallback((job: Job) => {
    const status = job.status;
    if (!job.projectId || (status !== 'succeeded' && status !== 'failed' && status !== 'cancelled')) return;
    if (jobStore.get(job.id)?.status === status) return;
    const notice: JobNotice = { id: job.id, projectId: job.projectId, title: job.title, status };
    setJobNotices(list => list.some(item => item.id === notice.id) ? list : [...list, notice]);
  }, []);
  const dismissNotice = useCallback((id: string) => setJobNotices(list => list.filter(item => item.id !== id)), []);

  useEffect(() => {
    if (!api) return;
    let mounted = true;
    let timer: number | undefined;
    const unsubscribe = api.onEvent(event => {
      if (event.type === 'job' && event.job) queueJobNotice(event.job);
      jobStore.event(event);
      if (event.type === 'refresh' || (event.type === 'job' && event.job?.status !== 'running')) {
        clearTimeout(timer);
        timer = window.setTimeout(() => { void refresh().catch(caught => { if (mounted) setError(errorMessage(caught)); }); }, 200);
      }
    });
    void refresh().catch(caught => { if (mounted) setError(errorMessage(caught)); }).finally(() => { if (mounted) setInitialLoading(false); });
    return () => { mounted = false; unsubscribe(); clearTimeout(timer); consentRef.current?.resolve(false); };
  }, [refresh, queueJobNotice]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(''), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  const openJob = useCallback((job: Job) => { jobStore.merge([job]); setJobId(job.id); }, []);
  const openTerminal = useCallback((job: Job) => { jobStore.merge([job]); setJobId(job.id); setConsoleOpen(true); }, []);
  const guardStudioExit = useCallback(async (): Promise<boolean> => {
    if (page !== 'studio' || !studioDirty) return true;
    return confirm('Sair sem salvar?', 'Há alterações não salvas neste projeto (briefing, notas, narração ou textos). Se sair agora, elas serão perdidas.', 'Sair sem salvar');
  }, [page, studioDirty, confirm]);
  const goPage = useCallback(async (next: Page) => {
    if (await guardStudioExit()) setPage(next);
  }, [guardStudioExit]);
  const onOpen = useCallback(async (id: string, prompt = '') => {
    if (!await guardStudioExit()) return;
    setInitialPrompt(prompt); setProjectId(id); setPage('studio');
  }, [guardStudioExit]);
  const goSetup = useCallback(async (sub: SetupSubmenu = 'engines') => {
    if (await guardStudioExit()) {
      setSetupSubmenu(sub);
      setPage('setup');
    }
  }, [guardStudioExit]);
  const goVoiceSetup = useCallback(async () => {
    if (!await guardStudioExit()) return;
    setSetupSubmenu('elevenlabs');
    setVoiceSetupRequested(true);
    setPage('setup');
  }, [guardStudioExit]);
  const consumeVoiceSetupRequest = useCallback(() => setVoiceSetupRequested(false), []);
  const goProjects = useCallback((kind: Project['kind']) => { setInitialProjectKind(kind); setPage('projects'); }, []);
  const consumeInitialProjectKind = useCallback(() => setInitialProjectKind(null), []);
  const activeJobs = jobs.filter(job => job.status === 'running').length;
  const project = snapshot?.projects.find(item => item.id === projectId);
  const interactionJob = jobs.find(job => job.status === 'running' && job.interactionRequest);

  const pageContentRef = useRef<HTMLElement>(null);
  useEffect(() => {
    pageContentRef.current?.scrollTo({ top: 0 });
  }, [page, projectId]);
  async function respondToInteraction(data: string) {
    if (!interactionJob) return;
    await run(`respond-${interactionJob.id}`, () => invoke('jobs.respond', { id: interactionJob.id, data }));
    setInteractionResponse('');
  }
  async function continueInTerminal() {
    if (!interactionJob) return;
    await run(`dismiss-${interactionJob.id}`, () => invoke('jobs.dismissInteraction', { id: interactionJob.id }));
    setJobId(interactionJob.id);
    setConsoleOpen(true);
  }

  if (!api) {
    return (
      <div className="desktop-required">
        <span className="brand-icon" aria-hidden="true">🔥</span>
        <span className="eyebrow">MÁQUINA DE CONTEÚDO · STUDIO</span>
        <h1>Seu estúdio vive no <em>desktop.</em></h1>
        <p>Esta interface precisa do aplicativo instalado para acessar projetos, arquivos e processos locais com segurança.</p>
        <div className="notice"><Monitor size={20} /><span>Abra a Máquina de Conteúdo (Studio) pelo aplicativo desktop. A ponte local não está disponível nesta janela.</span></div>
        <small>Nenhum dado demonstrativo ou conexão de conta foi iniciado.</small>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>

      <aside className="sidebar" aria-label="Navegação e projetos do workspace">
        <button type="button" className="brand-lockup" onClick={() => void goPage('projects')} aria-label="Máquina de Conteúdo Studio, ir para projetos">
          <img className="brand-icon" src="./icon.png" alt="" aria-hidden="true" />
          <span className="brand-lockup-content">
            <span className="brand-title-line">
              <span className="brand-title-text">Máquina de Conteúdo</span>
              <span className="brand-beta-tag" aria-label="Versão beta">beta</span>
            </span>
            <small>STUDIO · PostNow · VideoGo</small>
          </span>
        </button>

        <nav className="main-nav" aria-label="Navegação principal">
          <span className="nav-caption">ESTÚDIO</span>
          <button type="button" className={page === 'projects' || page === 'studio' ? 'active' : ''} aria-current={page === 'projects' || page === 'studio' ? 'page' : undefined} onClick={() => void goPage('projects')}>
            <LayoutGrid size={17} />
            <span>Projetos</span>
            <span className="nav-count">{snapshot?.projects.length ?? 0}</span>
          </button>
          <button type="button" className={page === 'brands' ? 'active' : ''} aria-current={page === 'brands' ? 'page' : undefined} onClick={() => void goPage('brands')}>
            <Palette size={17} />
            <span>Marcas</span>
            <span className="nav-count">{snapshot?.brands.length ?? 0}</span>
          </button>
          <div className="nav-group">
            <button
              type="button"
              className={page === 'setup' ? 'active' : ''}
              aria-current={page === 'setup' ? 'page' : undefined}
              aria-expanded={page === 'setup'}
              onClick={() => void goSetup('engines')}
            >
              <SlidersHorizontal size={17} />
              <span>Motores &amp; Setup</span>
            </button>
            <div className="nav-submenu" role="group" aria-label="Submenu Motores e Setup">
              <button
                type="button"
                className={`nav-sub-item ${page === 'setup' && setupSubmenu === 'engines' ? 'active' : ''}`}
                aria-current={page === 'setup' && setupSubmenu === 'engines' ? 'page' : undefined}
                onClick={() => void goSetup('engines')}
              >
                <Wrench size={13} />
                <span>Motores &amp; CLIs</span>
              </button>
              <button
                type="button"
                className={`nav-sub-item ${page === 'setup' && setupSubmenu === 'elevenlabs' ? 'active' : ''}`}
                aria-current={page === 'setup' && setupSubmenu === 'elevenlabs' ? 'page' : undefined}
                onClick={() => void goSetup('elevenlabs')}
              >
                <AudioLines size={13} />
                <span>ElevenLabs &amp; Voz</span>
                {snapshot?.integrations.elevenLabs.configured ? (
                  <span className="status-pill ok nav-pill" title="ElevenLabs configurado">OK</span>
                ) : (
                  <span className="status-pill warn nav-pill" title="Configuração pendente">Setup</span>
                )}
              </button>
            </div>
          </div>
          <button type="button" onClick={() => setMobileModalOpen(true)} className={snapshot?.mobile?.active ? 'active' : ''} title="Abrir painel de acesso mobile remoto">
            <Smartphone size={17} />
            <span>Acesso Mobile</span>
            {snapshot?.mobile?.active ? (
              <span className="status-pill ok" style={{ fontSize: 10, padding: '2px 6px', marginLeft: 'auto' }}>Ativo</span>
            ) : (
              <span className="status-pill" style={{ fontSize: 10, padding: '2px 6px', marginLeft: 'auto' }}>Conectar</span>
            )}
          </button>
          <button type="button" className={page === 'settings' ? 'active' : ''} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => void goPage('settings')}>
            <Settings2 size={17} />
            <span>Preferências</span>
          </button>
        </nav>

        <div className="sidebar-projects">
          <span className="nav-caption">RECENTES NO WORKSPACE</span>
          {snapshot?.projects.length ? snapshot.projects.slice(0, 8).map(item => (
            <button type="button" className={page === 'studio' && projectId === item.id ? 'active' : ''} key={item.id} onClick={() => onOpen(item.id)} title={item.title}>
              {item.kind === 'image' ? <Image size={14} className="project-kind-icon image" /> : <Film size={14} className="project-kind-icon video" />}
              <span>{item.title}</span>
            </button>
          )) : <p>Nenhum projeto criado ainda.</p>}
        </div>

        <div className="sidebar-footer">
          <div className="engine-mini-strip" aria-label="Motores do ecossistema">
            <span className={snapshot?.settings.enginePaths.postnow ? 'engine-chip active' : 'engine-chip'}>PostNow</span>
            <span className={snapshot?.settings.enginePaths.videogo ? 'engine-chip active' : 'engine-chip'}>VideoGo</span>
            <span className={snapshot?.settings.enginePaths.maestro ? 'engine-chip active' : 'engine-chip'}>Maestro</span>
          </div>
          <div className="local-note">
            <span className="live-dot" />
            <span>Agente padrão: <strong>{snapshot?.settings.provider === 'claude' ? 'Claude Code' : 'Codex'}</strong></span>
          </div>
          <span className="version-label">MÁQUINA DE CONTEÚDO STUDIO · v{snapshot?.version || '0.1.0'}</span>
        </div>
      </aside>

      <div className="app-body">
        <header className="topbar">
          <div className="topbar-breadcrumb">
            <span className="topbar-pill">WORKSPACE</span>
            <ChevronRight size={13} />
            {page === 'setup' ? (
              <>
                <button type="button" className="breadcrumb-btn" onClick={() => void goSetup('engines')}>
                  Motores &amp; Setup
                </button>
                <ChevronRight size={13} />
                <strong>{setupSubmenu === 'elevenlabs' ? 'ElevenLabs & Voz' : 'Motores & CLIs'}</strong>
              </>
            ) : (
              <strong title={page === 'studio' ? project?.title : undefined}>
                {page === 'studio' ? project?.title || 'Estúdio' : { projects: 'Projetos', brands: 'Marcas & Identidade', settings: 'Preferências' }[page]}
              </strong>
            )}
          </div>
          <div className="topbar-actions">
            <span className="local-badge">
              <span className="live-dot" />
              PostNow + Codex · VideoGo + Claude
            </span>
            <button type="button" className="icon-button" aria-label="Recarregar dados do estúdio" disabled={busy.has('reload')} onClick={() => { void run('reload', refresh, 'Estúdio atualizado.'); }}>
              <RefreshCw size={15} className={busy.has('reload') ? 'spin' : ''} />
            </button>
            <button type="button" className={`button small ${snapshot?.mobile?.active ? 'primary' : 'secondary'}`} onClick={() => setMobileModalOpen(true)} title="Acesso Mobile Remoto via Cloudflare Tunnel">
              <Smartphone size={15} />
              <span>Mobile</span>
              {snapshot?.mobile?.active && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981', marginLeft: 2 }} />
              )}
            </button>
            <button type="button" className={`button small console-toggle ${consoleOpen ? 'primary' : 'secondary'}`} onClick={() => setConsoleOpen(value => !value)} aria-expanded={consoleOpen}>
              <TerminalSquare size={15} />
              <span>Terminal</span>
              {activeJobs > 0 && <span className="button-count">{activeJobs}</span>}
            </button>
          </div>
        </header>

        <main id="main-content" ref={pageContentRef} className="page-content" tabIndex={-1}>
          {error && <ErrorNotice message={error} onClose={() => setError('')} />}
          {initialLoading ? (
            <Loading />
          ) : !snapshot ? (
            <div className="connection-error">
              <h1>Não foi possível abrir o <em>estúdio</em></h1>
              <p>Os dados locais não puderam ser carregados. Confira a mensagem acima e tente novamente.</p>
              <button className="button primary" disabled={busy.has('reload')} onClick={() => { void run('reload', refresh); }}>
                <RefreshCw size={16} />Tentar novamente
              </button>
            </div>
          ) : (() => {
            const props = { snapshot, refresh, run, busy, confirm, choose, openJob };
            if (page === 'studio' && projectId) return <Studio key={projectId} {...props} id={projectId} initialPrompt={initialPrompt} onOpen={onOpen} onOpenVoiceSetup={goVoiceSetup} onOpenTerminal={openTerminal} onBack={() => void goPage('projects')} onDirtyChange={setStudioDirty} />;
            if (page === 'brands') return <Brands {...props} />;
            if (page === 'setup') return <Setup {...props} onGoProjects={goProjects} voiceSetupRequested={voiceSetupRequested} onVoiceSetupConsumed={consumeVoiceSetupRequest} activeSubmenu={setupSubmenu} onSelectSubmenu={setSetupSubmenu} />;
            if (page === 'settings') return <Preferences {...props} />;
            return <Projects {...props} onOpen={onOpen} initialKind={initialProjectKind} onInitialKindConsumed={consumeInitialProjectKind} />;
          })()}
        </main>

        <JobsConsole selectedId={jobId} onSelect={setJobId} visible={consoleOpen} onClose={() => setConsoleOpen(false)} run={run} busy={busy} onError={setError} />

        <footer className="app-footer">
          <span>Máquina de Conteúdo (Studio)</span>
          <span><FolderOpen size={12} />{snapshot?.settings.workspace || 'Carregando workspace'}</span>
        </footer>
      </div>

      {success && (
        <div className="success-toast" role="status">
          <Check size={17} />
          <span>{success}</span>
          <button className="icon-button" aria-label="Fechar notificação" onClick={() => setSuccess('')}><X size={14} /></button>
        </div>
      )}

      {consent && (
        <Modal title={consent.title} onClose={() => resolveConsent(false)}>
          <div className="consent-icon"><ShieldCheck size={24} /></div>
          <p className="consent-description">{consent.description}</p>
          <div className="consent-note">A ação só começa depois da sua confirmação.</div>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => resolveConsent(false)}>Cancelar</button>
            <button className="button primary" onClick={() => resolveConsent(true)}>{consent.action}<ChevronRight size={16} /></button>
          </div>
        </Modal>
      )}
      {pendingChoice && <ChoiceDialog key={pendingChoice.id} request={pendingChoice.request} onResolve={resolveChoice} />}
      {interactionJob?.interactionRequest && (
        <Modal title="O processo precisa de você" onClose={() => { void continueInTerminal(); }} className="job-interaction-modal">
          <p className="consent-description">{interactionJob.interactionRequest.prompt}</p>
          {interactionJob.interactionRequest.kind === 'device-auth' ? (
            <>
              {interactionJob.interactionRequest.userCode && <p className="device-auth-code" aria-label="Código de autenticação">{interactionJob.interactionRequest.userCode}</p>}
              <div className="modal-actions">
                <button className="button secondary" onClick={() => { void continueInTerminal(); }}>Abrir terminal</button>
                {interactionJob.interactionRequest.verificationUrl && <button className="button secondary" onClick={() => { void run(`auth-url-${interactionJob.id}`, () => invoke('app.external', { url: interactionJob.interactionRequest?.verificationUrl })); }}>Abrir página segura</button>}
                <button className="button primary" onClick={() => { void run(`dismiss-${interactionJob.id}`, () => invoke('jobs.dismissInteraction', { id: interactionJob.id })); }}>Já autorizei</button>
              </div>
            </>
          ) : interactionJob.interactionRequest.kind === 'choice' ? (
            <div className="modal-actions">
              {interactionJob.interactionRequest.choices?.map(choice => <button key={choice.value} className="button primary" onClick={() => { void respondToInteraction(choice.value); }}>{choice.label}</button>)}
              <button className="button secondary" onClick={() => { void continueInTerminal(); }}>Responder no terminal</button>
            </div>
          ) : (
            <form onSubmit={event => { event.preventDefault(); void respondToInteraction(interactionResponse); }}>
              <label>Resposta
                <input autoFocus type={interactionJob.interactionRequest.kind === 'password' ? 'password' : 'text'} autoComplete="off" value={interactionResponse} onChange={event => setInteractionResponse(event.target.value)} maxLength={4096} />
              </label>
              <div className="modal-actions">
                <button className="button secondary" type="button" onClick={() => { void continueInTerminal(); }}>Responder no terminal</button>
                <button className="button primary" type="submit" disabled={!interactionResponse || busy.has(`respond-${interactionJob.id}`)}>Enviar resposta</button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {jobNotices.length > 0 && (
        <div className="job-toast-stack">
          {jobNotices.map(notice => <JobToast key={notice.id} notice={notice} onOpen={() => onOpen(notice.projectId)} onClose={() => dismissNotice(notice.id)} />)}
        </div>
      )}
      {mobileModalOpen && <MobileAccessModal snapshot={snapshot} refresh={refresh} run={run} busy={busy} onClose={() => setMobileModalOpen(false)} />}
      {busy.size > 0 && <span className="sr-only" role="status"><LoaderCircle />Operação em andamento</span>}
    </div>
  );
}

function JobToast({ notice, onOpen, onClose }: { notice: JobNotice; onOpen: () => void; onClose: () => void }) {
  const { status } = notice;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (status !== 'succeeded') return;
    const timer = window.setTimeout(() => closeRef.current(), SUCCESS_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [status]);
  const Icon = status === 'succeeded' ? Check : status === 'failed' ? AlertCircle : CircleStop;
  return (
    <div className={`job-toast is-${status}`} role={status === 'failed' ? 'alert' : 'status'} aria-live={status === 'failed' ? undefined : 'polite'}>
      <Icon size={17} aria-hidden="true" />
      <span className="job-toast-text"><strong>{NOTICE_LABELS[status]}:</strong> {notice.title}</span>
      <button type="button" className="button small secondary" onClick={onOpen}>Abrir projeto</button>
      <button type="button" className="icon-button" aria-label="Fechar aviso" onClick={onClose}><X size={14} /></button>
    </div>
  );
}
