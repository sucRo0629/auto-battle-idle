import { BattleEngine } from '../battle/BattleEngine.ts';
import type { GameData, SaveGameState } from '../battle/types.ts';
import { loadLevelCurves, type LevelCurvesConfig } from '../progression/levelGrowth.ts';
import { computeStageExpReward, getStageById } from '../progression/stageProgression.ts';
import {
  applyVictoryRewards,
  createDefaultSave,
  formatExpGrantLog,
  formatLevelUpLog,
} from '../progression/victoryRewards.ts';
import { SaveManager } from '../save/SaveManager.ts';
import { BattleView } from '../ui/BattleView.ts';
import levelCurvesJson from '../../data/levelCurves.json';

const AUTO_SAVE_INTERVAL_MS = 60_000;

export class GameSession {
  private readonly saveManager = new SaveManager();
  private readonly levelCurves: LevelCurvesConfig;
  private readonly save: SaveGameState;
  private readonly engine: BattleEngine;
  readonly view: BattleView;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly gameData: GameData,
    container: HTMLElement,
  ) {
    this.levelCurves = loadLevelCurves(levelCurvesJson);
    this.save = this.saveManager.load() ?? createDefaultSave(gameData);
    this.saveManager.save(this.save);

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
    );

    this.engine.onEvent((event) => {
      if (event.type !== 'battleEnd') return;
      if (event.result === 'victory') {
        this.handleVictory(event.survivingPartyIndices);
      }
      this.persistSave();
    });

    window.addEventListener('beforeunload', this.handleBeforeUnload);
    this.autoSaveTimer = setInterval(() => this.persistSave(), AUTO_SAVE_INTERVAL_MS);
  }

  getSaveState(): SaveGameState {
    return this.save;
  }

  start(): void {
    this.engine.startBattle();
  }

  tick(deltaSec: number, deltaMs: number): void {
    this.engine.tick(deltaSec);
    this.view.tick(deltaMs);
  }

  destroy(): void {
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    if (this.autoSaveTimer !== null) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.persistSave();
    this.view.destroy();
  }

  private handleBeforeUnload = (): void => {
    this.persistSave();
  };

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
    this.saveManager.save(this.save);
  }
}
