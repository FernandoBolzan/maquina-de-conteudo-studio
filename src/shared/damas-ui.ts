import { WHITE, colOf, explainMandatory, findMove, isDark, movableSquares, nextSquares, rowOf, squareAt, undoPlies, type Game, type Move, type Position, type Side } from './damas.js';

export type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

/**
 * Casa escura vizinha na direção da seta, como o jogador vê o tabuleiro (as brancas embaixo; invertido quando joga de pretas).
 * Esquerda/direita andam 2 colunas na mesma linha; cima/baixo vão à linha vizinha, na coluna +1 e, se não houver, na -1 (visual).
 */
export function neighborSquare(square: number, key: ArrowKey, flipped: boolean): number | undefined {
  const visualRow = flipped ? rowOf(square) : 7 - rowOf(square);
  const visualCol = flipped ? 7 - colOf(square) : colOf(square);
  const candidates: [number, number][] = key === 'ArrowLeft' ? [[visualRow, visualCol - 2]]
    : key === 'ArrowRight' ? [[visualRow, visualCol + 2]]
    : key === 'ArrowUp' ? [[visualRow - 1, visualCol + 1], [visualRow - 1, visualCol - 1]]
    : [[visualRow + 1, visualCol + 1], [visualRow + 1, visualCol - 1]];
  for (const [row, col] of candidates) {
    if (row < 0 || row > 7 || col < 0 || col > 7) continue;
    const target = flipped ? squareAt(row, 7 - col) : squareAt(7 - row, col);
    if (isDark(target)) return target;
  }
  return undefined;
}

export interface ClickResult {
  /** Seleção depois do clique (casas já escolhidas do lance em andamento). */
  readonly path: number[];
  /** Lance completo quando o clique o termina. */
  readonly play?: Move;
  /** O jogador clicou numa peça sua que não pode jogar porque há captura obrigatória em outra. */
  readonly mustCapture?: boolean;
}

/** Máquina de estados do clique: escolhe a peça, depois as casas do lance (capturas em cadeia pedem uma casa por salto). */
export function clickSquare(position: Position, moves: readonly Move[], path: readonly number[], square: number): ClickResult {
  const movable = movableSquares(moves);
  if (path.length > 0 && nextSquares(moves, path).includes(square)) {
    const extended = [...path, square];
    const move = findMove(moves, extended);
    return move ? { path: [], play: move } : { path: extended };
  }
  if (movable.has(square)) return { path: [square] };
  const owned = position.board[square]! !== 0 && Math.sign(position.board[square]!) === position.turn;
  if (owned && explainMandatory(position).mustCapture) return { path: [], mustCapture: true };
  return { path: [] };
}

/**
 * Quantas jogadas desfazer para devolver a vez ao jogador (a da máquina, se já respondeu, e a dele), ou 0 se não há o que desfazer.
 * Nunca desfaz a abertura da máquina (quando o jogador é de pretas).
 */
export function undoCount(game: Game, color: Side): number {
  const turn = game.positions[game.positions.length - 1]!.turn;
  const wanted = turn === color ? 2 : 1;
  const floor = color === WHITE ? 0 : 1;
  if (game.moves.length - wanted < floor) return 0;
  return wanted;
}

export function undoForPlayer(game: Game, color: Side): Game {
  const count = undoCount(game, color);
  return count === 0 ? game : undoPlies(game, count);
}
