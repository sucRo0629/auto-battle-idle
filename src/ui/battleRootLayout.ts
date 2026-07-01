import {
  BATTLE_ROOT_HEIGHT,
  BATTLE_ROOT_WIDTH,
} from "./battleRootScale.ts";
import {
  BATTLE_CANVAS_HEIGHT,
  BATTLE_LANE_TOP_INSET,
} from "../battle/battleConstants.ts";
import {
  BATTLE_FIELD_SPRITE_SCALE,
  battleCanvasHeight,
} from "../render/formationLayout.ts";
import {
  BATTLE_HUD_OVERLAY_CARD_PAD_X,
  BATTLE_HUD_SIDE_MARGIN,
  BATTLE_HUD_STATUS_WRAP_PAD_X,
  BATTLE_SIDE_HUD_WIDTH,
  computeBattleSideHudWidth,
} from "./battleHudGeometry.ts";

export {
  BATTLE_HUD_OVERLAY_CARD_PAD_X,
  BATTLE_HUD_SIDE_MARGIN,
  BATTLE_HUD_STATUS_WRAP_PAD_X,
  BATTLE_SIDE_HUD_WIDTH,
  computeBattleSideHudWidth,
} from "./battleHudGeometry.ts";

export interface BattleRootRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const BATTLE_BACKGROUND_RECT: BattleRootRect = {
  x: 0,
  y: 0,
  w: BATTLE_ROOT_WIDTH,
  h: BATTLE_ROOT_HEIGHT,
};

/** Top inset of battle lane below topInfo (px). */
export const BATTLE_LANE_TOP = BATTLE_LANE_TOP_INSET;

/** Full-bleed battle lane: HUD はオーバーレイ、キャンバスは root 全幅・高さを使う */
export const BATTLE_LANE_RECT: BattleRootRect = {
  x: 0,
  y: BATTLE_LANE_TOP,
  w: BATTLE_ROOT_WIDTH,
  h: BATTLE_CANVAS_HEIGHT,
};

export const BATTLE_TOP_INFO_RECT: BattleRootRect = {
  x: 24,
  y: 16,
  w: 1232,
  h: 40,
};

export const PARTY_HUD_SLOT_RECT: BattleRootRect = {
  x: BATTLE_HUD_SIDE_MARGIN,
  y: 64,
  w: BATTLE_SIDE_HUD_WIDTH,
  h: 608,
};

/** Fixed ally card height inside partyHud (battle-field.md §8). */
export const PARTY_HUD_ALLY_CARD_HEIGHT = 146;

/** Vertical gap between ally cards inside partyHud. */
export const PARTY_HUD_ALLY_CARD_GAP = 8;

export const ENEMY_HUD_SLOT_RECT: BattleRootRect = {
  x: BATTLE_ROOT_WIDTH - BATTLE_HUD_SIDE_MARGIN - BATTLE_SIDE_HUD_WIDTH,
  y: 64,
  w: BATTLE_SIDE_HUD_WIDTH,
  h: 608,
};

/** Fixed enemy row height inside enemyHud (battle-field.md §8.8). */
export const ENEMY_HUD_SLOT_HEIGHT = 52;

/** Vertical gap between enemy rows inside enemyHud. */
export const ENEMY_HUD_SLOT_GAP = 6;

/** Maximum enemy rows shown in the enemyHud list. */
export const ENEMY_HUD_MAX_SLOTS = 10;

/** Top + bottom inset inside the enemyHud panel frame (px). */
export const ENEMY_HUD_PANEL_FRAME_PADDING = 8;

/** Visible enemyHud panel height for `aliveCount` living enemies (0 when empty). */
export function computeEnemyHudPanelHeight(aliveCount: number): number {
  if (aliveCount <= 0) return 0;
  return (
    ENEMY_HUD_PANEL_FRAME_PADDING +
    aliveCount * ENEMY_HUD_SLOT_HEIGHT +
    (aliveCount - 1) * ENEMY_HUD_SLOT_GAP
  );
}

/** battle-x-debug panel top — left column, aligned with partyHud slot. */
export const BATTLE_X_DEBUG_PANEL_TOP = PARTY_HUD_SLOT_RECT.y;

/** battle lane 下端（キャンバス下端）の battle-root Y */
export function battleHudToolbarTopY(
  spriteScale = BATTLE_FIELD_SPRITE_SCALE,
): number {
  return BATTLE_LANE_RECT.y + battleCanvasHeight(spriteScale);
}

/** Max CSS display width for battle-x-debug canvas (partyHud column). */
export function battleXDebugCanvasMaxDisplayWidth(
  panelPaddingHorizontalPx = 8,
): number {
  return PARTY_HUD_SLOT_RECT.w - panelPaddingHorizontalPx;
}

/** Max CSS display height for battle-x-debug canvas (no scroll; lane ceiling). */
export function battleXDebugCanvasMaxDisplayHeight(
  panelPaddingTopPx = 4,
): number {
  return (
    battleHudToolbarTopY() - BATTLE_X_DEBUG_PANEL_TOP - panelPaddingTopPx
  );
}

export function battleRootRectStyle(rect: BattleRootRect): string {
  return [
    `left:${rect.x}px`,
    `top:${rect.y}px`,
    `width:${rect.w}px`,
    `height:${rect.h}px`,
  ].join(";");
}
