import {
  enemyHudLeftEdge,
  partyHudRightEdge,
} from '../ui/battleHudGeometry.ts';

/** HUD パネル外縁とユニット配置帯の間隔（px） */
export const COMBAT_SAFE_AREA_HUD_GAP = 48;

/** 左右 HUD を避けたユニット配置・接敵の左端（battleX） */
export const COMBAT_SAFE_LEFT =
  partyHudRightEdge() + COMBAT_SAFE_AREA_HUD_GAP;

/** 左右 HUD を避けたユニット配置・接敵の右端（battleX） */
export const COMBAT_SAFE_RIGHT =
  enemyHudLeftEdge() - COMBAT_SAFE_AREA_HUD_GAP;

export const COMBAT_SAFE_WIDTH = COMBAT_SAFE_RIGHT - COMBAT_SAFE_LEFT;

/** 安全領域の中央（敵 spawn オフセット基準） */
export const COMBAT_SAFE_CENTER_X =
  (COMBAT_SAFE_LEFT + COMBAT_SAFE_RIGHT) / 2;

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
