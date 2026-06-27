import { getPassiveDefs } from './combatMath.ts';
import { grantInvulnerable } from './invulnerable.ts';
import type {
  CombatantState,
  PassiveSkillDef,
} from './types.ts';

export const LAST_STAND_INVULNERABLE_DURATION_SEC = 3;

export function isLastStandInvulnerablePassive(
  passive: PassiveSkillDef,
): boolean {
  return passive.effect === 'lastStandInvulnerable';
}

export function allyHasLastStandInvulnerable(
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): boolean {
  return getPassiveDefs(target, passives).some(isLastStandInvulnerablePassive);
}

function wouldDamageBeLethal(target: CombatantState, damage: number): boolean {
  if (damage <= 0) return false;
  let remaining = damage;
  remaining -= Math.min(target.barrierHp, remaining);
  return target.hp - remaining <= 0;
}

export interface LastStandTriggerResult {
  negated: boolean;
  triggered: boolean;
}

/** 致死ダメージ直前に Wave 1 回だけ無敵化する */
export function tryLastStandInvulnerable(
  target: CombatantState,
  incomingDamage: number,
  passives: Record<string, PassiveSkillDef>,
): LastStandTriggerResult {
  if (
    incomingDamage <= 0 ||
    !target.isAlive ||
    target.lastStandInvulnerableUsed
  ) {
    return { negated: false, triggered: false };
  }
  if (!allyHasLastStandInvulnerable(target, passives)) {
    return { negated: false, triggered: false };
  }
  if (!wouldDamageBeLethal(target, incomingDamage)) {
    return { negated: false, triggered: false };
  }

  target.lastStandInvulnerableUsed = true;
  grantInvulnerable(
    target,
    LAST_STAND_INVULNERABLE_DURATION_SEC,
    target.id,
  );
  return { negated: true, triggered: true };
}
