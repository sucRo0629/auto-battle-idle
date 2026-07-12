import { BattleEngine } from '../battle/BattleEngine.ts';
import { PartyCombatModuleSelection } from '../battle/partyCombatModuleSelection.ts';
import { StageDamageStatsTracker } from '../battle/stageDamageStats.ts';
import type {
  CharacterBuild,
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
import type { GameScreen } from './gameScreen.ts';
import { OperationState, type OperationStateReadonlyView } from './OperationState.ts';
import {
  cloneCheckpointSnapshot,
  createCheckpointFromOperationState,
  restoreOperationStateFromCheckpoint,
  validateCheckpointSnapshot,
  type OperationCheckpointSnapshot,
} from './OperationCheckpoint.ts';
import { StageSelectionScreenHost } from './StageSelectionScreenHost.ts';
import { WavePrepScreenHost } from './WavePrepScreenHost.ts';
import '../styles/game-shell.css';
import levelCurvesJson from '../../data/levelCurves.json';

const AUTO_SAVE_INTERVAL_MS = 60_000;

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
      },
      !this.verifyMode,
    );

    this.wavePrepScreenHost = new WavePrepScreenHost(
      this.wavePrepHost,
      gameData,
      {
        getOperationView: () => this.getOperationState(),
        getUnlockedClassIds: () => this.save.unlockedClassIds,
        getSelectedModuleId: (slotIndex) =>
          this.resolveCombatModuleSelection().getSelectedCombatModuleId(
            slotIndex,
          ),
        onPartySlotChanged: (slotIndex, member) =>
          this.tryUpdateOperationPartySlot(slotIndex, member),
        onModuleChanged: (slotIndex, moduleId) =>
          this.trySetOperationSlotCombatModule(slotIndex, moduleId),
        onConfirmNextWave: () => this.confirmWavePrepAndStartNextWave(),
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
        onBattlefieldReload: () => this.handleBattlefieldReload(),
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
      },
    );
    this.setGameScreen(this.verifyMode ? 'battle' : 'stageSelect');

    this.menuHost = createMenuHost({
      gameData,
      levelCurves: this.levelCurves,
      formationHost: this.formationHost,
      getParty: () => this.save.party,
      isVerifyMode: () => this.verifyMode,
      onBuildChanged: (partyIndex, build) => this.updateMemberBuild(partyIndex, build),
      getUnlockedClassIds: () => this.save.unlockedClassIds,
      onPartySlotChanged: (slotIndex, member) =>
        this.updatePartySlot(slotIndex, member),
      onScreenChange: (screen) => this.setGameScreen(screen),
    });

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
    const waveCount = this.resolveOperationStageWaveCount(candidate.stageId);
    if (
      !validateCheckpointSnapshot(candidate, this.gameData, {
        expectedStageId: candidate.stageId,
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

    const waveCount = this.resolveOperationStageWaveCount(snapshot.stageId);
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
    if (this.currentScreen === screen) return;
    if (
      screen === 'stageSelect' &&
      this.operationState !== null &&
      !this.operationState.isCompleted
    ) {
      this.clearOperation();
    }
    if (this.currentScreen === 'wavePrep' && screen !== 'wavePrep') {
      this.operationState?.endWavePrepEditing();
      this.wavePrepScreenHost.hide();
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
  }

  private handleStageSortie(stageId: string): void {
    const resolvedStageId = resolveKnownStageId(this.gameData.stages, stageId);
    if (resolvedStageId === null) return;

    this.save.stageProgress.currentStageId = resolvedStageId;
    this.stageDamageStats.resetForStage(resolvedStageId);
    this.beginOperation(resolvedStageId, this.resolveOperationStartWaveIndex());
    this.engine.restartBattle();
    this.persistSave();
    this.menuHost.open('party');
  }

  updateMemberBuild(partyIndex: number, build: CharacterBuild): void {
    const member = this.save.party[partyIndex];
    if (!member) return;
    member.build = structuredClone(normalizeActiveSlots(build));
    this.persistSave();
    this.engine.syncPartyBuilds();
  }

  /** R5d: party slot の combat module 選択を更新（Save 非統合）。 */
  setPartySlotCombatModule(slotIndex: number, moduleId: string): void {
    if (slotIndex < 0 || slotIndex >= PARTY_SLOT_COUNT) return;
    this.resolveCombatModuleSelection().setSelectedCombatModuleId(
      slotIndex,
      moduleId,
    );
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
        this.engine.restartBattle();
      }
      return { ok: true };
    }

    if (nextClassId !== null) {
      this.resolveCombatModuleSelection().clearSelectedCombatModuleId(slotIndex);
    }

    this.save.party[slotIndex] = member ? structuredClone(member) : null;
    this.persistSave();
    this.engine.restartBattle();
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
      this.isAwaitingNextWave()
    );
  }

  tryUpdateOperationPartySlot(
    slotIndex: number,
    member: PartySlotState,
  ): PartyClassAssignmentResult {
    if (!this.canEditOperationFormation() || this.operationState === null) {
      return { ok: false };
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

  /** R6e: Wave 間準備を確定し次 Wave を開始する */
  confirmWavePrepAndStartNextWave(): boolean {
    if (this.currentScreen !== 'wavePrep') return false;
    if (!this.canEditOperationFormation()) return false;
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

  tick(deltaSec: number, deltaMs: number): void {
    const simulationPaused =
      this.view.isBattlePaused() ||
      (this.verifyMode && this.view.isBattleXDebugReplayPaused());
    if (this.currentScreen === 'battle' && !simulationPaused) {
      this.engine.tick(deltaSec);
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
      this.operationState.markDefeated();
    }

    if (this.verifyMode && this.loopStageId) {
      console.log(`[progress] Defeat at ${failedStageName} (loop locked)`);
      return;
    }

    if (this.verifyMode) {
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
      return;
    }

    console.log(`[progress] Defeat at ${failedStageName} (retry)`);
    this.engine.restartBattle();
    this.menuHost.open('party');
  }

  private handleVictory(survivingPartyIndices: number[]): void {
    const clearedStageId = this.save.stageProgress.currentStageId;
    const stage = getStageById(this.gameData.stages, clearedStageId);
    const stageName = stage?.displayName ?? clearedStageId;
    const waveCount = stage?.waves.length ?? 1;
    const finalWaveIndex = Math.max(0, waveCount - 1);

    if (this.operationState !== null) {
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
      this.setGameScreen('stageSelect');
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
    this.operationState?.endWavePrepEditing();
    this.operationState = null;
    this.clearOperationCheckpoint();
  }

  /** R6e: 中間 Wave クリア後に Wave 間準備 screen を開く */
  private openWavePrepScreen(): void {
    if (this.operationState === null || !this.isAwaitingNextWave()) return;
    this.operationState.beginWavePrepEditing();
    this.setGameScreen('wavePrep');
  }

  private resolveOperationStageWaveCount(stageId: string): number {
    const stage = getStageById(this.gameData.stages, stageId);
    return stage?.waves.length ?? 0;
  }

  /** R6f: 現在 OperationState から checkpoint を生成して commit */
  private commitCheckpointFromCurrentOperationState(): boolean {
    if (this.operationState === null) return false;
    const candidate = createCheckpointFromOperationState(this.operationState);
    return this.tryCommitOperationCheckpoint(candidate);
  }

  /** R6f: 出撃確定時に OperationState 初期化 + checkpoint commit */
  private beginOperation(stageId: string, initialWaveIndex = 0): boolean {
    this.clearOperationCheckpoint();
    const next = OperationState.begin({
      stageId,
      party: this.save.party,
      moduleSelection: this.preOperationModuleSelection,
      initialWaveIndex,
    });
    if (next === null) {
      console.warn('[operation] Invalid party snapshot; operation not started');
      this.clearOperation();
      return false;
    }
    this.operationState = next;
    const candidate = createCheckpointFromOperationState(next);
    const waveCount = this.resolveOperationStageWaveCount(stageId);
    if (
      !validateCheckpointSnapshot(candidate, this.gameData, {
        expectedStageId: stageId,
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
