import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, AudioLines, BookOpen, Check, CheckCheck, ChevronLeft, ChevronRight, FileText, Film, FolderOpen, Image, Layers, Mic2, Play, Plus, Save, Send, Sparkles, TerminalSquare, WandSparkles } from 'lucide-react';
import { VIDEO_AGENT_EFFORT, VIDEO_AGENT_MODEL, postNowFormatAcceptsPageCount, type Asset, type ElevenLabsVoice, type Job, type NarrationState, type PostNowFormatId, type Project, type ProjectDetail, type ProjectFormatId, type Provider } from '../shared/contracts';
import { Empty, ErrorNotice, Loading } from './components';
import { errorMessage, invoke, useJobs, type ScreenProps } from './state';
import { ActivityCard } from './Console';
import { MODEL_CATALOG } from './model-catalog';
import { PromptLibrary } from './PromptLibrary';
import { getProjectJourney, type JourneyStepId } from './project-journey';
import { AgentQuestionsDialog, DeliveryOptions, ImageReviewGrid, StepBar, StepNav, StepShell, type ImageReviewItem, type StepBarItem } from './studio-steps';
import { NarrationTeleprompter } from './NarrationTeleprompter';
import { LOGO_POLICY_OPTIONS, isLogoPolicy, type LogoPolicy } from '../shared/logo-policy';
import { composeAgentFollowUp, formatAgentAnswers, lastAgentMessage, parseAgentQuestions, type AgentAnswer } from '../shared/agent-followup';
import { GenerationProgress, type GenerationProgressState } from './GenerationProgress';
import { VisualTextEditor } from './VisualTextEditor';
import { VideoSceneEditor, type StoryboardSceneText } from './VideoSceneEditor';
import type { VisualTextEditPage, VisualTextEditScene } from '../shared/visual-text';
import { hasTextContent, shouldAutoStartTextGeneration } from '../shared/text-generation';
import { DEFAULT_POSTNOW_FORMAT, POSTNOW_FORMATS, isPostNowFormat } from '../shared/formats';

function Media({ projectId, asset }: { projectId: string; asset: Asset }) {
  const [content, setContent] = useState<string | null>(null);
  const [textError, setTextError] = useState('');
  useEffect(() => {
    if (asset.kind !== 'file') return;
    let active = true;
    setContent(null);
    setTextError('');
    void invoke<{ content: string }>('projects.readText', { id: projectId, path: asset.path })
      .then(res => { if (active) setContent(res.content); })
      .catch(err => { if (active) setTextError(errorMessage(err)); });
    return () => { active = false; };
  }, [projectId, asset.kind, asset.path]);

  if (asset.kind === 'image') return <img className="media-image" src={asset.url} alt={asset.name} />;
  if (asset.kind === 'video') return <video className="media-video" src={asset.url} controls preload="metadata" aria-label={asset.name} />;
  if (asset.kind === 'audio') return <div className="audio-preview"><AudioLines size={52} strokeWidth={1} /><p>{asset.name}</p><audio src={asset.url} controls preload="metadata" aria-label={asset.name} /></div>;
  return (
    <div className="text-preview-wrap">
      <div className="text-preview-head">
        <FileText size={16} className="icon-ok" />
        <strong>{asset.name}</strong>
      </div>
      {textError ? (
        <p className="muted">{textError}</p>
      ) : content === null ? (
        <p className="muted">Carregando arquivo…</p>
      ) : (
        <pre className="text-preview-box">{content || '(arquivo vazio)'}</pre>
      )}
    </div>
  );
}

const STEP_DESCRIPTION: Record<JourneyStepId, string> = {
  brief: 'Defina o assunto, o público e a direção antes de produzir.',
  texts: 'Revise a headline e a copy de cada página, confira as fontes e aprove esta versão para liberar a geração das imagens.',
  images: 'O Codex gera as artes a partir dos textos aprovados. O PostNow ajusta formato e logo e prepara a rodada para revisão.',
  script: 'O agente prepara o roteiro e as cenas do vídeo. Revise antes de seguir para a narração.',
  voice: 'A narração é opcional. Se usar voz ElevenLabs, aprove o texto e a voz antes de qualquer chamada paga.',
  render: 'O VideoGo monta o vídeo a partir do roteiro e das imagens. A renderização só começa quando você clica.',
  review: 'Assista à prévia e aprove o vídeo para liberar a entrega.',
  export: 'Escolha como entregar os arquivos aprovados: ZIP ou pasta. Opcional: criar um projeto de vídeo a partir das imagens.',
};

function toReviewItem(asset: Asset): ImageReviewItem {
  return { path: asset.path, name: asset.name, url: asset.url, decision: asset.redo ? 'redo' : asset.approved ? 'kept' : 'pending', note: asset.redo?.note ?? '' };
}

function progressStateFor(job: Job): GenerationProgressState {
  if (job.status === 'running') return 'running';
  if (job.status === 'succeeded') return 'succeeded';
  if (job.status === 'cancelled') return 'cancelled';
  return 'failed';
}

function narrationChanged(saved: NarrationState | null, draft: NarrationState | null): boolean {
  return Boolean(saved && draft && (
    saved.voiceId !== draft.voiceId ||
    saved.scenes.length !== draft.scenes.length ||
    saved.scenes.some((scene, index) => scene.id !== draft.scenes[index]?.id || scene.narration !== draft.scenes[index]?.narration || scene.spokenText !== draft.scenes[index]?.spokenText)
  ));
}

