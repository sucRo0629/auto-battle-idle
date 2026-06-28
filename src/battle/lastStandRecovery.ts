import { getEffectiveMaxHp, getPassiveDefs } from './combatMath.ts';
import {
  DEFAULT_SURROUND_AURA_RADIUS_PX,
  isAllyWithinBattleXRadius,
} from './combatPosition.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

export const LAST_STAND_RECOVERY_HP_RATIO_DEFAULT = 0.5;
export const LAST_STAND_RECOVERY_SELF_DAMAGE_TAKEN_MULTIPLIER_DEFAULT = 0.5;
export const LAST_STAND_RECOVERY_FRONT_ALLY_DAMAGE_TAKEN_MULTIPLIER_DEFAULT = 0.75;
export const LAST_STAND_RECOVERY_DURATION_SEC_DEFAULT = 5;

const LAST_STAND_RECOVERY_SELF_ID_PREFIX = 'last_stand_recovery_self_';
const LAST_STAND_RECOVERY_FRONT_ID_PREFIX = 'last_stand_recovery_front_';

export function isLastStandRecoveryPassive(passive: PassiveSkillDef): boolean {
  return passive.effect === 'lastStandRecovery';
}

export interface MergedLastStandRecoveryConfig {
  hpRatio: number;
  selfDamageTakenMultiplier: number;
  frontAllyDamageTakenMultiplier: number;
  frontAllyAuraRadiusPx: number;
  durationSec: number;
}

export function mergeLastStandRecoveryPassives(
  passives: PassiveSkillDef[],
): MergedLastStandRecoveryConfig | null {
  for (const passive of passives) {
    if (!isLastStandRecoveryPassive(passive)) continue;
    return {
      hpRatio: passive.lastStandRecoveryHpRatio ?? LAST_STAND_RECOVERY_HP_RATIO_DEFAULT,
      selfDamageTakenMultiplier:
        passive.lastStandRecoverySelfDamageTakenMultiplier ??
        LAST_STAND_RECOVERY_SELF_DAMAGE_TAKEN_MULTIPLIER_DEFAULT,
      frontAllyDamageTakenMultiplier:
        passive.lastStandRecoveryFrontAllyDamageTakenMultiplier ??
        LAST_STAND_RECOVERY_FRONT_ALLY_DAMAGE_TAKEN_MULTIPLIER_DEFAULT,
      frontAllyAuraRadiusPx:
        passive.lastStandRecoveryFrontAllyAuraRadiusPx ??
        DEFAULT_SURROUND_AURA_RADIUS_PX,
      durationSec:
        passive.lastStandRecoveryDurationSec ?? LAST_STAND_RECOVERY_DURATION_SEC_DEFAULT,
    };
  }
  return null;
}

export function allyHasLastStandRecovery(
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): boolean {
  return mergeLastStandRecoveryPassives(getPassiveDefs(target, passives)) !== null;
}

function wouldDamageBeLethal(target: CombatantState, damage: number): boolean {
  if (damage <= 0) return false;
  let remaining = damage;
  remaining -= Math.min(target.barrierHp, remaining);
  return target.hp - remaining <= 0;
}

export interface LastStandRecoveryTriggerResult {
  negated: boolean;
  triggered: boolean;
}

function applyLastStandRecoveryBuffs(
  target: CombatantState,
  allies: CombatantState[],
  config: MergedLastStandRecoveryConfig,
): void {
  const selfId = `${LAST_STAND_RECOVERY_SELF_ID_PREFIX}${target.id}`;
  target.statusEffects = target.statusEffects.filter((effect) => effect.id !== selfId);
  target.statusEffects.push({
    id: selfId,
    kind: 'buff',
    stat: 'damageTaken',
    multiplier: config.selfDamageTakenMultiplier,
    sourceId: target.id,
    durationSec: config.durationSec,
    remainingSec: config.durationSec,
    displayName: '不退転',
  });

  for (const ally of allies) {
    if (ally.id === target.id) continue;
    const radiusPx =
      config.frontAllyAuraRadiusPx ?? DEFAULT_SURROUND_AURA_RADIUS_PX;
    if (!isAllyWithinBattleXRadius(target, ally, radiusPx)) continue;
    const effectId = `${LAST_STAND_RECOVERY_FRONT_ID_PREFIX}${target.id}_${ally.id}`;
    ally.statusEffects = ally.statusEffects.filter((effect) => effect.id !== effectId);
    ally.statusEffects.push({
      id: effectId,
      kind: 'buff',
      stat: 'damageTaken',
      multiplier: config.frontAllyDamageTakenMultiplier,
      sourceId: target.id,
      durationSec: config.durationSec,
      remainingSec: config.durationSec,
      displayName: '不退転',
    });
  }
}

/** 致死ダメージ直前に Wave 1 回だけ半復活 + DR を付与 */
export function tryLastStandRecovery(
  target: CombatantState,
  incomingDamage: number,
  passives: Record<string, PassiveSkillDef>,
  allies: CombatantState[],
): LastStandRecoveryTriggerResult {
  if (
    incomingDamage <= 0 ||
    !target.isAlive ||
    target.lastStandRecoveryUsed
  ) {
    return { negated: false, triggered: false };
  }

  const config = mergeLastStandRecoveryPassives(
    getPassiveDefs(target, passives),
  );
  if (!config) {
    return { negated: false, triggered: false };
  }
  if (!wouldDamageBeLethal(target, incomingDamage)) {
    return { negated: false, triggered: false };
  }

  const barrierHpBefore = target.barrierHp;
  target.lastStandRecoveryUsed = true;
  target.hp = Math.max(
    1,
    Math.floor(getEffectiveMaxHp(target) * config.hpRatio),
  );
  target.barrierHp = barrierHpBefore;
  applyLastStandRecoveryBuffs(target, allies, config);
  return { negated: true, triggered: true };
}
