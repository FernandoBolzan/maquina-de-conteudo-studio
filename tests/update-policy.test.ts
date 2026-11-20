import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeveloperIdSigned, unsupportedUpdateMessage } from '../src/main/update-policy.js';

test('in-app updates are restricted to Linux AppImage packages', () => {
  assert.match(unsupportedUpdateMessage('linux') ?? '', /somente no formato AppImage/);
  assert.equal(unsupportedUpdateMessage('linux', '/tmp/studio.AppImage'), undefined);
  assert.equal(unsupportedUpdateMessage('win32'), undefined);
});

test('macOS updates only run for builds signed with a Developer ID', () => {
  assert.match(unsupportedUpdateMessage('darwin', undefined, false) ?? '', /Developer ID/);
  assert.match(unsupportedUpdateMessage('darwin') ?? '', /Developer ID/);
  assert.equal(unsupportedUpdateMessage('darwin', undefined, true), undefined);
});

test('codesign output distinguishes a Developer ID from ad-hoc and unsigned builds', () => {
  assert.equal(isDeveloperIdSigned('Identifier=com.x\nSignature=adhoc\nTeamIdentifier=not set\n'), false);
  assert.equal(isDeveloperIdSigned('Identifier=com.x\nAuthority=Developer ID Application: A (ABCDE12345)\nTeamIdentifier=ABCDE12345\n'), true);
  assert.equal(isDeveloperIdSigned(''), false);
});
