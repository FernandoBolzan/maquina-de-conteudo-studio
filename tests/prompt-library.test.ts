import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeProjectBrief,
  composePrompt,
  emptyPromptLibrary,
  interpolatePrompt,
  loadPromptLibrary,
  parsePromptLibrary,
  PROMPT_LIBRARY_STORAGE_KEY,
  PROMPT_RECIPES,
  promptRecipesFor,
  savePromptLibrary,
  suggestProjectTitle,
  type PromptStorage,
} from '../src/renderer/prompt-library.js';

class MemoryStorage implements PromptStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

test('carousel and video recipes compose topic and video narration inputs', () => {
  const carousel = PROMPT_RECIPES.find(recipe => recipe.id === 'curiosity-carousel')!;
  const video = PROMPT_RECIPES.find(recipe => recipe.id === 'curiosity-video-30')!;
  assert.equal(carousel.kind, 'image');
  assert.equal(video.kind, 'video');
  const input = { topic: 'o oceano', audience: 'estudantes', tone: 'leve', callToAction: 'comente', format: 'carousel-1x1' as const };
  assert.match(composePrompt(carousel, input), /o oceano/);
  const videoInput = { ...input, format: 'reels' as const };
  const videoPrompt = composePrompt(video, videoInput);
  for (const value of [videoInput.topic, videoInput.audience, videoInput.tone, videoInput.callToAction]) assert.ok(videoPrompt.includes(value));
  assert.match(videoPrompt, /Reels\/Shorts\/TikTok 9:16, 1080 × 1920 px/);
  assert.match(videoPrompt, /ElevenLabs v4/);
  assert.match(videoPrompt, /spokenText/);
  assert.match(videoPrompt, /IPA/);
  assert.match(videoPrompt, /\[curious\]/);
  assert.match(videoPrompt, /não gere áudio/);
});

test('blank video inputs receive useful defaults', () => {
  const recipe = PROMPT_RECIPES.find(item => item.id === 'curiosity-video-30')!;
  const prompt = composePrompt(recipe, { topic: '', audience: ' ', tone: '', callToAction: '', format: 'reels' });
  assert.match(prompt, /tema a definir/);
  assert.match(prompt, /público geral/);
  assert.match(prompt, /claro e curioso/);
  assert.match(prompt, /salve e compartilhe/);
  assert.match(prompt, /Formato obrigatório: Reels\/Shorts\/TikTok 9:16, 1080 × 1920 px/);
});

test('creation names stay human-readable and the briefing preserves the selected format', () => {
  assert.equal(suggestProjectTitle('image', '  por que   abelhas dançam  '), 'Carrossel — por que abelhas dançam');
  assert.equal(suggestProjectTitle('video', 'A origem da Lua'), 'Vídeo — A origem da Lua');
  assert.equal(suggestProjectTitle('video', '  '), '');
  assert.equal(composeProjectBrief({ topic: 'Lua', audience: 'crianças', tone: 'leve', callToAction: 'comente', format: 'carousel-1x1' }, 'Não invente fontes.'),
    'Tema: Lua\nPúblico: crianças\nTom: leve\nChamada final: comente\nFormato: carrossel quadrado 1:1, 1080 × 1080 px (carousel-1x1)\nNão invente fontes.');
  assert.equal(composeProjectBrief({ topic: 'Lua', audience: '', tone: '', callToAction: '', format: 'reels' }), 'Tema: Lua\nFormato: Reels/Shorts/TikTok 9:16, 1080 × 1920 px (reels)');
});

test('personal prompt templates interpolate only the supported creation fields', () => {
  assert.equal(
    interpolatePrompt('Fale sobre {{topic}} para {{audience}} com tom {{tone}} e CTA {{callToAction}} no formato {{format}}.', { topic: 'o mar', audience: 'crianças', tone: 'leve', callToAction: 'salve', format: 'story-9x16' }),
    'Fale sobre o mar para crianças com tom leve e CTA salve no formato Story 9:16, 1080 × 1920 px.',
  );
  assert.equal(
    interpolatePrompt('Fale de {{tema}} para {{público}} com {{tom}}, CTA {{cta}}; preserve {{campo_livre}}.', { topic: 'o mar', audience: 'crianças', tone: 'leve', callToAction: 'salve', format: 'carousel-1x1' }),
    'Fale de o mar para crianças com leve, CTA salve; preserve {{campo_livre}}.',
  );
});

