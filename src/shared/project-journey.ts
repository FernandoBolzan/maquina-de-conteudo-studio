export type ProjectKind = 'image' | 'video';
export type JourneyStepId = 'brief' | 'texts' | 'images' | 'script' | 'voice' | 'render' | 'review' | 'export';
export type JourneyStepStatus = 'done' | 'current' | 'upcoming' | 'blocked' | 'running';

export interface JourneyVoiceState {
  selected: boolean;
  ready: boolean;
  needsKey: boolean;
}

export interface ProjectJourneyInput {
  kind: ProjectKind;
  hasBrief: boolean;
  hasScript: boolean;
  hasRender: boolean;
  outputs: { approved: boolean }[];
  textsApproved?: boolean;
  isRunning?: boolean;
  voice?: JourneyVoiceState;
}

export interface JourneyStep {
  id: JourneyStepId;
  title: string;
  status: JourneyStepStatus;
}

export interface ProjectJourney {
  steps: JourneyStep[];
  nextStep: JourneyStep;
  outputsReady: number;
  outputCount: number;
}

export function getProjectJourney(input: ProjectJourneyInput): ProjectJourney {
  const outputCount = input.outputs.length;
  const outputsReady = input.outputs.filter(output => output.approved).length;
  const scriptReady = input.hasScript;
  const voiceRequested = input.kind === 'video' && input.voice?.selected === true;
  const voiceReady = !voiceRequested || input.voice?.ready === true;
  const definitions: Omit<JourneyStep, 'status'>[] = input.kind === 'image'
    ? [
        { id: 'brief', title: 'Definir a pauta' },
        { id: 'texts', title: 'Textos' },
        { id: 'images', title: 'Gerar imagens' },
        { id: 'review', title: 'Revisar imagem a imagem' },
        { id: 'export', title: 'Entregar' },
      ]
    : [
        { id: 'brief', title: 'Definir a pauta' },
        { id: 'script', title: 'Preparar o roteiro' },
        { id: 'voice', title: 'Narração e voz' },
        { id: 'render', title: 'Renderizar no VideoGo' },
        { id: 'review', title: 'Revisar o vídeo' },
        { id: 'export', title: 'Entregar' },
      ];
  const completion: Record<JourneyStepId, boolean> = {
    brief: input.hasBrief,
    texts: input.textsApproved === true,
    images: outputCount > 0,
    script: scriptReady,
    voice: voiceReady,
    render: input.hasRender,
    review: outputCount > 0 && outputsReady === outputCount,
    export: false,
  };
  const blockedId: JourneyStepId | undefined = voiceRequested && input.voice?.needsKey === true && !voiceReady ? 'voice' : undefined;
  const currentIndex = definitions.findIndex(step => !completion[step.id] || step.id === 'export');
  const steps = definitions.map((definition, index): JourneyStep => {
    const status: JourneyStepStatus = completion[definition.id]
      ? 'done'
      : definition.id === blockedId
        ? 'blocked'
        : index === currentIndex
          ? input.isRunning ? 'running' : 'current'
          : 'upcoming';
    return { ...definition, status };
  });
  const nextStep = steps.find(step => step.status === 'current' || step.status === 'blocked' || step.status === 'running') ?? steps.at(-1)!;
  return { steps, nextStep, outputsReady, outputCount };
}
