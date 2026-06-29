import type {
  CharacterBuild,
  ClassId,
  GameData,
  PartySlotState,
} from '../battle/types.ts';
import type { GameScreen } from '../game/gameScreen.ts';
import type { LevelCurvesConfig } from '../progression/levelGrowth.ts';
import type { MetaMenuInitialView } from '../ui/MetaMenuOverlay.ts';
import { DomFormationScreenHost } from './DomFormationScreenHost.ts';
import { ElectronBattleMenuHost } from './ElectronBattleMenuHost.ts';
import { isElectronBattle } from './electronApi.ts';

export type { GameScreen, MetaMenuInitialView };

export interface MenuHostContext {
  gameData: GameData;
  levelCurves: LevelCurvesConfig;
  formationHost: HTMLElement;
  getParty: () => PartySlotState[];
  getUnlockedClassIds: () => ClassId[];
  isVerifyMode: () => boolean;
  onBuildChanged: (partyIndex: number, build: CharacterBuild) => void;
  onPartySlotChanged: (slotIndex: number, member: PartySlotState) => void;
  onScreenChange: (screen: GameScreen) => void;
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
  return new DomFormationScreenHost(context);
}
