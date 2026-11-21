/**
 * Damas brasileiras (8x8). Regras: CBJD, "Regras Oficiais de Jogo de Damas" (resumo, arts. 1-18, e "Do empate", arts. 97-100).
 *
 * - 12 pedras por lado, só casas escuras, brancas começam. Pedra anda 1 casa para frente e captura para frente e para trás.
 * - Dama voadora: anda e captura à distância e pousa em qualquer casa livre depois da peça capturada.
 * - Captura obrigatória e lei da maioria. Peças capturadas só saem no fim do lance e continuam bloqueando; não se captura a
 *   mesma peça duas vezes; passar duas vezes pela mesma casa vazia é permitido.
 * - A pedra só vira dama se PARAR na última linha; passando durante a captura, segue como pedra.
 *
 * Simplificação declarada: o CBJD faz os empates dependerem de aviso dos jogadores e de planilha (arts. 97b e 98); aqui são
 * automáticos.
 */

/** 1 = brancas, -1 = pretas. */
export type Side = 1 | -1;
export const WHITE: Side = 1;
export const BLACK: Side = -1;
/** 0 vazio; 1/2 pedra/dama branca; -1/-2 pedra/dama preta. */
export type Piece = 0 | 1 | 2 | -1 | -2;

/** Constantes de empate (jogadas = plies). Fonte: CBJD, arts. 16 e 97b (só damas), 99 e 100 (finais), 98 (repetição). */
export const DRAW_RULES = {
  /** 20 lances de cada jogador seguidos só com damas, sem captura nem lance de pedra. */
  kingPlies: 40,
  /** Finais de 5 lances de cada jogador. */
  endingPlies: 10,
  /** Mesma posição, com o mesmo lado a jogar, pela terceira vez. */
  repetitions: 3,
} as const;

export interface Move {
  /** Casas visitadas: origem, pousos intermediários e destino. */
  readonly path: readonly number[];
  /** Casas das peças capturadas, na ordem. */
  readonly captured: readonly number[];
}

export interface Position {
  readonly board: Int8Array;
  readonly turn: Side;
  /** Jogadas seguidas só de dama sem captura. */
  readonly kingPlies: number;
  /** Jogadas feitas com a assinatura de final empatado valendo. */
  readonly endingPlies: number;
  readonly whiteMen: number;
  readonly whiteKings: number;
  readonly blackMen: number;
  readonly blackKings: number;
  readonly hashHi: number;
  readonly hashLo: number;
}

export type DrawReason = 'kings' | 'ending' | 'repetition';
export type GameStatus =
  | { state: 'playing' }
  | { state: 'won'; winner: Side; reason: 'blocked' | 'captured' }
  | { state: 'draw'; reason: DrawReason };

export interface Game {
  readonly positions: readonly Position[];
  readonly moves: readonly Move[];
}

const DR = [1, 1, -1, -1] as const;
const DC = [1, -1, 1, -1] as const;

export const rowOf = (square: number): number => square >> 3;
export const colOf = (square: number): number => square & 7;
export const squareAt = (row: number, col: number): number => row * 8 + col;
export const isDark = (square: number): boolean => ((square >> 3) + (square & 7)) % 2 === 0;
export function squareName(square: number): string { return `${'abcdefgh'[colOf(square)]}${rowOf(square) + 1}`; }
export function parseSquare(name: string): number {
  const col = 'abcdefgh'.indexOf(name[0] ?? '');
  const row = Number(name[1]) - 1;
  if (col < 0 || !Number.isInteger(row) || row < 0 || row > 7) throw new Error(`Casa inválida: ${name}`);
  return squareAt(row, col);
}

