/**
 * Contrato do storyboard VideoGo v1 (`videogo.storyboard/v1`), escrito à mão: o Studio não depende de zod.
 *
 * Espelha `storyboardSchema` (objetos `.strict()`, enums, limites e padrões) e as regras de erro de
 * `validateStoryboardFile` em `../VideoGo/src/services/production/storyboard.ts`. Avisos do VideoGo não
 * são contrato. Existência de arquivos e caminhos ficam em `secureStoryboard`. Uso: sinal não bloqueante (ADR-032).
 *
 * Limitação: a regra de `spokenText` porta só `@handle` e `art.`, as conversões de `expandNumbers` que não
 * dependem de dígitos. Se narração ou fala tiver dígitos fora de tags, a comparação é pulada; o
 * `project validate` do VideoGo continua sendo a referência.
 */
export const STORYBOARD_SCHEMA = 'videogo.storyboard/v1';

/** Máximo de linhas de texto na tela por cena (`onScreen`). */
const STORYBOARD_ONSCREEN_MAX_ITEMS = 8;

type Dict = Record<string, unknown>;
type Issues = string[];

const SCENE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROFILE_REF = /^profile:[a-z0-9][a-z0-9-]{1,40}$/;
const ISO_DATE =
  /^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|02-(?:0[1-9]|1\d|2[0-8])))$/;
const STYLE_IDS = [
  'bold-poster',
  'corporate',
  'energetic',
  'elegant',
  'clean-editorial',
  'dynamic',
  'cinematic',
  'motion-kinetic',
  'motion-documentary',
  'studio-explainer',
  'studio-sculptural',
  'hybrid-cinematic',
];
const STATUSES = ['draft', 'ready'];
const FORMATS = ['reels', 'story', 'feed-square', 'youtube'];
const PURPOSES = ['hook', 'setup', 'context', 'explain', 'proof', 'turn', 'payoff', 'cta'];
const ENGINES = ['auto', 'hyperframes', 'motion', 'three-3d', 'remotion-3d'];
const VISUAL_KINDS = ['typography', 'diagram', '2d-motion', '3d', 'footage', 'image', 'mixed'];
const LAYOUTS = [
  'auto',
  'timeline',
  'evidence',
  'process',
  'statistics',
  'quote',
  'comparison',
  'cycle',
  'anatomy',
  'interface',
  'map',
  'equation',
  'none',
];
const CAMERAS = ['static', 'push-in', 'pull-out', 'pan-left', 'pan-right', 'orbit', 'tilt'];
const ANCHORS = ['start', 'end'];

const ROOT_KEYS = [
  'schema',
  'status',
  'id',
  'title',
  'language',
  'objective',
  'audience',
  'format',
  'style',
  'fps',
  'durationTargetSeconds',
  'tone',
  'cta',
  'scenes',
  'music',
  'soundDesign',
  'review',
  'composition',
];
const SCENE_KEYS = [
  'id',
  'title',
  'purpose',
  'engine',
  'targetSeconds',
  'narration',
  'onScreen',
  'visual',
  'audio',
  'sources',
];
const VISUAL_KEYS = [
  'kind',
  'direction',
  'layout',
  'camera',
  'assetPath',
  'footagePath',
  'compositionId',
  'imagePrompt',
  'inPoint',
  'outPoint',
];
const AUDIO_KEYS = ['narration', 'sfx', 'sfxCues', 'musicCue', 'voiceDirection', 'spokenText', 'sourceAudio'];
const VOICE_KEYS = ['assetPath', 'startOffsetSeconds', 'gain'];
const CUE_KEYS = ['asset', 'at', 'anchor', 'volume', 'note'];
const SOURCE_KEYS = ['claim', 'url', 'checkedAt'];
const MUSIC_KEYS = ['assetPath', 'volume', 'duckUnderVoice'];
const SOUND_KEYS = ['whooshes'];
const REVIEW_KEYS = ['factual', 'visual', 'audio'];

