import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRevisionPrompt, reviewPlan } from '../src/shared/image-revision.js';

test('reviewPlan lists undecided pages in ascending order', () => {
  const plan = reviewPlan([
    { page: 3 }, { page: 1, decision: 'keep' }, { page: 2 }, { page: 4, decision: 'redo' },
  ]);
  assert.equal(plan.ok, false);
  assert.equal(plan.error, 'Falta decidir: páginas 2, 3.');
});

test('reviewPlan requires at least one redo', () => {
  const plan = reviewPlan([{ page: 1, decision: 'keep' }, { page: 2, decision: 'keep' }]);
  assert.equal(plan.ok, false);
  assert.equal(plan.error, 'Marque ao menos uma imagem para refazer.');
});

test('reviewPlan splits pages into sorted kept and redone sets', () => {
  const plan = reviewPlan([
    { page: 3, decision: 'redo' }, { page: 1, decision: 'keep' }, { page: 2, decision: 'redo' }, { page: 4, decision: 'keep' },
  ]);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.keptPages, [1, 4]);
  assert.deepEqual(plan.redonePages, [2, 3]);
});

test('buildRevisionPrompt names only redone pages and skips empty notes', () => {
  const prompt = buildRevisionPrompt({ redonePages: [3, 2], keptPages: [1, 4], notes: { 2: '  Trocar o título. ', 3: '   ' } });
  assert.match(prompt, /páginas 2, 3/);
  assert.match(prompt, /Não altere as páginas 1, 4/);
  assert.match(prompt, /Página 2: Trocar o título\./);
  assert.doesNotMatch(prompt, /Página 3:/);
});
