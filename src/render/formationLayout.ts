import type { CombatantState, GameData } from '../battle/types.ts';
import { resolveMaxEffectiveRangePx } from '../battle/combatPosition.ts';
import {
  BATTLE_CANVAS_HEIGHT,
  CANVAS_W,
} from '../battle/battleConstants.ts';
import {
  SPRITE_LAYOUT_SIZE,
  spriteSheetMaxOverflowTop,
} from './spriteLayout.ts';
import { VISUAL_DEPTH_TOP_PAD_PX } from './spriteVisualDepth.ts';

export { CANVAS_W, SPRITE_GAP, SPRITE_WIDTH } from '../battle/battleConstants.ts';
export { PARTY_FORMATION_SLOT_SPACING } from '../battle/battleConstants.ts';

export const ENEMY_VISIBLE_MIN_X = -32;

/** 草タイル描画帯の高さ */
export const GRASS_BAND_H = 24;
/** @deprecated GRASS_BAND_H と同義 */
export const BATTLE_GROUND_MARGIN = GRASS_BAND_H;
/** 戦闘フィールド描画スケール（32px スプライトを 2 倍表示） */
export const BATTLE_FIELD_SPRITE_SCALE = 2;

/** 地面ラインより上の空・奥行き余白（スプライト上端オーバーフロー込み） */
export function battleFieldTopPad(spriteScale: number): number {
  const spriteFootprint = SPRITE_LAYOUT_SIZE * spriteScale;
  const minSkyPad =
    spriteSheetMaxOverflowTop() + VISUAL_DEPTH_TOP_PAD_PX + 48;
  const fromGround =
    BATTLE_CANVAS_HEIGHT - GRASS_BAND_H - spriteFootprint;
  return Math.max(minSkyPad, fromGround);
}

/** @deprecated battleFieldTopPad を使用 */
export const BATTLE_TOP_PAD =
  battleFieldTopPad(BATTLE_FIELD_SPRITE_SCALE);

export const STATUS_BADGE_H = 8;
export const STATUS_BADGE_GAP = 2;

export interface VisualCombatant {
  battleX: number;
  isAlive: boolean;
  rangePx: number;
}

/** 戦闘フィールドのみのキャンバス高さ（HUD 領域は含まない） */
export function battleCanvasHeight(spriteScale: number): number {
  void spriteScale;
  return BATTLE_CANVAS_HEIGHT;
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
