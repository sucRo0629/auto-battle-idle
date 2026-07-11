import { describe, expect, it } from 'vitest';
import {
  computeEnemyHudCardStackFootprint,
  computeEnemyHudExpandedFootprint,
  ENEMY_HUD_CARD_EXPAND_GAP,
  ENEMY_HUD_CARD_HEIGHT,
  ENEMY_HUD_CARD_STACK_OFFSET_X,
  ENEMY_HUD_CARD_STACK_OFFSET_Y,
  ENEMY_HUD_CARD_WIDTH,
  ENEMY_HUD_MAX_VISIBLE_STACK,
  enemyHudCardStackOffset,
  enemyHudExpandedCardOffset,
  enemyHudHpTrackLeftInCard,
  ENEMY_HUD_HP_TRACK_LEFT_IN_CARD,
  ENEMY_HUD_HP_TRACK_WIDTH,
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

  it('insets HP tracks from each card left edge', () => {
    expect(ENEMY_HUD_HP_TRACK_WIDTH).toBe(97);
    expect(ENEMY_HUD_HP_TRACK_LEFT_IN_CARD).toBe(34);
    expect(enemyHudHpTrackLeftInCard(0)).toBe(34);
    expect(enemyHudHpTrackLeftInCard(1)).toBe(34);
    expect(enemyHudHpTrackLeftInCard(2)).toBe(34);
  });
});

describe('expanded enemy group layout', () => {
  it('lays cards out vertically without stack overlap', () => {
    expect(enemyHudExpandedCardOffset(0)).toEqual({ x: 0, y: 0 });
    expect(enemyHudExpandedCardOffset(2)).toEqual({
      x: 0,
      y: 2 * (ENEMY_HUD_CARD_HEIGHT + ENEMY_HUD_CARD_EXPAND_GAP),
    });
  });

  it('computes expanded footprint from member count', () => {
    expect(computeEnemyHudExpandedFootprint(1)).toEqual({
      width: ENEMY_HUD_CARD_WIDTH,
      height: ENEMY_HUD_CARD_HEIGHT,
    });
    expect(computeEnemyHudExpandedFootprint(3)).toEqual({
      width: ENEMY_HUD_CARD_WIDTH,
      height: 3 * ENEMY_HUD_CARD_HEIGHT + 2 * ENEMY_HUD_CARD_EXPAND_GAP,
    });
  });
});