/** NEIGH[casa * 4 + direção] = casa vizinha ou -1. RAY[casa * 4 + direção] = casas em linha até a borda. */
const NEIGH = new Int8Array(256).fill(-1);
const RAY: number[][] = Array.from({ length: 256 }, () => []);
for (let square = 0; square < 64; square++) {
  for (let dir = 0; dir < 4; dir++) {
    let row = rowOf(square) + DR[dir]!;
    let col = colOf(square) + DC[dir]!;
    let first = true;
    while (row >= 0 && row < 8 && col >= 0 && col < 8) {
      const next = squareAt(row, col);
      if (first) { NEIGH[square * 4 + dir] = next; first = false; }
      RAY[square * 4 + dir]!.push(next);
      row += DR[dir]!;
      col += DC[dir]!;
    }
  }
}

// Zobrist em duas metades Int32 (a metade alta com 21 bits): `^` em número de 52 bits perderia os bits altos.
const ZOBRIST_HI = new Int32Array(64 * 4);
const ZOBRIST_LO = new Int32Array(64 * 4);
let TURN_HI = 0;
let TURN_LO = 0;
{
  let seed = 0x9e3779b9;
  const next = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) | 0;
  };
  for (let i = 0; i < ZOBRIST_HI.length; i++) { ZOBRIST_HI[i] = next() & 0x1fffff; ZOBRIST_LO[i] = next(); }
  TURN_HI = next() & 0x1fffff;
  TURN_LO = next();
}
const pieceIndex = (piece: number): number => (piece === 1 ? 0 : piece === 2 ? 1 : piece === -1 ? 2 : 3);

/** Chave de 52 bits segura em Number: posição + lado a jogar. */
export function positionHash(position: Position): number { return position.hashHi * 4294967296 + (position.hashLo >>> 0); }

export function makePosition(board: Int8Array, turn: Side, kingPlies = 0, endingPlies = 0): Position {
  let whiteMen = 0, whiteKings = 0, blackMen = 0, blackKings = 0, hashHi = turn === WHITE ? TURN_HI : 0, hashLo = turn === WHITE ? TURN_LO : 0;
  for (let square = 0; square < 64; square++) {
    const piece = board[square]!;
    if (piece === 0) continue;
    if (piece === 1) whiteMen++; else if (piece === 2) whiteKings++; else if (piece === -1) blackMen++; else blackKings++;
    const index = square * 4 + pieceIndex(piece);
    hashHi ^= ZOBRIST_HI[index]!;
    hashLo ^= ZOBRIST_LO[index]!;
  }
  return { board, turn, kingPlies, endingPlies, whiteMen, whiteKings, blackMen, blackKings, hashHi, hashLo };
}

export function initialPosition(): Position {
  const board = new Int8Array(64);
  for (let square = 0; square < 64; square++) {
    if (!isDark(square)) continue;
    const row = rowOf(square);
    if (row <= 2) board[square] = 1;
    else if (row >= 5) board[square] = -1;
  }
  return makePosition(board, WHITE);
}

/**
 * Monta uma posição a partir de 8 linhas (de 8 para 1): `.` vazio, `w`/`W` pedra/dama branca, `b`/`B` pedra/dama preta.
 * Peças só em casas escuras.
 */
export function fromAscii(rows: readonly string[], turn: Side = WHITE, kingPlies = 0, endingPlies = 0): Position {
  if (rows.length !== 8) throw new Error('São necessárias 8 linhas.');
  const board = new Int8Array(64);
  rows.forEach((line, index) => {
    const compact = line.replace(/\s+/g, '');
    if (compact.length !== 8) throw new Error(`Linha ${8 - index} precisa de 8 casas.`);
    const row = 7 - index;
    for (let col = 0; col < 8; col++) {
      const piece = compact[col]!;
      if (piece === '.') continue;
      const value = piece === 'w' ? 1 : piece === 'W' ? 2 : piece === 'b' ? -1 : piece === 'B' ? -2 : undefined;
      if (value === undefined) throw new Error(`Peça inválida: ${piece}`);
      const square = squareAt(row, col);
      if (!isDark(square)) throw new Error(`Peça em casa clara: ${squareName(square)}`);
      board[square] = value;
    }
  });
  return makePosition(board, turn, kingPlies, endingPlies);
}

