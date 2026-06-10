import type { FormationRow } from './types.ts';
import { SPRITE_LAYOUT_SIZE } from '../render/spriteLayout.ts';

/** 戦闘キャンバス幅（px） */
export const CANVAS_W = 480;
/** 接敵カメラの画面中央（px） */
export const COMBAT_CAMERA_CENTER_X = CANVAS_W / 2;

/**
 * 新軸: 左=後方、右=前方。back < middle < front。
 * 理想 visual / 非接敵 battle 配置の列基準。
 */
export const ROW_X: Record<FormationRow, number> = {
  back: 60,
  middle: 120,
  front: 180,
};

export const PLAYER_ROW_SPACING = 42;
/** 前衛列と後列の X 差（後列 − 前衛） */
export const PLAYER_FORMATION_DEPTH = ROW_X.back - ROW_X.front;

/** @deprecated PLAYER_ROW_SPACING */
export const ALLY_ROW_SPACING = PLAYER_ROW_SPACING;
/** @deprecated PLAYER_FORMATION_DEPTH（符号は旧仕様互換のため back−front のまま） */
export const ALLY_FORMATION_BACK_DEPTH = ROW_X.back - ROW_X.front;

export const SPRITE_WIDTH = SPRITE_LAYOUT_SIZE;
export const SPRITE_GAP = 38;

/** 非戦闘時: 背景スクロール・進軍速度（px/秒） */
export const SCROLL_SPEED = 160;
/** 接敵後: 攻撃可能位置への接近速度（px/秒） */
export const APPROACH_SPEED = 200;

/** 敵 spawnX の前方（右）下限 */
export const BATTLE_ENEMY_SPAWN_MIN_X = CANVAS_W + 40;
/** 進軍中スプライト表示の前方上限（右外から左進軍） */
export const BATTLE_ENEMY_MARCH_VISIBLE_MAX_X = CANVAS_W + 200;
/** 画面内とみなす battleX の前方上限 */
export const BATTLE_ENEMY_VISIBLE_MAX_X = CANVAS_W + 32;
/** 進軍中スプライト表示の後方（左）下限 */
export const BATTLE_ENEMY_MARCH_VISIBLE_MIN_X = -40;

/** 接敵ビジュアル調整 */
export const ENGAGED_VISUAL_TUNING = {
  bodyClearancePx: -20,
  frontLineGapPx: 0,
  leadingRowAdvanceT: 0.8,
  engageMoveSpeedPxPerSec: 100,
} as const;

export function engagedMinBodyGap(): number {
  return SPRITE_WIDTH + ENGAGED_VISUAL_TUNING.bodyClearancePx;
}

export function engagedFrontLineGap(): number {
  const tuned = ENGAGED_VISUAL_TUNING.frontLineGapPx;
  if (tuned > 0) return tuned;
  return engagedMinBodyGap();
}

export function engagedStandoffGap(
  playerRangePx: number,
  enemyRangePx: number,
): number {
  return Math.max(
    Math.min(playerRangePx, enemyRangePx),
    engagedMinBodyGap(),
  );
}

/** 敵遠距離: 近接前線からの奥行き（プレイヤー前衛–後列と同程度） */
export function enemyRangedRearGap(): number {
  return Math.abs(PLAYER_FORMATION_DEPTH);
}

/** 敵進軍が止まり接敵が始まる gap（プレイヤー接触点から前方側の距離） */
export function resolveEnemyMarchEngageGap(
  playerRangePx: number,
  enemyRangePx: number,
): number {
  if (enemyRangePx > 0) {
    return Math.max(enemyRangePx, engagedMinBodyGap());
  }
  return engagedStandoffGap(playerRangePx, enemyRangePx);
}

export const PLAYER_VISUAL_MIN_GAP = engagedMinBodyGap();

/** 旧負の spawnX を新軸の正値へ変換 */
export function normalizeSpawnX(spawnX: number): number {
  if (spawnX < 0) {
    return CANVAS_W + Math.abs(spawnX);
  }
  return spawnX;
}
