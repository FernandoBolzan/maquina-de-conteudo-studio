import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageFooterAction, videoFooterAction, type FooterAction, type ImageFooterInput, type VideoFooterInput } from '../src/shared/step-action.js';

const image = (patch: Partial<Omit<ImageFooterInput, 'texts' | 'images' | 'review' | 'busy' | 'brief'>> & {
  texts?: Partial<ImageFooterInput['texts']>; images?: Partial<ImageFooterInput['images']>; review?: Partial<ImageFooterInput['review']>;
  busy?: Partial<ImageFooterInput['busy']>; brief?: Partial<ImageFooterInput['brief']>;
} = {}): ImageFooterInput => ({
  step: 'brief', anyJobRunning: false, textAgentRunning: false, agentBlocked: false,
  ...patch,
  brief: { dirty: false, empty: false, ...patch.brief },
  texts: { present: true, ready: true, approved: false, dirty: false, invalid: false, blockingCount: 0, unsupportedFormat: false, adapting: false, ...patch.texts },
  images: { expected: 5, batchState: 'none', stale: false, formatLabel: 'Carrossel 1:1', canGenerate: true, canPreparePostnow: true, ...patch.images },
  review: { kept: 0, redo: 0, pending: 0, drafting: 0, ...patch.review },
  busy: { imageGeneration: false, imageRevision: false, ...patch.busy },
});

const video = (patch: Partial<Omit<VideoFooterInput, 'script' | 'voice' | 'render' | 'review' | 'busy' | 'brief'>> & {
  script?: Partial<VideoFooterInput['script']>; voice?: Partial<VideoFooterInput['voice']>; render?: Partial<VideoFooterInput['render']>;
  review?: Partial<VideoFooterInput['review']>; busy?: Partial<VideoFooterInput['busy']>; brief?: Partial<VideoFooterInput['brief']>;
} = {}): VideoFooterInput => ({
  step: 'script', agentBlocked: false, storyboardReady: true, compositionAuthored: true, narrationBlocked: false, videoRevisionRequested: false, anyJobRunning: false,
  ...patch,
  brief: { dirty: false, empty: false, ...patch.brief },
  script: { available: true, dirty: false, invalid: false, issuesCount: 0, textAgentRunning: false, promptPresent: true, ...patch.script },
  voice: { loaded: true, mode: 'narrated', dirty: false, active: true, scenesMissingAudio: 0, strayScenes: 0, audiosPendingApproval: 0, voiceChosen: true, elevenConfigured: true, anyManualAudio: false, ...patch.voice },
  render: { hasRender: false, rendering: false, audioCheckUnavailable: false, ...patch.render },
  review: { latestApproved: false, ...patch.review },
  busy: { approving: false, rendering: false, narrationGeneration: false, ...patch.busy },
});

const shows = (action: FooterAction | undefined, kind: string, enabled: boolean) => {
  assert.ok(action, 'expected a footer action');
  assert.equal(action.kind, kind, action.label);
  assert.equal(action.enabled, enabled, action.label);
};

test('image brief: empty blocks, dirty saves, clean continues', () => {
  shows(imageFooterAction(image({ brief: { empty: true, dirty: true } })), 'wait', false);
  shows(imageFooterAction(image({ brief: { dirty: true } })), 'save-brief', true);
  assert.equal(imageFooterAction(image())?.label, 'Continuar');
});

test('image texts: approval is announced in the label and gated by validity', () => {
  const step = { step: 'texts' } as const;
  shows(imageFooterAction(image({ ...step, textAgentRunning: true, anyJobRunning: true })), 'wait', false);
  assert.equal(imageFooterAction(image({ ...step, textAgentRunning: true, anyJobRunning: true }))?.label, 'Preparando textos…');
  assert.equal(imageFooterAction(image({ ...step, anyJobRunning: true }))?.label, 'Aguarde o processo terminar');
  shows(imageFooterAction(image({ ...step, texts: { present: false } })), 'prepare-texts', true);
  shows(imageFooterAction(image({ ...step, texts: { present: false }, agentBlocked: true })), 'prepare-texts', false);
  shows(imageFooterAction(image({ ...step, texts: { unsupportedFormat: true } })), 'wait', false);
  shows(imageFooterAction(image({ ...step, texts: { invalid: true, dirty: true } })), 'wait', false);
  shows(imageFooterAction(image({ ...step, texts: { blockingCount: 2 } })), 'wait', false);
  // Regressão: pendência vem do último estado salvo; o select alterado só resolve após salvar.
  shows(imageFooterAction(image({ ...step, texts: { dirty: true, blockingCount: 1 } })), 'save-approve-texts', true);
  assert.equal(imageFooterAction(image({ ...step, texts: { dirty: true, blockingCount: 1 } }))?.label, 'Salvar alterações');
  assert.equal(imageFooterAction(image({ ...step, texts: { dirty: true } }))?.label, 'Salvar, aprovar e continuar');
  assert.equal(imageFooterAction(image(step))?.label, 'Aprovar textos e continuar');
  shows(imageFooterAction(image({ ...step, texts: { approved: true } })), 'continue', true);
});

