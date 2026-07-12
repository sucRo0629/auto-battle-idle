import { resolveSelectedCombatModuleId } from '../battle/data/resolveCombatModuleBasic.ts';
import { PartyCombatModuleSelection } from '../battle/partyCombatModuleSelection.ts';
import type { GameData, PartySlotState } from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import {
  createMemberFromClass,
  normalizePartyClassId,
  normalizePartySlots,
  validatePartyClassAssignment,
  validatePartyClassIds,
  type PartyClassAssignmentResult,
} from '../progression/partyCompose.ts';

export interface OperationStateReadonlyView {
  readonly stageId: string;
  readonly party: readonly PartySlotState[];
  readonly currentWaveIndex: number;
  readonly clearedWaveCount: number;
  readonly isActive: boolean;
  readonly isCompleted: boolean;
  readonly isDefeated: boolean;
  readonly isWavePrepEditable: boolean;
}

export interface BeginOperationParams {
  stageId: string;
  party: PartySlotState[];
  moduleSelection: PartyCombatModuleSelection;
  initialWaveIndex?: number;
}

/**
 * R6c: 複数 Wave をまたぐ作戦単位のメモリ専用状態（Save 非統合）。
 * 所有者: GameSession。
 */
export class OperationState {
  readonly stageId: string;
  private readonly partySlots: PartySlotState[];
  private readonly combatModuleSelection: PartyCombatModuleSelection;
  private currentWaveIndexValue: number;
  private clearedWaveCountValue = 0;
  private isActiveValue: boolean;
  private isCompletedValue = false;
  private isDefeatedValue = false;
  private wavePrepEditable = false;

  private constructor(
    stageId: string,
    party: PartySlotState[],
    moduleSelection: PartyCombatModuleSelection,
    initialWaveIndex: number,
    isActive: boolean,
  ) {
    this.stageId = stageId;
    this.partySlots = party;
    this.combatModuleSelection = moduleSelection;
    this.currentWaveIndexValue = initialWaveIndex;
    this.isActiveValue = isActive;
  }

  static begin(params: BeginOperationParams): OperationState | null {
    const party = normalizePartySlots(
      params.party.map((slot) => (slot ? structuredClone(slot) : null)),
    );
    if (!validatePartyClassIds(party).ok) {
      return null;
    }

    return new OperationState(
      params.stageId,
      party,
      params.moduleSelection.clone(),
      params.initialWaveIndex ?? 0,
      true,
    );
  }

  get currentWaveIndex(): number {
    return this.currentWaveIndexValue;
  }

  get clearedWaveCount(): number {
    return this.clearedWaveCountValue;
  }

  get isActive(): boolean {
    return this.isActiveValue;
  }

  get isCompleted(): boolean {
    return this.isCompletedValue;
  }

  get isDefeated(): boolean {
    return this.isDefeatedValue;
  }

  get isWavePrepEditable(): boolean {
    return this.wavePrepEditable;
  }

  getCombatModuleSelection(): PartyCombatModuleSelection {
    return this.combatModuleSelection;
  }

  getPartySnapshot(): PartySlotState[] {
    return this.partySlots.map((slot) => (slot ? structuredClone(slot) : null));
  }

  toReadonlyView(): OperationStateReadonlyView {
    return {
      stageId: this.stageId,
      party: this.getPartySnapshot(),
      currentWaveIndex: this.currentWaveIndexValue,
      clearedWaveCount: this.clearedWaveCountValue,
      isActive: this.isActiveValue,
      isCompleted: this.isCompletedValue,
      isDefeated: this.isDefeatedValue,
      isWavePrepEditable: this.wavePrepEditable,
    };
  }

  /** R6e: Wave 間準備 screen 表示中のみ編集可（GameSession が awaitingNextWave を確認してから呼ぶ）。 */
  beginWavePrepEditing(): void {
    if (!this.isActiveValue || this.isCompletedValue || this.isDefeatedValue) {
      return;
    }
    this.wavePrepEditable = true;
  }

  endWavePrepEditing(): void {
    this.wavePrepEditable = false;
  }

