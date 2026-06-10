import type { CombatantState, SkillEffectDef, TargetSpec } from '../types.ts';
import { engagedMinBodyGap } from '../battleConstants.ts';
import { getBattleX } from '../combatPosition.ts';
import { getTargetPool, isMultiTargetSpec } from './targetSpec.ts';

/** 味方→敵 / 敵→味方の 1D 距離（px） */
export function battleDistance(
  actor: CombatantState,
  target: CombatantState,
): number {
  if (actor.id === target.id) return 0;
  return actor.isEnemy
    ? getBattleX(target) - getBattleX(actor)
    : getBattleX(actor) - getBattleX(target);
}

export function isWithinSkillRange(
  actor: CombatantState,
  target: CombatantState,
  rangePx: number,
): boolean {
  if (actor.id === target.id) return true;
  const dist = battleDistance(actor, target);
  if (rangePx <= 0) {
    const reach = engagedMinBodyGap();
    return dist <= 0 && dist >= -reach;
  }
  return dist <= rangePx;
}

export function resolveSkillRangePx(
  actor: CombatantState,
  effect: Pick<SkillEffectDef, 'range'>,
): number {
  return effect.range ?? actor.traits.rangePx;
}

export function getAttackablePool(
  spec: TargetSpec,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  rangePx: number,
): CombatantState[] {
  const pool = getTargetPool(spec, actor, allies, enemies);
  if (spec.kind === 'self' || isMultiTargetSpec(spec)) {
    return pool;
  }
  return pool.filter((unit) => isWithinSkillRange(actor, unit, rangePx));
}
