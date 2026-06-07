import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('battleElectronAPI', {
  isElectron: true,
  openMenu: (initialView) => ipcRenderer.invoke('menu:open', initialView ?? 'hub'),
  onMenuBuildChanged: (handler) => {
    ipcRenderer.on('menu:build-changed', (_event, partyIndex, build) => {
      handler(partyIndex, build);
    });
  },
  onMenuPartySlotChanged: (handler) => {
    ipcRenderer.on('menu:party-slot-changed', (_event, slotIndex, member) => {
      handler(slotIndex, member);
    });
  },
  onMenuClosed: (handler) => {
    ipcRenderer.on('menu:closed', () => handler());
  },
});
