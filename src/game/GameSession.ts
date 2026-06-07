import { BattleEngine } from '../battle/BattleEngine.ts';
import type { CharacterBuild, GameData, SaveGameState } from '../battle/types.ts';
import { normalizeEquippedSlots } from '../progression/skillBuild.ts';
import {
  isVerifyModeEnabled,
  partyIdForVerifyMode,
  saveStorageKey,
  setVerifyModeEnabled,
} from '../dev/verifyMode.ts';
import { loadLevelCurves, type LevelCurvesConfig } from '../progression/levelGrowth.ts';
import {
  applyStageRollbackOnDefeat,
  computeStageExpReward,
  getStageById,
} from '../progression/stageProgression.ts';
import {
  applyVictoryRewards,
  createDefaultSave,
  formatExpGrantLog,
  formatLevelUpLog,
} from '../progression/victoryRewards.ts';
import { createMenuHost, type MenuHost } from '../platform/menuHost.ts';
import { SaveManager } from '../save/SaveManager.ts';
import { BattleView } from '../ui/BattleView.ts';
import levelCurvesJson from '../../data/levelCurves.json';

const AUTO_SAVE_INTERVAL_MS = 60_000;

export class GameSession {
  private readonly saveManager = new SaveManager();
  private readonly levelCurves: LevelCurvesConfig;
  private save: SaveGameState;
  private verifyMode: boolean;
  private readonly engine: BattleEngine;
  readonly view: BattleView;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private metaMenuOpen = false;
  private readonly menuHost: MenuHost;

  constructor(
    private readonly gameData: GameData,
    container: HTMLElement,
  ) {
    this.levelCurves = loadLevelCurves(levelCurvesJson);
    this.verifyMode = isVerifyModeEnabled();
    this.save = this.loadSaveForMode(this.verifyMode);

    this.engine = new BattleEngine(
      gameData,
      this.levelCurves,
      () => this.save.party,
      () => this.save.stageProgress.currentStageId,
    );

    this.view = new BattleView(
      container,
      this.engine,
      gameData,
      this.levelCurves,
      () => this.save,
      {
        isVerifyMode: () => this.verifyMode,
        onVerifyModeChange: (enabled) => this.setVerifyMode(enabled),
        onOpenMetaMenu: () => this.openMetaMenu(),
      },
    );

    this.menuHost = createMenuHost({
      gameData,
      getParty: () => this.save.party,
      onBuildChanged: (partyIndex, build) => this.updateMemberBuild(partyIndex, build),
      onOpenChange: (open) => {
        this.metaMenuOpen = open;
        this.view.setMenuButtonDisabled(open);
      },
    });

    this.engine.onEvent((event) => {
      if (event.type !== 'battleEnd') return;
      if (event.result === 'victory') {
        this.handleVictory(event.survivingPartyIndices);
      } else {
        this.handleDefeat();
      }
      this.persistSave();
    });

    window.addEventListener('beforeunload', this.handleBeforeUnload);
    this.autoSaveTimer = setInterval(() => this.persistSave(), AUTO_SAVE_INTERVAL_MS);
  }

  getSaveState(): SaveGameState {
    return this.save;
  }

  isVerifyMode(): boolean {
    return this.verifyMode;
  }

  setVerifyMode(enabled: boolean): void {
    if (this.verifyMode === enabled) return;

    this.persistSave();
    this.verifyMode = enabled;
    setVerifyModeEnabled(enabled);
    this.save = this.loadSaveForMode(enabled);
    this.engine.restartBattle();
    this.persistSave();
  }

  start(): void {
    this.engine.startBattle();
  }

  isMetaMenuOpen(): boolean {
    return this.metaMenuOpen;
  }

  openMetaMenu(): void {
    this.menuHost.open();
  }

  closeMetaMenu(): void {
    this.menuHost.close();
  }

  updateMemberBuild(partyIndex: number, build: CharacterBuild): void {
    const member = this.save.party[partyIndex];
    if (!member) return;
    member.build = structuredClone(normalizeEquippedSlots(build));
    this.persistSave();
    this.engine.syncPartyBuilds();
  }

  tick(deltaSec: number, deltaMs: number): void {
    if (!this.metaMenuOpen) {
      this.engine.tick(deltaSec);
    }
    this.view.tick(deltaMs);
  }

  destroy(): void {
    this.closeMetaMenu();
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    if (this.autoSaveTimer !== null) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.persistSave();
    this.view.destroy();
  }

  private loadSaveForMode(verifyMode: boolean): SaveGameState {
    const storageKey = saveStorageKey(verifyMode);
    const partyId = partyIdForVerifyMode(verifyMode);
    const loaded = this.saveManager.load(storageKey);
    const save = loaded ?? createDefaultSave(this.gameData, partyId);
    this.saveManager.save(save, storageKey);
    return save;
  }

  private handleBeforeUnload = (): void => {
    this.persistSave();
  };

  private handleDefeat(): void {
    const failedStageId = this.save.stageProgress.currentStageId;
    const failedStage = getStageById(this.gameData.stages, failedStageId);
    const failedStageName = failedStage?.displayName ?? failedStageId;

    const previousStageId = applyStageRollbackOnDefeat(
      this.save,
      this.gameData.stages,
    );
    const previousStage = getStageById(this.gameData.stages, previousStageId);
    const previousStageName = previousStage?.displayName ?? previousStageId;

    if (previousStageId === failedStageId) {
      console.log(`[progress] Defeat at ${failedStageName} (staying)`);
      return;
    }

    console.log(
      `[progress] Defeat at ${failedStageName} → ${previousStageName}`,
    );
  }

  private handleVictory(survivingPartyIndices: number[]): void {
    const clearedStageId = this.save.stageProgress.currentStageId;
    const stage = getStageById(this.gameData.stages, clearedStageId);
    const stageName = stage?.displayName ?? clearedStageId;
    const expGranted = computeStageExpReward(
      this.gameData,
      clearedStageId,
    );

    for (const index of survivingPartyIndices) {
      const member = this.save.party[index];
      const preset = member
        ? this.gameData.classRegistry[member.classId]
        : undefined;
      if (!preset) continue;
      console.log(
        `[progress] ${formatExpGrantLog(preset.displayName, expGranted)}`,
      );
    }

    const result = applyVictoryRewards(
      this.save,
      this.gameData,
      this.levelCurves,
      survivingPartyIndices,
    );

    for (const levelUp of result.levelUps) {
      console.log(`[progress] ${formatLevelUpLog(levelUp)}`);
    }

    const nextStage = getStageById(this.gameData.stages, result.nextStageId);
    const nextStageName = nextStage?.displayName ?? result.nextStageId;
    const progressLog =
      result.nextStageId === clearedStageId
        ? `[progress] Stage clear: ${stageName} (loop)`
        : `[progress] Stage clear: ${stageName} → ${nextStageName}`;
    console.log(progressLog);
  }

  private persistSave(): void {
    this.saveManager.save(this.save, saveStorageKey(this.verifyMode));
  }
}
