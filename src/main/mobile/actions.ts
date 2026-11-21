import { VIDEO_AGENT_MODEL, type Asset, type Job, type NarrationState, type ProjectDetail } from '../../shared/contracts.js';
import { motionDirectorPrompt, videoRevisionPrompt } from '../../shared/video-production.js';
import { audioCheckUnavailable, latestReviewVideo, narrationBlocked, reviewVideos as pickReviewVideos } from '../../shared/video-state.js';
import { mapDetailMedia, type MobileContext } from './project-view.js';

export interface ActionBody {
  action: string;
  confirm?: boolean;
  prompt?: string;
  provider?: string;
  pages?: Array<{ page: number; headline: string; body: string; copy: string; depictedPerson?: string }>;
  contentHash?: string;
  path?: string;
  redo?: boolean;
  note?: string;
  approved?: boolean;
  batchId?: string;
  brief?: string;
  notes?: string;
  brandId?: string;
}

export interface ActionResult {
  status: number;
  body: unknown;
}

/** Erro de uso (pedido inválido, regra de negócio): a resposta é 400 com a mensagem. */
export class ActionError extends Error {}

const CONSENT_MESSAGE = 'Confirme a ação no celular para continuar.';
const ok = (body: Record<string, unknown>): ActionResult => ({ status: 200, body: { ok: true, ...body } });

/** Ações que gastam crédito ou processam por muito tempo: só rodam com `confirm: true` vindo do cliente. */
const PAID_ACTIONS = new Set(['start-agent', 'prepare-texts', 'generate-images', 'revise-images', 'request-video-revision', 'produce-video', 'render']);

type ActionContext = { ctx: MobileContext; id: string; detail: ProjectDetail; body: ActionBody; session: string | undefined };
type ActionHandler = (action: ActionContext) => Promise<ActionResult>;

/** Status HTTP de um erro lançado por uma ação: mensagens do app (Error simples) são 400; falhas de sistema/programação são 500. */
export function actionErrorStatus(error: unknown): number {
  if (error instanceof ActionError) return 400;
  if (!(error instanceof Error)) return 500;
  const code = (error as NodeJS.ErrnoException).code;
  if (typeof code === 'string' && /^E[A-Z]+$/.test(code)) return 500;
  return error.constructor === Error ? 400 : 500;
}

const requireText = (value: unknown, message: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new ActionError(message);
  return value.trim();
};

async function detailResult(ctx: MobileContext, updated: unknown, session: string | undefined): Promise<ActionResult> {
  const detail = updated && typeof updated === 'object' ? await mapDetailMedia(updated as ProjectDetail, session) : updated;
  return ok({ detail });
}

const hasRunningJob = (ctx: MobileContext, id: string): boolean => ctx.services.jobs().some((job: Job) => job.projectId === id && job.status === 'running');

async function loadNarration(ctx: MobileContext, id: string): Promise<NarrationState | undefined> {
  try { return (await ctx.runtime.invoke('projects.narration', { id })) as NarrationState; } catch { return undefined; }
}

async function approve(ctx: MobileContext, id: string, path: string, approved: boolean): Promise<ProjectDetail> {
  return (await ctx.runtime.invoke('projects.approve', { id, path, approved })) as ProjectDetail;
}

/** Vídeo de revisão mais recente com a mesma regra do desktop (`reviewVideos` + `latestReviewVideo`). */
async function reviewState(ctx: MobileContext, id: string, detail: ProjectDetail): Promise<{ videos: Asset[]; latest: Asset | undefined }> {
  const narration = await loadNarration(ctx, id);
  const videos = pickReviewVideos(detail.assets ?? [], narration?.mode);
  return { videos, latest: latestReviewVideo(videos) };
}

function agentPrompt({ detail, body }: ActionContext): string {
  const notes = detail.notes?.trim();
  const base = [detail.brief?.trim(), notes ? `Notas do projeto:\n${notes}` : ''].filter(Boolean).join('\n\n');
  return [...new Set([body.prompt?.trim() ?? '', base].filter(Boolean))].join('\n\n')
    || (detail.kind === 'image'
      ? 'Prepare os textos e a copy das páginas do carrossel com base no briefing salvo.'
      : 'Prepare o roteiro e o storyboard deste vídeo com base no briefing salvo.');
}

