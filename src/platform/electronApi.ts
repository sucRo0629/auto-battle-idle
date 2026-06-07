import type {
  CharacterBuild,
  ClassId,
  PartySlotState,
} from '../battle/types.ts';
import type { MetaMenuInitialView } from '../ui/MetaMenuOverlay.ts';

export interface MenuInitPayload {
  party: PartySlotState[];
  unlockedClassIds: ClassId[];
  initialView?: MetaMenuInitialView;
}

export interface BattleElectronAPI {
  readonly isElectron: true;
  openMenu: (initialView?: MetaMenuInitialView) => Promise<void>;
  onMenuBuildChanged: (
    handler: (partyIndex: number, build: CharacterBuild) => void,
  ) => void;
  onMenuPartySlotChanged: (
    handler: (slotIndex: number, member: PartySlotState) => void,
  ) => void;
  onMenuClosed: (handler: () => void) => void;
}

export interface MenuElectronAPI {
  onInit: (handler: (payload: MenuInitPayload) => void) => void;
  applyBuildChange: (partyIndex: number, build: CharacterBuild) => void;
  applyPartySlotChange: (slotIndex: number, member: PartySlotState) => void;
  close: () => void;
}

declare global {
  interface Window {
    battleElectronAPI?: BattleElectronAPI;
    menuElectronAPI?: MenuElectronAPI;
    __getMenuSnapshot?: () => MenuInitPayload;
  }
}

export function isElectronBattle(): boolean {
  return window.battleElectronAPI?.isElectron === true;
}

export function isElectronMenu(): boolean {
  return window.menuElectronAPI !== undefined;
}
