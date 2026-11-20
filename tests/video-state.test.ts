import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Asset, GenerationBatch } from '../src/shared/contracts.js';
import {
  audioCheckUnavailable, classifyBatch, exportReachable, hasVideoGoRender, isBatchStale, journeyOutputAssets,
  latestReviewVideo, narrationBlocked, reviewVideos,
} from '../src/shared/video-state.js';

const asset = (name: string, extra: Partial<Asset> = {}): Asset => ({ name, path: `/p/${name}`, kind: 'video', url: `u/${name}`, approved: false, ...extra });
const batch = (patch: Partial<GenerationBatch> = {}): GenerationBatch => ({ id: '1', assets: [], sourceCount: 0, ...patch });
const status = (state: 'generating' | 'processing' | 'ready' | 'failed') => ({ state, updatedAt: 'now' });

test('reviewVideos keeps only review/final renders, newest first, and demands audio when narrated', () => {
  const assets = [
    asset('renders/review/a-1700000000001-aaaaaaaa.mp4', { hasAudio: true }),
    asset('renders/final/a-1700000000002-bbbbbbbb.mp4', { hasAudio: false }),
    asset('renders/review/a-1700000000003-cccccccc.mp4', { hasAudio: true }),
    asset('other/x.mp4', { hasAudio: true }),
    asset('renders/review/note.png', { kind: 'image' }),
  ];
  assert.deepEqual(reviewVideos(assets, 'narrated').map(a => a.name), ['renders/review/a-1700000000003-cccccccc.mp4', 'renders/review/a-1700000000001-aaaaaaaa.mp4']);
  assert.equal(reviewVideos(assets, 'silent').length, 3);
  assert.equal(reviewVideos(assets, undefined).length, 0);
  assert.equal(latestReviewVideo(reviewVideos(assets, 'silent'))?.name, 'renders/review/a-1700000000003-cccccccc.mp4');
});

test('hasVideoGoRender ignores the FFmpeg derived.mp4 and audioCheckUnavailable flags unverifiable renders', () => {
  assert.equal(hasVideoGoRender([asset('renders/review/derived.mp4')]), false);
  assert.equal(hasVideoGoRender([asset('renders/review/s-1700000000001-aaaaaaaa-with-audio.mp4')]), true);
  assert.equal(audioCheckUnavailable([asset('renders/review/s-1700000000001-aaaaaaaa.mp4')]), true);
  assert.equal(audioCheckUnavailable([asset('renders/review/s-1700000000001-aaaaaaaa.mp4', { hasAudio: false })]), false);
});

test('narrationBlocked covers loading, unsaved edits, not ready and narrated without active scenes', () => {
  const ok = { ready: true, active: true, mode: 'narrated' as const };
  assert.equal(narrationBlocked(null, false), true);
  assert.equal(narrationBlocked(ok, true), true);
  assert.equal(narrationBlocked({ ...ok, ready: false }, false), true);
  assert.equal(narrationBlocked({ ...ok, active: false }, false), true);
  assert.equal(narrationBlocked({ ready: true, active: false, mode: 'silent' }, false), false);
  assert.equal(narrationBlocked(ok, false), false);
});

test('classifyBatch distinguishes imported-without-status from legacy-without-status', () => {
  assert.equal(classifyBatch(undefined, false), 'none');
  assert.equal(classifyBatch(undefined, true), 'legacyFlat');
  assert.equal(classifyBatch(batch({ status: status('processing') }), false), 'generating');
  assert.equal(classifyBatch(batch({ status: status('failed') }), false), 'failed');
  assert.equal(classifyBatch(batch({ status: status('ready') }), false), 'ready');
  assert.equal(classifyBatch(batch({ sourceCount: 3 }), false), 'importedPending');
  assert.equal(classifyBatch(batch({ sourceCount: 3, assets: [asset('generated/runs/1/slide-01.png', { kind: 'image' })] }), false), 'legacyNoStatus');
});

test('isBatchStale needs a recorded format that differs; unknown format is never stale', () => {
  assert.equal(isBatchStale(batch({ status: status('ready'), format: 'carousel-1x1' }), 'story-9x16'), true);
  assert.equal(isBatchStale(batch({ status: status('ready'), format: 'carousel-1x1' }), 'carousel-1x1'), false);
  assert.equal(isBatchStale(batch({ status: status('ready') }), 'story-9x16'), false);
  assert.equal(isBatchStale(batch({ status: status('failed'), format: 'carousel-1x1' }), 'story-9x16'), false);
});

test('journeyOutputAssets: video counts only the newest render; image only the newest ready round', () => {
  const v1 = asset('renders/review/a-1700000000001-aaaaaaaa.mp4', { approved: true });
  const v2 = asset('renders/review/a-1700000000002-bbbbbbbb.mp4');
  assert.deepEqual(journeyOutputAssets({ kind: 'video', batches: [], legacyAssets: [], reviewVideos: [v2, v1] }), [v2]);
  const img = asset('generated/runs/2/slide-01.png', { kind: 'image' });
  const legacy = asset('generated/slide-1.png', { kind: 'image' });
  assert.deepEqual(journeyOutputAssets({ kind: 'image', batches: [batch({ id: '2', assets: [img], status: status('ready') }), batch({ id: '1', assets: [legacy], status: status('ready') })], legacyAssets: [], reviewVideos: [] }), [img]);
  assert.deepEqual(journeyOutputAssets({ kind: 'image', batches: [batch({ assets: [img], status: status('processing') })], legacyAssets: [], reviewVideos: [] }), []);
  assert.deepEqual(journeyOutputAssets({ kind: 'image', batches: [], legacyAssets: [legacy], reviewVideos: [] }), [legacy]);
});

test('exportReachable is strict for images and keeps cover/copy-only delivery for video', () => {
  assert.equal(exportReachable({ kind: 'image', reviewDone: false, deliveryAssetCount: 0 }), false);
  assert.equal(exportReachable({ kind: 'image', reviewDone: true, deliveryAssetCount: 0 }), true);
  assert.equal(exportReachable({ kind: 'video', reviewDone: false, deliveryAssetCount: 0 }), false);
  assert.equal(exportReachable({ kind: 'video', reviewDone: false, deliveryAssetCount: 2 }), true);
  assert.equal(exportReachable({ kind: 'video', reviewDone: true, deliveryAssetCount: 0 }), true);
});
