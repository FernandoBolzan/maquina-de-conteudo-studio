import assert from 'node:assert/strict';
import { test } from 'node:test';
import { depictedPersonPolicyIssues, effectiveDepictedPersonPolicy, isDepictedPersonPolicy } from '../src/shared/depicted-person.js';

test('project policy accepts only the four known values', () => {
  for (const value of ['auto', 'none', 'other_person', 'client_portrait']) assert.equal(isDepictedPersonPolicy(value), true, value);
  for (const value of ['unresolved', '', undefined, null, 3]) assert.equal(isDepictedPersonPolicy(value), false, String(value));
});

test('an approved portrait does not stop the project from choosing nobody or another person', () => {
  assert.deepEqual(depictedPersonPolicyIssues('none', true), []);
  assert.deepEqual(depictedPersonPolicyIssues('other_person', true), []);
  assert.deepEqual(depictedPersonPolicyIssues('auto', true), []);
  assert.deepEqual(depictedPersonPolicyIssues('client_portrait', true), []);
});

test('client_portrait needs an approved portrait; none and other_person do not', () => {
  assert.notEqual(depictedPersonPolicyIssues('client_portrait', false).length, 0);
  assert.deepEqual(depictedPersonPolicyIssues('none', false), []);
  assert.deepEqual(depictedPersonPolicyIssues('other_person', false), []);
  assert.deepEqual(depictedPersonPolicyIssues('auto', false), []);
});

test('effective policy falls back to auto when the saved choice no longer fits the portrait state', () => {
  assert.equal(effectiveDepictedPersonPolicy(undefined, false), 'auto');
  assert.equal(effectiveDepictedPersonPolicy('none', true), 'none');
  assert.equal(effectiveDepictedPersonPolicy('client_portrait', false), 'auto');
  assert.equal(effectiveDepictedPersonPolicy('none', false), 'none');
  assert.equal(effectiveDepictedPersonPolicy('client_portrait', true), 'client_portrait');
});
