import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultImageBackgroundMode,
  imageBackgroundRule,
  isImageBackgroundMode,
  resolveImageBackgroundMode,
} from '../src/shared/image-background.js';

test('the palette sets a sensible default background and invalid colors do not skew it', () => {
  assert.equal(defaultImageBackgroundMode(['#001133', '#123456']), 'dark');
  assert.equal(defaultImageBackgroundMode(['#ffffff', '#ccddff']), 'light');
  assert.equal(defaultImageBackgroundMode(['not-a-color']), 'light');
  assert.equal(defaultImageBackgroundMode([]), 'light');
});

test('the selected background overrides the palette default and invalid selections are refused', () => {
  assert.equal(resolveImageBackgroundMode('light', ['#000000']), 'light');
  assert.equal(resolveImageBackgroundMode('dark', ['#ffffff']), 'dark');
  assert.equal(resolveImageBackgroundMode(undefined, ['#000000']), 'dark');
  assert.throws(() => resolveImageBackgroundMode('auto', ['#ffffff']), /Escolha fundo claro ou escuro/);
  assert.equal(isImageBackgroundMode('light'), true);
  assert.equal(isImageBackgroundMode('dark'), true);
  assert.equal(isImageBackgroundMode('auto'), false);
});

test('background direction uses the requested base while keeping brand palette and legibility constraints', () => {
  const dark = imageBackgroundRule('dark');
  assert.match(dark, /base escura/);
  assert.match(dark, /paleta da marca/);
  assert.match(dark, /contraste alto, legibilidade/);
  assert.match(imageBackgroundRule('light'), /base clara/);
});
