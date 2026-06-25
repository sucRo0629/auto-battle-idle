import { getBattleX, syncFieldX } from './combatPosition.ts';
import type { ActiveSkillDef, CombatantState, StatusEffect } from './types.ts';
import { BATTLE_ENEMY_MARCH_VISIBLE_MIN_X } from './battleConstants.ts';

const STUN_OVERLAY = 'stun' as const;
const MOVE_LOCK_OVERLAY = 'moveLock' as const;

export const STUN_MAX_DURATION_SEC = 5;
export const KNOCKBACK_MOVE_LOCK_SEC = 1.5;

export interface CcEffectSource {
  skillId: string;
  sourceId: string;
}

export function isUnitStunned(unit: CombatantState): boolean {
  return unit.statusEffects.some(
    (effect) =>
      effect.kind === 'cc' &&
      effect.overlay === STUN_OVERLAY &&
      effect.remainingSec > 0,
  );
}

export function isUnitMovementLocked(unit: CombatantState): boolean {
  return unit.statusEffects.some(
    (effect) =>
      effect.kind === 'cc' &&
      effect.overlay === MOVE_LOCK_OVERLAY &&
      effect.remainingSec > 0,
  );
}

/** 接敵接近・スキル move・行軍アニメを止める（スタン含む） */
export function isUnitMovementBlocked(unit: CombatantState): boolean {
  return isUnitStunned(unit) || isUnitMovementLocked(unit);
}

export function clampStunDurationSec(durationSec: number): number {
  return Math.min(Math.max(0, durationSec), STUN_MAX_DURATION_SEC);
}

export interface ApplyStunOptions {
  /** Backward-compatible call shape; stun no longer mutates cooldowns. */
  actives?: Record<string, ActiveSkillDef>;
}

export function applyStunToTarget(
  target: CombatantState,
  durationSec: number,
  source: { skillId: string; sourceId: string },
  _options?: ApplyStunOptions,
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
  return true;
}

export function applyMoveLockToTarget(
  target: CombatantState,
  durationSec: number,
  source: CcEffectSource,
): boolean {
  const clamped = Math.max(0, durationSec);
  if (!target.isAlive || clamped <= 0) return false;

  const existing = target.statusEffects.find(
    (effect) => effect.kind === 'cc' && effect.overlay === MOVE_LOCK_OVERLAY,
  );
  if (existing) {
    if (clamped > existing.remainingSec) {
      existing.remainingSec = clamped;
      existing.durationSec = clamped;
    }
    return true;
  }

  const effect: StatusEffect = {
    id: `${source.skillId}_moveLock_${Date.now()}`,
    kind: 'cc',
    overlay: MOVE_LOCK_OVERLAY,
    multiplier: 1,
    durationSec: clamped,
    remainingSec: clamped,
    skillId: source.skillId,
    sourceId: source.sourceId,
  };
  target.statusEffects.push(effect);
  return true;
}

/** 各陣営の後方へ押す（プレイヤーは左、敵は右）。成功時は移動硬直を付与 */
export function applyKnockbackToTarget(
  target: CombatantState,
  distancePx: number,
  source?: CcEffectSource,
): boolean {
  if (!target.isAlive || distancePx <= 0) return false;

  const delta = target.isEnemy ? distancePx : -distancePx;
  const nextX = getBattleX(target) + delta;
  if (target.isEnemy) {
    target.battleX = Math.max(BATTLE_ENEMY_MARCH_VISIBLE_MIN_X, nextX);
  } else {
    target.battleX = nextX;
  }
  syncFieldX(target);

  applyMoveLockToTarget(
    target,
    KNOCKBACK_MOVE_LOCK_SEC,
    source ?? { skillId: 'knockback', sourceId: 'knockback' },
  );
  return true;
}
