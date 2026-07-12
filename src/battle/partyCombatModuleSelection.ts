import { PARTY_SLOT_COUNT } from './types.ts';

/**
 * R5d: 味方 party slot ごとの combat module 選択（実行中メモリのみ。Save 非統合）。
 * key = party slot index (0 .. PARTY_SLOT_COUNT - 1)。
 */
export class PartyCombatModuleSelection {
  private readonly bySlot = new Map<number, string>();

  setSelectedCombatModuleId(slotIndex: number, moduleId: string): void {
    if (slotIndex < 0 || slotIndex >= PARTY_SLOT_COUNT) return;
    this.bySlot.set(slotIndex, moduleId);
  }

  getSelectedCombatModuleId(slotIndex: number): string | undefined {
    if (slotIndex < 0 || slotIndex >= PARTY_SLOT_COUNT) return undefined;
    return this.bySlot.get(slotIndex);
  }

  /** 未指定状態へ戻す（default = combatModuleIds[0]）。 */
  clearSelectedCombatModuleId(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= PARTY_SLOT_COUNT) return;
    this.bySlot.delete(slotIndex);
  }

  resetToDefault(slotIndex: number): void {
    this.clearSelectedCombatModuleId(slotIndex);
  }

  /** 別参照のコピー（OperationState snapshot 用）。 */
  clone(): PartyCombatModuleSelection {
    const copy = new PartyCombatModuleSelection();
    for (const [slotIndex, moduleId] of this.bySlot) {
      copy.setSelectedCombatModuleId(slotIndex, moduleId);
    }
    return copy;
  }
}
