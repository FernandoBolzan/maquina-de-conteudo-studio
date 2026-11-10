export type Provider = 'codex' | 'claude';
/** Projetos de vídeo sempre rodam neste modelo fixo; o alias `opus` do Claude Code muda sozinho quando sai outro Opus. */
export const VIDEO_AGENT_MODEL = 'claude-opus-5-5';
/** Esforço do Opus em vídeo: `medium` equilibra qualidade e tempo de sessão. */
export const VIDEO_AGENT_EFFORT = 'medium';
export type EngineId = 'videogo' | 'postnow' | 'maestro';
export type PostNowFormatId = 'story-9x16' | 'post-1x1' | 'carousel-1x1' | 'post-4x5' | 'carousel-4x5' | 'post-4x3' | 'carousel-4x3';
export type VideoGoFormatId = 'reels' | 'story' | 'feed-square' | 'youtube';
export type ProjectFormatId = PostNowFormatId | VideoGoFormatId;
export function postNowFormatAcceptsPageCount(format: ProjectFormatId, pageCount: number): boolean {
  if (!Number.isInteger(pageCount) || pageCount < 1) return false;
  if (format.startsWith('carousel-')) return pageCount >= 3 && pageCount <= 10;
  return (format.startsWith('post-') || format === 'story-9x16') && pageCount === 1;
}
export type JobStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';
export interface JobInteractionChoice { label: string; value: string; }
export interface JobInteractionRequest { kind: 'text' | 'password' | 'choice' | 'device-auth'; prompt: string; choices?: JobInteractionChoice[]; verificationUrl?: string; userCode?: string; }
export type AgentActivityKind = 'web' | 'read' | 'write' | 'command' | 'search' | 'image' | 'error' | 'step';
export interface AgentActivity { id: string; at: string; kind: AgentActivityKind; text: string; }
export interface Job { id: string; title: string; status: JobStatus; createdAt: string; endedAt?: string; projectId?: string; exitCode?: number; log: string; interactive: boolean; interactionRequest?: JobInteractionRequest; agentSession?: boolean; activity?: AgentActivity[]; currentActivity?: string; }
export interface MobileTunnelStatus { active: boolean; url?: string; token?: string; port?: number; connectedClients?: number; error?: string; startedAt?: string; }
export type AppUpdateState = 'idle' | 'checking' | 'downloading' | 'downloaded' | 'current' | 'unsupported' | 'error';
export interface AppUpdateStatus { state: AppUpdateState; version?: string; message: string; }
export interface AppEvent { type: 'job' | 'output' | 'refresh' | 'activity' | 'mobile' | 'update'; job?: Job; jobId?: string; data?: string; activity?: AgentActivity; mobile?: MobileTunnelStatus; update?: AppUpdateStatus; }
export interface BrandReference { id: string; name: string; path: string; kind: 'image' | 'pdf' | 'document'; url: string; }
export interface Brand { id: string; name: string; tone: string; colors: string[]; logo?: string; logoUrl?: string; references: BrandReference[]; }
export interface Asset { name: string; path: string; kind: 'image' | 'video' | 'audio' | 'file'; url: string; approved: boolean; hasAudio?: boolean; redo?: { note: string }; }
export interface GenerationBatch { id: string; assets: Asset[]; sourceCount: number; format?: PostNowFormatId; status?: { state: 'generating' | 'processing' | 'ready' | 'failed'; stage?: string; message?: string; updatedAt: string }; revision?: { of: string; keptPages: number[]; redonePages: number[] }; }
export interface Project { id: string; title: string; kind: 'image' | 'video'; format?: ProjectFormatId; unsupportedFormat?: string; brandId?: string; createdAt: string; path: string; brief: string; sourceProjectId?: string; voiceId?: string; coverUrl?: string; }
export interface GenerationPageReview { page: number; headline: string; copy: string; depictedPerson: string; }
export interface GenerationClaimReview { id: string; claim: string; source: string; sourceUrl: string; qualification: string; }
export interface VisualGenerationReview { ready: boolean; approved: boolean; approvedAt?: string; contentHash: string; blocking: string[]; format: PostNowFormatId; width: number; height: number; pages: GenerationPageReview[]; claims: GenerationClaimReview[]; }
export interface FormatAdaptation { sourceFormat: PostNowFormatId; targetFormat: PostNowFormatId; pageCount: number; }
export interface ProjectDetail extends Project { assets: Asset[]; notes: string; batches?: GenerationBatch[]; visualReview?: VisualGenerationReview; formatAdaptation?: FormatAdaptation; storyboardAvailable?: boolean; storyboardReady?: boolean; storyboardIssues?: string[]; }
export interface ToolStatus { id: string; name: string; installed: boolean; version?: string; authenticated?: boolean; account?: string; detail?: string; source?: 'managed' | 'external'; }
export type CliId = 'codex' | 'claude';
export interface CliUpdateStatus { id: CliId; currentVersion?: string; latestVersion?: string; source?: 'managed' | 'external'; state: 'missing' | 'current' | 'update-available' | 'external-update-available' | 'unavailable' | 'unverified'; detail: string; canRollback?: boolean; }
export interface CliOperationResult { job?: Job; message: string; version?: string; }
export interface EngineDependency { id: string; name: string; required: string; installed: boolean; version?: string; guidance: string; }
export interface EngineStatus { id: EngineId; installed: boolean; path?: string; version?: string; repository: string; dependencies: EngineDependency[]; }
export interface SetupStatus { tools: ToolStatus[]; engines: EngineStatus[]; github?: { authenticated: boolean; login?: string }; platform: string; }
export interface ElevenLabsVoice { id: string; name: string; category: string; language?: string; previewUrl?: string; isClone: boolean; }
export interface ElevenLabsStatus { configured: boolean; secureStorageAvailable: boolean; error?: string; warning?: string; }
export type NarrationAudioSource = 'upload' | 'recording' | 'elevenlabs' | 'local';
export const NARRATION_RECORDING_MAX_BYTES = 64 * 1024 * 1024;
export interface NarrationScene { id: string; title: string; narration: string; spokenText: string; audioAttached: boolean; audioPath?: string; audioSource?: NarrationAudioSource; stray: boolean; }
export type NarrationMode = 'silent' | 'narrated';
export interface NarrationState { mode: NarrationMode; active: boolean; ready: boolean; voiceId?: string; modelId: 'eleven_v4'; scenes: NarrationScene[]; approved: boolean; audioReady: boolean; audioApproved: boolean; }
export interface Settings { workspace: string; provider: Provider; enginePaths: Partial<Record<EngineId, string>>; onboardingCompleted: boolean; }
export interface Snapshot { settings: Settings; projects: Project[]; brands: Brand[]; jobs: Job[]; integrations: { elevenLabs: ElevenLabsStatus }; version: string; mobile?: MobileTunnelStatus; }
export interface DesktopAPI { invoke<T = unknown>(action: string, payload?: Record<string, unknown>): Promise<T>; onEvent(listener: (event: AppEvent) => void): () => void; }
declare global { interface Window { maquina: DesktopAPI; } }
