import { currentHpRatio } from './combatMath.ts';
import { evaluateAuraConditions, hasActiveDot } from './dotMechanics.ts';
import { getPassiveDefs } from './combatMath.ts';
import type {
  CombatantState,
  DamageIncreaseCondition,
  PassiveSkillDef,
} from './types.ts';

export function resolveDottedEnemyHealReceivedMultiplier(
  target: CombatantState,
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): number {
  if (!hasActiveDot(target)) return 1;
  let mul = 1;
  for (const ally of allies) {
    if (!ally.isAlive) continue;
    for (const passive of getPassiveDefs(ally, passives)) {
      if (passive.effect !== 'dottedEnemyHealReceivedDebuff' &&
          passive.effect !== 'dotDurationMultiplierOnApply') {
        continue;
      }
      const healDebuffMul = passive.dottedEnemyHealReceivedMultiplier;
      if (healDebuffMul !== undefined) {
        mul *= healDebuffMul;
      }
    }
  }
  return mul;
}

export function resolvePartyFinisherDamageMultiplier(
  target: CombatantState,
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): number {
  let mul = 1;
  for (const ally of allies) {
    if (!ally.isAlive) continue;
    for (const passive of getPassiveDefs(ally, passives)) {
      if (passive.effect !== 'conditionalEnemyDamageTakenAura') continue;
      const conditions =
        passive.auraConditions ??
        ([
          { kind: 'hasDot' as const },
          { kind: 'targetHp' as const, maxHpRatio: 0.5 },
        ] satisfies DamageIncreaseCondition[]);
      if (!evaluateAuraConditions(target, conditions)) continue;
      mul *= passive.enemyDamageTakenMultiplier ?? 1;
    }
  }
  return mul;
}

export function matchesFinisherTarget(target: CombatantState): boolean {
  return hasActiveDot(target) && currentHpRatio(target) <= 0.5;
}
