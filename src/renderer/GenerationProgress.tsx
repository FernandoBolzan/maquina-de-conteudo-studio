import { useEffect, useRef, useState } from 'react';
import { Clock, Maximize2, Terminal } from 'lucide-react';
import type { AgentActivity, Job } from '../shared/contracts';

export type GenerationProgressState = 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled';

const RECENT_LIMIT = 8;
const EMPTY_LOG_AGENT = 'Aguardando o primeiro passo do agente';
const EMPTY_LOG_PROCESS = 'Este processo não registra etapas resumidas. Use "Terminal completo" para ver a saída.';
const BUBBLE_FALLBACK: Record<GenerationProgressState, string> = {
  idle: 'Aguardando início',
  running: 'Processando',
  succeeded: 'Etapa concluída',
  failed: 'Etapa interrompida',
  cancelled: 'Etapa cancelada',
};
const RESULT_TEXT: Record<Exclude<GenerationProgressState, 'idle' | 'running'>, string> = {
  succeeded: 'Concluído. Revise o resultado.',
  failed: 'Não foi possível concluir. Veja o registro completo.',
  cancelled: 'Cancelado.',
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatClock(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

function elapsedSeconds(job: Job | undefined, state: GenerationProgressState, now: number): number {
  if (!job) return 0;
  const start = Date.parse(job.createdAt);
  if (Number.isNaN(start)) return 0;
  const end = state === 'running' || !job.endedAt ? now : Date.parse(job.endedAt);
  return ((Number.isNaN(end) ? now : end) - start) / 1000;
}

function statusLine(state: GenerationProgressState, statusText: string | undefined): string {
  if (state === 'succeeded' || state === 'failed' || state === 'cancelled') return RESULT_TEXT[state];
  if (statusText) return statusText;
  return state === 'idle' ? 'Aguardando início' : 'Em andamento';
}

export function GenerationProgress({ title, job, state, statusText, onOpenTerminal }: {
  title: string;
  job?: Job;
  state: GenerationProgressState;
  statusText?: string;
  onOpenTerminal?: () => void;
}) {
  const running = state === 'running';
  const [now, setNow] = useState(() => Date.now());
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const activity: AgentActivity[] = job?.activity ?? [];
  const recent = activity.slice(-RECENT_LIMIT);
  const bubbleText = job?.currentActivity || statusText || BUBBLE_FALLBACK[state];
  const line = statusLine(state, statusText);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [recent.length, bubbleText]);

  return (
    <section className={`gen-terminal-window is-${state}`} aria-label={`Andamento: ${title}`} data-state={state}>
      <header className="gen-terminal-bar">
        <div className="gen-terminal-dots" aria-hidden="true">
          <span className="gen-dot close" />
          <span className="gen-dot min" />
          <span className="gen-dot max" />
        </div>
        <div className="gen-terminal-title">
          <Terminal size={13} className="terminal-prompt-icon" />
          <span>{title}</span>
        </div>
        <div className="gen-terminal-meta">
          <time className="gen-terminal-elapsed" aria-label="Tempo decorrido">
            {running && <span className="pulsing-led" />}
            <Clock size={12} />
            {formatElapsed(elapsedSeconds(job, state, now))}
          </time>
        </div>
      </header>

      <div className="gen-terminal-body" ref={logRef}>
        <div className="gen-terminal-lead">
          <span className="terminal-prefix">$</span>
          <span className="terminal-lead-text">{bubbleText}</span>
          {running && <span className="blinking-cursor" aria-hidden="true">▋</span>}
        </div>

        <div className="gen-terminal-lines" role="log" aria-label="Registro simplificado">
          {recent.length === 0 ? (
            <div className="gen-terminal-line is-empty">
              <span># {job?.agentSession ? EMPTY_LOG_AGENT : EMPTY_LOG_PROCESS}</span>
            </div>
          ) : (
            recent.map(item => {
              const isWarn = /erro|error|falha|fail/i.test(item.text);
              return (
                <div key={item.id} className={`gen-terminal-line ${isWarn ? 'is-warn' : ''}`}>
                  <time className="gen-line-time" dateTime={item.at}>[{formatClock(item.at)}]</time>
                  <span className="gen-line-arrow">›</span>
                  <span className="gen-line-text">{item.text}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <footer className="gen-terminal-footer">
        <div className="gen-terminal-status">
          {running && (
            <span className="gen-progress-dots" aria-hidden="true">
              <i /><i /><i />
            </span>
          )}
          <span className="gen-terminal-status-text">{line}</span>
        </div>
        <div className="gen-terminal-actions">
          <button
            type="button"
            className="button small secondary gen-terminal-btn"
            onClick={onOpenTerminal}
            disabled={!onOpenTerminal}
          >
            <Maximize2 size={13} />
            <span>Terminal completo</span>
          </button>
        </div>
      </footer>
    </section>
  );
}
