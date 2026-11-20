import { spawn } from 'node:child_process';
import { access, open, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname, resolve } from 'node:path';
import type { Services } from './context.js';
export interface LocalNarrationOptions {
  text: string;
  modelPath: string;
  /** Caminho temporário ainda inexistente, em diretório controlado pelo chamador. */
  outputPath: string;
  signal?: AbortSignal;
}


export interface KokoroNarrationOptions {
  text: string;
  modelPath: string;
  voicesPath: string;
  voiceId: string;
  language: string;
  pythonPath: string;
  outputPath: string;
  services: Services;
  signal: AbortSignal;
}

const KOKORO_SYNTHESIS_SCRIPT = [
  'import sys, wave',
  'if sys.implementation.name != "cpython" or sys.version_info[:2] != (3, 11): raise RuntimeError("Kokoro requer CPython 3.11")',
  'import numpy as np',
  'from kokoro_onnx import Kokoro',
  'model_path, voices_path, voice_id, language, output_path, text = sys.argv[1:]',
  'audio, sample_rate = Kokoro(model_path, voices_path).create(text, voice_id, lang=language)',
  'pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()',
  'with wave.open(output_path, "wb") as target:',
  '    target.setnchannels(1); target.setsampwidth(2); target.setframerate(sample_rate); target.writeframes(pcm)',
].join('\n');
async function requireReadableFile(path: string, message: string): Promise<void> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size === 0) throw new Error(message);
    await access(path, constants.R_OK);
  } catch {
    throw new Error(message);
  }
}

/** Sintetiza localmente; o chamador é responsável por remover o arquivo temporário. */
export async function generateLocalNarration({ text, modelPath, outputPath, signal }: LocalNarrationOptions): Promise<void> {
  if (typeof text !== 'string' || !text.trim() || text.includes('\0')) throw new Error('Informe um texto válido para gerar a narração.');
  if (typeof modelPath !== 'string' || !modelPath.trim() || modelPath.includes('\0') || extname(modelPath).toLowerCase() !== '.onnx') {
    throw new Error('Selecione um arquivo de modelo de voz Piper local com extensão .onnx.');
  }
  if (typeof outputPath !== 'string' || !outputPath.trim() || outputPath.includes('\0')) throw new Error('Caminho temporário de saída inválido.');

  const model = resolve(modelPath);
  const output = resolve(outputPath);
  await requireReadableFile(model, 'Modelo Piper não encontrado ou inacessível. Selecione um arquivo .onnx local válido.');
  await requireReadableFile(`${model}.json`, 'Configuração da voz Piper não encontrada ou inacessível. Mantenha o arquivo .onnx.json correspondente ao lado do modelo .onnx.');

  // A criação exclusiva impede que o Piper sobrescreva um arquivo do usuário.
  let reserved;
  try {
    reserved = await open(output, 'wx', 0o600);
  } catch {
    throw new Error('Não foi possível criar o áudio temporário. Escolha um caminho novo em uma pasta gravável.');
  }
  try {
    if (signal?.aborted) throw new DOMException('Geração cancelada.', 'AbortError');
    await reserved.close();
    const { promise, resolve: resolveProcess, reject: rejectProcess } = Promise.withResolvers<void>();
    const child = spawn('piper', ['--model', model, '--output_file', output], {
      shell: false, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'],
    });
    let timedOut = false;
    let startError: NodeJS.ErrnoException | undefined;
    const abortProcess = () => child.kill('SIGKILL');
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 10 * 60 * 1000);
    signal?.addEventListener('abort', abortProcess, { once: true });
    if (signal?.aborted) abortProcess();
    child.once('error', (error: NodeJS.ErrnoException) => { startError = error; });
    // EPIPE é esperado quando o processo falha antes de consumir a entrada.
    child.stdin.on('error', () => {});
    child.once('close', (code, processSignal) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abortProcess);
      if (signal?.aborted) return rejectProcess(new DOMException('Geração cancelada.', 'AbortError'));
      if (startError?.code === 'ENOENT') return rejectProcess(new Error('Piper não encontrado. Instale o executável Piper e adicione-o ao PATH; depois reinicie o aplicativo.'));
      if (startError) return rejectProcess(new Error(`Não foi possível iniciar o Piper: ${startError.message}`));
      if (timedOut) return rejectProcess(new Error('A geração local excedeu o tempo limite de 10 minutos.'));
      if (code !== 0) return rejectProcess(new Error(`O Piper não conseguiu gerar a narração (${processSignal ? `sinal ${processSignal}` : `código ${code}`}). Verifique a instalação e se o modelo e sua configuração são compatíveis.`));
      resolveProcess();
    });
    // Piper trata cada linha como uma enunciação; uma só linha evita sobrescritas parciais.
    child.stdin.end(`${text.replace(/[\r\n]+/g, ' ')}\n`, 'utf8');
    await promise;
    const file = await open(output, 'r');
    try {
      const info = await file.stat();
      const header = Buffer.alloc(12);
      const { bytesRead } = await file.read(header, 0, header.length, 0);
      if (!info.isFile() || info.size <= 44 || bytesRead !== 12 || header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
        throw new Error('O Piper não produziu um arquivo WAV válido. Verifique o modelo e sua configuração.');
      }
    } finally {
      await file.close();
    }
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  }
}

