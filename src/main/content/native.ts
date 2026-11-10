import { lstat } from 'node:fs/promises';
import { basename, join, relative, isAbsolute } from 'node:path';
import type { Brand, Project } from '../../shared/contracts.js';
import { POSTNOW_FORMATS, isPostNowFormat } from '../../shared/formats.js';
import { atomicJson, atomicText, directory, localPath, missing, object, readJson, safePath } from './storage.js';

export interface StoryboardSourceScene {
  title?: string;
  narration?: string;
  spokenText?: string;
  onScreen?: string[];
  purpose?: string;
  targetSeconds?: number;
}

export function storyboard(project: Project, images: string[] = [], sourceScenes: StoryboardSourceScene[] = []): Record<string, unknown> {
  const format = project.format === 'story' || project.format === 'feed-square' || project.format === 'youtube' ? project.format : 'reels';
  const scenesList = images.length ? images : [''];
  const scenes = scenesList.map((image, index) => {
    const src = sourceScenes[index];
    const narration = src?.narration ?? '';
    const spokenText = src?.spokenText ?? narration;
    const words = (spokenText || narration).split(/\s+/).filter(Boolean).length;
    const targetSeconds = src?.targetSeconds || (words > 0 ? Math.max(4, Math.min(25, Math.ceil(words / 2.3))) : 5);
    const purpose = src?.purpose || (index === 0 ? 'hook' : index === scenesList.length - 1 ? 'cta' : 'explain');
    const onScreen = src?.onScreen || [];
    const title = src?.title || (index === 0 ? 'Abertura' : index === scenesList.length - 1 ? 'Encerramento' : `Cena ${index + 1}`);

    return {
      id: `scene-${index + 1}`,
      title,
      purpose,
      engine: 'auto',
      targetSeconds,
      narration,
      onScreen,
      visual: {
        kind: image ? 'image' : 'typography',
        direction: image
          ? 'Animar a imagem com movimento de câmera suave, sem adicionar títulos ou texto por cima; preservar a arte original.'
          : 'Definir a direção visual com a pessoa antes de produzir.',
        layout: 'none',
        camera: image ? 'push-in' : 'static',
        ...(image ? { assetPath: image } : {})
      },
      audio: {
        sfx: [],
        sfxCues: [],
        sourceAudio: false,
        ...(spokenText ? { spokenText } : {})
      },
      sources: [],
    };
  });

  const totalDuration = scenes.reduce((acc, s) => acc + (s.targetSeconds || 5), 0);

  return {
    schema: 'videogo.storyboard/v1',
    status: images.length ? 'ready' : 'draft',
    id: basename(project.path),
    title: project.title,
    language: 'pt-BR',
    objective: project.brief || project.title,
    audience: 'Conforme planning/brief.md',
    format,
    style: 'auto',
    fps: 30,
    durationTargetSeconds: totalDuration || Math.max(images.length, 1) * 5,
    tone: ['claro'],
    scenes,
    soundDesign: { whooshes: false },
    review: { factual: false, visual: false, audio: false },
  };
}
const VALID_PURPOSES: Record<string, true> = { hook: true, setup: true, context: true, explain: true, proof: true, turn: true, payoff: true, cta: true };
const PURPOSE_MAP: Record<string, string> = {
  development: 'explain',
  'conclusion-cta': 'cta',
  conclusion: 'payoff',
  intro: 'hook',
  call_to_action: 'cta',
};
const VALID_LAYOUTS: Record<string, true> = {
  auto: true, timeline: true, evidence: true, process: true, statistics: true, quote: true,
  comparison: true, cycle: true, anatomy: true, interface: true, map: true, equation: true, none: true,
};
const LAYOUT_MAP: Record<string, string> = {
  'center-stack': 'none',
  'title-diagram': 'evidence',
  'list-cards': 'process',
  'stepped-list': 'process',
  'closing-cta-logo': 'none',
  cards: 'process',
  stack: 'none',
  diagram: 'evidence',
  list: 'process',
};
const VALID_CAMERAS: Record<string, true> = { static: true, 'push-in': true, 'pull-out': true, 'pan-left': true, 'pan-right': true, orbit: true, tilt: true };
const CAMERA_MAP: Record<string, string> = {
  'slow-push-in': 'push-in',
  'slow-pan-up': 'tilt',
  'slow-pan-left': 'pan-left',
  'slow-pan-right': 'pan-right',
  'pan-up': 'tilt',
  'pan-down': 'tilt',
  zoom: 'push-in',
};
const VALID_ROOT_KEYS: Record<string, true> = {
  schema: true, status: true, id: true, title: true, language: true, objective: true, audience: true,
  format: true, style: true, fps: true, durationTargetSeconds: true, tone: true, cta: true, scenes: true,
  music: true, soundDesign: true, review: true, composition: true,
};
const VALID_SCENE_KEYS: Record<string, true> = {
  id: true, title: true, purpose: true, engine: true, targetSeconds: true, narration: true,
  onScreen: true, visual: true, audio: true, sources: true,
};
const VALID_VISUAL_KEYS: Record<string, true> = {
  kind: true, direction: true, layout: true, camera: true, assetPath: true, footagePath: true,
  inPoint: true, outPoint: true, compositionId: true, imagePrompt: true,
};
const VALID_AUDIO_KEYS: Record<string, true> = {
  narration: true,
  sfx: true,
  sfxCues: true,
  musicCue: true,
  voiceDirection: true,
  spokenText: true,
  sourceAudio: true,
};
const VALID_CUE_KEYS: Record<string, true> = {
  asset: true,
  at: true,
  anchor: true,
  volume: true,
  note: true,
};