test('carousel recipes state the selected page count and no other fixed count', () => {
  const carousels = PROMPT_RECIPES.filter(recipe => recipe.kind === 'image');
  assert.ok(carousels.length > 0);
  const input = { topic: 'o oceano', audience: 'estudantes', tone: 'leve', callToAction: 'comente', format: 'carousel-1x1' as const };
  for (const recipe of carousels) {
    const three = composePrompt(recipe, { ...input, pageCount: 3 });
    assert.match(three, /\b3 slides\b/, recipe.id);
    for (const fixed of ['5 slides', '6 slides', '7 slides']) assert.ok(!three.includes(fixed), `${recipe.id} must not state ${fixed}`);
    assert.deepEqual([...three.matchAll(/(\d+) slides/g)].map(match => Number(match[1])), [3], recipe.id);
    const ten = composePrompt(recipe, { ...input, pageCount: 10 });
    assert.match(ten, /\b10 slides\b/, recipe.id);
    assert.deepEqual([...ten.matchAll(/(\d+) slides/g)].map(match => Number(match[1])), [10], recipe.id);
  }
});

test('page count placeholder accepts its aliases and falls back for invalid counts', () => {
  const base = { topic: 'o mar', audience: '', tone: '', callToAction: '', format: 'carousel-1x1' as const };
  assert.equal(interpolatePrompt('{{pageCount}}', { ...base, pageCount: 4 }), '4');
  assert.equal(interpolatePrompt('{{pagecount}}|{{Páginas}}|{{slides}}', { ...base, pageCount: 4 }), '4|4|4');
  assert.equal(interpolatePrompt('{{pageCount}}', base), 'a definir');
  for (const pageCount of [0, -2, 2.5, Number.NaN]) assert.equal(interpolatePrompt('{{pageCount}}', { ...base, pageCount }), 'a definir');
});

test('promptRecipesFor offers carousel recipes for images only in carousel mode', () => {
  assert.deepEqual(promptRecipesFor('image', false), []);
  assert.ok(promptRecipesFor('image', true).some(recipe => recipe.id === 'curiosity-carousel'));
  assert.deepEqual(promptRecipesFor('video', false).map(recipe => recipe.id), [
    'video-collage-motion', 'video-3d-justice', 'video-3d-technology', 'video-authority-reels', 'video-vox-explainer', 'curiosity-video-30', 'myth-fact-video', 'three-facts-video'
  ]);
});

test('favorites and personal prompts persist and custom favorites survive parsing', () => {
  const storage = new MemoryStorage();
  const data = {
    favorites: ['curiosity-carousel', 'mine-1'],
    personal: [{ id: 'mine-1', title: 'Meu roteiro', kind: 'video' as const, prompt: 'Roteiro para {{tema}}', createdAt: '2026-05-06T10:00:00.000Z' }],
  };
  assert.equal(savePromptLibrary(data, storage), true);
  assert.ok(storage.getItem(PROMPT_LIBRARY_STORAGE_KEY));
  assert.deepEqual(loadPromptLibrary(storage), data);
});

test('malformed library data is discarded without losing valid curated favorites', () => {
  const raw = JSON.stringify({
    favorites: ['curiosity-carousel', 'missing-id'],
    personal: [{ id: 'bad', title: ' ', kind: 'audio', prompt: 'x', createdAt: 'now' }],
  });
  assert.deepEqual(parsePromptLibrary(raw), { favorites: ['curiosity-carousel'], personal: [] });
  assert.deepEqual(parsePromptLibrary('{broken'), emptyPromptLibrary());
});

test('storage failure returns a safe empty library', () => {
  const storage: PromptStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(savePromptLibrary({ favorites: [], personal: [] }, storage), false);
  assert.deepEqual(loadPromptLibrary(storage), emptyPromptLibrary());
});
