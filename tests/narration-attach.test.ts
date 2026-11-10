import assert from 'node:assert/strict';
import { test } from 'node:test';
import { narrationBase64Bytes, narrationProbeIssue, parseNarrationAttachSource } from '../src/shared/narration.js';
import { NARRATION_RECORDING_MAX_BYTES } from '../src/shared/contracts.js';

test('file sources accept supported audio extensions in any case and reject others', () => {
  assert.deepEqual(parseNarrationAttachSource({ kind: 'file', path: '/tmp/voz.MP3' }), { kind: 'file', path: '/tmp/voz.MP3' });
  assert.throws(() => parseNarrationAttachSource({ kind: 'file', path: '/tmp/roteiro.txt' }), /Formato de áudio não suportado/);
  assert.throws(() => parseNarrationAttachSource({ kind: 'file', path: '  ' }), /arquivo de áudio válido/);
});

test('recording sources accept base MIME types with parameters and reject unknown types', () => {
  const ok = parseNarrationAttachSource({ kind: 'recording', mimeType: 'audio/webm;codecs=opus', dataBase64: 'AAAA' });
  assert.equal(ok.kind, 'recording');
  assert.throws(() => parseNarrationAttachSource({ kind: 'recording', mimeType: 'video/mp4', dataBase64: 'AAAA' }), /Tipo de gravação não suportado/);
});

test('recording payloads reject empty, malformed and oversized base64', () => {
  assert.throws(() => narrationBase64Bytes(''), /base64|vazia/);
  assert.throws(() => narrationBase64Bytes('AAA'), /base64/);
  assert.throws(() => narrationBase64Bytes('AA!A'), /base64/);
  assert.throws(() => narrationBase64Bytes('A'.repeat(Math.ceil(NARRATION_RECORDING_MAX_BYTES / 3) * 4 + 4)), /64 MB/);
});

test('unknown origins and non-object payloads are rejected before any IO', () => {
  assert.throws(() => parseNarrationAttachSource(null), /Origem do áudio inválida/);
  assert.throws(() => parseNarrationAttachSource({ kind: 'url', href: 'https://x' }), /Origem do áudio inválida/);
});

test('probe output without an audio stream or with zero duration is rejected', () => {
  assert.match(narrationProbeIssue({ streams: [{ codec_type: 'video' }], format: { duration: '3.2' } }) ?? '', /faixa de áudio/);
  assert.match(narrationProbeIssue({ streams: [{ codec_type: 'audio' }], format: { duration: '0' } }) ?? '', /duração/);
  assert.equal(narrationProbeIssue({ streams: [{ codec_type: 'audio' }], format: { duration: '3.2' } }), undefined);
});
