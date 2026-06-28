import { BattleEngine } from '../battle/BattleEngine.ts';
import { StageDamageStatsTracker } from '../battle/stageDamageStats.ts';
import type {
  CharacterBuild,
  GameData,
  PartySlotState,
  SaveGameState,
} from '../battle/types.ts';
import {
  normalizeActiveSlots,
  reconcilePartyBuilds,
} from '../progression/skillBuild.ts';
import { applyDebugPlayerLevel } from '../dev/debugLevel.ts';
import {
  getDebugLoopStageId,
  getDebugLoopWaveIndex,
  setDebugLoopStageId,
  setDebugLoopWaveIndex,
} from '../dev/debugLoopStage.ts';
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
  resolveKnownStageId,
  resolveVictoryNextStageId,
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
  private loopStageId: string | null;
  private loopWaveIndex: number | null;
  private readonly engine: BattleEngine;
  readonly view: BattleView;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private metaMenuOpen = false;
  private statsDrawerOpen = false;
  private readonly stageDamageStats = new StageDamageStatsTracker();
  private readonly menuHost: MenuHost;

  constructor(
    private readonly gameData: GameData,
    container: HTMLElement,
  ) {
    this.levelCurves = loadLevelCurves(levelCurvesJson);
    this.verifyMode = isVerifyModeEnabled();
    this.loopStageId = this.verifyMode ? getDebugLoopStageId() : null;
    this.loopWaveIndex = this.verifyMode ? getDebugLoopWaveIndex() : null;
    this.save = this.loadSaveForMode(this.verifyMode);

    if (this.verifyMode && this.loopStageId) {
      const loopStage = getStageById(this.gameData.stages, this.loopStageId);
      if (loopStage) {
        this.save.stageProgress.currentStageId = this.loopStageId;
        this.sanitizeLoopWaveIndex();
      } else {
        this.clearLoopStageSelection();
      }
    }

    this.stageDamageStats.resetForStage(
      this.save.stageProgress.currentStageId,
    );

    this.engine = new BattleEngine(
      gameData,
      this.levelCurves,
      () => this.save.party,
      () => this.save.stageProgress.currentStageId,
      {
        onDamageApplied: (actor, target, amount) => {
          this.stageDamageStats.recordDamage(actor, target, amount);
        },
        getLoopWaveIndex: () =>
          this.verifyMode ? this.loopWaveIndex : null,
        getBattleXDebugEnabled: () => this.verifyMode,
      },
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
        onOpenMetaMenu: () => this.openPartyMenu(),
        onPlayerLevelChange: (level) => this.setPlayerLevel(level),
        getLoopStageId: () => this.getLoopStageId(),
        getLoopWaveIndex: () => this.getLoopWaveIndex(),
        onLoopStageChange: (stageId) => this.setLoopStage(stageId),
        onLoopWaveChange: (waveIndex) => this.setLoopWave(waveIndex),
        getStageDamageDisplayRows: () =>
          this.stageDamageStats.getDisplayRows(
            this.save.party,
            this.gameData.classRegistry,
          ),
        getCurrentStageId: () => this.save.stageProgress.currentStageId,
        onStatsDrawerOpenChange: (open) => {
          this.statsDrawerOpen = open;
          this.view.setStatsDrawerDisabled(this.metaMenuOpen);
          this.view.setMenuButtonDisabled(open || this.metaMenuOpen);
        },
      },
    );

    this.menuHost = createMenuHost({
      gameData,
      levelCurves: this.levelCurves,
      getParty: () => this.save.party,
      onBuildChanged: (partyIndex, build) => this.updateMemberBuild(partyIndex, build),
      getUnlockedClassIds: () => this.save.unlockedClassIds,
      onPartySlotChanged: (slotIndex, member) =>
        this.updatePartySlot(slotIndex, member),
      onOpenChange: (open) => {
        this.metaMenuOpen = open;
        this.view.setMenuButtonDisabled(open || this.statsDrawerOpen);
        this.view.setStatsDrawerDisabled(open);
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
    this.loopStageId = enabled ? getDebugLoopStageId() : null;
    this.loopWaveIndex = enabled ? getDebugLoopWaveIndex() : null;
    this.save = this.loadSaveForMode(enabled);

    if (enabled && this.loopStageId) {
      const loopStage = getStageById(this.gameData.stages, this.loopStageId);
      if (loopStage) {
        this.save.stageProgress.currentStageId = this.loopStageId;
        this.sanitizeLoopWaveIndex();
      } else {
        this.clearLoopStageSelection();
      }
    }

    this.stageDamageStats.resetForStage(
      this.save.stageProgress.currentStageId,
    );

    this.engine.restartBattle();
    this.persistSave();
    this.view.syncVerifyModeToggle(enabled);
  }

  start(): void {
    this.engine.startBattle();
  }

  isMetaMenuOpen(): boolean {
    return this.metaMenuOpen;
  }

  openPartyMenu(): void {
    this.menuHost.open('party');
  }

  closeMetaMenu(): void {
    this.menuHost.close();
  }

  updateMemberBuild(partyIndex: number, build: CharacterBuild): void {
    const member = this.save.party[partyIndex];
    if (!member) return;
    member.build = structuredClone(normalizeActiveSlots(build));
    this.persistSave();
    this.engine.syncPartyBuilds();
  }

  updatePartySlot(slotIndex: number, member: PartySlotState): void {
    if (slotIndex < 0 || slotIndex >= this.save.party.length) return;
    this.save.party[slotIndex] = member
      ? structuredClone(member)
      : null;
    this.persistSave();
    this.engine.restartBattle();
  }

  setPlayerLevel(level: number): void {
    if (!this.verifyMode) return;

    applyDebugPlayerLevel(this.save.party, level, this.gameData);
    this.persistSave();
    this.engine.restartBattle();
    console.log(`[debug] Player → Lv ${level}`);
  }

  getLoopStageId(): string | null {
    return this.verifyMode ? this.loopStageId : null;
  }

  getLoopWaveIndex(): number | null {
    return this.verifyMode ? this.loopWaveIndex : null;
  }

  setLoopStage(stageId: string | null): void {
    if (!this.verifyMode) return;

    this.loopStageId = stageId;
    setDebugLoopStageId(stageId);

    if (stageId === null) {
      this.loopWaveIndex = null;
      setDebugLoopWaveIndex(null);
      console.log('[debug] Loop stage cleared (normal progression)');
      return;
    }

    const stage = getStageById(this.gameData.stages, stageId);
    const waveCount = stage?.waves.length ?? 0;
    if (
      this.loopWaveIndex !== null &&
      (waveCount === 0 || this.loopWaveIndex >= waveCount)
    ) {
      this.loopWaveIndex = null;
      setDebugLoopWaveIndex(null);
    }

    this.save.stageProgress.currentStageId = stageId;
    this.stageDamageStats.resetForStage(stageId);
    this.engine.restartBattle();
    this.persistSave();
    console.log(
      `[debug] Loop stage pinned: ${stage?.displayName ?? stageId}`,
    );
  }

  setLoopWave(waveIndex: number | null): void {
    if (!this.verifyMode || this.loopStageId === null) return;

    const stage = getStageById(this.gameData.stages, this.loopStageId);
    const waveCount = stage?.waves.length ?? 0;
    const clamped =
      waveIndex !== null && waveIndex >= 0 && waveIndex < waveCount
        ? waveIndex
        : null;

    this.loopWaveIndex = clamped;
    setDebugLoopWaveIndex(clamped);
    this.engine.restartBattle();
    this.persistSave();

    if (clamped === null) {
      console.log(
        `[debug] Loop wave cleared (all waves): ${stage?.displayName ?? this.loopStageId}`,
      );
    } else {
      console.log(
        `[debug] Loop wave pinned: ${stage?.displayName ?? this.loopStageId} Wave ${clamped + 1}`,
      );
    }
  }

  tick(deltaSec: number, deltaMs: number): void {
    const debugReplayPaused =
      this.verifyMode && this.view.isBattleXDebugReplayPaused();
    if (!this.metaMenuOpen && !debugReplayPaused) {
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
    reconcilePartyBuilds(save.party, this.gameData);
    const resolvedStageId = resolveKnownStageId(
      this.gameData.stages,
      save.stageProgress.currentStageId,
    );
    if (resolvedStageId !== null) {
      save.stageProgress.currentStageId = resolvedStageId;
    }
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

    if (this.verifyMode && this.loopStageId) {
      console.log(`[progress] Defeat at ${failedStageName} (loop locked)`);
      return;
    }

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

    this.stageDamageStats.resetForStage(previousStageId);
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

    const loopStageId = this.verifyMode ? this.loopStageId : null;
    const nextStageId = resolveVictoryNextStageId(
      this.gameData.stages,
      clearedStageId,
      loopStageId,
    );
    if (nextStageId !== result.nextStageId) {
      this.save.stageProgress.currentStageId = nextStageId;
    }

    this.stageDamageStats.resetForStage(
      this.save.stageProgress.currentStageId,
    );

    for (const levelUp of result.levelUps) {
      console.log(`[progress] ${formatLevelUpLog(levelUp)}`);
    }

    const nextStage = getStageById(this.gameData.stages, nextStageId);
    const nextStageName = nextStage?.displayName ?? nextStageId;
    const progressLog = loopStageId
      ? `[progress] Stage clear: ${stageName} (loop: ${nextStageName})`
      : nextStageId === clearedStageId
        ? `[progress] Stage clear: ${stageName} (loop)`
        : `[progress] Stage clear: ${stageName} → ${nextStageName}`;
    console.log(progressLog);
  }

  private sanitizeLoopWaveIndex(): void {
    if (this.loopStageId === null || this.loopWaveIndex === null) return;

    const stage = getStageById(this.gameData.stages, this.loopStageId);
    const waveCount = stage?.waves.length ?? 0;
    if (waveCount === 0 || this.loopWaveIndex >= waveCount) {
      this.loopWaveIndex = null;
      setDebugLoopWaveIndex(null);
    }
  }

  private clearLoopStageSelection(): void {
    this.loopStageId = null;
    this.loopWaveIndex = null;
    setDebugLoopStageId(null);
    setDebugLoopWaveIndex(null);
  }

  private persistSave(): void {
    this.saveManager.save(this.save, saveStorageKey(this.verifyMode));
  }
}
