import { getBattleX } from './combatPosition.ts';
import { isWithinSkillRange } from './skills/rangeUtils.ts';
import type { CombatantState } from './types.ts';

/** 射程内の敵密度が最大となる battleX（クラスタ中心） */
export function resolveEnemyClusterCenterX(
  actor: CombatantState,
  enemies: CombatantState[],
  rangePx: number,
  clusterRadiusPx = 70,
): number | null {
  const inRange = enemies.filter(
    (enemy) =>
      enemy.isAlive && isWithinSkillRange(actor, enemy, rangePx),
  );
  if (inRange.length === 0) return null;

  let bestX = getBattleX(inRange[0]!);
  let bestCount = 0;
  for (const anchor of inRange) {
    const ax = getBattleX(anchor);
    const count = inRange.filter(
      (enemy) => Math.abs(getBattleX(enemy) - ax) <= clusterRadiusPx,
    ).length;
    if (count > bestCount) {
      bestCount = count;
      bestX = ax;
    }
  }
  return bestX;
}
