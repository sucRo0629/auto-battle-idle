import { enemyRangedRearGap } from './battleConstants.ts';
import {
  clampEngagedEnemyGroupOnScreen,
  type EngagedLayoutResult,
} from './battleLayout.ts';

/** 接敵開始時に1回だけ: layout 結果 + clamp + ranged rear gap を適用した敵 visualX 目標 */
export function resolveEnemyEngageVisualTargets(
  layout: EngagedLayoutResult,
  enemies: Array<{ id: string; isAlive: boolean; rangePx: number }>,
  _combatCameraX: number = 0,
): Map<string, number> {
  const ideals = enemies
    .filter((enemy) => enemy.isAlive)
    .map((enemy) => ({
      id: enemy.id,
      visualX: layout.enemyVisualX.get(enemy.id) ?? 0,
      isAlive: true as const,
    }));
  const clamped = clampEngagedEnemyGroupOnScreen(ideals);

  let maxMeleeVisualX = Number.NEGATIVE_INFINITY;
  for (const enemy of enemies) {
    if (!enemy.isAlive || enemy.rangePx > 0) continue;
    const x = clamped.get(enemy.id);
    if (x !== undefined) {
      maxMeleeVisualX = Math.max(maxMeleeVisualX, x);
    }
  }

  const targets = new Map<string, number>();
  const rangedRearCap = Number.isFinite(maxMeleeVisualX)
    ? maxMeleeVisualX + enemyRangedRearGap()
    : null;

  for (const enemy of enemies) {
    if (!enemy.isAlive) continue;
    let x = clamped.get(enemy.id);
    if (x === undefined) continue;
    if (rangedRearCap !== null && enemy.rangePx > 0 && x < rangedRearCap) {
      x = rangedRearCap;
    }
    targets.set(enemy.id, x);
  }
  return targets;
}
