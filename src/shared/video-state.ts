import type { Asset, GenerationBatch, NarrationState, PostNowFormatId } from './contracts.js';

const REVIEW_RENDER = /^renders\/(?:review|final)\//i;
// VideoGo's CLI names renders with <storyboard-id>-<timestamp>-<8-char-id>.mp4;
// the FFmpeg carousel derivation is deliberately named derived.mp4 instead.
const VIDEOGO_RENDER = /(?:^|\/)renders\/(?:review|final)\/[^/]+-\d{13}-[a-f0-9]{8}(?:-with-audio)?\.mp4$/i;

const normalize = (name: string): string => name.replace(/\\/g, '/');

/** Renders the user can review, newest first. In narrated mode a render without verified audio is not reviewable. */
export function reviewVideos(assets: readonly Asset[], mode: NarrationState['mode'] | undefined): Asset[] {
  return assets
    .filter(asset => asset.kind === 'video'
      && REVIEW_RENDER.test(normalize(asset.name))
      && (mode === 'silent' || (mode === 'narrated' && asset.hasAudio === true)))
    .sort((a, b) => b.name.localeCompare(a.name));
}

/** `videos` must come from `reviewVideos` (already newest first). */
export function latestReviewVideo(videos: readonly Asset[]): Asset | undefined {
  return videos[0];
}

export function hasVideoGoRender(videos: readonly Asset[]): boolean {
  return videos.some(asset => VIDEOGO_RENDER.test(normalize(asset.name)));
}

/** True when a render exists whose audio could not be verified (FFprobe missing). */
export function audioCheckUnavailable(assets: readonly Asset[]): boolean {
  return assets.some(asset => asset.kind === 'video' && REVIEW_RENDER.test(normalize(asset.name)) && asset.hasAudio === undefined);
}

export function narrationBlocked(narration: Pick<NarrationState, 'ready' | 'active' | 'mode'> | null | undefined, dirty: boolean): boolean {
  return !narration || dirty || !narration.ready || (narration.mode === 'narrated' && !narration.active);
}

export type BatchState = 'none' | 'generating' | 'failed' | 'ready' | 'importedPending' | 'legacyNoStatus' | 'legacyFlat';

/** Classifies the most recent PostNow round. `legacyFlat` means loose generated/slide-N.png files and no round at all. */
export function classifyBatch(latest: GenerationBatch | undefined, legacyFlat: boolean): BatchState {
  if (!latest) return legacyFlat ? 'legacyFlat' : 'none';
  const state = latest.status?.state;
  if (state === 'generating' || state === 'processing') return 'generating';
  if (state === 'failed') return 'failed';
  if (state === 'ready') return 'ready';
  return latest.assets.length === 0 && latest.sourceCount > 0 ? 'importedPending' : 'legacyNoStatus';
}

/** A ready round whose recorded format differs from the project's current one. A round without a recorded format is never stale. */
export function isBatchStale(latest: GenerationBatch | undefined, projectFormat: string | undefined): boolean {
  return latest?.status?.state === 'ready' && latest.format !== undefined && projectFormat !== undefined && latest.format !== (projectFormat as PostNowFormatId);
}

/** Outputs that gate the Review step: image = newest round once ready (or loose legacy slides); video = only the newest reviewable render. */
export function journeyOutputAssets(input: { kind: 'image' | 'video'; batches: readonly GenerationBatch[]; legacyAssets: readonly Asset[]; reviewVideos: readonly Asset[] }): Asset[] {
  if (input.kind === 'video') {
    const latest = latestReviewVideo(input.reviewVideos);
    return latest ? [latest] : [];
  }
  const latest = input.batches[0];
  if (!latest) return [...input.legacyAssets];
  return latest.status?.state === 'ready' ? latest.assets : [];
}

/** Delivery is reachable from the stepper only when review is complete; video also keeps cover/copy-only delivery. */
export function exportReachable(input: { kind: 'image' | 'video'; reviewDone: boolean; deliveryAssetCount: number }): boolean {
  return input.reviewDone || (input.kind === 'video' && input.deliveryAssetCount > 0);
}
