import type { AppUpdater } from 'electron-updater';
import type { AppUpdateStatus } from '../shared/contracts.js';

const REPOSITORY = { provider: 'github' as const, owner: 'FernandoBolzan', repo: 'maquina-de-conteudo-studio' };
const FIRST_CHECK_MS = 15_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface AppUpdaterOptions {
  updater: AppUpdater;
  publish: (status: AppUpdateStatus) => void;
  // Runs before quitAndInstall; throws to refuse the restart (for example, while jobs run).
  prepareInstall: () => Promise<void>;
}

export interface AppUpdaterService {
  start(): void;
  check(): Promise<AppUpdateStatus>;
  installDownloaded(): Promise<AppUpdateStatus>;
  status(): AppUpdateStatus;
}

// Downloads new releases in the background; the downloaded build is applied on the next quit or on an explicit restart.
export function createAppUpdater({ updater, publish, prepareInstall }: AppUpdaterOptions): AppUpdaterService {
  let current: AppUpdateStatus = { state: 'idle', message: '' };
  const set = (next: AppUpdateStatus): void => {
    current = next;
    publish(next);
  };
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.setFeedURL(REPOSITORY);
  updater.on('checking-for-update', () => set({ state: 'checking', message: 'Procurando atualização…' }));
  updater.on('update-available', info => set({ state: 'downloading', version: info.version, message: `Baixando a versão ${info.version}…` }));
  updater.on('update-not-available', () => set({ state: 'current', message: 'Você está na versão atual.' }));
  updater.on('update-downloaded', info => set({ state: 'downloaded', version: info.version, message: `Versão ${info.version} pronta. Reinicie para aplicar agora ou ela será instalada ao fechar o aplicativo.` }));
  updater.on('error', error => {
    // A failed later check must not hide an update that is already downloaded and waiting to install.
    if (current.state === 'downloaded') return;
    set({ state: 'error', message: `Atualização: ${error.message}` });
  });

  async function check(): Promise<AppUpdateStatus> {
    await updater.checkForUpdates();
    return current;
  }
  async function installDownloaded(): Promise<AppUpdateStatus> {
    if (current.state !== 'downloaded') throw new Error('Nenhuma atualização pronta para instalar.');
    await prepareInstall();
    updater.quitAndInstall();
    return current;
  }

  function start(): void {
    // Errors are published through the 'error' listener, so the rejected promise is intentionally ignored.
    const backgroundCheck = (): void => { void updater.checkForUpdates().catch(() => undefined); };
    setTimeout(backgroundCheck, FIRST_CHECK_MS).unref();
    setInterval(backgroundCheck, CHECK_INTERVAL_MS).unref();
  }

  return { start, check, installDownloaded, status: () => current };
}
