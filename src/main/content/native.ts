import { lstat } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import type { Brand, Project } from '../../shared/contracts.js';
import { atomicJson, atomicText, directory, localPath, object, readJson, safePath } from './storage.js';

export function storyboard(project: Project, images: string[] = []): Record<string, unknown> {
  return {
    schema: 'videogo.storyboard/v1', status: images.length ? 'ready' : 'draft', id: project.id,
    title: project.title, language: 'pt-BR', objective: project.brief || project.title,
    audience: 'Público a definir no briefing', format: 'reels', style: 'auto', fps: 30,
    durationTargetSeconds: Math.max(images.length, 1) * 5, tone: ['claro'],
    scenes: (images.length ? images : ['']).map((image, index) => ({
      id: `scene-${index + 1}`, title: images.length ? `Imagem ${index + 1}` : project.title,
      purpose: index === 0 ? 'hook' : 'explain', engine: 'auto', targetSeconds: 5,
      narration: '', onScreen: [],
      visual: { kind: image ? 'image' : 'typography', direction: image ? 'Exibir a imagem integral, sem distorção, preservando a legibilidade.' : 'Definir a direção visual com a pessoa antes de produzir.', layout: 'none', camera: 'static', ...(image ? { assetPath: image } : {}) },
      audio: { sfx: [], sfxCues: [], sourceAudio: false }, sources: [],
    })),
    soundDesign: { whooshes: false }, review: { factual: false, visual: false, audio: false },
  };
}
/** Portable documents mirror the engines' native draft formats; no provider is called. */
export async function initializeNative(project: Project, brand?: Brand): Promise<void> {
  if (project.kind === 'video') {
    for (const folder of ['planning/sources', 'assets/visuals/generated', 'assets/footage/selected', 'assets/audio', 'production', 'renders/review', 'renders/final', 'qa', 'deliverables']) await directory(project.path, folder);
    await atomicJson(join(project.path, 'storyboard.json'), storyboard(project));
    await atomicText(join(project.path, 'planning/request.md'), `${project.brief || project.title}\n`);
    await atomicText(join(project.path, 'planning/brief.md'), `# ${project.title}\n\n${project.brief}\n\nPúblico, fontes, direitos, voz, música, formato e aprovador ainda precisam de confirmação humana.\n`);
  } else {
    for (const folder of ['prompts', 'generated', 'qa', 'package', 'research']) await directory(project.path, folder);
    await atomicJson(join(project.path, 'project.json'), {
      schema_version: 1, project_id: project.id, client_id: brand?.id ?? 'unassigned', client_name: brand?.name ?? 'Sem marca',
      title: project.title, type: 'post', created_at: project.createdAt.slice(0, 10), status: 'draft',
      audience: '', objective: project.brief, promise: '', cta: '', page_count: 1, page_count_approved: false,
      story_required: false, story_prompt_file: null, story: null,
      editorial: { claims_reviewed: false, copy_approved: false },
      pages: [{ page: 1, role: 'single', copy: '', visual_function: '', prompt_file: 'prompts/01.md' }],
    });
    await atomicJson(join(project.path, 'research/claims.json'), { reviewed: false, claims: [] });
    await atomicText(join(project.path, 'storyboard.md'), `# ${project.title}\n\n${project.brief}\n\nDesenvolva a copy e a função visual em project.json antes de gerar imagens.\n`);
    await atomicText(join(project.path, 'prompts/01.md'), '# Direção da arte\n\nAguardando briefing, copy e identidade visual aprovados. A geração depende de uma ferramenta real disponível no provedor; este arquivo não é uma imagem.\n');
  }
}
/** Rebase only known native asset references, rejecting external or linked inputs. */
export async function secureStoryboard(path: string, root: string, importedRoot?: string): Promise<Record<string, unknown>> {
  const data = object(await readJson(path), 'Storyboard');
  if (data.schema !== 'videogo.storyboard/v1' || !Array.isArray(data.scenes) || !data.scenes.length) throw new Error('Storyboard VideoGo v1 inválido.');
  const remap = async (record: Record<string, unknown>, key: string): Promise<void> => {
    const value = record[key];
    if (value === undefined || value === '') return;
    if (typeof value !== 'string') throw new Error(`Caminho inválido em ${key}.`);
    const sourceRoot = importedRoot ?? root;
    const absolute = await localPath(sourceRoot, value);
    const portable = relative(sourceRoot, absolute).split('\\').join('/');
    const target = await localPath(root, portable);
    await safePath(target);
    // Reading the referenced file also ensures a dangling reference cannot reach the engine.
    if (!(await lstat(target)).isFile()) throw new Error(`Mídia não encontrada: ${portable}`);
    record[key] = portable;
  };
  for (const item of data.scenes) {
    const scene = object(item, 'Cena');
    const visual = object(scene.visual, 'Visual');
    await remap(visual, 'assetPath'); await remap(visual, 'footagePath');
    if (visual.compositionId !== undefined && (typeof visual.compositionId !== 'string' || isAbsolute(visual.compositionId) || /[\\/]/.test(visual.compositionId))) throw new Error('compositionId deve ser um identificador, não um caminho.');
    if (scene.audio) {
      const audio = object(scene.audio, 'Áudio');
      if (Array.isArray(audio.sfxCues)) for (const cue of audio.sfxCues) await remap(object(cue, 'Efeito'), 'asset');
    }
  }
  if (data.music) await remap(object(data.music, 'Música'), 'assetPath');
  return data;
}
