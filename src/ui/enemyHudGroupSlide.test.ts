import { describe, expect, it } from 'vitest';
import {
  computeSlideDelta,
  hasEnemyHudGroupOrderChanged,
  shouldAnimateEnemyHudGroupSlide,
} from './enemyHudGroupSlide.ts';

describe('enemyHudGroupSlide', () => {
  it('computes delta from before/after screen positions', () => {
    expect(
      computeSlideDelta({ left: 120, top: 60 }, { left: 80, top: 60 }),
    ).toEqual({ x: 40, y: 0 });
    expect(
      computeSlideDelta({ left: 40, top: 70 }, { left: 40, top: 58 }),
    ).toEqual({ x: 0, y: 12 });
  });

  it('skips sub-pixel jitter', () => {
    expect(shouldAnimateEnemyHudGroupSlide({ x: 0.5, y: 0 })).toBe(false);
    expect(shouldAnimateEnemyHudGroupSlide({ x: 4, y: 0 })).toBe(true);
  });

  it('detects group order changes only when ids or order differ', () => {
    expect(hasEnemyHudGroupOrderChanged(['a', 'b'], ['a', 'b'])).toBe(false);
    expect(hasEnemyHudGroupOrderChanged(['a', 'b'], ['a', 'b', 'c'])).toBe(true);
    expect(hasEnemyHudGroupOrderChanged(['a', 'b', 'c'], ['a', 'c'])).toBe(true);
    expect(hasEnemyHudGroupOrderChanged(['a', 'b'], ['b', 'a'])).toBe(true);
  });
});
