import { getPassiveDefs } from './combatMath.ts';
import { applyKnockbackToTarget, applyStunToTarget } from './ccEffects.ts';
import type { ActiveSkillDef, CombatantState, PassiveSkillDef } from './types.ts';

export const LAST_STAND_GUTS_DURATION_SEC_DEFAULT = 4;
export const LAST_STAND_GUTS_END_STUN_SEC_DEFAULT = 1.5;
export const LAST_STAND_GUTS_END_KNOCKBACK_PX_DEFAULT = 15;

export const LAST_STAND_GUTS_OVERLAY = 'lastStandGuts' as const;
const LAST_STAND_GUTS_ID_PREFIX = 'last_stand_guts_';

export function isLastStandGutsPassive(passive: PassiveSkillDef): boolean {
  return passive.effect === 'lastStandGuts';
}

export function isLastStandGutsActive(target: CombatantState): boolean {
  return target.statusEffects.some(
    (effect) =>
      effect.overlay === LAST_STAND_GUTS_OVERLAY && effect.remainingSec > 0,
  );
}

function wouldDamageBeLethal(target: CombatantState, damage: number): boolean {
  if (damage <= 0) return false;
  let remaining = damage;
  remaining -= Math.min(target.barrierHp, remaining);
  return target.hp - remaining <= 0;
}

function resolveLastStandGutsConfig(passives: PassiveSkillDef[]): {
  durationSec: number;
  endStunSec: number;
  endKnockbackPx: number;
} | null {
  for (const passive of passives) {
    if (!isLastStandGutsPassive(passive)) continue;
    return {
      durationSec:
        passive.lastStandGutsDurationSec ?? LAST_STAND_GUTS_DURATION_SEC_DEFAULT,
      endStunSec:
        passive.lastStandGutsEndStunSec ?? LAST_STAND_GUTS_END_STUN_SEC_DEFAULT,
      endKnockbackPx:
        passive.lastStandGutsEndKnockbackPx ??
        LAST_STAND_GUTS_END_KNOCKBACK_PX_DEFAULT,
    };
  }
  return null;
}

export function grantLastStandGuts(
  target: CombatantState,
  durationSec: number,
): void {
  if (durationSec <= 0) return;
  const effectId = `${LAST_STAND_GUTS_ID_PREFIX}${target.id}`;
  target.statusEffects = target.statusEffects.filter((e) => e.id !== effectId);
  target.statusEffects.push({
    id: effectId,
    kind: 'buff',
    overlay: LAST_STAND_GUTS_OVERLAY,
    multiplier: 1,
    durationSec,
    remainingSec: durationSec,
    sourceId: target.id,
    displayName: '不屈',
  });
}

export interface LastStandGutsTriggerResult {
  negated: boolean;
  triggered: boolean;
}

/** 致死ダメージ直前に Wave 1 回、HP 1 未満にならない状態を付与 */
export function tryLastStandGuts(
  target: CombatantState,
  incomingDamage: number,
  passives: Record<string, PassiveSkillDef>,
): LastStandGutsTriggerResult {
  if (
    incomingDamage <= 0 ||
    !target.isAlive ||
    target.lastStandGutsUsed ||
    isLastStandGutsActive(target)
  ) {
    return { negated: false, triggered: false };
  }

  const config = resolveLastStandGutsConfig(
    getPassiveDefs(target, passives),
  );
  if (!config) {
    return { negated: false, triggered: false };
  }
  if (!wouldDamageBeLethal(target, incomingDamage)) {
    return { negated: false, triggered: false };
  }

  target.lastStandGutsUsed = true;
  target.hp = Math.max(1, target.hp);
  grantLastStandGuts(target, config.durationSec);
  return { negated: true, triggered: true };
}

/** 不屈中は HP を 1 未満にしない */
export function applyLastStandGutsHpFloor(
  target: CombatantState,
  damage: number,
): number {
  if (!isLastStandGutsActive(target) || damage <= 0) return damage;
  const maxHpLoss = Math.max(0, target.hp - 1);
  return Math.min(damage, maxHpLoss);
}

export function resolveLastStandGutsEndConfig(
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): { endStunSec: number; endKnockbackPx: number } | null {
  const config = resolveLastStandGutsConfig(getPassiveDefs(target, passives));
  if (!config) return null;
  return {
    endStunSec: config.endStunSec,
    endKnockbackPx: config.endKnockbackPx,
  };
}

export function applyLastStandGutsEndEffects(
  duelist: CombatantState,
  enemies: CombatantState[],
  endStunSec: number,
  endKnockbackPx: number,
  actives: Record<string, ActiveSkillDef>,
): void {
  for (const enemy of enemies) {
    if (!enemy.isAlive) continue;
    applyStunToTarget(
      enemy,
      endStunSec,
      { skillId: 'last_stand_guts_end', sourceId: duelist.id },
      { actives },
    );
    applyKnockbackToTarget(enemy, endKnockbackPx, {
      sourceId: duelist.id,
      skillId: 'last_stand_guts_end',
    });
  }
}
