import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unsupportedUpdateMessage } from '../src/main/update-policy.js';

test('in-app updates are restricted to Linux AppImage packages', () => {
  assert.match(unsupportedUpdateMessage('linux') ?? '', /somente no formato AppImage/);
  assert.equal(unsupportedUpdateMessage('linux', '/tmp/studio.AppImage'), undefined);
  assert.equal(unsupportedUpdateMessage('win32'), undefined);
  assert.equal(unsupportedUpdateMessage('darwin'), undefined);
});
