import type { ClassId } from '../types.ts';

/** classes.json の配列順（既存クラス選択プルダウン・バランス表と同じ） */
export function compareByClassListOrder(
  aId: ClassId,
  bId: ClassId,
  classOrder: readonly ClassId[],
): number {
  const aIndex = classOrder.indexOf(aId);
  const bIndex = classOrder.indexOf(bId);
  if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
  if (aIndex !== -1) return -1;
  if (bIndex !== -1) return 1;
  return aId.localeCompare(bId);
}

export function sortClassIdsByListOrder(
  classIds: readonly ClassId[],
  classOrder: readonly ClassId[],
): ClassId[] {
  return [...classIds].sort((a, b) =>
    compareByClassListOrder(a, b, classOrder),
  );
}
