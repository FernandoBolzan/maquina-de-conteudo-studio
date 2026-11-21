import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BLACK, WHITE, applyMove, colOf, fromAscii, generateMoves, initialPosition, parseSquare, rowOf, squareAt,
  type Move, type Position, type Side,
} from '../src/shared/damas.js';
import { BEGINNER_BEST_PROBABILITY, DAMAS_LEVELS, chooseBeginner, createSearch, searchMove, searchPlain, seededRandom } from '../src/shared/damas-ai.js';
import { playSeries, randomOpening } from '../src/shared/damas-match.js';

const sq = parseSquare;

function playout(seed: number, plies: number): Position {
  const random = seededRandom(seed);
  let position = initialPosition();
  for (let i = 0; i < plies; i++) {
    const moves = generateMoves(position);
    if (moves.length === 0) break;
    position = applyMove(position, moves[Math.floor(random() * moves.length)]!);
  }
  return position;
}

// ---- Validador independente: regras reescritas de forma ingênua, sem usar o gerador de lances ----
const DIRS: readonly (readonly [number, number])[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const inside = (row: number, col: number): boolean => row >= 0 && row < 8 && col >= 0 && col < 8;
const isEnemyOf = (piece: number, turn: Side): boolean => piece !== 0 && Math.sign(piece) === -turn;

function naiveMaxCaptures(board: number[], turn: Side): number {
  let best = 0;
  const walk = (at: number, king: boolean, taken: readonly number[]): number => {
    let most = 0;
    for (const [dr, dc] of DIRS) {
      let row = rowOf(at) + dr;
      let col = colOf(at) + dc;
      if (!king) {
        if (!inside(row, col) || !inside(row + dr, col + dc)) continue;
        const over = squareAt(row, col);
        const land = squareAt(row + dr, col + dc);
        if (isEnemyOf(board[over]!, turn) && !taken.includes(over) && board[land] === 0) most = Math.max(most, 1 + walk(land, false, [...taken, over]));
        continue;
      }
      while (inside(row, col) && board[squareAt(row, col)] === 0) { row += dr; col += dc; }
      if (!inside(row, col)) continue;
      const over = squareAt(row, col);
      if (!isEnemyOf(board[over]!, turn) || taken.includes(over)) continue;
      for (let lr = row + dr, lc = col + dc; inside(lr, lc) && board[squareAt(lr, lc)] === 0; lr += dr, lc += dc) {
        most = Math.max(most, 1 + walk(squareAt(lr, lc), true, [...taken, over]));
      }
    }
    return most;
  };
  for (let from = 0; from < 64; from++) {
    const piece = board[from]!;
    if (piece === 0 || Math.sign(piece) !== turn) continue;
    board[from] = 0;
    best = Math.max(best, walk(from, Math.abs(piece) === 2, []));
    board[from] = piece;
  }
  return best;
}

function assertLegalAndMajority(position: Position, move: Move): void {
  const turn = position.turn;
  const board = Array.from(position.board);
  const maxCaptures = naiveMaxCaptures(board, turn);
  assert.equal(move.captured.length, maxCaptures, 'o lance tem de capturar o máximo possível (lei da maioria)');
  const origin = move.path[0]!;
  const piece = board[origin]!;
  assert.equal(Math.sign(piece), turn, 'a peça movida é do jogador');
  const king = Math.abs(piece) === 2;
  board[origin] = 0;
  const taken: number[] = [];
  for (let i = 1; i < move.path.length; i++) {
    const a = move.path[i - 1]!;
    const b = move.path[i]!;
    const dr = Math.sign(rowOf(b) - rowOf(a));
    const dc = Math.sign(colOf(b) - colOf(a));
    assert.equal(Math.abs(rowOf(b) - rowOf(a)), Math.abs(colOf(b) - colOf(a)), 'os passos são diagonais');
    assert.equal(board[b], 0, 'o pouso está livre');
    const between: number[] = [];
    for (let r = rowOf(a) + dr, c = colOf(a) + dc; squareAt(r, c) !== b; r += dr, c += dc) between.push(squareAt(r, c));
    if (maxCaptures === 0) {
      assert.equal(move.path.length, 2);
      if (king) assert.ok(between.every(square => board[square] === 0), 'a dama desliza por casas livres');
      else {
        assert.equal(between.length, 0, 'a pedra anda uma casa');
        assert.equal(rowOf(b) - rowOf(a), turn, 'a pedra anda para frente');
      }
      continue;
    }
    const enemies = between.filter(square => board[square] !== 0);
    assert.equal(enemies.length, 1, 'cada salto passa por exatamente uma peça');
    assert.ok(isEnemyOf(board[enemies[0]!]!, turn), 'a peça saltada é adversária');
    assert.ok(!taken.includes(enemies[0]!), 'nenhuma peça é saltada duas vezes');
    if (!king) assert.equal(between.length, 1, 'a pedra salta de casa vizinha');
    assert.ok(between.every(square => board[square] === 0 || square === enemies[0]), 'só há a peça saltada no caminho');
    taken.push(enemies[0]!);
  }
  assert.deepEqual([...taken].sort((x, y) => x - y), [...move.captured].sort((x, y) => x - y), 'a lista de capturadas confere');
}

test('toda jogada escolhida pelos quatro níveis é legal e respeita a lei da maioria (validador independente)', () => {
  const levels = ['iniciante', 'intermediario', 'avancado', 'mestre'] as const;
  levels.forEach((level, index) => {
    const random = seededRandom(100 + index);
    let position = randomOpening(index + 1, 2);
    for (let ply = 0; ply < 60; ply++) {
      if (generateMoves(position).length === 0) break;
      const result = searchMove(position, level, random, { budgetScale: 0.05 });
      assert.ok(result.move, `${level}: há lance`);
      assertLegalAndMajority(position, result.move);
      position = applyMove(position, result.move);
    }
  });
});

test('a busca em fatias dá o mesmo lance, valor e nós de qualquer tamanho de fatia e da recursão comum de referência', () => {
  const options = { maxDepth: 5, budgetScale: 1000 } as const;
  const positions: Position[] = [];
  for (let seed = 1; seed <= 12; seed++) for (const plies of [0, 6, 14]) positions.push(playout(seed, plies));
  for (let seed = 13; seed <= 28; seed++) positions.push(playout(seed, 30 + seed));
  assert.ok(positions.length >= 30);
  let checked = 0;
  for (const position of positions) {
    if (generateMoves(position).length < 2) continue;
    const reference = searchPlain(position, 'avancado', options);
    for (const slice of [1, 500, Number.MAX_SAFE_INTEGER]) {
      const search = createSearch(position, 'avancado', seededRandom(1), options);
      while (!search.done) search.step(slice);
      assert.deepEqual(search.best()?.path, reference.move?.path, `lance com fatia ${slice}`);
      assert.equal(search.score, reference.score, `valor com fatia ${slice}`);
      assert.equal(search.nodes, reference.nodes, `nós com fatia ${slice}`);
      assert.equal(search.depth, reference.depth);
    }
    checked++;
  }
  assert.ok(checked >= 30, `posições verificadas: ${checked}`);
});

test('best() existe depois do primeiro step mesmo com maxNodes 0; cancel() descarta o lance e encerra', () => {
  const position = initialPosition();
  const search = createSearch(position, 'avancado', seededRandom(1));
  assert.equal(search.best(), undefined);
  search.step(0);
  assert.ok(search.best(), 'depois do primeiro passo há um lance (iterações 1 e 2 são atômicas)');
  assert.ok(!search.done || search.best(), 'consistente');
  search.cancel();
  assert.equal(search.best(), undefined);
  assert.equal(search.done, true);
  const nodes = search.nodes;
  search.step(1000);
  assert.equal(search.nodes, nodes, 'depois de cancelar não há mais trabalho');
});

test('lance único: devolve na hora, sem gastar nós de busca profunda', () => {
  const position = fromAscii(['........', '........', '........', '........', '...b....', '..w.....', '........', '........']);
  const search = createSearch(position, 'mestre', seededRandom(1));
  search.step(0);
  assert.deepEqual(search.best()?.path.map(square => square), [sq('c3'), sq('e5')]);
  assert.equal(search.done, true);
});

test('Iniciante: com probabilidade 0,25 joga o melhor em profundidade 1; senão sorteia entre os legais', () => {
  assert.equal(BEGINNER_BEST_PROBABILITY, 0.25);
  const position = initialPosition();
  const moves = generateMoves(position);
  const sequence = (values: number[]): (() => number) => { let index = 0; return () => values[index++]!; };
  const best = chooseBeginner(position, sequence([0.1]));
  assert.ok(best);
  assert.equal(chooseBeginner(position, sequence([0.5, 0]))?.path.join(), moves[0]!.path.join(), 'sorteio: primeiro legal');
  assert.equal(chooseBeginner(position, sequence([0.5, 0.999]))?.path.join(), moves[moves.length - 1]!.path.join(), 'sorteio: último legal');
  assert.equal(chooseBeginner(position, sequence([0.25, 0]))?.path.join(), moves[0]!.path.join(), '0,25 não é menor que 0,25: sorteia');
  const noMoves = fromAscii(['........', '........', '........', '........', '........', '........', '........', 'b.......'], BLACK);
  assert.equal(chooseBeginner(noMoves, () => 0), undefined);
});

test('perto do empate por 40 jogadas, a TT não muda o valor da busca (é ignorada onde o empate pode ocorrer)', () => {
  const rows = ['.b......', '........', '........', '........', '........', 'W.......', '.......B', '....w...'];
  for (const kingPlies of [0, 30, 36, 38]) {
    const position = fromAscii(rows, WHITE, kingPlies);
    const options = { maxDepth: 4, budgetScale: 1000 } as const;
    const withTT = searchPlain(position, 'avancado', options);
    const withoutTT = searchPlain(position, 'avancado', { ...options, disableTT: true });
    assert.equal(withTT.score, withoutTT.score, `kingPlies ${kingPlies}`);
  }
});

test('a IA acha a captura de 3 quando a de 1 está disponível (lei da maioria na busca)', () => {
  const position = fromAscii(['........', '........', '.....b..', '........', '...b....', '......b.', '.b.....w', 'w.......']);
  for (const level of ['intermediario', 'avancado', 'mestre'] as const) {
    const result = searchMove(position, level, seededRandom(1), { budgetScale: 0.1 });
    assert.equal(result.move?.captured.length, 3, level);
  }
});

test('força (teste de fumaça com orçamento reduzido): Mestre vence o Iniciante e Avançado supera o Intermediário', () => {
  const scale = 0.1;
  const master = playSeries('mestre', 'iniciante', 6, scale);
  assert.equal(master.openings, 6, 'as 6 aberturas são diferentes');
  assert.ok(master.points >= 5, `Mestre x Iniciante: ${master.points} de 6`);
  const advanced = playSeries('avancado', 'intermediario', 6, scale);
  assert.equal(advanced.openings, 6);
  assert.ok(advanced.points >= 3.5, `Avançado x Intermediário: ${advanced.points} de 6`);
});

test('escada de força: o Intermediário vence o Iniciante na maioria das partidas, mas não sempre (6 partidas, 6 aberturas)', () => {
  const score = playSeries('intermediario', 'iniciante', 6, 0.1);
  assert.equal(score.openings, 6);
  assert.ok(score.points >= 4, `Intermediário x Iniciante: ${score.points} de 6`);
});

test('descuido: o Intermediário às vezes joga um lance legal sorteado sem buscar; Avançado e Mestre nunca', () => {
  const position = initialPosition();
  const legal = generateMoves(position);
  const always = (): number => 0;
  const careless = createSearch(position, 'intermediario', always);
  careless.step(1000);
  assert.equal(careless.done, true);
  assert.equal(careless.nodes, 0, 'o descuido não gasta busca');
  assert.deepEqual(careless.best()?.path, legal[0]!.path, 'sorteio com rng 0 = primeiro lance legal');
  const never = (): number => 0.999;
  const attentive = createSearch(position, 'intermediario', never);
  while (!attentive.done) attentive.step(1000);
  assert.ok(attentive.nodes > 0, 'sem descuido ele busca');
  for (const level of ['avancado', 'mestre'] as const) {
    const strict = createSearch(position, level, always, { budgetScale: 0.01 });
    while (!strict.done) strict.step(1000);
    assert.ok(strict.nodes > 0, `${level} sempre busca`);
  }
  assert.equal(DAMAS_LEVELS.iniciante.mistakeRate + DAMAS_LEVELS.avancado.mistakeRate + DAMAS_LEVELS.mestre.mistakeRate, 0);
  assert.ok(DAMAS_LEVELS.intermediario.mistakeRate > 0 && DAMAS_LEVELS.intermediario.mistakeRate < 0.5);
});

test('os níveis têm orçamento crescente e o Iniciante não busca', () => {
  assert.equal(DAMAS_LEVELS.iniciante.budget, 0);
  assert.ok(DAMAS_LEVELS.intermediario.budget < DAMAS_LEVELS.avancado.budget);
  assert.ok(DAMAS_LEVELS.avancado.budget < DAMAS_LEVELS.mestre.budget);
  assert.ok(DAMAS_LEVELS.intermediario.maxDepth < DAMAS_LEVELS.avancado.maxDepth);
  assert.ok(DAMAS_LEVELS.avancado.maxDepth < DAMAS_LEVELS.mestre.maxDepth);
});
