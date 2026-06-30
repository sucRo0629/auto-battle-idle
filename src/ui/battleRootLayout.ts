import {
  BATTLE_ROOT_HEIGHT,
  BATTLE_ROOT_WIDTH,
} from "./battleRootScale.ts";

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

export function battleRootRectStyle(rect: BattleRootRect): string {
  return [
    `left:${rect.x}px`,
    `top:${rect.y}px`,
    `width:${rect.w}px`,
    `height:${rect.h}px`,
  ].join(";");
}
