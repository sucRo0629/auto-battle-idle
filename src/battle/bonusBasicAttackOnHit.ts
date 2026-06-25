import { currentHpRatio, getPassiveDefs } from './combatMath.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

export function shouldTriggerBonusBasicAttackOnHit(
  actor: CombatantState,
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): boolean {
  for (const passive of getPassiveDefs(actor, passives)) {
    if (passive.effect !== 'bonusBasicAttackOnHit') continue;
    const threshold = passive.bonusBasicAttackHpRatio ?? 0.3;
    if (currentHpRatio(target) > threshold) continue;
    const chance = passive.chance ?? 0.5;
    if (chance <= 0) continue;
    if (Math.random() <= Math.min(1, chance)) {
      return true;
    }
  }
  return false;
}
