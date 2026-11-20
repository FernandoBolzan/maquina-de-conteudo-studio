import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, mkdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { LocalVoiceCatalogState, LocalVoiceOperationEvent, LocalVoiceOption } from '../shared/contracts.js';
import { LOCAL_VOICE_MANIFEST, type LocalVoiceAsset, type LocalVoiceManifestEntry } from '../shared/local-voice-manifest.js';
import type { Services } from './context.js';
import { resolveTool } from './setup/tools.js';
import { generateKokoroNarration, generateLocalNarration } from './local-narration.js';

export type LocalVoiceEngine = 'piper' | 'kokoro';
export type LocalVoiceManifest = Omit<typeof LOCAL_VOICE_MANIFEST, 'voices'> & { voices: readonly LocalVoiceManifestEntry[] };
export interface OperationProgress { phase: LocalVoiceOperationEvent['phase']; progress?: number; message: string; }
export interface LocalVoiceOperationOptions { signal: AbortSignal; onProgress(event: OperationProgress): void; }

const PINNED_REVISION = '6b9cfaacb4fb2e02a9621227e3c1a48bec9710c3';
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA1 = /^[0-9a-f]{40}$/;
const MAX_ASSET_BYTES = 1_000_000_000;
const AUDITION_TEXT_BY_LANGUAGE: Readonly<Record<string, string>> = {
  'en-US': 'Hello! This is a short local voice audition.',
  'en-GB': 'Hello! This is a short local voice audition.',
  'ja-JP': 'こんにちは。これはローカル音声の短い試聴です。',
  'zh-CN': '你好，这是本地语音的简短试听。',
  'es-ES': 'Hola. Esta es una breve prueba de voz local.',
  'fr-FR': 'Bonjour. Ceci est un court essai vocal local.',
  'hi-IN': 'नमस्ते। यह स्थानीय आवाज़ का एक छोटा नमूना है।',
  'it-IT': 'Ciao. Questa è una breve prova di voce locale.',
  'pt-BR': 'Olá. Esta é uma breve demonstração de voz local.',
};
const IMPLEMENTATION_VERSION = 'local-voice-catalog-v2';

const KOKORO_UNSUPPORTED_REASON = 'Kokoro está indisponível: o wheel fixado de espeakng-loader inclui o binário e os dados do eSpeak-NG sem licenças verificadas; o teste nativo de síntese com CPython 3.11 também não foi aprovado.';
const KOKORO_LANGUAGES: Readonly<Record<string, string>> = {
  'en-US': 'en-us', 'en-GB': 'en-gb', 'ja-JP': 'ja', 'zh-CN': 'zh', 'es-ES': 'es',
  'fr-FR': 'fr-fr', 'hi-IN': 'hi', 'it-IT': 'it', 'pt-BR': 'pt-br',
};
export function kokoroLanguageCodeForLocale(language: string): string | undefined {
  return KOKORO_LANGUAGES[language];
}
function hash(bytes: Uint8Array, type: LocalVoiceAsset['digestType']): string {
  if (type === 'sha256') return createHash('sha256').update(bytes).digest('hex');
  return createHash('sha1').update(Buffer.from(`blob ${bytes.byteLength}\0`)).update(bytes).digest('hex');
}

export function verifyPinnedAsset(bytes: Uint8Array, asset: Pick<LocalVoiceAsset, 'sizeBytes' | 'digest' | 'digestType'>): void {
  if (!Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes <= 0 || bytes.byteLength !== asset.sizeBytes) {
    throw new Error(`Tamanho do asset inválido: esperados ${asset.sizeBytes} bytes, recebidos ${bytes.byteLength}.`);
  }
  const validDigest = asset.digestType === 'sha256' ? SHA256.test(asset.digest) : GIT_SHA1.test(asset.digest);
  if (!validDigest || hash(bytes, asset.digestType) !== asset.digest) throw new Error('Falha na verificação de integridade do asset fixado.');
}

