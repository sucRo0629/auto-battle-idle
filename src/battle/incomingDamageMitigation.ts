import { isInvulnerable } from './invulnerable.ts';
import { tryLastStandInvulnerable } from './lastStandInvulnerable.ts';
import { tryLastStandRecovery } from './lastStandRecovery.ts';
import {
  applyLastStandGutsHpFloor,
  tryLastStandGuts,
} from './lastStandGuts.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

export interface IncomingDamageMitigationOptions {
  allies?: CombatantState[];
}

export interface IncomingDamageMitigationResult {
  finalDamage: number;
  invulnerableBlocked: boolean;
  lastStandTriggered: boolean;
  lastStandRecoveryTriggered: boolean;
  lastStandGutsTriggered: boolean;
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
      lastStandGutsTriggered: false,
    };
  }

  if (isInvulnerable(target)) {
    return {
      finalDamage: 0,
      invulnerableBlocked: true,
      lastStandTriggered: false,
      lastStandRecoveryTriggered: false,
      lastStandGutsTriggered: false,
    };
  }

  const lastStand = tryLastStandInvulnerable(target, damage, passives);
  if (lastStand.negated) {
    return {
      finalDamage: 0,
      invulnerableBlocked: false,
      lastStandTriggered: lastStand.triggered,
      lastStandRecoveryTriggered: false,
      lastStandGutsTriggered: false,
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
      lastStandGutsTriggered: false,
    };
  }

  const guts = tryLastStandGuts(target, damage, passives);
  if (guts.negated) {
    return {
      finalDamage: 0,
      invulnerableBlocked: false,
      lastStandTriggered: false,
      lastStandRecoveryTriggered: false,
      lastStandGutsTriggered: guts.triggered,
    };
  }

  const capped = applyLastStandGutsHpFloor(target, damage);
  return {
    finalDamage: capped,
    invulnerableBlocked: false,
    lastStandTriggered: false,
    lastStandRecoveryTriggered: false,
    lastStandGutsTriggered: false,
  };
}
