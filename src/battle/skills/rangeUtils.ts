import type { CombatantState, SkillEffectDef, TargetRule } from '../types.ts';
import {
  DEFAULT_MELEE_ATTACK_RANGE_PX,
  DEFAULT_RANGED_RANGE_PX,
} from '../types.ts';
import { getBattleX } from '../combatPosition.ts';
import { getTargetPoolForRule } from './targetingPool.ts';

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
  return battleDistance(actor, target) <= rangePx;
}

export function resolveSkillRangePx(
  actor: CombatantState,
  effect: Pick<SkillEffectDef, 'range'>,
): number {
  if (effect.range !== undefined) return effect.range;
  if (actor.traits.rangePx !== undefined) return actor.traits.rangePx;
  return actor.traits.attackRange === 'melee'
    ? DEFAULT_MELEE_ATTACK_RANGE_PX
    : DEFAULT_RANGED_RANGE_PX;
}

export function getAttackablePool(
  rule: TargetRule,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  rangePx: number,
): CombatantState[] {
  const pool = getTargetPoolForRule(rule, actor, allies, enemies);
  if (rule === 'self') {
    return pool;
  }
  return pool.filter((unit) => isWithinSkillRange(actor, unit, rangePx));
}
