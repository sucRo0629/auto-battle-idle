import { isInvulnerable, grantInvulnerable } from './invulnerable.ts';
import { tryLastStandInvulnerable } from './lastStandInvulnerable.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

export interface IncomingDamageMitigationResult {
  finalDamage: number;
  invulnerableBlocked: boolean;
  lastStandTriggered: boolean;
}

export function mitigateIncomingDamage(
  target: CombatantState,
  damage: number,
  passives: Record<string, PassiveSkillDef>,
): IncomingDamageMitigationResult {
  if (damage <= 0 || !target.isAlive) {
    return {
      finalDamage: 0,
      invulnerableBlocked: false,
      lastStandTriggered: false,
    };
  }

  if (isInvulnerable(target)) {
    return {
      finalDamage: 0,
      invulnerableBlocked: true,
      lastStandTriggered: false,
    };
  }

  const lastStand = tryLastStandInvulnerable(target, damage, passives);
  if (lastStand.negated) {
    return {
      finalDamage: 0,
      invulnerableBlocked: false,
      lastStandTriggered: lastStand.triggered,
    };
  }

  return {
    finalDamage: damage,
    invulnerableBlocked: false,
    lastStandTriggered: false,
  };
}
