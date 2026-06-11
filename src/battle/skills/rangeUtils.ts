import type { CombatantState, SkillEffectDef, TargetSpec } from '../types.ts';
import { isMeleeRangePx } from '../types.ts';
import { engagedMinBodyGap } from '../battleConstants.ts';
import { getBattleX } from '../combatPosition.ts';
import { partyFormationDepthPx } from '../partyFormation.ts';
import { getEffectTarget, getTargetPool, isMultiTargetSpec, targetSpecFaction } from './targetSpec.ts';

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
  if (isMeleeRangePx(rangePx)) {
    const reach = engagedMinBodyGap() + rangePx;
    return dist <= 0 && dist >= -reach;
  }
  return Math.abs(dist) <= rangePx;
}
const DEFAULT_PARTY_SIZE_FOR_HEAL_RANGE = 5;

function isAllyTargetedHealEffect(
  effect: Pick<SkillEffectDef, 'type' | 'target' | 'targetRule'>,
  actor: CombatantState,
): boolean {
  if (effect.type !== 'heal') return false;
  const spec = getEffectTarget(effect as SkillEffectDef);
  return targetSpecFaction(spec, actor) === 'ally';
}

/** 味方回復はパーティ奥行きまで届くよう射程を底上げ */
export function resolveSkillRangePx(
  actor: CombatantState,
  effect: Pick<SkillEffectDef, 'range' | 'type' | 'target' | 'targetRule'>,
  livingAllyCount: number = DEFAULT_PARTY_SIZE_FOR_HEAL_RANGE,
): number {
  const base = effect.range ?? actor.traits.rangePx;
  if (!isAllyTargetedHealEffect(effect, actor)) return base;
  const partyDepth = partyFormationDepthPx(
    Math.max(1, livingAllyCount),
  );
  return Math.max(base, partyDepth);
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
