import { BattleEngine } from '../battle/BattleEngine.ts';
import { PartyCombatModuleSelection } from '../battle/partyCombatModuleSelection.ts';
import { StageDamageStatsTracker } from '../battle/stageDamageStats.ts';
import { resolveSelectedCombatModuleId } from '../battle/data/resolveCombatModuleBasic.ts';
import type {
  CharacterBuild,
  ClassId,
  GameData,
  PartySlotState,
  SaveGameState,
} from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
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
  isBattleXDebugDisplayEnabled,
  setBattleXDebugDisplayEnabled,
} from '../dev/battleXDebugDisplay.ts';
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
import {
  validatePartyClassAssignment,
  validatePartyClassIds,
  type PartyClassAssignmentResult,
} from '../progression/partyCompose.ts';
import { createMenuHost, type MenuHost } from '../platform/menuHost.ts';
import { SaveManager } from '../save/SaveManager.ts';
import { BattleView } from '../ui/BattleView.ts';
import { formatPassiveDescription } from '../ui/formatSkillText.ts';
import type { GameScreen } from './gameScreen.ts';
import { OperationState, type OperationStateReadonlyView } from './OperationState.ts';
import {
  cloneOperationResult,
  type FinalizeOperationResultParams,
  type OperationResult,
} from './OperationResult.ts';
import {
  cloneCheckpointSnapshot,
  createCheckpointFromOperationState,
  restoreOperationStateFromCheckpoint,
  validateCheckpointSnapshot,
  type OperationCheckpointSnapshot,
} from './OperationCheckpoint.ts';
import {
  cloneOperationSource,
  tryGetFixedStageIdFromSource,
  type OperationSource,
} from './operationSource.ts';
import { createProblemSeriesInitialParty } from '../battle/problemSeries/initialParty.ts';
import {
  createProblemSeriesOperationStartSnapshot,
  type ProblemSeriesOperationStartSnapshot,
} from '../battle/problemSeries/operationStartSnapshot.ts';
import { resolveProblemSeriesFromSeed } from '../battle/problemSeries/seedResolve.ts';
import {
  createProblemSeriesWavePrepDisclosureContext,
} from '../battle/problemSeries/wavePrepDisclosure.ts';
import { createProblemSeriesWavePrepEnemyChanges } from '../battle/problemSeries/wavePrepEnemyChanges.ts';
import {
  createProblemSeriesVictoryResult,
  type ProblemSeriesVictoryResult,
} from '../battle/problemSeries/victoryResult.ts';
import {
  createProblemSeriesWavePrepDisclosureDisplay,
  type ProblemSeriesWavePrepDisclosureDisplay,
} from '../ui/problemSeriesWavePrepDisclosureViewModel.ts';
import type { ResolvedWavesCombatInput } from '../battle/resolvedWaveCombatInput.ts';
import { StageSelectionScreenHost } from './StageSelectionScreenHost.ts';
import { WavePrepScreenHost } from './WavePrepScreenHost.ts';
import {
  getOperationPassiveCandidatesForClass,
  isOperationPassiveCandidateForClass,
} from './operationPassiveCatalogCore.ts';
import { resolveOperationPassiveAcquireCost } from './operationPassiveAcquireCost.ts';
import '../styles/game-shell.css';
import levelCurvesJson from '../../data/levelCurves.json';

const AUTO_SAVE_INTERVAL_MS = 60_000;

/** R7b: 許可 simulation 倍率（1 / 2 / 4 のみ） */
export type SimulationSpeed = 1 | 2 | 4;

const ALLOWED_SIMULATION_SPEEDS: readonly SimulationSpeed[] = [1, 2, 4];

function isSimulationSpeed(value: number): value is SimulationSpeed {
  return (ALLOWED_SIMULATION_SPEEDS as readonly number[]).includes(value);
}

function cloneProblemSeriesVictoryResult(
  result: ProblemSeriesVictoryResult,
): ProblemSeriesVictoryResult {
  return {
    outcome: result.outcome,
    seed: result.seed,
    generatorVersion: result.generatorVersion,
    seriesId: result.seriesId,
    reachedWaveIndex: result.reachedWaveIndex,
  };
}

export class GameSession {
  private readonly saveManager = new SaveManager();
  private readonly levelCurves: LevelCurvesConfig;
  private save: SaveGameState;
  private verifyMode: boolean;
  private battleXDebugDisplayEnabled: boolean;
  private loopStageId: string | null;
  private loopWaveIndex: number | null;
  private readonly engine: BattleEngine;
  readonly view: BattleView;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private currentScreen: GameScreen = 'battle';
  private readonly battleHost: HTMLElement;
  private readonly formationHost: HTMLElement;
  private readonly wavePrepHost: HTMLElement;
  private readonly stageSelectHost: HTMLElement;
  private readonly stageSelectionHost: StageSelectionScreenHost;
  private readonly wavePrepScreenHost: WavePrepScreenHost;
  private readonly stageDamageStats = new StageDamageStatsTracker();
  private readonly menuHost: MenuHost;
  /** R5d / 作戦前: 編成画面での module 選択（作戦中は OperationState が正本） */
  private readonly preOperationModuleSelection = new PartyCombatModuleSelection();
  /** R6c: 作戦単位のメモリ専用状態（Save 非統合） */
  private operationState: OperationState | null = null;
  /** R6f: 出撃確定時点の作戦 snapshot（メモリのみ・Save 非統合） */
  private operationCheckpoint: OperationCheckpointSnapshot | null = null;
  /** R6h: 作戦完了時に確定する結果（メモリのみ・Save 非統合） */
  private operationResult: OperationResult | null = null;
  /**
   * R12m 1C: 問題系列の作戦開始スナップショット（メモリのみ）。
   * BattleEngine は getResolvedWavesCombatInput 経由で waves のみ参照する。
   * OperationState / Save へはまだ渡さない。
   */
  private problemSeriesOperationStartSnapshot: ProblemSeriesOperationStartSnapshot | null =
    null;
  /** R12m 2N3: 問題系列最終勝利時に確定する結果（メモリのみ・Save 非統合） */
  private problemSeriesVictoryResult: ProblemSeriesVictoryResult | null = null;
  /**
   * R12m 2T5B: 問題系列 Formation 中の mutable party draft。
   * MetaMenuOverlay が save.party と同様に slot 単位更新するため、getParty は安定参照を返す。
   */
  private problemSeriesFormationPartyDraft: PartySlotState[] | null = null;
  /** R6i: checkpoint 再戦中は onBattlefieldReload による Wave 進行巻き戻しを抑止 */
  private suppressOperationWaveReload = false;
  /** R7b: battle simulation 倍率（Save 非永続・初期 1 倍） */
  private simulationSpeed: SimulationSpeed = 1;
  /** R7d: Wave 間準備を維持したまま formation へ一時遷移中 */
  private wavePrepSuspended = false;