function validateAsset(asset: LocalVoiceAsset, engine: LocalVoiceEngine): void {
  const piperBase = `https://huggingface.co/rhasspy/piper-voices/resolve/${PINNED_REVISION}/`;
  if (!asset || !Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes <= 0 || asset.sizeBytes > MAX_ASSET_BYTES
    || !/^[a-zA-Z0-9._-]+$/.test(asset.fileName) || asset.path.includes('..') || asset.path.startsWith('/')
    || asset.url !== `${piperBase}${asset.path}` || engine !== 'piper'
    || (asset.digestType === 'sha256' ? !SHA256.test(asset.digest) : !GIT_SHA1.test(asset.digest))) {
    throw new Error('O manifesto contém um asset inválido ou sem fixação de versão.');
  }
}

export function validateLocalVoiceManifest(manifest: LocalVoiceManifest): void {
  if (!manifest || manifest.schemaVersion !== 2 || !Array.isArray(manifest.voices) || !Array.isArray(manifest.exclusions)) throw new Error('Manifesto de vozes locais inválido.');
  const sourceVoiceIds = manifest.kokoroVoiceSource.map(([id]) => id);
  const sourceVoiceSet = new Set(sourceVoiceIds);
  if (sourceVoiceIds.length !== 54 || sourceVoiceSet.size !== 54
    || manifest.sources.kokoroSource.sourceVoiceCount !== 54
    || manifest.sources.kokoroSource.runtimeSupportedVoiceCount !== 54
    || sourceVoiceIds.some(id => !manifest.kokoroBundleVoiceIds.includes(id) || !manifest.kokoroRuntimeVoiceIds.includes(id))
    || manifest.kokoroBundleVoiceIds.some(id => !sourceVoiceSet.has(id))
    || manifest.kokoroRuntimeVoiceIds.some(id => !sourceVoiceSet.has(id))) {
    throw new Error('Os inventários de vozes da origem, do pacote de modelos e do runtime Kokoro não correspondem à interseção fixada de 54 IDs.');
  }
  const ids = new Set<string>();
  const identity = new Set<string>();
  for (const voice of manifest.voices) {
    if (!voice.id || !voice.voiceId || !voice.name || !voice.language || !voice.quality || !voice.license || !voice.licenseEvidence
      || !Number.isSafeInteger(voice.sizeBytes) || voice.sizeBytes <= 0 || ids.has(voice.id)
      || identity.has(`${voice.engine}:${voice.modelId}:${voice.voiceId}`) || !Array.isArray(voice.assets) || voice.assets.length !== 3) {
      throw new Error('O manifesto contém metadados de voz incompletos ou duplicados.');
    }
    ids.add(voice.id);
    identity.add(`${voice.engine}:${voice.modelId}:${voice.voiceId}`);
    const expected = new Set([`${voice.modelId}.onnx`, `${voice.modelId}.onnx.json`, 'MODEL_CARD']);
    if (voice.engine !== 'piper' || voice.assets.some((asset: LocalVoiceAsset) => !expected.delete(asset.fileName))) throw new Error('O manifesto contém um mecanismo ou conjunto de assets não suportado.');
    for (const asset of voice.assets) validateAsset(asset, voice.engine);
    if (expected.size !== 0 || voice.sizeBytes !== voice.assets.reduce((sum: number, asset: LocalVoiceAsset) => sum + asset.sizeBytes, 0)) throw new Error('O tamanho ou os nomes dos assets da voz não correspondem ao manifesto.');
  }
}

