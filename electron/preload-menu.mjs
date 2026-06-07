import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('menuElectronAPI', {
  onInit: (handler) => {
    ipcRenderer.on('menu:init', (_event, payload) => handler(payload));
  },
  applyBuildChange: (partyIndex, build) => {
    ipcRenderer.send('menu:build-changed', partyIndex, build);
  },
  applyPartySlotChange: (slotIndex, member) => {
    ipcRenderer.send('menu:party-slot-changed', slotIndex, member);
  },
  close: () => ipcRenderer.send('menu:close'),
});