/** Runs the pinned Kokoro adapter using only catalog-installed local assets and an isolated Python runtime. */
export async function generateKokoroNarration(options: KokoroNarrationOptions): Promise<void> {
  const { text, voiceId, language, signal, services } = options;
  if (typeof text !== 'string' || !text.trim() || text.includes('\0')) throw new Error('Informe um texto válido para gerar a narração.');
  if (!/^[a-z]{2}_[a-z]+$/.test(voiceId) || !/^(en-us|en-gb|ja|zh|es|fr-fr|hi|it|pt-br)$/.test(language)) {
    throw new Error('A voz ou o idioma Kokoro não pertence à lista fixa suportada.');
  }
  if (typeof options.pythonPath !== 'string' || !options.pythonPath.trim() || options.pythonPath.includes('\0')) throw new Error('Runtime Python gerenciado inválido.');
  if (extname(options.modelPath).toLowerCase() !== '.onnx' || extname(options.voicesPath).toLowerCase() !== '.bin') {
    throw new Error('Os assets Kokoro instalados têm formatos inválidos.');
  }
  if (!options.outputPath || options.outputPath.includes('\0')) throw new Error('Caminho temporário de saída inválido.');

  const python = resolve(options.pythonPath);
  const model = resolve(options.modelPath);
  const voices = resolve(options.voicesPath);
  const output = resolve(options.outputPath);
  await requireReadableFile(python, 'Runtime Python gerenciado não encontrado.');
  try { await access(python, constants.X_OK); } catch { throw new Error('Runtime Python gerenciado não pode ser executado.'); }
  await requireReadableFile(model, 'Modelo Kokoro não instalado ou inacessível.');
  await requireReadableFile(voices, 'Bundle de vozes Kokoro não instalado ou inacessível.');
  if (signal.aborted) throw new DOMException('Geração cancelada.', 'AbortError');
  let reserved;
  try {
    reserved = await open(output, 'wx', 0o600);
  } catch {
    throw new Error('Não foi possível criar o áudio temporário. Escolha um caminho novo em uma pasta gravável.');
  }
  try {
    await reserved.close();
    const result = await services.capture(python, [
      '-c', KOKORO_SYNTHESIS_SCRIPT, model, voices, voiceId, language, output, text.replace(/[\r\n]+/g, ' '),
    ], { signal, timeoutMs: 10 * 60 * 1000 });
    if (signal.aborted) throw new DOMException('Geração cancelada.', 'AbortError');
    if (result.code !== 0) throw new Error(`Kokoro não conseguiu gerar a narração (${result.stderr.trim() || `código ${result.code}`}).`);
    const file = await open(output, 'r');
    try {
      const info = await file.stat();
      const header = Buffer.alloc(12);
      const { bytesRead } = await file.read(header, 0, header.length, 0);
      if (!info.isFile() || info.size <= 44 || bytesRead !== 12 || header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
        throw new Error('Kokoro não produziu um arquivo WAV válido. Verifique os assets e o runtime instalados.');
      }
    } finally { await file.close(); }
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  }
}
