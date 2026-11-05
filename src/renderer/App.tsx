import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Film, FolderOpen, Image, LayoutGrid, LoaderCircle, Monitor, Palette, RefreshCw, Settings2, ShieldCheck, SlidersHorizontal, TerminalSquare, X } from 'lucide-react';
import type { Job, Snapshot } from '../shared/contracts';
import { api, errorMessage, invoke, jobStore, useJobs, type Confirm, type Run } from './state';
import { ErrorNotice, Loading, Modal } from './components';
import { Projects } from './Projects';
import { Studio } from './Studio';
import { Brands } from './Brands';
import { Setup, Preferences } from './Setup';
import { JobsConsole } from './Console';

type Page = 'projects' | 'studio' | 'brands' | 'setup' | 'settings';
interface Consent { title: string; description: string; action: string; resolve: (answer: boolean) => void; }

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<Page>('projects');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(new Set<string>());
  const [consent, setConsent] = useState<Consent | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const jobs = useJobs();
  const pending = useRef(new Set<string>());
  const consentRef = useRef<Consent | null>(null);
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

  useEffect(() => {
    if (!api) return;
    let mounted = true;
    let timer: number | undefined;
    const unsubscribe = api.onEvent(event => {
      jobStore.event(event);
      if (event.type === 'refresh' || (event.type === 'job' && event.job?.status !== 'running')) {
        clearTimeout(timer);
        timer = window.setTimeout(() => { void refresh().catch(caught => { if (mounted) setError(errorMessage(caught)); }); }, 200);
      }
    });
    void refresh().catch(caught => { if (mounted) setError(errorMessage(caught)); }).finally(() => { if (mounted) setInitialLoading(false); });
    return () => { mounted = false; unsubscribe(); clearTimeout(timer); consentRef.current?.resolve(false); };
  }, [refresh]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(''), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  const openJob = useCallback((job: Job) => { jobStore.merge([job]); setJobId(job.id); setConsoleOpen(true); }, []);
  const onOpen = useCallback((id: string) => { setProjectId(id); setPage('studio'); }, []);
  const activeJobs = jobs.filter(job => job.status === 'running').length;
  const project = snapshot?.projects.find(item => item.id === projectId);

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

      <aside className="sidebar">
        <button type="button" className="brand-lockup" onClick={() => setPage('projects')} aria-label="Máquina de Conteúdo Studio, ir para projetos">
          <span className="brand-icon" aria-hidden="true">🔥</span>
          <span>
            Máquina de Conteúdo
            <small>STUDIO · PostNow · VideoGo</small>
          </span>
        </button>

        <nav className="main-nav" aria-label="Navegação principal">
          <span className="nav-caption">ESTÚDIO</span>
          <button type="button" className={page === 'projects' || page === 'studio' ? 'active' : ''} aria-current={page === 'projects' || page === 'studio' ? 'page' : undefined} onClick={() => setPage('projects')}>
            <LayoutGrid size={17} />
            <span>Projetos</span>
            <span className="nav-count">{snapshot?.projects.length ?? 0}</span>
          </button>
          <button type="button" className={page === 'brands' ? 'active' : ''} aria-current={page === 'brands' ? 'page' : undefined} onClick={() => setPage('brands')}>
            <Palette size={17} />
            <span>Marcas</span>
            <span className="nav-count">{snapshot?.brands.length ?? 0}</span>
          </button>
          <button type="button" className={page === 'setup' ? 'active' : ''} aria-current={page === 'setup' ? 'page' : undefined} onClick={() => setPage('setup')}>
            <SlidersHorizontal size={17} />
            <span>Motores & Setup</span>
          </button>
          <button type="button" className={page === 'settings' ? 'active' : ''} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => setPage('settings')}>
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
            <strong>{page === 'studio' ? project?.title || 'Estúdio' : page === 'setup' && !snapshot?.settings.onboardingCompleted ? 'Primeiros passos' : { projects: 'Projetos', brands: 'Marcas & Identidade', setup: 'Motores & Setup', settings: 'Preferências' }[page]}</strong>
          </div>
          <div className="topbar-actions">
            <span className="local-badge">
              <span className="live-dot" />
              PostNow + Codex · VideoGo + Claude
            </span>
            <button type="button" className="icon-button" aria-label="Recarregar dados do estúdio" disabled={busy.has('reload')} onClick={() => { void run('reload', refresh, 'Estúdio atualizado.'); }}>
              <RefreshCw size={15} className={busy.has('reload') ? 'spin' : ''} />
            </button>
            <button type="button" className={`button small console-toggle ${consoleOpen ? 'primary' : 'secondary'}`} onClick={() => setConsoleOpen(value => !value)} aria-expanded={consoleOpen}>
              <TerminalSquare size={15} />
              <span>Terminal</span>
              {activeJobs > 0 && <span className="button-count">{activeJobs}</span>}
            </button>
          </div>
        </header>

        <main id="main-content" className="page-content" tabIndex={-1}>
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
            const props = { snapshot, refresh, run, busy, confirm, openJob };
            if (page === 'studio' && projectId) return <Studio key={projectId} {...props} id={projectId} onOpen={onOpen} onBack={() => setPage('projects')} />;
            if (page === 'brands') return <Brands {...props} />;
            if (page === 'setup') return <Setup {...props} onGoProjects={() => setPage('projects')} />;
            if (page === 'settings') return <Preferences {...props} />;
            return <Projects {...props} onOpen={onOpen} />;
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

      {busy.size > 0 && <span className="sr-only" role="status"><LoaderCircle />Operação em andamento</span>}
    </div>
  );
}
