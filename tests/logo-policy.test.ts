import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLogoPolicy, logoPagesFor } from '../src/shared/logo-policy.js';

test('Logo policy places the official logo only on the pages the user chose', () => {
  assert.deepEqual(logoPagesFor('cover-closing', 5), [1, 5]);
  assert.deepEqual(logoPagesFor('cover-closing', 1), [1]);
  assert.deepEqual(logoPagesFor('all-pages', 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(logoPagesFor('none', 5), []);
});

test('Logo policy accepts only the three choices offered to the user', () => {
  for (const policy of ['cover-closing', 'all-pages', 'none']) assert.equal(isLogoPolicy(policy), true);
  for (const value of ['cover', 'all', '', undefined, null, 1]) assert.equal(isLogoPolicy(value), false);
});
