import { isInvulnerable } from './invulnerable.ts';
import { tryLastStandInvulnerable } from './lastStandInvulnerable.ts';
import { tryLastStandRecovery } from './lastStandRecovery.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

export interface IncomingDamageMitigationOptions {
  allies?: CombatantState[];
}

export interface IncomingDamageMitigationResult {
  finalDamage: number;
  invulnerableBlocked: boolean;
  lastStandTriggered: boolean;
  lastStandRecoveryTriggered: boolean;
}

export function mitigateIncomingDamage(
  target: CombatantState,
  damage: number,
  passives: Record<string, PassiveSkillDef>,
  options?: IncomingDamageMitigationOptions,
): IncomingDamageMitigationResult {
  if (damage <= 0 || !target.isAlive) {
    return {
      finalDamage: 0,
      invulnerableBlocked: false,
      lastStandTriggered: false,
      lastStandRecoveryTriggered: false,
    };
  }

  if (isInvulnerable(target)) {
    return {
      finalDamage: 0,
      invulnerableBlocked: true,
      lastStandTriggered: false,
      lastStandRecoveryTriggered: false,
    };
  }

  const lastStand = tryLastStandInvulnerable(target, damage, passives);
  if (lastStand.negated) {
    return {
      finalDamage: 0,
      invulnerableBlocked: false,
      lastStandTriggered: lastStand.triggered,
      lastStandRecoveryTriggered: false,
    };
  }

  const recovery = tryLastStandRecovery(
    target,
    damage,
    passives,
    options?.allies ?? [],
  );
  if (recovery.negated) {
    return {
      finalDamage: 0,
      invulnerableBlocked: false,
      lastStandTriggered: false,
      lastStandRecoveryTriggered: recovery.triggered,
    };
  }

  return {
    finalDamage: damage,
    invulnerableBlocked: false,
    lastStandTriggered: false,
    lastStandRecoveryTriggered: false,
  };
}
