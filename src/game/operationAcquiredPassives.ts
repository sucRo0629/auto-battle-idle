import { PARTY_SLOT_COUNT } from '../battle/types.ts';

/** slot ごとの取得済み作戦内パッシブ ID（実行中メモリのみ。Save 非統合）。 */
export interface OperationAcquiredPassiveEntry {
  readonly slotIndex: number;
  readonly passiveIds: readonly string[];
}

function isNonEmptyPassiveId(passiveId: string): boolean {
  return typeof passiveId === 'string' && passiveId.trim().length > 0;
}

/**
 * R8b: slot ごとの作戦内取得パッシブ ID 集合。
 * key = party slot index (0 .. PARTY_SLOT_COUNT - 1)。
 */
export class OperationAcquiredPassives {
  private readonly bySlot = new Map<number, string[]>();

  getAcquiredPassiveIds(slotIndex: number): readonly string[] {
    if (slotIndex < 0 || slotIndex >= PARTY_SLOT_COUNT) return [];
    const ids = this.bySlot.get(slotIndex);
    return ids ? [...ids] : [];
  }

  /** 同一 slot 内の重複 ID は追加しない。 */
  tryAddAcquiredPassiveId(slotIndex: number, passiveId: string): boolean {
    if (slotIndex < 0 || slotIndex >= PARTY_SLOT_COUNT) return false;
    if (!isNonEmptyPassiveId(passiveId)) return false;

    const existing = this.bySlot.get(slotIndex) ?? [];
    if (existing.includes(passiveId)) return false;

    this.bySlot.set(slotIndex, [...existing, passiveId]);
    return true;
  }

  /** checkpoint 復元用。不正 slot / 空 ID は無視し、slot 内重複は除去する。 */
  replaceFromEntries(entries: readonly OperationAcquiredPassiveEntry[]): void {
    this.bySlot.clear();
    for (const entry of entries) {
      if (entry.slotIndex < 0 || entry.slotIndex >= PARTY_SLOT_COUNT) continue;
      const unique: string[] = [];
      for (const passiveId of entry.passiveIds) {
        if (!isNonEmptyPassiveId(passiveId)) continue;
        if (unique.includes(passiveId)) continue;
        unique.push(passiveId);
      }
      if (unique.length > 0) {
        this.bySlot.set(entry.slotIndex, unique);
      }
    }
  }

  reset(): void {
    this.bySlot.clear();
  }

  clone(): OperationAcquiredPassives {
    const copy = new OperationAcquiredPassives();
    for (const [slotIndex, passiveIds] of this.bySlot) {
      copy.bySlot.set(slotIndex, [...passiveIds]);
    }
    return copy;
  }

  /** テスト用: 内部 Map が外部参照と別であることの検証 */
  getBySlotReference(): ReadonlyMap<number, string[]> {
    return this.bySlot;
  }
}

export function captureAcquiredPassiveEntries(
  acquired: OperationAcquiredPassives,
): OperationAcquiredPassiveEntry[] {
  const entries: OperationAcquiredPassiveEntry[] = [];
  for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex += 1) {
    const passiveIds = acquired.getAcquiredPassiveIds(slotIndex);
    if (passiveIds.length > 0) {
      entries.push({ slotIndex, passiveIds: [...passiveIds] });
    }
  }
  return entries;
}

export function validateAcquiredPassiveEntries(
  entries: readonly OperationAcquiredPassiveEntry[],
): boolean {
  for (const entry of entries) {
    if (entry.slotIndex < 0 || entry.slotIndex >= PARTY_SLOT_COUNT) {
      return false;
    }
    const seen = new Set<string>();
    for (const passiveId of entry.passiveIds) {
      if (!isNonEmptyPassiveId(passiveId)) return false;
      if (seen.has(passiveId)) return false;
      seen.add(passiveId);
    }
  }
  return true;
}
