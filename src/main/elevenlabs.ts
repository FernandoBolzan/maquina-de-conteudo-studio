import { lstat, readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { ElevenLabsVoice } from '../shared/contracts.js';
import type { Services } from './context.js';
import { resolveTool, toolEnvironment } from './setup.js';
import { safePath } from './content/storage.js';

const API = 'https://api.elevenlabs.io';
const AUDIO_EXTENSIONS: Record<string, true> = { '.flac': true, '.m4a': true, '.mp3': true, '.ogg': true, '.wav': true };
const MAX_SAMPLE_BYTES = 100 * 1024 * 1024;

class ElevenLabsPermissionError extends Error {}

interface ProviderDetail { code?: string; status?: string; message?: string; }

async function providerDetail(response: Response): Promise<ProviderDetail> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('detail' in body)) return {};
    const { detail } = body;
    if (typeof detail !== 'object' || detail === null) return {};
    return {
      code: 'code' in detail && typeof detail.code === 'string' ? detail.code : undefined,
      status: 'status' in detail && typeof detail.status === 'string' ? detail.status : undefined,
      message: 'message' in detail && typeof detail.message === 'string' ? detail.message : undefined,
    };
  } catch {
    return {};
  }
}

async function providerError(response: Response): Promise<Error> {
  if (response.status === 401) {
    const detail = await providerDetail(response);
    if (detail.code !== 'missing_permissions' && detail.status !== 'missing_permissions') return new Error('A API key ElevenLabs é inválida ou foi revogada.');
    return permissionError(response.status, detail);
  }
  if (response.status === 403) return permissionError(response.status, await providerDetail(response));
  if (response.status === 429) return new Error('Limite da ElevenLabs atingido. Aguarde antes de tentar novamente.');
  return new Error(`A ElevenLabs recusou a operação (HTTP ${response.status}).`);
}

function permissionError(status: number, detail: ProviderDetail): ElevenLabsPermissionError {
  const hint = detail.message ? `Detalhe da ElevenLabs: ${detail.message}` : 'Verifique as permissões da chave (voices_read para listar vozes; text_to_speech para narrar).';
  return new ElevenLabsPermissionError(`A chave foi reconhecida pela ElevenLabs, mas a operação foi recusada (HTTP ${status}). ${hint}`);
}

function networkError(error: unknown): Error {
  const timedOut = typeof error === 'object' && error !== null && 'name' in error && error.name === 'TimeoutError';
  return new Error(timedOut ? 'A ElevenLabs não respondeu a tempo. Tente novamente.' : 'Não foi possível contatar a ElevenLabs. Verifique a conexão e tente novamente.');
}

async function getVoicesPage(key: string, pageToken?: string): Promise<{ voices: ElevenLabsVoice[]; nextPageToken?: string }> {
  const url = new URL('/v2/voices', API);
  url.searchParams.set('page_size', '100');
  if (pageToken) url.searchParams.set('next_page_token', pageToken);
  let response: Response;
  try {
    response = await fetch(url, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw networkError(error);
  }
  if (!response.ok) throw await providerError(response);
  const data = await response.json() as {
    voices?: Array<{ voice_id?: string; name?: string; category?: string; labels?: Record<string, string>; preview_url?: string }>;
    has_more?: boolean;
    next_page_token?: string;
  };
  if (!Array.isArray(data.voices)) throw new Error('Resposta inesperada ao listar as vozes ElevenLabs.');
  const voices = data.voices.flatMap((voice) => {
    if (typeof voice.voice_id !== 'string' || typeof voice.name !== 'string') return [];
    const category = typeof voice.category === 'string' ? voice.category : 'other';
    const language = voice.labels?.language;
    return [{ id: voice.voice_id, name: voice.name, category, language, previewUrl: voice.preview_url, isClone: category === 'cloned' }];
  });
  return { voices, nextPageToken: data.has_more && typeof data.next_page_token === 'string' ? data.next_page_token : undefined };
}

export async function listElevenLabsVoices(key: string): Promise<ElevenLabsVoice[]> {
  const voices: ElevenLabsVoice[] = [];
  const seenTokens = new Set<string>();
  let token: string | undefined;
  do {
    const page = await getVoicesPage(key, token);
    voices.push(...page.voices);
    token = page.nextPageToken;
    if (token && seenTokens.has(token)) throw new Error('Paginação inválida retornada pela ElevenLabs.');
    if (token) seenTokens.add(token);
    if (voices.length > 10_000) throw new Error('A lista de vozes ultrapassa o limite seguro de leitura.');
  } while (token);
  return voices;
}

export async function validateElevenLabsKey(key: string): Promise<{ warning?: string }> {
  if (key.length < 16 || key.length > 512 || /\s/.test(key)) throw new Error('Confira a API key ElevenLabs.');
  try {
    await getVoicesPage(key);
    return {};
  } catch (error) {
    if (error instanceof ElevenLabsPermissionError) return { warning: `${error.message} Para narrar, a chave também precisa de text_to_speech.` };
    throw error;
  }
}

export async function cloneElevenLabsVoice(key: string, name: string, samplePath: string, services: Services): Promise<ElevenLabsVoice> {
  const path = await safePath(samplePath);
  const extension = extname(path).toLowerCase();
  if (!AUDIO_EXTENSIONS[extension]) throw new Error('Use uma amostra de áudio WAV, MP3, M4A, FLAC ou OGG.');
  const fileStat = await lstat(path);
  if (!fileStat.isFile() || fileStat.size < 1024 || fileStat.size > MAX_SAMPLE_BYTES) throw new Error('A amostra deve ser um arquivo de áudio de até 100 MB.');

  const ffprobe = await resolveTool('ffprobe', services);
  if (!ffprobe) throw new Error('FFprobe é necessário para validar a amostra. Instale FFmpeg na Configuração do Studio.');
  const probe = await services.capture(ffprobe, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', path], { env: await toolEnvironment(services), timeoutMs: 20_000 });
  if (probe.code !== 0) throw new Error('A amostra não contém áudio legível. Escolha outra gravação.');
  let validAudio = false;
  try {
    const metadata = JSON.parse(probe.stdout) as { streams?: Array<{ codec_type?: string }>; format?: { duration?: string } };
    validAudio = metadata.streams?.some((stream) => stream.codec_type === 'audio') === true && Number(metadata.format?.duration) > 0;
  } catch { /* report safe validation error */ }
  if (!validAudio) throw new Error('A amostra não contém uma faixa de áudio válida.');

  const sample = await readFile(path);
  const body = new FormData();
  body.append('name', name);
  body.append('files', new Blob([new Uint8Array(sample)], { type: `audio/${extension.slice(1)}` }), `voice-sample${extension}`);
  const response = await fetch(`${API}/v1/voices/add`, {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw await providerError(response);
  const data = await response.json() as { voice_id?: string };
  if (!data.voice_id || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.voice_id)) throw new Error('A ElevenLabs não retornou um identificador válido para a voz clonada.');
  return { id: data.voice_id, name, category: 'cloned', isClone: true };
}

export async function deleteElevenLabsClone(key: string, voiceId: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(voiceId)) throw new Error('Identificador de voz inválido.');
  const voices = await listElevenLabsVoices(key);
  if (!voices.some((voice) => voice.id === voiceId && voice.isClone)) throw new Error('A voz selecionada não é um clone removível desta conta.');
  const response = await fetch(`${API}/v1/voices/${encodeURIComponent(voiceId)}`, {
    method: 'DELETE',
    headers: { 'xi-api-key': key },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw await providerError(response);
}
