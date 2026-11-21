import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BLACK, WHITE, applyMove, currentPosition, drawByCounters, endingSignature, explainMandatory, findMove, fromAscii, gameFrom, gameStatus,
  generateMoves, initialPosition, makePosition, newGame, nextSquares, parseSquare, playMove, restoreGame, serializeGame, squareName, undoPlies,
  type Move, type Position,
} from '../src/shared/damas.js';

const sq = parseSquare;
const names = (move: Move): string[] => move.path.map(squareName);
const asText = (moves: readonly Move[]): string[] => moves.map(move => names(move).join('>')).sort();

function perft(position: Position, depth: number): number {
  if (depth === 0) return 1;
  let total = 0;
  for (const move of generateMoves(position)) total += perft(applyMove(position, move), depth - 1);
  return total;
}

test('1. posição inicial: 7 lances; 49 jogadas de profundidade 2 (derivado à mão: sem captura possível)', () => {
  const position = initialPosition();
  assert.equal(generateMoves(position).length, 7);
  assert.equal(perft(position, 2), 49);
});

test('2. captura obrigatória: nenhum lance simples existe quando há captura', () => {
  const position = fromAscii([
    '........',
    '........',
    '........',
    '........',
    '...b....',
    '..w.....',
    '........',
    'w.......',
  ]);
  assert.deepEqual(asText(generateMoves(position)), ['c3>e5']);
  assert.deepEqual(explainMandatory(position), { mustCapture: true, maxCaptured: 1, hasShorterOptions: false });
});

test('3. a pedra captura para trás', () => {
  const position = fromAscii([
    '........',
    '........',
    '........',
    '........',
    '...w....',
    '..b.....',
    '........',
    '........',
  ]);
  assert.deepEqual(asText(generateMoves(position)), ['d4>b2']);
});

test('4. dama voadora captura à distância e escolhe o pouso; peça própria na diagonal limita os pousos', () => {
  const open = fromAscii([
    '........',
    '........',
    '........',
    '........',
    '...b....',
    '........',
    '........',
    'W.......',
  ]);
  assert.deepEqual(asText(generateMoves(open)), ['a1>e5', 'a1>f6', 'a1>g7', 'a1>h8']);
  for (const move of generateMoves(open)) assert.deepEqual(move.captured, [sq('d4')]);

  const blocked = fromAscii([
    '........',
    '......w.',
    '........',
    '........',
    '...b....',
    '........',
    '........',
    'W.......',
  ]);
  assert.deepEqual(asText(generateMoves(blocked)), ['a1>e5', 'a1>f6']);
});

const MAJORITY = [
  '........',
  '........',
  '.....b..',
  '........',
  '...b....',
  '......b.',
  '.b.....w',
  'w.......',
];

test('5. lei da maioria: só a cadeia de 3 é gerada e a seleção por caminho só oferece casas dela', () => {
  const position = fromAscii(MAJORITY);
  const moves = generateMoves(position);
  assert.deepEqual(asText(moves), ['a1>c3>e5>g7']);
  assert.deepEqual(moves[0]!.captured.map(squareName), ['b2', 'd4', 'f6']);
  assert.deepEqual(nextSquares(moves, []), [sq('a1')]);
  assert.deepEqual(nextSquares(moves, [sq('a1')]).map(squareName), ['c3']);
  assert.deepEqual(nextSquares(moves, [sq('a1'), sq('c3')]).map(squareName), ['e5']);
  assert.deepEqual(nextSquares(moves, [sq('h2')]), [], 'a pedra h2 só teria a captura menor, que a maioria proíbe');
  assert.deepEqual(explainMandatory(position), { mustCapture: true, maxCaptured: 3, hasShorterOptions: true });
});

const LOOP = [
  '........',
  '..b.b...',
  '........',
  '..b.b...',
  '...w....',
  '........',
  '........',
  '........',
];

test('6, 7 e 9. Casa Cruz: passa duas vezes pela mesma casa vazia, sem capturar a mesma peça duas vezes, sem coroar ao passar pela última linha', () => {
  const position = fromAscii(LOOP);
  const moves = generateMoves(position);
  assert.deepEqual(asText(moves), ['d4>b6>d8>f6>d4', 'd4>f6>d8>b6>d4']);
  for (const move of moves) {
    assert.equal(move.captured.length, 4);
    assert.equal(new Set(move.captured).size, 4, 'nenhuma peça é capturada duas vezes');
  }
  const after = applyMove(position, moves[0]!);
  assert.equal(after.board[sq('d4')], 1, 'a pedra voltou a d4 e continua pedra');
  assert.equal(after.blackMen, 0);
});

