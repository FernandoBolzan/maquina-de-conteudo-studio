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
  visualStyleFor,
  type PromptStorage,
} from '../src/renderer/prompt-library.js';
import { POSTNOW_FORMATS } from '../src/shared/formats.js';

class MemoryStorage implements PromptStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

test('image and video recipes compose topic, audience, CTA and the selected placement', () => {
  const carousel = PROMPT_RECIPES.find(recipe => recipe.id === 'curiosity-carousel')!;
  const video = PROMPT_RECIPES.find(recipe => recipe.id === 'curiosity-video-30')!;
  const input = { topic: 'o oceano', audience: 'estudantes', tone: 'leve', callToAction: 'comente', format: 'carousel-1x1' as const };
  assert.equal(carousel.kind, 'image');
  assert.match(composePrompt(carousel, input), /o oceano/);
  const videoInput = { ...input, format: 'reels' as const };
  const videoPrompt = composePrompt(video, videoInput);
  for (const value of [videoInput.topic, videoInput.audience, videoInput.tone, videoInput.callToAction]) assert.ok(videoPrompt.includes(value));
  assert.match(videoPrompt, /Reels\/Shorts\/TikTok 9:16, 1080 × 1920 px/);
  assert.match(videoPrompt, /Eleven v4/);
  assert.match(videoPrompt, /spokenText/);
  assert.match(videoPrompt, /IPA/);
  assert.match(videoPrompt, /sem gerar áudio nem renderizar/);
});

test('blank video inputs receive safe useful defaults', () => {
  const recipe = PROMPT_RECIPES.find(item => item.id === 'curiosity-video-30')!;
  const prompt = composePrompt(recipe, { topic: '', audience: ' ', tone: '', callToAction: '', format: 'reels' });
  assert.match(prompt, /tema a definir/);
  assert.match(prompt, /público geral/);
  assert.match(prompt, /claro e direto/);
  assert.match(prompt, /salve e compartilhe/);
  assert.match(prompt, /Formato obrigatório: Reels\/Shorts\/TikTok 9:16/);
});

