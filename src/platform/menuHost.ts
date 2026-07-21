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

export interface FormationReturnOptions {
  label: string;
  canReturn: () => boolean;
}

export interface MenuHostContext {
  gameData: GameData;
  levelCurves: LevelCurvesConfig;
  formationHost: HTMLElement;
  getParty: () => PartySlotState[];
  getUnlockedClassIds: () => ClassId[];
  isVerifyMode: () => boolean;
  onBuildChanged: (partyIndex: number, build: CharacterBuild) => void;
  onPartySlotChanged: (slotIndex: number, member: PartySlotState) => void;
  /** R9.5c: party slot ごとの combat module 選択（Save 非統合） */
  getPartySlotCombatModule?: (slotIndex: number) => string | undefined;
  onPartySlotCombatModuleChanged?: (slotIndex: number, moduleId: string) => void;
  onScreenChange: (screen: GameScreen) => void;
  /** R7d: formation 閉じた後の遷移先（省略時 battle） */
  resolveFormationCloseScreen?: () => GameScreen;
  /** R7d: formation フッター戻りボタンの上書き（省略時は戦闘へ戻る） */
  getFormationReturnOptions?: () => FormationReturnOptions | undefined;
  /** R12m: Formation Class Select 候補の許可兵科（省略時は全 runtime 兵科） */
  getFormationAllowedClassIds?: () => readonly ClassId[] | undefined;
}

export interface MenuHost {
  open(initialView?: MetaMenuInitialView): void;
  close(): void;
  /** Tear down menu UI without changing game screen (stage-select transitions, etc.). */
  dismiss(): void;
  isOpen(): boolean;
}

export function createMenuHost(context: MenuHostContext): MenuHost {
  if (isElectronBattle()) {
    return new ElectronBattleMenuHost(context);
  }
  return new DomFormationScreenHost(context);
}
