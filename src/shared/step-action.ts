import type { BatchState } from './video-state.js';

export type FooterKind =
  | 'wait' | 'continue'
  | 'save-brief'
  | 'prepare-texts' | 'approve-texts' | 'save-approve-texts'
  | 'generate' | 'regenerate' | 'prepare-postnow' | 'go-review' | 'revise' | 'deliver'
  | 'prepare-script' | 'approve-script' | 'save-approve-script' | 'go-script'
  | 'save-voice' | 'generate-audio' | 'approve-audio'
  | 'produce-video' | 'approve-render' | 'render' | 'go-render';

export interface FooterAction { kind: FooterKind; label: string; enabled: boolean; hint?: string }

interface BriefInput { dirty: boolean; empty: boolean }

export type ImageStepId = 'brief' | 'texts' | 'images' | 'review' | 'export';

export interface ImageFooterInput {
  step: ImageStepId;
  brief: BriefInput;
  texts: {
    present: boolean; ready: boolean; approved: boolean; dirty: boolean; invalid: boolean;
    blockingCount: number; unsupportedFormat: boolean; adapting: boolean;
  };
  images: {
    expected: number; batchState: BatchState; stale: boolean; formatLabel: string;
    /** Textos aprovados, revisão pronta e nenhum bloqueio local: o Studio já calcula (canGenerateImages sem `running`). */
    canGenerate: boolean;
    /** Rodada importada pode ser preparada no PostNow (renderInputsReady). */
    canPreparePostnow: boolean;
    blockMessage?: string;
  };
  /** `drafting`: revisões abertas (a pessoa clicou em Pedir revisão) que ainda não foram confirmadas nem canceladas. */
  review: { kept: number; redo: number; pending: number; drafting: number };
  busy: { imageGeneration: boolean; imageRevision: boolean };
  anyJobRunning: boolean;
  textAgentRunning: boolean;
  agentBlocked: boolean;
}

const WAIT_JOB = 'Aguarde o processo terminar';

function wait(label: string, hint?: string): FooterAction {
  return { kind: 'wait', label, enabled: false, ...(hint ? { hint } : {}) };
}
function act(kind: FooterKind, label: string, enabled = true, hint?: string): FooterAction {
  return { kind, label, enabled, ...(hint ? { hint } : {}) };
}

function briefAction(brief: BriefInput): FooterAction {
  if (brief.empty) return wait('Escreva a pauta para continuar');
  return brief.dirty ? act('save-brief', 'Salvar e continuar') : act('continue', 'Continuar');
}

const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);

/** Footer action for each image step. Returns undefined on delivery (no advance button). */
export function imageFooterAction(input: ImageFooterInput): FooterAction | undefined {
  const { texts, images, review, busy } = input;
  switch (input.step) {
    case 'brief':
      return briefAction(input.brief);
    case 'texts':
      if (input.textAgentRunning || texts.adapting) return wait('Preparando textos…');
      if (input.anyJobRunning) return wait(WAIT_JOB);
      if (!texts.present) return act('prepare-texts', 'Preparar textos', !input.brief.empty && !input.brief.dirty && !input.agentBlocked, input.brief.dirty ? 'Salve a pauta antes de preparar os textos.' : undefined);
      if (texts.unsupportedFormat) return wait('Escolha o formato', 'O formato deste projeto foi removido do app. Escolha outro no seletor “Formato das imagens”.');
      if (texts.invalid) return wait('Corrija os campos marcados');
      // Pendências vêm do último estado salvo; um select alterado só resolve depois de salvar.
      if (texts.dirty) return act('save-approve-texts', texts.blockingCount > 0 ? 'Salvar alterações' : 'Salvar, aprovar e continuar');
      if (texts.blockingCount > 0) return wait('Complete os itens pendentes', 'Veja “Complete antes de aprovar” acima.');
      return texts.approved ? act('continue', 'Continuar') : act('approve-texts', 'Aprovar textos e continuar', texts.ready);
    case 'images': {
      if (busy.imageGeneration || images.batchState === 'generating') return wait('Gerando…');
      if (input.anyJobRunning) return wait(WAIT_JOB);
      const generateLabel = `Gerar ${images.expected} ${plural(images.expected, 'imagem', 'imagens')}`;
      switch (images.batchState) {
        case 'none':
        case 'legacyFlat':
          return act('generate', generateLabel, images.canGenerate, images.canGenerate ? undefined : 'Aprove os textos na etapa anterior para liberar a geração.');
        case 'failed':
        case 'legacyNoStatus':
          return act('generate', 'Gerar de novo', images.canGenerate, images.canGenerate ? undefined : images.blockMessage);
        case 'importedPending':
          return act('prepare-postnow', 'Preparar imagens importadas', images.canPreparePostnow, images.canPreparePostnow ? undefined : images.blockMessage);
        case 'ready':
          return images.stale ? act('regenerate', `Gerar de novo no formato ${images.formatLabel}`, images.canGenerate) : act('go-review', 'Revisar as imagens');
        default:
          return undefined;
      }
    }
    case 'review':
      if (busy.imageRevision || images.batchState === 'generating') return wait('Gerando nova versão…');
      if (review.drafting > 0) return wait('Confirme ou cancele a revisão', 'Clique em “Confirmar revisão” na imagem para registrar o pedido. A nova versão só é liberada depois disso.');
      if (review.pending > 0) return wait(`Falta decidir ${review.pending}`);
      if (review.redo > 0) return act('revise', `Gerar nova versão de ${review.redo} ${plural(review.redo, 'imagem', 'imagens')}`);
      return act('deliver', 'Ir para Entrega');
    default:
      return undefined;
  }
}

