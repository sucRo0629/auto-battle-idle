import type { CharacterBuild, GameData, PartyMemberState } from '../battle/types.ts';
import { DomModalMenuHost } from './DomModalMenuHost.ts';
import { ElectronBattleMenuHost } from './ElectronBattleMenuHost.ts';
import { isElectronBattle } from './electronApi.ts';

export interface MenuHostContext {
  gameData: GameData;
  getParty: () => PartyMemberState[];
  onBuildChanged: (partyIndex: number, build: CharacterBuild) => void;
  onOpenChange: (open: boolean) => void;
}

export interface MenuHost {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export function createMenuHost(context: MenuHostContext): MenuHost {
  if (isElectronBattle()) {
    return new ElectronBattleMenuHost(context);
  }
  return new DomModalMenuHost(context);
}