function rootFor(services: Services): string {
  const dataDir = resolve(services.dataDir);
  if (!dataDir || resolve(dataDir, '..') === dataDir) throw new Error('Diretório de armazenamento de vozes locais inseguro.');
  return join(dataDir, 'runtime', 'local-voices');
}
function kokoroSourceVoice(id: string): (typeof LOCAL_VOICE_MANIFEST.kokoroVoiceSource)[number] | undefined {
  const prefix = 'kokoro-';
  if (!id.startsWith(prefix)) return undefined;
  const voiceId = id.slice(prefix.length);
  return LOCAL_VOICE_MANIFEST.kokoroVoiceSource.find(([sourceId]) => sourceId === voiceId);
}
function idFor(id: string): LocalVoiceManifestEntry {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Identificador de voz local inválido.');
  const voice = LOCAL_VOICE_MANIFEST.voices.find(entry => entry.id === id);
  if (!voice) throw new Error('Esta voz não está disponível no catálogo local verificado.');
  return voice;
}
function targetFor(root: string, id: string): string { return join(root, id); }
function throwIfAborted(signal: AbortSignal): void { if (signal.aborted) throw new DOMException('Operação cancelada.', 'AbortError'); }

async function download(asset: LocalVoiceAsset, signal: AbortSignal, onProgress: (received: number, total?: number) => void): Promise<Buffer> {
  throwIfAborted(signal);
  let url = asset.url;
  let response: Response;
  for (let redirects = 0; ; redirects++) {
    response = await fetch(url, { signal, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    if (redirects >= 4) throw new Error('O asset fixado foi redirecionado vezes demais.');
    const location = response.headers.get('location');
    if (!location) throw new Error('O redirecionamento do asset fixado não informou o destino.');
    const destination = new URL(location, url);
    if (destination.protocol !== 'https:' || !['huggingface.co', 'cdn-lfs.huggingface.co', 'cas-bridge.xethub.hf.co', 'us.aws.cdn.hf.co'].includes(destination.hostname)) {
      throw new Error('O asset fixado foi redirecionado para um host não aprovado.');
    }
    url = destination.href;
  }
  if (!response.ok || !response.body) throw new Error(`Falha ao baixar o asset fixado (HTTP ${response.status}).`);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared !== asset.sizeBytes) throw new Error('O tamanho da resposta do asset não corresponde ao manifesto fixado.');
  const chunks: Buffer[] = [];
  let received = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      throwIfAborted(signal);
      const part = await reader.read();
      if (part.done) break;
      received += part.value.byteLength;
      if (received > asset.sizeBytes || received > MAX_ASSET_BYTES) throw new Error('O asset fixado excede o tamanho declarado.');
      chunks.push(Buffer.from(part.value));
      onProgress(received, asset.sizeBytes);
    }
  } finally { reader.releaseLock(); }
  if (received !== asset.sizeBytes) throw new Error(`Tamanho do asset fixado inválido: esperados ${asset.sizeBytes} bytes, recebidos ${received}.`);
  return Buffer.concat(chunks, received);
}


async function resolvedPython311(services: Services): Promise<string | undefined> {
  const python = await resolveTool('python', services);
  if (!python) return undefined;
  try {
    const result = await services.capture(python, ['-c', 'import sys; print(f"{sys.implementation.name} {sys.version_info.major}.{sys.version_info.minor}")'], { timeoutMs: 10_000 });
    return result.code === 0 && /^cpython 3\.11\s*$/i.test(result.stdout.trim()) ? python : undefined;
  } catch { return undefined; }
}

function validWav(bytes: Buffer): boolean {
  return bytes.length > 44 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE';
}
async function validCachedWav(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    return info.isFile() && validWav(await readFile(path));
  } catch { return false; }
}
async function installedAt(root: string, voice: LocalVoiceManifestEntry): Promise<boolean> {
  const target = targetFor(root, voice.id);
  try {
    const metadata = JSON.parse(await readFile(join(target, 'installed.json'), 'utf8')) as { id?: string; modelId?: string; voiceId?: string };
    if (metadata.id !== voice.id || metadata.modelId !== voice.modelId || metadata.voiceId !== voice.voiceId) return false;
    for (const asset of voice.assets) {
      const bytes = await readFile(join(target, asset.fileName));
      verifyPinnedAsset(bytes, asset);
    }
    return true;
  } catch { return false; }
}

