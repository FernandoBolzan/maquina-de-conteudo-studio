import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BLACK, WHITE, applyMove, currentPosition, fromAscii, gameFrom, generateMoves, isDark, newGame, parseSquare, playMove, squareName } from '../src/shared/damas.js';
import { animationFrame, clickSquare, neighborSquare, partialCapture, undoCount, undoForPlayer } from '../src/shared/damas-ui.js';

const sq = parseSquare;

test('setas andam como o jogador vê o tabuleiro, de brancas e de pretas', () => {
  assert.equal(neighborSquare(sq('c3'), 'ArrowRight', false), sq('e3'));
  assert.equal(neighborSquare(sq('c3'), 'ArrowLeft', false), sq('a3'));
  assert.equal(neighborSquare(sq('a3'), 'ArrowLeft', false), undefined);
  assert.equal(neighborSquare(sq('c3'), 'ArrowUp', false), sq('d4'));
  assert.equal(neighborSquare(sq('h4'), 'ArrowUp', false), sq('g5'), 'na borda direita usa a coluna -1');
  assert.equal(neighborSquare(sq('c3'), 'ArrowDown', false), sq('d2'));
  assert.equal(neighborSquare(sq('a1'), 'ArrowDown', false), undefined);
  // Tabuleiro invertido (jogador de pretas): "cima" é em direção às casas 1.
  assert.equal(neighborSquare(sq('c3'), 'ArrowUp', true), sq('b2'));
  assert.equal(neighborSquare(sq('c3'), 'ArrowRight', true), sq('a3'));
  assert.equal(neighborSquare(sq('a1'), 'ArrowUp', true), undefined);
});

test('toda seta a partir de qualquer casa escura cai em outra casa escura', () => {
  for (let square = 0; square < 64; square++) {
    if (!isDark(square)) continue;
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const) for (const flipped of [false, true]) {
      const target = neighborSquare(square, key, flipped);
      if (target !== undefined) assert.ok(isDark(target), `${squareName(square)} ${key}`);
    }
  }
});

test('clique: escolhe a peça, troca de peça, cancela em casa inválida e joga ao completar o lance', () => {
  const position = currentPosition(newGame());
  const moves = generateMoves(position);
  assert.deepEqual(clickSquare(position, moves, [], sq('c3')).path, [sq('c3')]);
  assert.deepEqual(clickSquare(position, moves, [sq('c3')], sq('e3')).path, [sq('e3')], 'outra peça movível troca a seleção');
  assert.deepEqual(clickSquare(position, moves, [sq('c3')], sq('h8')).path, [], 'casa inválida limpa');
  assert.deepEqual(clickSquare(position, moves, [], sq('a1')).path, [], 'peça sem lance não seleciona');
  const done = clickSquare(position, moves, [sq('c3')], sq('b4'));
  assert.deepEqual(done.play?.path, [sq('c3'), sq('b4')]);
  assert.deepEqual(done.path, []);
});

test('captura em cadeia pede uma casa por salto e só joga no último', () => {
  const position = fromAscii(['........', '........', '........', '....b...', '........', '..b.....', '.w......', '........']);
  const moves = generateMoves(position);
  assert.equal(moves.length, 1);
  assert.equal(moves[0]!.path.length, 3);
  const first = clickSquare(position, moves, [sq('b2')], sq('d4'));
  assert.equal(first.play, undefined);
  assert.deepEqual(first.path, [sq('b2'), sq('d4')]);
  const second = clickSquare(position, moves, first.path, sq('f6'));
  assert.deepEqual(second.play?.path, [sq('b2'), sq('d4'), sq('f6')]);
});

test('captura obrigatória: clicar numa peça sem captura avisa em vez de selecionar', () => {
  const position = fromAscii(['........', '........', '........', '........', '...b....', '..w.....', '.....w..', '........']);
  const moves = generateMoves(position);
  const blocked = clickSquare(position, moves, [], sq('f2'));
  assert.equal(blocked.mustCapture, true);
  assert.deepEqual(blocked.path, []);
  assert.equal(clickSquare(position, moves, [], sq('c3')).mustCapture, undefined);
  assert.equal(clickSquare(position, moves, [], sq('h8')).mustCapture, undefined, 'casa vazia não avisa');
});

