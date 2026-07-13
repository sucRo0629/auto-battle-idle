import { currentHpRatio, getPassiveDefs } from './combatMath.ts';
import { evaluateDamageIncreaseCondition } from './damageIncrease.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

function passesBonusBasicAttackGates(
  actor: CombatantState,
  target: CombatantState,
  passive: PassiveSkillDef,
  gameData?: Pick<import('./types.ts').GameData, 'skillRegistry' | 'combatModuleRegistry'>,
): boolean {
  const conditions = passive.bonusBasicAttackConditions ?? [];
  if (conditions.length > 0) {
    for (const condition of conditions) {
      if (!evaluateDamageIncreaseCondition(actor, target, condition, gameData)) {
        return false;
      }
    }
  }

  if (passive.bonusBasicAttackHpRatio !== undefined) {
    if (currentHpRatio(target) > passive.bonusBasicAttackHpRatio) {
      return false;
    }
  } else if (conditions.length === 0) {
    if (currentHpRatio(target) > 0.3) {
      return false;
    }
  }

  return true;
}

export function shouldTriggerBonusBasicAttackOnHit(
  actor: CombatantState,
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
  gameData?: Pick<import('./types.ts').GameData, 'skillRegistry' | 'combatModuleRegistry'>,
): boolean {
  for (const passive of getPassiveDefs(actor, passives)) {
    if (passive.effect !== 'bonusBasicAttackOnHit') continue;
    if (!passesBonusBasicAttackGates(actor, target, passive, gameData)) continue;
    const chance = passive.chance ?? 0.5;
    if (chance <= 0) continue;
    if (Math.random() <= Math.min(1, chance)) {
      return true;
    }
  }
  return false;
}
