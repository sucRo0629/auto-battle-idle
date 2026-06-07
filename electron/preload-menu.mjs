import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('menuElectronAPI', {
  onInit: (handler) => {
    ipcRenderer.on('menu:init', (_event, party) => handler(party));
  },
  applyBuildChange: (partyIndex, build) => {
    ipcRenderer.send('menu:build-changed', partyIndex, build);
  },
  close: () => ipcRenderer.send('menu:close'),
});
