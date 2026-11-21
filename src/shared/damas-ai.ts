import {
  DRAW_RULES, applyMove, colOf, drawByCounters, endingSignature, generateMoves, positionHash, rowOf,
  type LevelId, type Move, type Position, type Side,
} from './damas.js';

/**
 * IA das Damas Brasileiras: alfa-beta (negamax) com aprofundamento iterativo e tabela de transposição.
 *
 * Orçamento em NÓS (determinístico). É um portão brando entre iterações: a iteração em curso sempre termina; o custo máximo
 * por lance é medido no benchmark (scripts/damas-benchmark.ts), não prometido.
 *
 * A busca é retomável: `createSearch` devolve um objeto cujo `step(maxNodes)` consome um gerador que cede entre os pares
 * (lance da raiz, resposta) das iterações de profundidade >= 3. Iterações de profundidade 1 e 2 são atômicas, então `best()`
 * fica definido após o primeiro `step`. O resultado não depende do tamanho das fatias; `searchPlain` (recursão comum) é a
 * referência de teste.
 */

export interface LevelConfig {
  readonly id: LevelId;
  readonly label: string;
  readonly summary: string;
  readonly maxDepth: number;
  /** Nós por lance (portão entre iterações). */
  readonly budget: number;
  readonly useTT: boolean;
  /** Probabilidade de jogar um lance legal sorteado em vez do melhor (descuido), decidida por `rng` antes da busca. */
  readonly mistakeRate: number;
}

export const DAMAS_LEVELS: Readonly<Record<LevelId, LevelConfig>> = {
  iniciante: { id: 'iniciante', label: 'Iniciante', summary: 'Joga quase ao acaso. Bom para aprender as regras.', maxDepth: 1, budget: 0, useTT: false, mistakeRate: 0 },
  intermediario: { id: 'intermediario', label: 'Intermediário', summary: 'Joga com atenção, mas deixa peças soltas de vez em quando. Dá para vencer com calma.', maxDepth: 2, budget: 1500, useTT: false, mistakeRate: 0.3 },
  avancado: { id: 'avancado', label: 'Avançado', summary: 'Calcula bem e pune erros de captura.', maxDepth: 8, budget: 40000, useTT: true, mistakeRate: 0 },
  mestre: { id: 'mestre', label: 'Mestre', summary: 'Joga fundo e raramente erra. Para quem quer desafio.', maxDepth: 10, budget: 160000, useTT: true, mistakeRate: 0 },
};

/** Probabilidade de o Iniciante escolher o melhor lance em profundidade 1 (senão sorteia entre os legais). */
export const BEGINNER_BEST_PROBABILITY = 0.25;

const WIN = 100000;
const INF = 1000000;
const EXTENSION_LIMIT = 6;
const TT_LIMIT = 200000;
const MAN = 100;
const KING = 320;

const DARK_SQUARES: number[] = [];
const CENTER_BONUS = new Int8Array(64);
for (let square = 0; square < 64; square++) {
  if ((rowOf(square) + colOf(square)) % 2 !== 0) continue;
  DARK_SQUARES.push(square);
  const dr = Math.abs(rowOf(square) - 3.5);
  const dc = Math.abs(colOf(square) - 3.5);
  CENTER_BONUS[square] = Math.round(6 - (dr + dc) * 1.5);
}

/** Avaliação do ponto de vista de quem joga: material, avanço, centro e última linha defendida. */
export function evaluate(position: Position): number {
  const { board } = position;
  let score = 0;
  for (const square of DARK_SQUARES) {
    const piece = board[square]!;
    if (piece === 0) continue;
    const row = rowOf(square);
    let value: number;
    if (piece === 2 || piece === -2) value = KING + CENTER_BONUS[square]!;
    else {
      const advance = piece > 0 ? row : 7 - row;
      value = MAN + advance * 3 + CENTER_BONUS[square]! + (advance === 0 ? 6 : 0);
    }
    score += piece > 0 ? value : -value;
  }
  return position.turn === 1 ? score : -score;
}

const moveKey = (move: Move): number => move.path[0]! * 64 + move.path[move.path.length - 1]!;

