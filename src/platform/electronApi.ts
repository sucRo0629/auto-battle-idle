import type { CharacterBuild, PartyMemberState } from '../battle/types.ts';

export interface BattleElectronAPI {
  readonly isElectron: true;
  openMenu: () => Promise<void>;
  onMenuBuildChanged: (
    handler: (partyIndex: number, build: CharacterBuild) => void,
  ) => void;
  onMenuClosed: (handler: () => void) => void;
}

export interface MenuElectronAPI {
  onInit: (handler: (party: PartyMemberState[]) => void) => void;
  applyBuildChange: (partyIndex: number, build: CharacterBuild) => void;
  close: () => void;
}

declare global {
  interface Window {
    battleElectronAPI?: BattleElectronAPI;
    menuElectronAPI?: MenuElectronAPI;
    __getPartySnapshot?: () => PartyMemberState[];
  }
}

export function isElectronBattle(): boolean {
  return window.battleElectronAPI?.isElectron === true;
}

export function isElectronMenu(): boolean {
  return window.menuElectronAPI !== undefined;
}