function agentProvider({ ctx, detail, body }: ActionContext): string {
  if (body.provider === 'codex' || body.provider === 'claude') return body.provider;
  return detail.kind === 'video' ? 'claude' : (ctx.services.getSettings().provider || 'codex');
}

const startAgent: ActionHandler = async action => {
  const { ctx, id, detail, body } = action;
  const job = await ctx.runtime.invoke('agents.start', {
    id,
    provider: agentProvider(action),
    prompt: agentPrompt(action),
    confirm: true,
    ...(detail.kind === 'image' && body.prompt?.trim() ? { directive: body.prompt.trim() } : {}),
  });
  return ok({ job });
};

const handlers: Record<string, ActionHandler> = {
  'update-brief': async ({ ctx, id, detail, body, session }) => {
    const brief = requireText(body.brief, 'Escreva a pauta antes de salvar.');
    return detailResult(ctx, await ctx.runtime.invoke('projects.notes', { id, brief, notes: typeof body.notes === 'string' ? body.notes : detail.notes ?? '' }), session);
  },
  'start-agent': startAgent,
  'prepare-texts': startAgent,
  'save-visual': async ({ ctx, id, body, session }) => {
    if (!Array.isArray(body.pages)) throw new ActionError('Páginas não fornecidas.');
    return detailResult(ctx, await ctx.runtime.invoke('projects.visual.save', { projectId: id, id, pages: body.pages }), session);
  },
  'approve-visual': async ({ ctx, id, detail, body, session }) => {
    const contentHash = body.contentHash || detail.visualReview?.contentHash;
    if (!contentHash) throw new ActionError('Hash do conteúdo não fornecido.');
    return detailResult(ctx, await ctx.runtime.invoke('projects.visual.approve', { id, approved: true, contentHash }), session);
  },
  'approve-storyboard': async ({ ctx, id, session }) =>
    detailResult(ctx, await ctx.runtime.invoke('projects.storyboard.approve', { id, approved: true, confirm: true }), session),
  'generate-images': async ({ ctx, id }) => ok({ job: await ctx.runtime.invoke('agents.generateImages', { id, confirm: true }) }),
  'revise-images': async ({ ctx, id }) => ok({ job: await ctx.runtime.invoke('agents.reviseImages', { id, confirm: true }) }),
  'approve-asset': async ({ ctx, id, body, session }) => {
    const path = requireText(body.path, 'Caminho do artefato não fornecido.');
    return detailResult(ctx, await approve(ctx, id, path, body.approved ?? true), session);
  },
  'review-asset': async ({ ctx, id, body, session }) => {
    const path = requireText(body.path, 'Caminho do artefato não fornecido.');
    return detailResult(ctx, await ctx.runtime.invoke('projects.review', { id, path, redo: body.redo ?? true, note: typeof body.note === 'string' ? body.note : '' }), session);
  },
  'approve-video': async ({ ctx, id, detail, body, session }) => {
    if (detail.kind !== 'video') throw new ActionError('Esta ação só existe em projetos de vídeo.');
    if (detail.storyboardReady !== true) throw new ActionError('Aprove o roteiro antes de aprovar o vídeo.');
    if ((body.approved ?? true) && detail.storyboardCompositionReady !== true) throw new ActionError('Este vídeo saiu sem as cenas do Claude Opus 5.5. Peça revisão antes de aprovar.');
    if (hasRunningJob(ctx, id)) throw new ActionError('Aguarde o processo terminar.');
    const { videos, latest } = await reviewState(ctx, id, detail);
    if (!latest) throw new ActionError('Não há vídeo renderizado para aprovar.');
    let updated: ProjectDetail | undefined;
    for (const older of videos.slice(1).filter(asset => asset.approved)) updated = await approve(ctx, id, older.path, false);
    updated = await approve(ctx, id, latest.path, body.approved ?? true);
    return detailResult(ctx, updated, session);
  },
  'request-video-revision': async ({ ctx, id, detail, body }) => {
    if (detail.kind !== 'video') throw new ActionError('Esta ação só existe em projetos de vídeo.');
    const note = requireText(body.note, 'Descreva a mudança que você quer no vídeo.');
    const { latest } = await reviewState(ctx, id, detail);
    if (!latest) throw new ActionError('Não há vídeo renderizado para revisar.');
    if (latest.approved) await approve(ctx, id, latest.path, false);
    const contactSheet = (detail.assets ?? []).find(asset => /^renders\/(?:review|final)\/folha-contato\.png$/i.test(asset.name.replace(/\\/g, '/')))?.path;
    const job = await ctx.runtime.invoke('agents.start', {
      id,
      provider: 'claude',
      model: VIDEO_AGENT_MODEL,
      prompt: videoRevisionPrompt(note, { contactSheet, ...(detail.storyboardCompositionReady ? {} : { produce: { fromPost: Boolean(detail.sourceProjectId) } }) }),
      confirm: true,
    });
    return ok({ job });
  },
  'produce-video': async ({ ctx, id, detail }) => {
    if (detail.kind !== 'video') throw new ActionError('Esta ação só existe em projetos de vídeo.');
    if (detail.storyboardAvailable !== true) throw new ActionError('Prepare o roteiro antes de produzir as cenas.');
    const job = await ctx.runtime.invoke('agents.start', {
      id,
      provider: 'claude',
      model: VIDEO_AGENT_MODEL,
      prompt: motionDirectorPrompt({ fromPost: Boolean(detail.sourceProjectId) }),
      confirm: true,
    });
    return ok({ job });
  },
  'approve-audio': async ({ ctx, id, detail, session }) => {
    if (detail.kind !== 'video') throw new ActionError('Esta ação só existe em projetos de vídeo.');
    const narration = await loadNarration(ctx, id);
    if (!narration) throw new ActionError('Não foi possível carregar a narração. Tente de novo.');
    if (narration.scenes.some(scene => scene.stray)) throw new ActionError('Há áudio órfão: envie, grave ou remova no computador antes de aprovar.');
    const pending = narration.mode === 'silent'
      ? []
      : narration.scenes
        .map(scene => scene.audioPath ? (detail.assets ?? []).find(asset => asset.kind === 'audio' && asset.name === scene.audioPath) : undefined)
        .filter((asset): asset is Asset => asset !== undefined && !asset.approved);
    let updated: unknown = detail;
    for (const asset of pending) updated = await approve(ctx, id, asset.path, true);
    return detailResult(ctx, updated, session);
  },
  'set-brand': async ({ ctx, id, body, session }) => {
    if (typeof body.brandId !== 'string') throw new ActionError('Escolha uma marca.');
    return detailResult(ctx, await ctx.runtime.invoke('projects.visualPreferences', { id, brandId: body.brandId }), session);
  },
  'render': async ({ ctx, id, detail, body }) => {
    if (detail.kind === 'video') {
      if (detail.storyboardReady !== true) throw new ActionError('Aprove o roteiro antes de renderizar.');
      const narration = await loadNarration(ctx, id);
      if (narrationBlocked(narration, false)) throw new ActionError('A narração ainda não está pronta: aprove os áudios das cenas antes de renderizar.');
      if (narration?.mode === 'narrated' && audioCheckUnavailable(detail.assets ?? [])) throw new ActionError('Não foi possível verificar o áudio do vídeo. Instale o FFprobe no computador e tente de novo.');
    }
    const job = await ctx.runtime.invoke('projects.render', { id, confirm: true, ...(body.batchId ? { batchId: body.batchId } : {}) });
    return ok({ job });
  },
};

/** Executa uma ação de etapa do projeto pedida pelo celular. Erros do usuário viram `ActionError`/`Error`; o chamador converte em status. */
export async function runProjectAction(ctx: MobileContext, id: string, detail: ProjectDetail, body: ActionBody, session?: string): Promise<ActionResult> {
  const handler = typeof body?.action === 'string' && Object.hasOwn(handlers, body.action) ? handlers[body.action] : undefined;
  if (!handler) return { status: 400, body: { error: 'Ação não reconhecida.' } };
  if (PAID_ACTIONS.has(body.action) && body.confirm !== true) return { status: 400, body: { error: CONSENT_MESSAGE } };
  return handler({ ctx, id, detail, body, session });
}
