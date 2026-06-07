import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('battleElectronAPI', {
  isElectron: true,
  openMenu: () => ipcRenderer.invoke('menu:open'),
  onMenuBuildChanged: (handler) => {
    ipcRenderer.on('menu:build-changed', (_event, partyIndex, build) => {
      handler(partyIndex, build);
    });
  },
  onMenuClosed: (handler) => {
    ipcRenderer.on('menu:closed', () => handler());
  },
});
