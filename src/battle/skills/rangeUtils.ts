import type { CombatantState, SkillEffectDef, TargetSpec } from '../types.ts';
import { getBattleX } from '../combatPosition.ts';
import { partyFormationDepthPx } from '../partyFormation.ts';
import {
  getEffectTarget,
  getTargetPool,
  isMultiTargetSpec,
  targetSpecFaction,
} from './targetSpec.ts';

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

/** 向き前方への距離（正 = 前方） */
export function forwardDistancePx(
  actor: CombatantState,
  target: CombatantState,
): number {
  return -battleDistance(actor, target);
}

/** 使用者の向いている方向の前方セグメント内か */
export function isInForwardSegment(
  actor: CombatantState,
  target: CombatantState,
  rangePx: number,
): boolean {
  if (actor.id === target.id) return true;
  const forward = forwardDistancePx(actor, target);
  if (forward < 0) return false;
  return forward <= rangePx;
}

export function isWithinSkillRange(
  actor: CombatantState,
  target: CombatantState,
  rangePx: number,
): boolean {
  if (actor.id === target.id) return true;
  if (actor.isEnemy === target.isEnemy) {
    return Math.abs(getBattleX(actor) - getBattleX(target)) <= rangePx;
  }
  return isInForwardSegment(actor, target, rangePx);
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

function isAllyTargetedBuffEffect(
  effect: Pick<SkillEffectDef, 'type' | 'target' | 'targetRule'>,
  actor: CombatantState,
): boolean {
  if (effect.type !== 'buff') return false;
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
  if (
    !isAllyTargetedHealEffect(effect, actor) &&
    !isAllyTargetedBuffEffect(effect, actor)
  ) {
    return base;
  }
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
