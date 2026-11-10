import type { PostNowFormatId, ProjectFormatId, VideoGoFormatId } from './contracts.js';

export type PostNowKind = 'story' | 'post' | 'carousel';
export type ImageAspect = '9:16' | '1:1' | '4:5' | '4:3';
export type VideoAspect = ImageAspect | '16:9';

export interface PostNowFormatSpec {
  label: string;
  kind: PostNowKind;
  width: number;
  height: number;
  aspect: ImageAspect;
  pagesMin: number;
  pagesMax: number;
}

const PAGE_RANGES: Record<PostNowKind, { min: number; max: number }> = {
  story: { min: 1, max: 1 },
  post: { min: 1, max: 1 },
  carousel: { min: 3, max: 10 },
};

/** Quantidade de páginas aceita por tipo de projeto PostNow. Story e post são sempre uma página; carrossel vai de 3 a 10. */
export function pagesRangeFor(kind: PostNowKind): { min: number; max: number } {
  return { ...PAGE_RANGES[kind] };
}

function spec(label: string, kind: PostNowKind, width: number, height: number, aspect: ImageAspect): PostNowFormatSpec {
  const pages = pagesRangeFor(kind);
  return { label, kind, width, height, aspect, pagesMin: pages.min, pagesMax: pages.max };
}

export const POSTNOW_FORMATS: Record<PostNowFormatId, PostNowFormatSpec> = {
  'story-9x16': spec('Story 9:16', 'story', 1080, 1920, '9:16'),
  'post-1x1': spec('Post quadrado 1:1', 'post', 1080, 1080, '1:1'),
  'carousel-1x1': spec('Carrossel quadrado 1:1', 'carousel', 1080, 1080, '1:1'),
  'post-4x5': spec('Post vertical 4:5', 'post', 1080, 1350, '4:5'),
  'carousel-4x5': spec('Carrossel vertical 4:5', 'carousel', 1080, 1350, '4:5'),
  'post-4x3': spec('Post vertical 4:5', 'post', 1080, 1350, '4:5'),
  'carousel-4x3': spec('Carrossel vertical 4:5', 'carousel', 1080, 1350, '4:5'),
};

export function isPostNowFormat(value: unknown): value is PostNowFormatId {
  return typeof value === 'string' && Object.hasOwn(POSTNOW_FORMATS, value);
}

/** Formato PostNow para imagens sem formato escolhido: carrossel quadrado 1:1, nativo do ImageGen (sem recorte). */
export const DEFAULT_POSTNOW_FORMAT: PostNowFormatId = 'carousel-4x5';

/** Formato PostNow do projeto; ausente usa o padrão. Formato desconhecido ou removido é erro explícito, nunca fallback silencioso. */
export function postNowFormatOrDefault(format: ProjectFormatId | undefined): PostNowFormatId {
  if (format === undefined) return DEFAULT_POSTNOW_FORMAT;
  if (isPostNowFormat(format)) return format;
  throw new Error('Formato PostNow desconhecido ou removido; escolha outro formato.');
}

export function formatCanvas(format: PostNowFormatId): { width: number; height: number } {
  const { width, height } = POSTNOW_FORMATS[format];
  return { width, height };
}

const IMAGE_ASPECTS: readonly ImageAspect[] = ['9:16', '1:1', '4:5'];
const IMAGE_ASPECT_FORMATS: Record<ImageAspect, { label: string; single: PostNowFormatId; carousel?: PostNowFormatId }> = {
  '9:16': { label: 'Story 9:16', single: 'story-9x16' },
  '1:1': { label: 'Feed quadrado 1:1', single: 'post-1x1', carousel: 'carousel-1x1' },
  '4:5': { label: 'Feed vertical 4:5 · 1080×1350', single: 'post-4x5', carousel: 'carousel-4x5' },
  '4:3': { label: 'Feed vertical 4:5 · 1080×1350', single: 'post-4x5', carousel: 'carousel-4x5' },
};

export interface ImageAspectOption {
  aspect: ImageAspect;
  label: string;
  single: PostNowFormatId;
  /** Ausente quando a proporção não tem carrossel (story é sempre uma página). */
  carousel?: PostNowFormatId;
}

export function imageAspectOptions(): ImageAspectOption[] {
  return IMAGE_ASPECTS.map(aspect => ({ aspect, ...IMAGE_ASPECT_FORMATS[aspect] }));
}

/** Formato PostNow para a proporção e a quantidade escolhidas; undefined quando a combinação não existe. */
export function postNowFormatFor(aspect: ImageAspect, carousel: boolean): PostNowFormatId | undefined {
  const entry = IMAGE_ASPECT_FORMATS[aspect];
  return carousel ? entry.carousel : entry.single;
}

export const VIDEO_UNAVAILABLE_REASON = 'O VideoGo não renderiza esta proporção.';

export type VideoAspectOption =
  | { aspect: VideoAspect; label: string; available: true; format: VideoGoFormatId }
  | { aspect: VideoAspect; label: string; available: false; reason: string };

export function videoAspectOptions(): VideoAspectOption[] {
  return [
    { aspect: '9:16', label: 'Vertical 9:16', available: true, format: 'story' },
    { aspect: '1:1', label: 'Feed quadrado 1:1', available: true, format: 'feed-square' },
    { aspect: '4:5', label: 'Feed vertical 4:5', available: false, reason: 'O VideoGo renderiza vídeos verticais em 9:16 (1080×1920 para Reels/Stories, cuja área segura central enquadra no 4:5), 1:1 quadrado ou 16:9 (YouTube).' },
    { aspect: '4:3', label: 'Feed 4:3', available: false, reason: VIDEO_UNAVAILABLE_REASON },
    { aspect: '16:9', label: 'Horizontal 16:9', available: true, format: 'youtube' },
  ];
}
