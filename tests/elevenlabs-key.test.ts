import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../src/main/runtime.js';
import type { ElevenLabsStatus } from '../src/shared/contracts.js';

const KEY = 'sk_stubbed_key_0123456789';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function withStubbedElevenLabs(respond: () => Response, check: (runtime: Runtime, root: string) => Promise<void>, secureStorageAvailable: () => boolean = () => true): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'mdc-elevenlabs-key-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => respond();
  const runtime = new Runtime(join(root, 'data'), {
    assetPrefix: 'media://asset/',
    secureStorageAvailable,
    encryptSecret: secret => `encrypted:${Buffer.from(secret).toString('base64')}`,
    decryptSecret: value => Buffer.from(value.replace(/^encrypted:/, ''), 'base64').toString('utf8'),
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    update: async () => ({ available: false, message: 'indisponível' }),
  }, () => undefined);
  try {
    await runtime.init();
    await check(runtime, root);
  } finally {
    globalThis.fetch = originalFetch;
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
}

async function assertKeyNotStored(runtime: Runtime, root: string): Promise<void> {
  const status = await runtime.invoke('elevenlabs.status') as ElevenLabsStatus;
  assert.equal(status.configured, false);
  await assert.rejects(readFile(join(root, 'data', 'elevenlabs.key'), 'utf8'), { code: 'ENOENT' });
}

test('ElevenLabs recusa chave inválida (401) e não grava o segredo', async () => {
  await withStubbedElevenLabs(() => json(401, { detail: { status: 'invalid_api_key', message: 'Invalid API key' } }), async (runtime, root) => {
    await assert.rejects(runtime.invoke('elevenlabs.configure', { key: KEY }), /A API key ElevenLabs é inválida ou foi revogada\./);
    await assertKeyNotStored(runtime, root);
  });
});

test('ElevenLabs informa limite de uso (429) sem gravar a chave', async () => {
  await withStubbedElevenLabs(() => json(429, { detail: { status: 'too_many_requests', message: 'Too many requests' } }), async (runtime, root) => {
    await assert.rejects(runtime.invoke('elevenlabs.configure', { key: KEY }), /Limite da ElevenLabs atingido\. Aguarde antes de tentar novamente\./);
    await assertKeyNotStored(runtime, root);
  });
});

test('ElevenLabs guarda chave reconhecida sem permissão de vozes com ressalva que expõe o detalhe', async () => {
  const detail = 'The API key you used is missing the permission voices_read to execute this operation.';
  await withStubbedElevenLabs(() => json(401, { detail: { status: 'missing_permissions', message: detail } }), async (runtime, root) => {
    const saved = await runtime.invoke('elevenlabs.configure', { key: KEY }) as ElevenLabsStatus;
    assert.equal(saved.configured, true);
    assert.match(saved.warning ?? '', /reconhecida pela ElevenLabs.*voices_read/s);
    const status = await runtime.invoke('elevenlabs.status') as ElevenLabsStatus;
    assert.equal(status.configured, true);
    assert.equal(status.warning, saved.warning);
    assert.match(await readFile(join(root, 'data', 'elevenlabs.key'), 'utf8'), /^encrypted:/);
  });
});

test('ElevenLabs trata 403 de autorização como chave reconhecida e remove a ressalva ao limpar a chave', async () => {
  const body = { detail: { type: 'authorization_error', code: 'insufficient_permissions', message: 'Insufficient permissions.' } };
  await withStubbedElevenLabs(() => json(403, body), async (runtime) => {
    const saved = await runtime.invoke('elevenlabs.configure', { key: KEY }) as ElevenLabsStatus;
    assert.equal(saved.configured, true);
    assert.ok(saved.warning);
    await runtime.invoke('elevenlabs.clear');
    const cleared = await runtime.invoke('elevenlabs.status') as ElevenLabsStatus;
    assert.equal(cleared.configured, false);
    assert.equal(cleared.warning, undefined);
  });
});

test('ElevenLabs guarda chave aceita pela biblioteca de vozes sem ressalva', async () => {
  await withStubbedElevenLabs(() => json(200, { voices: [{ voice_id: 'voice-test', name: 'Teste PT-BR', category: 'professional' }], has_more: false }), async (runtime) => {
    const saved = await runtime.invoke('elevenlabs.configure', { key: KEY }) as ElevenLabsStatus;
    assert.equal(saved.configured, true);
    assert.equal(saved.warning, undefined);
  });
});

test('ElevenLabs informa falha de conexão sem gravar a chave', async () => {
  await withStubbedElevenLabs(() => { throw new TypeError('fetch failed'); }, async (runtime, root) => {
    await assert.rejects(runtime.invoke('elevenlabs.configure', { key: KEY }), /Não foi possível contatar a ElevenLabs/);
    await assertKeyNotStored(runtime, root);
  });
});

test('ElevenLabs permite nova tentativa após disponibilizar o cofre sem enviar nem guardar chave antes disso', async () => {
  let available = false;
  let requests = 0;
  await withStubbedElevenLabs(() => {
    requests++;
    return json(200, { voices: [], has_more: false });
  }, async (runtime, root) => {
    await assert.rejects(runtime.invoke('elevenlabs.configure', { key: KEY }), /cofre de credenciais do sistema está indisponível/);
    assert.equal(requests, 0);
    await assertKeyNotStored(runtime, root);
    available = true;
    const saved = await runtime.invoke('elevenlabs.configure', { key: KEY }) as ElevenLabsStatus;
    assert.equal(requests, 1);
    assert.equal(saved.configured, true);
    assert.equal(saved.secureStorageAvailable, true);
    assert.match(await readFile(join(root, 'data', 'elevenlabs.key'), 'utf8'), /^encrypted:/);
  }, () => available);
});