const isEnemy = (piece: number, turn: Side): boolean => piece !== 0 && (piece > 0 ? WHITE : BLACK) !== turn;

/**
 * Sequências de captura terminadas (sem continuação). A peça que se move é levantada da origem (a origem fica livre e passável);
 * as capturadas ficam marcadas, continuam bloqueando e não podem ser saltadas de novo.
 */
function captureSequences(board: Int8Array, turn: Side): Move[] {
  const found: Move[] = [];
  const marked = new Uint8Array(64);
  const path: number[] = [];
  const captured: number[] = [];
  const walk = (at: number, king: boolean): void => {
    let extended = false;
    for (let dir = 0; dir < 4; dir++) {
      if (!king) {
        const over = NEIGH[at * 4 + dir]!;
        if (over < 0 || marked[over] === 1 || !isEnemy(board[over]!, turn)) continue;
        const land = NEIGH[over * 4 + dir]!;
        if (land < 0 || board[land] !== 0) continue;
        extended = true;
        marked[over] = 1; captured.push(over); path.push(land);
        walk(land, false);
        path.pop(); captured.pop(); marked[over] = 0;
        continue;
      }
      const ray = RAY[at * 4 + dir]!;
      let hit = -1;
      for (let i = 0; i < ray.length; i++) {
        if (board[ray[i]!] !== 0) { hit = i; break; }
      }
      if (hit < 0) continue;
      const over = ray[hit]!;
      if (marked[over] === 1 || !isEnemy(board[over]!, turn)) continue;
      for (let i = hit + 1; i < ray.length && board[ray[i]!] === 0; i++) {
        const land = ray[i]!;
        extended = true;
        marked[over] = 1; captured.push(over); path.push(land);
        walk(land, true);
        path.pop(); captured.pop(); marked[over] = 0;
      }
    }
    if (!extended && captured.length > 0) found.push({ path: [...path], captured: [...captured] });
  };
  for (let from = 0; from < 64; from++) {
    const piece = board[from]!;
    if (piece === 0 || (piece > 0 ? WHITE : BLACK) !== turn) continue;
    board[from] = 0;
    path.length = 0; captured.length = 0;
    path.push(from);
    walk(from, Math.abs(piece) === 2);
    board[from] = piece;
  }
  return found;
}

function simpleMoves(board: Int8Array, turn: Side): Move[] {
  const moves: Move[] = [];
  const forward = turn === WHITE ? [0, 1] : [2, 3];
  for (let from = 0; from < 64; from++) {
    const piece = board[from]!;
    if (piece === 0 || (piece > 0 ? WHITE : BLACK) !== turn) continue;
    if (Math.abs(piece) === 1) {
      for (const dir of forward) {
        const to = NEIGH[from * 4 + dir]!;
        if (to >= 0 && board[to] === 0) moves.push({ path: [from, to], captured: [] });
      }
    } else {
      for (let dir = 0; dir < 4; dir++) {
        const ray = RAY[from * 4 + dir]!;
        for (let i = 0; i < ray.length && board[ray[i]!] === 0; i++) moves.push({ path: [from, ray[i]!], captured: [] });
      }
    }
  }
  return moves;
}

/** Lances legais: com captura disponível só existem as capturas de tamanho máximo (lei da maioria). */
export function generateMoves(position: Position): Move[] {
  const sequences = captureSequences(position.board, position.turn);
  if (sequences.length === 0) return simpleMoves(position.board, position.turn);
  let max = 0;
  for (const sequence of sequences) if (sequence.captured.length > max) max = sequence.captured.length;
  return sequences.filter(sequence => sequence.captured.length === max);
}

/** Por que a captura é obrigatória: tamanho da maior sequência e se há sequências menores que a lei da maioria proíbe. */
export function explainMandatory(position: Position): { mustCapture: boolean; maxCaptured: number; hasShorterOptions: boolean } {
  const sequences = captureSequences(position.board, position.turn);
  if (sequences.length === 0) return { mustCapture: false, maxCaptured: 0, hasShorterOptions: false };
  let max = 0;
  for (const sequence of sequences) if (sequence.captured.length > max) max = sequence.captured.length;
  return { mustCapture: true, maxCaptured: max, hasShorterOptions: sequences.some(sequence => sequence.captured.length < max) };
}

