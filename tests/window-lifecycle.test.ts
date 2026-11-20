import assert from 'node:assert/strict';
import { test } from 'node:test';
import { focusExistingWindow } from '../src/main/window-lifecycle.js';

test('second-instance focus ignores a destroyed BrowserWindow', () => {
  let calls = 0;
  focusExistingWindow({
    isDestroyed: () => true,
    show: () => { calls += 1; },
    focus: () => { calls += 1; },
  });
  assert.equal(calls, 0);
});

test('second-instance focus shows and focuses a live BrowserWindow', () => {
  const calls: string[] = [];
  focusExistingWindow({
    isDestroyed: () => false,
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  });
  assert.deepEqual(calls, ['show', 'focus']);
});
