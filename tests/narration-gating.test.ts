import assert from 'node:assert/strict';
import { test } from 'node:test';
import { narrationGate, type NarrationSceneFacts } from '../src/shared/narration.js';

function scene(overrides: Partial<NarrationSceneFacts> & { id: string }): NarrationSceneFacts {
  return { title: overrides.id, narrates: true, attached: false, approved: false, stray: false, ...overrides };
}

test('narration stays inactive without a voice or scene audio, even with narrated text', () => {
  const result = narrationGate({ scenes: [scene({ id: 'a', narrates: true })], elevenLabsAttached: false, voiceApproved: false, elevenLabsReady: true });
  assert.deepEqual(result, { active: false, issues: [] });
});

test('explicit narrated mode requires audio and silent mode ignores stale voice and audio', () => {
  const facts = { voiceId: 'v1', scenes: [scene({ id: 'a', stray: true })], elevenLabsAttached: true, voiceApproved: false, elevenLabsReady: false };
  assert.deepEqual(narrationGate({ ...facts, mode: 'silent' }), { active: false, issues: [] });
  assert.ok(narrationGate({ ...facts, mode: 'narrated' }).issues.length > 0);
  const noAudio = narrationGate({ scenes: [scene({ id: 'a' })], elevenLabsAttached: false, voiceApproved: false, elevenLabsReady: false, mode: 'narrated' });
  assert.equal(noAudio.active, true);
  assert.equal(noAudio.issues.length, 1);
});

test('a selected voice activates narration and blocks scenes without audio', () => {
  const result = narrationGate({ voiceId: 'v1', scenes: [scene({ id: 'a', title: 'Abertura' })], elevenLabsAttached: false, voiceApproved: false, elevenLabsReady: true });
  assert.equal(result.active, true);
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0] ?? '', /Abertura/);
});

test('attached scene audio must be approved before render', () => {
  const pending = narrationGate({ scenes: [scene({ id: 'a', attached: true, approved: false })], elevenLabsAttached: false, voiceApproved: false, elevenLabsReady: true });
  assert.equal(pending.active, true);
  assert.equal(pending.issues.length, 1);
  const approved = narrationGate({ scenes: [scene({ id: 'a', attached: true, approved: true })], elevenLabsAttached: false, voiceApproved: false, elevenLabsReady: true });
  assert.deepEqual(approved.issues, []);
});

test('a scene without narrated text does not block render when it has no audio', () => {
  const result = narrationGate({ voiceId: 'v1', scenes: [scene({ id: 'a', narrates: false })], elevenLabsAttached: false, voiceApproved: false, elevenLabsReady: true });
  assert.deepEqual(result.issues, []);
});

test('an uploaded audio on a scene without text activates narration without blocking other scenes', () => {
  const result = narrationGate({ scenes: [scene({ id: 'a', narrates: false, attached: true, approved: true })], elevenLabsAttached: false, voiceApproved: false, elevenLabsReady: true });
  assert.equal(result.active, true);
  assert.deepEqual(result.issues, []);
});

test('stray audio blocks render even when the scene does not narrate', () => {
  const result = narrationGate({ scenes: [scene({ id: 'a', narrates: false, stray: true })], elevenLabsAttached: false, voiceApproved: false, elevenLabsReady: true });
  assert.equal(result.active, true);
  assert.equal(result.issues.length, 1);
});

test('stray audio without an ElevenLabs key does not promise generation', () => {
  const result = narrationGate({ scenes: [scene({ id: 'a', narrates: false, stray: true })], elevenLabsAttached: false, voiceApproved: false, elevenLabsReady: false });
  assert.equal(result.issues.length, 1);
  assert.doesNotMatch(result.issues[0] ?? '', /gere/);
});

test('ElevenLabs audio blocks render after the narration text changed without re-approval', () => {
  const result = narrationGate({ voiceId: 'v1', scenes: [scene({ id: 'a', attached: true, approved: true })], elevenLabsAttached: true, voiceApproved: false, elevenLabsReady: true });
  assert.equal(result.issues.length, 1);
});

test('ElevenLabs audio awaiting re-approval names the missing key when none is configured', () => {
  const withoutKey = narrationGate({ voiceId: 'v1', scenes: [scene({ id: 'a', attached: true, approved: true })], elevenLabsAttached: true, voiceApproved: false, elevenLabsReady: false });
  assert.equal(withoutKey.issues.length, 1);
  assert.match(withoutKey.issues[0] ?? '', /chave ElevenLabs/);
  const withKey = narrationGate({ voiceId: 'v1', scenes: [scene({ id: 'a', attached: true, approved: true })], elevenLabsAttached: true, voiceApproved: false, elevenLabsReady: true });
  assert.equal(withKey.issues.length, 1);
  assert.doesNotMatch(withKey.issues[0] ?? '', /chave ElevenLabs/);
});

test('a narrated scene without audio names the missing ElevenLabs key when generation is impossible', () => {
  const withoutKey = narrationGate({ voiceId: 'v1', scenes: [scene({ id: 'a', title: 'Abertura' })], elevenLabsAttached: false, voiceApproved: false, elevenLabsReady: false });
  assert.match(withoutKey.issues[0] ?? '', /chave ElevenLabs/);
  assert.doesNotMatch(withoutKey.issues[0] ?? '', /gere/);
  const withKey = narrationGate({ voiceId: 'v1', scenes: [scene({ id: 'a', title: 'Abertura' })], elevenLabsAttached: false, voiceApproved: false, elevenLabsReady: true });
  assert.doesNotMatch(withKey.issues[0] ?? '', /chave ElevenLabs/);
});

test('partially approved scene audio blocks render only for the scenes still pending', () => {
  const partial = narrationGate({ voiceId: 'v1', scenes: [scene({ id: 'a', title: 'Abertura', attached: true, approved: true }), scene({ id: 'b', title: 'Fechamento', attached: true, approved: false })], elevenLabsAttached: false, voiceApproved: false, elevenLabsReady: true });
  assert.equal(partial.issues.length, 1);
  assert.match(partial.issues[0] ?? '', /Fechamento/);
  const complete = narrationGate({ voiceId: 'v1', scenes: [scene({ id: 'a', title: 'Abertura', attached: true, approved: true }), scene({ id: 'b', title: 'Fechamento', attached: true, approved: true })], elevenLabsAttached: false, voiceApproved: false, elevenLabsReady: true });
  assert.deepEqual(complete.issues, []);
});
