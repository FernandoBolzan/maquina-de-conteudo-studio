import { useEffect, useRef } from 'react';
import { Gamepad2, Keyboard, Sparkles } from 'lucide-react';
import gameUrl from './ai-escape.html?url';
import threeUrl from 'three/build/three.min.js?url';
import rankingUrl from './ai-escape-ranking.js?url&no-inline';
import { Modal } from './components';
import { invoke } from './state';

const gameSrc = `${gameUrl}?three=${encodeURIComponent(threeUrl)}&ranking=${encodeURIComponent(rankingUrl)}`;

export function AIEscapeDialog({ onClose }: { onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const githubLoginRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let disposed = false;
    void invoke<string | undefined>('setup.githubLogin').then(login => {
      if (disposed || !login || !/^[A-Za-z0-9-]{1,39}$/.test(login)) return;
      githubLoginRef.current = login;
      iframeRef.current?.contentWindow?.postMessage({ type: 'mdc-game-github-login', login }, '*');
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, []);

  const sendGithubLogin = () => {
    const login = githubLoginRef.current;
    if (login) iframeRef.current?.contentWindow?.postMessage({ type: 'mdc-game-github-login', login }, '*');
  };

  return (
    <Modal title="AI Escape 3D" onClose={onClose} wide className="game-modal">
      <div className="game-modal-meta">
        <span className="game-modal-kicker"><Sparkles size={14} aria-hidden="true" /> PAUSA CRIATIVA</span>
        <span className="game-modal-live"><i aria-hidden="true" />A geração continua em segundo plano</span>
      </div>
      <div className="game-frame-shell">
        <iframe
          ref={iframeRef}
          className="game-frame"
          src={gameSrc}
          title="AI Escape 3D, jogo de navegação e sobrevivência"
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          onLoad={sendGithubLogin}
        />
      </div>
      <p className="game-modal-hint"><Keyboard size={14} aria-hidden="true" /><span><strong>WASD / setas</strong> mover <span aria-hidden="true">·</span> <strong>Espaço / Shift</strong> dash <span aria-hidden="true">·</span> <strong>P</strong> pausar <span aria-hidden="true">·</span> toque no botão fechar para voltar</span><Gamepad2 size={15} aria-hidden="true" /></p>
    </Modal>
  );
}