// Porte de `expandNumbers` (VideoGo `src/lib/numbers-pt.ts`) limitado ao que não depende de dígitos.
const TAG = /\[[^\]\n]{1,40}\]/g;
const TAG_SPLIT = /(\[[^\]\n]{1,40}\])/;
const HANDLE = /(^|[\s(])(@[A-Za-z0-9_.]*[A-Za-z0-9_])/g;
const ARTICLE = /\bart\.\s*/gi;
const SPOKEN_TOKEN = /\/[^/\n]+\/|[\p{L}\p{N}]+/gu;
const DIGIT = /[0-9]/;

/** Lista de problemas do storyboard; vazia quando o contrato é atendido. Caminhos em pt-BR (ex.: `scenes[0].visual.kind`). */
export function storyboardContractIssues(value: unknown): Issues {
  const issues: Issues = [];
  const root = objectOf(value, '', issues);
  if (!root) return issues;
  unknownKeys(root, ROOT_KEYS, '', issues);
  if (root.schema !== STORYBOARD_SCHEMA) {
    fail(issues, 'schema', present(root.schema) ? `esperado "${STORYBOARD_SCHEMA}"` : 'campo obrigatório');
  }
  choiceOf(root.status, STATUSES, 'status', issues);
  if (typeof root.id !== 'string' || !SCENE_ID.test(root.id)) {
    fail(issues, 'id', present(root.id) ? 'use minúsculas, números e hífens' : 'campo obrigatório');
  }
  textOf(root.title, 'title', issues, { required: true, nonEmpty: true });
  textOf(root.language, 'language', issues);
  textOf(root.objective, 'objective', issues, { required: true, nonEmpty: true });
  textOf(root.audience, 'audience', issues, { required: true, nonEmpty: true });
  choiceOf(root.format, FORMATS, 'format', issues, true);
  styleIssue(root.style, issues);
  if (present(root.fps) && root.fps !== 30) fail(issues, 'fps', 'esperado 30');
  numberOf(root.durationTargetSeconds, 'durationTargetSeconds', issues, {
    valid: n => n > 0 && n <= 14400,
    expected: 'número maior que zero e até 14400',
  });
  listOf(root.tone, 'tone', issues, { required: true, min: 1 }).forEach((tone, index) => {
    textOf(tone, at('tone', index), issues, { required: true, nonEmpty: true });
  });
  textOf(root.cta, 'cta', issues);
  const ids = new Set<string>();
  listOf(root.scenes, 'scenes', issues, { required: true, min: 1, max: 200 }).forEach((scene, index) => {
    sceneIssues(scene, at('scenes', index), issues, ids);
  });
  const music = objectOf(root.music, 'music', issues, false);
  if (music) {
    unknownKeys(music, MUSIC_KEYS, 'music', issues);
    textOf(music.assetPath, 'music.assetPath', issues);
    numberOf(music.volume, 'music.volume', issues, { valid: n => n >= 0 && n <= 1, expected: 'número entre 0 e 1' });
    flagOf(music.duckUnderVoice, 'music.duckUnderVoice', issues);
  }
  const sound = objectOf(root.soundDesign, 'soundDesign', issues, false);
  if (sound) {
    unknownKeys(sound, SOUND_KEYS, 'soundDesign', issues);
    flagOf(sound.whooshes, 'soundDesign.whooshes', issues);
  }
  const review = objectOf(root.review, 'review', issues, false);
  if (review) {
    unknownKeys(review, REVIEW_KEYS, 'review', issues);
    for (const key of REVIEW_KEYS) flagOf(review[key], `review.${key}`, issues);
  }
  const composition = objectOf(root.composition, 'composition', issues, false);
  if (composition) {
    unknownKeys(composition, ['path'], 'composition', issues);
    textOf(composition.path, 'composition.path', issues, { required: true, nonEmpty: true });
  }
  return issues;
}

function sceneIssues(value: unknown, path: string, issues: Issues, ids: Set<string>): void {
  const scene = objectOf(value, path, issues);
  if (!scene) return;
  unknownKeys(scene, SCENE_KEYS, path, issues);
  const idPath = at(path, 'id');
  if (typeof scene.id !== 'string' || !SCENE_ID.test(scene.id)) {
    fail(issues, idPath, present(scene.id) ? 'use minúsculas, números e hífens' : 'campo obrigatório');
  } else if (ids.has(scene.id)) {
    fail(issues, idPath, `id duplicado "${scene.id}"`);
  } else {
    ids.add(scene.id);
  }
  textOf(scene.title, at(path, 'title'), issues, { nonEmpty: true });
  choiceOf(scene.purpose, PURPOSES, at(path, 'purpose'), issues, true);
  choiceOf(scene.engine, ENGINES, at(path, 'engine'), issues);
  numberOf(scene.targetSeconds, at(path, 'targetSeconds'), issues, {
    valid: n => n > 0 && n <= 900,
    expected: 'número maior que zero e até 900',
    required: true,
  });
  textOf(scene.narration, at(path, 'narration'), issues);
  const onScreenPath = at(path, 'onScreen');
  listOf(scene.onScreen, onScreenPath, issues, { max: STORYBOARD_ONSCREEN_MAX_ITEMS }).forEach((line, index) => {
    textOf(line, at(onScreenPath, index), issues, { required: true, nonEmpty: true });
  });
  const visualPath = at(path, 'visual');
  const visual = objectOf(scene.visual, visualPath, issues);
  if (visual) {
    visualIssues(visual, visualPath, issues);
    const engine = scene.engine ?? 'auto';
    if ((engine === 'remotion-3d' || engine === 'three-3d') && !visual.compositionId) {
      fail(issues, visualPath, `engine ${engine} exige compositionId`);
    }
    if (engine === 'motion' && !visual.footagePath) {
      fail(issues, visualPath, 'engine motion exige footagePath');
    }
    if (visual.kind === 'footage' && !visual.footagePath) {
      fail(issues, visualPath, 'kind footage exige footagePath');
    }
    if (visual.kind === 'image' && !visual.assetPath) {
      fail(issues, visualPath, 'kind image exige assetPath');
    }
  }
  const audioPath = at(path, 'audio');
  const audio = objectOf(scene.audio, audioPath, issues, false);
  if (audio) {
    audioIssues(audio, audioPath, issues, { targetSeconds: scene.targetSeconds, narration: scene.narration });
  }
  const sourcesPath = at(path, 'sources');
  listOf(scene.sources, sourcesPath, issues).forEach((source, index) => {
    sourceIssues(source, at(sourcesPath, index), issues);
  });
}

function visualIssues(visual: Dict, path: string, issues: Issues): void {
  unknownKeys(visual, VISUAL_KEYS, path, issues);
  choiceOf(visual.kind, VISUAL_KINDS, at(path, 'kind'), issues, true);
  textOf(visual.direction, at(path, 'direction'), issues, { required: true, nonEmpty: true });
  choiceOf(visual.layout, LAYOUTS, at(path, 'layout'), issues);
  choiceOf(visual.camera, CAMERAS, at(path, 'camera'), issues);
  for (const key of ['assetPath', 'footagePath', 'compositionId', 'imagePrompt']) {
    textOf(visual[key], at(path, key), issues);
  }
  numberOf(visual.inPoint, at(path, 'inPoint'), issues, { valid: n => n >= 0, expected: 'número não negativo' });
  numberOf(visual.outPoint, at(path, 'outPoint'), issues, { valid: n => n > 0, expected: 'número maior que zero' });
  if (typeof visual.inPoint === 'number' && typeof visual.outPoint === 'number' && visual.outPoint <= visual.inPoint) {
    fail(issues, at(path, 'outPoint'), 'precisa ser maior que inPoint');
  }
}

function audioIssues(
  audio: Dict,
  path: string,
  issues: Issues,
  scene: { targetSeconds: unknown; narration: unknown },
): void {
  unknownKeys(audio, AUDIO_KEYS, path, issues);
  const voicePath = at(path, 'narration');
  const voice = objectOf(audio.narration, voicePath, issues, false);
  if (voice) {
    unknownKeys(voice, VOICE_KEYS, voicePath, issues);
    textOf(voice.assetPath, at(voicePath, 'assetPath'), issues, { required: true, nonEmpty: true });
    numberOf(voice.startOffsetSeconds, at(voicePath, 'startOffsetSeconds'), issues, {
      valid: n => n >= 0,
      expected: 'número não negativo',
    });
    numberOf(voice.gain, at(voicePath, 'gain'), issues, { valid: n => n >= 0 && n <= 1, expected: 'número entre 0 e 1' });
  }
  const sfxPath = at(path, 'sfx');
  listOf(audio.sfx, sfxPath, issues).forEach((sound, index) => {
    textOf(sound, at(sfxPath, index), issues, { required: true, nonEmpty: true });
  });
  const cuesPath = at(path, 'sfxCues');
  listOf(audio.sfxCues, cuesPath, issues).forEach((cue, index) => {
    cueIssues(cue, at(cuesPath, index), issues, scene.targetSeconds);
  });
  textOf(audio.musicCue, at(path, 'musicCue'), issues);
  textOf(audio.voiceDirection, at(path, 'voiceDirection'), issues);
  textOf(audio.spokenText, at(path, 'spokenText'), issues);
  flagOf(audio.sourceAudio, at(path, 'sourceAudio'), issues);
  spokenIssue(audio.spokenText, scene.narration, at(path, 'spokenText'), issues);
}

function cueIssues(value: unknown, path: string, issues: Issues, targetSeconds: unknown): void {
  const cue = objectOf(value, path, issues);
  if (!cue) return;
  unknownKeys(cue, CUE_KEYS, path, issues);
  textOf(cue.asset, at(path, 'asset'), issues, { required: true, nonEmpty: true });
  numberOf(cue.at, at(path, 'at'), issues, { valid: n => n >= 0, expected: 'número não negativo', required: true });
  choiceOf(cue.anchor, ANCHORS, at(path, 'anchor'), issues);
  numberOf(cue.volume, at(path, 'volume'), issues, { valid: n => n >= 0 && n <= 1, expected: 'número entre 0 e 1' });
  textOf(cue.note, at(path, 'note'), issues);
  const anchor = cue.anchor ?? 'start';
  if (anchor === 'start' && typeof cue.at === 'number' && typeof targetSeconds === 'number' && cue.at >= targetSeconds) {
    fail(issues, path, `começa em ${cue.at}s, no fim da cena (${targetSeconds}s)`);
  }
}

function sourceIssues(value: unknown, path: string, issues: Issues): void {
  const source = objectOf(value, path, issues);
  if (!source) return;
  unknownKeys(source, SOURCE_KEYS, path, issues);
  textOf(source.claim, at(path, 'claim'), issues, { required: true, nonEmpty: true });
  if (!present(source.url)) {
    fail(issues, at(path, 'url'), 'campo obrigatório');
  } else if (typeof source.url !== 'string' || !isAbsoluteUrl(source.url)) {
    fail(issues, at(path, 'url'), 'esperado URL absoluta');
  }
  if (present(source.checkedAt) && (typeof source.checkedAt !== 'string' || !ISO_DATE.test(source.checkedAt))) {
    fail(issues, at(path, 'checkedAt'), 'esperada data AAAA-MM-DD existente');
  }
}

function styleIssue(value: unknown, issues: Issues): void {
  if (!present(value)) return;
  const valid =
    typeof value === 'string' && (value === 'auto' || STYLE_IDS.includes(value) || PROFILE_REF.test(value));
  if (!valid) fail(issues, 'style', 'use auto, um estilo do VideoGo ou profile:<id>');
}

/** Regra 5 do VideoGo: `spokenText` e `narration` precisam dizer as mesmas palavras (tags podem diferir). */
function spokenIssue(spokenText: unknown, narration: unknown, path: string, issues: Issues): void {
  if (typeof spokenText !== 'string' || typeof narration !== 'string') return;
  const spoken = spokenText.trim();
  const script = narration.trim();
  if (!spoken || !script) return;
  if (hasDigitsOutsideTags(spoken) || hasDigitsOutsideTags(script)) return;
  if (!sameSpokenWords(spoken, script)) {
    fail(issues, path, 'precisa dizer as mesmas palavras de narration (só [tags] podem diferir)');
  }
}

function isAbsoluteUrl(value: string): boolean {
  try {
    return Boolean(new URL(value));
  } catch {
    return false;
  }
}

function hasDigitsOutsideTags(value: string): boolean {
  return DIGIT.test(value.replace(TAG, ''));
}

/** Porta de `stripAudioTags` do VideoGo (`src/services/production/narration.ts`). */
function stripTags(value: string): string {
  return value
    .replace(TAG, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.!?;:])/g, '$1')
    .trim();
}

