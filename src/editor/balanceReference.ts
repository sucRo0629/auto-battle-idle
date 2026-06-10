import type { ClassId, Role } from '../battle/types.ts';
import { configurableRangeHintJa } from '../battle/rangeLimits.ts';
import { compareByClassListOrder, type BalanceClassRow } from './editorApi.ts';

/** バランス比較の基準一次職（鉄衛・重戦・弓術・魔術・療養） */
export const BALANCE_RANGE_COLUMN_HINT = `射程列: ${configurableRangeHintJa()}。`;

export const BALANCE_REFERENCE_CLASS_IDS: readonly ClassId[] = [
  'df_guardian',
  'at_warrior',
  'at_ranger',
  'at_sorcerer',
  'sp_cleric',
] as const;

const REFERENCE_ID_SET = new Set<ClassId>(BALANCE_REFERENCE_CLASS_IDS);

export const BALANCE_REFERENCE_DISPLAY_NAMES: Record<ClassId, string> = {
  df_guardian: '鉄衛士',
  at_warrior: '剣術士',
  at_ranger: '弓術士',
  at_sorcerer: '魔術士',
  sp_cleric: '療養師',
};

export const BALANCE_ROLE_ORDER: readonly Role[] = [
  'defender',
  'attacker',
  'supporter',
] as const;

export type BalanceDisplayMode = 'all' | 'reference' | 'byRole';

export const BALANCE_DISPLAY_MODE_OPTIONS: readonly {
  value: BalanceDisplayMode;
  label: string;
}[] = [
  { value: 'all', label: 'すべて表示' },
  { value: 'reference', label: '基準クラスのみ' },
  { value: 'byRole', label: 'ロール別' },
] as const;

export function isBalanceReferenceClass(classId: ClassId): boolean {
  return REFERENCE_ID_SET.has(classId);
}

export function filterBalanceRowsByJobTier(
  rows: BalanceClassRow[],
  jobTier: number,
): BalanceClassRow[] {
  return rows.filter((row) => (row.current.jobTier ?? 1) === jobTier);
}

export function filterBalanceRowsForDisplay(
  rows: BalanceClassRow[],
  jobTier: number,
  mode: BalanceDisplayMode,
): BalanceClassRow[] {
  const tierRows = filterBalanceRowsByJobTier(rows, jobTier);
  if (mode === 'reference') {
    return tierRows.filter((row) => isBalanceReferenceClass(row.id));
  }
  return tierRows;
}

export function sortBalanceRowsByClassOrder(
  rows: BalanceClassRow[],
  classOrder: readonly ClassId[],
): BalanceClassRow[] {
  return [...rows].sort((a, b) =>
    compareByClassListOrder(a.id, b.id, classOrder),
  );
}

export function groupBalanceRowsByRole(
  rows: BalanceClassRow[],
  classOrder: readonly ClassId[],
): Map<Role, BalanceClassRow[]> {
  const grouped = new Map<Role, BalanceClassRow[]>();
  for (const role of BALANCE_ROLE_ORDER) {
    grouped.set(role, []);
  }
  for (const row of rows) {
    const bucket = grouped.get(row.current.role);
    if (bucket) bucket.push(row);
  }
  for (const [, bucket] of grouped) {
    bucket.sort((a, b) => compareByClassListOrder(a.id, b.id, classOrder));
  }
  return grouped;
}