test('8. a peça capturada continua bloqueando e não é saltada de novo na mesma cadeia', () => {
  const position = fromAscii([
    '........',
    '........',
    '........',
    '....b...',
    '...W....',
    '........',
    '........',
    '........',
  ].map((line, index) => (index === 3 ? '....b...' : index === 4 ? '...W....' : line)));
  const moves = generateMoves(position);
  assert.deepEqual(asText(moves), ['d4>f6', 'd4>g7', 'd4>h8']);
  for (const move of moves) assert.deepEqual(move.captured, [sq('e5')]);
});

test('9. a pedra que PARA na última linha vira dama', () => {
  const position = fromAscii([
    '........',
    '..b.....',
    '.w......',
    '........',
    '........',
    '........',
    '........',
    '........',
  ]);
  const moves = generateMoves(position);
  assert.deepEqual(asText(moves), ['b6>d8']);
  assert.equal(applyMove(position, moves[0]!).board[sq('d8')], 2);
});

const KINGS_ONLY = [
  '.b......',
  '........',
  '........',
  '........',
  '........',
  'W.......',
  '.......B',
  '....w...',
];

test('10. empate de 40 jogadas só de dama; captura ou lance de pedra zera', () => {
  const at = (plies: number): Position => fromAscii(KINGS_ONLY, WHITE, plies);
  const kingMove = (position: Position): Move => generateMoves(position).find(move => move.path[0] === sq('a3'))!;
  assert.equal(drawByCounters(applyMove(at(38), kingMove(at(38)))), undefined, '39 jogadas: continua');
  assert.equal(drawByCounters(applyMove(at(39), kingMove(at(39)))), 'kings', '40 jogadas: empate');
  assert.equal(gameStatus(gameFrom(applyMove(at(39), kingMove(at(39))))).state, 'draw');
  const manMove = generateMoves(at(39)).find(move => move.path[0] === sq('e1'))!;
  assert.equal(applyMove(at(39), manMove).kingPlies, 0, 'lance de pedra zera');
});

test('11. finais de 5 lances de cada jogador (arts. 99 e 100)', () => {
  const twoVsTwo = (plies: number): Position => fromAscii([
    '.....B.B',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    'W.W.....',
  ], WHITE, 0, plies);
  const step = (position: Position): Position => applyMove(position, generateMoves(position).find(move => move.path[0] === sq('c1') && move.path[1] === sq('d2'))!);
  assert.equal(endingSignature(twoVsTwo(0)), '2K0P|2K0P');
  assert.equal(drawByCounters(step(twoVsTwo(8))), undefined, '9 jogadas: continua');
  assert.equal(drawByCounters(step(twoVsTwo(9))), 'ending', '10 jogadas: empate');

  const threeVsOne = (lone: string): Position => fromAscii([
    '.W......',
    '........',
    '.......W',
    'W.......',
    lone,
    '........',
    '........',
    '........',
  ]);
  assert.equal(endingSignature(threeVsOne('...B....')), '1K0P|3K0P', 'dama sozinha na grande diagonal (d4)');
  assert.equal(endingSignature(threeVsOne('.....B..')), undefined, 'dama sozinha fora da grande diagonal (f4)');

  const capture = fromAscii([
    '.......B',
    '........',
    '........',
    '........',
    '...B....',
    '........',
    '........',
    'W...W...',
  ], WHITE, 0, 5);
  const taken = applyMove(capture, generateMoves(capture)[0]!);
  assert.equal(endingSignature(taken), '1K0P|2K0P');
  assert.equal(taken.endingPlies, 1, 'a assinatura mudou: a contagem recomeça');

  const manMoves = fromAscii([
    '.......B',
    '........',
    '........',
    '..b.....',
    '........',
    '........',
    '........',
    'W.......',
  ], BLACK, 0, 3);
  assert.equal(endingSignature(manMoves), '1K0P|1K1P');
  const manStep = applyMove(manMoves, generateMoves(manMoves).find(move => move.path[0] === sq('c5'))!);
  assert.equal(manStep.endingPlies, 4, 'lance de pedra não zera a contagem do final (nota do art. 100)');
});

