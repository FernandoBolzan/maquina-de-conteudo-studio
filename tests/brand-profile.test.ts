import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandVideoPalette, videoGoBrandProfile } from '../src/shared/brand-profile.js';
import type { Brand } from '../src/shared/contracts.js';

const brand = (colors: string[]): Brand => ({ id: '472FE881-1DC2-41E0-A83D-8469CC34CA40', name: 'Patricia Ramos', tone: 'Tom leve.', colors, references: [] });

test('brandVideoPalette maps darkest to canvas, lightest to text and most saturated remainder to accent', () => {
  const palette = brandVideoPalette(['#6a0c34', '#121110', '#FAFAFA']);
  assert.equal(palette.canvas, '#121110');
  assert.equal(palette.foreground, '#fafafa');
  assert.equal(palette.accent, '#6a0c34');
  assert.equal(palette.mode, 'dark');
});

test('brandVideoPalette reuses the foreground as accent when only two colors exist and switches to light mode on light canvases', () => {
  const palette = brandVideoPalette(['#ffffff', '#f5f0e6']);
  assert.equal(palette.canvas, '#f5f0e6');
  assert.equal(palette.foreground, '#ffffff');
  assert.equal(palette.accent, '#ffffff');
  assert.equal(palette.mode, 'light');
});

test('brandVideoPalette rejects brands with fewer than two distinct colors or invalid hex', () => {
  assert.throws(() => brandVideoPalette(['#6a0c34', '#6A0C34']), /pelo menos duas cores/);
  assert.throws(() => brandVideoPalette([]), /pelo menos duas cores/);
  assert.throws(() => brandVideoPalette(['#6a0c34', 'vinho']), /pelo menos duas cores/);
});

test('videoGoBrandProfile lowercases the brand id, carries tone as notes and links the logo file', () => {
  const profile = videoGoBrandProfile(brand(['#6a0c34', '#121110']), 'logo.png');
  assert.equal(profile.id, '472fe881-1dc2-41e0-a83d-8469cc34ca40');
  assert.equal(profile.notes, 'Tom leve.');
  assert.deepEqual(profile.brand, { name: 'Patricia Ramos', logo: 'logo.png' });
});

test('videoGoBrandProfile omits the logo reference when the brand has no logo', () => {
  const profile = videoGoBrandProfile(brand(['#6a0c34', '#121110']));
  assert.deepEqual(profile.brand, { name: 'Patricia Ramos' });
});

test('videoGoBrandProfile fills all four accents with brand colors so VideoGo never falls back to its own', () => {
  assert.deepEqual(videoGoBrandProfile(brand(['#6a0c34', '#121110', '#FAFAFA'])).accents, ['#6a0c34', '#fafafa', '#6a0c34', '#fafafa']);
  assert.deepEqual(videoGoBrandProfile(brand(['#ffffff', '#f5f0e6'])).accents, ['#ffffff', '#ffffff', '#ffffff', '#ffffff']);
});
