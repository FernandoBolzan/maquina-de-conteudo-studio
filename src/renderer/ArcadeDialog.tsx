import { useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, CircleStop, Crown, Gamepad2, Sparkles, X } from 'lucide-react';
import { AIEscapeGame } from './AIEscapeGame';
import { DamasGame } from './DamasGame';
import { Modal } from './components';
import type { Job } from '../shared/contracts';

type Screen = 'choice' | 'ai-escape' | 'damas';

const TITLES: Record<Screen, string> = {
  choice: 'Escolha um jogo',
  'ai-escape': 'AI Escape 3D',
  damas: 'Damas Brasileiras',
};

const JOB_STATUS_TEXT: Record<Job['status'], string> = {
  running: 'A geração continua em segundo plano',
  succeeded: 'Geração concluída',
  failed: 'Geração falhou',
  cancelled: 'Geração cancelada',
  interrupted: 'Geração interrompida',
};

/** A pausa continua aberta até a pessoa sair; o resultado da geração aparece sobre qualquer jogo. */
export function ArcadeDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const [screen, setScreen] = useState<Screen>('choice');
  const [dismissedNotice, setDismissedNotice] = useState('');
  const escapeRef = useRef<() => boolean>(() => false);
  const completion = job.status === 'running' ? null : job;
  const noticeKey = completion ? `${completion.id}:${completion.status}` : '';
  const CompletionIcon = completion?.status === 'succeeded' ? Check : completion?.status === 'cancelled' ? CircleStop : AlertCircle;
  return (
    <Modal title={TITLES[screen]} onClose={onClose} wide className="game-modal" focusKey={screen} escapeGuard={() => escapeRef.current()}>
      <div className="game-modal-meta">
        <span className="game-modal-kicker"><Sparkles size={14} aria-hidden="true" /> PAUSA CRIATIVA</span>
        <span className={`game-modal-live is-${job.status}`}>
          {job.status === 'running' && <i aria-hidden="true" />}
          {JOB_STATUS_TEXT[job.status]}
        </span>
      </div>
      {completion && dismissedNotice !== noticeKey && (
        <div className={`game-completion-notice is-${completion.status}`} role={completion.status === 'failed' || completion.status === 'interrupted' ? 'alert' : 'status'} aria-live={completion.status === 'failed' || completion.status === 'interrupted' ? 'assertive' : 'polite'}>
          <CompletionIcon size={18} aria-hidden="true" />
          <span><strong>{JOB_STATUS_TEXT[completion.status]}:</strong> {completion.title}</span>
          <button type="button" className="icon-button" aria-label="Fechar aviso da geração" onClick={() => setDismissedNotice(noticeKey)}><X size={15} /></button>
        </div>
      )}
      {screen !== 'choice' && (
        <button type="button" className="button ghost small arcade-back" onClick={() => setScreen('choice')}>
          <ArrowLeft size={15} aria-hidden="true" /> Trocar de jogo
        </button>
      )}
      {screen === 'choice' && (
        <div className="arcade-picker">
          <button type="button" className="arcade-card" onClick={() => setScreen('ai-escape')}>
            <Gamepad2 size={28} aria-hidden="true" />
            <strong>AI Escape 3D</strong>
            <span>Fuja das IAs num labirinto em 3D. Ação rápida com teclado.</span>
          </button>
          <button type="button" className="arcade-card" onClick={() => setScreen('damas')}>
            <Crown size={28} aria-hidden="true" />
            <strong>Damas Brasileiras</strong>
            <span>Jogue contra a máquina em 4 níveis, do iniciante ao mestre.</span>
          </button>
        </div>
      )}
      {screen === 'ai-escape' && <AIEscapeGame />}
      {screen === 'damas' && <DamasGame escapeRef={escapeRef} />}
    </Modal>
  );
}
