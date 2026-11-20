import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalRanking, recordLocalScore } from '../src/renderer/ai-escape-ranking.js';

test('keeps one best score per player and orders points, level, then name', () => {
  const raw = JSON.stringify([
    { name: 'bia', points: 90, level: 3 },
    { name: 'Ana', points: 120, level: 2 },
    { name: 'BIA', points: 90, level: 4 },
    { name: 'Caio', points: 120, level: 2 },
  ]);

  assert.deepEqual(parseLocalRanking(raw), [
    { name: 'Ana', points: 120, level: 2 },
    { name: 'Caio', points: 120, level: 2 },
    { name: 'BIA', points: 90, level: 4 },
  ]);
});

test('updates only a player personal best and returns their new rank', () => {
  const first = recordLocalScore('', { name: 'fer', points: 250, level: 3 });
  assert.equal(first.updated, true);
  assert.equal(first.rank, 1);

  const lower = recordLocalScore(first.serialized, { name: 'FER', points: 200, level: 9 });
  assert.equal(lower.updated, false);
  assert.deepEqual(lower.scores, [{ name: 'fer', points: 250, level: 3 }]);

  const tiedScoreHigherLevel = recordLocalScore(lower.serialized, { name: 'Fer', points: 250, level: 4 });
  assert.equal(tiedScoreHigherLevel.updated, true);
  assert.deepEqual(tiedScoreHigherLevel.scores, [{ name: 'Fer', points: 250, level: 4 }]);
});

test('ignores malformed entries and rejects empty or unsafe player scores', () => {
  const malformed = JSON.stringify([
    { name: '<img src=x>', points: 50, level: 1 },
    { name: '   ', points: 70, level: 2 },
    { name: 'valid', points: -1, level: 1 },
    { name: 'valid', points: 70, level: 0 },
    null,
  ]);

  assert.deepEqual(parseLocalRanking(malformed), [
    { name: '<img src=x>', points: 50, level: 1 },
  ]);
  assert.equal(recordLocalScore(malformed, { name: '', points: 1, level: 1 }).updated, false);
});