test('creation names reflect the selected image format and stay human-readable', () => {
  assert.equal(suggestProjectTitle('image', '  por que   abelhas dançam  ', 'carousel-4x5'), 'Carrossel: por que abelhas dançam');
  assert.equal(suggestProjectTitle('image', 'Abelhas', 'post-1x1'), 'Post: Abelhas');
  assert.equal(suggestProjectTitle('image', 'Abelhas', 'story-9x16'), 'Story: Abelhas');
  assert.equal(suggestProjectTitle('video', 'A origem da Lua'), 'Vídeo: A origem da Lua');
  assert.equal(suggestProjectTitle('video', '  '), '');
  assert.equal(composeProjectBrief({ topic: 'Lua', audience: 'crianças', tone: 'leve', callToAction: 'comente', format: 'carousel-1x1' }, 'Não invente fontes.'),
    'Tema: Lua\nPúblico: crianças\nTom: leve\nChamada final: comente\nFormato: carrossel quadrado 1:1, 1080 × 1080 px (carousel-1x1)\nFotos de referência da marca: usar apenas quando pertinentes e autorizadas\nNão invente fontes.');
  assert.equal(composeProjectBrief({ topic: 'Lua', audience: '', tone: '', callToAction: '', format: 'reels', useBrandImages: false }), 'Tema: Lua\nFormato: Reels/Shorts/TikTok 9:16, 1080 × 1920 px (reels)\nFotos de referência da marca: não usar');
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

test('carousel recipes respect selected count and every image kind offers single-post structures', () => {
  const carousels = PROMPT_RECIPES.filter(recipe => recipe.kind === 'image');
  const input = { topic: 'o oceano', audience: 'estudantes', tone: 'leve', callToAction: 'comente', format: 'carousel-1x1' as const };
  for (const recipe of carousels) {
    const three = composePrompt(recipe, { ...input, pageCount: 3 });
    assert.match(three, /\b3 slides\b/, recipe.id);
    assert.deepEqual([...three.matchAll(/(\d+) slides/g)].map(match => Number(match[1])), [3], recipe.id);
    const ten = composePrompt(recipe, { ...input, pageCount: 10 });
    assert.match(ten, /\b10 slides\b/, recipe.id);
    assert.deepEqual([...ten.matchAll(/(\d+) slides/g)].map(match => Number(match[1])), [10], recipe.id);
  }
});

test('promptRecipesFor returns all image and video recipes without kind leakage', () => {
  assert.deepEqual(promptRecipesFor('image'), PROMPT_RECIPES.filter(recipe => recipe.kind === 'image'));
  assert.deepEqual(promptRecipesFor('video'), PROMPT_RECIPES.filter(recipe => recipe.kind === 'video'));
  assert.ok(promptRecipesFor('image').length >= 10);
  assert.ok(promptRecipesFor('video').length >= 10);
});
test('default video template uses format wording once and is not curiosity-centered', () => {
  const prompt = composePrompt(PROMPT_RECIPES.find(recipe => recipe.id === 'video-problem-solution')!, {
    topic: 'atendimento ao cliente', audience: 'equipes pequenas', tone: 'direto', callToAction: 'revise o processo', format: 'reels',
  });
  assert.match(prompt, /vídeo sobre atendimento ao cliente/);
  assert.match(prompt, /no formato Reels\/Shorts\/TikTok/);
  assert.doesNotMatch(prompt, /vídeo Reels|curiosidade|fato surpreendente/);
});

test('single post and Story recipes ask for one art and never for carousel page counts', () => {
  const input = { topic: 'o oceano', audience: 'estudantes', tone: 'leve', callToAction: 'comente' };
  for (const recipe of PROMPT_RECIPES.filter(item => item.kind === 'image')) {
    for (const format of ['post-1x1', 'story-9x16'] as const) {
      const prompt = composePrompt(recipe, { ...input, format });
      assert.match(prompt, /uma única arte/, `${recipe.id} ${format}`);
      assert.doesNotMatch(prompt, /carrossel de \d+ slides|\d+ slides/, `${recipe.id} ${format}`);
      assert.ok(!prompt.includes('{{'), `${recipe.id} ${format} has no unresolved placeholders`);
      assert.ok(prompt.includes('o oceano') && prompt.includes('comente'), `${recipe.id} ${format}`);
    }
  }
});
test('single artwork separates concise on-art text from publication copy', () => {
  for (const recipe of PROMPT_RECIPES.filter(item => item.kind === 'image')) {
    const prompt = composePrompt(recipe, {
      topic: 'o oceano', audience: 'estudantes', tone: 'leve', callToAction: 'comente', format: 'post-1x1',
    });
    assert.match(prompt, /headline curto e um body\/subtítulo conciso/, recipe.id);
    assert.match(prompt, /copy\/caption de publicação separada/, recipe.id);
    assert.match(prompt, /sem listas, passos, dicas detalhadas, fontes, ressalvas longas ou CTA de publicação/, recipe.id);
  }
});

test('carousel preserves per-slide content while Story interactions stay short and sticker-safe', () => {
  const carousel = composePrompt(PROMPT_RECIPES.find(item => item.id === 'checklist-image')!, {
    topic: 'o oceano', audience: 'estudantes', tone: 'leve', callToAction: 'comente', format: 'carousel-1x1', pageCount: 5,
  });
  assert.match(carousel, /distribua itens distintos por slide/);
  assert.match(carousel, /headline, body, copy e visual_function por slide/);
  assert.match(carousel, /5 slides/);
  const story = composePrompt(PROMPT_RECIPES.find(item => item.id === 'story-interaction-image')!, {
    topic: 'o oceano', audience: 'estudantes', tone: 'leve', callToAction: 'comente', format: 'story-9x16',
  });
  assert.match(story, /uma pergunta específica e duas opções curtas/);
  assert.match(story, /espaço para inserir o sticker nativo depois/);
});

test('4x3 recipe ids describe canonical dimensions and ratio', () => {
  for (const format of ['post-4x3', 'carousel-4x3'] as const) {
    const prompt = composePrompt(PROMPT_RECIPES.find(item => item.kind === 'image')!, {
      topic: 'o oceano', audience: 'estudantes', tone: 'leve', callToAction: 'comente', format,
    });
    const { width, height, aspect } = POSTNOW_FORMATS[format];
    assert.match(prompt, new RegExp(`${width} × ${height} px`));
    assert.ok(prompt.includes(aspect), format);
  }
});

test('brand image recipes work with or without supplied visual references', () => {
  for (const recipe of PROMPT_RECIPES.filter(item => item.kind === 'image')) {
    assert.match(composePrompt(recipe, { topic: 'o oceano', audience: 'estudantes', tone: 'leve', callToAction: 'comente', format: 'post-1x1', useBrandImages: true }), /Use fotos e imagens de referência da marca/, recipe.id);
  }
  const single = composePrompt(PROMPT_RECIPES.find(recipe => recipe.id === 'product-feature-image')!, {
    topic: 'produto', audience: 'clientes', tone: 'claro', callToAction: 'saiba mais', format: 'post-1x1',
  });
  assert.match(single, /preferência de logo já salva no projeto/);
  assert.match(single, /Se a preferência for sem logo/);
});
test('image and video recipes compile explicit with-photo and no-photo variants', () => {
  for (const recipe of PROMPT_RECIPES) {
    const input = { topic: 'sono', audience: 'famílias', tone: 'direto', callToAction: 'comente', format: recipe.kind === 'image' ? 'post-1x1' as const : 'reels' as const };
    const withPhotos = composePrompt(recipe, { ...input, useBrandImages: true });
    const withoutPhotos = composePrompt(recipe, { ...input, useBrandImages: false });
    assert.match(withPhotos, /Use fotos e imagens de referência da marca/, recipe.id);
    assert.match(withoutPhotos, /Não abra, anexe, copie nem use fotos ou imagens de referência/, recipe.id);
    assert.doesNotMatch(withoutPhotos, /\{\{brandImagePolicy\}\}/, recipe.id);
  }
});

test('image recipes fill the canvas and do not request a blank footer', () => {
  for (const recipe of PROMPT_RECIPES.filter(item => item.kind === 'image')) {
    for (const format of ['carousel-4x5', 'post-4x5'] as const) {
      const prompt = composePrompt(recipe, { topic: 'x', audience: 'y', tone: 'z', callToAction: 'w', format, pageCount: 4 });
      assert.match(prompt, /quatro bordas/, `${recipe.id} ${format}`);
      assert.doesNotMatch(prompt, /fundo uniforme|livre de textos ou desenhos|espaço negativo liso|canto inferior limpo/i, `${recipe.id} ${format}`);
    }
  }
});

test('every image recipe carries a visual direction that visualStyleFor snapshots; other ids are refused', () => {
  for (const recipe of PROMPT_RECIPES.filter(item => item.kind === 'image')) {
    assert.ok(recipe.visualDirection?.trim(), recipe.id);
    assert.deepEqual(visualStyleFor(recipe.id), { id: recipe.id, title: recipe.title, direction: recipe.visualDirection });
  }
  assert.equal(visualStyleFor('curiosity-video-30'), undefined);
  assert.equal(visualStyleFor('inexistente'), undefined);
  assert.equal(visualStyleFor(42), undefined);
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
