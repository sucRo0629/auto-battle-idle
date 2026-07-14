import type { OperationPassiveCatalogDef } from '../battle/types.ts';

/**
 * R11c: 候補の unlockLevel 帯 → base cost。
 * catalog に無い / 表に無い場合は `passiveAcquireCost` フォールバック。
 */
export function resolveOperationPassiveBaseCost(
  catalog: OperationPassiveCatalogDef,
  passiveId: string,
): number {
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
