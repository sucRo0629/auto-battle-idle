import type { CombatantState, SkillEffectDef, TargetSpec } from '../types.ts';
import { getBattleX } from '../combatPosition.ts';
import { defaultFacingSign } from '../combatFacing.ts';
import { engagedMinBodyGap } from '../battleConstants.ts';
import { partyFormationDepthPx } from '../partyFormation.ts';
import {
  getEffectTarget,
  getTargetPool,
  isMultiTargetSpec,
  targetSpecFaction,
} from './targetSpec.ts';

/**
 * 敵対接近・攻撃の実効射程。宣言値を footprint（`engagedMinBodyGap`）未満にしない。
 * 隊形順・分類の正本は raw `traits.rangePx` のまま（加算ではなく下限）。
 */
export function resolveHostileEngageRangePx(declaredRangePx: number): number {
  return Math.max(declaredRangePx, engagedMinBodyGap());
}

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

/** 向き前方への距離（正 = 前方）。`facingSign` 省略時は既定向き */
export function forwardDistancePx(
  actor: CombatantState,
  target: CombatantState,
  facingSign?: number,
): number {
  const sign = facingSign ?? defaultFacingSign(actor);
  return sign * (getBattleX(target) - getBattleX(actor));
}

/** 使用者の向いている方向の前方セグメント内か */
export function isInForwardSegment(
  actor: CombatantState,
  target: CombatantState,
  rangePx: number,
  facingSign?: number,
): boolean {
  if (actor.id === target.id) return true;
  const forward = forwardDistancePx(actor, target, facingSign);
  if (forward < 0) return false;
  return forward <= rangePx;
}

export function isWithinSkillRange(
  actor: CombatantState,
  target: CombatantState,
  rangePx: number,
): boolean {
  if (actor.id === target.id) return true;
  return Math.abs(getBattleX(actor) - getBattleX(target)) <= rangePx;
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

/** 味方回復はパーティ奥行きまで届くよう射程を底上げ。それ以外は body gap 下限 */
export function resolveSkillRangePx(
  actor: CombatantState,
  effect: Pick<SkillEffectDef, 'range' | 'type' | 'target' | 'targetRule'>,
  livingAllyCount: number = DEFAULT_PARTY_SIZE_FOR_HEAL_RANGE,
): number {
  const base = effect.range ?? actor.traits.rangePx;
  if (
    isAllyTargetedHealEffect(effect, actor) ||
    isAllyTargetedBuffEffect(effect, actor)
  ) {
    const partyDepth = partyFormationDepthPx(
      Math.max(1, livingAllyCount),
    );
    return Math.max(base, partyDepth);
  }
  return resolveHostileEngageRangePx(base);
}

export function getAttackablePool(
  spec: TargetSpec,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  rangePx: number,
  gameData?: Pick<import('../types.ts').GameData, 'skillRegistry' | 'combatModuleRegistry'>,
): CombatantState[] {
  const pool = getTargetPool(spec, actor, allies, enemies, gameData);
  if (spec.kind === 'self' || isMultiTargetSpec(spec)) {
    return pool;
  }
  return pool.filter((unit) => isWithinSkillRange(actor, unit, rangePx));
}
