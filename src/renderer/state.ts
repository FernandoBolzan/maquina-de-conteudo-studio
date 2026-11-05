import { useSyncExternalStore } from 'react';
import type { AppEvent, DesktopAPI, Job, Snapshot } from '../shared/contracts';

export const api: DesktopAPI | undefined = window.maquina;
export const LOG_LIMIT = 200_000;
const listeners = new Set<() => void>();
let jobs: Job[] = [];
let revision = 0;
const notify = () => { revision++; listeners.forEach(listener => listener()); };
export const jobStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  revision: () => revision,
  all: () => jobs,
  get: (id: string) => jobs.find(job => job.id === id),
  merge(incoming: Job[]) {
    const current = new Map(jobs.map(job => [job.id, job]));
    for (const job of incoming) {
      const existing = current.get(job.id);
      current.set(job.id, { ...job, log: (job.log || existing?.log || '').slice(-LOG_LIMIT) });
    }
    jobs = [...current.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    notify();
  },
  event(event: AppEvent) {
    if (event.type === 'job' && event.job) this.merge([event.job]);
    if (event.type === 'output' && event.jobId && event.data) {
      const job = jobs.find(item => item.id === event.jobId);
      if (job) { job.log = (job.log + event.data).slice(-LOG_LIMIT); notify(); }
    }
  },
};
export function useJobs() {
  useSyncExternalStore(jobStore.subscribe, jobStore.revision);
  return jobStore.all();
}
export const statusLabels: Record<Job['status'], string> = {
  running: 'Em execução', succeeded: 'Concluído', failed: 'Falhou', cancelled: 'Cancelado', interrupted: 'Interrompido',
};
export type Run = <T>(key: string, operation: () => Promise<T>, success?: string) => Promise<T | undefined>;
export type Confirm = (title: string, description: string, action?: string) => Promise<boolean>;
export interface ScreenProps {
  snapshot: Snapshot;
  refresh: () => Promise<void>;
  run: Run;
  busy: Set<string>;
  confirm: Confirm;
  openJob: (job: Job) => void;
}
export function invoke<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
  if (!api) return Promise.reject(new Error('Abra o aplicativo desktop para acessar seu estúdio local.'));
  return api.invoke<T>(action, payload);
}
export function errorMessage(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, ''); }
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(date));
}