export function Studio({ id, snapshot, run, busy, confirm, choose, refresh, openJob, onOpen, onBack, initialPrompt, onOpenVoiceSetup, onOpenTerminal, onDirtyChange }: ScreenProps & { id: string; initialPrompt: string; onOpen: (id: string, initialPrompt?: string) => void; onOpenVoiceSetup: () => void; onOpenTerminal: (job: Job) => void; onBack: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [selectedBatchId, setSelectedBatchId] = useState('latest');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [derivedFormat, setDerivedFormat] = useState<ProjectFormatId>('reels');
  const [deliveryFormat, setDeliveryFormat] = useState<'youtube' | 'reels' | 'feed-square'>('reels');
  const [notes, setNotes] = useState('');
  const [storyboardDirty, setStoryboardDirty] = useState(false);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [videoCorrection, setVideoCorrection] = useState('');
  const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>(detail?.kind === 'video' ? 'claude' : snapshot.settings.provider);
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [editor, setEditor] = useState<'brief' | 'notes'>('brief');
  const [narration, setNarration] = useState<NarrationState | null>(null);
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [voiceError, setVoiceError] = useState('');
  const [narrationError, setNarrationError] = useState('');
  const [narrationDraft, setNarrationDraft] = useState<NarrationState | null>(null);
  const [narrationJobId, setNarrationJobId] = useState<string | null>(null);
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const [teleprompterIndex, setTeleprompterIndex] = useState(0);
  const [localVoiceModel, setLocalVoiceModel] = useState('');
  const [trackedJobId, setTrackedJobId] = useState<string | null>(null);
  const [storyboardScenes, setStoryboardScenes] = useState<StoryboardSceneText[] | null>(null);
  const [storyboardError, setStoryboardError] = useState('');
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [closedAgentJobId, setClosedAgentJobId] = useState<string | null>(null);
  const [visualTextDirty, setVisualTextDirty] = useState(false);
  const [adaptationStarting, setAdaptationStarting] = useState(false);
  const [adaptationError, setAdaptationError] = useState('');
  const adaptationLock = useRef(false);
  const rootPromptRef = useRef('');
  const narrationRef = useRef<{ saved: NarrationState | null; draft: NarrationState | null }>({ saved: null, draft: null });
  narrationRef.current = { saved: narration, draft: narrationDraft };
  const jobs = useJobs();
  const projectJobs = jobs.filter(job => job.projectId === id);
  const running = projectJobs.find(job => job.status === 'running');
  const runningJobId = running?.id;
  const lastRunningJobId = useRef<string | undefined>(undefined);
  const narrationJobStatus = projectJobs.find(job => job.id === narrationJobId)?.status;
  const trackedJob = running ?? projectJobs.find(job => job.id === trackedJobId);
  const recommendedModel = detail?.kind === 'video' ? VIDEO_AGENT_MODEL : provider === 'codex' ? 'gpt-6-luna' : 'sonnet';
  const selectedModel = model === 'custom' ? customModel.trim() : model || recommendedModel;
  const selectedModelInfo = MODEL_CATALOG[provider].find(option => option.id === selectedModel);

  useEffect(() => {
    let active = true;
    setDetail(null); setLoadError(''); setNarration(null); setNarrationDraft(null); setNarrationJobId(null); setDerivedFormat('reels');
    setSelectedStepId(null); setVisualTextDirty(false); setAdaptationError(''); rootPromptRef.current = '';
    void invoke<ProjectDetail>('projects.detail', { id }).then(project => {
      if (active) { setDetail(project); setBrief(project.brief); setNotes(project.notes); setDeliveryFormat(project.format === 'youtube' ? 'youtube' : project.format === 'feed-square' ? 'feed-square' : 'reels'); }
    }).catch(error => { if (active) setLoadError(errorMessage(error)); });
    return () => { active = false; };
  }, [id, reload]);

  useEffect(() => {
    let active = true;
    void invoke<ProjectDetail>('projects.detail', { id }).then(project => { if (active) setDetail(project); }).catch(error => { if (active) setLoadError(errorMessage(error)); });
    return () => { active = false; };
  }, [id, snapshot]);
  useEffect(() => {
    if (detail?.formatAdaptation && running?.agentSession) setTrackedJobId(running.id);
  }, [detail?.formatAdaptation, running?.id, running?.agentSession]);
  useEffect(() => {
    if (!trackedJobId || !trackedJob || trackedJob.status === 'running') return;
    let active = true;
    void invoke<ProjectDetail>('projects.detail', { id }).then(project => { if (active) setDetail(project); }).catch(error => { if (active) setAdaptationError(errorMessage(error)); });
    return () => { active = false; };
  }, [id, trackedJobId, trackedJob?.id, trackedJob?.status]);
  // Qualquer job do projeto que termina (agente, render, narração) pode mudar o storyboard e os assets: recarrega o detalhe.
  useEffect(() => {
    const finishedJob = lastRunningJobId.current;
    lastRunningJobId.current = runningJobId;
    if (!finishedJob || runningJobId) return;
    let active = true;
    void invoke<ProjectDetail>('projects.detail', { id }).then(project => { if (active) setDetail(project); }).catch(error => { if (active) setLoadError(errorMessage(error)); });
    return () => { active = false; };
  }, [id, runningJobId]);
  useEffect(() => {
    if (!detail || detail.kind !== 'video') { setNarration(null); return; }
    let active = true;
    setNarrationError('');
    void invoke<NarrationState>('projects.narration', { id })
      .then(value => {
        if (!active) return;
        if (narrationChanged(narrationRef.current.saved, narrationRef.current.draft)) {
          setNarrationError('O projeto mudou enquanto você editava a narração. Suas alterações foram preservadas; revise e salve antes de continuar.');
          return;
        }
        setNarration(value); setNarrationDraft(value);
      })
      .catch(error => { if (active) setNarrationError(errorMessage(error)); });
    return () => { active = false; };
  }, [detail?.kind, detail?.storyboardAvailable, id, reload, trackedJob?.id, trackedJob?.status]);

  useEffect(() => {
    if (detail?.kind !== 'video' || !detail.storyboardAvailable) { setStoryboardScenes(null); setStoryboardError(''); return; }
    let active = true;
    setStoryboardError('');
    void invoke<{ scenes: StoryboardSceneText[] }>('projects.storyboard', { id })
      .then(result => { if (active) setStoryboardScenes(result.scenes); })
      .catch(error => { if (active) setStoryboardError(errorMessage(error)); });
    return () => { active = false; };
  }, [detail, id]);

  useEffect(() => {
    if (!narrationJobId || !narrationJobStatus || narrationJobStatus === 'running') return;
    let active = true;
    void (async () => {
      let latest: NarrationState | undefined;
      const attempts = narrationJobStatus === 'succeeded' ? 20 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        latest = await invoke<NarrationState>('projects.narration', { id });
        if (!active) return;
        if (latest.audioReady || narrationJobStatus !== 'succeeded') break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!active || !latest) return;
      const updatedProject = await invoke<ProjectDetail>('projects.detail', { id });
      if (!active) return;
      setDetail(updatedProject);
      setNarration(latest); setNarrationDraft(latest);
      if (narrationJobStatus === 'succeeded' && !latest.audioReady) setNarrationError('O VideoGo terminou, mas a associação dos áudios ainda não foi confirmada. Recarregue o projeto e revise os assets.');
      setNarrationJobId(null);
    })().catch(error => { if (active) setNarrationError(errorMessage(error)); });
    return () => { active = false; };
  }, [id, narrationJobId, narrationJobStatus]);
  useEffect(() => {
    if (detail?.kind === 'video') {
      setProvider('claude');
      setModel('');
    }
  }, [detail?.kind]);

  useEffect(() => {
    let active = true;
    setVoiceError('');
    if (!snapshot.integrations.elevenLabs.configured) { setVoices([]); return; }
    void invoke<ElevenLabsVoice[]>('elevenlabs.voices')
      .then(value => { if (active) setVoices(value); })
      .catch(error => { if (active) setVoiceError(errorMessage(error)); });
    return () => { active = false; };
  }, [snapshot.integrations.elevenLabs.configured]);

  const studioDirty = Boolean(detail) && (brief !== detail?.brief || notes !== detail?.notes || narrationChanged(narration, narrationDraft) || visualTextDirty);
  const dirtyListener = useRef(onDirtyChange);
  useEffect(() => { dirtyListener.current = onDirtyChange; }, [onDirtyChange]);
  useEffect(() => { dirtyListener.current(studioDirty); }, [studioDirty]);
  // Sair do Studio (ou trocar de projeto) precisa saber se há rascunho não salvo; o App pede confirmação.
  useEffect(() => () => dirtyListener.current(false), []);
  if (loadError) return <><button className="button ghost" onClick={onBack}><ArrowLeft size={16} />Projetos</button><ErrorNotice message={loadError} /><button className="button" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></>;
  if (!detail) return <Loading label="Abrindo projeto…" />;

  const project = detail;
  const selectedDerivedFormat: ProjectFormatId = project.kind === 'image'
    ? (derivedFormat === 'reels' || derivedFormat === 'story' || derivedFormat === 'feed-square' || derivedFormat === 'youtube' ? derivedFormat : 'reels')
    : (derivedFormat === 'story-9x16' ? derivedFormat : 'story-9x16');
  const batches = project.batches ?? [];
  const latestBatch = batches[0];
  const activeBatchId = selectedBatchId === 'all' ? undefined : selectedBatchId === 'latest' ? latestBatch?.id : selectedBatchId;
  const selectedBatch = batches.find(batch => batch.id === activeBatchId);
  const legacyAssets = project.assets.filter(asset => asset.kind === 'image' && /^generated\/slide-\d+\.png$/i.test(asset.name));
  const insufficientCarousel = project.kind === 'image' && project.format?.startsWith('carousel-') === true && Boolean(selectedBatch && selectedBatch.sourceCount > 0 && selectedBatch.sourceCount < 3);
  const imageAssets = selectedBatchId === 'all'
    ? project.assets.filter(asset => asset.kind === 'image')
    : selectedBatch?.assets ?? legacyAssets;
  const visualReview = project.visualReview;
  const videoAssets = project.assets.filter(asset => asset.kind === 'video');
  const approvedVideoAssets = videoAssets.filter(asset => asset.approved);
  const postNowDerivationFits = postNowFormatAcceptsPageCount(selectedDerivedFormat, videoAssets.length);
  const visibleAssets = project.kind === 'image' ? imageAssets : project.assets;
  const selected = visibleAssets.find(asset => asset.path === selectedPath) ?? visibleAssets.find(asset => asset.kind === 'image' || asset.kind === 'video') ?? visibleAssets[0];
  const reviewVideos = project.assets.filter(asset => asset.kind === 'video'
    && /^renders\/(?:review|final)\//i.test(asset.name.replace(/\\/g, '/'))
    && (narration?.mode === 'silent' || (narration?.mode === 'narrated' && asset.hasAudio === true)))
    .sort((a, b) => b.name.localeCompare(a.name));
  const reviewSelected = reviewVideos.find(asset => asset.path === selectedPath) ?? reviewVideos[0];
  const visualIndex = reviewSelected ? reviewVideos.findIndex(asset => asset.path === reviewSelected.path) : -1;
  const audioCheckUnavailable = project.assets.some(asset => asset.kind === 'video' && /^renders\/(?:review|final)\//i.test(asset.name.replace(/\\/g, '/')) && asset.hasAudio === undefined);
  const approved = project.assets.filter(asset => asset.approved);
  const deliveryAssets = project.kind === 'video' ? project.assets.filter(asset => /^delivery\/(?:cover-(?:youtube|reels|feed-square)\.png|copy-(?:youtube|reels|feed-square)\.txt)$/.test(asset.name)) : [];
  const dirty = brief !== project.brief || notes !== project.notes;
  const brand = snapshot.brands.find(item => item.id === project.brandId);
  const narrationDirty = narrationChanged(narration, narrationDraft);
  const narrationBlocked = !narration || narrationDirty || !narration.ready || (narration.mode === 'narrated' && !narration.active);
  const expectedImageCount = visualReview?.pages.length ?? 0;
  const renderInputsReady = project.kind === 'image'
    ? Boolean(selectedBatch && expectedImageCount > 0 && selectedBatch.sourceCount === expectedImageCount && !insufficientCarousel && visualReview?.ready && visualReview.approved && selectedBatch.assets.length === 0)
    : (project.storyboardReady === true || project.storyboardAvailable === true) && !narrationBlocked;
  const canDerive = project.kind === 'image'
    ? selectedBatchId !== 'all' && expectedImageCount > 0 && (selectedBatch
      ? selectedBatch.status?.state === 'ready' && selectedBatch.sourceCount === expectedImageCount && selectedBatch.assets.length === expectedImageCount && selectedBatch.assets.every(asset => asset.approved)
      : batches.length === 0 && legacyAssets.length === expectedImageCount && legacyAssets.length > 0 && legacyAssets.every(asset => asset.approved))
    : project.storyboardReady === true && videoAssets.length > 0 && approvedVideoAssets.length === videoAssets.length && postNowDerivationFits;
  const renderBlockMessage = project.kind === 'image'
    ? selectedBatchId === 'all' ? 'Selecione uma versão específica para preparar no PostNow; “Todas as versões” é apenas uma visualização.'
      : !selectedBatch ? 'Importe as imagens para criar uma rodada antes de preparar no PostNow.'
      : expectedImageCount < 1 ? 'Defina e aprove as páginas do roteiro visual antes de preparar imagens.'
      : selectedBatch.sourceCount !== expectedImageCount ? `Esta rodada tem ${selectedBatch.sourceCount} imagem(ns)-fonte; o roteiro exige ${expectedImageCount}.`
      : !visualReview?.ready ? 'Corrija os itens pendentes da revisão visual antes de preparar as imagens.'
      : !visualReview.approved ? 'Aprove os textos e as fontes antes de preparar as imagens.'
      : selectedBatch.assets.length > 0 ? 'Esta rodada já contém saídas. Apague as saídas que não deseja manter e crie uma nova rodada para renderizar novamente.'
      : ''
    : !project.storyboardReady ? (project.storyboardIssues?.length ? `Storyboard inválido: ${project.storyboardIssues[0]}` : 'Conclua e aprove o storyboard no VideoGo antes de renderizar.')
      : narrationBlocked ? 'Salve e aprove a narração e os áudios das cenas antes de renderizar o vídeo.'
      : '';
  const deriveBlockMessage = project.kind === 'image'
    ? selectedBatchId === 'all' ? 'Escolha uma versão específica: não misturamos rodadas diferentes num mesmo projeto de vídeo.'
      : selectedBatch && selectedBatch.status?.state !== 'ready' ? selectedBatch.status?.message ?? 'Conclua e verifique esta rodada no PostNow antes de derivar.'
      : selectedBatch && (selectedBatch.sourceCount !== expectedImageCount || selectedBatch.assets.length !== expectedImageCount) ? 'A rodada não contém todas as imagens exigidas pelo roteiro.'
      : selectedBatch && !selectedBatch.assets.every(asset => asset.approved) ? 'Aprove todas as imagens desta versão antes de converter.'
      : !selectedBatch && batches.length > 0 ? 'Selecione uma versão específica; “Todas as versões” não pode ser convertida.'
      : legacyAssets.length > 0 && legacyAssets.length !== expectedImageCount ? 'As imagens não formam o conjunto completo exigido pelo roteiro; crie ou selecione uma rodada completa.'
      : legacyAssets.length === 0 ? 'Gere ou importe imagens para criar uma derivação VideoGo.'
      : 'Aprove todas as imagens antes de converter para VideoGo.'
    : !project.storyboardReady ? 'Finalize o storyboard do VideoGo antes de extrair imagens.'
      : videoAssets.length === 0 ? 'Gere e aprove um vídeo VideoGo antes de extrair imagens para o PostNow.'
      : approvedVideoAssets.length !== videoAssets.length ? 'Aprove todas as saídas de vídeo antes de extrair imagens para o PostNow.'
      : !postNowDerivationFits ? videoAssets.length === 1
        ? 'Uma mídia pode virar Post ou Story; selecione um desses formatos. Carrossel exige de 3 a 10 mídias.'
        : `O PostNow aceita Post/Story com 1 mídia ou carrossel com 3 a 10; esta seleção contém ${videoAssets.length} mídias.`
      : '';
  const journeyOutputAssets = project.kind === 'image'
    ? (selectedBatchId === 'all' ? [] : selectedBatch ? (selectedBatch.status?.state === 'ready' ? selectedBatch.assets : []) : legacyAssets)
    : reviewVideos;
  // VideoGo's CLI names renders with <storyboard-id>-<timestamp>-<8-char-id>.mp4;
  // the FFmpeg carousel derivation is deliberately named derived.mp4 instead.
  const hasVideoGoRender = project.kind === 'video' && reviewVideos.some(asset =>
    /(?:^|\/)renders\/(?:review|final)\/[^/]+-\d{13}-[a-f0-9]{8}(?:-with-audio)?\.mp4$/i.test(asset.name.replace(/\\/g, '/')),
  );
  const journey = getProjectJourney({
    kind: project.kind,
    hasBrief: Boolean(project.brief.trim()) && !dirty,
    hasScript: project.kind === 'video' ? project.storyboardAvailable === true : Boolean(visualReview?.ready),
    hasRender: project.kind === 'image' ? journeyOutputAssets.length > 0 : hasVideoGoRender,
    outputs: journeyOutputAssets.map(asset => ({ approved: asset.approved })),
    textsApproved: Boolean(visualReview?.approved && !project.formatAdaptation && !adaptationStarting),
    isRunning: Boolean(running),
    voice: {
      selected: true,
      ready: !narrationBlocked,
      needsKey: narration?.mode !== 'silent' && Boolean(narration?.voiceId) && !snapshot.integrations.elevenLabs.configured,
    },
  });
  const selectedVoice = voices.find(voice => voice.id === narrationDraft?.voiceId);
  const stepItems: StepBarItem[] = journey.steps.map(step => ({ id: step.id, title: step.title, status: step.status, reachable: step.status !== 'upcoming' || (step.id === 'export' && (project.kind === 'video' || approved.length > 0)) }));
  const activeStepId = stepItems.find(item => item.id === selectedStepId && item.reachable)?.id ?? journey.nextStep.id;
  const activeStep = journey.steps.find(step => step.id === activeStepId) ?? journey.nextStep;
  const activeIndex = journey.steps.findIndex(step => step.id === activeStep.id);
  const previousStep = activeIndex > 0 ? stepItems[activeIndex - 1] : undefined;
  const followingStep = stepItems[activeIndex + 1];
  const briefDirty = activeStep.id === 'brief' && dirty;
  const batchBlocked = project.kind === 'image' && (activeStep.id === 'images' || activeStep.id === 'review') && latestBatch !== undefined && latestBatch.status?.state !== 'ready';
  const reviewBlockMessage = running ? 'Há um processo em andamento. Acompanhe-o antes de revisar.' : !latestBatch ? 'Gere as imagens antes de revisar.' : !latestBatch.status ? 'Esta versão antiga não tem comprovação de processamento completo. Gere as imagens novamente para prepará-la.' : latestBatch.status.state !== 'ready' ? (latestBatch.status.message ?? 'Aguarde a rodada ficar pronta para revisar.') : undefined;
  const nextLabel = briefDirty ? 'Salvar e continuar' : 'Próximo';
  const stepAccepts = activeStep.id === 'texts' || activeStep.id === 'script' || activeStep.id === 'voice';
  const stepAcceptReady = activeStep.id === 'texts' ? Boolean(visualReview?.ready) && !visualTextDirty && !project.formatAdaptation && !adaptationStarting
    : activeStep.id === 'script' ? project.storyboardAvailable === true && !storyboardDirty
    : narration?.mode === 'silent' || (Boolean(narration?.audioReady || narration?.ready) && !narrationDirty);
  const stepReadyToAdvance = stepAccepts ? !running && stepAcceptReady : activeStep.status === 'done';
  const nextDisabled = !briefDirty && (batchBlocked || !stepReadyToAdvance);
  const nextAction = !followingStep ? undefined : briefDirty ? async () => { if (await save()) selectStep(followingStep.id); } : async () => { if (await acceptActiveStep()) selectStep(followingStep.id); };
  const stepHint = briefDirty ? 'Você tem alterações no briefing ainda não salvas.' : batchBlocked ? reviewBlockMessage : activeStep.status === 'running' ? 'Aguarde o processo em andamento terminar.' : followingStep && activeStep.status !== 'done' ? 'Conclua esta etapa para liberar a próxima.' : undefined;
  const stepDescription = project.kind === 'image' && activeStep.id === 'review' ? 'Marque cada imagem como Manter ou Refazer. Refazer gera uma nova versão só dessas imagens.' : project.kind === 'video' && activeStep.id === 'script' && project.storyboardAvailable && !project.storyboardReady ? 'O roteiro está disponível para edição e narração, mas ainda precisa de revisão no VideoGo antes do render.' : project.kind === 'video' && activeStep.id === 'export' ? 'Gere e revise copy e capas por formato. Entregue os arquivos aprovados em ZIP ou pasta.' : STEP_DESCRIPTION[activeStep.id];
  const videoCorrectionBlock = project.kind === 'video' && project.storyboardAvailable ? (
    <div className="video-correction">
      <p className="field-help">Pedir correção altera o storyboard e volta o roteiro a rascunho. Depois, aprove o roteiro e renderize de novo.</p>
      <label htmlFor="video-correction">O que corrigir no vídeo?</label>
      <textarea id="video-correction" className="project-editor" rows={3} value={videoCorrection} disabled={Boolean(running) || busy.has('agent')} onChange={event => setVideoCorrection(event.target.value)} placeholder="Ex.: trocar o título da cena 2; a fonte da estatística está errada." />
      <button type="button" className="button secondary small" disabled={!videoCorrection.trim() || Boolean(running) || busy.has('agent')} onClick={() => { void requestVideoCorrection(); }}>Pedir correção ao agente</button>
    </div>
  ) : null;
  const reviewItems = latestBatch ? latestBatch.assets.map(toReviewItem) : [];
  const reviewEditable = project.kind === 'image' && latestBatch?.status?.state === 'ready' && !running && reviewItems.length > 0;
  const keptCount = reviewItems.filter(item => item.decision === 'kept').length;
  const redoCount = reviewItems.filter(item => item.decision === 'redo').length;
  const pendingCount = reviewItems.filter(item => item.decision === 'pending').length;
  const canReviseImages = reviewEditable && redoCount > 0 && pendingCount === 0 && Boolean(visualReview?.approved);
  const canGenerateImages = !running && !adaptationStarting && !project.formatAdaptation && !visualTextDirty && !busy.has('image-generation') && Boolean(visualReview?.ready && visualReview.approved);
  const imageGenerationMessage = project.formatAdaptation || adaptationStarting ? 'Adapte e revise os textos na etapa anterior antes de gerar imagens.' : visualTextDirty ? 'Salve ou descarte as alterações em Textos antes de gerar imagens.' : running ? 'Há um processo em andamento. Acompanhe-o antes de gerar imagens.' : !visualReview?.approved ? 'Aprove os textos na etapa anterior para liberar a geração.' : latestBatch?.status?.state === 'failed' ? (latestBatch.status.message ?? 'A última rodada está incompleta. Gere as imagens novamente.') : 'O Codex gera as artes a partir dos textos aprovados. O PostNow aplica formato e logo. Nenhum vídeo é iniciado.';
  const visibleImageItems = visibleAssets.map(toReviewItem);
  const agentJobs = projectJobs.filter(job => job.agentSession).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const agentQuestionsJob = running ? undefined : agentJobs.find(job => job.status === 'succeeded');
  const agentQuestionsMessage = agentQuestionsJob ? lastAgentMessage(agentQuestionsJob.log) : '';
  const agentQuestions = parseAgentQuestions(agentQuestionsMessage);
  const agentQuestionsClosed = agentQuestions.length > 0 && agentQuestionsJob?.id === closedAgentJobId;
  const agentQuestionsOpen = agentQuestions.length > 0 && Boolean(agentQuestionsJob) && !agentQuestionsClosed;

  async function saveNarration(): Promise<boolean> {
    if (!narrationDraft) return false;
    const result = await run('save-narration', () => invoke<NarrationState>('projects.narration.save', {
      id, voiceId: narrationDraft.voiceId, scenes: narrationDraft.scenes,
    }), 'Narração salva no projeto.');
    if (result) { setNarration(result); setNarrationDraft(result); await refresh(); }
    return Boolean(result);
  }
  async function setNarrationMode(mode: 'silent' | 'narrated') {
    if (!narration || narration.mode === mode || narrationDirty) return;
    const result = await run('narration-mode', () => invoke<NarrationState>('projects.narration.setMode', { id, mode }));
    if (result) { setNarration(result); setNarrationDraft(result); setNarrationError(''); }
  }
  async function chooseLocalVoiceModel() {
    const path = await run('local-voice-model', () => invoke<string | undefined>('app.pick', { extensions: ['onnx'] }));
    if (path) setLocalVoiceModel(path);
  }
  async function generateLocalVoice(sceneId: string) {
    if (!localVoiceModel || narrationDirty || narration?.mode !== 'narrated') return;
    const scene = narration.scenes.find(item => item.id === sceneId);
    if (!scene?.narration.trim()) return;
    if ((scene.audioAttached || scene.stray) && !await confirm('Substituir áudio da cena?', 'A geração local substituirá o áudio atual desta cena. O novo áudio precisará de revisão e aprovação antes do render.', 'Gerar áudio local')) return;
    const result = await run('local-voice', () => invoke<NarrationState>('projects.narration.generateLocal', { id, sceneId, modelPath: localVoiceModel }), 'Áudio local gerado. Revise e aprove o arquivo antes do render.');
    if (result) { setNarration(result); setNarrationDraft(result); await refresh(); }
  }
  async function generateNarration() {
    if (!narration || narrationDirty || !narrationDraft?.voiceId || narration.mode === 'silent') return;
    const voice = voices.find(item => item.id === narrationDraft.voiceId);
    if (!await confirm('Gerar narração Eleven v4', `Isso aprova o texto e a voz ${voice?.name ?? narrationDraft.voiceId} e envia o texto ao ElevenLabs, o que pode consumir créditos. Os áudios enviados nas cenas narradas serão substituídos pelos gerados. Ao avançar, os áudios gerados são aprovados para o render.`, 'Gerar áudio')) return;
    if (!narration.approved) {
      const approved = await run('approve-narration', () => invoke<NarrationState>('projects.narration.approve', { id, approved: true }));
      if (!approved) return;
      setNarration(approved); setNarrationDraft(approved);
    }
    const job = await run('generate-narration', () => invoke<Job>('projects.narration.generate', { id, confirm: true }), 'Geração de áudio iniciada.');
    if (job) { setNarrationJobId(job.id); trackJob(job); }
  }
  async function attachSceneAudio(sceneId: string) {
    if (narrationDirty) { setNarrationError('Salve a narração antes de trocar o áudio de uma cena.'); return; }
    const picked = await run('narration-audio', () => invoke<string | undefined>('app.pick', { extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }));
    if (!picked) return;
    const state = await run('narration-audio', () => invoke<NarrationState>('projects.attachNarrationAudio', { projectId: id, sceneId, source: { kind: 'file', path: picked } }), 'Áudio da cena associado. Revise-o na prévia antes do render.');
    if (state) { setNarration(state); setNarrationDraft(state); await refresh(); }
  }
  async function removeSceneAudio(sceneId: string) {
    if (narrationDirty) { setNarrationError('Salve a narração antes de remover o áudio de uma cena.'); return; }
    if (!await confirm('Remover áudio da cena', 'O áudio desta cena será apagado do projeto e a cena ficará sem narração.', 'Remover áudio')) return;
    const state = await run('narration-audio', () => invoke<NarrationState>('projects.narration.removeAudio', { projectId: id, sceneId, confirm: true }), 'Áudio da cena removido.');
    if (state) { setNarration(state); setNarrationDraft(state); await refresh(); }
  }

  async function save(): Promise<boolean> {
    const previousBrief = project.brief;
    const result = await run('save-notes', async () => {
      await invoke('projects.notes', { id, notes, brief });
      setDetail(current => current ? { ...current, notes, brief } : current);
      await refresh();
      return true;
    }, 'Briefing e notas salvos.');
    if (!result) return false;
    // Pauta nova prepara os textos sozinha; o botão "Preparar textos" continua pedindo confirmação.
    if (!project.formatAdaptation && !adaptationStarting && shouldAutoStartTextGeneration({ kind: project.kind, previousBrief, nextBrief: brief, pages: visualReview?.pages ?? [], sessionRunning: Boolean(running) || busy.has('agent') })) {
      await startAgent({ request: imageRequestFor(brief), confirmed: true });
    }
    return true;
  }
  async function importAsset() {
    await run('import-asset', async () => {
      const selected = await invoke<string | string[] | undefined>('app.pick', { multiple: project.kind === 'image' });
      if (!selected || (Array.isArray(selected) && !selected.length)) return;
      const result = await invoke<ProjectDetail>('projects.importAsset', { id, ...(Array.isArray(selected) ? { paths: selected } : { path: selected }) });
      setDetail(result);
      setSelectedBatchId('latest');
      setSelectedPath(result.batches?.[0]?.assets[0]?.path ?? result.assets.find(a => a.kind === 'image' || a.kind === 'video')?.path ?? result.assets[0]?.path ?? null);
    });
  }
  async function deleteImage(asset: Asset) {
    if (!await confirm('Apagar imagem permanentemente?', `O arquivo ${asset.name} e a imagem-fonte associada, quando houver, serão removidos do disco. Se ele for uma imagem final de rodada, a rodada ficará incompleta e precisará ser gerada novamente antes de aprovar ou exportar. Esta ação não pode ser desfeita.`, 'Apagar imagem')) return;
    const result = await run('delete-image', () => invoke<ProjectDetail>('projects.deleteAsset', { id, path: asset.name, confirm: true }), 'Imagem apagada do projeto e do disco.');
    if (result) { setDetail(result); setSelectedPath(null); }
  }
  async function approve(asset: Asset) {
    const result = await run('approve', () => invoke<ProjectDetail>('projects.approve', { id, path: asset.path, approved: !asset.approved }));
    if (result) {
      setDetail(result);
      if (result.kind === 'video') {
        try {
          const state = await invoke<NarrationState>('projects.narration', { id });
          setNarration(state); setNarrationDraft(draft => narrationChanged(narration, draft) ? draft : state);
        } catch (error) { setNarrationError(errorMessage(error)); }
      }
    }
  }
  async function exportPackage() {
    const output = await run('export', async () => {
      const destination = await invoke<string | undefined>('app.pick', { directory: true });
      return destination ? invoke<string>('projects.export', { id, destination }) : undefined;
    });
    if (output && await confirm('Pacote exportado', `Os arquivos aprovados foram exportados para ${output}. Deseja abrir a pasta?`, 'Abrir pasta')) await invoke('app.open', { path: output });
  }
  async function saveZip() {
    const saved = await run('export-zip', async () => {
      const destination = await invoke<string | undefined>('app.pick', { directory: true });
      if (!destination) return undefined;
      const result = await invoke<{ path: string; files: number }>('projects.exportZip', { id, destination });
      return { folder: destination, file: result.path };
    });
    if (saved && await confirm('ZIP salvo', `O arquivo ${saved.file} foi criado. Deseja abrir a pasta?`, 'Abrir pasta')) await invoke('app.open', { path: saved.folder });
  }
  async function derive(targetKind: Project['kind']) {
    const format = selectedDerivedFormat;
    if (!await confirm('Derivar um novo projeto', `Converter este projeto em um novo projeto de ${targetKind === 'image' ? `imagem (${format})` : `vídeo (${format})`}? O projeto original será preservado.`, 'Criar derivação')) return;
    const result = await run('derive', () => invoke<Project>('projects.bridge', { id, kind: targetKind, format, ...(project.kind === 'image' && activeBatchId ? { batchId: activeBatchId } : {}) }), 'Projeto derivado com sucesso.');
    if (result) { await refresh(); onOpen(result.id); }
  }
  function chooseLogoPolicy(request: { title: string; description: string; action: string }): Promise<LogoPolicy | undefined> {
    return choose({ ...request, groupLabel: 'Onde aplicar a logo oficial?', options: LOGO_POLICY_OPTIONS, initial: 'cover-closing' }).then(value => (isLogoPolicy(value) ? value : undefined));
  }
  async function render() {
    if (project.kind === 'image') {
      const logoPolicy = await chooseLogoPolicy({
        title: 'Preparar imagens no PostNow',
        description: `O PostNow vai sincronizar a logo oficial da marca ${brand?.name ?? ''} e aplicá-la às imagens reais desta rodada, conforme a escolha abaixo. A revisão editorial e a aprovação para exportação continuam separadas. O PostNow não gera imagens por IA.`,
        action: 'Preparar no PostNow',
      });
      if (!logoPolicy) return;
      const job = await run('render', () => invoke<Job>('projects.render', { id, logoPolicy, ...(activeBatchId ? { batchId: activeBatchId } : {}) }), 'Preparando imagens no PostNow…');
      if (job) {
        trackJob(job);
        setSelectedPath(null);
      }
      return;
    }
    if (project.kind === 'video' && !project.storyboardReady) { await approveAndRenderVideo(); return; }
    if (!await confirm('Renderizar vídeo com VideoGo', `O VideoGo executará o storyboard no formato ${project.format ?? 'reels'} e gerará o vídeo MP4. A narração só é sintetizada após aprovação explícita.`, 'Iniciar renderização')) return;
    const job = await run('render', () => invoke<Job>('projects.render', { id }), 'Renderizando vídeo…');
    if (job) {
      trackJob(job);
      setSelectedPath(null);
    }
  }
  async function approveAndRenderVideo() {
    if (!await confirm('Aprovar roteiro e renderizar vídeo?', `Confirme que revisou cenas, textos, fatos e fontes. O VideoGo validará o storyboard, o aprovará e renderizará o MP4 no formato ${project.format ?? 'reels'}. A narração só é sintetizada após aprovação explícita.`, 'Aprovar e renderizar')) return;
    const approved = await run('approve-storyboard', () => invoke<ProjectDetail>('projects.storyboard.approve', { id, confirm: true }), 'Roteiro validado e aprovado.');
    if (!approved) return;
    setDetail(approved);
    const job = await run('render', () => invoke<Job>('projects.render', { id }), 'Renderizando vídeo…');
    if (job) { trackJob(job); setSelectedPath(null); }
  }
  async function requestVideoCorrection() {
    const request = videoCorrection.trim();
    if (!request) return;
    if (!await confirm('Pedir correção ao agente?', 'O agente altera o storyboard.json conforme o pedido e o roteiro volta a rascunho. Aprove de novo antes do render.', 'Pedir correção')) return;
    const correctionPrompt = [
      'Corrija o storyboard.json deste projeto de vídeo conforme o pedido abaixo.',
      'Mantenha a marca selecionada, o formato e as fontes verificadas. Altere somente o necessário.',
      'Não gere narração, não renderize e não marque o roteiro como ready.',
      '',
      'Pedido de correção:',
      request,
    ].join('\n');
    const job = await run('agent', () => invoke<Job>('agents.start', { id, provider, model: selectedModel || undefined, prompt: correctionPrompt, confirm: true }), 'Correção enviada ao agente.');
    if (job) { setVideoCorrection(''); setSelectedPath(null); trackJob(job); }
  }
  function imageRequestFor(briefText: string) { return [...new Set([initialPrompt.trim(), briefText.trim()])].filter(Boolean).join('\n\n'); }
  const imageRequest = imageRequestFor(project.brief);
  const agentRequest = project.kind === 'image' ? imageRequest : prompt.trim();
  async function startAgent(options?: { request?: string; confirmed?: boolean }) {
    const request = options?.request ?? agentRequest;
    if (!options?.confirmed) {
      const modelLabel = ` usando ${selectedModel}${provider === 'codex' ? ' · xhigh' : ''}`;
      const description = project.kind === 'image'
        ? 'Esta sessão prepara os textos das páginas e as fontes. A geração de imagens é uma ação separada e só fica disponível após sua revisão humana.'
        : 'O agente prepara roteiro e arquivos do projeto; a renderização VideoGo continua separada e explícita.';
      if (!await confirm(`Iniciar ${provider === 'codex' ? 'Codex' : 'Claude Code'}${modelLabel}`, description, 'Autorizar sessão')) return;
    }
    const job = await run('agent', () => invoke<Job>('agents.start', { id, provider, model: selectedModel || undefined, prompt: request, confirm: true }), 'Sessão de IA iniciada.');
    if (job) { rootPromptRef.current = request; setPrompt(''); setSelectedPath(null); trackJob(job); }
  }

  function trackJob(job: Job) {
    setTrackedJobId(job.id);
    openJob(job);
  }
  async function invokeEditor<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    try {
      return await invoke<T>(action, payload);
    } catch (error) {
      throw new Error(errorMessage(error));
    }
  }
  async function saveVisualText(pages: VisualTextEditPage[]) {
    setDetail(await invokeEditor<ProjectDetail>('projects.visual.save', { projectId: id, pages }));
  }
  async function saveStoryboardScenes(scenes: VisualTextEditScene[]) {
    setDetail(await invokeEditor<ProjectDetail>('projects.storyboard.save', { projectId: id, scenes }));
  }
  async function approveStoryboard(): Promise<boolean> {
    const result = await run('approve-storyboard', () => invoke<ProjectDetail>('projects.storyboard.approve', { id, confirm: true }), 'Roteiro validado e aprovado.');
    if (result) setDetail(result);
    return Boolean(result);
  }

  async function approveVisualContent(): Promise<boolean> {
    if (!visualReview || project.formatAdaptation || adaptationStarting || visualTextDirty) return false;
    const result = await run('approve-visual-content', () => invoke<ProjectDetail>('projects.visual.approve', { id, approved: true, contentHash: visualReview.contentHash }), 'Textos e fontes aprovados para esta versão.');
    if (result) setDetail(result);
    return Boolean(result);
  }

  async function acceptNarrationAudio(): Promise<boolean> {
    if (!narration || narrationDirty) return false;
    if (narration.mode === 'silent') return true;
    const pending = narration.scenes
      .map(scene => scene.audioPath ? project.assets.find(asset => asset.kind === 'audio' && asset.name === scene.audioPath) : undefined)
      .filter((asset): asset is Asset => asset !== undefined && !asset.approved);
    if (pending.length === 0) return true;
    for (const asset of pending) {
      const latest = await run('approve', () => invoke<ProjectDetail>('projects.approve', { id, path: asset.path, approved: true }));
      if (!latest) return false;
      setDetail(latest);
    }
    const state = await run('narration-refresh', () => invoke<NarrationState>('projects.narration', { id }));
    if (!state) return false;
    setNarration(state); setNarrationDraft(state);
    return true;
  }

  async function acceptActiveStep(): Promise<boolean> {
    if (activeStep.id === 'texts') return visualReview?.approved ? true : approveVisualContent();
    if (activeStep.id === 'script') return project.storyboardReady ? true : approveStoryboard();
    if (activeStep.id === 'voice') return acceptNarrationAudio();
    return true;
  }
  async function generateImages() {
    if (!visualReview?.ready || !visualReview.approved || project.formatAdaptation || adaptationStarting || visualTextDirty) return;
    const logoPolicy = await chooseLogoPolicy({
      title: 'Gerar imagens com Codex + PostNow',
      description: `O Codex GPT-6 Luna xhigh usará a ferramenta nativa de imagem para gerar ${visualReview.pages.length} ${visualReview.pages.length === 1 ? 'arte' : 'artes'} a partir dos textos aprovados. O PostNow ajustará o formato e aplicará a logo oficial conforme a escolha abaixo. Confira o enquadramento antes de aprovar. Esta ação não inicia vídeo.`,
      action: 'Gerar imagens',
    });
    if (!logoPolicy) return;
    const job = await run('image-generation', () => invoke<Job>('agents.generateImages', { id, confirm: true, logoPolicy }), 'Gerando artes no Codex…');
    if (job) { setSelectedPath(null); trackJob(job); }
  }
  async function startFormatAdaptation() {
    if (adaptationLock.current || running || busy.has('agent') || visualTextDirty) return;
    adaptationLock.current = true;
    setAdaptationStarting(true);
    setAdaptationError('');
    try {
      const job = await run('agent', () => invoke<Job>('agents.start', {
        id, provider, model: selectedModel || undefined, prompt: imageRequest, confirm: true, adaptation: true,
      }), 'Adaptação dos textos iniciada.');
      if (job) { setSelectedPath(null); trackJob(job); }
      else setAdaptationError('Não foi possível iniciar a adaptação. O conteúdo original continua preservado; tente novamente.');
    } finally {
      adaptationLock.current = false;
      setAdaptationStarting(false);
    }
  }
  async function retryFormatAdaptation() {
    if (!project.formatAdaptation || visualTextDirty || dirty || running || adaptationStarting || (model === 'custom' && !customModel.trim())) return;
    if (!await confirm('Tentar adaptação novamente?', `Uma nova sessão de IA adaptará o conteúdo original para ${POSTNOW_FORMATS[project.formatAdaptation.targetFormat].label}, com ${project.formatAdaptation.pageCount} ${project.formatAdaptation.pageCount === 1 ? 'página' : 'páginas'}. A sessão pode consumir sua cota. Revise e aprove os textos antes de gerar imagens.`, 'Autorizar adaptação')) return;
    await startFormatAdaptation();
  }
  async function chooseImageFormat(format: PostNowFormatId) {
    if (format === project.format || adaptationLock.current || running || busy.size > 0 || visualTextDirty || (model === 'custom' && !customModel.trim())) return;
    adaptationLock.current = true;
    setAdaptationStarting(true);
    try {
      if (!await confirm('Trocar formato e adaptar os textos?', `A IA adaptará todo o conteúdo existente para ${POSTNOW_FORMATS[format].label} em uma nova sessão, que pode consumir sua cota. A copy original será preservada para recuperação; você voltará a Textos para revisar e aprovar a adaptação antes de gerar imagens.`, 'Trocar e adaptar')) return;
      setAdaptationError('');
      if (dirty) {
        const saved = await run('save-notes', async () => {
          await invoke('projects.notes', { id, notes, brief });
          return true;
        });
        if (!saved) { setAdaptationError('Não foi possível salvar o briefing e as notas. O formato não foi alterado.'); return; }
      }
      const result = await run('image-format', () => invoke<ProjectDetail>('projects.imageFormat', { id, format }));
      if (!result) { setAdaptationError('Não foi possível alterar o formato. Os textos anteriores foram preservados.'); return; }
      setDetail(result);
      setSelectedStepId('texts');
      if (!result.formatAdaptation) return;
      const job = await run('agent', () => invoke<Job>('agents.start', {
        id, provider, model: selectedModel || undefined, prompt: imageRequestFor(brief), confirm: true, adaptation: true,
      }), 'Adaptação dos textos iniciada.');
      if (job) { setSelectedPath(null); trackJob(job); }
      else setAdaptationError('Não foi possível iniciar a adaptação. O conteúdo original continua preservado; tente novamente.');
    } finally {
      adaptationLock.current = false;
      setAdaptationStarting(false);
    }
  }
  async function openVoiceSetupSafely() {
    if (dirty) {
      if (!await confirm('Salvar alterações antes de abrir o setup?', 'O briefing ou as notas ainda não foram salvos. Salve antes de sair para não perder mudanças.', 'Salvar e continuar')) return;
      if (!await save()) return;
    }
    if (narrationDirty) {
      if (!await confirm('Salvar a narração antes de abrir o setup?', 'As alterações na voz ou no texto ainda não foram salvas. Salve para preservar seu trabalho; será necessário aprovar a narração novamente antes da síntese.', 'Salvar e continuar')) return;
      if (!await saveNarration()) return;
    }
    onOpenVoiceSetup();
  }
  function selectStep(stepId: string) {
    setSelectedStepId(stepId);
  }
  function openProjectFolder() {
    void run('open-project', () => invoke('app.open', { path: project.path }));
  }
  function findAsset(path: string): Asset | undefined {
    return project.assets.find(asset => asset.path === path) ?? batches.flatMap(batch => batch.assets).find(asset => asset.path === path);
  }
  async function keepImage(path: string) {
    const result = await run('review-image', () => invoke<ProjectDetail>('projects.approve', { id, path, approved: true }));
    if (result) setDetail(result);
  }
  async function redoImage(path: string, note: string) {
    const result = await run('review-image', () => invoke<ProjectDetail>('projects.review', { id, path, redo: true, note }));
    if (result) setDetail(result);
  }
  async function clearImageDecision(path: string) {
    const asset = findAsset(path);
    if (!asset) return;
    const result = await run('review-image', () => asset.redo ? invoke<ProjectDetail>('projects.review', { id, path, redo: false }) : invoke<ProjectDetail>('projects.approve', { id, path, approved: false }));
    if (result) setDetail(result);
  }
  function deleteImageByPath(path: string) {
    const asset = findAsset(path);
    if (asset) void deleteImage(asset);
  }
  async function reviseImages() {
    const logoPolicy = await chooseLogoPolicy({ title: 'Gerar nova versão das imagens marcadas', description: `O Codex refaz somente ${redoCount === 1 ? 'a imagem marcada' : `as ${redoCount} imagens marcadas`} para refazer e mantém as aprovadas. O PostNow ajusta formato e aplica a logo oficial conforme a escolha abaixo. Esta ação não inicia vídeo.`, action: 'Gerar nova versão' });
    if (!logoPolicy) return;
    const job = await run('image-revision', () => invoke<Job>('agents.reviseImages', { id, confirm: true, logoPolicy }), 'Gerando nova versão das imagens marcadas…');
    if (job) { setSelectedPath(null); trackJob(job); }
  }
  async function generateVideoDelivery(coverOnly = false) {
    const label = deliveryFormat === 'youtube' ? 'YouTube' : deliveryFormat === 'reels' ? 'Reels' : 'Feed quadrado';
    const what = coverOnly ? 'a capa' : 'capa e copy';
    if (!await confirm(`Gerar ${what} para ${label}`, `O Codex ImageGen cria a capa com o título, a pessoa das fotos de referência e as cores da marca; o Studio aplica a logo oficial por cima.${coverOnly ? ' A copy atual é mantida.' : ' Depois, o Claude Opus 5.5 escreve a copy.'} A geração pode consumir créditos. Arquivos anteriores deste formato, inclusive os aprovados, serão substituídos e precisarão de nova aprovação.`, `Gerar ${what}`)) return;
    const job = await run('video-delivery', () => invoke<Job>('agents.generateVideoDelivery', { id, format: deliveryFormat, coverOnly, confirm: true }), coverOnly ? 'Gerando capa no Codex ImageGen…' : 'Gerando capa no Codex ImageGen e copy no Claude…');
    if (job) trackJob(job);
  }
  async function generateVideoCopy() {
    const label = deliveryFormat === 'youtube' ? 'YouTube' : deliveryFormat === 'reels' ? 'Reels' : 'Feed quadrado';
    if (!await confirm(`Gerar só a copy para ${label}`, 'O Claude Opus 5.5 escreve a copy a partir do briefing e do storyboard. A capa atual é mantida. A copy anterior deste formato, se houver, será substituída e precisará de nova aprovação.', 'Gerar copy')) return;
    const job = await run('video-copy', () => invoke<Job>('agents.generateVideoCopy', { id, format: deliveryFormat, confirm: true }), 'Gerando copy no Claude…');
    if (job) trackJob(job);
  }
  async function answerAgent(answers: AgentAnswer[]): Promise<boolean> {
    const questionsJob = agentQuestionsJob;
    if (!questionsJob) return false;
    const answer = formatAgentAnswers(agentQuestions, answers);
    if (!await confirm(`Responder ao ${provider === 'codex' ? 'Codex' : 'Claude Code'}`, 'A resposta será enviada em uma nova sessão de IA neste projeto, com a mensagem anterior e a sua resposta. Confira o texto antes de enviar.', 'Enviar resposta')) return false;
    const job = await run('agent', () => invoke<Job>('agents.start', { id, provider, model: selectedModel || undefined, prompt: composeAgentFollowUp({ originalPrompt: rootPromptRef.current || 'Continue o pedido anterior deste projeto.', previousMessage: agentQuestionsMessage, answer }), confirm: true }), 'Resposta enviada ao agente.');
    if (!job) return false;
    setClosedAgentJobId(questionsJob.id);
    trackJob(job);
    return true;
  }

  return (
    <>
      {agentQuestionsOpen && agentQuestionsJob && (
        <AgentQuestionsDialog
          key={agentQuestionsJob.id}
          questions={agentQuestions}
          lastMessage={agentQuestionsMessage}
          busy={busy.has('agent')}
          onSend={(answers) => { void answerAgent(answers); }}
          onClose={() => setClosedAgentJobId(agentQuestionsJob.id)}
        />
      )}
      <div className="studio-breadcrumb">
        <button className="text-button" onClick={onBack}><ArrowLeft size={15} />Projetos</button>
        <span>/</span>
        <span>{project.title}</span>
      </div>

      <header className="studio-heading">
        <div>
          <div className="eyebrow">{project.kind === 'image' ? 'ESTÚDIO DE IMAGEM · POSTNOW' : 'ESTÚDIO DE VÍDEO · VIDEOGO'}{brand ? ` / ${brand.name}` : ''}</div>
          <h1>{project.title}</h1>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={openProjectFolder} disabled={busy.has('open-project')}>
            <FolderOpen size={16} />Abrir pasta
          </button>
          {agentQuestionsClosed && (
            <button className="button primary" onClick={() => setClosedAgentJobId(null)}>
              <Send size={16} aria-hidden="true" />Responder perguntas do agente
            </button>
          )}
        </div>
      </header>

      <StepBar label="Etapas do projeto" steps={stepItems} activeId={activeStep.id} onSelect={selectStep} />

      <div className="studio-layout">
        <StepShell
          eyebrow={`Etapa ${activeIndex + 1} de ${journey.steps.length}`}
          title={activeStep.title}
          description={stepDescription}
          footer={(
            <StepNav onBack={previousStep?.reachable ? () => selectStep(previousStep.id) : undefined} nextLabel={nextLabel} onNext={nextAction} nextDisabled={nextDisabled} hint={stepHint} />
          )}
        >
          {trackedJob && (
            <GenerationProgress title={trackedJob.title} job={trackedJob} state={progressStateFor(trackedJob)} onOpenTerminal={() => onOpenTerminal(trackedJob)} />
          )}
          {project.kind === 'video' && activeStep.id === 'review' && (
          <section className="preview-panel" id="project-preview">
            <div className="panel-heading">
              <h2><Layers size={16} />Prévia do conteúdo</h2>
              <div className="preview-toolbar">
                {reviewVideos.length > 1 && visualIndex >= 0 && (
                  <div className="carousel-nav-pills">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Slide anterior"
                      disabled={visualIndex <= 0}
                      onClick={() => setSelectedPath(reviewVideos[visualIndex - 1]!.path)}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span className="mono-note">{visualIndex + 1} / {reviewVideos.length}</span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Próximo slide"
                      disabled={visualIndex >= reviewVideos.length - 1}
                      onClick={() => setSelectedPath(reviewVideos[visualIndex + 1]!.path)}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                )}
                <span className="muted">{reviewVideos.length} vídeo{reviewVideos.length !== 1 ? 's' : ''}</span>
              </div>
            </div>

            <div className="media-stage">
              {reviewSelected ? (
                <Media key={reviewSelected.path} projectId={project.id} asset={reviewSelected} />
              ) : (
                <Empty icon={<Film />} headingLevel={3} title="Ainda não há vídeo para revisar">
                  {!narration ? 'Carregando o modo de narração…' : audioCheckUnavailable && narration.mode === 'narrated' ? 'Não foi possível verificar o áudio dos vídeos. Confira se o FFprobe está instalado e tente novamente.' : 'Nenhum vídeo compatível com o modo de narração foi encontrado. Renderize o vídeo na etapa anterior.'}
                </Empty>
              )}
            </div>

            {reviewSelected && (
              <div className="asset-review">
                <div>
                  <strong title={reviewSelected.name}>{reviewSelected.name}</strong>
                  <span>{reviewSelected.approved ? 'Aprovado para exportação' : 'Aguardando sua revisão'}</span>
                </div>
                <div className="heading-actions">
                  <button className={`button small ${reviewSelected.approved ? 'approved' : ''}`} disabled={busy.has('approve')} onClick={() => { void approve(reviewSelected); }}>
                    {reviewSelected.approved ? <CheckCheck size={15} /> : <Check size={15} />}
                    {reviewSelected.approved ? 'Remover aprovação' : 'Aprovar arquivo'}
                  </button>
                </div>
              </div>
            )}
          </section>
          )}

          {project.kind === 'video' && activeStep.id === 'review' && videoCorrectionBlock}

          {project.kind === 'video' && activeStep.id === 'voice' && (
            <section className="narration-panel" id="narration-panel">
              <div className="panel-heading">
                <h2><Mic2 size={17} />Narração e voz</h2>
                <div className="heading-actions">
                  <button type="button" className="button small secondary" disabled={!narration || narration.scenes.length === 0 || narrationDirty || Boolean(running) || busy.has('local-voice')} title={narrationDirty ? 'Salve a narração antes de gravar.' : undefined} onClick={() => { const pending = narration?.scenes.findIndex(scene => Boolean(scene.narration.trim()) && !scene.audioAttached) ?? -1; setTeleprompterIndex(Math.max(0, pending)); setTeleprompterOpen(true); }}>
                    <Mic2 size={14} />Modo Studio
                  </button>
                </div>
              </div>
              {!snapshot.integrations.elevenLabs.configured && (
                <div className="voice-setup-callout">
                  <p className="field-help">A voz é opcional. Configure sua API key, consulte vozes e veja os passos seguros para clonagem em Motores &amp; Setup. Eleven v4 só gera áudio depois da sua confirmação, e avançar aprova os áudios gerados.</p>
                  <button type="button" className="button small secondary" onClick={() => { void openVoiceSetupSafely(); }}><AudioLines size={14} />Configurar voz do VideoGo</button>
                </div>
              )}
              {voiceError && <ErrorNotice message={voiceError} />}
              {narrationError && <ErrorNotice message={narrationError} />}
              {!narrationDraft ? <p className="muted">Carregando narração…</p> : (
                <>
                  <fieldset className="narration-mode">
                    <legend>Como deseja seguir?</legend>
                    <label><input type="radio" name="narration-mode" checked={narration?.mode === 'narrated'} disabled={Boolean(running) || narrationDirty || busy.has('narration-mode') || busy.has('local-voice')} onChange={() => { void setNarrationMode('narrated'); }} /> Usar narração</label>
                    <label><input type="radio" name="narration-mode" checked={narration?.mode === 'silent'} disabled={Boolean(running) || narrationDirty || busy.has('narration-mode') || busy.has('local-voice')} onChange={() => { void setNarrationMode('silent'); }} /> Seguir sem narração</label>
                    <p className="field-help">Sem narração, os textos e áudios ficam guardados para você reativar depois. Esta escolha não aprova o roteiro nem os arquivos.</p>
                    {narrationDirty && <p className="field-help">Salve as alterações antes de mudar esta escolha.</p>}
                  </fieldset>
                  <div className="narration-local">
                    <strong>Voz IA local · Piper</strong>
                    <p className="field-help">Instale o executável Piper no PATH e selecione um modelo de voz .onnx já disponível no computador, com o arquivo .onnx.json ao lado. Nada é baixado ou enviado. Gere por cena; avançar aprova os áudios antes do render.</p>
                    <button type="button" className="button small secondary" disabled={Boolean(running) || busy.has('local-voice')} onClick={() => { void chooseLocalVoiceModel(); }}>Selecionar modelo local</button>
                    <span className="field-help">{localVoiceModel ? `Modelo: ${localVoiceModel}` : 'Nenhum modelo selecionado.'}</span>
                  </div>
                  <label className="narration-voice">
                    Voz ElevenLabs
                    <select
                      disabled={Boolean(running) || busy.has('local-voice')}
                      value={narrationDraft.voiceId ?? ''}
                      onChange={event => setNarrationDraft(current => current ? { ...current, voiceId: event.target.value || undefined, approved: false, audioReady: false, audioApproved: false } : current)}
                    >
                      <option value="">Selecione uma voz</option>
                      {voices.map(voice => <option value={voice.id} key={voice.id}>{voice.name}{voice.isClone ? ' · clonada' : ''}</option>)}
                    </select>
                  </label>
                  {selectedVoice?.previewUrl && <audio className="voice-preview" src={selectedVoice.previewUrl} controls preload="none" aria-label={`Ouvir amostra da voz ${selectedVoice.name}`} />}
                  <div className="narration-scenes">
                  {narrationDraft.scenes.map((scene, index) => {
                    const audioAsset = scene.audioPath ? project.assets.find(asset => asset.kind === 'audio' && asset.name === scene.audioPath) : undefined;
                    return <article className="narration-scene" key={scene.id}>
                      <h3>{index + 1}. {scene.title}</h3>
                      <label>
                        Narração editorial
                        <textarea
                          disabled={Boolean(running) || busy.has('local-voice')}
                          value={scene.narration}
                          maxLength={10000}
                          rows={3}
                          onChange={event => setNarrationDraft(current => current ? { ...current, approved: false, audioReady: false, audioApproved: false, scenes: current.scenes.map(item => item.id === scene.id ? { ...item, narration: event.target.value } : item) } : current)}
                        />
                      </label>
                      <label>
                        Texto falado · tags Eleven v4 e fonética inline
                        <textarea
                          disabled={Boolean(running) || busy.has('local-voice')}
                          value={scene.spokenText || scene.narration}
                          maxLength={10000}
                          rows={3}
                          onChange={event => setNarrationDraft(current => current ? { ...current, approved: false, audioReady: false, audioApproved: false, scenes: current.scenes.map(item => item.id === scene.id ? { ...item, spokenText: event.target.value } : item) } : current)}
                        />
                      </label>
                      <div className="narration-audio">
                        <span className="field-help">{scene.audioAttached ? `Áudio: ${scene.audioSource === 'elevenlabs' ? 'gerado pelo ElevenLabs' : scene.audioSource === 'local' ? 'gerado localmente' : scene.audioSource === 'recording' ? 'gravado no Studio' : 'enviado por você'}` : scene.stray ? 'Referência órfã: o áudio anterior está ausente ou desatualizado. Envie, grave ou remova.' : 'Sem áudio nesta cena'}</span>
                        {audioAsset && <>
                          <audio className="voice-preview" src={audioAsset.url} controls preload="metadata" aria-label={`Ouvir narração da cena ${index + 1}`} />
                          {audioAsset.approved && <span className="field-help">Áudio aprovado</span>}
                        </>}
                        {scene.audioAttached && !audioAsset && <span className="field-help">Carregando áudio da cena…</span>}
                        <button type="button" className="button small secondary" disabled={Boolean(running) || narrationDirty || narration?.mode !== 'narrated' || !localVoiceModel || !scene.narration.trim() || busy.has('local-voice')} onClick={() => { void generateLocalVoice(scene.id); }}>Gerar voz local</button>
                        <button type="button" className="button small secondary" disabled={Boolean(running) || narrationDirty || busy.has('local-voice')} onClick={() => { setTeleprompterIndex(index); setTeleprompterOpen(true); }}>Gravar cena</button>
                        <button type="button" className="button small secondary" disabled={Boolean(running) || busy.has('narration-audio') || busy.has('local-voice')} onClick={() => { void attachSceneAudio(scene.id); }}>Enviar áudio</button>
                        {(scene.audioAttached || scene.stray) && <button type="button" className="button small secondary" disabled={Boolean(running) || busy.has('narration-audio') || busy.has('local-voice')} onClick={() => { void removeSceneAudio(scene.id); }}>Remover áudio</button>}
                      </div>
                    </article>;
                  })}
                  </div>
                  <p className="field-help">Use tags expressivas como [excited] e [whispers], sem SSML. Para nomes difíceis, use IPA entre barras, por exemplo /ʒuˈɐ̃w̃/. O texto falado deve manter as mesmas palavras da narração editorial; a validação ocorre antes da chamada paga.</p>
                  <div className="narration-status">
                    {narrationDirty ? 'Alterações não salvas — a aprovação anterior não vale para este texto/voz.' :
                      narration?.mode === 'silent' ? 'Sem narração neste render. Para adicionar voz depois, escolha “Usar narração”; os áudios existentes permanecem guardados.' :
                      !narration?.active ? 'Escolha “Seguir sem narração” ou adicione voz às cenas para continuar.' :
                      !narration.ready && narration.voiceId && !narration.audioReady ? 'Gere o áudio com ElevenLabs; o texto e a voz são aprovados nesse passo.' :
                      !narration.ready ? 'Há cenas narradas sem áudio. Gere, envie ou grave o áudio de cada cena; avançar aprova os áudios.' :
                      'Áudios das cenas prontos para render.'}
                  </div>
                  <div className="editor-footer">
                    <button className="button small secondary" disabled={!narrationDirty || Boolean(running) || busy.has('save-narration')} onClick={() => { void saveNarration(); }}>
                      <Save size={14} />Salvar narração
                    </button>
                    <div className="heading-actions">
                      <button className="button small primary" disabled={!narration || narration.mode === 'silent' || narrationDirty || !narrationDraft.voiceId || !snapshot.integrations.elevenLabs.configured || narration.audioReady || busy.has('generate-narration') || busy.has('local-voice') || Boolean(running)} onClick={() => { void generateNarration(); }}>
                        <AudioLines size={14} />Gerar áudio
                      </button>
                    </div>
                  </div>
                </>
              )}
              {teleprompterOpen && narration && (
                <NarrationTeleprompter
                  projectId={id}
                  scenes={narration.scenes}
                  initialIndex={teleprompterIndex}
                  onSaved={state => { setNarration(state); setNarrationDraft(state); }}
                  onClose={() => setTeleprompterOpen(false)}
                />
              )}
            </section>
          )}
          {project.kind === 'image' && activeStep.id === 'images' && (
            <section className="generation-panel" aria-labelledby="generation-title">
              <h2 id="generation-title">Gerar as imagens</h2>
              <p className="muted">{imageGenerationMessage}</p>
              <label className="asset-version-select">
                Formato das imagens
                <select
                  value={project.format ?? ''}
                  onChange={event => { const value = event.target.value; if (isPostNowFormat(value)) void chooseImageFormat(value); }}
                  disabled={Boolean(running) || busy.size > 0 || adaptationStarting || visualTextDirty || (model === 'custom' && !customModel.trim())}
                  aria-label="Formato das imagens"
                >
                  {project.unsupportedFormat && <option value="" disabled>Formato removido: {project.unsupportedFormat}</option>}
                  {Object.keys(POSTNOW_FORMATS).filter(isPostNowFormat).map(id => (
                    <option key={id} value={id}>{`${POSTNOW_FORMATS[id].label} · ${POSTNOW_FORMATS[id].aspect} · ${POSTNOW_FORMATS[id].width}×${POSTNOW_FORMATS[id].height}`}</option>
                  ))}
                </select>
              </label>
              {visualTextDirty && <p className="field-help" role="status">Volte a Textos e salve ou descarte suas alterações antes de trocar o formato.</p>}
              {model === 'custom' && !customModel.trim() && <p className="field-help">Volte a Textos e informe o ID do modelo ou escolha outro modelo antes de trocar o formato.</p>}
              {adaptationError && <ErrorNotice message={adaptationError} />}
              {project.unsupportedFormat && <p className="field-help" role="status">O formato escolhido foi removido do app. Escolha outro formato para gerar as imagens.</p>}
              <button className="button primary" disabled={!canGenerateImages} onClick={() => { void generateImages(); }}>
                <Image size={16} />Gerar {expectedImageCount} {expectedImageCount === 1 ? 'imagem' : 'imagens'} com Codex
              </button>
            </section>
          )}
          {project.kind === 'image' && activeStep.id === 'review' && (
            <section className="image-review-panel" aria-labelledby="image-review-title">
              <div className="section-heading">
                <h2 id="image-review-title">Revisar imagem a imagem</h2>
                <p className="field-help">{keptCount} para manter · {redoCount} para refazer · {pendingCount} sem decisão</p>
              </div>
              <button className="button primary" disabled={!canReviseImages || busy.has('image-revision')} onClick={() => { void reviseImages(); }}>
                <WandSparkles size={16} />{redoCount > 0 ? `Gerar nova versão de ${redoCount} ${redoCount === 1 ? 'imagem' : 'imagens'}` : 'Marque imagens para refazer'}
              </button>
              {!reviewEditable && reviewBlockMessage && <p className="field-help" role="status">{reviewBlockMessage}</p>}
              <ImageReviewGrid items={reviewItems} disabled={!reviewEditable || busy.has('review-image')} decisions={{ onKeep: keepImage, onRedo: redoImage, onClear: clearImageDecision }} onDelete={deleteImageByPath} />
            </section>
          )}

          {((project.kind === 'image' && activeStep.id === 'images') || (project.kind === 'video' && activeStep.id === 'render')) && (
          <details className="assets-section" open={project.kind === 'video'}>
            <summary className="assets-summary"><h2>{project.kind === 'image' ? 'Arquivos e ações avançadas' : 'Arquivos do projeto'}</h2></summary>
            <div className="section-heading">
              <div className="heading-actions">
                {project.kind === 'image' && batches.length > 0 && (
                  <label className="asset-version-select">
                    Rodada
                    <select value={selectedBatchId} onChange={event => { setSelectedBatchId(event.target.value); setSelectedPath(null); }}>
                      <option value="latest">Mais recente</option>
                      <option value="all">Todas as versões</option>
                      {batches.map((batch, index) => <option value={batch.id} key={batch.id}>Versão {batches.length - index} · {batch.sourceCount} entrada(s)</option>)}
                    </select>
                  </label>
                )}
                <button className="button small primary" disabled={busy.has('render') || Boolean(running) || !renderInputsReady} onClick={() => { void render(); }}>
                  {project.kind === 'image' ? <WandSparkles size={15} /> : <Play size={15} />}
                  {project.kind === 'image' ? 'Preparar no PostNow' : project.storyboardReady ? 'Renderizar no VideoGo' : 'Aprovar roteiro e renderizar'}
                </button>
                <button className="button small secondary" disabled={busy.has('import-asset')} onClick={() => { void importAsset(); }}>
                  <Plus size={15} />Importar arquivo
                </button>
              </div>
            </div>
            {selectedBatch?.status?.message && <p className={selectedBatch.status.state === 'failed' ? 'inline-warning' : 'field-help'} role={selectedBatch.status.state === 'failed' ? 'alert' : 'status'}>{selectedBatch.status.message}</p>}
            {selectedBatch && !selectedBatch.status && selectedBatch.assets.length > 0 && <p className="inline-warning">Esta versão antiga não tem comprovação de processamento completo. Importe os originais em uma nova rodada para prepará-la novamente.</p>}
            {insufficientCarousel && <p className="field-help">Carrosséis PostNow precisam de pelo menos 3 imagens reais. Selecione várias imagens ao importar uma nova rodada ou escolha um projeto de post único.</p>}
            {!renderInputsReady && renderBlockMessage && <p className="field-help" role="status">{renderBlockMessage}</p>}

            {project.kind === 'image' ? (
              <ImageReviewGrid items={visibleImageItems} disabled={Boolean(running)} onDelete={deleteImageByPath} />
            ) : visibleAssets.length ? (
              <div className="asset-strip">
                {visibleAssets.map(asset => (
                  <button
                    className={`asset-tile ${selected?.path === asset.path ? 'selected' : ''}`}
                    key={asset.path}
                    onClick={() => setSelectedPath(asset.path)}
                    aria-pressed={selected?.path === asset.path}
                  >
                    <div className="asset-thumbnail">
                      {asset.kind === 'image' ? (
                        <img src={asset.url} alt="" loading="lazy" />
                      ) : asset.kind === 'video' ? (
                        <Film size={24} className="icon-ok" />
                      ) : asset.kind === 'audio' ? (
                        <AudioLines size={24} className="icon-ok" />
                      ) : (
                        <FileText size={24} className="icon-ok" />
                      )}
                      {asset.approved && <span className="asset-check" aria-label="Aprovado"><Check size={12} /></span>}
                    </div>
                    <span title={asset.name}>{asset.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="inline-empty">Imagens, vídeos, áudios e documentos de referência, juntos no projeto.</p>
            )}
          </details>
          )}
          {project.kind === 'image' && activeStep.id === 'texts' && (project.formatAdaptation || adaptationStarting || adaptationError) && (
            <section className="editorial-review" aria-label="Adaptação de formato">
              <h2>Adaptação dos textos</h2>
              {project.formatAdaptation && <p role="status">
                {adaptationStarting || running?.agentSession
                  ? `Adaptando o conteúdo original para ${POSTNOW_FORMATS[project.formatAdaptation.targetFormat].label} · ${project.formatAdaptation.pageCount} ${project.formatAdaptation.pageCount === 1 ? 'página' : 'páginas'}.`
                  : `A adaptação para ${POSTNOW_FORMATS[project.formatAdaptation.targetFormat].label} · ${project.formatAdaptation.pageCount} ${project.formatAdaptation.pageCount === 1 ? 'página' : 'páginas'} ainda não foi concluída. O conteúdo original permanece preservado para uma nova tentativa.`}
              </p>}
              {adaptationError && <ErrorNotice message={adaptationError} />}
              {project.formatAdaptation && !adaptationStarting && !running && <>
                {dirty && <p className="field-help">Salve o briefing e as notas antes de tentar novamente.</p>}
                <button type="button" className="button secondary" disabled={busy.size > 0 || visualTextDirty || dirty || (model === 'custom' && !customModel.trim())} onClick={() => { void retryFormatAdaptation(); }}>
                  <Sparkles size={15} />Tentar adaptação novamente
                </button>
              </>}
            </section>
          )}
          {project.kind === 'image' && visualReview && (
            <section className="editorial-review" aria-labelledby="editorial-review-title" hidden={activeStep.id !== 'texts'}>
              <div className="section-heading">
                <div>
                  <h2 id="editorial-review-title">Revisão editorial antes das imagens</h2>
                  <p className="muted">Revise a headline e a copy de cada página e confira as fontes. A geração de imagens só começa depois da sua aprovação.</p>
                </div>
              </div>
              {hasTextContent(visualReview.pages) ? <>
              <VisualTextEditor key={id} pages={visualReview.pages} disabled={Boolean(running) || adaptationStarting || Boolean(project.formatAdaptation)} disabledReason={project.formatAdaptation ? 'Conclua a adaptação antes de editar os textos; o conteúdo original está preservado para novas tentativas.' : running || adaptationStarting ? 'Aguarde o processo em andamento terminar.' : undefined} hasGeneratedImages={Boolean(latestBatch)} onDirtyChange={setVisualTextDirty} onSave={saveVisualText} />
              <details className="editorial-review-group">
                <summary>Afirmações e fontes · {visualReview.claims.length} claims</summary>
                {visualReview.claims.map(claim => (
                  <article className="editorial-claim" key={claim.id}>
                    <strong>{claim.claim}</strong>
                    <span>{claim.source}</span>
                    {claim.sourceUrl && <code>{claim.sourceUrl}</code>}
                    {claim.qualification && <p>{claim.qualification}</p>}
                  </article>
                ))}
              </details>
              {visualReview.blocking.length > 0 && (
                <div className="inline-warning">
                  <strong>Complete antes de aprovar</strong>
                  <ul>{visualReview.blocking.map(item => <li key={item}>{item}</li>)}</ul>
                </div>
              )}
              {visualReview.approved && !project.formatAdaptation && !adaptationStarting ? (
                <div className="editorial-review-actions">
                  <p className="success-note"><CheckCheck size={15} />Textos e fontes aprovados nesta versão. Alterar qualquer texto invalida a aprovação.</p>
                </div>
              ) : null}
              </> : (
                <div className="empty-state">
                  <p>{running?.agentSession ? 'Os textos estão sendo preparados. Os campos aparecem preenchidos quando a sessão terminar.' : 'Os textos ainda não foram preparados. Use Preparar textos abaixo para gerá-los com a pauta salva.'}</p>
                </div>
              )}
            </section>
          )}


          {project.kind === 'video' && activeStep.id === 'export' && (
            <section className="preview-panel" aria-labelledby="video-delivery-title">
              <div className="panel-heading"><h2 id="video-delivery-title">Copy e capa do vídeo</h2></div>
              <p className="field-help">Gere por formato, inclusive para projetos existentes. Revise a copy, a capa e o recorte; aprove cada arquivo para incluí-lo no ZIP ou na pasta.</p>
              <label className="asset-version-select">
                Formato da entrega
                <select value={deliveryFormat} onChange={event => setDeliveryFormat(event.target.value as 'youtube' | 'reels' | 'feed-square')} disabled={Boolean(running)}>
                  <option value="youtube">YouTube · 16:9</option>
                  <option value="reels">Reels / Story · 9:16</option>
                  <option value="feed-square">Feed quadrado · 1:1</option>
                </select>
              </label>
              <button type="button" className="button secondary" disabled={Boolean(running) || busy.has('video-delivery')} onClick={() => { void generateVideoDelivery(); }}>
                <Sparkles size={16} />Gerar capa (Codex) e copy (Claude)
              </button>
              <button type="button" className="button secondary" disabled={Boolean(running) || busy.has('video-delivery')} onClick={() => { void generateVideoDelivery(true); }}>
                <Image size={16} />Gerar só a capa (Codex)
              </button>
              {deliveryAssets.some(asset => asset.name === `delivery/cover-${deliveryFormat}.png`) && (
                <button type="button" className="button secondary" disabled={Boolean(running) || busy.has('video-copy')} onClick={() => { void generateVideoCopy(); }}>
                  <FileText size={16} />Gerar só a copy (Claude)
                </button>
              )}
              {deliveryAssets.length === 0 && <p className="muted">Nenhuma copy ou capa gerada ainda.</p>}
              {deliveryAssets.map(asset => (
                <article key={asset.path}>
                  <h3>{asset.name}</h3>
                  <div className="media-stage"><Media key={`${asset.path}-${trackedJobId}-${trackedJob?.status}`} projectId={project.id} asset={{ ...asset, url: `${asset.url}?v=${trackedJobId ?? 'original'}-${trackedJob?.status ?? 'idle'}` }} /></div>
                  <div className="asset-review">
                    <span>{asset.approved ? 'Aprovado para exportação' : 'Aguardando sua revisão'}</span>
                    <button type="button" className={`button small ${asset.approved ? 'approved' : ''}`} aria-label={`${asset.approved ? 'Remover aprovação' : 'Aprovar arquivo'}: ${asset.name}`} disabled={Boolean(running) || busy.has('approve')} onClick={() => { void approve(asset); }}>
                      {asset.approved ? 'Remover aprovação' : 'Aprovar arquivo'}
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}
          {activeStep.id === 'export' && (
            <DeliveryOptions approvedCount={approved.length} totalCount={project.assets.length} busy={busy.has('export') || busy.has('export-zip')} onSaveZip={() => { void saveZip(); }} onExportFolder={() => { void exportPackage(); }} onOpenFolder={openProjectFolder} />
          )}
          {activeStep.id === 'export' && (
          <section className="derive-bar">
            <div>
              <h3>{project.kind === 'image' ? 'Criar projeto VideoGo' : 'Criar projeto PostNow'}</h3>
              <p>
                {project.kind === 'image'
                  ? `Cria um projeto VideoGo em formato ${selectedDerivedFormat} a partir dos slides, sem renderizar vídeo automaticamente.`
                  : `Extrai quadros com FFmpeg para um projeto PostNow em formato ${selectedDerivedFormat}; não gera imagens por IA.`}
              </p>
            </div>
            <div className="heading-actions">
              <label className="asset-version-select">
                Formato de destino
                <select
                  value={selectedDerivedFormat}
                  onChange={event => setDerivedFormat(event.target.value as ProjectFormatId)}
                  aria-label="Formato do projeto derivado"
                >
                  {project.kind === 'image' ? (
                    <>
                      <option value="reels">Reels · 9:16 · 1080×1920</option>
                      <option value="story">Story · 9:16 · 1080×1920</option>
                      <option value="feed-square">Feed quadrado · 1:1 · 1080×1080</option>
                      <option value="youtube">YouTube · 16:9 · 1920×1080</option>
                    </>
                  ) : (
                    <>
                      <option value="carousel-1x1">Carrossel · 1:1 · 1080×1080</option>
                      <option value="post-1x1">Post · 1:1 · 1080×1080</option>
                      <option value="story-9x16">Story · 9:16 · 1080×1920</option>
                    </>
                  )}
                </select>
              </label>
              {project.kind === 'image' ? (
                <button className="button small primary" disabled={busy.has('derive') || Boolean(running) || !canDerive} onClick={() => { void derive('video'); }}>
                  <Film size={15} />Converter em Vídeo (VideoGo)<ArrowRight size={14} />
                </button>
              ) : (
                <button className="button small primary" disabled={busy.has('derive') || Boolean(running) || !canDerive} onClick={() => { void derive('image'); }}>
                  <Image size={15} />Extrair Imagens (PostNow)<ArrowRight size={14} />
                </button>
              )}
            </div>
            {!canDerive && deriveBlockMessage && <p className="field-help" role="status">{deriveBlockMessage}</p>}
          </section>
          )}

          {activeStep.id === 'brief' && (
          <section className="editor-panel">
            <div className="editor-tabs">
              <button className={editor === 'brief' ? 'active' : ''} onClick={() => setEditor('brief')} aria-pressed={editor === 'brief'}>Briefing</button>
              <button className={editor === 'notes' ? 'active' : ''} onClick={() => setEditor('notes')} aria-pressed={editor === 'notes'}>Notas de direção</button>
            </div>
            <label className="sr-only" htmlFor="project-editor">{editor === 'brief' ? 'Briefing do projeto' : 'Notas de direção'}</label>
            <textarea
              id="project-editor"
              className="project-editor"
              rows={8}
              value={editor === 'brief' ? brief : notes}
              onChange={event => editor === 'brief' ? setBrief(event.target.value) : setNotes(event.target.value)}
              placeholder={editor === 'brief' ? 'Objetivo, público, formato e mensagem. Um bom briefing dá direção à criação.' : 'Registre ajustes, referências e decisões para a próxima sessão.'}
              maxLength={50000}
            />
            <div className="editor-footer">
              <span>{dirty ? 'Alterações não salvas' : 'Salvo no projeto'}</span>
              <button className="button small secondary" disabled={!dirty || busy.has('save-notes')} onClick={() => { void save(); }}>
                <Save size={14} />Salvar
              </button>
            </div>
          </section>
          )}

          {project.kind === 'video' && activeStep.id === 'script' && (
            <>
              {!project.storyboardAvailable && <p className="muted">O storyboard aparece aqui quando o agente preparar as cenas.</p>}
              {project.storyboardAvailable && !project.storyboardReady && <p className="inline-warning" role="status">Roteiro em rascunho: revise cenas, fatos e fontes. “Aprovar roteiro e renderizar” valida o arquivo no VideoGo e renderiza em seguida.</p>}
              {storyboardError && <ErrorNotice message={storyboardError} />}
              {project.storyboardIssues?.length ? <p className="inline-warning" role="status">Pendências do storyboard: {project.storyboardIssues.slice(0, 3).join('; ')}{project.storyboardIssues.length > 3 ? ` (+${project.storyboardIssues.length - 3} em seguida)` : ''}. Corrija-as antes do render.</p> : null}
              {project.storyboardAvailable && !storyboardError && !storyboardScenes && <Loading label="Carregando cenas…" />}
              {storyboardScenes && (
                <VideoSceneEditor scenes={storyboardScenes} disabled={Boolean(running) || busy.has('approve-storyboard')} disabledReason={running ? 'Aguarde o processo em andamento terminar.' : busy.has('approve-storyboard') ? 'Validando o roteiro no VideoGo…' : undefined} onSave={saveStoryboardScenes} onDirtyChange={setStoryboardDirty} />
              )}
              {videoCorrectionBlock}
            </>
          )}

          {(activeStep.id === 'texts' || activeStep.id === 'script') && (
          <section className="composer-panel">
            <div className="panel-heading">
              <h2><Sparkles size={17} />Assistente de criação</h2>
              <span className="badge">IA</span>
            </div>
            <p>{project.kind === 'image' ? 'Os textos são preparados sozinhos ao salvar uma pauta nova, enquanto as páginas estiverem vazias. Para refazê-los com o briefing salvo, use o botão abaixo; isso pode substituir os textos atuais. A geração de imagens continua separada e depende da sua aprovação.' : 'Escolha um modelo ou escreva seu pedido. O agente prepara roteiro e arquivos; a renderização PostNow/VideoGo é uma etapa separada e explícita.'}</p>
            {project.kind === 'image' && !imageRequest && <p className="field-help">Salve o briefing do projeto antes de preparar os textos.</p>}
            <details className="agent-options">
              <summary>Opções avançadas · agente e modelo</summary>
              <div className="agent-options-content">
            <label>
              Provedor
              <select value={provider} onChange={event => { setProvider(event.target.value as Provider); setModel(''); }} disabled={Boolean(running) || busy.has('agent')}>
                <option value="codex">OpenAI Codex</option>
                <option value="claude">Anthropic Claude Code</option>
              </select>
            </label>
            <label htmlFor="agent-model">Modelo</label>
            <select id="agent-model" value={model} onChange={event => setModel(event.target.value)} disabled={Boolean(running) || busy.has('agent')} aria-describedby="agent-model-help">
              <option value="">Recomendado · {detail?.kind === 'video' ? `Claude Opus 5.5 · fixo (${VIDEO_AGENT_MODEL})` : provider === 'codex' ? 'GPT-6 Luna · xhigh' : 'Claude Sonnet · alias do CLI'}</option>
              {MODEL_CATALOG[provider].map(option => <option key={option.id} value={option.id}>{option.name} · custo {option.costTier.toLowerCase()}</option>)}
              <option value="custom">Outro ID…</option>
            </select>
            {model === 'custom' && <input
              aria-label="ID personalizado do modelo"
              value={customModel}
              onChange={event => setCustomModel(event.target.value)}
              maxLength={100}
              placeholder="ID aceito pelo CLI"
              disabled={Boolean(running) || busy.has('agent')}
            />}
            {selectedModelInfo && <p className="field-help"><strong>{selectedModelInfo.profile}</strong> Referência API: ${selectedModelInfo.inputUsdPerMillion} entrada / ${selectedModelInfo.outputUsdPerMillion} saída por 1 milhão de tokens.</p>}
            <details className="model-cost-comparison">
              <summary>Comparar modelos e custos</summary>
              <ul>
                {MODEL_CATALOG[provider].map(option => <li key={option.id}>
                  <span><strong>{option.name}</strong><small>{option.profile}</small></span>
                  <span className="model-cost">Entrada ${option.inputUsdPerMillion}/1M · saída ${option.outputUsdPerMillion}/1M USD</span>
                </li>)}
              </ul>
              <p>Preços de referência da API em USD por 1 milhão de tokens; indicam custo relativo, não o valor desta tarefa. Codex/Claude autenticados por assinatura usam cotas e regras próprias. O Studio não recebe medição de tokens desses CLIs, então não consegue prever a fatura real.</p>
            </details>
            <p id="agent-model-help" className="field-help">Vídeo roda sempre no Claude Opus 5.5 fixo ({VIDEO_AGENT_MODEL}) com esforço {VIDEO_AGENT_EFFORT}, independentemente da escolha acima; só a capa da entrega usa o Codex ImageGen. Nos demais projetos: Codex GPT-6 Luna com xhigh; Claude usa o alias Sonnet, que o CLI resolve para a versão atual; para fixar uma versão, informe seu ID completo em “Outro ID”.</p>
              </div>
            </details>
            {project.kind === 'video' && <>
            <div className="prompt-library-launch">
              <label htmlFor="agent-prompt">Instruções para o agente</label>
              <button type="button" className="button small secondary" onClick={() => setPromptLibraryOpen(true)}><BookOpen size={14} />Biblioteca de prompts</button>
            </div>
            <textarea
              id="agent-prompt"
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              rows={5}
              maxLength={20000}
              placeholder="Ex.: Crie um vídeo de 30 segundos sobre uma curiosidade científica, com roteiro por cena e narração para revisão…"
              disabled={Boolean(running) || busy.has('agent')}
            />
            </>}
            {dirty && <p className="field-help warning-text">Salve o briefing e as notas antes de iniciar para incluir suas alterações.</p>}
            <button className="button primary full" disabled={!agentRequest || (model === 'custom' && !customModel.trim()) || Boolean(running) || busy.has('agent') || dirty || visualTextDirty || Boolean(project.formatAdaptation) || adaptationStarting} onClick={() => { void startAgent(); }}>
              <Send size={16} />{running ? 'Sessão em andamento…' : project.kind === 'image' ? 'Preparar textos' : 'Preparar roteiro com IA'}
            </button>
            <p className="composer-footnote"><TerminalSquare size={13} />Acompanhe o progresso ao vivo no console.</p>
          </section>
          )}
          {promptLibraryOpen && <PromptLibrary
            kind={project.kind}
            projectTitle={project.title}
            format={project.format ?? (project.kind === 'image' ? DEFAULT_POSTNOW_FORMAT : 'reels')}
            currentPrompt={prompt}
            onUse={value => { setPrompt(value); setPromptLibraryOpen(false); }}
            onClose={() => setPromptLibraryOpen(false)}
          />}

          {projectJobs.length > 0 && (
            <section>
              <div className="section-heading"><h2>Neste projeto</h2></div>
              {projectJobs.slice(0, 3).map(job => <ActivityCard key={job.id} job={job} onOpen={openJob} />)}
            </section>
          )}
        </StepShell>
      </div>
    </>
  );
}
