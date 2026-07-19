import type { OperationPassiveCatalogDef } from '../battle/types.ts';

/**
 * R12l: fixedCostByPassiveId を優先し、未設定時のみ legacy unlockLevel 帯へフォールバック。
 */
export function resolveOperationPassiveBaseCost(
  catalog: OperationPassiveCatalogDef,
  passiveId: string,
): number {
  const fixedCost = catalog.fixedCostByPassiveId?.[passiveId];
  if (typeof fixedCost === 'number' && Number.isInteger(fixedCost) && fixedCost >= 1) {
    return fixedCost;
  }
  const unlockLevel = catalog.costUnlockLevelByPassiveId[passiveId];
  if (typeof unlockLevel !== 'number' || !Number.isInteger(unlockLevel)) {
    return catalog.passiveAcquireCost;
  }
  const keyed = catalog.unlockLevelCostTable[String(unlockLevel)];
  if (typeof keyed === 'number' && Number.isInteger(keyed) && keyed >= 1) {
    return keyed;
  }
  return catalog.passiveAcquireCost;
}

/**
 * R11c: cost = base(unlockLevel) + sameClassAlreadyAcquiredCount × sameClassStackStep.
 * `sameClassAlreadyAcquiredCount` は取得前の同一クラス／スロット取得数。
 */
export function resolveOperationPassiveAcquireCost(
  catalog: OperationPassiveCatalogDef,
  passiveId: string,
  sameClassAlreadyAcquiredCount: number,
): number {
  const base = resolveOperationPassiveBaseCost(catalog, passiveId);
  const step = catalog.sameClassStackStep;
  const count = Math.max(0, Math.floor(sameClassAlreadyAcquiredCount));
  return base + count * step;
}
