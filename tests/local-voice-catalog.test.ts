import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  getLocalVoiceCatalog,
  kokoroLanguageCodeForLocale,
  localVoiceCatalogManifest,
  LOCAL_VOICE_AUDITION_TEXT_BY_LANGUAGE,
  validateLocalVoiceManifest,
  verifyPinnedAsset,
} from '../src/main/local-voice-catalog.js';
import type { Services } from '../src/main/context.js';

const bytes = Buffer.from('fixed test asset');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const gitBlob = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');

test('verifies exact size and SHA-256 for a pinned model artifact', () => {
  verifyPinnedAsset(bytes, { sizeBytes: bytes.length, digest: sha256, digestType: 'sha256' });
  assert.throws(() => verifyPinnedAsset(bytes.subarray(0, -1), { sizeBytes: bytes.length, digest: sha256, digestType: 'sha256' }), /Tamanho do asset inválido/);
  const corrupted = Buffer.from(bytes);
  corrupted[0] = corrupted[0]! ^ 0xff;
  assert.throws(() => verifyPinnedAsset(corrupted, { sizeBytes: bytes.length, digest: sha256, digestType: 'sha256' }), /Falha na verificação de integridade/);
  assert.throws(() => verifyPinnedAsset(bytes, { sizeBytes: bytes.length + 1, digest: sha256, digestType: 'sha256' }), /Tamanho do asset inválido/);
});

test('verifies Git blob framing separately from raw SHA-1', () => {
  verifyPinnedAsset(bytes, { sizeBytes: bytes.length, digest: gitBlob, digestType: 'git-blob-sha1' });
  assert.throws(() => verifyPinnedAsset(bytes, { sizeBytes: bytes.length, digest: createHash('sha1').update(bytes).digest('hex'), digestType: 'git-blob-sha1' }), /Falha na verificação de integridade/);
});

test('fixed manifest records the exact Kokoro source/runtime intersection without audio recordings', () => {
  validateLocalVoiceManifest(localVoiceCatalogManifest);
  assert.deepEqual(localVoiceCatalogManifest.voices, []);
  assert.equal(localVoiceCatalogManifest.sources.piperSamples.revision, 'edf9afb0f91b36d5ce8458dd8d14782822a09b3a');
  assert.equal(localVoiceCatalogManifest.sources.piperSamples.sourceVoiceCount, 182);
  const sourceIds = localVoiceCatalogManifest.kokoroVoiceSource.map(([id]) => id);
  assert.equal(sourceIds.length, 54);
  assert.equal(new Set(sourceIds).size, 54);
  assert.deepEqual([...sourceIds].sort(), [...localVoiceCatalogManifest.kokoroBundleVoiceIds].sort());
  assert.deepEqual([...sourceIds].sort(), [...localVoiceCatalogManifest.kokoroRuntimeVoiceIds].sort());
  assert.equal(localVoiceCatalogManifest.sources.kokoroSource.runtimeSupportedVoiceCount, 54);
  assert.equal(localVoiceCatalogManifest.sources.kokoroAssets.modelSha256, 'beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a');
});

test('catalog maps localized voice labels to pinned Kokoro runtime languages and fixed audition text', () => {
  assert.equal(kokoroLanguageCodeForLocale('pt-BR'), 'pt-br');
  assert.equal(kokoroLanguageCodeForLocale('ja-JP'), 'ja');
  assert.equal(LOCAL_VOICE_AUDITION_TEXT_BY_LANGUAGE['pt-BR'], 'Olá. Esta é uma breve demonstração de voz local.');
  assert.equal(LOCAL_VOICE_AUDITION_TEXT_BY_LANGUAGE['ja-JP'], 'こんにちは。これはローカル音声の短い試聴です。');
});

test('catalog browsing is passive and unsupported runtime stays disabled', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'local-voice-catalog-test-'));
  const services = {
    dataDir,
    capture: async () => ({ code: 1, stdout: '', stderr: '' }),
  } as unknown as Services;
  try {
    const catalog = await getLocalVoiceCatalog(services);
    assert.equal(catalog.voices.length, 54);
    assert.ok(catalog.voices.every(voice => voice.engine === 'kokoro' && !voice.supported));
    assert.deepEqual(catalog.installedIds, []);
    assert.deepEqual(catalog.exclusions, localVoiceCatalogManifest.exclusions);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('voice manifest rejects an unexpected schema', () => {
  const manifest = { ...localVoiceCatalogManifest, schemaVersion: 1 };
  assert.throws(() => validateLocalVoiceManifest(manifest as never), /Manifesto de vozes locais inválido/);
});