test('desfazer devolve a vez ao jogador sem desfazer a abertura da máquina', () => {
  let game = newGame();
  assert.equal(undoCount(game, WHITE), 0, 'nada a desfazer');
  game = playMove(game, generateMoves(currentPosition(game))[0]!);
  assert.equal(undoCount(game, WHITE), 1, 'máquina ainda pensando: desfaz só a do jogador');
  game = playMove(game, generateMoves(currentPosition(game))[0]!);
  assert.equal(undoCount(game, WHITE), 2);
  assert.equal(undoForPlayer(game, WHITE).moves.length, 0);

  // Jogador de pretas: a máquina (brancas) abriu e é a vez dele.
  let black = playMove(newGame(), generateMoves(currentPosition(newGame()))[0]!);
  assert.equal(undoCount(black, BLACK), 0, 'não desfaz a abertura da máquina');
  black = playMove(black, generateMoves(currentPosition(black))[0]!);
  assert.equal(undoCount(black, BLACK), 1, 'jogador de pretas jogou; a máquina ainda não respondeu');
  black = playMove(black, generateMoves(currentPosition(black))[0]!);
  assert.equal(undoCount(black, BLACK), 2);
  assert.equal(undoForPlayer(black, BLACK).moves.length, 1);
});

test('desfazer restaura a posição exata anterior', () => {
  let game = newGame();
  for (let i = 0; i < 3; i++) game = playMove(game, generateMoves(currentPosition(game))[0]!);
  const afterOpening = gameFrom(applyMove(currentPosition(newGame()), game.moves[0]!));
  const undone = undoForPlayer(game, BLACK);
  assert.equal(undone.moves.length, 1);
  assert.equal(currentPosition(undone).hashLo, currentPosition(afterOpening).hashLo);
  assert.equal(currentPosition(undone).hashHi, currentPosition(afterOpening).hashHi);
});

test('animação: cada salto apaga a peça capturada na ordem e a peça em movimento termina no destino', () => {
  const position = fromAscii(['........', '........', '........', '....b...', '........', '..b.....', '.w......', '........']);
  const move = generateMoves(position)[0]!;
  assert.equal(move.captured.length, 2);
  const start = animationFrame(move, 0);
  assert.equal(start.at, move.path[0]);
  assert.deepEqual(start.captured, []);
  const middle = animationFrame(move, 1);
  assert.equal(middle.at, move.path[1]);
  assert.deepEqual(middle.captured, [move.captured[0]]);
  const end = animationFrame(move, 99);
  assert.equal(end.at, move.path[move.path.length - 1]);
  assert.deepEqual(end.captured, move.captured);
});

test('captura em cadeia clicada aos poucos: a peça aparece na última casa clicada e só as capturadas até ali somem', () => {
  const position = fromAscii(['........', '........', '........', '....b...', '........', '..b.....', '.w......', '........']);
  const moves = generateMoves(position);
  assert.equal(partialCapture(moves, []), undefined);
  assert.equal(partialCapture(moves, [sq('b2')]), undefined, 'só a origem escolhida: nada a mostrar ainda');
  const partial = partialCapture(moves, [sq('b2'), sq('d4')]);
  assert.ok(partial);
  assert.equal(partial.hop, 1);
  const frame = animationFrame(partial.move, partial.hop);
  assert.equal(frame.at, sq('d4'));
  assert.deepEqual(frame.captured, [sq('c3')]);
  assert.equal(partialCapture(moves, [sq('b2'), sq('d4'), sq('f6')]), undefined, 'lance completo não é parcial');
});

test('dama voadora: captura de longe, pode pousar em qualquer casa livre depois e só em casas que continuam capturando quando há continuação', () => {
  const simple = generateMoves(fromAscii(['........', '........', '........', '........', '...b....', '........', '........', 'W.......']));
  assert.deepEqual(simple.map(move => squareName(move.path[1]!)).sort(), ['e5', 'f6', 'g7', 'h8']);
  const chain = generateMoves(fromAscii(['........', '......b.', '........', '........', '...b....', '........', '........', 'W.......']));
  assert.ok(chain.every(move => move.captured.length === 2));
  assert.deepEqual(chain.map(move => squareName(move.path[1]!)).sort(), ['e5', 'f6']);
  const first = clickSquare(currentPosition(gameFrom(fromAscii(['........', '......b.', '........', '........', '...b....', '........', '........', 'W.......']))), chain, [sq('a1')], sq('e5'));
  assert.equal(first.play, undefined, 'a cadeia continua: ainda falta o salto seguinte');
});