export type VideoStepId = 'brief' | 'script' | 'voice' | 'render' | 'review' | 'export';

export interface VideoFooterInput {
  step: VideoStepId;
  brief: BriefInput;
  script: { available: boolean; dirty: boolean; invalid: boolean; issuesCount: number; textAgentRunning: boolean; promptPresent: boolean };
  agentBlocked: boolean;
  voice: {
    loaded: boolean; mode: 'silent' | 'narrated' | undefined; dirty: boolean; active: boolean;
    scenesMissingAudio: number; strayScenes: number; audiosPendingApproval: number;
    voiceChosen: boolean; elevenConfigured: boolean; anyManualAudio: boolean;
  };
  storyboardReady: boolean;
  /** A composição atual foi produzida por uma sessão concluída do Claude Opus 5.5 fixo. */
  compositionAuthored: boolean;
  narrationBlocked: boolean;
  render: { hasRender: boolean; rendering: boolean; audioCheckUnavailable: boolean };
  videoRevisionRequested: boolean;
  review: { latestApproved: boolean };
  busy: { approving: boolean; rendering: boolean; narrationGeneration: boolean };
  anyJobRunning: boolean;
}

/** Footer action for each video step. Returns undefined on delivery (no advance button). */
export function videoFooterAction(input: VideoFooterInput): FooterAction | undefined {
  const { script, voice, render, busy } = input;
  switch (input.step) {
    case 'brief':
      return briefAction(input.brief);
    case 'script':
      if (script.textAgentRunning) return wait('Preparando o roteiro…');
      if (input.anyJobRunning) return wait(WAIT_JOB);
      if (busy.approving) return wait('Validando o roteiro no VideoGo…');
      if (!script.available) {
        if (!script.promptPresent) return wait('Descreva o vídeo para preparar o roteiro');
        return act('prepare-script', 'Preparar roteiro', !input.agentBlocked);
      }
      if (script.invalid) return wait('Corrija os campos marcados');
      if (script.dirty) return act('save-approve-script', 'Salvar, aprovar e continuar');
      if (input.storyboardReady) return act('continue', 'Continuar');
      return act('approve-script', 'Aprovar roteiro e continuar', true, script.issuesCount > 0 ? `O VideoGo pode recusar: ${script.issuesCount} ${plural(script.issuesCount, 'pendência', 'pendências')}.` : undefined);
    case 'voice':
      if (input.anyJobRunning || busy.narrationGeneration) return wait('Aguarde o processo terminar');
      if (!voice.loaded) return wait('Carregando narração…');
      if (voice.dirty) return act('save-voice', 'Salvar narração', true, 'Salvar remove a aprovação da voz e o áudio das cenas editadas.');
      if (!input.storyboardReady) return act('go-script', 'Voltar e aprovar o roteiro', true, 'A narração só avança depois do roteiro aprovado. Aqui você pode editar o texto falado e gravar ou enviar áudio; a geração paga com ElevenLabs só abre depois da aprovação.');
      if (voice.mode === 'silent') return act('continue', 'Continuar sem narração');
      if (!voice.active) return wait('Escolha “Seguir sem narração” ou adicione voz às cenas');
      if (voice.strayScenes > 0) return wait('Há áudio órfão: envie, grave ou remova');
      if (voice.scenesMissingAudio > 0) {
        if (voice.voiceChosen && voice.elevenConfigured && !voice.anyManualAudio) return act('generate-audio', 'Gerar áudio com ElevenLabs');
        return wait(`Falta áudio em ${voice.scenesMissingAudio} ${plural(voice.scenesMissingAudio, 'cena', 'cenas')}: grave, envie ou gere`);
      }
      if (voice.audiosPendingApproval > 0) return act('approve-audio', 'Aprovar áudios e continuar');
      if (input.narrationBlocked) return wait('A narração ainda não está pronta: revise as cenas');
      return act('continue', 'Continuar');
    case 'render':
      if (render.rendering || busy.rendering) return wait('Renderizando…');
      if (input.anyJobRunning) return wait(WAIT_JOB);
      if (input.narrationBlocked) return wait('Volte à narração: ela não está pronta');
      if (render.audioCheckUnavailable) return wait('Não foi possível verificar o áudio do vídeo', 'Instale o FFprobe em Motores & Setup e tente de novo.');
      if (!input.compositionAuthored) return act('produce-video', 'Produzir cenas com Claude Opus 5.5', !input.agentBlocked, 'O render só usa cenas e animação feitas pelo Claude Opus 5.5. Depois, aprove o roteiro e renderize.');
      if (!input.storyboardReady) return act('approve-render', 'Aprovar roteiro e renderizar');
      if (!render.hasRender) return act('render', 'Renderizar vídeo');
      if (input.videoRevisionRequested) return act('render', 'Renderizar o vídeo corrigido');
      return act('go-review', 'Revisar o vídeo');
    case 'review':
      if (input.anyJobRunning) return wait(WAIT_JOB);
      if (input.videoRevisionRequested || !input.storyboardReady) return act('go-render', 'Ir para Renderizar', true, 'O roteiro mudou: aprove e renderize de novo. Para só entregar o vídeo já aprovado, abra Entrega pelas etapas acima.');
      if (!input.compositionAuthored) return act('go-render', 'Ir para Renderizar', true, 'Este vídeo saiu sem as cenas do Claude Opus 5.5. Peça revisão aqui ou produza com o Opus em Renderizar antes de aprovar.');
      if (!input.review.latestApproved) return wait('Aprove o vídeo ou peça revisão');
      return act('deliver', 'Ir para Entrega');
    default:
      return undefined;
  }
}
