import type { CombatantState } from "./types.ts";
import { getBattleX } from "./combatPosition.ts";

/** 既定向き: 味方 +X（右） / 敵 −X（左） */
export function defaultFacingSign(unit: CombatantState): number {
  return unit.isEnemy ? -1 : 1;
}

/** 既定向きの背後にいる敵対 target か（接敵ルールは変えず向き判定のみ） */
export function isHostileBehindDefaultForward(
  actor: CombatantState,
  target: CombatantState,
): boolean {
  if (actor.id === target.id) return false;
  const delta = getBattleX(target) - getBattleX(actor);
  return defaultFacingSign(actor) * delta < 0;
}

/** AttackTarget 等の focus が背後なら向き反転 */
export function resolveFacingSign(
  actor: CombatantState,
  focusTarget: CombatantState | null | undefined,
): number {
  const defaultSign = defaultFacingSign(actor);
  if (!focusTarget || focusTarget.id === actor.id) return defaultSign;
  if (isHostileBehindDefaultForward(actor, focusTarget)) {
    return -defaultSign;
  }
  return defaultSign;
}