export function sanitizeStoryboard(raw: Record<string, unknown>): { sanitized: Record<string, unknown>; changed: boolean } {
  let changed = false;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (VALID_ROOT_KEYS[key]) {
      result[key] = value;
    } else {
      changed = true;
    }
  }

  if (Array.isArray(result.scenes)) {
    result.scenes = result.scenes.map((item, index) => {
      if (typeof item !== 'object' || item === null) return item;
      const scene: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(item as Record<string, unknown>)) {
        if (VALID_SCENE_KEYS[key]) {
          scene[key] = val;
        } else {
          changed = true;
        }
      }

      const currentPurpose = typeof scene.purpose === 'string' ? scene.purpose.trim() : '';
      if (!VALID_PURPOSES[currentPurpose]) {
        scene.purpose = PURPOSE_MAP[currentPurpose] ?? (index === 0 ? 'hook' : 'context');
        changed = true;
      }

      if (typeof scene.visual === 'object' && scene.visual !== null) {
        const visual: Record<string, unknown> = {};
        for (const [vKey, vVal] of Object.entries(scene.visual as Record<string, unknown>)) {
          if (VALID_VISUAL_KEYS[vKey]) visual[vKey] = vVal;
          else changed = true;
        }
        const currentLayout = typeof visual.layout === 'string' ? visual.layout.trim() : 'auto';
        if (!VALID_LAYOUTS[currentLayout]) {
          visual.layout = LAYOUT_MAP[currentLayout] ?? 'auto';
          changed = true;
        }
        if (visual.camera !== undefined) {
          const currentCam = typeof visual.camera === 'string' ? visual.camera.trim() : '';
          if (VALID_CAMERAS[currentCam]) {
            visual.camera = currentCam;
          } else if (CAMERA_MAP[currentCam]) {
            visual.camera = CAMERA_MAP[currentCam];
            changed = true;
          } else {
            delete visual.camera;
            changed = true;
          }
        }
        scene.visual = visual;
      }

      if (Array.isArray(scene.sources)) {
        const cleanSources: Array<Record<string, unknown>> = [];
        for (const s of scene.sources) {
          if (typeof s === 'object' && s !== null && 'claim' in s && 'url' in s && typeof s.claim === 'string' && typeof s.url === 'string') {
            try {
              new URL(s.url);
              cleanSources.push(s as Record<string, unknown>);
            } catch {
              changed = true;
            }
          } else {
            changed = true;
          }
        }
        scene.sources = cleanSources;
      } else {
        scene.sources = [];
        changed = true;
      }

      if (typeof scene.audio === 'object' && scene.audio !== null) {
        const rawAudio = scene.audio as Record<string, unknown>;
        const audio: Record<string, unknown> = {};

        for (const [aKey] of Object.entries(rawAudio)) {
          if (!VALID_AUDIO_KEYS[aKey]) changed = true;
        }

        const sfxSet = new Set<string>();
        if (Array.isArray(rawAudio.sfx)) {
          for (const sfxItem of rawAudio.sfx) {
            if (typeof sfxItem === 'string' && sfxItem.trim()) sfxSet.add(sfxItem.trim());
            else changed = true;
          }
        } else if (rawAudio.sfx !== undefined) {
          changed = true;
        }

        const cleanCues: Array<Record<string, unknown>> = [];
        if (Array.isArray(rawAudio.sfxCues)) {
          for (const cueItem of rawAudio.sfxCues) {
            if (typeof cueItem === 'object' && cueItem !== null) {
              const cueRecord = cueItem as Record<string, unknown>;
              const sound = typeof cueRecord.sound === 'string' ? cueRecord.sound.trim() : undefined;
              const effect = typeof cueRecord.effect === 'string' ? cueRecord.effect.trim() : undefined;
              if (sound) sfxSet.add(sound);
              if (effect) sfxSet.add(effect);

              const asset = typeof cueRecord.asset === 'string' ? cueRecord.asset.trim() : '';
              if (asset) {
                const cleanCue: Record<string, unknown> = { asset };
                for (const [cKey] of Object.entries(cueRecord)) {
                  if (!VALID_CUE_KEYS[cKey]) changed = true;
                }
                const at = typeof cueRecord.at === 'number' && Number.isFinite(cueRecord.at) && cueRecord.at >= 0 ? cueRecord.at : 0;
                if (cueRecord.at !== at) changed = true;
                cleanCue.at = at;

                if (cueRecord.anchor === 'end') {
                  cleanCue.anchor = 'end';
                } else if (cueRecord.anchor !== undefined && cueRecord.anchor !== 'start') {
                  changed = true;
                }

                if (typeof cueRecord.volume === 'number' && Number.isFinite(cueRecord.volume)) {
                  const vol = Math.max(0, Math.min(1, cueRecord.volume));
                  if (vol !== cueRecord.volume) changed = true;
                  cleanCue.volume = vol;
                } else if (cueRecord.volume !== undefined) {
                  changed = true;
                }

                const note = typeof cueRecord.note === 'string' ? cueRecord.note.trim() : (sound || effect || undefined);
                if (note) cleanCue.note = note;

                cleanCues.push(cleanCue);
              } else {
                changed = true;
              }
            } else {
              changed = true;
            }
          }
        } else if (rawAudio.sfxCues !== undefined) {
          changed = true;
        }

        audio.sfx = Array.from(sfxSet);
        audio.sfxCues = cleanCues;
        audio.sourceAudio = Boolean(rawAudio.sourceAudio);
        if (rawAudio.sourceAudio !== undefined && typeof rawAudio.sourceAudio !== 'boolean') changed = true;

        if (typeof rawAudio.narration === 'object' && rawAudio.narration !== null) {
          const narr = rawAudio.narration as Record<string, unknown>;
          if (typeof narr.assetPath === 'string' && narr.assetPath.trim()) {
            const cleanNarr: Record<string, unknown> = { assetPath: narr.assetPath.trim() };
            if (typeof narr.startOffsetSeconds === 'number' && Number.isFinite(narr.startOffsetSeconds) && narr.startOffsetSeconds >= 0) {
              cleanNarr.startOffsetSeconds = narr.startOffsetSeconds;
            } else if (narr.startOffsetSeconds !== undefined) {
              changed = true;
            }
            if (typeof narr.gain === 'number' && Number.isFinite(narr.gain) && narr.gain >= 0 && narr.gain <= 1) {
              cleanNarr.gain = narr.gain;
            } else if (narr.gain !== undefined) {
              changed = true;
            }
            for (const [nKey] of Object.entries(narr)) {
              if (nKey !== 'assetPath' && nKey !== 'startOffsetSeconds' && nKey !== 'gain') changed = true;
            }
            audio.narration = cleanNarr;
          } else {
            changed = true;
          }
        } else if (rawAudio.narration !== undefined) {
          changed = true;
        }

        if (typeof rawAudio.spokenText === 'string') {
          audio.spokenText = rawAudio.spokenText;
        } else if (rawAudio.spokenText !== undefined) {
          changed = true;
        }

        if (typeof rawAudio.voiceDirection === 'string' && rawAudio.voiceDirection.trim()) {
          audio.voiceDirection = rawAudio.voiceDirection.trim();
        } else if (rawAudio.voiceDirection !== undefined) {
          changed = true;
        }

        if (typeof rawAudio.musicCue === 'string' && rawAudio.musicCue.trim()) {
          audio.musicCue = rawAudio.musicCue.trim();
        } else if (rawAudio.musicCue !== undefined) {
          changed = true;
        }

        scene.audio = audio;
      } else {
        scene.audio = { sfx: [], sfxCues: [], sourceAudio: false };
        changed = true;
      }

      return scene;
    });
  }

  if (result.music !== undefined) {
    if (typeof result.music === 'object' && result.music !== null) {
      const rawMusic = result.music as Record<string, unknown>;
      const music: Record<string, unknown> = {};
      for (const [mKey] of Object.entries(rawMusic)) {
        if (mKey !== 'assetPath' && mKey !== 'volume' && mKey !== 'duckUnderVoice') changed = true;
      }
      if (typeof rawMusic.assetPath === 'string' && rawMusic.assetPath.trim()) {
        music.assetPath = rawMusic.assetPath.trim();
      }
      if (typeof rawMusic.volume === 'number' && Number.isFinite(rawMusic.volume) && rawMusic.volume >= 0 && rawMusic.volume <= 1) {
        music.volume = rawMusic.volume;
      } else if (rawMusic.volume !== undefined) {
        music.volume = 0.15;
        changed = true;
      } else {
        music.volume = 0.15;
      }
      music.duckUnderVoice = rawMusic.duckUnderVoice === undefined ? true : Boolean(rawMusic.duckUnderVoice);
      if (rawMusic.duckUnderVoice !== undefined && typeof rawMusic.duckUnderVoice !== 'boolean') changed = true;
      result.music = music;
    } else {
      delete result.music;
      changed = true;
    }
  }

  if (result.soundDesign !== undefined) {
    if (typeof result.soundDesign === 'object' && result.soundDesign !== null) {
      const rawSd = result.soundDesign as Record<string, unknown>;
      for (const [sdKey] of Object.entries(rawSd)) {
        if (sdKey !== 'whooshes') changed = true;
      }
      result.soundDesign = { whooshes: Boolean(rawSd.whooshes) };
    } else {
      result.soundDesign = { whooshes: false };
      changed = true;
    }
  }

  if (result.review !== undefined) {
    if (typeof result.review === 'object' && result.review !== null) {
      const rawRev = result.review as Record<string, unknown>;
      for (const [rKey] of Object.entries(rawRev)) {
        if (rKey !== 'factual' && rKey !== 'visual' && rKey !== 'audio') changed = true;
      }
      result.review = {
        factual: Boolean(rawRev.factual),
        visual: Boolean(rawRev.visual),
        audio: Boolean(rawRev.audio),
      };
    } else {
      result.review = { factual: false, visual: false, audio: false };
      changed = true;
    }
  }

  return { sanitized: result, changed };
}

