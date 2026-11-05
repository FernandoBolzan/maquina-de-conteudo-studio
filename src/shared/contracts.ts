export type Provider = 'codex' | 'claude';
export type EngineId = 'videogo' | 'postnow' | 'maestro';
export type JobStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';
export interface Job { id: string; title: string; status: JobStatus; createdAt: string; endedAt?: string; projectId?: string; exitCode?: number; log: string; interactive: boolean; }
export interface AppEvent { type: 'job' | 'output' | 'refresh'; job?: Job; jobId?: string; data?: string; }
export interface BrandReference { id: string; name: string; path: string; kind: 'image' | 'pdf' | 'document'; url: string; }
export interface Brand { id: string; name: string; tone: string; colors: string[]; logo?: string; logoUrl?: string; references: BrandReference[]; }
export interface Asset { name: string; path: string; kind: 'image' | 'video' | 'audio' | 'file'; url: string; approved: boolean; }
export interface Project { id: string; title: string; kind: 'image' | 'video'; brandId?: string; createdAt: string; path: string; brief: string; sourceProjectId?: string; }
export interface ProjectDetail extends Project { assets: Asset[]; notes: string; }
export interface ToolStatus { id: string; name: string; installed: boolean; version?: string; authenticated?: boolean; detail?: string; source?: 'managed' | 'external'; }
export type CliId = 'codex' | 'claude';
export interface CliUpdateStatus { id: CliId; currentVersion?: string; latestVersion?: string; source?: 'managed' | 'external'; state: 'missing' | 'current' | 'update-available' | 'external-update-available' | 'unavailable' | 'unverified'; detail: string; canRollback?: boolean; }
export interface CliOperationResult { job?: Job; message: string; version?: string; }
export interface EngineStatus { id: EngineId; installed: boolean; path?: string; version?: string; repository: string; }
export interface SetupStatus { tools: ToolStatus[]; engines: EngineStatus[]; github?: { authenticated: boolean; login?: string }; platform: string; }
export interface Settings { workspace: string; provider: Provider; enginePaths: Partial<Record<EngineId, string>>; onboardingCompleted: boolean; }
export interface Snapshot { settings: Settings; projects: Project[]; brands: Brand[]; jobs: Job[]; version: string; }
export interface DesktopAPI { invoke<T = unknown>(action: string, payload?: Record<string, unknown>): Promise<T>; onEvent(listener: (event: AppEvent) => void): () => void; }
declare global { interface Window { maquina: DesktopAPI; } }
