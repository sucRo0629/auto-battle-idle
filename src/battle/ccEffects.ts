import { getBattleX } from './combatPosition.ts';
import type { CombatantState, StatusEffect } from './types.ts';
import { BATTLE_ENEMY_MARCH_VISIBLE_MIN_X } from './battleConstants.ts';

const STUN_OVERLAY = 'stun' as const;

export function isUnitStunned(unit: CombatantState): boolean {
  return unit.statusEffects.some(
    (effect) =>
      effect.kind === 'cc' &&
      effect.overlay === STUN_OVERLAY &&
      effect.remainingSec > 0,
  );
}

export function applyStunToTarget(
  target: CombatantState,
  durationSec: number,
  source: { skillId: string; sourceId: string },
): boolean {
  if (!target.isAlive || durationSec <= 0) return false;

  const existing = target.statusEffects.find(
    (effect) => effect.kind === 'cc' && effect.overlay === STUN_OVERLAY,
  );
  if (existing) {
    if (durationSec > existing.remainingSec) {
      existing.remainingSec = durationSec;
      existing.durationSec = durationSec;
    }
    return true;
  }

  const effect: StatusEffect = {
    id: `${source.skillId}_stun_${Date.now()}`,
    kind: 'cc',
    overlay: STUN_OVERLAY,
    multiplier: 1,
    durationSec,
    remainingSec: durationSec,
    skillId: source.skillId,
    sourceId: source.sourceId,
  };
  target.statusEffects.push(effect);
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
