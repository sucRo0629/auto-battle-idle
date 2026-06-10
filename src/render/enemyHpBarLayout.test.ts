import { describe, expect, it } from 'vitest';
import {
  computeEnemyHpBarTops,
  defaultEnemyHpBarTop,
  ENEMY_HP_BAR_STACK_OVERLAP,
} from './enemyHpBarLayout.ts';

describe('computeEnemyHpBarTops', () => {
  const scale = 1;
  const spriteSize = 48;
  const baseY = 100;

  it('keeps leftmost (front) bar at default height and stacks right bars upward', () => {
    const tops = computeEnemyHpBarTops(
      [
        { id: 'front', x: 120, y: baseY },
        { id: 'rear', x: 150, y: baseY },
      ],
      scale,
      spriteSize,
    );

    const frontTop = tops.get('front')!;
    const rearTop = tops.get('rear')!;
    expect(frontTop).toBe(defaultEnemyHpBarTop(baseY, scale));
    expect(rearTop).toBeLessThan(frontTop);
    expect(frontTop - rearTop).toBeCloseTo(
      ENEMY_HP_BAR_STACK_OVERLAP * scale,
      0,
    );
  });
});
