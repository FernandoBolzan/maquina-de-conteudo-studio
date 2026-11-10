import { BrowserWindow, Notification } from 'electron';
import type { Job, JobStatus } from '../shared/contracts.js';

/** Finished states that the user should hear about; running or cancelled jobs stay silent. */
const OUTCOME: Partial<Record<JobStatus, string>> = { succeeded: 'Concluído', failed: 'Falhou' };
const flashListened = new WeakSet<BrowserWindow>();

/**
 * Tells the user that a generation finished. Without focus on the main window, the taskbar flashes
 * and a system notification appears; clicking it brings the window forward.
 */
export function notifyJobFinished(job: Job, window: BrowserWindow | undefined): void {
  const label = OUTCOME[job.status];
  if (!label) return;
  const live = window && !window.isDestroyed() ? window : undefined;
  if (live?.isFocused()) return;
  if (live) {
    if (!flashListened.has(live)) {
      flashListened.add(live);
      live.on('focus', () => live.flashFrame(false));
    }
    live.flashFrame(true);
  }
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title: 'Máquina de Conteúdo', body: `${label}: ${job.title}` });
  notification.on('click', () => {
    if (!live || live.isDestroyed()) return;
    live.show();
    live.focus();
  });
  notification.show();
}
