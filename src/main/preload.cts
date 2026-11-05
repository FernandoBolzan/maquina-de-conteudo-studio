import { contextBridge, ipcRenderer } from 'electron';
import type { AppEvent, DesktopAPI } from '../shared/contracts.js';
const api: DesktopAPI = {
  invoke: (action, payload) => ipcRenderer.invoke('maquina:invoke', action, payload),
  onEvent: listener => {
    const handler = (_event: Electron.IpcRendererEvent, value: AppEvent) => listener(value);
    ipcRenderer.on('maquina:event', handler);
    return () => ipcRenderer.removeListener('maquina:event', handler);
  },
};
contextBridge.exposeInMainWorld('maquina', Object.freeze(api));