  constructor(
    private readonly gameData: GameData,
    container: HTMLElement,
  ) {
    this.levelCurves = loadLevelCurves(levelCurvesJson);
    this.verifyMode = isVerifyModeEnabled();
    this.battleXDebugDisplayEnabled = isBattleXDebugDisplayEnabled();
    this.loopStageId = this.verifyMode ? getDebugLoopStageId() : null;
    this.loopWaveIndex = this.verifyMode ? getDebugLoopWaveIndex() : null;
    this.save = this.loadSaveForMode(this.verifyMode);

    container.classList.add('game-app');
    const shell = document.createElement('div');
    shell.className = 'game-shell';
    container.appendChild(shell);

    this.battleHost = document.createElement('div');
    this.battleHost.className = 'game-shell__battle';

    this.formationHost = document.createElement('div');
    this.formationHost.className = 'game-shell__formation';
    this.formationHost.hidden = true;

    this.wavePrepHost = document.createElement('div');
    this.wavePrepHost.className = 'game-shell__wave-prep';
    this.wavePrepHost.hidden = true;

    this.stageSelectHost = document.createElement('div');
    this.stageSelectHost.className = 'game-shell__stage-select';
    this.stageSelectHost.hidden = true;

    shell.append(this.battleHost, this.formationHost, this.wavePrepHost, this.stageSelectHost);

    this.stageSelectionHost = new StageSelectionScreenHost(
      this.stageSelectHost,
      gameData,
      {
        getCurrentStageId: () => this.save.stageProgress.currentStageId,
        getClearedStageIds: () => this.save.stageProgress.clearedStageIds ?? [],
        onSortie: (stageId) => this.handleStageSortie(stageId),
        onPrepareMainOperation: (normalizedSeed) =>
          this.prepareProblemSeriesOperationStart(normalizedSeed),
        getPreparedProblemSeriesOperationStartSnapshot: () =>
          this.getProblemSeriesOperationStartSnapshot(),
        onBackFromMainOperationOverview: () =>
          this.discardPreparedProblemSeriesSnapshot(),
        onConfirmMainOperation: () =>
          this.handleConfirmPreparedProblemSeriesOperation(),
      },
      !this.verifyMode,
    );

    this.wavePrepScreenHost = new WavePrepScreenHost(
      this.wavePrepHost,
      gameData,
      {
        getOperationView: () => this.getOperationState(),
        getProblemSeriesDisclosureDisplay: () =>
          this.resolveProblemSeriesWavePrepDisclosureDisplay(),
        getAllowedClassIds: () =>
          this.getFormationAllowedClassIdsForCurrentOperation(),
        getUnlockedClassIds: () => this.save.unlockedClassIds,
        getSelectedModuleId: (slotIndex) =>
          this.resolveCombatModuleSelection().getSelectedCombatModuleId(
            slotIndex,
          ),
        onPartySlotChanged: (slotIndex, member) =>
          this.tryUpdateOperationPartySlot(slotIndex, member),
        onModuleChanged: (slotIndex, moduleId) =>
          this.trySetOperationSlotCombatModule(slotIndex, moduleId),
        getUnspentOperationResource: () => this.getOperationUnspentResource(),
        getAcquiredOperationPassiveIds: (slotIndex) =>
          this.getOperationAcquiredPassiveIds(slotIndex),
        getOperationPassiveCandidates: (slotIndex) =>
          this.getOperationPassiveCandidates(slotIndex),
        getPassiveAcquireCost: (slotIndex, passiveId) =>
          this.resolveOperationPassiveAcquireCostForSlot(slotIndex, passiveId),
        getPassiveDisplayName: (passiveId) =>
          this.gameData.skillRegistry.passives[passiveId]?.name ?? passiveId,
        getPassiveDescription: (passiveId) => {
          const passive = this.gameData.skillRegistry.passives[passiveId];
          return passive ? formatPassiveDescription(passive) : '';
        },
        onAcquireOperationPassive: (slotIndex, passiveId) =>
          this.tryAcquireOperationPassive(slotIndex, passiveId),
        onConfirmNextWave: () => this.confirmWavePrepAndStartNextWave(),
        shouldShowRetryActions: () => this.shouldShowWavePrepRetry(),
        onRetryCurrentWave: () => this.retryCurrentWaveFromCheckpoint(),
        onReturnToFormationPrep: () => this.returnToFormationPrep(),
        onRestartOperationFromWaveZero: () => this.restartOperationFromWaveZero(),
        onReturnToStageSelect: () => this.returnToStageSelectFromWavePrep(),
      },
    );

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
      () => this.resolveBattleParty(),
      () => this.save.stageProgress.currentStageId,
      {
        onDamageApplied: (actor, target, amount) => {
          this.stageDamageStats.recordDamage(actor, target, amount);
        },
        onHealRecorded: (actor, _target, amount) => {
          this.stageDamageStats.recordHeal(actor, amount);
        },
        getLoopWaveIndex: () =>
          this.verifyMode ? this.loopWaveIndex : null,
        getBattleXDebugEnabled: () =>
          this.verifyMode && this.battleXDebugDisplayEnabled,
        getSelectedCombatModuleId: (slotIndex) =>
          this.resolveCombatModuleSelection().getSelectedCombatModuleId(slotIndex),
        getAcquiredOperationPassiveIds: (slotIndex) =>
          this.getOperationAcquiredPassiveIds(slotIndex),
        onBattlefieldReload: () => this.handleBattlefieldReload(),
        getResolvedWavesCombatInput: () =>
          this.getResolvedWavesCombatInputForActiveOperation(),
      },
    );

    this.view = new BattleView(
      this.battleHost,
      this.engine,
      gameData,
      this.levelCurves,
      () => this.save,
      {
        isVerifyMode: () => this.verifyMode,
        onVerifyModeChange: (enabled) => this.setVerifyMode(enabled),
        isBattleXDebugDisplayEnabled: () => this.battleXDebugDisplayEnabled,
        onBattleXDebugDisplayChange: (enabled) =>
          this.setBattleXDebugDisplay(enabled),
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
        canUseOperationRetry: () => this.canUseOperationRetry(),
        shouldShowDefeatRetry: () => this.shouldShowDefeatRetry(),
        onRetryCurrentWave: () => this.retryCurrentWaveFromCheckpoint(),
        onReturnToFormationPrep: () => this.returnToFormationPrep(),
        onRestartOperationFromWaveZero: () => this.restartOperationFromWaveZero(),
        shouldShowVictoryResult: () => this.shouldShowVictoryResult(),
        getOperationResultForDisplay: () => this.getOperationResultForDisplay(),
        shouldShowProblemSeriesVictoryResult: () =>
          this.shouldShowProblemSeriesVictoryResult(),
        getProblemSeriesVictoryResultForDisplay: () =>
          this.getProblemSeriesVictoryResultForDisplay(),
        onRematchSameStage: () => this.rematchSameStageFromResult(),
        onReturnToStageSelect: () => this.returnToStageSelectAfterVictory(),
        onReturnToStageSelectAfterProblemSeriesVictory: () =>
          this.returnToStageSelectAfterProblemSeriesVictory(),
        onPrepareSameSeedProblemSeriesFromVictory: () =>
          this.prepareSameSeedProblemSeriesFromVictory(),
        onOpenNewSeedProblemSeriesEntryFromVictory: () =>
          this.openNewSeedProblemSeriesEntryFromVictory(),
        canUsePauseOperationRetry: () => this.canUsePauseOperationRetry(),
        canReturnToStageSelectFromPause: () =>
          this.canReturnToStageSelectFromPause(),
        onReturnToStageSelectFromPause: () =>
          this.returnToStageSelectFromPause(),
        onReturnToStageSelectFromDefeatRetry: () =>
          this.returnToStageSelectFromDefeatRetry(),
        getSimulationSpeed: () => this.getSimulationSpeed(),
        onCycleSimulationSpeed: () => {
          this.cycleSimulationSpeed();
        },
      },
      () => this.resolveBattleParty(),
      () => this.getOperationState()?.source.kind ?? null,
    );
    this.menuHost = createMenuHost({
      gameData,
      levelCurves: this.levelCurves,
      formationHost: this.formationHost,
      getParty: () => this.getFormationPartyForMenuHost(),
      isVerifyMode: () => this.verifyMode,
      onBuildChanged: (partyIndex, build) =>
        this.handleFormationBuildChanged(partyIndex, build),
      getUnlockedClassIds: () => this.save.unlockedClassIds,
      onPartySlotChanged: (slotIndex, member) =>
        this.handleFormationPartySlotChanged(slotIndex, member),
      getPartySlotCombatModule: (slotIndex) =>
        this.getPartySlotCombatModule(slotIndex),
      onPartySlotCombatModuleChanged: (slotIndex, moduleId) =>
        this.setPartySlotCombatModule(slotIndex, moduleId),
      onScreenChange: (screen) => this.setGameScreen(screen),
      resolveFormationCloseScreen: () => this.resolveFormationCloseScreen(),
      getFormationReturnOptions: () => this.getFormationReturnOptions(),
      getFormationAllowedClassIds: () =>
        this.getFormationAllowedClassIdsForCurrentOperation(),
    });
    this.setGameScreen(this.verifyMode ? 'battle' : 'stageSelect');

    this.engine.onEvent((event) => {
      if (event.type === 'waveCleared') {
        this.handleWaveCleared(event.completedWaveIndex);
        return;
      }
      if (event.type !== 'battleEnd') return;
      if (event.result === 'victory') {
        this.handleVictory(event.survivingPartyIndices);
      } else {
        this.handleDefeat();
      }
      this.persistSave();
    });

    if (this.verifyMode && this.loopStageId) {
      this.beginOperation(this.loopStageId, this.resolveOperationStartWaveIndex());
      this.engine.restartBattle();
    }

