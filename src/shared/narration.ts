import { NARRATION_RECORDING_MAX_BYTES, type NarrationAudioSource } from './contracts.js';

export const NARRATION_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'] as const;
const RECORDING_EXTENSIONS: Record<string, string> = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/aac': '.aac',
  'audio/flac': '.flac',
};

export type NarrationAttachSource = { kind: 'file'; path: string } | { kind: 'recording'; mimeType: string; dataBase64: string };

export interface NarrationSceneFacts {
  id: string;
  title: string;
  /** Cena tem texto de narração (VideoGo só gera áudio para ela). */
  narrates: boolean;
  /** Áudio registrado, presente no disco e referenciado pelo storyboard com o texto atual. */
  attached: boolean;
  approved: boolean;
  /** Storyboard referencia áudio que não está registrado válido para a cena. */
  stray: boolean;
}

export function isNarrationAudioSource(value: unknown): value is NarrationAudioSource {
  return value === 'upload' || value === 'recording' || value === 'elevenlabs' || value === 'local';
}

/** Extensão (minúscula) de arquivo de áudio aceito; lança erro em português se não suportada. */
export function narrationAudioExtension(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot).toLowerCase() : '';
  if (!(NARRATION_AUDIO_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new Error(`Formato de áudio não suportado${extension ? `: ${extension}` : ''}. Use MP3, WAV, M4A, AAC, OGG ou FLAC.`);
  }
  return extension;
}

/** Extensão do arquivo temporário de uma gravação, a partir do tipo MIME base (parâmetros ignorados). */
export function narrationRecordingExtension(mimeType: string): string {
  const base = (mimeType.split(';')[0] ?? '').trim().toLowerCase();
  const extension = Object.hasOwn(RECORDING_EXTENSIONS, base) ? RECORDING_EXTENSIONS[base] : undefined;
  if (!extension) throw new Error(`Tipo de gravação não suportado: ${base || 'vazio'}.`);
  return extension;
}

/** Valida base64 e devolve o total de bytes decodificados, sem decodificar. */
export function narrationBase64Bytes(data: string): number {
  if (data.length > Math.ceil(NARRATION_RECORDING_MAX_BYTES / 3) * 4) {
    throw new Error('Gravação acima do limite de 64 MB. Grave um trecho menor.');
  }
  if (!data || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new Error('Gravação inválida: os dados não estão em base64.');
  }
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const bytes = (data.length / 4) * 3 - padding;
  if (bytes > NARRATION_RECORDING_MAX_BYTES) throw new Error('Gravação acima do limite de 64 MB. Grave um trecho menor.');
  if (bytes <= 0) throw new Error('A gravação está vazia.');
  return bytes;
}

/** Valida o payload de `projects.attachNarrationAudio` antes de qualquer IO. */
export function parseNarrationAttachSource(value: unknown): NarrationAttachSource {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('kind' in value)) {
    throw new Error('Origem do áudio inválida.');
  }
  if (value.kind === 'file') {
    if (!('path' in value) || typeof value.path !== 'string' || !value.path.trim() || value.path.length > 4096) {
      throw new Error('Selecione um arquivo de áudio válido.');
    }
    narrationAudioExtension(value.path);
    return { kind: 'file', path: value.path };
  }
  if (value.kind === 'recording') {
    if (!('mimeType' in value) || typeof value.mimeType !== 'string' || !('dataBase64' in value) || typeof value.dataBase64 !== 'string') {
      throw new Error('Gravação inválida: envie o tipo e os dados do áudio.');
    }
    narrationRecordingExtension(value.mimeType);
    narrationBase64Bytes(value.dataBase64);
    return { kind: 'recording', mimeType: value.mimeType, dataBase64: value.dataBase64 };
  }
  throw new Error('Origem do áudio inválida.');
}

/** Interpreta a saída JSON do ffprobe (streams.codec_type, format.duration). Devolve o erro ou undefined. */
export function narrationProbeIssue(probe: unknown): string | undefined {
  if (typeof probe !== 'object' || probe === null) return 'Resposta inválida do FFprobe ao verificar o áudio.';
  const streams = 'streams' in probe ? probe.streams : undefined;
  const format = 'format' in probe ? probe.format : undefined;
  const hasAudio = Array.isArray(streams) && streams.some(stream => typeof stream === 'object' && stream !== null && 'codec_type' in stream && stream.codec_type === 'audio');
  if (!hasAudio) return 'O arquivo não contém uma faixa de áudio.';
  const duration = typeof format === 'object' && format !== null && 'duration' in format ? Number(format.duration) : NaN;
  if (!Number.isFinite(duration) || duration <= 0) return 'O áudio tem duração zero ou inválida.';
  return undefined;
}

/**
 * Modo silencioso ignora narração sem remover referências; no modo narrado cada
 * cena com texto exige áudio aprovado, e áudio ElevenLabs exige aprovação do texto+voz.
 * Sem modo explícito, mantém a regra legada para os demais chamadores.
 */
export function narrationGate(input: { voiceId?: string; scenes: NarrationSceneFacts[]; elevenLabsAttached: boolean; voiceApproved: boolean; elevenLabsReady: boolean; mode?: 'silent' | 'narrated' }): { active: boolean; issues: string[] } {
  if (input.mode === 'silent') return { active: false, issues: [] };
  const active = (input.mode === 'narrated' && input.scenes.some(scene => scene.narrates)) || Boolean(input.voiceId) || input.scenes.some(scene => scene.attached || scene.stray);
  if (!active) return { active, issues: [] };
  const issues: string[] = [];
  const options = input.elevenLabsReady ? 'Envie, grave ou gere' : 'Envie ou grave';
  for (const scene of input.scenes) {
    if (scene.stray) {
      issues.push(`Cena "${scene.title}": o áudio associado está ausente, desatualizado ou não registrado. ${options} o áudio da cena novamente.`);
    } else if (scene.narrates && !scene.attached) {
      issues.push(`Cena "${scene.title}" sem áudio de narração. ${options} o áudio dela antes do render.${input.elevenLabsReady ? '' : ' Sem a chave ElevenLabs, só envio ou gravação.'}`);
    }
    if (scene.attached && !scene.approved) issues.push(`Aprove o áudio da cena "${scene.title}" na prévia antes do render.`);
  }
  if (input.elevenLabsAttached && !input.voiceApproved) issues.push(input.elevenLabsReady ? 'A narração ElevenLabs não está aprovada na versão atual (texto e voz). Revise-a e aprove antes do render.' : 'A narração ElevenLabs não está aprovada na versão atual (texto e voz). Configure a chave ElevenLabs para revisá-la antes do render.');
  return { active, issues };
}