/** Porta de `expandNumbers` restrita a `@handle` e `art.`; cada parte fora de tag é tratada separadamente. */
function expandWithoutDigits(value: string): string {
  return value
    .split(TAG_SPLIT)
    .map(part => (part.startsWith('[') && part.endsWith(']') ? part : expandPlainWords(part)))
    .join('');
}

function expandPlainWords(value: string): string {
  return value
    .replace(HANDLE, (_match: string, lead: string, handle: string) => `${lead}${handleToWords(handle)}`)
    .replace(ARTICLE, 'artigo ');
}

function handleToWords(handle: string): string {
  return `arroba ${handle.slice(1).replace(/\./g, ' ponto ').replace(/_/g, ' underline ')}`;
}

function spokenTokens(value: string): string[] {
  return stripTags(expandWithoutDigits(value)).toLowerCase().match(SPOKEN_TOKEN) ?? [];
}

const isIpa = (token: string): boolean => token.startsWith('/') && token.endsWith('/');

/** Porta de `sameSpokenWords` (VideoGo): transcrição IPA casa com um ou mais tokens do roteiro. */
function sameSpokenWords(spoken: string, script: string): boolean {
  const left = spokenTokens(spoken);
  const right = spokenTokens(script);
  const memo = new Map<string, boolean>();
  const match = (i: number, j: number): boolean => {
    const key = `${i}:${j}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (i === left.length || j === right.length) return i === left.length && j === right.length;
    const leftIpa = isIpa(left[i]);
    const rightIpa = isIpa(right[j]);
    let result = false;
    if (leftIpa && rightIpa) {
      result = match(i + 1, j + 1);
    } else if (leftIpa) {
      for (let end = j + 1; end <= right.length && !result; end++) result = match(i + 1, end);
    } else if (rightIpa) {
      for (let end = i + 1; end <= left.length && !result; end++) result = match(end, j + 1);
    } else {
      result = left[i] === right[j] && match(i + 1, j + 1);
    }
    memo.set(key, result);
    return result;
  };
  return match(0, 0);
}

function objectOf(value: unknown, path: string, issues: Issues, required = true): Dict | undefined {
  if (isDict(value)) return value;
  if (value === undefined) {
    if (required) fail(issues, path, 'campo obrigatório');
    return undefined;
  }
  fail(issues, path, 'esperado objeto');
  return undefined;
}

function unknownKeys(value: Dict, allowed: readonly string[], path: string, issues: Issues): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(issues, at(path, key), 'campo não previsto no contrato');
  }
}

function textOf(
  value: unknown,
  path: string,
  issues: Issues,
  rule: { required?: boolean; nonEmpty?: boolean } = {},
): void {
  if (value === undefined) {
    if (rule.required) fail(issues, path, 'campo obrigatório');
    return;
  }
  if (typeof value !== 'string') fail(issues, path, 'esperado texto');
  else if (rule.nonEmpty && value.trim() === '') fail(issues, path, 'não pode ficar vazio');
}

function choiceOf(value: unknown, options: readonly string[], path: string, issues: Issues, required = false): void {
  if (value === undefined) {
    if (required) fail(issues, path, 'campo obrigatório');
    return;
  }
  if (typeof value !== 'string' || !options.includes(value)) {
    fail(issues, path, `use um destes valores: ${options.join(', ')}`);
  }
}

function numberOf(
  value: unknown,
  path: string,
  issues: Issues,
  rule: { valid: (n: number) => boolean; expected: string; required?: boolean },
): void {
  if (value === undefined) {
    if (rule.required) fail(issues, path, 'campo obrigatório');
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || !rule.valid(value)) {
    fail(issues, path, `esperado ${rule.expected}`);
  }
}

function listOf(
  value: unknown,
  path: string,
  issues: Issues,
  rule: { required?: boolean; min?: number; max?: number } = {},
): unknown[] {
  if (value === undefined) {
    if (rule.required) fail(issues, path, 'campo obrigatório');
    return [];
  }
  if (!Array.isArray(value)) {
    fail(issues, path, 'esperado lista');
    return [];
  }
  if (rule.min !== undefined && value.length < rule.min) {
    fail(issues, path, `precisa de pelo menos ${rule.min} item(ns)`);
  }
  if (rule.max !== undefined && value.length > rule.max) {
    fail(issues, path, `aceita no máximo ${rule.max} item(ns)`);
  }
  return value;
}

function flagOf(value: unknown, path: string, issues: Issues): void {
  if (value !== undefined && typeof value !== 'boolean') fail(issues, path, 'esperado verdadeiro ou falso');
}

function present(value: unknown): boolean {
  return value !== undefined;
}

function isDict(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function at(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  return path ? `${path}.${key}` : key;
}

function fail(issues: Issues, path: string, message: string): void {
  issues.push(`${path || 'storyboard'}: ${message}`);
}