test('12. mesma posição pela terceira vez, com o mesmo lado a jogar, é empate', () => {
  const start = fromAscii([
    '.b......',
    '........',
    '........',
    '........',
    '........',
    'W.......',
    '.......B',
    '....w...',
  ]);
  const cycle = [['a3', 'c1'], ['h2', 'g1'], ['c1', 'a3'], ['g1', 'h2']];
  let game = gameFrom(start);
  for (let lap = 0; lap < 2; lap++) {
    for (const [from, to] of cycle) {
      assert.equal(gameStatus(game).state, 'playing', `${lap}:${from}${to}`);
      game = playMove(game, findMove(generateMoves(currentPosition(game)), [sq(from!), sq(to!)])!);
    }
  }
  assert.deepEqual(gameStatus(game), { state: 'draw', reason: 'repetition' });
  assert.equal(gameStatus(undoPlies(game, 4)).state, 'playing', 'com 2 ocorrências ainda joga');
});

test('13. vitória: sem peças ou sem lances', () => {
  const noPieces = fromAscii(['........', '........', '........', '........', '........', '..w.....', '........', '........'], BLACK);
  assert.deepEqual(gameStatus(gameFrom(noPieces)), { state: 'won', winner: WHITE, reason: 'captured' });
  const blocked = fromAscii(['........', '........', '........', '........', '........', '..w.....', '........', 'b.......'], BLACK);
  assert.deepEqual(gameStatus(gameFrom(blocked)), { state: 'won', winner: WHITE, reason: 'blocked' });
});

test('14. explainMandatory sem captura', () => {
  assert.deepEqual(explainMandatory(initialPosition()), { mustCapture: false, maxCaptured: 0, hasShorterOptions: false });
});

test('o hash incremental coincide com o hash recalculado e a posição inicial tem 12 pedras por lado', () => {
  const initial = initialPosition();
  assert.equal(initial.whiteMen, 12);
  assert.equal(initial.blackMen, 12);
  let position = initial;
  let seed = 7;
  const random = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let ply = 0; ply < 80; ply++) {
    const moves = generateMoves(position);
    if (moves.length === 0) break;
    position = applyMove(position, moves[Math.floor(random() * moves.length)]!);
    const fresh = makePosition(position.board, position.turn);
    assert.equal(position.hashHi, fresh.hashHi);
    assert.equal(position.hashLo, fresh.hashLo);
    assert.equal(position.whiteMen + position.whiteKings, fresh.whiteMen + fresh.whiteKings);
  }
});

test('partida salva: volta idêntica; lance ilegal, versão errada ou formato inválido são descartados', () => {
  let game = newGame();
  let seed = 11;
  const random = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let ply = 0; ply < 30; ply++) {
    const moves = generateMoves(currentPosition(game));
    if (moves.length === 0) break;
    game = playMove(game, moves[Math.floor(random() * moves.length)]!);
  }
  const saved = JSON.parse(JSON.stringify(serializeGame(game, BLACK, 'avancado'))) as unknown;
  const restored = restoreGame(saved);
  assert.ok(restored);
  assert.equal(restored.color, BLACK);
  assert.equal(restored.level, 'avancado');
  assert.deepEqual(Array.from(currentPosition(restored.game).board), Array.from(currentPosition(game).board));
  assert.equal(restored.game.moves.length, game.moves.length);

  assert.equal(restoreGame({ version: 2, color: 1, level: 'mestre', moves: [] }), undefined);
  assert.equal(restoreGame({ version: 1, color: 1, level: 'impossivel', moves: [] }), undefined);
  assert.equal(restoreGame({ version: 1, color: 1, level: 'mestre', moves: [[sq('a1'), sq('b2')]] }), undefined, 'lance ilegal');
  assert.equal(restoreGame({ version: 1, color: 1, level: 'mestre', moves: [['a3', 'b4']] }), undefined, 'formato inválido');
  assert.equal(restoreGame('{'), undefined);
  assert.equal(restoreGame(null), undefined);
});
