import {
  BATTLE_ROOT_HEIGHT,
  BATTLE_ROOT_WIDTH,
} from "./battleRootScale.ts";
import { battleCanvasHeight } from "../render/formationLayout.ts";

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
  x: 24,
  y: 64,
  w: 300,
  h: 608,
};

/** Fixed ally card height inside partyHud (battle-field.md §8). */
export const PARTY_HUD_ALLY_CARD_HEIGHT = 146;

/** Vertical gap between ally cards inside partyHud. */
export const PARTY_HUD_ALLY_CARD_GAP = 8;

export const ENEMY_HUD_SLOT_RECT: BattleRootRect = {
  x: 956,
  y: 64,
  w: 300,
  h: 608,
};

/** Fixed enemy row height inside enemyHud (battle-field.md §8.8). */
export const ENEMY_HUD_SLOT_HEIGHT = 52;

/** Vertical gap between enemy rows inside enemyHud. */
export const ENEMY_HUD_SLOT_GAP = 6;

/** Maximum enemy rows shown in the enemyHud list. */
export const ENEMY_HUD_MAX_SLOTS = 10;

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
