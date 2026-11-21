import { useRef, useState } from 'react';
import { ArrowLeft, Crown, Gamepad2, Sparkles } from 'lucide-react';
import { AIEscapeGame } from './AIEscapeGame';
import { DamasGame } from './DamasGame';
import { Modal } from './components';

type Screen = 'choice' | 'ai-escape' | 'damas';

const TITLES: Record<Screen, string> = {
  choice: 'Escolha um jogo',
  'ai-escape': 'AI Escape 3D',
  damas: 'Damas Brasileiras',
};

/** Pausa enquanto a geração roda: escolha entre os jogos. Sempre abre na escolha; "Trocar de jogo" desmonta o jogo atual. */
export function ArcadeDialog({ onClose }: { onClose: () => void }) {
  const [screen, setScreen] = useState<Screen>('choice');
  const escapeRef = useRef<() => boolean>(() => false);
  return (
    <Modal title={TITLES[screen]} onClose={onClose} wide className="game-modal" focusKey={screen} escapeGuard={() => escapeRef.current()}>
      <div className="game-modal-meta">
        <span className="game-modal-kicker"><Sparkles size={14} aria-hidden="true" /> PAUSA CRIATIVA</span>
        <span className="game-modal-live"><i aria-hidden="true" />A geração continua em segundo plano</span>
      </div>
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
