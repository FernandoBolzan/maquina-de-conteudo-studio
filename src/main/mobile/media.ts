import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { basename, extname } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MEDIA_TYPES } from '../../shared/media-types.js';

export type ByteRange = { start: number; end: number };

/**
 * Interpreta um cabeçalho `Range` de um único intervalo (`a-b`, `a-` ou sufixo `-n`).
 * Devolve `undefined` quando o intervalo é inválido, insatisfatível ou múltiplo (o chamador responde 416).
 */
export function parseRange(header: string, size: number): ByteRange | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return undefined;
  const [, first = '', last = ''] = match;
  if (!first && !last) return undefined;
  if (!first) {
    const suffix = Number(last);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return undefined;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  if (!Number.isSafeInteger(start) || start >= size) return undefined;
  if (!last) return { start, end: size - 1 };
  const end = Number(last);
  if (!Number.isSafeInteger(end) || end < start) return undefined;
  return { start, end: Math.min(end, size - 1) };
}

function contentDisposition(filePath: string): string {
  const name = basename(filePath);
  const ascii = name.replace(/[^\x20-\x7e]|["\\%]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function notModified(req: IncomingMessage, etag: string, mtimeMs: number): boolean {
  const noneMatch = req.headers['if-none-match'];
  if (noneMatch) {
    const wanted = (value: string) => value.trim().replace(/^W\//, '');
    return noneMatch.trim() === '*' || noneMatch.split(',').some(value => wanted(value) === etag);
  }
  const since = req.headers['if-modified-since'];
  if (since) {
    const date = Date.parse(since);
    return Number.isFinite(date) && Math.floor(mtimeMs / 1000) * 1000 <= date;
  }
  return false;
}

/** Serve um arquivo de mídia já autorizado, com `Range` (obrigatório para vídeo e áudio no celular), `HEAD` e validação de cache. */
export async function serveMedia(req: IncomingMessage, res: ServerResponse, filePath: string, download: boolean): Promise<void> {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error('Não é um arquivo.');
  const size = info.size;
  const etag = `"${size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const headers: Record<string, string | number> = {
    'Content-Type': MEDIA_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-cache',
    ETag: etag,
    'Last-Modified': info.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
  };
  if (download) headers['Content-Disposition'] = contentDisposition(filePath);

  if (notModified(req, etag, info.mtimeMs)) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  let range: ByteRange | undefined;
  if (req.headers.range) {
    range = parseRange(req.headers.range, size);
    if (!range) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}`, 'Content-Length': 0 });
      res.end();
      return;
    }
  }

  if (range) {
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': range.end - range.start + 1 });
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': size });
  }
  if (req.method === 'HEAD' || size === 0) {
    res.end();
    return;
  }

  try {
    await pipeline(createReadStream(filePath, range ? { start: range.start, end: range.end } : undefined), res);
  } catch {
    // Cliente desconectou ou o arquivo falhou no meio: o pipeline já destruiu o stream; só garante o fechamento do socket.
    if (!res.writableEnded) res.destroy();
  }
}
