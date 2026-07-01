import {
  BATTLE_HUD_SIDE_MARGIN,
  combatSafeRightScreenEdge,
} from '../ui/battleHudGeometry.ts';
import {
  BATTLE_CANVAS_HEIGHT,
  BATTLE_GROUND_LINE_SCREEN_Y,
  BATTLE_LANE_TOP,
} from '../ui/battleRootLayout.ts';

/** 草タイル帯の高さ — `formationLayout.GRASS_BAND_H` と同値（import 循環回避） */
const GRASS_BAND_H = 24;

/** HUD パネル外縁とユニット配置帯の間隔（px） */
export const COMBAT_SAFE_AREA_HUD_GAP = 48;

/** ユニット配置・接敵の左端（battleX）— 画面左マージン + gap（下部 partyHud は戦場横幅に含めない） */
export const COMBAT_SAFE_LEFT =
  BATTLE_HUD_SIDE_MARGIN + COMBAT_SAFE_AREA_HUD_GAP;

/** ユニット配置・接敵の右端（battleX）— 画面右マージン − gap（右 HUD 列なし） */
export const COMBAT_SAFE_RIGHT =
  combatSafeRightScreenEdge() - COMBAT_SAFE_AREA_HUD_GAP;

export const COMBAT_SAFE_WIDTH = COMBAT_SAFE_RIGHT - COMBAT_SAFE_LEFT;

/** 安全領域の中央（敵 spawn オフセット基準） */
export const COMBAT_SAFE_CENTER_X =
  (COMBAT_SAFE_LEFT + COMBAT_SAFE_RIGHT) / 2;

/** battle-root screen Y: battleLane 上端（上部 enemyHud 下端） */
export const COMBAT_SAFE_SCREEN_TOP_Y = BATTLE_LANE_TOP;

/** battle-root screen Y: 草ライン（下部 partyHud 直上） */
export const COMBAT_SAFE_SCREEN_GROUND_Y = BATTLE_GROUND_LINE_SCREEN_Y;

/** battleLane 内キャンバス高さ（px）— 上部 enemyHud / 下部 partyHud を除いた縦帯 */
export const COMBAT_SAFE_CANVAS_HEIGHT = BATTLE_CANVAS_HEIGHT;

/** キャンバス座標の地面ライン Y */
export const COMBAT_SAFE_CANVAS_GROUND_LINE_Y =
  BATTLE_CANVAS_HEIGHT - GRASS_BAND_H;

/** ダメージポップ等の水平表示を HUD 裏に入れないよう clamp */
export function clampCombatDisplayX(
  battleX: number,
  halfWidthPx = 0,
): number {
  const min = COMBAT_SAFE_LEFT + halfWidthPx;
  const max = COMBAT_SAFE_RIGHT - halfWidthPx;
  if (min >= max) return COMBAT_SAFE_CENTER_X;
  return Math.max(min, Math.min(max, battleX));
}

/** ダメージポップ等の垂直表示を battleLane 外へはみ出さないよう clamp（キャンバス座標） */
export function clampCombatDisplayY(
  canvasY: number,
  halfHeightPx = 0,
): number {
  const minY = halfHeightPx;
  const maxY = COMBAT_SAFE_CANVAS_GROUND_LINE_Y - halfHeightPx;
  if (minY >= maxY) {
    return COMBAT_SAFE_CANVAS_GROUND_LINE_Y / 2;
  }
  return Math.max(minY, Math.min(maxY, canvasY));
}