const ENDINGS_99: Record<string, true> = { '2K0P|2K0P': true, '1K0P|2K0P': true, '1K1P|2K0P': true, '1K0P|1K0P': true, '1K0P|1K1P': true };
const ENDINGS_100: Record<string, true> = { '1K0P|3K0P': true, '1K0P|2K1P': true, '1K0P|1K2P': true };

/** Assinatura de final empatado em 5 lances de cada jogador (art. 99 e art. 100), ou `undefined`. */
export function endingSignature(position: Position): string | undefined {
  const total = position.whiteMen + position.whiteKings + position.blackMen + position.blackKings;
  if (total > 4 || total < 2) return undefined;
  const white = `${position.whiteKings}K${position.whiteMen}P`;
  const black = `${position.blackKings}K${position.blackMen}P`;
  const key = [white, black].sort().join('|');
  if (key in ENDINGS_99) return key;
  if (!(key in ENDINGS_100)) return undefined;
  const loneKing: Piece = white === '1K0P' ? 2 : -2;
  for (let diagonal = 0; diagonal < 8; diagonal++) {
    if (position.board[squareAt(diagonal, diagonal)] === loneKing) return key;
  }
  return undefined;
}

/** Aplica o lance (sem validar). */
export function applyMove(position: Position, move: Move): Position {
  const board = position.board.slice();
  const from = move.path[0]!;
  const to = move.path[move.path.length - 1]!;
  const piece = board[from]!;
  let { whiteMen, whiteKings, blackMen, blackKings, hashHi, hashLo } = position;
  const lift = (square: number, value: number): void => {
    const index = square * 4 + pieceIndex(value);
    hashHi ^= ZOBRIST_HI[index]!;
    hashLo ^= ZOBRIST_LO[index]!;
    if (value === 1) whiteMen--; else if (value === 2) whiteKings--; else if (value === -1) blackMen--; else blackKings--;
  };
  const put = (square: number, value: number): void => {
    const index = square * 4 + pieceIndex(value);
    hashHi ^= ZOBRIST_HI[index]!;
    hashLo ^= ZOBRIST_LO[index]!;
    if (value === 1) whiteMen++; else if (value === 2) whiteKings++; else if (value === -1) blackMen++; else blackKings++;
  };
  for (const square of move.captured) { lift(square, board[square]!); board[square] = 0; }
  lift(from, piece);
  board[from] = 0;
  const crowned = Math.abs(piece) === 1 && rowOf(to) === (piece > 0 ? 7 : 0);
  const landed = crowned ? piece * 2 : piece;
  board[to] = landed;
  put(to, landed);
  hashHi ^= TURN_HI;
  hashLo ^= TURN_LO;
  const kingPlies = move.captured.length === 0 && Math.abs(piece) === 2 ? position.kingPlies + 1 : 0;
  const next: Position = { board, turn: position.turn === WHITE ? BLACK : WHITE, kingPlies, endingPlies: 0, whiteMen, whiteKings, blackMen, blackKings, hashHi, hashLo };
  const signature = endingSignature(next);
  const before = endingSignature(position);
  return signature === undefined ? next : { ...next, endingPlies: before === signature ? position.endingPlies + 1 : 1 };
}

/** Empate por contadores (só damas ou final de 5 lances). */
export function drawByCounters(position: Position): DrawReason | undefined {
  if (position.kingPlies >= DRAW_RULES.kingPlies) return 'kings';
  if (position.endingPlies >= DRAW_RULES.endingPlies) return 'ending';
  return undefined;
}

export function newGame(): Game { return { positions: [initialPosition()], moves: [] }; }
export function gameFrom(position: Position): Game { return { positions: [position], moves: [] }; }
export const currentPosition = (game: Game): Position => game.positions[game.positions.length - 1]!;

