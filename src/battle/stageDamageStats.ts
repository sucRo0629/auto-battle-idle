import type {
  ClassId,
  ClassPreset,
  CombatantState,
  PartySlotState,
} from './types.ts';
import { PARTY_SLOT_COUNT } from './types.ts';

export interface SlotDamageStats {
  classId: ClassId;
  damageDealt: number;
  damageTaken: number;
}

export interface StageDamageDisplayRow {
  slotIndex: number;
  classId: ClassId;
  displayName: string;
  damageDealt: number;
  damageTaken: number;
  dealtRatio: number;
  takenRatio: number;
}

export function toRatios(values: number[]): number[] {
  const max = Math.max(0, ...values);
  if (max <= 0) return values.map(() => 0);
  return values.map((value) => value / max);
}

export class StageDamageStatsTracker {
  private stageId = '';
  private readonly bySlot = new Map<number, SlotDamageStats>();

  resetForStage(stageId: string): void {
    this.stageId = stageId;
    this.bySlot.clear();
  }

  getStageId(): string {
    return this.stageId;
  }

  recordDamage(
    actor: CombatantState | undefined,
    target: CombatantState,
    amount: number,
  ): void {
    if (amount <= 0) return;

    if (
      actor &&
      !actor.isEnemy &&
      actor.partySlotIndex !== undefined
    ) {
      this.addToSlot(actor.partySlotIndex, actor.classId, 'damageDealt', amount);
    }

    if (!target.isEnemy && target.partySlotIndex !== undefined) {
      this.addToSlot(
        target.partySlotIndex,
        target.classId,
        'damageTaken',
        amount,
      );
    }
  }

  getDisplayRows(
    party: PartySlotState[],
    classRegistry: Record<ClassId, ClassPreset>,
  ): StageDamageDisplayRow[] {
    const rows: StageDamageDisplayRow[] = [];

    for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
      const member = party[slotIndex];
      if (!member) continue;

      const stats = this.bySlot.get(slotIndex);
      rows.push({
        slotIndex,
        classId: member.classId,
        displayName:
          classRegistry[member.classId]?.displayName ?? member.classId,
        damageDealt: stats?.damageDealt ?? 0,
        damageTaken: stats?.damageTaken ?? 0,
        dealtRatio: 0,
        takenRatio: 0,
      });
    }

    const dealtRatios = toRatios(rows.map((row) => row.damageDealt));
    const takenRatios = toRatios(rows.map((row) => row.damageTaken));
    rows.forEach((row, index) => {
      row.dealtRatio = dealtRatios[index] ?? 0;
      row.takenRatio = takenRatios[index] ?? 0;
    });

    return rows;
  }

  private addToSlot(
    slotIndex: number,
    classId: ClassId,
    field: 'damageDealt' | 'damageTaken',
    amount: number,
  ): void {
    const existing = this.bySlot.get(slotIndex);
    if (existing) {
      existing[field] += amount;
      existing.classId = classId;
      return;
    }

    this.bySlot.set(slotIndex, {
      classId,
      damageDealt: field === 'damageDealt' ? amount : 0,
      damageTaken: field === 'damageTaken' ? amount : 0,
    });
  }
}
