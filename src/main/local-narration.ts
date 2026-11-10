import { spawn } from 'node:child_process';
import { access, open, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname, resolve } from 'node:path';

export interface LocalNarrationOptions {
  text: string;
  modelPath: string;
  /** Caminho temporário ainda inexistente, em diretório controlado pelo chamador. */
  outputPath: string;
}

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
export async function generateLocalNarration({ text, modelPath, outputPath }: LocalNarrationOptions): Promise<void> {
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
    await reserved.close();
    const { promise, resolve: resolveProcess, reject: rejectProcess } = Promise.withResolvers<void>();
    const child = spawn('piper', ['--model', model, '--output_file', output], {
      shell: false, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'],
    });
    let timedOut = false;
    let startError: NodeJS.ErrnoException | undefined;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 10 * 60 * 1000);
    child.once('error', (error: NodeJS.ErrnoException) => { startError = error; });
    // EPIPE é esperado quando o processo falha antes de consumir a entrada.
    child.stdin.on('error', () => {});
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (startError?.code === 'ENOENT') return rejectProcess(new Error('Piper não encontrado. Instale o executável Piper e adicione-o ao PATH; depois reinicie o aplicativo.'));
      if (startError) return rejectProcess(new Error(`Não foi possível iniciar o Piper: ${startError.message}`));
      if (timedOut) return rejectProcess(new Error('A geração local excedeu o tempo limite de 10 minutos.'));
      if (code !== 0) return rejectProcess(new Error(`O Piper não conseguiu gerar a narração (${signal ? `sinal ${signal}` : `código ${code}`}). Verifique a instalação e se o modelo e sua configuração são compatíveis.`));
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
