import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeStoryboard } from '../src/main/content/native.js';
import { storyboardContractIssues } from '../src/shared/storyboard-contract.js';

test('sanitizeStoryboard strips unrecognized root keys, normalizes enums and string sources', () => {
  const corrupted: Record<string, unknown> = {
    schema: 'videogo.storyboard/v1',
    status: 'draft',
    id: 'video-test',
    title: 'Vídeo teste',
    language: 'pt-BR',
    objective: 'Objetivo',
    audience: 'Público',
    format: 'reels',
    fps: 30,
    tone: ['claro'],
    canvas: { width: 1080, height: 1920 },
    brand: { name: 'Marca' },
    briefing: { theme: 'Tema' },
    rights: { music: 'pendente' },
    scenes: [
      {
        id: 'scene-1',
        purpose: 'hook',
        engine: 'auto',
        targetSeconds: 3,
        narration: 'Texto',
        onScreen: ['Texto'],
        visual: {
          kind: 'typography',
          direction: 'Direção',
          layout: 'center-stack',
          camera: 'slow-push-in',
        },
        audio: { sfx: [], sfxCues: [], sourceAudio: false },
        sources: [],
      },
      {
        id: 'scene-2',
        purpose: 'development',
        engine: 'auto',
        targetSeconds: 5,
        narration: 'Texto 2',
        onScreen: ['Texto 2'],
        visual: {
          kind: 'typography',
          direction: 'Direção 2',
          layout: 'title-diagram',
          camera: 'slow-pan-up',
        },
        audio: { sfx: [], sfxCues: [], sourceAudio: false },
        sources: ['claim-1'],
      },
      {
        id: 'scene-3',
        purpose: 'conclusion-cta',
        engine: 'auto',
        targetSeconds: 4,
        narration: 'Texto 3',
        onScreen: ['Texto 3'],
        visual: {
          kind: 'typography',
          direction: 'Direção 3',
          layout: 'closing-cta-logo',
          camera: 'static',
        },
        audio: { sfx: [], sfxCues: [], sourceAudio: false },
        sources: [{ claim: 'Fonte oficial', url: 'https://gov.br/lei' }],
      },
    ],
  };

  const { sanitized, changed } = sanitizeStoryboard(corrupted);
  assert.equal(changed, true);

  // Unrecognized root keys must be stripped
  assert.equal('canvas' in sanitized, false);
  assert.equal('brand' in sanitized, false);
  assert.equal('briefing' in sanitized, false);
  assert.equal('rights' in sanitized, false);

  const scenes = sanitized.scenes as Array<Record<string, unknown>>;
  assert.equal(scenes.length, 3);

  // Scene 1
  const v1 = scenes[0]!.visual as Record<string, unknown>;
  assert.equal(v1.layout, 'none');
  assert.equal(v1.camera, 'push-in');

  // Scene 2
  assert.equal(scenes[1]!.purpose, 'explain');
  const v2 = scenes[1]!.visual as Record<string, unknown>;
  assert.equal(v2.layout, 'evidence');
  assert.equal(v2.camera, 'tilt');
  assert.deepEqual(scenes[1]!.sources, []);

  // Scene 3
  assert.equal(scenes[2]!.purpose, 'cta');
  const v3 = scenes[2]!.visual as Record<string, unknown>;
  assert.equal(v3.layout, 'none');
  const s3 = scenes[2]!.sources as Array<Record<string, unknown>>;
  assert.equal(s3.length, 1);
  assert.equal(s3[0]!.claim, 'Fonte oficial');

  // Sanitized output must satisfy the VideoGo storyboard contract without issues
  const issues = storyboardContractIssues(sanitized);
  assert.deepEqual(issues, []);
});

test('sanitizeStoryboard sanitizes sfxCues with unrecognized sound key, moves note to sfx, and strips invalid audio/root keys', () => {
  const raw: Record<string, unknown> = {
    schema: 'videogo.storyboard/v1',
    status: 'draft',
    id: 'video-sfx-test',
    title: 'Vídeo teste SFX',
    language: 'pt-BR',
    objective: 'Objetivo',
    audience: 'Público',
    format: 'reels',
    fps: 30,
    tone: ['claro'],
    music: { volume: 0.2, duckUnderVoice: true, extraKey: 'ignored' },
    soundDesign: { whooshes: true, extra: 'bad' },
    review: { factual: false, visual: false, audio: false, other: 123 },
    scenes: [
      {
        id: 'scene-1',
        purpose: 'hook',
        engine: 'auto',
        targetSeconds: 4,
        narration: 'Texto da fala',
        onScreen: ['Texto'],
        visual: {
          kind: 'typography',
          direction: 'Direção',
          layout: 'none',
          camera: 'push-in',
        },
        audio: {
          spokenText: 'Texto da fala',
          sfx: ['kick'],
          sfxCues: [
            { at: 0, sound: 'kick' },
            { at: 1.5, sound: 'tick' },
            { asset: 'assets/audio/sfx/whoosh.wav', sound: 'whoosh', at: 0.5, volume: 0.8 },
          ],
          sourceAudio: false,
          extraAudioField: 'drop-me',
        },
        sources: [],
      },
    ],
  };

  const { sanitized, changed } = sanitizeStoryboard(raw);
  assert.equal(changed, true);

  const scenes = sanitized.scenes as Array<Record<string, unknown>>;
  const audio = scenes[0]!.audio as Record<string, unknown>;

  // extraAudioField stripped
  assert.equal('extraAudioField' in audio, false);

  // sound notes from invalid cues preserved in audio.sfx
  const sfx = audio.sfx as string[];
  assert.ok(sfx.includes('kick'));
  assert.ok(sfx.includes('tick'));

  // Invalid cues (lacking asset) dropped; valid cue preserved with note mapped from sound
  const cues = audio.sfxCues as Array<Record<string, unknown>>;
  assert.equal(cues.length, 1);
  assert.equal(cues[0]!.asset, 'assets/audio/sfx/whoosh.wav');
  assert.equal(cues[0]!.at, 0.5);
  assert.equal(cues[0]!.volume, 0.8);
  assert.equal(cues[0]!.note, 'whoosh');
  assert.equal('sound' in cues[0]!, false);

  // Root music, soundDesign and review cleaned
  const music = sanitized.music as Record<string, unknown>;
  assert.equal('extraKey' in music, false);
  assert.equal(music.volume, 0.2);
  assert.equal(music.duckUnderVoice, true);

  const soundDesign = sanitized.soundDesign as Record<string, unknown>;
  assert.deepEqual(soundDesign, { whooshes: true });

  const review = sanitized.review as Record<string, unknown>;
  assert.deepEqual(review, { factual: false, visual: false, audio: false });

  // Passes contract
  const issues = storyboardContractIssues(sanitized);
  assert.deepEqual(issues, []);
});
