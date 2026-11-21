import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BLACK, WHITE, currentPosition, generateMoves, newGame, playMove } from '../src/shared/damas.js';
import { DAMAS_PREFERENCES_KEY, DAMAS_STORAGE_KEY, DEFAULT_DAMAS_PREFERENCES, clearSavedGame, loadPreferences, loadSavedGame, saveGame, savePreferences, type DamasStorage } from '../src/shared/damas-storage.js';

function memoryStorage(initial: Record<string, string> = {}): DamasStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: key => (key in data ? data[key]! : null),
    setItem: (key, value) => { data[key] = value; },
    removeItem: key => { delete data[key]; },
  };
}

test('a partida em andamento é salva, volta idêntica e some ao ser limpa', () => {
  const storage = memoryStorage();
  let game = newGame();
  for (let i = 0; i < 6; i++) game = playMove(game, generateMoves(currentPosition(game))[0]!);
  assert.equal(saveGame(storage, game, BLACK, 'mestre'), true);
  const loaded = loadSavedGame(storage);
  assert.ok(loaded);
  assert.equal(loaded.color, BLACK);
  assert.equal(loaded.level, 'mestre');
  assert.equal(loaded.game.moves.length, 6);
  clearSavedGame(storage);
  assert.equal(loadSavedGame(storage), undefined);
});

test('dados salvos inválidos, de outra versão ou com lance ilegal são descartados sem erro', () => {
  assert.equal(loadSavedGame(memoryStorage({ [DAMAS_STORAGE_KEY]: '{não é json' })), undefined);
  assert.equal(loadSavedGame(memoryStorage({ [DAMAS_STORAGE_KEY]: JSON.stringify({ version: 9, color: 1, level: 'mestre', moves: [] }) })), undefined);
  assert.equal(loadSavedGame(memoryStorage({ [DAMAS_STORAGE_KEY]: JSON.stringify({ version: 1, color: 1, level: 'mestre', moves: [[0, 63]] }) })), undefined);
  assert.equal(loadSavedGame(undefined), undefined);
});

test('armazenamento que falha não derruba o jogo', () => {
  const broken: DamasStorage = {
    getItem: () => { throw new Error('bloqueado'); },
    setItem: () => { throw new Error('cheio'); },
    removeItem: () => { throw new Error('bloqueado'); },
  };
  assert.equal(saveGame(broken, newGame(), WHITE, 'iniciante'), false);
  assert.equal(loadSavedGame(broken), undefined);
  assert.deepEqual(loadPreferences(broken), DEFAULT_DAMAS_PREFERENCES);
  assert.doesNotThrow(() => clearSavedGame(broken));
});

test('as preferências voltam validadas: nível ou cor inválidos usam o padrão', () => {
  const storage = memoryStorage();
  assert.equal(savePreferences(storage, { level: 'avancado', color: BLACK }), true);
  assert.deepEqual(loadPreferences(storage), { level: 'avancado', color: BLACK });
  assert.deepEqual(loadPreferences(memoryStorage({ [DAMAS_PREFERENCES_KEY]: JSON.stringify({ level: 'impossivel', color: 7 }) })), DEFAULT_DAMAS_PREFERENCES);
  assert.deepEqual(loadPreferences(memoryStorage({ [DAMAS_PREFERENCES_KEY]: '[1,2' })), DEFAULT_DAMAS_PREFERENCES);
});
