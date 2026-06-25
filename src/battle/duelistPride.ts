import { currentHpRatio, getPassiveDefs, matchesHpRatioThreshold } from './combatMath.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

export const PRIDE_HP_RATIO_MIN_DEFAULT = 0.5;
export const PRIDE_HEAL_MULTIPLIER_DEFAULT = 0.25;

export function isDuelistPridePassive(passive: PassiveSkillDef): boolean {
  return passive.effect === 'duelistPride';
}

export function resolveDuelistPrideIncomingHealMultiplier(
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): number {
  let mul = 1;
  for (const passive of getPassiveDefs(target, passives)) {
    if (!isDuelistPridePassive(passive)) continue;
    const minRatio = passive.prideHpRatioMin ?? PRIDE_HP_RATIO_MIN_DEFAULT;
    if (!matchesHpRatioThreshold(currentHpRatio(target), minRatio, 'gte')) {
      continue;
    }
    const prideMul = passive.prideHealMultiplier ?? PRIDE_HEAL_MULTIPLIER_DEFAULT;
    mul = Math.min(mul, prideMul);
  }
  return mul;
}
