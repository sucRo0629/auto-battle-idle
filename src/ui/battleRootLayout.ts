import {
  BATTLE_ROOT_HEIGHT,
  BATTLE_ROOT_WIDTH,
  snapHudCanvasCssSize,
} from "./battleRootScale.ts";
import { battleCanvasHeight } from "../render/formationLayout.ts";
import { PARTY_HUD_STATUS_BADGE_ICON_SIZE } from "../render/statusBadgeRenderer.ts";
import { measurePartyHudOverlayStatusGrid } from "./partyHudOverlayStatusGrid.ts";

export interface BattleRootRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Left / right inset of side HUD columns from the battle-root edge (px). */
export const BATTLE_HUD_SIDE_MARGIN = 24;

/** Horizontal padding inside overlay `.party-hud-status-badges-wrap` (1px per side). */
export const BATTLE_HUD_STATUS_WRAP_PAD_X = 2;

/** Horizontal padding inside overlay `.party-hud-slot` (5px per side). */
export const BATTLE_HUD_OVERLAY_CARD_PAD_X = 10;

/** Side HUD column width — party overlay status icon grid + frame padding. */
export function computeBattleSideHudWidth(
  iconSize = PARTY_HUD_STATUS_BADGE_ICON_SIZE,
  statusIconOutlineWidth = 1,
  statusBadgeOverlap = 0,
): number {
  const grid = measurePartyHudOverlayStatusGrid(
    1,
    iconSize,
    statusIconOutlineWidth,
    statusBadgeOverlap,
  );
  const canvasW = snapHudCanvasCssSize(grid.totalWidth);
  return (
    canvasW + BATTLE_HUD_STATUS_WRAP_PAD_X + BATTLE_HUD_OVERLAY_CARD_PAD_X
  );
}

export const BATTLE_SIDE_HUD_WIDTH = computeBattleSideHudWidth();

export const BATTLE_BACKGROUND_RECT: BattleRootRect = {
  x: 0,
  y: 0,
  w: BATTLE_ROOT_WIDTH,
  h: BATTLE_ROOT_HEIGHT,
};

export const BATTLE_LANE_RECT: BattleRootRect = {
  x: 340,
  y: 80,
  w: 600,
  h: 560,
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

/** battle-hud-toolbar top edge in battle-root coordinates (lane top + field canvas). */
export function battleHudToolbarTopY(spriteScale = 1): number {
  return BATTLE_LANE_RECT.y + battleCanvasHeight(spriteScale);
}

/** Max CSS display width for battle-x-debug canvas (partyHud column). */
export function battleXDebugCanvasMaxDisplayWidth(
  panelPaddingHorizontalPx = 8,
): number {
  return PARTY_HUD_SLOT_RECT.w - panelPaddingHorizontalPx;
}

/** Max CSS display height for battle-x-debug canvas (no scroll; toolbar ceiling). */
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
