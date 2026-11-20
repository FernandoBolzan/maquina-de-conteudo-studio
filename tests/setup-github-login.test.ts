import { test } from 'node:test';
import assert from 'node:assert/strict';
import { githubLoginFromAuthStatus } from '../src/main/setup.js';

test('extracts only the GitHub CLI username from authenticated status output', () => {
  assert.equal(githubLoginFromAuthStatus('Logged in to github.com account Octo-Cat (keyring)\nActive account: true'), 'Octo-Cat');
  assert.equal(githubLoginFromAuthStatus('not logged in to any GitHub hosts'), undefined);
  assert.equal(githubLoginFromAuthStatus('Logged in to github.com account invalid_name (keyring)'), undefined);
});
