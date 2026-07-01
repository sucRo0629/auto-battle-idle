import { describe, expect, it } from 'vitest';
import {
  computeEnemyHudCardStackFootprint,
  ENEMY_HUD_CARD_HEIGHT,
  ENEMY_HUD_CARD_STACK_OFFSET_X,
  ENEMY_HUD_CARD_STACK_OFFSET_Y,
  ENEMY_HUD_CARD_WIDTH,
  ENEMY_HUD_MAX_VISIBLE_STACK,
  enemyHudCardStackOffset,
  resolveEnemyHudCardStackLayout,
} from './enemyHudCardStack.ts';

describe('resolveEnemyHudCardStackLayout', () => {
  it('shows one card for solo enemies', () => {
    const layout = resolveEnemyHudCardStackLayout(1);
    expect(layout.visibleCount).toBe(1);
    expect(layout.hiddenCount).toBe(0);
    expect(layout.footprint).toEqual({
      width: ENEMY_HUD_CARD_WIDTH,
      height: ENEMY_HUD_CARD_HEIGHT,
    });
  });

  it('stacks up to maxVisible cards and reports hidden count', () => {
    const layout = resolveEnemyHudCardStackLayout(5);
    expect(layout.visibleCount).toBe(ENEMY_HUD_MAX_VISIBLE_STACK);
    expect(layout.hiddenCount).toBe(2);
    expect(layout.footprint).toEqual(
      computeEnemyHudCardStackFootprint(ENEMY_HUD_MAX_VISIBLE_STACK),
    );
  });

  it('offsets back cards down-right from front', () => {
    expect(enemyHudCardStackOffset(0)).toEqual({ x: 0, y: 0 });
    expect(enemyHudCardStackOffset(2)).toEqual({
      x: ENEMY_HUD_CARD_STACK_OFFSET_X * 2,
      y: ENEMY_HUD_CARD_STACK_OFFSET_Y * 2,
    });
    const footprint = computeEnemyHudCardStackFootprint(3);
    expect(footprint.height).toBe(
      ENEMY_HUD_CARD_HEIGHT + 2 * ENEMY_HUD_CARD_STACK_OFFSET_Y,
    );
  });
});
