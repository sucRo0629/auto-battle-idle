import {
  applyBarrierToTarget,
  getEffectiveAtk,
  getPassiveDefs,
  resolveResourceAmount,
} from './combatMath.ts';
import type { CombatantState, PassiveSkillDef, ResourceAmountSpec } from './types.ts';

export function isBarrierFullyBroken(
  barrierHpBefore: number,
  target: CombatantState,
  barrierDamage: number,
): boolean {
  return barrierHpBefore > 0 && target.barrierHp <= 0 && barrierDamage > 0;
}

export interface BarrierBreakRegenResult {
  granted: number;
  sourceId?: string;
  passiveId?: string;
}

export function tryTriggerBarrierBreakRegen(
  target: CombatantState,
  barrierHpBefore: number,
  barrierDamage: number,
  allUnits: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): BarrierBreakRegenResult {
  if (
    target.isEnemy ||
    !target.isAlive ||
    target.barrierBreakRegenUsed ||
    !isBarrierFullyBroken(barrierHpBefore, target, barrierDamage)
  ) {
    return { granted: 0 };
  }

  let bestSource:
    | { abjurer: CombatantState; passive: PassiveSkillDef }
    | undefined;

  for (const ally of allUnits) {
    if (ally.isEnemy || !ally.isAlive) continue;
    for (const passive of getPassiveDefs(ally, passives)) {
      if (passive.effect !== 'barrierBreakRegen') continue;
      if (
        !bestSource ||
        getEffectiveAtk(ally) > getEffectiveAtk(bestSource.abjurer)
      ) {
        bestSource = { abjurer: ally, passive };
      }
    }
  }

  if (!bestSource) return { granted: 0 };

  const amountSpec: ResourceAmountSpec =
    bestSource.passive.barrierAmount ??
    ({ kind: 'atkBased', atkScale: 0.85 } as const);
  const grant = resolveResourceAmount(
    bestSource.abjurer,
    target,
    amountSpec,
    passives,
  );
  if (grant <= 0) return { granted: 0 };

  applyBarrierToTarget(target, grant, false);
  target.barrierBreakRegenUsed = true;

  return {
    granted: grant,
    sourceId: bestSource.abjurer.id,
    passiveId: bestSource.passive.id,
  };
}
