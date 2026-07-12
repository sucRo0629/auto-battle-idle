import { PartyCombatModuleSelection } from '../battle/partyCombatModuleSelection.ts';
import type { PartySlotState } from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import {
  normalizePartySlots,
  validatePartyClassIds,
} from '../progression/partyCompose.ts';

export interface OperationStateReadonlyView {
  readonly stageId: string;
  readonly party: readonly PartySlotState[];
  readonly currentWaveIndex: number;
  readonly clearedWaveCount: number;
  readonly isActive: boolean;
  readonly isCompleted: boolean;
  readonly isDefeated: boolean;
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
    };
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
    this.isActiveValue = false;
    this.isCompletedValue = true;
    this.isDefeatedValue = false;
    this.currentWaveIndexValue = finalWaveIndex;
    this.clearedWaveCountValue = totalWaveCount;
  }

  /** 敗北（R6f retry 用にインスタンスは保持） */
  markDefeated(): void {
    this.isActiveValue = false;
    this.isDefeatedValue = true;
    this.isCompletedValue = false;
  }

  /** restart / retry 前: Wave 進行を作戦開始位置へ戻す */
  prepareRetry(initialWaveIndex: number): void {
    this.isActiveValue = true;
    this.isDefeatedValue = false;
    this.isCompletedValue = false;
    this.resetWaveProgress(initialWaveIndex);
  }

  /** 敗北後 reload 用: Wave 進行のみ戻す（defeated フラグは維持） */
  resetWaveProgress(initialWaveIndex: number): void {
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

  /** テスト用: 不正 slot は無視される（PartyCombatModuleSelection 委譲） */
  setCombatModuleForSlot(slotIndex: number, moduleId: string): void {
    if (slotIndex < 0 || slotIndex >= PARTY_SLOT_COUNT) return;
    this.combatModuleSelection.setSelectedCombatModuleId(slotIndex, moduleId);
  }
}
