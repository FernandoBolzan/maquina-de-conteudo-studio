import { useRef, useState, type KeyboardEvent } from 'react';
import { Crown } from 'lucide-react';
import { colOf, rowOf, squareAt, squareName, type Position } from '../shared/damas';
import { neighborSquare, type ArrowKey } from '../shared/damas-ui';

const ARROWS: Record<string, true> = { ArrowLeft: true, ArrowRight: true, ArrowUp: true, ArrowDown: true };
const isArrow = (key: string): key is ArrowKey => key in ARROWS;

function pieceLabel(piece: number): string {
  if (piece === 1) return 'pedra branca';
  if (piece === 2) return 'dama branca';
  if (piece === -1) return 'pedra preta';
  if (piece === -2) return 'dama preta';
  return 'vazia';
}

export interface DamasBoardProps {
  position: Position;
  /** Tabuleiro virado para quem joga de pretas (as pretas ficam embaixo). */
  flipped: boolean;
  selected: readonly number[];
  movable: ReadonlySet<number>;
  targets: ReadonlySet<number>;
  /** Casas do último lance (origem, passagens e destino). */
  last: readonly number[];
  mustCapture: boolean;
  interactive: boolean;
  onSquare: (square: number) => void;
}

/** Tabuleiro 8x8: 32 botões nas casas escuras, tabindex móvel e setas conforme o que o jogador vê. */
export function DamasBoard({ position, flipped, selected, movable, targets, last, mustCapture, interactive, onSquare }: DamasBoardProps) {
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const [focused, setFocused] = useState(flipped ? squareAt(7, 7) : squareAt(0, 0));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isArrow(event.key)) return;
    const from = event.target instanceof HTMLElement ? Number(event.target.dataset.square) : Number.NaN;
    if (!Number.isInteger(from)) return;
    event.preventDefault();
    const target = neighborSquare(from, event.key, flipped);
    if (target === undefined) return;
    setFocused(target);
    buttons.current.get(target)?.focus();
  };

  const cells = [];
  for (let visualRow = 0; visualRow < 8; visualRow++) {
    for (let visualCol = 0; visualCol < 8; visualCol++) {
      const square = flipped ? squareAt(visualRow, 7 - visualCol) : squareAt(7 - visualRow, visualCol);
      if ((rowOf(square) + colOf(square)) % 2 !== 0) {
        cells.push(<div key={square} className="damas-cell light" aria-hidden="true" />);
        continue;
      }
      const piece = position.board[square]!;
      const canMove = interactive && movable.has(square);
      const classes = ['damas-cell', 'dark'];
      if (selected.includes(square)) classes.push('selected');
      if (targets.has(square)) classes.push('target');
      if (canMove) classes.push('movable');
      if (canMove && mustCapture) classes.push('must-capture');
      if (last.includes(square)) classes.push('last');
      const label = [
        squareName(square),
        pieceLabel(piece),
        selected.includes(square) ? 'selecionada' : '',
        targets.has(square) ? 'destino possível' : '',
        canMove && !selected.includes(square) ? (mustCapture ? 'pode capturar' : 'pode jogar') : '',
      ].filter(Boolean).join(', ');
      cells.push(
        <button
          key={square}
          type="button"
          ref={node => { if (node) buttons.current.set(square, node); else buttons.current.delete(square); }}
          className={classes.join(' ')}
          data-square={square}
          tabIndex={square === focused ? 0 : -1}
          aria-label={label}
          aria-disabled={!interactive}
          onFocus={() => setFocused(square)}
          onClick={() => { if (interactive) onSquare(square); }}
        >
          {piece !== 0 && (
            <span className={`damas-piece ${piece > 0 ? 'white' : 'black'}${Math.abs(piece) === 2 ? ' king' : ''}`} aria-hidden="true">
              {Math.abs(piece) === 2 && <Crown size={18} />}
            </span>
          )}
        </button>,
      );
    }
  }
  return <div className={`damas-board${flipped ? ' flipped' : ''}`} role="group" aria-label="Tabuleiro de damas" onKeyDown={onKeyDown}>{cells}</div>;
}