  /**
   * R6e: Wave 間準備中のみ party slot を更新する。
   * Save 非統合。Combatant runtime へは即時反映しない。
   */
  tryUpdatePartySlot(
    slotIndex: number,
    member: PartySlotState,
    gameData: GameData,
  ): PartyClassAssignmentResult {
    if (!this.wavePrepEditable) {
      return { ok: false };
    }
    if (slotIndex < 0 || slotIndex >= PARTY_SLOT_COUNT) {
      return { ok: false };
    }
    if (!member?.classId) {
      return { ok: false };
    }

    const classId = normalizePartyClassId(member.classId);
    if (!gameData.classRegistry[classId]) {
      return { ok: false };
    }

    const validation = validatePartyClassAssignment(
      this.partySlots,
      slotIndex,
      classId,
    );
    if (!validation.ok) {
      return validation;
    }

    const current = this.partySlots[slotIndex];
    const currentClassId = current
      ? normalizePartyClassId(current.classId)
      : null;

    if (currentClassId === classId) {
      this.partySlots[slotIndex] = structuredClone(member);
      return { ok: true };
    }

    this.combatModuleSelection.clearSelectedCombatModuleId(slotIndex);
    this.partySlots[slotIndex] = createMemberFromClass(classId, gameData);
    return { ok: true };
  }

  /**
   * R6e: Wave 間準備中のみ slot の combat module を更新する。
   * 同一 module の再設定は no-op（runtime 再生成を誘発しない）。
   */
  trySetCombatModuleForSlot(
    slotIndex: number,
    moduleId: string,
    gameData: GameData,
  ): boolean {
    if (!this.wavePrepEditable) {
      return false;
    }
    if (slotIndex < 0 || slotIndex >= PARTY_SLOT_COUNT) {
      return false;
    }

    const member = this.partySlots[slotIndex];
    if (!member) {
      return false;
    }

    const preset = gameData.classRegistry[member.classId];
    if (!preset) {
      return false;
    }

    const resolvedNext = resolveSelectedCombatModuleId(
      preset,
      gameData.combatModuleRegistry,
      moduleId,
    );
    if (resolvedNext !== moduleId) {
      return false;
    }

    const currentSelected =
      this.combatModuleSelection.getSelectedCombatModuleId(slotIndex);
    const resolvedCurrent = resolveSelectedCombatModuleId(
      preset,
      gameData.combatModuleRegistry,
      currentSelected,
    );
    if (resolvedCurrent === resolvedNext) {
      return true;
    }

    const defaultId = preset.combatModuleIds?.[0];
    if (defaultId !== undefined && moduleId === defaultId) {
      this.combatModuleSelection.clearSelectedCombatModuleId(slotIndex);
    } else {
      this.combatModuleSelection.setSelectedCombatModuleId(slotIndex, moduleId);
    }
    return true;
  }

  /** 中間 Wave 待機突入時: 完了 Wave を記録（二重 increment 防止は GameSession 側で 1 回のみ呼ぶ）。 */
  recordWaveCleared(completedWaveIndex: number): void {
    if (this.isCompletedValue || this.isDefeatedValue) return;
    if (completedWaveIndex !== this.currentWaveIndexValue) return;
    this.clearedWaveCountValue += 1;
  }

  /** startNextWave 成功後: 実行中 Wave index を次へ同期。 */
  syncCurrentWaveIndex(waveIndex: number): void {
    if (this.isCompletedValue) return;
    this.currentWaveIndexValue = waveIndex;
  }

  /** 最終 Wave 勝利 */
  markCompleted(finalWaveIndex: number, totalWaveCount: number): void {
    this.endWavePrepEditing();
    this.isActiveValue = false;
    this.isCompletedValue = true;
    this.isDefeatedValue = false;
    this.currentWaveIndexValue = finalWaveIndex;
    this.clearedWaveCountValue = totalWaveCount;
  }

  /** 敗北（R6f retry 用にインスタンスは保持） */
  markDefeated(): void {
    this.endWavePrepEditing();
    this.isActiveValue = false;
    this.isDefeatedValue = true;
    this.isCompletedValue = false;
  }

  /** restart / retry 前: Wave 進行を作戦開始位置へ戻す */
  prepareRetry(initialWaveIndex: number): void {
    this.endWavePrepEditing();
    this.isActiveValue = true;
    this.isDefeatedValue = false;
    this.isCompletedValue = false;
    this.resetWaveProgress(initialWaveIndex);
  }

  /** 敗北後 reload 用: Wave 進行のみ戻す（defeated フラグは維持） */
  resetWaveProgress(initialWaveIndex: number): void {
    this.endWavePrepEditing();
    this.currentWaveIndexValue = initialWaveIndex;
    this.clearedWaveCountValue = 0;
  }

  /** テスト用: party 参照が Save と別であることの検証 */
  getPartySlotsReference(): readonly PartySlotState[] {
    return this.partySlots;
  }

  /** テスト用: module map が元選択と別参照であることの検証 */
  getCombatModuleSelectionReference(): PartyCombatModuleSelection {
    return this.combatModuleSelection;
  }
}
