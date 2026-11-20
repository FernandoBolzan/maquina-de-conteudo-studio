import type { VideoGoFormatId } from './contracts.js';

interface StreamProbe {
  codec_type?: unknown;
  width?: unknown;
  height?: unknown;
  avg_frame_rate?: unknown;
  r_frame_rate?: unknown;
}

interface FormatProbe {
  duration?: unknown;
}

interface RenderProbe {
  streams?: unknown;
  format?: unknown;
}

const CANVAS: Record<VideoGoFormatId, { width: number; height: number }> = {
  reels: { width: 1080, height: 1920 },
  story: { width: 1080, height: 1920 },
  'feed-square': { width: 1080, height: 1080 },
  youtube: { width: 1920, height: 1080 },
};

/** Fail closed when a VideoGo MP4 does not satisfy the selected format's delivery contract. */
export function videoRenderIssue(probe: unknown, format: VideoGoFormatId, expectAudio: boolean): string | undefined {
  if (typeof probe !== 'object' || probe === null || Array.isArray(probe)) return 'A resposta FFprobe do vídeo é inválida.';
  const result = probe as RenderProbe;
  if (!Array.isArray(result.streams)) return 'O vídeo gerado não contém faixas legíveis.';
  const streams = result.streams.filter((stream): stream is StreamProbe => typeof stream === 'object' && stream !== null && !Array.isArray(stream));
  const video = streams.find(stream => stream.codec_type === 'video');
  if (!video) return 'O vídeo gerado não contém faixa de vídeo.';

  const expected = CANVAS[format];
  if (video.width !== expected.width || video.height !== expected.height) {
    return `Formato de vídeo inválido: recebido ${String(video.width)}×${String(video.height)}, esperado ${expected.width}×${expected.height} para ${format}.`;
  }

  const frameRate = parseRate(video.avg_frame_rate) ?? parseRate(video.r_frame_rate);
  if (frameRate !== 30) return `FPS de vídeo inválido: recebido ${String(video.avg_frame_rate ?? video.r_frame_rate)}, esperado 30.`;

  const metadata = typeof result.format === 'object' && result.format !== null && !Array.isArray(result.format)
    ? result.format as FormatProbe
    : undefined;
  const duration = typeof metadata?.duration === 'string' || typeof metadata?.duration === 'number' ? Number(metadata.duration) : NaN;
  if (!Number.isFinite(duration) || duration <= 0) return 'O vídeo gerado não tem duração válida.';
  if (expectAudio && !streams.some(stream => stream.codec_type === 'audio')) return 'O vídeo narrado terminou sem faixa de áudio.';
  return undefined;
}

function parseRate(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const [numerator, denominator, ...extra] = value.split('/');
  if (extra.length) return undefined;
  const top = Number(numerator);
  const bottom = denominator === undefined ? 1 : Number(denominator);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom === 0) return undefined;
  const rate = top / bottom;
  return Number.isFinite(rate) ? rate : undefined;
}
