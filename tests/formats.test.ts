import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postNowFormatAcceptsPageCount, type PostNowFormatId } from '../src/shared/contracts.js';
import { POSTNOW_FORMATS, formatCanvas, imageAspectOptions, isPostNowFormat, pagesRangeFor, postNowFormatFor, postNowFormatOrDefault, videoAspectOptions } from '../src/shared/formats.js';

const ids = Object.keys(POSTNOW_FORMATS) as PostNowFormatId[];

test('PostNow canvas sizes match the contract', () => {
  assert.deepEqual(formatCanvas('story-9x16'), { width: 1080, height: 1920 });
  assert.deepEqual(formatCanvas('post-1x1'), { width: 1080, height: 1080 });
  assert.deepEqual(formatCanvas('carousel-1x1'), { width: 1080, height: 1080 });
  assert.deepEqual(formatCanvas('post-4x5'), { width: 1080, height: 1350 });
  assert.deepEqual(formatCanvas('carousel-4x5'), { width: 1080, height: 1350 });
  assert.deepEqual(formatCanvas('post-4x3'), { width: 1080, height: 1350 });
  assert.deepEqual(formatCanvas('carousel-4x3'), { width: 1080, height: 1350 });
});

test('Page ranges are one page for story and post, three to ten for carousel', () => {
  assert.deepEqual(pagesRangeFor('story'), { min: 1, max: 1 });
  assert.deepEqual(pagesRangeFor('post'), { min: 1, max: 1 });
  assert.deepEqual(pagesRangeFor('carousel'), { min: 3, max: 10 });
});

test('Page count acceptance follows the page range for every format', () => {
  for (const id of ids) {
    const range = pagesRangeFor(POSTNOW_FORMATS[id].kind);
    for (const count of [0, 1, 2, 3, 5, 10, 11]) {
      const expected = count >= range.min && count <= range.max;
      assert.equal(postNowFormatAcceptsPageCount(id, count), expected, `${id} with ${count} pages`);
    }
  }
  assert.equal(postNowFormatAcceptsPageCount('carousel-1x1', 2), false);
  assert.equal(postNowFormatAcceptsPageCount('carousel-4x3', 10), true);
  assert.equal(postNowFormatAcceptsPageCount('post-4x3', 2), false);
});

test('Missing format uses the 1:1 default; removed or unknown ids are rejected', () => {
  assert.equal(isPostNowFormat('reels'), false);
  assert.equal(isPostNowFormat('post-4x3'), true);
  assert.equal(postNowFormatOrDefault(undefined), 'carousel-4x5');
  assert.throws(() => postNowFormatOrDefault('reels'), /desconhecido ou removido/);
});

test('Image options map aspect and quantity to PostNow ids', () => {
  assert.deepEqual(imageAspectOptions().map(option => option.aspect), ['9:16', '1:1', '4:5']);
  assert.equal(postNowFormatFor('4:5', false), 'post-4x5');
  assert.equal(postNowFormatFor('4:5', true), 'carousel-4x5');
  assert.equal(postNowFormatFor('1:1', true), 'carousel-1x1');
  assert.equal(postNowFormatFor('9:16', true), undefined);
});

test('Video options disable 4:3 with a visible reason', () => {
  const options = videoAspectOptions();
  for (const aspect of ['4:5', '4:3'] as const) {
    const option = options.find(item => item.aspect === aspect);
    assert.ok(option);
    assert.equal(option.available, false);
    if (!option.available) assert.match(option.reason, /VideoGo/);
  }
  const square = options.find(item => item.aspect === '1:1');
  assert.ok(square?.available);
  assert.equal(square.format, 'feed-square');
});
