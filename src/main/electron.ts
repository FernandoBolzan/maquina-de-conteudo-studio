import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, session, Menu } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import updater from 'electron-updater';
import { Runtime } from './runtime.js';
import { consent } from './context.js';
import { unsupportedUpdateMessage } from './update-policy.js';

const { autoUpdater } = updater;
const here = dirname(fileURLToPath(import.meta.url));
let window: BrowserWindow | undefined;
let runtime: Runtime | undefined;
let quitting = false;
let updateAvailable = false;
const renderer = pathToFileURL(join(here, '../renderer/index.html')).href;
const devURL = process.env.MDC_DEV_URL;
if (devURL && !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(devURL)) throw new Error('MDC_DEV_URL precisa apontar para 127.0.0.1.');
protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { window?.show(); window?.focus(); });
  app.whenReady().then(start).catch(error => { dialog.showErrorBox('Não foi possível iniciar', String(error)); app.quit(); });
}
async function start(): Promise<void> {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.setFeedURL({ provider: 'github', owner: 'FernandoBolzan', repo: 'maquina-de-conteudo-studio' });
  autoUpdater.on('error', error => { window?.webContents.send('maquina:event', { type: 'output', jobId: 'system', data: `Atualização: ${error.message}\n` }); });
  runtime = new Runtime(process.env.MDC_DATA_DIR || app.getPath('userData'), {
    assetPrefix: 'media://asset/',
    pickFile: async options => {
      const properties: Array<'openDirectory' | 'createDirectory' | 'openFile' | 'multiSelections'> = options?.directory ? ['openDirectory', 'createDirectory'] : options?.multiple ? ['openFile', 'multiSelections'] : ['openFile'];
      const result = await dialog.showOpenDialog({ properties, filters: options?.extensions?.length ? [{ name: 'Arquivos', extensions: options.extensions }] : undefined });
      if (result.canceled) return undefined;
      return options?.multiple ? result.filePaths : result.filePaths[0];
    },
    openPath: async path => { const error = await shell.openPath(path); if (error) throw new Error(error); },
    openExternal: async url => { await shell.openExternal(url); },
    update: async (action, payload) => {
      if (!app.isPackaged) return { available: false, message: 'Atualização do aplicativo disponível somente no pacote instalado.' };
      const unsupported = unsupportedUpdateMessage(process.platform, process.env.APPIMAGE);
      if (unsupported) {
        if (action === 'app.updateCheck') return { available: false, message: unsupported };
        consent(payload);
        throw new Error(unsupported);
      }
      if (action === 'app.updateCheck') {
        const result = await autoUpdater.checkForUpdates();
        updateAvailable = !!result && result.updateInfo.version !== app.getVersion();
        return { available: updateAvailable, version: result?.updateInfo.version, message: updateAvailable ? 'Nova versão disponível.' : 'Você está na versão atual.' };
      }
      consent(payload);
      if (!updateAvailable) throw new Error('Verifique uma atualização disponível antes de instalar.');
      if (runtime?.supervisor.list().some(job => job.status === 'running')) throw new Error('Finalize as tarefas antes de atualizar o aplicativo.');
      await autoUpdater.downloadUpdate();
      autoUpdater.quitAndInstall();
      return { message: 'Atualização baixada. Reiniciando.' };
    },
  }, event => { if (window && !window.isDestroyed()) window.webContents.send('maquina:event', event); }, app.getVersion());
  await runtime.init();
  protocol.handle('media', async request => {
    try {
      const url = new URL(request.url); if (url.hostname !== 'asset') return new Response('Forbidden', { status: 403 });
      const path = await runtime!.mediaPath(url.pathname.slice(1));
      return net.fetch(pathToFileURL(path).href, { headers: request.headers });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 800, minHeight: 600, title: 'Máquina de Conteúdo (Studio)', backgroundColor: '#09090b', autoHideMenuBar: true, show: false, webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== (devURL || renderer)) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  ipcMain.handle('maquina:invoke', async (event, action: unknown, payload: unknown) => {
    const origin = event.senderFrame?.url;
    if (event.sender !== window?.webContents || event.senderFrame !== event.sender.mainFrame || !origin || (devURL ? new URL(origin).origin !== new URL(devURL).origin : origin !== renderer)) throw new Error('Origem não autorizada.');
    if (typeof action !== 'string' || (payload !== undefined && (!payload || typeof payload !== 'object' || Array.isArray(payload)))) throw new Error('Mensagem inválida.');
    return runtime!.invoke(action, (payload || {}) as Record<string, unknown>);
  });
  Menu.setApplicationMenu(null);
  window.once('ready-to-show', () => { window?.show(); console.log('ELECTRON_WINDOW_READY'); });
  if (devURL) await window.loadURL(devURL); else await window.loadFile(join(here, '../renderer/index.html'));
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