test('image generation step: every batch state has an actionable footer or an explicit wait', () => {
  const step = { step: 'images' } as const;
  const at = (batchState: ImageFooterInput['images']['batchState'], extra: Partial<ImageFooterInput['images']> = {}) => imageFooterAction(image({ ...step, images: { batchState, ...extra } }));
  assert.equal(at('none')?.label, 'Gerar 5 imagens');
  assert.equal(at('none', { expected: 1 })?.label, 'Gerar 1 imagem');
  shows(at('none', { canGenerate: false }), 'generate', false);
  shows(at('legacyFlat'), 'generate', true);
  assert.equal(at('failed')?.label, 'Gerar de novo');
  shows(at('legacyNoStatus'), 'generate', true);
  shows(at('importedPending'), 'prepare-postnow', true);
  shows(at('generating'), 'wait', false);
  shows(at('ready'), 'go-review', true);
  shows(at('ready', { stale: true }), 'regenerate', true);
  assert.equal(imageFooterAction(image({ ...step, busy: { imageGeneration: true }, images: { batchState: 'none' } }))?.label, 'Gerando…');
  assert.equal(imageFooterAction(image({ ...step, anyJobRunning: true, images: { batchState: 'ready' } }))?.enabled, false);
});

test('image review: pending blocks, redo regenerates through the same button, all approved delivers', () => {
  const step = { step: 'review', images: { batchState: 'ready' as const } } as const;
  assert.equal(imageFooterAction(image({ ...step, review: { pending: 2, redo: 1 } }))?.label, 'Falta decidir 2');
  shows(imageFooterAction(image({ ...step, review: { pending: 2 } })), 'wait', false);
  assert.equal(imageFooterAction(image({ ...step, review: { redo: 1, kept: 4 } }))?.label, 'Gerar nova versão de 1 imagem');
  shows(imageFooterAction(image({ ...step, review: { redo: 3, kept: 2 } })), 'revise', true);
  shows(imageFooterAction(image({ ...step, review: { kept: 5 } })), 'deliver', true);
  shows(imageFooterAction(image({ step: 'review', busy: { imageRevision: true }, review: { redo: 1 } })), 'wait', false);
  assert.equal(imageFooterAction(image({ step: 'export' })), undefined);
});

test('image review: a revision that was opened but not confirmed blocks generation and delivery', () => {
  const step = { step: 'review', images: { batchState: 'ready' as const } } as const;
  // Uma revisão confirmada (redo) libera a nova versão; uma aberta e não confirmada trava tudo, mesmo com outras já confirmadas.
  shows(imageFooterAction(image({ ...step, review: { redo: 2, kept: 3 } })), 'revise', true);
  const open = imageFooterAction(image({ ...step, review: { redo: 2, kept: 2, drafting: 1 } }));
  shows(open, 'wait', false);
  assert.match(open?.label ?? '', /Confirme ou cancele a revisão/);
  assert.match(open?.hint ?? '', /Confirmar revisão/);
  shows(imageFooterAction(image({ ...step, review: { kept: 4, drafting: 1 } })), 'wait', false);
  shows(imageFooterAction(image({ ...step, review: { kept: 5, drafting: 0 } })), 'deliver', true);
});

test('video script: approval is explicit, dirty edits save first, no mute states', () => {
  shows(videoFooterAction(video({ script: { available: false, promptPresent: false } })), 'wait', false);
  shows(videoFooterAction(video({ script: { available: false } })), 'prepare-script', true);
  shows(videoFooterAction(video({ script: { available: false }, agentBlocked: true })), 'prepare-script', false);
  shows(videoFooterAction(video({ script: { textAgentRunning: true } })), 'wait', false);
  shows(videoFooterAction(video({ busy: { approving: true }, storyboardReady: false })), 'wait', false);
  shows(videoFooterAction(video({ script: { invalid: true, dirty: true } })), 'wait', false);
  shows(videoFooterAction(video({ script: { dirty: true }, storyboardReady: false })), 'save-approve-script', true);
  const pending = videoFooterAction(video({ storyboardReady: false, script: { issuesCount: 2 } }));
  shows(pending, 'approve-script', true);
  assert.match(pending?.hint ?? '', /2 pendências/);
  shows(videoFooterAction(video()), 'continue', true);
});

