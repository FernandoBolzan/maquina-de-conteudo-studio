import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, session, Menu, safeStorage } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import updater from 'electron-updater';
import { Runtime } from './runtime.js';
import { notifyJobFinished } from './notifications.js';
import { consent } from './context.js';
import { unsupportedUpdateMessage } from './update-policy.js';
import { createAppUpdater, type AppUpdaterService } from './app-updater.js';
import { isPermissionGranted } from './permissions.js';
import { openFolder } from './open-folder.js';

const { autoUpdater } = updater;
const here = dirname(fileURLToPath(import.meta.url));
let window: BrowserWindow | undefined;
let runtime: Runtime | undefined;
let quitting = false;
let appUpdater: AppUpdaterService | undefined;
const renderer = pathToFileURL(join(here, '../renderer/index.html')).href;
const devURL = process.env.MDC_DEV_URL;
if (devURL && !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(devURL)) throw new Error('MDC_DEV_URL precisa apontar para 127.0.0.1.');
// Chromium does not recognize COSMIC yet, although it provides the standard Secret Service.
// Select libsecret before Electron initializes; never override an explicit user choice.
if (process.platform === 'linux' && (process.env.XDG_CURRENT_DESKTOP ?? '').split(':').some(desktop => desktop.toLowerCase() === 'cosmic') && !app.commandLine.hasSwitch('password-store')) {
  app.commandLine.appendSwitch('password-store', 'gnome-libsecret');
}
protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { window?.show(); window?.focus(); });
  app.whenReady().then(start).catch(error => { dialog.showErrorBox('Não foi possível iniciar', String(error)); app.quit(); });
}
async function start(): Promise<void> {
  appUpdater = createAppUpdater({
    updater: autoUpdater,
    publish: status => { if (window && !window.isDestroyed()) window.webContents.send('maquina:event', { type: 'update', update: status }); },
    prepareInstall: async () => {
      if (runtime?.supervisor.list().some(job => job.status === 'running')) throw new Error('Finalize as tarefas antes de reiniciar para atualizar.');
      await runtime?.dispose();
      quitting = true;
    },
  });
  runtime = new Runtime(process.env.MDC_DATA_DIR || app.getPath('userData'), {
    assetPrefix: 'media://asset/',
    secureStorageAvailable: () => safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || !['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend())),
    encryptSecret: value => {
      if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && ['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend()))) throw new Error('O cofre seguro do sistema não está disponível.');
      return safeStorage.encryptString(value).toString('base64');
    },
    decryptSecret: value => {
      if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && ['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend()))) throw new Error('O cofre seguro do sistema não está disponível.');
      const encrypted = Buffer.from(value, 'base64');
      if (!encrypted.length || encrypted.toString('base64') !== value) throw new Error('Credencial cifrada inválida.');
      return safeStorage.decryptString(encrypted);
    },
    pickFile: async options => {
      const properties: Array<'openDirectory' | 'createDirectory' | 'openFile' | 'multiSelections'> = options?.directory ? ['openDirectory', 'createDirectory'] : options?.multiple ? ['openFile', 'multiSelections'] : ['openFile'];
      const result = await dialog.showOpenDialog({ properties, filters: options?.extensions?.length ? [{ name: 'Arquivos', extensions: options.extensions }] : undefined });
      if (result.canceled) return undefined;
      return options?.multiple ? result.filePaths : result.filePaths[0];
    },
    openPath: path => openFolder(path),
    openExternal: async url => { await shell.openExternal(url); },
    update: async (action, payload) => {
      if (action === 'app.updateStatus') return appUpdater?.status() ?? { state: 'idle', message: '' };
      if (!app.isPackaged) return { state: 'unsupported', message: 'Atualização do aplicativo disponível somente no pacote instalado.' };
      const unsupported = unsupportedUpdateMessage(process.platform, process.env.APPIMAGE);
      if (unsupported) {
        if (action === 'app.updateCheck') return { state: 'unsupported', message: unsupported };
        consent(payload);
        throw new Error(unsupported);
      }
      if (!appUpdater) throw new Error('Atualizador ainda não iniciado.');
      if (action === 'app.updateCheck') return appUpdater.check();
      consent(payload);
      return appUpdater.installDownloaded();
    },
  }, event => { if (window && !window.isDestroyed()) window.webContents.send('maquina:event', event); if (event.type === 'job' && event.job) notifyJobFinished(event.job, window); }, app.getVersion());
  await runtime.init();
  protocol.handle('media', async request => {
    try {
      const url = new URL(request.url); if (url.hostname !== 'asset') return new Response('Forbidden', { status: 403 });
      const path = await runtime!.mediaPath(url.pathname.slice(1));
      return net.fetch(pathToFileURL(path).href, { headers: request.headers });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 800, minHeight: 600, title: 'Máquina de Conteúdo (Studio)', icon: join(here, '../renderer/icon.png'), backgroundColor: '#09090b', autoHideMenuBar: true, show: false, webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  const appUrl = devURL || renderer;
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback, details) => callback(isPermissionGranted(permission, details, appUrl)));
  session.defaultSession.setPermissionCheckHandler((_contents, permission, _requestingOrigin, details) => isPermissionGranted(permission, details, appUrl));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== (devURL || renderer)) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  ipcMain.handle('maquina:invoke', async (event, action: unknown, payload: unknown) => {
    const origin = event.senderFrame?.url;
    if (event.sender !== window?.webContents || event.senderFrame !== event.sender.mainFrame || !origin || (devURL ? new URL(origin).origin !== new URL(devURL).origin : origin !== renderer)) throw new Error('Origem não autorizada.');
    if (typeof action !== 'string' || (payload !== undefined && (!payload || typeof payload !== 'object' || Array.isArray(payload)))) throw new Error('Mensagem inválida.');
    return runtime!.invoke(action, (payload || {}) as Record<string, unknown>);
  });
  // Native edit roles retain system clipboard shortcuts without granting the renderer clipboard-read access.
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Editar', submenu: [
    { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
    { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
  ] }]));
  window.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;
    Menu.buildFromTemplate([
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll },
    ]).popup({ window });
  });
  window.once('ready-to-show', () => { window?.show(); console.log('ELECTRON_WINDOW_READY'); });
  if (devURL) await window.loadURL(devURL); else await window.loadFile(join(here, '../renderer/index.html'));
  if (app.isPackaged && !unsupportedUpdateMessage(process.platform, process.env.APPIMAGE)) appUpdater?.start();
}
app.on('before-quit', event => {
  if (quitting || !runtime) return;
  event.preventDefault();
  void (async () => {
    if (runtime!.supervisor.list().some(job => job.status === 'running')) {
      const response = await dialog.showMessageBox({ type: 'warning', title: 'Há tarefas em andamento', message: 'Sair cancela as tarefas e encerra os processos de produção.', buttons: ['Continuar trabalhando', 'Cancelar tarefas e sair'], defaultId: 0, cancelId: 0 });
      if (response.response === 0) return;
    }
    await runtime!.dispose(); quitting = true; app.quit();
  })();
});
app.on('window-all-closed', () => app.quit());
