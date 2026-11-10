import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPermissionGranted } from '../src/main/permissions.js';

const appUrl = 'file:///app/renderer/index.html';
const devUrl = 'http://127.0.0.1:5173';

test('media is granted only for audio-only requests from the app', () => {
  assert.equal(isPermissionGranted('media', { requestingUrl: appUrl, mediaTypes: ['audio'] }, appUrl), true);
  assert.equal(isPermissionGranted('media', { requestingUrl: devUrl + '/', mediaTypes: ['audio'] }, devUrl), true);
  assert.equal(isPermissionGranted('media', { requestingUrl: appUrl, mediaType: 'audio' }, appUrl), true);
});

test('media stays denied for video, audio+video, unknown kinds, and foreign origins', () => {
  assert.equal(isPermissionGranted('media', { requestingUrl: appUrl, mediaTypes: ['video'] }, appUrl), false);
  assert.equal(isPermissionGranted('media', { requestingUrl: appUrl, mediaTypes: ['audio', 'video'] }, appUrl), false);
  assert.equal(isPermissionGranted('media', { requestingUrl: appUrl, mediaType: 'video' }, appUrl), false);
  assert.equal(isPermissionGranted('media', { requestingUrl: appUrl, mediaType: 'unknown' }, appUrl), false);
  assert.equal(isPermissionGranted('media', { requestingUrl: appUrl }, appUrl), false);
  assert.equal(isPermissionGranted('media', { requestingUrl: 'https://evil.example/', mediaTypes: ['audio'] }, appUrl), false);
  assert.equal(isPermissionGranted('media', { requestingUrl: 'file:///other/index.html', mediaTypes: ['audio'] }, appUrl), false);
  assert.equal(isPermissionGranted('media', { requestingUrl: 'http://127.0.0.1:9999/', mediaTypes: ['audio'] }, devUrl), false);
});

test('other permissions stay denied, clipboard writes remain granted', () => {
  assert.equal(isPermissionGranted('clipboard-sanitized-write', { requestingUrl: appUrl }, appUrl), true);
  for (const permission of ['clipboard-read', 'camera', 'geolocation', 'notifications', 'fileSystem', 'openExternal']) {
    assert.equal(isPermissionGranted(permission, { requestingUrl: appUrl, mediaTypes: ['audio'] }, appUrl), false, permission);
  }
});
