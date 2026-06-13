import { getBattleX } from './combatPosition.ts';
import { resetCooldownAfterFire } from './skillTrigger.ts';
import type { ActiveSkillDef, CombatantState, StatusEffect } from './types.ts';
import { BATTLE_ENEMY_MARCH_VISIBLE_MIN_X } from './battleConstants.ts';

const STUN_OVERLAY = 'stun' as const;

export const STUN_MAX_DURATION_SEC = 5;

export function isUnitStunned(unit: CombatantState): boolean {
  return unit.statusEffects.some(
    (effect) =>
      effect.kind === 'cc' &&
      effect.overlay === STUN_OVERLAY &&
      effect.remainingSec > 0,
  );
}

export function clampStunDurationSec(durationSec: number): number {
  return Math.min(Math.max(0, durationSec), STUN_MAX_DURATION_SEC);
}

export function resetBasicCooldownOnStun(
  target: CombatantState,
  actives: Record<string, ActiveSkillDef>,
): void {
  const basicCd = target.cooldowns.find((cd) => cd.slotKind === 'basic');
  if (!basicCd) return;
  const skill = actives[basicCd.skillId];
  if (!skill) return;
  resetCooldownAfterFire(basicCd, skill);
}

export interface ApplyStunOptions {
  actives?: Record<string, ActiveSkillDef>;
}

export function applyStunToTarget(
  target: CombatantState,
  durationSec: number,
  source: { skillId: string; sourceId: string },
  options?: ApplyStunOptions,
): boolean {
  const clamped = clampStunDurationSec(durationSec);
  if (!target.isAlive || clamped <= 0) return false;

  const existing = target.statusEffects.find(
    (effect) => effect.kind === 'cc' && effect.overlay === STUN_OVERLAY,
  );
  if (existing) {
    if (clamped > existing.remainingSec) {
      existing.remainingSec = clamped;
      existing.durationSec = clamped;
    }
    if (options?.actives) {
      resetBasicCooldownOnStun(target, options.actives);
    }
    return true;
  }

  const effect: StatusEffect = {
    id: `${source.skillId}_stun_${Date.now()}`,
    kind: 'cc',
    overlay: STUN_OVERLAY,
    multiplier: 1,
    durationSec: clamped,
    remainingSec: clamped,
    skillId: source.skillId,
    sourceId: source.sourceId,
  };
  target.statusEffects.push(effect);
  if (options?.actives) {
    resetBasicCooldownOnStun(target, options.actives);
  }
  return true;
}

/** 各陣営の後方へ押す（プレイヤーは左、敵は右） */
export function applyKnockbackToTarget(
  target: CombatantState,
  distancePx: number,
): boolean {
  if (!target.isAlive || distancePx <= 0) return false;

  const delta = target.isEnemy ? distancePx : -distancePx;
  const nextX = getBattleX(target) + delta;
  if (target.isEnemy) {
    target.battleX = Math.max(BATTLE_ENEMY_MARCH_VISIBLE_MIN_X, nextX);
  } else {
    target.battleX = nextX;
  }
  return true;
}
