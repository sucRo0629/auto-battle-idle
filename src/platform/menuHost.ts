import type {
  CharacterBuild,
  ClassId,
  GameData,
  PartySlotState,
} from '../battle/types.ts';
import type { MetaMenuInitialView } from '../ui/MetaMenuOverlay.ts';
import { DomModalMenuHost } from './DomModalMenuHost.ts';
import { ElectronBattleMenuHost } from './ElectronBattleMenuHost.ts';
import { isElectronBattle } from './electronApi.ts';

export type { MetaMenuInitialView };

export interface MenuHostContext {
  gameData: GameData;
  getParty: () => PartySlotState[];
  getUnlockedClassIds: () => ClassId[];
  onBuildChanged: (partyIndex: number, build: CharacterBuild) => void;
  onPartySlotChanged: (slotIndex: number, member: PartySlotState) => void;
  onOpenChange: (open: boolean) => void;
}

export interface MenuHost {
  open(initialView?: MetaMenuInitialView): void;
  close(): void;
  isOpen(): boolean;
}

export function createMenuHost(context: MenuHostContext): MenuHost {
  if (isElectronBattle()) {
    return new ElectronBattleMenuHost(context);
  }
  return new DomModalMenuHost(context);
}
