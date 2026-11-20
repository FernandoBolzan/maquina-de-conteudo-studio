import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoRenderIssue } from '../src/shared/video-render-validation.js';

const valid = (overrides: Record<string, unknown> = {}) => ({
  streams: [{ codec_type: 'video', width: 1080, height: 1920, avg_frame_rate: '30/1', r_frame_rate: '30/1' }],
  format: { duration: '12.5' },
  ...overrides,
});

test('VideoGo output validation enforces the selected canvas and accepts every supported format', () => {
  assert.equal(videoRenderIssue(valid(), 'reels', false), undefined);
  assert.equal(videoRenderIssue(valid(), 'story', false), undefined);
  assert.equal(videoRenderIssue(valid({ streams: [{ codec_type: 'video', width: 1080, height: 1080, avg_frame_rate: '30/1' }] }), 'feed-square', false), undefined);
  assert.equal(videoRenderIssue(valid({ streams: [{ codec_type: 'video', width: 1920, height: 1080, avg_frame_rate: '30/1' }] }), 'youtube', false), undefined);
  assert.match(videoRenderIssue(valid(), 'youtube', false) ?? '', /1920×1080/);
});

test('VideoGo output validation rejects wrong FPS, missing duration, missing video and missing expected audio', () => {
  assert.match(videoRenderIssue(valid({ streams: [{ codec_type: 'video', width: 1080, height: 1920, avg_frame_rate: '25/1' }] }), 'reels', false) ?? '', /FPS.*30/);
  assert.match(videoRenderIssue(valid({ format: { duration: '0' } }), 'reels', false) ?? '', /duração válida/);
  assert.match(videoRenderIssue(valid({ streams: [] }), 'reels', false) ?? '', /faixa de vídeo/);
  assert.match(videoRenderIssue(valid(), 'reels', true) ?? '', /sem faixa de áudio/);
  assert.equal(videoRenderIssue(valid({ streams: [
    { codec_type: 'video', width: 1080, height: 1920, avg_frame_rate: '30/1' },
    { codec_type: 'audio' },
  ] }), 'reels', true), undefined);
});
