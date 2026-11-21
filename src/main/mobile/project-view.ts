import { stat } from 'node:fs/promises';
import type { Asset, Brand, GenerationBatch, Job, NarrationState, Project, ProjectDetail } from '../../shared/contracts.js';
import type { Services } from '../context.js';
import type { Runtime } from '../runtime.js';
import { getProjectJourney, type ProjectJourney } from '../../shared/project-journey.js';
import {
  audioCheckUnavailable, classifyBatch, hasVideoGoRender, isBatchStale, journeyOutputAssets, latestReviewVideo,
  narrationBlocked, reviewVideos as pickReviewVideos, type BatchState,
} from '../../shared/video-state.js';
import { imageFooterAction, videoFooterAction, type FooterAction, type ImageStepId, type VideoStepId } from '../../shared/step-action.js';
import { DEFAULT_POSTNOW_FORMAT, POSTNOW_FORMATS, isPostNowFormat } from '../../shared/formats.js';

/** Contexto que as rotas de projeto precisam do servidor mobile. */
export interface MobileContext {
  runtime: Runtime;
  services: Services;
}

export interface MobileGallery {
  items: Asset[];
  source: 'latest-batch' | 'legacy' | 'none';
  batchId?: string;
  state: BatchState;
  statusMessage?: string;
  stale: boolean;
}

export interface MobileNarrationScene {
  id: string;
  title: string;
  onScreen: string;
  narration: string;
  spokenText: string;
  audioUrl?: string;
  audioApproved: boolean;
  stray: boolean;
}

export interface MobileVideoView {
  mode: 'silent' | 'narrated';
  reviewVideos: Asset[];
  latest?: Asset;
  previous: Asset[];
  emptyReason?: string;
  audioCheckUnavailable: boolean;
  storyboardReady: boolean;
  storyboardIssues: string[];
  basicPostVideo: boolean;
  sourceProjectId?: string;
  poster?: string;
  narration: { blocked: boolean; needsKey: boolean; scenes: MobileNarrationScene[] };
}

export interface MobileDelivery {
  approved: Asset[];
  total: number;
  files: { images: Asset[]; videos: Asset[]; audios: Asset[]; other: Asset[] };
  zipUrl: string | null;
  coverUrl?: string;
  copyUrl?: string;
}

/** `GET /api/projects/:id`. Tipo interno do servidor mobile; o cliente lê o JSON. */
export interface MobileProjectView extends Omit<ProjectDetail, 'assets' | 'batches'> {
  assets: Asset[];
  batches: GenerationBatch[];
  journey: ProjectJourney;
  isRunning: boolean;
  footerActions: Partial<Record<ImageStepId | VideoStepId, FooterAction | undefined>>;
  gallery: MobileGallery;
  review: { kept: number; redo: number; pending: number };
  caption: string;
  scenes?: Array<{ id: string; title: string; onScreen: string }>;
  video?: MobileVideoView;
  delivery: MobileDelivery;
}

/**
 * Converte a URL de mídia do runtime (`media://asset/<token>`, `/api/media/<token>?v=n`) na URL servida pelo acesso mobile.
 * `version` (ou o `?v=` já presente) entra na URL: o token é estável por caminho, então sem ele uma imagem regerada ficaria velha no cache.
 */
export function mapMediaUrl(rawUrl: string | undefined, session: string | undefined, version?: string | number): string | undefined {
  if (!rawUrl) return undefined;
  const query = rawUrl.includes('?') ? new URLSearchParams(rawUrl.slice(rawUrl.indexOf('?') + 1)) : undefined;
  let token = rawUrl.split('?')[0]!;
  if (token.startsWith('media://asset/')) {
    token = token.slice('media://asset/'.length);
  } else if (token.includes('/api/media/')) {
    token = token.slice(token.indexOf('/api/media/') + '/api/media/'.length);
  } else if (token.includes('/media/')) {
    token = token.slice(token.lastIndexOf('/') + 1);
  }
  const v = version ?? query?.get('v') ?? undefined;
  const params = [...(v !== undefined && v !== '' ? [`v=${encodeURIComponent(String(v))}`] : []), ...(session ? [`token=${session}`] : [])];
  return `/api/media/${token}${params.length ? `?${params.join('&')}` : ''}`;
}

