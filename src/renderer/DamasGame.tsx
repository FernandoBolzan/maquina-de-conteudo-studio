import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Flag, RotateCcw, Undo2 } from 'lucide-react';
import {
  BLACK, WHITE, currentPosition, explainMandatory, gameStatus, generateMoves, movableSquares, newGame, nextSquares, playMove, squareName,
  type DrawReason, type Game, type GameStatus, type LevelId, type Move, type Side,
} from '../shared/damas';
import { DAMAS_LEVELS, createSearch } from '../shared/damas-ai';
import { clearSavedGame, loadPreferences, loadSavedGame, saveGame, savePreferences, type DamasStorage } from '../shared/damas-storage';
import { clickSquare, partialCapture, undoCount, undoForPlayer } from '../shared/damas-ui';
import { DamasBoard } from './DamasBoard';

/** Fatia de trabalho da busca entre dois respiros do navegador (≈ 50 ms no pior caso medido). */
const SLICE_NODES = 8000;
/** Pausa antes da máquina pensar: dá tempo de ver a jogada do jogador antes da resposta. */
const THINK_DELAY_MS = 700;
/** Animação da jogada da máquina: espera inicial, tempo por salto (capturas em cadeia têm vários) e pausa no destino. */
const ANIM_START_MS = 150;
const HOP_MS = 650;
const ANIM_END_MS = 500;
/** Teto de relógio: passado isso a máquina joga o melhor lance da última iteração completa. */
const THINK_LIMIT_MS = 2500;

const LEVEL_ORDER: readonly LevelId[] = ['iniciante', 'intermediario', 'avancado', 'mestre'];

const DRAW_TEXT: Record<DrawReason, string> = {
  kings: 'Empate: 20 lances de cada lado só com damas, sem captura.',
  ending: 'Empate: o final não foi decidido em 5 lances de cada lado.',
  repetition: 'Empate: a mesma posição apareceu pela terceira vez.',
};

function browserStorage(): DamasStorage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

type Resolved = GameStatus | { state: 'resigned' };

function describeMove(move: Move): string {
  const captured = move.captured.length;
  const route = move.path.map(squareName).join(' → ');
  return captured === 0 ? `A máquina jogou ${route}.` : `A máquina jogou ${route} e capturou ${captured === 1 ? '1 peça' : `${captured} peças`}.`;
}

function resultText(status: Resolved, color: Side): string {
  if (status.state === 'resigned') return 'Você desistiu. A máquina venceu.';
  if (status.state === 'draw') return DRAW_TEXT[status.reason];
  if (status.state === 'won') {
    const win = status.winner === color;
    const how = status.reason === 'captured' ? 'Todas as peças foram capturadas.' : 'Sem lances possíveis.';
    return `${win ? 'Você venceu!' : 'A máquina venceu.'} ${how}`;
  }
  return '';
}

