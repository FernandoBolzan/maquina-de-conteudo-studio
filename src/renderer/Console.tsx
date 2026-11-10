import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { CircleStop, Copy, TerminalSquare, X } from 'lucide-react';
import type { Job } from '../shared/contracts';
import { plainTerminalText } from '../shared/terminal-text';
import { invoke, jobStore, statusLabels, useJobs, type Run } from './state';
import { Empty } from './components';
import '@xterm/xterm/css/xterm.css';

function transcriptOf(job: Job): string {
  const status = `${statusLabels[job.status]}${job.exitCode !== undefined ? ` · saída ${job.exitCode}` : ''}`;
  return `${job.title}\nStatus: ${status}\n\n${plainTerminalText(job.log)}`;
}

function JobTerminal({ jobId, visible, onError, run }: { jobId: string; visible: boolean; onError: (message: string) => void; run: Run }) {
  const element = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const runRef = useRef(run);
  runRef.current = run;
  const [hasSelection, setHasSelection] = useState(false);
  useEffect(() => {
    if (!element.current) return;
    const term = new Terminal({ cursorBlink: true, fontSize: 13, fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', scrollback: 3000, convertEol: true, screenReaderMode: true, theme: { background: '#09090b', foreground: '#f4f4f5', cursor: '#f97316', selectionBackground: '#ea580c55', black: '#121110', green: '#fb923c', brightGreen: '#fdba74' } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element.current);
    terminalRef.current = term;
    fitRef.current = fit;
    setHasSelection(false);
    let previous = '';
    let inputError = false;
    const renderLog = () => {
      const job = jobStore.get(jobId);
      const log = job?.log ?? '';
      term.options.disableStdin = !job?.interactive || job.status !== 'running';
      if (log !== previous) {
        if (log.startsWith(previous)) term.write(log.slice(previous.length));
        else { term.reset(); term.write(log); }
        previous = log;
      }
    };
    renderLog();
    const unsubscribe = jobStore.subscribe(renderLog);
    const input = term.onData(data => {
      const job = jobStore.get(jobId);
      if (!job?.interactive || job.status !== 'running') return;
      void invoke('jobs.input', { id: jobId, data }).catch(error => {
        if (!inputError) { inputError = true; errorRef.current(String(error)); }
      });
    });
    const selection = term.onSelectionChange(() => setHasSelection(term.hasSelection()));
    term.attachCustomKeyEventHandler(event => {
      const copies = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && term.hasSelection();
      if (!copies) return true;
      if (event.type === 'keydown') void navigator.clipboard.writeText(term.getSelection()).catch(error => errorRef.current(String(error)));
      return false;
    });
    let previousSize = '';
    const resize = () => {
      if (!element.current?.clientWidth || !element.current.clientHeight) return;
      fit.fit();
      const job = jobStore.get(jobId);
      const size = `${term.cols}:${term.rows}`;
      if (job?.interactive && job.status === 'running' && size !== previousSize) {
        previousSize = size;
        void invoke('jobs.resize', { id: jobId, cols: term.cols, rows: term.rows }).catch(error => errorRef.current(String(error)));
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element.current);
    resize();
    return () => { observer.disconnect(); unsubscribe(); input.dispose(); selection.dispose(); term.dispose(); terminalRef.current = null; fitRef.current = null; };
  }, [jobId]);
  useEffect(() => { if (visible) { fitRef.current?.fit(); } }, [visible]);
  function copySelection() {
    const term = terminalRef.current;
    if (!term?.hasSelection()) return;
    void runRef.current(`copy-selection-${jobId}`, () => navigator.clipboard.writeText(term.getSelection()), 'Trecho copiado.');
  }
  function copyAll() {
    const job = jobStore.get(jobId);
    if (job) void runRef.current(`copy-all-${jobId}`, () => navigator.clipboard.writeText(transcriptOf(job)), 'Terminal copiado.');
  }
  return <div className="terminal-view">
    <div className="terminal-copy-bar">
      <button className="button small secondary" disabled={!hasSelection} onClick={copySelection}><Copy size={14} />Copiar seleção</button>
      <button className="button small secondary" onClick={copyAll}><Copy size={14} />Copiar tudo</button>
    </div>
    <div className="terminal-host" ref={element} aria-label="Terminal completo. Entrada disponível somente para sessões interativas autorizadas." />
  </div>;
}

export function JobsConsole({ selectedId, onSelect, visible, onClose, run, busy, onError }: { selectedId: string | null; onSelect: (id: string) => void; visible: boolean; onClose: () => void; run: Run; busy: Set<string>; onError: (message: string) => void }) {
  const jobs = useJobs();
  const selected = jobs.find(job => job.id === selectedId) ?? jobs[0];
  return <section className={`jobs-console ${visible ? 'is-open' : ''}`} aria-label="Atividades e console" hidden={!visible}>
    <div className="console-heading"><div><TerminalSquare size={18} /><h2>Console de atividades</h2><span className="count">{jobs.length}</span></div><button className="icon-button" onClick={onClose} aria-label="Recolher console"><X size={18} /></button></div>
    {!selected ? <Empty title="Nenhuma atividade ainda" headingLevel={3}>As sessões de IA, instalações e renderizações aparecerão aqui.</Empty> : <div className="console-layout">
      <div className="job-list" aria-label="Histórico de atividades">{jobs.map(job => <button key={job.id} className={`job-card ${selected.id === job.id ? 'selected' : ''}`} onClick={() => onSelect(job.id)} aria-current={selected.id === job.id ? 'true' : undefined}><span className={`status-dot ${job.status}`} /><span><strong>{job.title}</strong><small>{statusLabels[job.status]}{job.exitCode !== undefined ? ` · saída ${job.exitCode}` : ''}</small></span></button>)}</div>
      <div className="console-main"><div className="terminal-toolbar"><span className={`status-label ${selected.status}`}>{statusLabels[selected.status]}</span><span>{selected.interactive ? 'Sessão interativa · permissões nativas' : 'Registro de execução · somente leitura'}</span>{selected.status === 'running' && <button className="button small danger" disabled={busy.has(`cancel-${selected.id}`)} onClick={() => { void run(`cancel-${selected.id}`, () => invoke('jobs.cancel', { id: selected.id })); }}><CircleStop size={14} />Cancelar</button>}</div><JobTerminal jobId={selected.id} visible={visible} onError={onError} run={run} /><p className="console-footnote">Histórico recente limitado. Entradas são enviadas somente ao processo selecionado; este console não executa um shell avulso.</p></div>
    </div>}
  </section>;
}

export function ActivityCard({ job, onOpen }: { job: Job; onOpen: (job: Job) => void }) {
  return <button className="activity-card" onClick={() => onOpen(job)}><TerminalSquare size={18} /><span><strong>{job.title}</strong><small>{statusLabels[job.status]}</small></span><span className={`status-dot ${job.status}`} /></button>;
}
