/** Card-stack layout for top enemy HUD groups (battle-field.md §8.8 Phase 3 Task 2). */

/** Compact enemy card width (px). */
export const ENEMY_HUD_CARD_WIDTH = 136;

/** Full enemy card height — HP row pinned to bottom (px). */
export const ENEMY_HUD_CARD_HEIGHT = 52;

/** Per-card offset when stacking — back cards peek below-right (px). */
export const ENEMY_HUD_CARD_STACK_OFFSET_X = 8;
export const ENEMY_HUD_CARD_STACK_OFFSET_Y = 8;

/** Card chrome padding — matches enemy-hud-overlay.css `.enemy-hud-card`. */
export const ENEMY_HUD_CARD_PAD_LEFT = 6;
export const ENEMY_HUD_CARD_PAD_RIGHT = 5;
export const ENEMY_HUD_CARD_PAD_BOTTOM = 3;
export const ENEMY_HUD_CARD_BODY_GAP = 4;
export const ENEMY_HUD_ICON_COLUMN_WIDTH = 24;

/** Shared HP track width — body column beside the 24px icon (px). */
export const ENEMY_HUD_HP_TRACK_WIDTH =
  ENEMY_HUD_CARD_WIDTH -
  ENEMY_HUD_CARD_PAD_LEFT -
  ENEMY_HUD_CARD_PAD_RIGHT -
  ENEMY_HUD_ICON_COLUMN_WIDTH -
  ENEMY_HUD_CARD_BODY_GAP;

/** Front-card HP track inset from card left edge (px). */
export const ENEMY_HUD_HP_TRACK_LEFT_IN_CARD =
  ENEMY_HUD_CARD_PAD_LEFT +
  ENEMY_HUD_ICON_COLUMN_WIDTH +
  ENEMY_HUD_CARD_BODY_GAP;

/** HP track inset from each card's left edge (px) — follows card stack offset. */
export function enemyHudHpTrackLeftInCard(_depth = 0): number {
  return ENEMY_HUD_HP_TRACK_LEFT_IN_CARD;
}

/** Visible stacked cards before +N overflow (back cards omitted). */
export const ENEMY_HUD_MAX_VISIBLE_STACK = 3;

export interface EnemyHudCardStackFootprint {
  width: number;
  height: number;
}

export interface EnemyHudCardStackLayout {
  visibleCount: number;
  hiddenCount: number;
  footprint: EnemyHudCardStackFootprint;
}

export function resolveEnemyHudCardStackLayout(
  memberCount: number,
  maxVisible = ENEMY_HUD_MAX_VISIBLE_STACK,
): EnemyHudCardStackLayout {
  const safeCount = Math.max(0, memberCount);
  const visibleCount = Math.min(safeCount, maxVisible);
  const hiddenCount = Math.max(0, safeCount - visibleCount);
  return {
    visibleCount,
    hiddenCount,
    footprint: computeEnemyHudCardStackFootprint(visibleCount),
  };
}

export function computeEnemyHudCardStackFootprint(
  visibleStackCount: number,
): EnemyHudCardStackFootprint {
  const n = Math.max(1, visibleStackCount);
  return {
    width:
      ENEMY_HUD_CARD_WIDTH + (n - 1) * ENEMY_HUD_CARD_STACK_OFFSET_X,
    height:
      ENEMY_HUD_CARD_HEIGHT + (n - 1) * ENEMY_HUD_CARD_STACK_OFFSET_Y,
  };
}

/** depth 0 = front (top-left); higher = further back, offset down-right. */
export function enemyHudCardStackOffset(depth: number): { x: number; y: number } {
  return {
    x: depth * ENEMY_HUD_CARD_STACK_OFFSET_X,
    y: depth * ENEMY_HUD_CARD_STACK_OFFSET_Y,
  };
}