export function DamasGame({ escapeRef }: { escapeRef: MutableRefObject<() => boolean> }) {
  const storage = useMemo(browserStorage, []);
  const [preferences, setPreferences] = useState(() => loadPreferences(storage));
  const [saved, setSaved] = useState(() => loadSavedGame(storage));
  const [session, setSession] = useState<{ color: Side; level: LevelId } | undefined>(undefined);
  const [game, setGame] = useState<Game>(newGame);
  const [path, setPath] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [resigned, setResigned] = useState(false);
  // Jogada da máquina em exibição: o tabuleiro ainda mostra a posição anterior e a peça percorre `move.path` salto a salto.
  const [anim, setAnim] = useState<{ move: Move; hop: number } | undefined>(undefined);

  const pathRef = useRef(path);
  pathRef.current = path;
  useEffect(() => {
    // Esc limpa a seleção em andamento; sem seleção, deixa o diálogo fechar.
    escapeRef.current = () => {
      if (pathRef.current.length === 0) return false;
      setPath([]);
      return true;
    };
    return () => { escapeRef.current = () => false; };
  }, [escapeRef]);

  const position = currentPosition(game);
  const status: Resolved = resigned ? { state: 'resigned' } : gameStatus(game);
  const playing = status.state === 'playing';
  const humanTurn = session !== undefined && playing && position.turn === session.color;
  const machineTurn = session !== undefined && playing && position.turn !== session.color;

  // A máquina pensa em fatias (cada `setTimeout` devolve o controle ao navegador); mudar a partida cancela a busca.
  useEffect(() => {
    if (!session || !machineTurn) return;
    const search = createSearch(position, session.level, Math.random);
    const started = performance.now();
    let timer: number | undefined;
    const tick = () => {
      search.step(SLICE_NODES);
      const timedOut = performance.now() - started > THINK_LIMIT_MS;
      if (!search.done && !timedOut) { timer = window.setTimeout(tick, 0); return; }
      const move = search.best() ?? generateMoves(position)[0];
      if (!move) return;
      setAnim({ move, hop: 0 });
    };
    timer = window.setTimeout(tick, THINK_DELAY_MS);
    return () => { search.cancel(); window.clearTimeout(timer); };
    // `position` muda junto com `game`; a busca recomeça só quando a vez ou a partida mudam.
  }, [game, session, machineTurn]);

  // Anima a jogada (um salto por etapa) e só então a grava na partida.
  useEffect(() => {
    if (!anim) return;
    const { move, hop } = anim;
    const timer = window.setTimeout(() => {
      if (hop < move.path.length - 1) { setAnim({ move, hop: hop + 1 }); return; }
      setNote(describeMove(move));
      setAnim(undefined);
      setGame(current => playMove(current, move));
    }, hop === 0 ? ANIM_START_MS : hop < move.path.length - 1 ? HOP_MS : ANIM_END_MS);
    return () => window.clearTimeout(timer);
  }, [anim]);

  // Persistência: partida em andamento volta pelo "Continuar partida"; terminada, é descartada.
  useEffect(() => {
    if (!session || game.moves.length === 0) return;
    if (playing) saveGame(storage, game, session.color, session.level);
    else { clearSavedGame(storage); setSaved(undefined); }
  }, [game, session, playing, storage]);

  const legalMoves = useMemo(() => (humanTurn ? generateMoves(position) : []), [game, humanTurn]);
  const movable = useMemo(() => movableSquares(legalMoves), [legalMoves]);
  const targets = useMemo(() => new Set(path.length > 0 ? nextSquares(legalMoves, path) : []), [legalMoves, path]);
  const mandatory = humanTurn ? explainMandatory(position) : undefined;
  // Em captura em cadeia, a peça já aparece na última casa clicada e as capturadas até ali somem.
  const shown = anim ?? partialCapture(legalMoves, path);

  const begin = (color: Side, level: LevelId, from: Game) => {
    setSession({ color, level });
    setGame(from);
    setPath([]);
    setNote('');
    setResigned(false);
    setAnim(undefined);
  };

  const start = () => {
    savePreferences(storage, preferences);
    clearSavedGame(storage);
    setSaved(undefined);
    begin(preferences.color, preferences.level, newGame());
  };

  const onSquare = (square: number) => {
    if (!humanTurn) return;
    const result = clickSquare(position, legalMoves, path, square);
    setNote(result.mustCapture ? 'Você precisa capturar com outra peça.' : '');
    setPath(result.path);
    if (result.play) setGame(current => playMove(current, result.play!));
  };

  const backToSetup = () => {
    setAnim(undefined);
    setSession(undefined);
    setSaved(loadSavedGame(storage));
    setPath([]);
  };

  if (!session) {
    return (
      <div className="damas-setup">
        <fieldset className="damas-fieldset">
          <legend>Nível da máquina</legend>
          <div className="damas-choices">
            {LEVEL_ORDER.map(id => (
              <label key={id} className={`damas-choice${preferences.level === id ? ' checked' : ''}`}>
                <input type="radio" name="damas-level" value={id} checked={preferences.level === id} onChange={() => setPreferences({ ...preferences, level: id })} />
                <strong>{DAMAS_LEVELS[id].label}</strong>
                <span>{DAMAS_LEVELS[id].summary}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="damas-fieldset">
          <legend>Suas peças</legend>
          <div className="damas-choices two">
            <label className={`damas-choice${preferences.color === WHITE ? ' checked' : ''}`}>
              <input type="radio" name="damas-color" value="white" checked={preferences.color === WHITE} onChange={() => setPreferences({ ...preferences, color: WHITE })} />
              <strong>Brancas</strong><span>Você começa.</span>
            </label>
            <label className={`damas-choice${preferences.color === BLACK ? ' checked' : ''}`}>
              <input type="radio" name="damas-color" value="black" checked={preferences.color === BLACK} onChange={() => setPreferences({ ...preferences, color: BLACK })} />
              <strong>Pretas</strong><span>A máquina começa.</span>
            </label>
          </div>
        </fieldset>
        <ul className="damas-rules">
          <li>Peças andam na diagonal, uma casa para frente, e capturam para frente ou para trás.</li>
          <li>A captura é obrigatória, e vale escolher o caminho que captura mais peças.</li>
          <li>A dama anda quantas casas quiser na diagonal e captura de longe.</li>
          <li>Ganha quem capturar todas as peças do outro ou deixá-lo sem jogadas.</li>
        </ul>
        <div className="damas-actions">
          <button type="button" className="button primary" onClick={start}>Começar partida</button>
          {saved && (
            <button type="button" className="button secondary" onClick={() => begin(saved.color, saved.level, saved.game)}>
              Continuar partida ({DAMAS_LEVELS[saved.level].label}, {saved.game.moves.length} {saved.game.moves.length === 1 ? 'lance' : 'lances'})
            </button>
          )}
        </div>
      </div>
    );
  }

  const lastMove = game.moves[game.moves.length - 1];
  let statusText: string;
  if (!playing) statusText = resultText(status, session.color);
  else if (machineTurn) statusText = anim ? 'A máquina está jogando…' : 'A máquina está pensando…';
  else if (mandatory?.mustCapture) {
    statusText = mandatory.hasShorterOptions
      ? `Lei da maioria: capture ${mandatory.maxCaptured} ${mandatory.maxCaptured === 1 ? 'peça' : 'peças'}.`
      : 'Captura obrigatória.';
  } else statusText = 'Sua vez.';

  return (
    <div className="damas-play">
      <div className="damas-main">
        <DamasBoard
          position={position}
          flipped={session.color === BLACK}
          selected={path}
          movable={movable}
          targets={targets}
          last={lastMove ? lastMove.path : []}
          mustCapture={mandatory?.mustCapture ?? false}
          interactive={humanTurn}
          animation={shown}
          onSquare={onSquare}
        />
        <aside className="damas-side">
          <p className="damas-level">Nível {DAMAS_LEVELS[session.level].label}</p>
          <div className="damas-status" role="status" aria-live="polite">
            <strong className={playing ? '' : 'over'}>{statusText}</strong>
            {playing && note && <span>{note}</span>}
          </div>
          <div className="damas-controls">
            <button type="button" className="button secondary small" disabled={undoCount(game, session.color) === 0 || !playing || anim !== undefined} onClick={() => { setGame(undoForPlayer(game, session.color)); setPath([]); setNote(''); }}>
              <Undo2 size={15} aria-hidden="true" /> Desfazer
            </button>
            <button type="button" className="button secondary small" onClick={backToSetup}>
              <RotateCcw size={15} aria-hidden="true" /> Nova partida
            </button>
            {playing && (
              <button type="button" className="button ghost small" onClick={() => { setAnim(undefined); setResigned(true); setPath([]); clearSavedGame(storage); setSaved(undefined); }}>
                <Flag size={15} aria-hidden="true" /> Desistir
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
