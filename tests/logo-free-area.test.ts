import assert from 'node:assert/strict';
import { test } from 'node:test';
import { officialLogoPosition } from '../src/main/content/conform.js';

test('official logo stays at the fixed lower-right anchor regardless of canvas shape', () => {
  assert.deepEqual(officialLogoPosition({ width: 1080, height: 1080 }, { width: 194, height: 108 }), { x: 821, y: 907 });
  assert.deepEqual(officialLogoPosition({ width: 1080, height: 1920 }, { width: 194, height: 108 }), { x: 821, y: 1697 });
});
