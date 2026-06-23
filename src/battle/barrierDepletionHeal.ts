import {
  applyHealToTarget,
  getEffectiveAtk,
  getPassiveDefs,
  resolveResourceAmount,
} from './combatMath.ts';
import { isBarrierFullyBroken } from './barrierBreakRegen.ts';
import type { CombatantState, PassiveSkillDef, ResourceAmountSpec } from './types.ts';

export interface BarrierDepletionHealResult {
  healed: number;
  sourceId?: string;
  passiveId?: string;
}

export function tryTriggerBarrierDepletionHeal(
  target: CombatantState,
  barrierHpBefore: number,
  barrierDamage: number,
  allUnits: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): BarrierDepletionHealResult {
  if (
    target.isEnemy ||
    !target.isAlive ||
    target.barrierDepletionHealUsed ||
    !isBarrierFullyBroken(barrierHpBefore, target, barrierDamage)
  ) {
    return { healed: 0 };
  }

  let bestSource:
    | { wardweaver: CombatantState; passive: PassiveSkillDef }
    | undefined;

  for (const ally of allUnits) {
    if (ally.isEnemy || !ally.isAlive) continue;
    for (const passive of getPassiveDefs(ally, passives)) {
      if (passive.effect !== 'barrierDepletionHeal') continue;
      if (
        !bestSource ||
        getEffectiveAtk(ally) > getEffectiveAtk(bestSource.wardweaver)
      ) {
        bestSource = { wardweaver: ally, passive };
      }
    }
  }

  if (!bestSource) return { healed: 0 };

  const amountSpec: ResourceAmountSpec =
    bestSource.passive.healAmount ??
    ({ kind: 'atkBased', atkScale: 0.65 } as const);
  const healAttempt = resolveResourceAmount(
    bestSource.wardweaver,
    target,
    amountSpec,
    passives,
  );
  if (healAttempt <= 0) return { healed: 0 };

  const healed = applyHealToTarget(target, healAttempt);
  if (healed <= 0) return { healed: 0 };

  target.barrierDepletionHealUsed = true;

  return {
    healed,
    sourceId: bestSource.wardweaver.id,
    passiveId: bestSource.passive.id,
  };
}