export function playMove(game: Game, move: Move): Game {
  return { positions: [...game.positions, applyMove(currentPosition(game), move)], moves: [...game.moves, move] };
}

/** Desfaz as últimas `plies` jogadas. */
export function undoPlies(game: Game, plies: number): Game {
  const keep = Math.max(0, game.moves.length - plies);
  return { positions: game.positions.slice(0, keep + 1), moves: game.moves.slice(0, keep) };
}

function sameBoard(a: Int8Array, b: Int8Array): boolean {
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function gameStatus(game: Game): GameStatus {
  const position = currentPosition(game);
  if (generateMoves(position).length === 0) {
    const none = position.turn === WHITE ? position.whiteMen + position.whiteKings === 0 : position.blackMen + position.blackKings === 0;
    return { state: 'won', winner: position.turn === WHITE ? BLACK : WHITE, reason: none ? 'captured' : 'blocked' };
  }
  const counted = drawByCounters(position);
  if (counted) return { state: 'draw', reason: counted };
  let seen = 0;
  for (const earlier of game.positions) {
    if (earlier.turn === position.turn && earlier.hashHi === position.hashHi && earlier.hashLo === position.hashLo && sameBoard(earlier.board, position.board)) seen++;
  }
  return seen >= DRAW_RULES.repetitions ? { state: 'draw', reason: 'repetition' } : { state: 'playing' };
}

/** Próximas casas oferecidas a quem já clicou em `prefix` (lance escolhido por caminho). */
export function nextSquares(moves: readonly Move[], prefix: readonly number[]): number[] {
  const next = new Set<number>();
  for (const move of moves) {
    if (move.path.length <= prefix.length) continue;
    if (prefix.every((square, index) => move.path[index] === square)) next.add(move.path[prefix.length]!);
  }
  return [...next];
}

export function findMove(moves: readonly Move[], path: readonly number[]): Move | undefined {
  return moves.find(move => move.path.length === path.length && move.path.every((square, index) => square === path[index]));
}

/** Para cada origem com lance legal: as casas que podem iniciar um lance. */
export function movableSquares(moves: readonly Move[]): Set<number> { return new Set(moves.map(move => move.path[0]!)); }

export type LevelId = 'iniciante' | 'intermediario' | 'avancado' | 'mestre';
export const LEVEL_IDS: readonly LevelId[] = ['iniciante', 'intermediario', 'avancado', 'mestre'];
export const isLevelId = (value: unknown): value is LevelId => LEVEL_IDS.some(id => id === value);

export interface SavedGame { version: 1; color: Side; level: LevelId; moves: number[][] }
export const SAVED_GAME_VERSION = 1;

export function serializeGame(game: Game, color: Side, level: LevelId): SavedGame {
  return { version: SAVED_GAME_VERSION, color, level, moves: game.moves.map(move => [...move.path]) };
}

/** Repete a partida pelo motor; qualquer lance ilegal, versão errada ou formato inválido devolve `undefined`. */
export function restoreGame(value: unknown): { game: Game; color: Side; level: LevelId } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if (!('version' in value) || value.version !== SAVED_GAME_VERSION) return undefined;
  if (!('color' in value)) return undefined;
  const color: Side | undefined = value.color === WHITE ? WHITE : value.color === BLACK ? BLACK : undefined;
  if (color === undefined) return undefined;
  if (!('level' in value) || !isLevelId(value.level)) return undefined;
  if (!('moves' in value) || !Array.isArray(value.moves) || value.moves.length > 2000) return undefined;
  let game = newGame();
  for (const raw of value.moves) {
    if (!Array.isArray(raw) || raw.length < 2 || raw.length > 40 || !raw.every(item => Number.isInteger(item) && item >= 0 && item < 64)) return undefined;
    const move = findMove(generateMoves(currentPosition(game)), raw);
    if (!move) return undefined;
    game = playMove(game, move);
  }
  return { game, color, level: value.level };
}