function moveScore(move: Move, turn: Side, preferred: number): number {
  let score = move.captured.length * 100;
  if (moveKey(move) === preferred) score += 1000000;
  const from = move.path[0]!;
  const to = move.path[move.path.length - 1]!;
  const lastRow = turn === 1 ? 7 : 0;
  if (rowOf(to) === lastRow) score += 500;
  score += CENTER_BONUS[to]! - CENTER_BONUS[from]!;
  score += turn === 1 ? rowOf(to) - rowOf(from) : rowOf(from) - rowOf(to);
  return score;
}

/** Ordenação estável e determinística: lance preferido (TT ou iteração anterior) primeiro, depois heurística, depois índice. */
function orderMoves(moves: readonly Move[], turn: Side, preferred: number): Move[] {
  return moves
    .map((move, index) => ({ move, index, score: moveScore(move, turn, preferred) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(entry => entry.move);
}

interface TTEntry { depth: number; flag: 0 | 1 | 2; score: number; best: number }
const EXACT = 0;
const LOWER = 1;
const UPPER = 2;

interface SearchState {
  nodes: number;
  readonly tt: Map<number, TTEntry>;
  readonly useTT: boolean;
}

/** A TT é ignorada onde um empate por contador pode ocorrer dentro da subárvore (os contadores ficam fora da chave). */
function ttAllowed(state: SearchState, position: Position, depth: number): boolean {
  return state.useTT && position.kingPlies + depth < DRAW_RULES.kingPlies && position.endingPlies === 0 && endingSignature(position) === undefined;
}

interface Entered {
  readonly value?: number;
  readonly moves: Move[];
  readonly depth: number;
  readonly ext: number;
  readonly alpha: number;
  readonly beta: number;
  readonly alphaOriginal: number;
  readonly key: number;
  readonly useTT: boolean;
}

/** Entrada de um nó: conta o nó, trata terminais, empate, folha com extensão de captura e leitura da TT. */
function enter(state: SearchState, position: Position, depthIn: number, alphaIn: number, betaIn: number, ply: number, extIn: number): Entered {
  state.nodes++;
  const none: Entered = { moves: [], depth: depthIn, ext: extIn, alpha: alphaIn, beta: betaIn, alphaOriginal: alphaIn, key: 0, useTT: false };
  const moves = generateMoves(position);
  if (moves.length === 0) return { ...none, value: -(WIN - ply) };
  if (drawByCounters(position) !== undefined) return { ...none, value: 0 };
  let depth = depthIn;
  let ext = extIn;
  if (depth <= 0) {
    if (moves[0]!.captured.length > 0 && ext < EXTENSION_LIMIT) { depth = 1; ext++; } else return { ...none, value: evaluate(position) };
  }
  let alpha = alphaIn;
  let beta = betaIn;
  const useTT = ttAllowed(state, position, depth);
  const key = useTT ? positionHash(position) : 0;
  let preferred = -1;
  if (useTT) {
    const entry = state.tt.get(key);
    if (entry) {
      preferred = entry.best;
      if (entry.depth >= depth) {
        if (entry.flag === EXACT) return { ...none, value: entry.score };
        if (entry.flag === LOWER && entry.score > alpha) alpha = entry.score;
        else if (entry.flag === UPPER && entry.score < beta) beta = entry.score;
        if (alpha >= beta) return { ...none, value: entry.score };
      }
    }
  }
  return { moves: orderMoves(moves, position.turn, preferred), depth, ext, alpha, beta, alphaOriginal: alpha, key, useTT };
}

/** Saída de um nó: grava na TT com a flag calculada pelas janelas. */
function leave(state: SearchState, node: Entered, best: number, bestMove: Move | undefined): void {
  if (!node.useTT || bestMove === undefined) return;
  const flag = best <= node.alphaOriginal ? UPPER : best >= node.beta ? LOWER : EXACT;
  if (state.tt.size >= TT_LIMIT) state.tt.clear();
  state.tt.set(node.key, { depth: node.depth, flag, score: best, best: moveKey(bestMove) });
}

function negamax(state: SearchState, position: Position, depth: number, alpha: number, beta: number, ply: number, ext: number): number {
  const node = enter(state, position, depth, alpha, beta, ply, ext);
  if (node.value !== undefined) return node.value;
  let a = node.alpha;
  let best = -INF;
  let bestMove: Move | undefined;
  for (const move of node.moves) {
    const score = -negamax(state, applyMove(position, move), node.depth - 1, -node.beta, -a, ply + 1, node.ext);
    if (score > best) { best = score; bestMove = move; }
    if (score > a) a = score;
    if (a >= node.beta) break;
  }
  leave(state, node, best, bestMove);
  return best;
}

/** Plies (a partir da raiz) em que a busca cede o controle: os nós de ply 1 a 3 são geradores; de ply 4 em diante, recursão comum. */
const SLICE_PLIES = 4;

/** O mesmo nó que `negamax`, com cessão entre as respostas (usado só nos nós de ply 1 a 3). */
function* negamaxSliced(state: SearchState, position: Position, depth: number, alpha: number, beta: number, ply: number, ext: number): Generator<void, number> {
  const node = enter(state, position, depth, alpha, beta, ply, ext);
  if (node.value !== undefined) return node.value;
  let a = node.alpha;
  let best = -INF;
  let bestMove: Move | undefined;
  for (const move of node.moves) {
    const child = applyMove(position, move);
    const score = -(ply + 1 < SLICE_PLIES
      ? yield* negamaxSliced(state, child, node.depth - 1, -node.beta, -a, ply + 1, node.ext)
      : negamax(state, child, node.depth - 1, -node.beta, -a, ply + 1, node.ext));
    if (score > best) { best = score; bestMove = move; }
    if (score > a) a = score;
    if (a >= node.beta) break;
    yield;
  }
  leave(state, node, best, bestMove);
  return best;
}

interface RootResult { move: Move; score: number }

function rootOrder(position: Position, moves: readonly Move[], previous: Move | undefined): Move[] {
  return orderMoves(moves, position.turn, previous ? moveKey(previous) : -1);
}

function rootPlain(state: SearchState, position: Position, moves: readonly Move[], depth: number, previous: Move | undefined): RootResult {
  let alpha = -INF;
  let best = -INF;
  let bestMove = moves[0]!;
  for (const move of rootOrder(position, moves, previous)) {
    const score = -negamax(state, applyMove(position, move), depth - 1, -INF, -alpha, 1, 0);
    if (score > best) { best = score; bestMove = move; }
    if (score > alpha) alpha = score;
  }
  return { move: bestMove, score: best };
}

function* rootSliced(state: SearchState, position: Position, moves: readonly Move[], depth: number, previous: Move | undefined): Generator<void, RootResult> {
  let alpha = -INF;
  let best = -INF;
  let bestMove = moves[0]!;
  for (const move of rootOrder(position, moves, previous)) {
    const score = -(yield* negamaxSliced(state, applyMove(position, move), depth - 1, -INF, -alpha, 1, 0));
    if (score > best) { best = score; bestMove = move; }
    if (score > alpha) alpha = score;
    yield;
  }
  return { move: bestMove, score: best };
}

export interface SearchOptions {
  /** Multiplica o orçamento do nível (os testes usam valores menores; o produto usa 1). */
  readonly budgetScale?: number;
  /** Limita a profundidade (testes). */
  readonly maxDepth?: number;
  /** Desliga a tabela de transposição (testes de equivalência). */
  readonly disableTT?: boolean;
}

export interface SearchResult { move: Move | undefined; score: number; nodes: number; depth: number }

/** Crescimento previsto do custo de uma iteração para a seguinte (medido: o fator real fica em torno de 3 a 6). */
const GROWTH = 6;

function newState(config: LevelConfig, options: SearchOptions): SearchState { return { nodes: 0, tt: new Map(), useTT: config.useTT && options.disableTT !== true }; }
const depthCap = (config: LevelConfig, options: SearchOptions): number => Math.min(config.maxDepth, options.maxDepth ?? config.maxDepth);
/** Portão determinístico entre iterações: só abre a próxima se os nós já usados mais o custo previsto couberem no orçamento. */
const mayDeepen = (nodes: number, lastIteration: number, budget: number): boolean => nodes + lastIteration * GROWTH <= budget;

/** Busca contínua por recursão comum: a referência de teste do gerador. */
export function searchPlain(position: Position, level: LevelId, options: SearchOptions = {}): SearchResult {
  const config = DAMAS_LEVELS[level];
  const budget = config.budget * (options.budgetScale ?? 1);
  const moves = generateMoves(position);
  if (moves.length === 0) return { move: undefined, score: -WIN, nodes: 0, depth: 0 };
  if (moves.length === 1) return { move: moves[0], score: 0, nodes: 0, depth: 0 };
  const state = newState(config, options);
  let result: RootResult | undefined;
  let depth = 0;
  let lastIteration = 0;
  for (let d = 1; d <= depthCap(config, options); d++) {
    if (d > 1 && !mayDeepen(state.nodes, lastIteration, budget)) break;
    const before = state.nodes;
    result = rootPlain(state, position, moves, d, result?.move);
    lastIteration = state.nodes - before;
    depth = d;
    if (Math.abs(result.score) >= WIN - 200) break;
  }
  return { move: result?.move, score: result?.score ?? 0, nodes: state.nodes, depth };
}

export interface Search {
  /** Trabalha até gastar pelo menos `maxNodes` nós (sempre dá ao menos um passo). */
  step(maxNodes: number): void;
  /** Melhor lance da última iteração completa; `undefined` antes do primeiro `step` e depois de `cancel`. */
  best(): Move | undefined;
  readonly done: boolean;
  readonly nodes: number;
  readonly depth: number;
  readonly score: number;
  cancel(): void;
}

function bestByDepthOne(position: Position, moves: readonly Move[]): Move {
  let best = moves[0]!;
  let bestScore = -INF;
  for (const move of moves) {
    const score = -evaluate(applyMove(position, move));
    if (score > bestScore) { bestScore = score; best = move; }
  }
  return best;
}

/** Iniciante: com probabilidade `BEGINNER_BEST_PROBABILITY` o melhor lance em profundidade 1, senão um legal sorteado. */
export function chooseBeginner(position: Position, rng: () => number): Move | undefined {
  const moves = generateMoves(position);
  if (moves.length === 0) return undefined;
  if (rng() < BEGINNER_BEST_PROBABILITY) return bestByDepthOne(position, moves);
  return moves[Math.min(moves.length - 1, Math.floor(rng() * moves.length))];
}

export function createSearch(position: Position, level: LevelId, rng: () => number, options: SearchOptions = {}): Search {
  const config = DAMAS_LEVELS[level];
  const budget = config.budget * (options.budgetScale ?? 1);
  const state = newState(config, options);
  let bestMove: Move | undefined;
  let score = 0;
  let depth = 0;
  let done = false;
  let cancelled = false;

  function* run(): Generator<void> {
    const moves = generateMoves(position);
    if (moves.length === 0) return;
    if (moves.length === 1) { bestMove = moves[0]; return; }
    let result: RootResult | undefined;
    let lastIteration = 0;
    for (let d = 1; d <= depthCap(config, options); d++) {
      if (d > 1 && !mayDeepen(state.nodes, lastIteration, budget)) break;
      const before = state.nodes;
      result = d < 3 ? rootPlain(state, position, moves, d, result?.move) : yield* rootSliced(state, position, moves, d, result?.move);
      if (cancelled) return;
      lastIteration = state.nodes - before;
      bestMove = result.move;
      score = result.score;
      depth = d;
      if (Math.abs(result.score) >= WIN - 200) break;
    }
  }

  // Descuido: decidido de antemão (sem gastar busca); o sorteio vem de `rng`, então a busca em si continua determinística.
  const mistake = config.mistakeRate > 0 && rng() < config.mistakeRate;
  const generator = level === 'iniciante' || mistake ? undefined : run();
  return {
    step(maxNodes: number): void {
      if (done || cancelled) return;
      if (!generator) {
        if (level === 'iniciante') bestMove = chooseBeginner(position, rng);
        else {
          const moves = generateMoves(position);
          bestMove = moves[Math.min(moves.length - 1, Math.floor(rng() * moves.length))];
        }
        done = true;
        return;
      }
      const start = state.nodes;
      do {
        if (generator.next().done) { done = true; return; }
        if (cancelled) return;
      } while (state.nodes - start < maxNodes);
    },
    best: () => (cancelled ? undefined : bestMove),
    get done() { return done || cancelled; },
    get nodes() { return state.nodes; },
    get depth() { return depth; },
    get score() { return score; },
    cancel(): void { cancelled = true; bestMove = undefined; },
  };
}

/** Busca síncrona até o fim (testes e benchmark). */
export function searchMove(position: Position, level: LevelId, rng: () => number, options: SearchOptions = {}): SearchResult {
  const search = createSearch(position, level, rng, options);
  while (!search.done) search.step(Number.MAX_SAFE_INTEGER);
  return { move: search.best(), score: search.score, nodes: search.nodes, depth: search.depth };
}

/** Gerador de números pseudoaleatórios semeado (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