function runtimeSupported(): boolean {
  // No platform is advertised until its exact wheels and native synthesis smoke are checked in.
  return false;
}
const unsupportedReason = 'A síntese local está desativada em todas as plataformas até que as licenças e os artefatos do runtime sejam verificados e os testes nativos de síntese sejam aprovados.';

export async function getLocalVoiceCatalog(services: Services): Promise<LocalVoiceCatalogState> {
  validateLocalVoiceManifest(LOCAL_VOICE_MANIFEST);
  const root = rootFor(services);
  const installedIds: string[] = [];
  for (const voice of LOCAL_VOICE_MANIFEST.voices) if (await installedAt(root, voice)) installedIds.push(voice.id);
  const supported = runtimeSupported();
  const piperVoices: LocalVoiceOption[] = LOCAL_VOICE_MANIFEST.voices.map(voice => ({
    id: voice.id, engine: voice.engine, modelId: voice.modelId, voiceId: voice.voiceId, name: voice.name, language: voice.language,
    quality: voice.quality, license: voice.license, licenseEvidence: voice.licenseEvidence, sizeBytes: voice.sizeBytes,
    runtimeSizeBytes: voice.runtimeSizeBytes, supported, ...(supported ? {} : { unsupportedReason }), ...(voice.attribution ? { attribution: voice.attribution } : {}),
  }));
  const kokoroVoices: LocalVoiceOption[] = LOCAL_VOICE_MANIFEST.kokoroVoiceSource.map(([voiceId, language, grade]) => ({
    id: `kokoro-${voiceId}`, engine: 'kokoro', modelId: 'kokoro-v1.0', voiceId, name: voiceId,
    language, quality: grade ?? 'ungraded', license: 'Apache-2.0',
    licenseEvidence: LOCAL_VOICE_MANIFEST.sources.kokoroAssets.licenseEvidenceWheel,
    sizeBytes: LOCAL_VOICE_MANIFEST.sources.kokoroAssets.modelSizeBytes + LOCAL_VOICE_MANIFEST.sources.kokoroAssets.voicesSizeBytes,
    runtimeSizeBytes: LOCAL_VOICE_MANIFEST.sources.kokoroSource.runtimeWheelBytes, supported: false, unsupportedReason: KOKORO_UNSUPPORTED_REASON,
  }));
  const voices = [...piperVoices, ...kokoroVoices];
  return {
    voices, python311Available: !!await resolvedPython311(services), installedIds, platformSupported: supported,
    exclusions: LOCAL_VOICE_MANIFEST.exclusions.map(({ source, reason }) => ({ source, reason })),
    ...(!supported ? { unsupportedReason } : {}),
  };
}

