import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PORTRAIT_SCENES, personVarietyRule, portraitScenesFor } from '../src/shared/pose-variety.js';

test('cover and closing scenes always differ and are stable for a project', () => {
  for (let index = 0; index < 200; index++) {
    const id = randomUUID();
    const { cover, closing } = portraitScenesFor(id);
    assert.notEqual(cover, closing);
    assert.deepEqual(portraitScenesFor(id), { cover, closing });
  }
});

test('different projects start from different covers so posts do not come out identical', () => {
  const covers = new Set(Array.from({ length: 200 }, () => portraitScenesFor(randomUUID()).cover));
  assert.ok(covers.size >= PORTRAIT_SCENES.length - 1, `apenas ${covers.size} capas distintas em 200 projetos`);
});

test('the rule binds the reference to identity only and names this project\'s scenes', () => {
  const id = randomUUID();
  const { cover, closing } = portraitScenesFor(id);
  const rule = personVarietyRule(id);
  assert.match(rule, /SOMENTE o rosto e a identidade/);
  assert.match(rule, /nunca escreva “preserve a pose”/);
  assert.ok(rule.includes(`capa: ${cover}`) && rule.includes(`fechamento: ${closing}`));
});