export function toMobileProject(project: Project, session: string | undefined): Project {
  return { ...project, coverUrl: mapMediaUrl(project.coverUrl, session) };
}

const RENDER_NAME = /^renders\/(?:review|final)\//i;
const CONTACT_SHEET = /^renders\/(?:review|final)\/folha-contato\.png$/i;
const DELIVERY_FILE = /^delivery\/(?:cover-(?:youtube|reels|feed-square)\.png|copy-(?:youtube|reels|feed-square)\.txt)$/;
const LEGACY_SLIDE = /^generated\/slide-\d+\.png$/i;
const norm = (name: string): string => name.replace(/\\/g, '/');

async function attempt<T>(work: () => Promise<T>): Promise<T | undefined> {
  try { return await work(); } catch { return undefined; }
}

async function mtimeVersion(path: string): Promise<number | undefined> {
  const info = await attempt(() => stat(path));
  return info ? Math.round(info.mtimeMs) : undefined;
}

function mapAssets(assets: readonly Asset[], session: string | undefined, versions: ReadonlyMap<string, number | undefined>): Asset[] {
  return assets.map(asset => ({ ...asset, url: mapMediaUrl(asset.url, session, versions.get(asset.path)) || asset.url }));
}

/** Mapeia o `detail` devolvido por ações (mesma implementação do GET de detalhe). */
export async function mapDetailMedia<T extends { assets?: Asset[]; batches?: GenerationBatch[] }>(detail: T, session: string | undefined): Promise<T> {
  const paths = new Set<string>();
  for (const asset of detail.assets ?? []) paths.add(asset.path);
  for (const batch of detail.batches ?? []) for (const asset of batch.assets ?? []) paths.add(asset.path);
  const versions = new Map<string, number | undefined>(await Promise.all([...paths].map(async (path): Promise<[string, number | undefined]> => [path, await mtimeVersion(path)])));
  return {
    ...detail,
    ...(detail.assets ? { assets: mapAssets(detail.assets, session, versions) } : {}),
    ...(detail.batches ? { batches: detail.batches.map(batch => ({ ...batch, assets: mapAssets(batch.assets ?? [], session, versions) })) } : {}),
  };
}

const byName = (a: Asset, b: Asset): number => a.name.localeCompare(b.name);

async function projectHasLogo(runtime: Runtime, detail: ProjectDetail): Promise<boolean> {
  if (!detail.brandId) return false;
  const brands = await attempt(async () => (await runtime.invoke('brands.list', {})) as Brand[]);
  return Boolean(brands?.find(brand => brand.id === detail.brandId)?.logo?.toLowerCase().endsWith('.png'));
}

function videoEmptyReason(assets: readonly Asset[], mode: 'silent' | 'narrated', videos: readonly Asset[]): string | undefined {
  if (videos.length > 0) return undefined;
  const renders = assets.filter(asset => asset.kind === 'video' && RENDER_NAME.test(norm(asset.name)));
  if (renders.length === 0) return 'Nenhum vídeo renderizado ainda. Renderize o vídeo para poder revisar.';
  if (mode === 'narrated') {
    if (renders.some(asset => asset.hasAudio === undefined)) return 'Não foi possível verificar o áudio dos vídeos renderizados. Instale o FFprobe no computador e tente de novo.';
    return 'Os vídeos renderizados não têm narração e este projeto está no modo narrado. Renderize de novo depois de aprovar a narração.';
  }
  return 'Nenhum vídeo disponível para revisão.';
}

