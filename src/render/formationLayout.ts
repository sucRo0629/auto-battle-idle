import type { CombatantState, GameData } from '../battle/types.ts';
import { resolveMaxEffectiveRangePx } from '../battle/combatPosition.ts';
import {
  SPRITE_LAYOUT_SIZE,
  spriteSheetMaxOverflowTop,
} from './spriteLayout.ts';
import { VISUAL_DEPTH_TOP_PAD_PX } from './spriteVisualDepth.ts';

export { CANVAS_W, SPRITE_GAP, SPRITE_WIDTH } from '../battle/battleConstants.ts';

export const ENEMY_VISIBLE_MIN_X = -32;

/** 草タイル描画帯の高さ（HUD に隠れる前提で最小化） */
export const GRASS_BAND_H = 12;
/** @deprecated GRASS_BAND_H と同義（旧 HUD 込み下端余白） */
export const BATTLE_GROUND_MARGIN = GRASS_BAND_H;
const BASE_BATTLE_TOP_PAD = 43;
export const BATTLE_TOP_PAD =
  BASE_BATTLE_TOP_PAD + spriteSheetMaxOverflowTop() + VISUAL_DEPTH_TOP_PAD_PX;
export const STATUS_BADGE_H = 8;
export const STATUS_BADGE_GAP = 2;

export interface VisualCombatant {
  battleX: number;
  isAlive: boolean;
  rangePx: number;
}

/** 戦闘フィールドのみのキャンバス高さ（HUD 領域は含まない） */
export function battleCanvasHeight(spriteScale: number): number {
  return BATTLE_TOP_PAD + SPRITE_LAYOUT_SIZE * spriteScale + GRASS_BAND_H;
}

export function groundLineY(canvasHeight: number): number {
  return canvasHeight - GRASS_BAND_H;
}

export function groundY(canvasHeight: number, scale: number): number {
  return groundLineY(canvasHeight) - SPRITE_LAYOUT_SIZE * scale;
}

export function toVisualCombatant(
  unit: CombatantState,
  gameData: GameData,
): VisualCombatant {
  return {
    battleX: unit.battleX,
    isAlive: unit.isAlive,
    rangePx: resolveMaxEffectiveRangePx(unit, gameData),
  };
}
