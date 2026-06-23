import type { CombatantState, StatusEffect } from './types.ts';

/** 障壁は時間切れなし。HUD 用に十分長い持続を付与する */
export const WARD_BARRIER_DURATION_SEC = 999_999;

export function findActiveWardBarrier(
  target: CombatantState,
): StatusEffect | undefined {
  return target.statusEffects.find(
    (effect) =>
      effect.overlay === 'wardBarrier' &&
      effect.remainingSec > 0 &&
      (effect.stacks ?? 0) > 0,
  );
}

export function getWardBarrierStacks(target: CombatantState): number {
  const ward = findActiveWardBarrier(target);
  return ward?.stacks ?? 0;
}

function removeWardBarrierEffect(
  target: CombatantState,
  effectId: string,
): void {
  target.statusEffects = target.statusEffects.filter(
    (effect) => effect.id !== effectId,
  );
}

function consumeWardStack(target: CombatantState, ward: StatusEffect): void {
  const nextStacks = Math.max(0, (ward.stacks ?? 0) - 1);
  ward.stacks = nextStacks;
  if (nextStacks <= 0) {
    removeWardBarrierEffect(target, ward.id);
  }
}

/** 障壁スタックで被ダメを軽減し 1 スタック消費。barrierHp は触らない。 */
export function applyWardBarrierToIncomingDamage(
  target: CombatantState,
  damage: number,
): { damage: number; wardConsumed: boolean } {
  if (damage <= 0 || !target.isAlive) {
    return { damage: 0, wardConsumed: false };
  }
  const ward = findActiveWardBarrier(target);
  if (!ward) return { damage, wardConsumed: false };

  const ratio = ward.ratio ?? 0.1;
  const reduced = Math.floor(damage * ratio);
  consumeWardStack(target, ward);
  return { damage: reduced, wardConsumed: true };
}

/** 同一 sourceSkillId の障壁は上書き refresh（加算不可） */
export function applyWardBarrierToTarget(
  target: CombatantState,
  stacks: number,
  damageReductionRatio: number,
  sourceSkillId: string,
  sourceId: string,
): void {
  if (stacks <= 0) return;

  target.statusEffects = target.statusEffects.filter(
    (effect) =>
      !(
        effect.overlay === 'wardBarrier' && effect.skillId === sourceSkillId
      ),
  );

  target.statusEffects.push({
    id: `ward_${sourceSkillId}_${sourceId}_${Date.now()}`,
    kind: 'buff',
    overlay: 'wardBarrier',
    stacks,
    skillId: sourceSkillId,
    sourceId,
    ratio: damageReductionRatio,
    displayName: `障壁 ×${stacks}`,
    multiplier: 1,
    durationSec: WARD_BARRIER_DURATION_SEC,
    remainingSec: WARD_BARRIER_DURATION_SEC,
  });
}