/** Detalhe do projeto como o celular o recebe: URLs mapeadas, jornada, rodapés, galeria, vídeo e entrega calculados no servidor. */
export async function buildProjectView(ctx: MobileContext, rawDetail: ProjectDetail, session: string | undefined): Promise<MobileProjectView> {
  const { runtime, services } = ctx;
  const id = rawDetail.id;
  const mapped = await mapDetailMedia(rawDetail, session);
  const detail: ProjectDetail = mapped;
  const assets = detail.assets ?? [];
  const batches = detail.batches ?? [];

  const projectJobs = services.jobs().filter((job: Job) => job.projectId === id);
  const isRunning = projectJobs.some(job => job.status === 'running');
  const textAgentRunning = projectJobs.some(job => job.status === 'running' && job.agentSession);
  const hasBrief = Boolean(detail.brief && detail.brief.trim().length > 0);
  const adapting = Boolean(detail.formatAdaptation);
  const review = detail.visualReview;

  const latestBatch = batches[0];
  const legacyAssets = assets.filter(asset => asset.kind === 'image' && LEGACY_SLIDE.test(norm(asset.name)));
  const batchState = classifyBatch(latestBatch, legacyAssets.length > 0);
  const stale = isBatchStale(latestBatch, detail.format);
  const gallery: MobileGallery = latestBatch
    ? { items: [...(latestBatch.assets ?? [])].sort(byName), source: 'latest-batch', batchId: latestBatch.id, state: batchState, ...(latestBatch.status?.message ? { statusMessage: latestBatch.status.message } : {}), stale }
    : legacyAssets.length > 0
      ? { items: [...legacyAssets].sort(byName), source: 'legacy', state: batchState, stale: false }
      : { items: [], source: 'none', state: batchState, stale: false };
  const reviewAssets = latestBatch?.assets ?? [];
  const decisions = {
    kept: reviewAssets.filter(asset => asset.approved).length,
    redo: reviewAssets.filter(asset => !asset.approved && asset.redo).length,
    pending: reviewAssets.filter(asset => !asset.approved && !asset.redo).length,
  };

  const elevenConfigured = Boolean(services.getElevenLabsKey?.());
  const footerActions: MobileProjectView['footerActions'] = {};
  let journey: ProjectJourney;
  let video: MobileVideoView | undefined;
  let scenes: MobileProjectView['scenes'];

  if (detail.kind === 'image') {
    const expected = review?.pages.length ?? 0;
    const textsApproved = Boolean(review?.ready && review.approved && !adapting);
    const hasLogo = await projectHasLogo(runtime, detail);
    const outputs = journeyOutputAssets({ kind: 'image', batches, legacyAssets, reviewVideos: [] });
    const formatSpec = isPostNowFormat(detail.format) ? POSTNOW_FORMATS[detail.format] : POSTNOW_FORMATS[DEFAULT_POSTNOW_FORMAT];
    const imagesReady = Boolean(
      !adapting && (latestBatch
        ? latestBatch.status?.state === 'ready'
          && latestBatch.format === detail.format
          && latestBatch.sourceCount === expected
          && latestBatch.assets.length === expected
        : batches.length === 0 && expected > 0 && legacyAssets.length === expected),
    );
    const canPreparePostnow = Boolean(latestBatch && expected > 0 && latestBatch.sourceCount === expected && textsApproved && latestBatch.assets.length === 0);
    const blockMessage = latestBatch?.status?.state === 'failed' ? latestBatch.status.message
      : !textsApproved ? 'Aprove os textos na etapa anterior para liberar a geração.'
      : !hasLogo ? 'Vincule ao projeto uma marca com logo oficial PNG antes de gerar as imagens.'
      : latestBatch && !latestBatch.status ? 'Esta versão antiga não tem comprovação de processamento completo. Gere as imagens novamente para prepará-la.'
      : latestBatch && expected > 0 && latestBatch.sourceCount !== expected ? `Esta rodada tem ${latestBatch.sourceCount} imagem(ns)-fonte; o roteiro exige ${expected}.`
      : undefined;
    const footerFor = (step: ImageStepId): FooterAction | undefined => imageFooterAction({
      step,
      brief: { dirty: false, empty: !hasBrief },
      texts: {
        present: expected > 0,
        ready: Boolean(review?.ready),
        approved: Boolean(review?.approved),
        dirty: false,
        invalid: false,
        blockingCount: review?.blocking.length ?? 0,
        unsupportedFormat: Boolean(detail.unsupportedFormat),
        adapting,
      },
      images: {
        expected,
        batchState,
        stale,
        formatLabel: formatSpec.label,
        canGenerate: !isRunning && textsApproved && hasLogo,
        canPreparePostnow: !isRunning && canPreparePostnow,
        ...(blockMessage ? { blockMessage } : {}),
      },
      review: { ...decisions, drafting: 0 },
      busy: { imageGeneration: false, imageRevision: false },
      anyJobRunning: isRunning,
      textAgentRunning,
      agentBlocked: false,
    });
    footerActions.brief = footerFor('brief');
    footerActions.texts = footerFor('texts');
    footerActions.images = footerFor('images');
    footerActions.review = ((): FooterAction | undefined => {
      if (batchState === 'none' || batchState === 'legacyFlat' || batchState === 'failed' || batchState === 'legacyNoStatus' || batchState === 'importedPending') {
        return { kind: 'wait', label: 'Gere as imagens antes de revisar', enabled: false };
      }
      const action = footerFor('review');
      return action?.kind === 'revise' && isRunning ? { kind: 'wait', label: 'Aguarde o processo terminar', enabled: false } : action;
    })();
    journey = getProjectJourney({
      kind: 'image',
      hasBrief,
      hasScript: Boolean(review?.ready),
      imagesReady,
      hasRender: outputs.length > 0,
      outputs: outputs.map(asset => ({ approved: Boolean(asset.approved) })),
      textsApproved,
      isRunning,
    });
  } else {
    const narration = await attempt(async () => (await runtime.invoke('projects.narration', { id })) as NarrationState);
    const storyboard = detail.storyboardAvailable
      ? await attempt(async () => (await runtime.invoke('projects.storyboard', { id })) as { scenes?: Array<{ id: string; title: string; onScreen: string }> })
      : undefined;
    scenes = (storyboard?.scenes ?? []).map(scene => ({ id: scene.id, title: scene.title, onScreen: typeof scene.onScreen === 'string' ? scene.onScreen : '' }));
    const mode = narration?.mode ?? 'narrated';
    const reviewVideos = pickReviewVideos(assets, narration?.mode);
    const latest = latestReviewVideo(reviewVideos);
    const blocked = narrationBlocked(narration, false);
    const audioUnavailable = audioCheckUnavailable(assets);
    const storyboardReady = detail.storyboardReady === true;
    const hasRender = hasVideoGoRender(reviewVideos);
    const outputs = journeyOutputAssets({ kind: 'video', batches: [], legacyAssets: [], reviewVideos });
    const needsKey = Boolean(narration?.provider === 'elevenlabs' && narration.mode !== 'silent' && narration.voiceId && !elevenConfigured && storyboardReady);
    const sceneStates = narration?.scenes ?? [];
    const audioAsset = (audioPath: string | undefined): Asset | undefined => audioPath ? assets.find(asset => asset.kind === 'audio' && asset.name === audioPath) : undefined;
    const voiceAssets = sceneStates.map(scene => audioAsset(scene.audioPath)).filter((asset): asset is Asset => Boolean(asset));
    const emptyReason = videoEmptyReason(assets, mode, reviewVideos);
    const sheet = assets.find(asset => CONTACT_SHEET.test(norm(asset.name)));
    const titles = new Map(scenes.map(scene => [scene.id, scene]));

    video = {
      mode,
      reviewVideos,
      ...(latest ? { latest } : {}),
      previous: reviewVideos.slice(1),
      ...(emptyReason ? { emptyReason } : {}),
      audioCheckUnavailable: audioUnavailable,
      storyboardReady,
      storyboardIssues: detail.storyboardIssues ?? [],
      basicPostVideo: Boolean(detail.sourceProjectId) && !detail.storyboardAvailable,
      ...(detail.sourceProjectId ? { sourceProjectId: detail.sourceProjectId } : {}),
      ...(sheet ? { poster: sheet.url } : {}),
      narration: {
        blocked,
        needsKey,
        scenes: sceneStates.map(scene => {
          const audio = audioAsset(scene.audioPath);
          const fromBoard = titles.get(scene.id);
          return {
            id: scene.id,
            title: scene.title || fromBoard?.title || scene.id,
            onScreen: fromBoard?.onScreen ?? '',
            narration: scene.narration,
            spokenText: scene.spokenText,
            ...(audio ? { audioUrl: audio.url } : {}),
            audioApproved: Boolean(audio?.approved),
            stray: scene.stray,
          };
        }),
      },
    };

    const footerFor = (step: VideoStepId): FooterAction | undefined => {
      const action = videoFooterAction({
        step,
        brief: { dirty: false, empty: !hasBrief },
        script: { available: detail.storyboardAvailable === true, dirty: false, invalid: false, issuesCount: detail.storyboardIssues?.length ?? 0, textAgentRunning, promptPresent: hasBrief },
        agentBlocked: false,
        voice: {
          loaded: Boolean(narration),
          mode: narration?.mode,
          dirty: false,
          active: Boolean(narration?.active),
          scenesMissingAudio: sceneStates.filter(scene => scene.narration.trim() && !scene.audioAttached && !scene.stray).length,
          strayScenes: sceneStates.filter(scene => scene.stray).length,
          audiosPendingApproval: voiceAssets.filter(asset => !asset.approved).length,
          voiceChosen: Boolean(narration?.provider === 'local' ? narration.localVoice : narration?.voiceId),
          elevenConfigured,
          anyManualAudio: sceneStates.some(scene => ['upload', 'recording', 'local'].includes(scene.audioSource ?? '')),
        },
        storyboardReady,
        compositionAuthored: detail.storyboardCompositionReady === true,
        narrationBlocked: blocked,
        render: { hasRender, rendering: false, audioCheckUnavailable: audioUnavailable && narration?.mode === 'narrated' },
        videoRevisionRequested: false,
        review: { latestApproved: Boolean(latest?.approved) },
        busy: { approving: false, rendering: false, narrationGeneration: false },
        anyJobRunning: isRunning,
      });
      // O celular não gera narração (paga/pesada): o áudio é gravado, enviado ou gerado no computador.
      return action?.kind === 'generate-audio' ? { kind: 'wait', label: 'Gere ou envie o áudio no computador', enabled: false } : action;
    };
    for (const step of ['brief', 'script', 'voice', 'render', 'review'] as const) footerActions[step] = footerFor(step);

    journey = getProjectJourney({
      kind: 'video',
      hasBrief,
      hasScript: storyboardReady,
      hasRender,
      outputs: outputs.map(asset => ({ approved: Boolean(asset.approved) })),
      textsApproved: Boolean(review?.approved && !adapting),
      isRunning,
      voice: { selected: true, ready: !blocked && storyboardReady, needsKey },
    });
  }

  const approved = assets.filter(asset => asset.approved);
  const deliveryFiles = detail.kind === 'video' ? assets.filter(asset => DELIVERY_FILE.test(norm(asset.name))) : [];
  const cover = deliveryFiles.find(asset => asset.kind === 'image');
  const copy = deliveryFiles.find(asset => asset.kind === 'file');
  const delivery: MobileDelivery = {
    approved,
    total: assets.length,
    files: {
      images: assets.filter(asset => asset.kind === 'image'),
      videos: assets.filter(asset => asset.kind === 'video'),
      audios: assets.filter(asset => asset.kind === 'audio'),
      other: assets.filter(asset => asset.kind === 'file'),
    },
    zipUrl: approved.length > 0 ? `/api/projects/${encodeURIComponent(id)}/package.zip${session ? `?token=${session}` : ''}` : null,
    ...(cover ? { coverUrl: cover.url } : {}),
    ...(copy ? { copyUrl: copy.url } : {}),
  };

  return {
    ...detail,
    assets,
    batches,
    journey,
    isRunning,
    footerActions,
    gallery,
    review: decisions,
    caption: review?.caption ?? '',
    ...(scenes ? { scenes } : {}),
    ...(video ? { video } : {}),
    delivery,
  };
}
