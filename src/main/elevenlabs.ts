import { lstat, readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { ElevenLabsVoice } from '../shared/contracts.js';
import type { Services } from './context.js';
import { resolveTool, toolEnvironment } from './setup.js';
import { safePath } from './content/storage.js';

const API = 'https://api.elevenlabs.io';
const AUDIO_EXTENSIONS: Record<string, true> = { '.flac': true, '.m4a': true, '.mp3': true, '.ogg': true, '.wav': true };
const MAX_SAMPLE_BYTES = 100 * 1024 * 1024;

function providerError(status: number): Error {
  if (status === 401) return new Error('A API key ElevenLabs é inválida ou foi revogada.');
  if (status === 403) return new Error('A chave não tem permissão para esta operação ou o recurso não está habilitado na conta.');
  if (status === 429) return new Error('Limite da ElevenLabs atingido. Aguarde antes de tentar novamente.');
  return new Error(`A ElevenLabs recusou a operação (HTTP ${status}).`);
}

async function getVoicesPage(key: string, pageToken?: string): Promise<{ voices: ElevenLabsVoice[]; nextPageToken?: string }> {
  const url = new URL('/v2/voices', API);
  url.searchParams.set('page_size', '100');
  if (pageToken) url.searchParams.set('next_page_token', pageToken);
  const response = await fetch(url, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw providerError(response.status);
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

export async function validateElevenLabsKey(key: string): Promise<void> {
  if (key.length < 16 || key.length > 512 || /\s/.test(key)) throw new Error('Confira a API key ElevenLabs.');
  await getVoicesPage(key);
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
  if (!response.ok) throw providerError(response.status);
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
  if (!response.ok) throw providerError(response.status);
}