test('video voice: gates cover silent, dirty, unapproved storyboard, missing, stray, manual and pending audio', () => {
  const at = (patch: Parameters<typeof video>[0]) => videoFooterAction(video({ step: 'voice', ...patch }));
  shows(at({ busy: { narrationGeneration: true } }), 'wait', false);
  shows(at({ voice: { loaded: false } }), 'wait', false);
  shows(at({ voice: { dirty: true, mode: 'silent' } }), 'save-voice', true);
  shows(at({ storyboardReady: false }), 'go-script', true);
  shows(at({ storyboardReady: false, voice: { mode: 'silent' } }), 'go-script', true);
  shows(at({ voice: { mode: 'silent' } }), 'continue', true);
  assert.equal(at({ voice: { mode: 'silent' } })?.label, 'Continuar sem narração');
  shows(at({ voice: { active: false } }), 'wait', false);
  shows(at({ voice: { strayScenes: 1 } }), 'wait', false);
  shows(at({ voice: { scenesMissingAudio: 3 } }), 'generate-audio', true);
  shows(at({ voice: { scenesMissingAudio: 3, anyManualAudio: true } }), 'wait', false);
  shows(at({ voice: { scenesMissingAudio: 3, elevenConfigured: false } }), 'wait', false);
  shows(at({ voice: { scenesMissingAudio: 3, voiceChosen: false } }), 'wait', false);
  shows(at({ voice: { audiosPendingApproval: 2 } }), 'approve-audio', true);
  shows(at({ narrationBlocked: true }), 'wait', false);
  shows(at({}), 'continue', true);
});

test('video render: first render, corrected render, FFprobe missing never offers a paid re-render', () => {
  const at = (patch: Parameters<typeof video>[0]) => videoFooterAction(video({ step: 'render', ...patch }));
  shows(at({ render: { rendering: true } }), 'wait', false);
  shows(at({ anyJobRunning: true }), 'wait', false);
  shows(at({ narrationBlocked: true }), 'wait', false);
  shows(at({ render: { audioCheckUnavailable: true } }), 'wait', false);
  shows(at({ storyboardReady: false, render: { hasRender: true } }), 'approve-render', true);
  shows(at({}), 'render', true);
  shows(at({ render: { hasRender: true } }), 'go-review', true);
  const corrected = at({ render: { hasRender: true }, videoRevisionRequested: true });
  shows(corrected, 'render', true);
  assert.equal(corrected?.label, 'Renderizar o vídeo corrigido');
});

test('video render: without an Opus-authored composition the only way forward is producing with Opus', () => {
  const at = (patch: Parameters<typeof video>[0]) => videoFooterAction(video({ step: 'render', compositionAuthored: false, ...patch }));
  shows(at({}), 'produce-video', true);
  shows(at({ storyboardReady: false }), 'produce-video', true);
  shows(at({ render: { hasRender: true }, videoRevisionRequested: true }), 'produce-video', true);
  shows(at({ agentBlocked: true }), 'produce-video', false);
  shows(at({ narrationBlocked: true }), 'wait', false);
});

test('video review: a render without Opus composition cannot be delivered', () => {
  shows(videoFooterAction(video({ step: 'review', compositionAuthored: false, render: { hasRender: true }, review: { latestApproved: true } })), 'go-render', true);
});

test('video review: outdated video or requested correction routes to render; approval of the latest delivers', () => {
  const at = (patch: Parameters<typeof video>[0]) => videoFooterAction(video({ step: 'review', render: { hasRender: true }, ...patch }));
  shows(at({ anyJobRunning: true }), 'wait', false);
  shows(at({ storyboardReady: false, review: { latestApproved: true } }), 'go-render', true);
  shows(at({ videoRevisionRequested: true }), 'go-render', true);
  shows(at({}), 'wait', false);
  shows(at({ review: { latestApproved: true } }), 'deliver', true);
  assert.equal(videoFooterAction(video({ step: 'export' })), undefined);
});

test('video brief matches image brief and never starts text generation', () => {
  shows(videoFooterAction(video({ step: 'brief', brief: { dirty: true } })), 'save-brief', true);
  shows(videoFooterAction(video({ step: 'brief', brief: { empty: true } })), 'wait', false);
});
