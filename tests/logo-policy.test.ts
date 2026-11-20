import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLogoPolicy, logoPagesFor, logoVariantForBackground } from '../src/shared/logo-policy.js';

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

test('logo contrast selects the official dark-background variant only for a measured dark area', () => {
  assert.equal(logoVariantForBackground(20, true), 'dark');
  assert.equal(logoVariantForBackground(127, true), 'dark');
  assert.equal(logoVariantForBackground(128, true), undefined);
  assert.equal(logoVariantForBackground(240, true), undefined);
  assert.equal(logoVariantForBackground(20, false), undefined);
  assert.equal(logoVariantForBackground(undefined, true), undefined);
  assert.equal(logoVariantForBackground(Number.NaN, true), undefined);
});