    window.addEventListener('beforeunload', this.handleBeforeUnload);
    this.autoSaveTimer = setInterval(() => this.persistSave(), AUTO_SAVE_INTERVAL_MS);
  }

  getSaveState(): SaveGameState {
    return this.save;
  }

  /** R6c: 作戦中の readonly view（未開始時は null） */
  getOperationState(): OperationStateReadonlyView | null {
    return this.operationState?.toReadonlyView() ?? null;
  }

  /**
   * R12m 1C: seed から問題系列作戦を正式に開始する。
   * 未完了作戦がある場合は拒否し、既存 OperationState / checkpoint / snapshot は不変。
   * 失敗時は生成した snapshot を破棄して null を返す。
   */
  beginProblemSeriesOperation(
    seed: string,
  ): ProblemSeriesOperationStartSnapshot | null {
    if (this.operationState !== null && !this.operationState.isCompleted) {
      return null;
    }

    const resolved = resolveProblemSeriesFromSeed(
      this.gameData.problemSeriesCatalog,
      seed,
    );
    const snapshot = createProblemSeriesOperationStartSnapshot(resolved);
    this.problemSeriesOperationStartSnapshot = snapshot;

    if (!this.beginOperationFromSource({ kind: 'problemSeries' }, 0)) {
      this.clearProblemSeriesOperationStartSnapshot();
      return null;
    }

    return snapshot;
  }

  /**
   * R12m 1C: seed から問題系列を一度選出し、作戦開始スナップショットをメモリ保持する。
   * OperationState 開始・戦闘開始/再読込・Save 書き込みは行わない。
   * BattleEngine への waves 供給は保持後の provider 参照のみ（再選出・再変換しない）。
   * active 作戦中（未完了 OperationState あり）は再準備不可。
   */
  prepareProblemSeriesOperationStart(
    seed: string,
  ): ProblemSeriesOperationStartSnapshot {
    if (this.operationState !== null && !this.operationState.isCompleted) {
      throw new Error(
        'prepareProblemSeriesOperationStart: cannot re-prepare problem series operation start snapshot while an active operation is in progress',
      );
    }

    const resolved = resolveProblemSeriesFromSeed(
      this.gameData.problemSeriesCatalog,
      seed,
    );
    const snapshot = createProblemSeriesOperationStartSnapshot(resolved);
    this.problemSeriesOperationStartSnapshot = snapshot;
    return snapshot;
  }

  /**
   * R12m 2B1: 準備済み snapshot から問題系列作戦を開始する。
   * prepared snapshot がなければ null。resolver / factory は呼ばない。
   * 失敗時も prepared snapshot は破棄しない。
   */
  beginPreparedProblemSeriesOperation(): ProblemSeriesOperationStartSnapshot | null {
    if (this.operationState !== null && !this.operationState.isCompleted) {
      return null;
    }

    const snapshot = this.problemSeriesOperationStartSnapshot;
    if (snapshot === null) {
      return null;
    }

    if (!this.beginOperationFromSource({ kind: 'problemSeries' }, 0)) {
      return null;
    }

    return snapshot;
  }

  /**
   * R12m 1C: 保持中の問題系列作戦開始スナップショット（未準備時は null）。
   * 再選出・再変換せず、準備時と同一参照を返す。
   */
  getProblemSeriesOperationStartSnapshot(): ProblemSeriesOperationStartSnapshot | null {
    return this.problemSeriesOperationStartSnapshot;
  }

  /**
   * R12m 2H1: 未開始の prepared problem-series snapshot だけを破棄する。
   * active 作戦中（未完了 OperationState あり）は破棄せず false。
   * snapshot がなければ false。Save / screen / BattleEngine は変更しない。
   */
  discardPreparedProblemSeriesSnapshot(): boolean {
    if (this.operationState !== null && !this.operationState.isCompleted) {
      return false;
    }

    if (this.problemSeriesOperationStartSnapshot === null) {
      return false;
    }

    this.clearProblemSeriesOperationStartSnapshot();
    return true;
  }

  /**
   * R12m 1C: active OperationState.source に基づき BattleEngine へ渡す解決済み Wave を返す。
   * - active なし / fixedStage: null（固定 Stage 経路）
   * - problemSeries: 保持 snapshot.waves（欠落時は例外、fallback しない）
   */
  private resolveProblemSeriesWavePrepDisclosureDisplay():
    ProblemSeriesWavePrepDisclosureDisplay | null {
    const operation = this.operationState;
    if (operation === null) {
      return null;
    }

    const source = operation.source;
    if (source.kind === 'fixedStage') {
      return null;
    }

    if (
      operation.isWavePrepEditable !== true ||
      operation.clearedWaveCount <= 0
    ) {
      return null;
    }

    const snapshot = this.problemSeriesOperationStartSnapshot;
    if (snapshot === null) {
      throw new Error(
        'problemSeries WavePrep disclosure requires operation start snapshot',
      );
    }

    const targetWaveIndex = operation.currentWaveIndex + 1;
    const context = createProblemSeriesWavePrepDisclosureContext(
      snapshot,
      targetWaveIndex,
      this.gameData,
    );
    const enemyChanges = createProblemSeriesWavePrepEnemyChanges(context);
    return createProblemSeriesWavePrepDisclosureDisplay(context, enemyChanges);
  }

  private getResolvedWavesCombatInputForActiveOperation(): ResolvedWavesCombatInput | null {
    const operation = this.operationState;
    if (operation === null || !operation.isActive) {
      return null;
    }

    const source = operation.source;
    if (source.kind === 'fixedStage') {
      return null;
    }

    const snapshot = this.problemSeriesOperationStartSnapshot;
    if (snapshot === null) {
      throw new Error(
        'active problemSeries operation requires problemSeriesOperationStartSnapshot but snapshot is missing',
      );
    }

    return snapshot.waves;
  }

  hasActiveOperation(): boolean {
    return this.operationState?.isActive === true;
  }

  getOperationParty(): PartySlotState[] | null {
    return this.operationState?.getPartySnapshot() ?? null;
  }

  getOperationWaveIndex(): number | null {
    return this.operationState?.currentWaveIndex ?? null;
  }

  getClearedWaveCount(): number | null {
    return this.operationState?.clearedWaveCount ?? null;
  }

  /** R6h: 確定済み作戦結果（未確定時は null） */
  getOperationResult(): OperationResult | null {
    return this.operationResult
      ? cloneOperationResult(this.operationResult)
      : null;
  }

  /** R12m 2N3: 問題系列の確定済み最終勝利結果（未確定時は null） */
  getProblemSeriesVictoryResult(): ProblemSeriesVictoryResult | null {
    return this.problemSeriesVictoryResult
      ? cloneProblemSeriesVictoryResult(this.problemSeriesVictoryResult)
      : null;
  }

  /** R12m 2N4: verify OFF の battle 画面で問題系列最終勝利結果 UI を表示するか */
  shouldShowProblemSeriesVictoryResult(): boolean {
    return (
      !this.verifyMode &&
      this.currentScreen === 'battle' &&
      this.problemSeriesVictoryResult?.outcome === 'victory'
    );
  }

  /** R12m 2N4: 問題系列結果 UI 表示用の最小フィールド防御コピー */
  getProblemSeriesVictoryResultForDisplay(): {
    outcome: 'victory';
    seed: string;
    generatorVersion: string;
    seriesId: string;
    reachedWaveIndex: number;
  } | null {
    const result = this.getProblemSeriesVictoryResult();
    if (result === null) {
      return null;
    }
    return {
      outcome: result.outcome,
      seed: result.seed,
      generatorVersion: result.generatorVersion,
      seriesId: result.seriesId,
      reachedWaveIndex: result.reachedWaveIndex,
    };
  }

  /** R6f: 有効な checkpoint が存在するか */
  hasOperationCheckpoint(): boolean {
    return this.operationCheckpoint !== null;
  }

  /** R6f: checkpoint の readonly deep clone（内部状態を外部から書き換え不可） */
  getOperationCheckpoint(): OperationCheckpointSnapshot | null {
    return this.operationCheckpoint
      ? cloneCheckpointSnapshot(this.operationCheckpoint)
      : null;
  }

  /**
   * R6f: 現在の OperationState から checkpoint 候補を生成（未 commit）。
   * 作戦未開始時は null。
   */
  buildOperationCheckpointCandidate(): OperationCheckpointSnapshot | null {
    if (this.operationState === null) return null;
    return createCheckpointFromOperationState(this.operationState);
  }

  /**
   * R6f: 検証済み checkpoint 候補を commit する。
   * 不正候補は破棄せず commit しない（既存 checkpoint も維持）。
   */
  tryCommitOperationCheckpoint(
    candidate: OperationCheckpointSnapshot,
  ): boolean {
    if (this.operationState === null) return false;

    const activeSource = this.operationState.source;
    const waveCount = this.resolveOperationWaveCount(activeSource);
    if (
      !validateCheckpointSnapshot(candidate, this.gameData, {
        expectedSource: activeSource,
        waveCount,
      })
    ) {
      return false;
    }
    this.operationCheckpoint = cloneCheckpointSnapshot(candidate);
    return true;
  }

  /**
   * R6f: checkpoint から OperationState の party / module / Wave 進行を復元。
   * 引数省略時は commit 済み checkpoint を使用。Combatant / 画面は復元しない。
   */
  tryRestoreOperationFromCheckpoint(
    source?: OperationCheckpointSnapshot,
  ): boolean {
    if (this.operationState === null) return false;
    const snapshot = source ?? this.operationCheckpoint;
    if (snapshot === null) return false;

    const waveCount = this.resolveOperationWaveCount(this.operationState.source);
    const result = restoreOperationStateFromCheckpoint(
      this.operationState,
      snapshot,
      this.gameData,
      waveCount,
    );
    return result.ok;
  }

  /** R6f: checkpoint を破棄（OperationState 自体は維持） */
  clearOperationCheckpoint(): void {
    this.operationCheckpoint = null;
  }

  /**
   * R6i: 確定済み checkpoint から現在 Wave を同設定で再戦する。
   * checkpoint 不在・作戦完了時は false（状態不変）。
   */
  retryCurrentWaveFromCheckpoint(): boolean {
    if (!this.canUseOperationRetry()) return false;
    if (!this.hasOperationCheckpoint()) return false;

    const checkpoint = this.operationCheckpoint!;
    if (!this.tryRestoreOperationFromCheckpoint(checkpoint)) return false;

    this.wavePrepSuspended = false;
    this.clearOperationResult();
    this.operationState?.endWavePrepEditing();
    this.suppressOperationWaveReload = true;
    try {
      this.engine.restartBattleAtWave(checkpoint.currentWaveIndex);
    } finally {
      this.suppressOperationWaveReload = false;
    }
    if (this.menuHost.isOpen()) {
      this.menuHost.close();
    }
    this.setGameScreen('battle');
    this.view.setBattlePaused(false);
    return true;
  }

  /**
   * R6i / R7d: 戦闘を開始せず既存の編成導線（formation）へ戻る。
   * Wave 間準備中は編集状態を維持して一時 suspend する。
   * 作戦未開始・完了時は false。
   */
  returnToFormationPrep(): boolean {
    if (!this.canUseOperationRetry()) return false;

    this.clearOperationResult();

    if (this.shouldSuspendWavePrepForFormation()) {
      this.wavePrepSuspended = true;
      this.menuHost.open('party');
      return true;
    }

    this.wavePrepSuspended = false;
    this.operationState?.endWavePrepEditing();
    this.menuHost.open('party');
    this.view.setBattlePaused(false);
    return true;
  }

  /**
   * R6i: 同 source の Wave 0 として OperationState を再初期化する。
   * 作戦未開始・完了時は false。
   */
  restartOperationFromWaveZero(): boolean {
    if (!this.canUseOperationRetry()) return false;

    const source = cloneOperationSource(this.operationState!.source);
    this.wavePrepSuspended = false;
    this.clearOperationResult();
    this.operationState?.endWavePrepEditing();

    if (!this.beginOperationFromSource(source, 0)) return false;
    this.suppressOperationWaveReload = true;
    try {
      this.engine.restartBattleAtWave(0);
    } finally {
      this.suppressOperationWaveReload = false;
    }
    if (this.menuHost.isOpen()) {
      this.menuHost.close();
    }
    this.menuHost.open('party');
    this.view.setBattlePaused(false);
    return true;
  }

  /** R7d: Wave 間準備 screen に retry 3 操作を表示するか */
  shouldShowWavePrepRetry(): boolean {
    return (
      this.currentScreen === 'wavePrep' &&
      this.isAwaitingNextWave() &&
      this.canUseOperationRetry()
    );
  }

  /** R7d: formation から Wave 間準備へ戻る（suspend 中のみ） */
  returnToWavePrepFromFormation(): boolean {
    if (!this.wavePrepSuspended || !this.isAwaitingNextWave()) return false;
    if (!this.menuHost.isOpen()) return false;
    this.menuHost.close();
    return this.currentScreen === 'wavePrep';
  }

  /** R7d: Wave 間準備を suspend して formation にいるか */
  isWavePrepSuspendedForFormation(): boolean {
    return this.wavePrepSuspended;
  }

  /** 敗北後に retry UI を表示するか */
  shouldShowDefeatRetry(): boolean {
    return (
      this.currentScreen === 'battle' &&
      this.operationState !== null &&
      this.operationState.isDefeated &&
      this.canUseOperationRetry()
    );
  }

  /** R7e: verify OFF 最終勝利後に作戦結果 UI を表示するか */
  shouldShowVictoryResult(): boolean {
    return (
      !this.verifyMode &&
      this.currentScreen === 'battle' &&
      this.operationResult?.outcome === 'victory'
    );
  }

  /** R7e: 作戦結果 UI 表示用の最小フィールド */
  getOperationResultForDisplay(): {
    stageId: string;
    outcome: string;
    reachedWaveIndex: number;
  } | null {
    const result = this.operationResult;
    if (result === null) return null;
    return {
      stageId: result.stageId,
      outcome: result.outcome,
      reachedWaveIndex: result.reachedWaveIndex,
    };
  }

  /**
   * R7e: 作戦結果から同一 stage を Wave 0 で再戦する。
   * operationResult をクリアし新 OperationState + checkpoint を作って formation へ遷移する。
   */
  rematchSameStageFromResult(): boolean {
    if (!this.shouldShowVictoryResult()) return false;

    const stageId = this.operationResult!.stageId;
    const savedResult = cloneOperationResult(this.operationResult!);
    this.wavePrepSuspended = false;

    this.save.stageProgress.currentStageId = stageId;
    this.stageDamageStats.resetForStage(stageId);
    if (!this.beginOperation(stageId, 0)) {
      this.operationResult = savedResult;
      return false;
    }
    this.persistSave();
    if (this.menuHost.isOpen()) {
      this.menuHost.close();
    }
    this.menuHost.open('party');
    this.view.setBattlePaused(false);
    this.view.refreshVictoryResultOverlay();
    return true;
  }

  /**
   * 未完了作戦を破棄してステージ選択へ戻る。
   * 確認ダイアログなし。
   */
  private abortIncompleteOperationToStageSelect(): boolean {
    this.clearProblemSeriesOperationStartSnapshot();
    this.wavePrepSuspended = false;
    if (this.menuHost.isOpen()) {
      this.menuHost.close();
    }
    this.view.setBattlePaused(false);
    this.setGameScreen('stageSelect');
    return true;
  }

  /** R12m 1C: 未完了作戦中断時のみ呼ぶ。他経路（再試行・作戦開始等）では呼ばない。 */
  private clearProblemSeriesOperationStartSnapshot(): void {
    this.problemSeriesOperationStartSnapshot = null;
  }

  /** 戦闘ポーズ中に作戦を中断してステージ選択へ戻れるか */
  canReturnToStageSelectFromPause(): boolean {
    if (this.currentScreen !== 'battle') return false;
    if (this.shouldShowDefeatRetry()) return false;
    if (this.shouldShowVictoryResult()) return false;
    return true;
  }

  /** 戦闘ポーズ中にリトライ 3 種を出せるか（敗北 overlay 非表示・作戦進行中） */
  canUsePauseOperationRetry(): boolean {
    if (this.currentScreen !== 'battle') return false;
    if (this.shouldShowDefeatRetry()) return false;
    if (this.shouldShowVictoryResult()) return false;
    return this.canUseOperationRetry();
  }

  /** 戦闘ポーズ中に作戦を中断してステージ選択へ戻る。 */
  returnToStageSelectFromPause(): boolean {
    if (!this.canReturnToStageSelectFromPause()) return false;
    return this.abortIncompleteOperationToStageSelect();
  }

  /** 敗北 retry UI からステージ選択へ戻る。 */
  returnToStageSelectFromDefeatRetry(): boolean {
    if (!this.shouldShowDefeatRetry()) return false;
    return this.abortIncompleteOperationToStageSelect();
  }

  /** Wave 間準備から未完了作戦を破棄してステージ選択へ戻れるか */
  canReturnToStageSelectFromWavePrep(): boolean {
    return (
      this.currentScreen === 'wavePrep' &&
      this.operationState !== null &&
      !this.operationState.isCompleted
    );
  }

  /** Wave 間準備から現ステージを諦めてステージ選択へ戻る。確認ダイアログなし。 */
  returnToStageSelectFromWavePrep(): boolean {
    if (!this.canReturnToStageSelectFromWavePrep()) return false;
    return this.abortIncompleteOperationToStageSelect();
  }

  /**
   * R7e: 作戦結果からステージ選択へ戻る。
   * operationResult を破棄し次の出撃に影響しない状態へ整理する。
   */
  returnToStageSelectAfterVictory(): boolean {
    if (!this.shouldShowVictoryResult()) return false;

    this.wavePrepSuspended = false;
    this.clearOperationResult();
    this.view.setBattlePaused(false);
    this.setGameScreen('stageSelect');
    this.view.refreshVictoryResultOverlay();
    return true;
  }

  /** R12m 2N4: 問題系列結果 UI から作戦選択へ戻る。 */
  returnToStageSelectAfterProblemSeriesVictory(): boolean {
    if (!this.shouldShowProblemSeriesVictoryResult()) return false;

    this.problemSeriesVictoryResult = null;
    this.wavePrepSuspended = false;
    this.view.setBattlePaused(false);
    this.setGameScreen('stageSelect');
    this.view.refreshVictoryResultOverlay();
    return true;
  }

  /**
   * R12m 2O2: 問題系列最終勝利結果の seed から同系列を再準備し、全 3 Wave 概要へ遷移する。
   * 作戦内パッシブ・資源・進行・checkpoint は引き継がない。Save / BattleEngine restart は行わない。
   */
  prepareSameSeedProblemSeriesFromVictory(): boolean {
    if (!this.shouldShowProblemSeriesVictoryResult()) {
      return false;
    }

    const result = this.problemSeriesVictoryResult;
    if (result === null) {
      return false;
    }

    if (this.hasActiveOperation()) {
      return false;
    }

    if (this.operationCheckpoint !== null) {
      return false;
    }

    if (this.problemSeriesOperationStartSnapshot !== null) {
      return false;
    }

    const expectedSeed = result.seed;
    const expectedGeneratorVersion = result.generatorVersion;
    const expectedSeriesId = result.seriesId;

    let preparedSnapshot: ProblemSeriesOperationStartSnapshot;
    try {
      preparedSnapshot = this.prepareProblemSeriesOperationStart(expectedSeed);
    } catch {
      this.clearProblemSeriesOperationStartSnapshot();
      return false;
    }

    if (
      preparedSnapshot.seed !== expectedSeed ||
      preparedSnapshot.generatorVersion !== expectedGeneratorVersion ||
      preparedSnapshot.seriesId !== expectedSeriesId ||
      preparedSnapshot.waves.length !== 3
    ) {
      this.clearProblemSeriesOperationStartSnapshot();
      return false;
    }

    this.setGameScreen('stageSelect');

    if (!this.stageSelectionHost.showPreparedMainOperationOverview()) {
      this.clearProblemSeriesOperationStartSnapshot();
      this.setGameScreen('battle');
      this.view.setBattlePaused(true);
      this.view.refreshVictoryResultOverlay();
      return false;
    }

    this.problemSeriesVictoryResult = null;
    this.wavePrepSuspended = false;
    this.view.setBattlePaused(false);
    this.view.refreshVictoryResultOverlay();
    return true;
  }

  /**
   * R12m 2P2: 問題系列最終勝利結果から新 seed 入力画面へ遷移する。
   * seed 自動生成・resolver / snapshot 生成 / BattleEngine restart は行わない。
   */
  openNewSeedProblemSeriesEntryFromVictory(): boolean {
    if (!this.shouldShowProblemSeriesVictoryResult()) {
      return false;
    }

    const result = this.problemSeriesVictoryResult;
    if (result === null) {
      return false;
    }

    if (this.hasActiveOperation()) {
      return false;
    }

    if (this.operationCheckpoint !== null) {
      return false;
    }

    if (this.problemSeriesOperationStartSnapshot !== null) {
      return false;
    }

    this.setGameScreen('stageSelect');

    if (!this.stageSelectionHost.showMainOperationEntry()) {
      this.setGameScreen('battle');
      this.view.setBattlePaused(true);
      this.view.refreshVictoryResultOverlay();
      return false;
    }

    this.problemSeriesVictoryResult = null;
    this.wavePrepSuspended = false;
    this.view.setBattlePaused(false);
    this.view.refreshVictoryResultOverlay();
    return true;
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

    this.clearOperationResult();
    this.clearOperation();
    this.engine.restartBattle();
    this.persistSave();
    this.view.syncVerifyModeToggle(enabled);
  }

  setBattleXDebugDisplay(enabled: boolean): void {
    if (this.battleXDebugDisplayEnabled === enabled) return;
    this.battleXDebugDisplayEnabled = enabled;
    setBattleXDebugDisplayEnabled(enabled);
    this.view.syncBattleXDebugDisplay();
  }

  start(): void {
    this.engine.startBattle();
  }

  getCurrentScreen(): GameScreen {
    return this.currentScreen;
  }

  /** @deprecated Use getCurrentScreen() === 'formation' */
  isMetaMenuOpen(): boolean {
    return this.currentScreen === 'formation';
  }

  openPartyMenu(): void {
    this.menuHost.open('party');
  }

  openStageSelect(): void {
    this.setGameScreen('stageSelect');
  }

  closeMetaMenu(): void {
    this.menuHost.close();
  }

  private setGameScreen(screen: GameScreen): void {
    if (screen === 'stageSelect') {
      this.clearOperationResult();
    }
    if (screen !== 'formation') {
      this.menuHost.dismiss();
      this.clearProblemSeriesFormationPartyDraft();
    }
    if (this.currentScreen === screen) {
      this.view.refreshVictoryResultOverlay();
      return;
    }
    if (
      screen === 'stageSelect' &&
      this.operationState !== null &&
      !this.operationState.isCompleted
    ) {
      this.clearOperation();
    }
    if (this.currentScreen === 'wavePrep' && screen !== 'wavePrep') {
      if (!this.wavePrepSuspended) {
        this.operationState?.endWavePrepEditing();
      }
      this.wavePrepScreenHost.hide();
    }
    if (screen === 'wavePrep' && this.wavePrepSuspended) {
      this.wavePrepSuspended = false;
      this.operationState?.beginWavePrepEditing();
    }
    this.currentScreen = screen;
    const onBattle = screen === 'battle';
    const onFormation = screen === 'formation';
    const onWavePrep = screen === 'wavePrep';
    const onStageSelect = screen === 'stageSelect';
    this.battleHost.hidden = !onBattle;
    this.formationHost.hidden = !onFormation;
    this.wavePrepHost.hidden = !onWavePrep;
    if (onWavePrep) {
      this.wavePrepScreenHost.show();
    }
    if (onStageSelect) {
      this.stageSelectionHost.show();
    } else {
      this.stageSelectionHost.hide();
    }
    this.view.setVisible(onBattle);
    if (onBattle && !this.shouldShowVictoryResult() && !this.shouldShowDefeatRetry()) {
      this.view.setBattlePaused(false);
    }
    this.view.refreshVictoryResultOverlay();
  }

  /**
   * R12m 2L2: 概要確定から prepared 作戦開始と初期編成準備へ接続する。
   * beginPreparedProblemSeriesOperation の成功時のみ formation を開く。失敗時は画面遷移しない。
   */
  private handleConfirmPreparedProblemSeriesOperation(): void {
    const began = this.beginPreparedProblemSeriesOperation();
    if (began === null) {
      return;
    }

    this.view.setBattlePaused(false);
    this.view.refreshVictoryResultOverlay();
    this.menuHost.open('party');
  }

  private handleStageSortie(stageId: string): void {
    const resolvedStageId = resolveKnownStageId(this.gameData.stages, stageId);
    if (resolvedStageId === null) return;

    this.save.stageProgress.currentStageId = resolvedStageId;
    this.stageDamageStats.resetForStage(resolvedStageId);
    if (!this.beginOperation(resolvedStageId, this.resolveOperationStartWaveIndex())) {
      return;
    }
    this.persistSave();
    this.view.setBattlePaused(false);
    this.view.refreshVictoryResultOverlay();
    this.menuHost.open('party');
  }

  updateMemberBuild(partyIndex: number, build: CharacterBuild): void {
    const member = this.save.party[partyIndex];
    if (!member) return;
    member.build = structuredClone(normalizeActiveSlots(build));
    this.persistSave();
    this.engine.syncPartyBuilds();
  }

  /** R12m 2T5B: Formation 表示 party（problemSeries = mutable draft、それ以外 = Save）。 */
  private getFormationPartyForMenuHost(): PartySlotState[] {
    if (this.isActiveIncompleteProblemSeriesOperation() && this.operationState !== null) {
      if (this.problemSeriesFormationPartyDraft === null) {
        this.problemSeriesFormationPartyDraft =
          this.operationState.getPartySnapshot();
      }
      return this.problemSeriesFormationPartyDraft;
    }
    return this.save.party;
  }

  private clearProblemSeriesFormationPartyDraft(): void {
    this.problemSeriesFormationPartyDraft = null;
  }

  private syncProblemSeriesFormationPartyDraftToOperationState(
    classChangedSlotIndex?: number,
    previousClassId?: ClassId | null,
    nextClassId?: ClassId | null,
  ): boolean {
    const draft = this.problemSeriesFormationPartyDraft;
    if (draft === null || this.operationState === null) {
      return false;
    }

    const allowedClassIds = this.getFormationAllowedClassIdsForCurrentOperation();
    if (allowedClassIds === undefined) {
      return false;
    }

    for (const slot of draft) {
      if (!slot?.classId) {
        continue;
      }
      if (!allowedClassIds.includes(slot.classId)) {
        return false;
      }
      if (!this.gameData.classRegistry[slot.classId]) {
        return false;
      }
    }

    if (!validatePartyClassIds(draft).ok) {
      return false;
    }

    const candidateParty = draft.map((slot) =>
      slot ? structuredClone(slot) : null,
    );
    if (
      !this.operationState.trySyncPartyFromSave(candidateParty, this.gameData).ok
    ) {
      return false;
    }

    if (
      classChangedSlotIndex !== undefined &&
      previousClassId !== nextClassId
    ) {
      this.operationState
        .getCombatModuleSelection()
        .clearSelectedCombatModuleId(classChangedSlotIndex);
    }

    return true;
  }

  /**
   * R12m 2T5B: Formation Class Select 許可兵科。
   * problemSeries 作戦中のみ snapshot.allowedClassIds。欠落時は fallback せず例外。
   */
  private getFormationAllowedClassIdsForCurrentOperation():
    | readonly ClassId[]
    | undefined {
    if (!this.isActiveIncompleteProblemSeriesOperation()) {
      return undefined;
    }

    const snapshot = this.problemSeriesOperationStartSnapshot;
    if (snapshot === null) {
      throw new Error(
        'active problemSeries operation requires problemSeriesOperationStartSnapshot but snapshot is missing',
      );
    }
    return [...snapshot.allowedClassIds];
  }

  private isActiveIncompleteProblemSeriesOperation(): boolean {
    const operation = this.operationState;
    return (
      operation !== null &&
      !operation.isCompleted &&
      operation.source.kind === 'problemSeries'
    );
  }

  private handleFormationPartySlotChanged(
    slotIndex: number,
    member: PartySlotState,
  ): void {
    if (this.isActiveIncompleteProblemSeriesOperation()) {
      this.tryUpdateProblemSeriesFormationPartySlot(slotIndex, member);
      return;
    }
    this.updatePartySlot(slotIndex, member);
  }

  private handleFormationBuildChanged(
    partyIndex: number,
    build: CharacterBuild,
  ): void {
    if (this.isActiveIncompleteProblemSeriesOperation()) {
      this.updateProblemSeriesFormationMemberBuild(partyIndex, build);
      return;
    }
    this.updateMemberBuild(partyIndex, build);
  }

  private tryUpdateProblemSeriesFormationPartySlot(
    slotIndex: number,
    member: PartySlotState,
  ): PartyClassAssignmentResult {
    if (this.operationState === null) {
      return { ok: false };
    }

    const draft = this.getFormationPartyForMenuHost();
    if (slotIndex < 0 || slotIndex >= PARTY_SLOT_COUNT) {
      return { ok: false };
    }

    const previousClassId =
      this.operationState.getPartySnapshot()[slotIndex]?.classId ?? null;
    const nextClassId = member?.classId ?? null;

    if (nextClassId !== null) {
      const allowedClassIds = this.getFormationAllowedClassIdsForCurrentOperation();
      if (allowedClassIds === undefined || !allowedClassIds.includes(nextClassId)) {
        return { ok: false };
      }
      if (!this.gameData.classRegistry[nextClassId]) {
        return { ok: false };
      }
    }

    const validation = validatePartyClassAssignment(draft, slotIndex, nextClassId);
    if (!validation.ok) {
      return validation;
    }

    draft[slotIndex] = member ? structuredClone(member) : null;

    if (
      !this.syncProblemSeriesFormationPartyDraftToOperationState(
        slotIndex,
        previousClassId,
        nextClassId,
      )
    ) {
      return { ok: false };
    }

    return { ok: true };
  }

  private updateProblemSeriesFormationMemberBuild(
    partyIndex: number,
    build: CharacterBuild,
  ): void {
    if (this.operationState === null) {
      return;
    }

    const draft = this.getFormationPartyForMenuHost();
    const member = draft[partyIndex];
    if (!member) {
      return;
    }

    member.build = structuredClone(normalizeActiveSlots(build));

    if (!this.syncProblemSeriesFormationPartyDraftToOperationState()) {
      return;
    }

    this.engine.syncPartyBuilds();
  }

  private validateProblemSeriesFormationParty(): boolean {
    if (this.operationState === null) {
      return false;
    }

    const allowedClassIds = this.getFormationAllowedClassIdsForCurrentOperation();
    if (allowedClassIds === undefined) {
      return false;
    }

    const party = this.operationState.getPartySnapshot();
    if (party.length !== PARTY_SLOT_COUNT) {
      return false;
    }

    const classIds: ClassId[] = [];
    for (const slot of party) {
      if (!slot?.classId) {
        return false;
      }
      if (!allowedClassIds.includes(slot.classId)) {
        return false;
      }
      if (!this.gameData.classRegistry[slot.classId]) {
        return false;
      }
      classIds.push(slot.classId);
    }

    if (new Set(classIds).size !== PARTY_SLOT_COUNT) {
      return false;
    }

    return validatePartyClassIds(party).ok;
  }

  private trySetProblemSeriesFormationCombatModule(
    slotIndex: number,
    moduleId: string,
  ): boolean {
    if (this.operationState === null) {
      return false;
    }

    const member = this.operationState.getPartySnapshot()[slotIndex];
    if (!member?.classId) {
      return false;
    }

    const preset = this.gameData.classRegistry[member.classId];
    if (!preset) {
      return false;
    }

    const resolvedNext = resolveSelectedCombatModuleId(
      preset,
      this.gameData.combatModuleRegistry,
      moduleId,
    );
    if (resolvedNext !== moduleId) {
      return false;
    }

    const selection = this.operationState.getCombatModuleSelection();
    const currentSelected = selection.getSelectedCombatModuleId(slotIndex);
    const resolvedCurrent = resolveSelectedCombatModuleId(
      preset,
      this.gameData.combatModuleRegistry,
      currentSelected,
    );
    if (resolvedCurrent === resolvedNext) {
      return true;
    }

    const defaultId = preset.combatModuleIds?.[0];
    if (defaultId !== undefined && moduleId === defaultId) {
      selection.clearSelectedCombatModuleId(slotIndex);
    } else {
      selection.setSelectedCombatModuleId(slotIndex, moduleId);
    }
    return true;
  }

  /** R5d: party slot の combat module 選択を更新（Save 非統合）。 */
  setPartySlotCombatModule(slotIndex: number, moduleId: string): void {
    if (slotIndex < 0 || slotIndex >= PARTY_SLOT_COUNT) return;
    if (this.isActiveIncompleteProblemSeriesOperation()) {
      if (!this.trySetProblemSeriesFormationCombatModule(slotIndex, moduleId)) {
        return;
      }
    } else {
      this.resolveCombatModuleSelection().setSelectedCombatModuleId(
        slotIndex,
        moduleId,
      );
    }
    this.engine.syncPartyBuilds();
  }

  /** R5d: 現在の選択 module ID（未指定 = undefined → default A）。 */
  getPartySlotCombatModule(slotIndex: number): string | undefined {
    return this.resolveCombatModuleSelection().getSelectedCombatModuleId(
      slotIndex,
    );
  }

  /** R5d: 選択をクリアし default module A へ戻す。 */
  clearPartySlotCombatModule(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= PARTY_SLOT_COUNT) return;
    this.resolveCombatModuleSelection().clearSelectedCombatModuleId(slotIndex);
    this.engine.syncPartyBuilds();
  }

  resetPartySlotCombatModuleToDefault(slotIndex: number): void {
    this.clearPartySlotCombatModule(slotIndex);
  }

  private shouldDeferBattleRestartForFormation(): boolean {
    return this.currentScreen === 'formation';
  }

  private requestBattleReloadAfterPartyEdit(): void {
    if (this.shouldDeferBattleRestartForFormation()) {
      return;
    }
    this.engine.restartBattle();
  }

  tryUpdatePartySlot(
    slotIndex: number,
    member: PartySlotState,
  ): PartyClassAssignmentResult {
    if (slotIndex < 0 || slotIndex >= PARTY_SLOT_COUNT) {
      return { ok: false };
    }

    const classId = member?.classId ?? null;
    const validation = validatePartyClassAssignment(
      this.save.party,
      slotIndex,
      classId,
    );
    if (!validation.ok) {
      return validation;
    }

    const current = this.save.party[slotIndex];
    const currentClassId = current?.classId ?? null;
    const nextClassId = member?.classId ?? null;

    if (currentClassId === nextClassId) {
      if (member) {
        this.save.party[slotIndex] = structuredClone(member);
        this.persistSave();
      } else if (current !== null) {
        this.save.party[slotIndex] = null;
        this.resolveCombatModuleSelection().clearSelectedCombatModuleId(slotIndex);
        this.persistSave();
        this.requestBattleReloadAfterPartyEdit();
      }
      return { ok: true };
    }

    if (nextClassId !== null) {
      this.resolveCombatModuleSelection().clearSelectedCombatModuleId(slotIndex);
    }

    this.save.party[slotIndex] = member ? structuredClone(member) : null;
    this.persistSave();
    this.requestBattleReloadAfterPartyEdit();
    return { ok: true };
  }

  updatePartySlot(slotIndex: number, member: PartySlotState): void {
    this.tryUpdatePartySlot(slotIndex, member);
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
    this.beginOperation(stageId, this.resolveOperationStartWaveIndex());
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
    if (this.operationState !== null) {
      this.operationState.prepareRetry(this.resolveOperationStartWaveIndex());
    }
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

  /** R6e: Wave 間準備 screen が表示中か */
  isWavePrepOpen(): boolean {
    return this.currentScreen === 'wavePrep';
  }

  /** R6e: Wave 間準備中のみ OperationState party を編集可能 */
  canEditOperationFormation(): boolean {
    return (
      this.operationState?.isWavePrepEditable === true &&
      this.currentScreen === 'wavePrep'
    );
  }

  tryUpdateOperationPartySlot(
    slotIndex: number,
    member: PartySlotState,
  ): PartyClassAssignmentResult {
    if (!this.canEditOperationFormation() || this.operationState === null) {
      return { ok: false };
    }

    if (this.isActiveIncompleteProblemSeriesOperation()) {
      const nextClassId = member?.classId ?? null;
      if (nextClassId === null) {
        return { ok: false };
      }
      const allowedClassIds = this.getFormationAllowedClassIdsForCurrentOperation();
      if (allowedClassIds === undefined || !allowedClassIds.includes(nextClassId)) {
        return { ok: false };
      }
      if (!this.gameData.classRegistry[nextClassId]) {
        return { ok: false };
      }
    }

    return this.operationState.tryUpdatePartySlot(
      slotIndex,
      member,
      this.gameData,
    );
  }

  trySetOperationSlotCombatModule(
    slotIndex: number,
    moduleId: string,
  ): boolean {
    if (!this.canEditOperationFormation() || this.operationState === null) {
      return false;
    }
    return this.operationState.trySetCombatModuleForSlot(
      slotIndex,
      moduleId,
      this.gameData,
    );
  }

  /** R8c: 作戦内未使用リソース残高（作戦未開始時は 0）。 */
  getOperationUnspentResource(): number {
    return this.operationState?.getUnspentResource() ?? 0;
  }

  /** R8c: slot ごとの取得済み作戦内パッシブ ID。 */
  getOperationAcquiredPassiveIds(slotIndex: number): readonly string[] {
    return this.operationState?.getAcquiredOperationPassiveIds(slotIndex) ?? [];
  }

  /** R8c: slot の兵科に対する取得候補 passive ID（未取得のみ UI で選択可）。 */
  getOperationPassiveCandidates(slotIndex: number): readonly string[] {
    if (this.operationState === null) return [];
    if (slotIndex < 0 || slotIndex >= PARTY_SLOT_COUNT) return [];

    const member = this.operationState.getPartySnapshot()[slotIndex];
    if (!member?.classId) return [];

    return getOperationPassiveCandidatesForClass(
      this.gameData.operationPassiveCatalog,
      member.classId,
    );
  }

  /** R11c: slot の現在取得数を加味した取得コスト。 */
  resolveOperationPassiveAcquireCostForSlot(
    slotIndex: number,
    passiveId: string,
  ): number {
    const acquiredCount =
      this.operationState?.getAcquiredOperationPassiveIds(slotIndex).length ?? 0;
    return resolveOperationPassiveAcquireCost(
      this.gameData.operationPassiveCatalog,
      passiveId,
      acquiredCount,
    );
  }

  /**
   * R8c: Wave 間準備中に作戦内リソースを消費してパッシブを取得する。
   * 残高不足・重複・不正 slot / passive ID は false（状態不変）。
   */
  tryAcquireOperationPassive(
    slotIndex: number,
    passiveId: string,
  ): boolean {
    if (!this.canEditOperationFormation() || this.operationState === null) {
      return false;
    }
    if (slotIndex < 0 || slotIndex >= PARTY_SLOT_COUNT) return false;
    if (typeof passiveId !== 'string' || passiveId.trim().length === 0) {
      return false;
    }

    const member = this.operationState.getPartySnapshot()[slotIndex];
    if (!member?.classId) return false;

    const classId = member.classId;
    if (
      !isOperationPassiveCandidateForClass(
        this.gameData.operationPassiveCatalog,
        classId,
        passiveId,
      )
    ) {
      return false;
    }
    if (!this.gameData.skillRegistry.passives[passiveId]) return false;

    const acquired = this.operationState.getAcquiredOperationPassiveIds(slotIndex);
    if (acquired.includes(passiveId)) return false;

    const acquireCost = this.resolveOperationPassiveAcquireCostForSlot(
      slotIndex,
      passiveId,
    );
    if (this.operationState.getUnspentResource() < acquireCost) {
      return false;
    }

    if (!this.operationState.trySpendUnspentResource(acquireCost)) {
      return false;
    }
    if (
      !this.operationState.tryAddAcquiredOperationPassiveId(slotIndex, passiveId)
    ) {
      this.operationState.tryAddUnspentResource(acquireCost);
      return false;
    }
    return true;
  }

  /** R6e: Wave 間準備を確定し次 Wave を開始する */
  confirmWavePrepAndStartNextWave(): boolean {
    if (this.currentScreen !== 'wavePrep') return false;
    if (!this.canEditOperationFormation()) return false;
    if (
      this.operationState !== null &&
      this.operationState.currentWaveIndex === 0 &&
      this.operationState.clearedWaveCount === 0 &&
      !this.isAwaitingNextWave()
    ) {
      this.operationState.endWavePrepEditing();
      this.commitCheckpointFromCurrentOperationState();
      this.suppressOperationWaveReload = true;
      try {
        this.engine.restartBattleAtWave(0);
      } finally {
        this.suppressOperationWaveReload = false;
      }
      this.setGameScreen('battle');
      return true;
    }
    return this.startNextWave();
  }

  /** R6b: 中間 Wave 終了待機中のみ次 Wave を開始（Save / 進行は変更しない） */
  startNextWave(): boolean {
    if (this.operationState === null) return false;

    const started = this.engine.startNextWave();
    if (started) {
      this.operationState.syncCurrentWaveIndex(
        this.engine.getSnapshot().waveIndex,
      );
      this.operationState.endWavePrepEditing();
      this.commitCheckpointFromCurrentOperationState();
      if (this.currentScreen === 'wavePrep') {
        this.setGameScreen('battle');
      }
    }
    return started;
  }

  isAwaitingNextWave(): boolean {
    return this.engine.getSnapshot().awaitingNextWave;
  }

  /** R7b: 現在の simulation 倍率（1 / 2 / 4） */
  getSimulationSpeed(): SimulationSpeed {
    return this.simulationSpeed;
  }

  /** R7b: simulation 倍率を変更する。許可値以外は false（状態不変）。 */
  trySetSimulationSpeed(speed: number): speed is SimulationSpeed {
    if (!isSimulationSpeed(speed)) return false;
    this.simulationSpeed = speed;
    return true;
  }

  /** R7b: 1 → 2 → 4 → 1 の順で simulation 倍率を切り替える。 */
  cycleSimulationSpeed(): SimulationSpeed {
    const next: SimulationSpeed =
      this.simulationSpeed === 1 ? 2 : this.simulationSpeed === 2 ? 4 : 1;
    this.simulationSpeed = next;
    return next;
  }

  tick(deltaSec: number, deltaMs: number): void {
    const simulationPaused =
      this.view.isBattlePaused() ||
      (this.verifyMode && this.view.isBattleXDebugReplayPaused());
    if (this.currentScreen === 'battle' && !simulationPaused) {
      this.engine.tick(deltaSec * this.simulationSpeed);
    }
    this.view.tick(deltaMs);
  }

  destroy(): void {
    this.closeMetaMenu();
    this.wavePrepScreenHost.destroy();
    this.stageSelectionHost.destroy();
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
    if (!validatePartyClassIds(save.party).ok) {
      const defaultSave = createDefaultSave(this.gameData, partyId);
      save.party = defaultSave.party;
    }
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

    if (this.operationState !== null) {
      const fixedStageId = tryGetFixedStageIdFromSource(this.operationState.source);
      if (fixedStageId !== null) {
        this.tryFinalizeOperationResult({
          stageId: fixedStageId,
          outcome: 'defeat',
          reachedWaveIndex: this.operationState.currentWaveIndex,
        });
      }
      this.operationState.markDefeated();
    }

    if (this.verifyMode && this.loopStageId) {
      console.log(`[progress] Defeat at ${failedStageName} (loop locked)`);
    } else if (this.verifyMode) {
      const previousStageId = applyStageRollbackOnDefeat(
        this.save,
        this.gameData.stages,
      );
      const previousStage = getStageById(this.gameData.stages, previousStageId);
      const previousStageName = previousStage?.displayName ?? previousStageId;

      if (previousStageId === failedStageId) {
        console.log(`[progress] Defeat at ${failedStageName} (staying)`);
      } else {
        this.stageDamageStats.resetForStage(previousStageId);
        console.log(
          `[progress] Defeat at ${failedStageName} → ${previousStageName}`,
        );
      }
    } else {
      console.log(`[progress] Defeat at ${failedStageName} (retry)`);
    }

    this.view.setBattlePaused(true);
  }

  private handleVictory(survivingPartyIndices: number[]): void {
    const activeSource = this.operationState?.source ?? null;

    if (activeSource?.kind === 'problemSeries') {
      const snapshot = this.problemSeriesOperationStartSnapshot;
      if (snapshot === null) {
        throw new Error(
          'problemSeries victory requires operation start snapshot, but snapshot is 欠落',
        );
      }

      const victoryResult = createProblemSeriesVictoryResult(snapshot);
      const waveCount = snapshot.waves.length;
      const finalWaveIndex = Math.max(0, waveCount - 1);

      if (this.operationState !== null) {
        this.operationState.markCompleted(finalWaveIndex, waveCount);
        this.clearOperation();
      }

      this.clearProblemSeriesOperationStartSnapshot();
      this.problemSeriesVictoryResult = victoryResult;
      this.view.setBattlePaused(true);
      this.view.refreshVictoryResultOverlay();
      return;
    }

    const clearedStageId = this.save.stageProgress.currentStageId;
    const stage = getStageById(this.gameData.stages, clearedStageId);
    const stageName = stage?.displayName ?? clearedStageId;
    const waveCount = stage?.waves.length ?? 1;
    const finalWaveIndex = Math.max(0, waveCount - 1);

    if (this.operationState !== null) {
      const fixedStageId = tryGetFixedStageIdFromSource(this.operationState.source);
      if (fixedStageId !== null) {
        this.tryFinalizeOperationResult({
          stageId: fixedStageId,
          outcome: 'victory',
          reachedWaveIndex: finalWaveIndex,
        });
      }
      this.operationState.markCompleted(finalWaveIndex, waveCount);
      this.clearOperation();
    }

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
      { advanceCurrentStage: this.verifyMode },
    );

    const loopStageId = this.verifyMode ? this.loopStageId : null;
    let nextStageId = result.nextStageId;
    if (this.verifyMode) {
      nextStageId = resolveVictoryNextStageId(
        this.gameData.stages,
        clearedStageId,
        loopStageId,
      );
      if (nextStageId !== result.nextStageId) {
        this.save.stageProgress.currentStageId = nextStageId;
      }
    }

    this.stageDamageStats.resetForStage(
      this.save.stageProgress.currentStageId,
    );

    for (const levelUp of result.levelUps) {
      console.log(`[progress] ${formatLevelUpLog(levelUp)}`);
    }

    const nextStage = getStageById(this.gameData.stages, nextStageId);
    const nextStageName = nextStage?.displayName ?? nextStageId;
    const progressLog = !this.verifyMode
      ? `[progress] Stage clear: ${stageName}`
      : loopStageId
        ? `[progress] Stage clear: ${stageName} (loop: ${nextStageName})`
        : nextStageId === clearedStageId
          ? `[progress] Stage clear: ${stageName} (loop)`
          : `[progress] Stage clear: ${stageName} → ${nextStageName}`;
    console.log(progressLog);

    if (!this.verifyMode) {
      this.view.setBattlePaused(true);
      this.view.refreshVictoryResultOverlay();
      return;
    }
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

  private clearOperation(): void {
    this.wavePrepSuspended = false;
    this.operationState?.endWavePrepEditing();
    this.operationState = null;
    this.clearOperationCheckpoint();
  }

  private clearOperationResult(): void {
    this.operationResult = null;
    this.view?.refreshVictoryResultOverlay();
  }

  /** 作戦進行中（未完了）なら retry API が利用可能（敗北・Wave 準備・ポーズ） */
  private canUseOperationRetry(): boolean {
    return (
      this.operationState !== null &&
      !this.operationState.isCompleted
    );
  }

  /** R7d: Wave 間準備中の「準備へ戻る」は formation へ suspend 遷移 */
  private shouldSuspendWavePrepForFormation(): boolean {
    return (
      this.currentScreen === 'wavePrep' &&
      this.isAwaitingNextWave() &&
      this.operationState !== null &&
      this.operationState.isWavePrepEditable
    );
  }

  /** R7d: formation 閉じた後の遷移先 */
  private resolveFormationCloseScreen(): GameScreen {
    if (this.wavePrepSuspended && this.isAwaitingNextWave()) {
      return 'wavePrep';
    }
    if (this.operationState?.isDefeated) {
      this.resumeBattleAfterDefeatFormationPrep();
    } else {
      this.applyFormationPartyEditsBeforeBattle();
    }
    this.wavePrepSuspended = false;
    if (this.tryOpenInitialWavePrepScreen()) {
      return 'wavePrep';
    }
    return 'battle';
  }

  /**
   * formation 確定時に Save 側の編成を OperationState / 戦闘へ反映する。
   * 出撃直後は beginOperation が編成確定前の snapshot を持つため、戦闘へ戻る直前に同期する。
   */
  private applyFormationPartyEditsBeforeBattle(): void {
    if (this.operationState === null || this.operationState.isCompleted) {
      return;
    }

    if (this.isActiveIncompleteProblemSeriesOperation()) {
      if (!this.validateProblemSeriesFormationParty()) {
        return;
      }

      this.commitCheckpointFromCurrentOperationState();

      const waveIndex = this.operationState.currentWaveIndex;
      this.suppressOperationWaveReload = true;
      try {
        this.engine.restartBattleAtWave(waveIndex);
      } finally {
        this.suppressOperationWaveReload = false;
      }
      return;
    }

    if (!this.operationState.trySyncPartyFromSave(this.save.party, this.gameData).ok) {
      return;
    }

    this.commitCheckpointFromCurrentOperationState();

    const waveIndex = this.operationState.currentWaveIndex;
    this.suppressOperationWaveReload = true;
    try {
      this.engine.restartBattleAtWave(waveIndex);
    } finally {
      this.suppressOperationWaveReload = false;
    }
  }

  /**
   * 敗北後 formation から戦闘へ戻る際に現 Wave を再開する。
   * formation 中の Save party 編集を OperationState へ反映する。
   */
  private resumeBattleAfterDefeatFormationPrep(): void {
    if (this.operationState === null || !this.operationState.isDefeated) return;

    const waveIndex = this.operationState.currentWaveIndex;
    if (!this.isActiveIncompleteProblemSeriesOperation()) {
      if (!this.operationState.trySyncPartyFromSave(this.save.party, this.gameData).ok) {
        return;
      }
    }

    this.operationState.resumeAfterDefeatFormationPrep();
    this.clearOperationResult();
    this.commitCheckpointFromCurrentOperationState();

    this.suppressOperationWaveReload = true;
    try {
      this.engine.restartBattleAtWave(waveIndex);
    } finally {
      this.suppressOperationWaveReload = false;
    }
    this.view.setBattlePaused(false);
  }

  /** R7d: formation フッター戻りボタン（suspend 中は Wave 準備へ） */
  private getFormationReturnOptions():
    | { label: string; canReturn: () => boolean }
    | undefined {
    if (!this.wavePrepSuspended || !this.isAwaitingNextWave()) {
      return undefined;
    }
    return {
      label: 'Wave準備へ戻る',
      canReturn: () => true,
    };
  }

  /** 既に確定済みなら no-op（同一 battleEnd 通知の二重確定防止）。 */
  private tryFinalizeOperationResult(params: FinalizeOperationResultParams): void {
    if (this.operationResult !== null) {
      return;
    }
    this.operationResult = {
      stageId: params.stageId,
      outcome: params.outcome,
      reachedWaveIndex: params.reachedWaveIndex,
    };
  }

  /** R6e: 中間 Wave クリア後に Wave 間準備 screen を開く */
  private openWavePrepScreen(): void {
    if (this.operationState === null || !this.isAwaitingNextWave()) return;
    const targetWaveIndex = this.operationState.clearedWaveCount;
    this.operationState.tryGrantWavePrepResource(
      this.resolveWavePrepResourceGrantForActiveOperation(targetWaveIndex),
      targetWaveIndex,
    );
    this.operationState.beginWavePrepEditing();
    this.setGameScreen('wavePrep');
  }

  private tryOpenInitialWavePrepScreen(): boolean {
    if (this.operationState === null) return false;
    if (
      this.operationState.currentWaveIndex !== 0 ||
      this.operationState.clearedWaveCount !== 0
    ) {
      return false;
    }
    const grant = this.resolveWavePrepResourceGrantForActiveOperation(0);
    if (grant <= 0) return false;
    this.operationState.tryGrantWavePrepResource(grant, 0);
    this.operationState.beginWavePrepEditing();
    this.commitCheckpointFromCurrentOperationState();
    return true;
  }

  private resolveWavePrepResourceGrantForActiveOperation(
    waveIndex: number,
  ): number {
    if (this.operationState === null) {
      return 0;
    }

    const source = this.operationState.source;
    if (source.kind === 'fixedStage') {
      return this.resolveWavePrepResourceGrant(source.stageId, waveIndex);
    }

    const snapshot = this.problemSeriesOperationStartSnapshot;
    if (snapshot === null) {
      throw new Error(
        'problemSeries source requires operation start snapshot, but snapshot is missing',
      );
    }
    const waveCount = snapshot.waves.length;
    if (waveIndex < 0 || waveIndex >= waveCount) {
      throw new Error(
        `problem series operation start snapshot has no wave at index ${waveIndex} (waveCount=${waveCount})`,
      );
    }
    return snapshot.waves[waveIndex]!.prepResourceGrant;
  }

  private resolveWavePrepResourceGrant(
    stageId: string,
    waveIndex: number,
  ): number {
    const stage = getStageById(this.gameData.stages, stageId);
    const configured = stage?.waves[waveIndex]?.prepResourceGrant;
    if (configured !== undefined) return configured;
    if (waveIndex === 0) return 0;
    return this.gameData.operationPassiveCatalog.waveClearResourceGrant;
  }

  /**
   * R12m 1C: 作戦 Wave 数の供給境界。
   * source.kind を正本として解決する。
   * - fixedStage: StageDef.waves.length（未知 stageId は 0）
   * - problemSeries: 保持 snapshot.waves.length（欠落時は明示例外）
   */
  private resolveOperationWaveCount(source: OperationSource): number {
    if (source.kind === 'fixedStage') {
      const stage = getStageById(this.gameData.stages, source.stageId);
      return stage?.waves.length ?? 0;
    }
    const snapshot = this.problemSeriesOperationStartSnapshot;
    if (snapshot === null) {
      throw new Error(
        'problemSeries source requires operation start snapshot, but snapshot is missing',
      );
    }
    return snapshot.waves.length;
  }

  /** R6f: 現在 OperationState から checkpoint を生成して commit */
  private commitCheckpointFromCurrentOperationState(): boolean {
    if (this.operationState === null) return false;
    const candidate = createCheckpointFromOperationState(this.operationState);
    return this.tryCommitOperationCheckpoint(candidate);
  }

  /** R6f: 出撃確定時に OperationState 初期化 + checkpoint commit */
  private beginOperation(stageId: string, initialWaveIndex = 0): boolean {
    return this.beginOperationFromSource(
      { kind: 'fixedStage', stageId },
      initialWaveIndex,
    );
  }

  private beginOperationFromSource(
    source: OperationSource,
    initialWaveIndex = 0,
  ): boolean {
    this.clearOperationResult();
    this.clearOperationCheckpoint();
    const clonedSource = cloneOperationSource(source);

    let party: PartySlotState[];
    let moduleSelection: PartyCombatModuleSelection;

    if (clonedSource.kind === 'problemSeries') {
      const snapshot = this.problemSeriesOperationStartSnapshot;
      if (snapshot === null) {
        console.warn(
          '[operation] problemSeries requires operation start snapshot; operation not started',
        );
        this.clearOperation();
        return false;
      }
      party = createProblemSeriesInitialParty(
        snapshot.allowedClassIds,
        this.gameData,
      );
      moduleSelection = new PartyCombatModuleSelection();
    } else {
      party = this.save.party;
      moduleSelection = this.preOperationModuleSelection;
    }

    const next = OperationState.begin({
      source: clonedSource,
      party,
      moduleSelection,
      initialWaveIndex,
    });
    if (next === null) {
      console.warn('[operation] Invalid party snapshot; operation not started');
      this.clearOperation();
      return false;
    }
    this.operationState = next;
    const candidate = createCheckpointFromOperationState(next);
    const waveCount = this.resolveOperationWaveCount(clonedSource);
    if (
      !validateCheckpointSnapshot(candidate, this.gameData, {
        expectedSource: clonedSource,
        waveCount,
      })
    ) {
      console.warn('[operation] Invalid checkpoint candidate; operation not started');
      this.clearOperation();
      return false;
    }
    this.operationCheckpoint = cloneCheckpointSnapshot(candidate);
    return true;
  }

  private resolveOperationStartWaveIndex(): number {
    if (!this.verifyMode) return 0;
    const loopWave = this.loopWaveIndex;
    if (loopWave === null) return 0;
    const stage = getStageById(this.gameData.stages, this.save.stageProgress.currentStageId);
    const waveCount = stage?.waves.length ?? 0;
    if (loopWave < 0 || loopWave >= waveCount) return 0;
    return loopWave;
  }

  /**
   * 作戦中の Combatant 生成元は OperationState snapshot。
   * 作戦開始前だけ Save party を参照する。
   */
  private resolveBattleParty(): PartySlotState[] {
    return this.operationState?.getPartySnapshot() ?? this.save.party;
  }

  /**
   * module 選択の正本:
   * - 作戦未完了中（active / defeated retry 待ち）: OperationState 内
   * - それ以外（編成画面・作戦前）: preOperationModuleSelection
   */
  private resolveCombatModuleSelection(): PartyCombatModuleSelection {
    if (
      this.operationState !== null &&
      !this.operationState.isCompleted
    ) {
      return this.operationState.getCombatModuleSelection();
    }
    return this.preOperationModuleSelection;
  }

  private handleWaveCleared(completedWaveIndex: number): void {
    this.operationState?.recordWaveCleared(completedWaveIndex);
    this.openWavePrepScreen();
  }

  private handleBattlefieldReload(): void {
    this.view?.refreshVictoryResultOverlay();
    if (this.suppressOperationWaveReload) return;
    if (this.operationState === null || this.operationState.isCompleted) return;
    const startWave = this.resolveOperationStartWaveIndex();
    if (this.operationState.isDefeated) {
      this.operationState.resetWaveProgress(startWave);
      return;
    }
    this.operationState.prepareRetry(startWave);
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
