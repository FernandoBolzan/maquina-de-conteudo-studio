import { lstat, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Services } from './context.js';
import { resolveTool } from './setup.js';
import { narrationAudioExtension, narrationBase64Bytes, narrationProbeIssue, narrationRecordingExtension, type NarrationAttachSource } from '../shared/narration.js';

export interface StagedNarrationAudio {
  path: string;
  extension: string;
  release(): Promise<void>;
}

/** Confere com ffprobe que o arquivo tem faixa de áudio e duração > 0. */
async function probeNarrationAudio(path: string, services: Services): Promise<void> {
  const ffprobe = await resolveTool('ffprobe', services);
  if (!ffprobe) throw new Error('FFprobe é necessário para verificar o áudio. Instale o FFmpeg em Motores & Setup.');
  const checked = await services.capture(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', path], { timeoutMs: 30_000 });
  if (checked.code !== 0) throw new Error(`O arquivo não pôde ser lido como áudio: ${checked.stderr.trim() || 'erro desconhecido'}`);
  let probe: unknown;
  try {
    probe = JSON.parse(checked.stdout);
  } catch {
    throw new Error('Resposta inválida do FFprobe ao verificar o áudio.');
  }
  const issue = narrationProbeIssue(probe);
  if (issue) throw new Error(issue);
}

async function regularNonEmptyFile(path: string): Promise<void> {
  const info = await lstat(path).catch(() => {
    throw new Error('Arquivo de áudio não encontrado.');
  });
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Selecione um arquivo de áudio regular.');
  if (info.size <= 0) throw new Error('O arquivo de áudio está vazio.');
}

/**
 * Prepara a origem para cópia ao projeto: arquivo do usuário é validado no lugar;
 * gravação do renderer é convertida para m4a (AAC) em diretório temporário.
 * Sempre chame `release()` depois de copiar.
 */
export async function stageNarrationAudio(source: NarrationAttachSource, services: Services): Promise<StagedNarrationAudio> {
  if (source.kind === 'file') {
    const extension = narrationAudioExtension(source.path);
    await regularNonEmptyFile(source.path);
    await probeNarrationAudio(source.path, services);
    return { path: source.path, extension, release: async () => {} };
  }
  const extension = narrationRecordingExtension(source.mimeType);
  narrationBase64Bytes(source.dataBase64);
  const ffmpeg = await resolveTool('ffmpeg', services);
  if (!ffmpeg) throw new Error('FFmpeg é necessário para salvar gravações. Instale-o em Motores & Setup.');
  const directory = await mkdtemp(join(tmpdir(), 'mdc-narration-'));
  try {
    const input = join(directory, `recording${extension}`);
    const output = join(directory, 'narration.m4a');
    await writeFile(input, Buffer.from(source.dataBase64, 'base64'), { mode: 0o600 });
    const converted = await services.capture(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vn', '-c:a', 'aac', '-b:a', '192k', output], { timeoutMs: 120_000 });
    if (converted.code !== 0) throw new Error(`Não foi possível converter a gravação: ${converted.stderr.trim() || 'erro desconhecido'}`);
    await regularNonEmptyFile(output);
    await probeNarrationAudio(output, services);
    return { path: output, extension: '.m4a', release: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
