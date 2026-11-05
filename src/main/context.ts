import type { AppEvent, Job, Settings } from '../shared/contracts.js';
export interface RunSpec { title: string; executable: string; args: string[]; cwd?: string; env?: Record<string, string>; projectId?: string; interactive?: boolean; timeoutMs?: number; }
export interface CommandResult { code: number; stdout: string; stderr: string; }
export interface Services {
  dataDir: string;
  getSettings(): Settings;
  saveSettings(update: Partial<Settings>): Promise<Settings>;
  run(spec: RunSpec): Promise<Job>;
  capture(executable: string, args: string[], options?: { cwd?: string; env?: Record<string,string>; timeoutMs?: number }): Promise<CommandResult>;
  waitJob(id: string): Promise<Job>;
  jobs(): Job[];
  emit(event: AppEvent): void;
  pickFile(options?: { directory?: boolean; multiple?: boolean; extensions?: string[] }): Promise<string | string[] | undefined>;
  openPath(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  assetUrl(path: string): string;
  getElevenLabsKey(): string | undefined;
}
export function text(payload: Record<string, unknown>, key: string, max = 10000): string {
  const value = payload[key];
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Campo inválido: ${key}`);
  return value.trim();
}
export function consent(payload: Record<string, unknown>): void {
  if (payload.confirm !== true) throw new Error('Esta ação exige confirmação explícita.');
}
export type Handler = (action: string, payload: Record<string, unknown>, services: Services) => Promise<unknown>;