export async function installLocalVoice(id: string, services: Services, options: LocalVoiceOperationOptions): Promise<{ installed: boolean }> {
  validateLocalVoiceManifest(LOCAL_VOICE_MANIFEST);
  if (kokoroSourceVoice(id)) throw new Error(KOKORO_UNSUPPORTED_REASON);
  const voice = idFor(id);
  if (!runtimeSupported()) throw new Error(unsupportedReason);
  const root = rootFor(services);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const target = targetFor(root, id);
  const stage = join(root, `.${id}.${randomUUID()}.staging`);
  const backup = join(root, `.${id}.${randomUUID()}.backup`);
  let movedExisting = false;
  options.onProgress({ phase: 'preparing', message: 'Preparando instalação verificada.' });
  await mkdir(stage, { mode: 0o700 });
  try {
    let completed = 0;
    const total = voice.assets.reduce((sum, asset) => sum + asset.sizeBytes, 0);
    for (const asset of voice.assets) {
      throwIfAborted(options.signal);
      options.onProgress({ phase: 'downloading', progress: completed / total, message: `Baixando ${asset.fileName}.` });
      const bytes = await download(asset, options.signal, received => options.onProgress({ phase: 'downloading', progress: (completed + received) / total, message: `Baixando ${asset.fileName}.` }));
      options.onProgress({ phase: 'verifying', progress: completed / total, message: `Verificando ${asset.fileName}.` });
      verifyPinnedAsset(bytes, asset);
      await writeFile(join(stage, asset.fileName), bytes, { flag: 'wx', mode: 0o600 });
      completed += asset.sizeBytes;
    }
    await writeFile(join(stage, 'installed.json'), JSON.stringify({ id, engine: voice.engine, modelId: voice.modelId, voiceId: voice.voiceId }), { flag: 'wx', mode: 0o600 });
    throwIfAborted(options.signal);
    try { await rename(target, backup); movedExisting = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    try { await rename(stage, target); } catch (error) { if (movedExisting) await rename(backup, target); throw error; }
    if (movedExisting) await rm(backup, { recursive: true, force: true });
    options.onProgress({ phase: 'ready', progress: 1, message: 'Instalação concluída e verificada.' });
    return { installed: true };
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    if (movedExisting && !(await stat(target).catch(() => undefined))) await rename(backup, target).catch(() => undefined);
    if (options.signal.aborted) options.onProgress({ phase: 'cancelled', message: 'Instalação cancelada; os arquivos anteriores foram preservados.' });
    else options.onProgress({ phase: 'failed', message: error instanceof Error ? error.message : 'Falha na instalação.' });
    throw error;
  }
}

async function synthesizeKokoroInstalled(id: string, text: string, outputPath: string, services: Services, options: LocalVoiceOperationOptions, emitReady: boolean): Promise<void> {
  const source = kokoroSourceVoice(id);
  if (!source) throw new Error('O identificador da voz não pertence à lista Kokoro fixada.');
  if (!runtimeSupported()) throw new Error(KOKORO_UNSUPPORTED_REASON);
  const [voiceId, locale] = source;
  const language = kokoroLanguageCodeForLocale(locale);
  if (!language) throw new Error(`O idioma ${locale} não possui um código Kokoro de runtime fixado.`);
  const runtimeRoot = join(rootFor(services), 'kokoro');
  const assetsRoot = join(runtimeRoot, 'assets');
  const assets = LOCAL_VOICE_MANIFEST.sources.kokoroAssets;
  const metadata = JSON.parse(await readFile(join(runtimeRoot, 'installed.json'), 'utf8')) as {
    engine?: string; modelId?: string; modelSha256?: string; voicesSha256?: string;
  };
  if (metadata.engine !== 'kokoro' || metadata.modelId !== 'kokoro-v1.0'
    || metadata.modelSha256 !== assets.modelSha256 || metadata.voicesSha256 !== assets.voicesSha256) {
    throw new Error('A proveniência da instalação do runtime e do modelo Kokoro não corresponde ao manifesto fixado.');
  }
  const modelPath = join(assetsRoot, assets.modelFileName);
  const voicesPath = join(assetsRoot, assets.voicesFileName);
  verifyPinnedAsset(await readFile(modelPath), { sizeBytes: assets.modelSizeBytes, digest: assets.modelSha256, digestType: 'sha256' });
  verifyPinnedAsset(await readFile(voicesPath), { sizeBytes: assets.voicesSizeBytes, digest: assets.voicesSha256, digestType: 'sha256' });
  const pythonPath = join(runtimeRoot, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  options.onProgress({ phase: 'synthesizing', message: 'Sintetizando Kokoro localmente.' });
  await generateKokoroNarration({ text, modelPath, voicesPath, voiceId, language, pythonPath, outputPath, services, signal: options.signal });
  throwIfAborted(options.signal);
  if (emitReady) options.onProgress({ phase: 'ready', progress: 1, message: 'Síntese local Kokoro concluída.' });
}

async function synthesizeInstalled(id: string, text: string, outputPath: string, services: Services, options: LocalVoiceOperationOptions, emitReady = true): Promise<void> {
  if (kokoroSourceVoice(id)) return synthesizeKokoroInstalled(id, text, outputPath, services, options, emitReady);
  const voice = idFor(id);
  if (!runtimeSupported()) throw new Error(unsupportedReason);
  throwIfAborted(options.signal);
  const root = rootFor(services);
  if (!await installedAt(root, voice)) throw new Error('Instale e verifique os assets desta voz antes de sintetizar.');
  const modelPath = join(targetFor(root, id), `${voice.modelId}.onnx`);
  options.onProgress({ phase: 'synthesizing', message: 'Sintetizando localmente.' });
  throwIfAborted(options.signal);
  await generateLocalNarration({ text, modelPath, outputPath, signal: options.signal });
  throwIfAborted(options.signal);
  if (emitReady) options.onProgress({ phase: 'ready', progress: 1, message: 'Síntese local concluída.' });
}

export async function auditionLocalVoice(id: string, services: Services, options: LocalVoiceOperationOptions): Promise<string> {
  if (kokoroSourceVoice(id)) throw new Error(KOKORO_UNSUPPORTED_REASON);
  const voice = idFor(id);
  const auditionText = AUDITION_TEXT_BY_LANGUAGE[voice.language];
  if (!auditionText) throw new Error(`Não há uma frase fixa de audição local para ${voice.language}.`);
  const root = rootFor(services);
  const cacheDir = join(root, 'auditions');
  const key = createHash('sha256').update(JSON.stringify([IMPLEMENTATION_VERSION, voice.engine, voice.modelId, voice.voiceId, voice.language, auditionText])).digest('hex');
  const cachedPath = join(cacheDir, `${key}.wav`);
  if (await validCachedWav(cachedPath)) {
    options.onProgress({ phase: 'ready', progress: 1, message: 'Audição local pronta no cache.' });
    return cachedPath;
  }
  await rm(cachedPath, { force: true });
  const temporary = join(cacheDir, `.${key}.${randomUUID()}.part.wav`);
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  options.onProgress({ phase: 'preparing', message: 'Preparando audição local.' });
  try {
    await synthesizeInstalled(id, auditionText, temporary, services, options, false);
    throwIfAborted(options.signal);
    try {
      await link(temporary, cachedPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (await validCachedWav(cachedPath)) {
        await rm(temporary, { force: true });
        options.onProgress({ phase: 'ready', progress: 1, message: 'Audição local pronta no cache.' });
        return cachedPath;
      }
      await rm(cachedPath, { force: true });
      await link(temporary, cachedPath);
    }
    await unlink(temporary);
    options.onProgress({ phase: 'ready', progress: 1, message: 'Audição local sintetizada e armazenada no cache.' });
    return cachedPath;
  } catch (error) {
    await rm(temporary, { force: true });
    if (options.signal.aborted) options.onProgress({ phase: 'cancelled', message: 'Audição cancelada; qualquer cache válido foi preservado.' });
    else options.onProgress({ phase: 'failed', message: error instanceof Error ? error.message : 'Falha ao sintetizar a audição.' });
    throw error;
  }
}

export async function generateInstalledLocalVoice(id: string, text: string, outputPath: string, services: Services, options: LocalVoiceOperationOptions): Promise<void> {
  if (typeof outputPath !== 'string' || !outputPath.trim() || outputPath.includes('\0')) throw new Error('Caminho temporário de saída inválido.');
  try {
    await synthesizeInstalled(id, text, resolve(outputPath), services, options);
  } catch (error) {
    if (options.signal.aborted) options.onProgress({ phase: 'cancelled', message: 'Síntese cancelada; o arquivo temporário foi removido.' });
    else options.onProgress({ phase: 'failed', message: error instanceof Error ? error.message : 'Falha na síntese local.' });
    throw error;
  }
}

export const localVoiceCatalogManifest = LOCAL_VOICE_MANIFEST;
export const LOCAL_VOICE_AUDITION_TEXT_BY_LANGUAGE = AUDITION_TEXT_BY_LANGUAGE;