/** Briefing points still undefined: audience only when the text lacks it; format only when the project has none. */
function pendingBriefPoints(project: Project): string {
  const points = [
    ...(/^Público:\s*\S/m.test(project.brief) ? [] : ['público']),
    'fontes', 'direitos', 'voz', 'música',
    ...(project.format ? [] : ['formato']),
    'aprovador',
  ];
  const last = points.pop();
  return `${points.join(', ')} e ${last}`;
}

/** Portable documents mirror the engines' native draft formats; no provider is called. */
export async function initializeNative(project: Project, brand?: Brand, requestedPages?: number): Promise<void> {
  if (project.kind === 'video') {
    for (const folder of ['planning/sources', 'assets/visuals/generated', 'assets/footage/selected', 'assets/audio', 'production', 'renders/review', 'renders/final', 'qa', 'deliverables']) await directory(project.path, folder);
    await atomicJson(join(project.path, 'storyboard.json'), storyboard(project));
    await atomicText(join(project.path, 'planning/request.md'), `${project.brief || project.title}\n`);
    await atomicText(join(project.path, 'planning/brief.md'), `# ${project.title}\n\n${project.brief}\n\nAntes da produção, confirme com a pessoa responsável os pontos que este briefing não define: ${pendingBriefPoints(project)}.\n`);
  } else {
    for (const folder of ['prompts', 'generated', 'qa', 'package', 'research']) await directory(project.path, folder);
    if (!isPostNowFormat(project.format)) throw new Error('Formato PostNow ausente ou removido; escolha outro formato.');
    const format = project.format;
    const kind = POSTNOW_FORMATS[format].kind;
    const pageCount = kind === 'carousel' ? requestedPages ?? 5 : 1;
    const pages = Array.from({ length: pageCount }, (_, index) => ({
      page: index + 1,
      role: kind === 'story' ? 'story' : kind !== 'carousel' ? 'single' : index === 0 ? 'cover' : index === pageCount - 1 ? 'cta' : 'body',
      headline: '',
      copy: '',
      visual_function: '',
      depicted_person: '',
      prompt_file: `prompts/${String(index + 1).padStart(2, '0')}.md`,
    }));
    await atomicJson(join(project.path, 'project.json'), {
      schema_version: 1, project_id: project.id, client_id: brand?.id ?? 'unassigned', client_name: brand?.name ?? 'Sem marca',
      title: project.title, type: kind, format, created_at: project.createdAt.slice(0, 10), status: 'draft',
      audience: '', objective: project.brief, promise: '', cta: '', page_count: pageCount, page_count_approved: false,
      story_required: false, story_prompt_file: null, story: null,
      editorial: { claims_reviewed: false, copy_approved: false },
      pages,
    });
    await atomicJson(join(project.path, 'research/claims.json'), { reviewed: false, claims: [] });
    await atomicText(join(project.path, 'storyboard.md'), `# ${project.title}\n\n${project.brief}\n\nDesenvolva a copy e a função visual em project.json antes de gerar imagens.\n`);
    for (const page of pages) await atomicText(join(project.path, page.prompt_file), `# Direção da arte — página ${page.page}\n\nAguardando briefing, copy e função visual aprovados. A geração depende de uma ferramenta real disponível; este arquivo não é uma imagem.\n`);
  }
}
/** Rebase known asset refs safely; missing files can be tolerated for editorial reads, never for rendering/import. */
export async function secureStoryboard(path: string, root: string, importedRoot?: string, options: { allowMissingNarration?: boolean; allowMissingAssets?: boolean } = {}): Promise<Record<string, unknown>> {
  const raw = object(await readJson(path), 'Storyboard');
  const { sanitized: data, changed: sanitizedChanged } = sanitizeStoryboard(raw);
  if (data.schema !== 'videogo.storyboard/v1' || !Array.isArray(data.scenes) || !data.scenes.length) throw new Error('Storyboard VideoGo v1 inválido.');
  let remappedChanged = false;
  const remap = async (record: Record<string, unknown>, key: string, optional = false): Promise<void> => {
    const value = record[key];
    if (value === undefined || value === '') return;
    if (typeof value !== 'string') throw new Error(`Caminho inválido em ${key}.`);
    const sourceRoot = importedRoot ?? root;
    const absolute = await localPath(sourceRoot, value);
    const portable = relative(sourceRoot, absolute).split('\\').join('/');
    const target = await localPath(root, portable);
    await safePath(target);
    // Editorial reads may retain missing references, but other filesystem errors still fail.
    const info = optional ? await lstat(target).catch(error => { if (missing(error)) return undefined; throw error; }) : await lstat(target);
    if (info === undefined) return;
    if (!info.isFile()) throw new Error(`Mídia não encontrada: ${portable}`);
    if (record[key] !== portable) {
      record[key] = portable;
      remappedChanged = true;
    }
  };
  for (const item of data.scenes) {
    const scene = object(item, 'Cena');
    const visual = object(scene.visual, 'Visual');
    await remap(visual, 'assetPath', options.allowMissingAssets === true); await remap(visual, 'footagePath', options.allowMissingAssets === true);
    if (visual.compositionId !== undefined && (typeof visual.compositionId !== 'string' || isAbsolute(visual.compositionId) || /[\\/]/.test(visual.compositionId))) throw new Error('compositionId deve ser um identificador, não um caminho.');
    if (scene.audio) {
      const audio = object(scene.audio, 'Áudio');
      if (audio.narration) await remap(object(audio.narration, 'Narração'), 'assetPath', options.allowMissingNarration === true);
      if (Array.isArray(audio.sfxCues)) for (const cue of audio.sfxCues) await remap(object(cue, 'Efeito'), 'asset', options.allowMissingAssets === true);
    }
  }
  if (data.music) await remap(object(data.music, 'Música'), 'assetPath', options.allowMissingAssets === true);
  if (sanitizedChanged || remappedChanged) {
    await atomicJson(path, data);
  }
  return data;
}
