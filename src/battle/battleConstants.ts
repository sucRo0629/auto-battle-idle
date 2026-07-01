import type { FormationRow } from './types.ts';
import { PARTY_DEPLOY_TARGET_DURATION_SEC } from '../render/announcementOverlayTiming.ts';
import { SPRITE_LAYOUT_SIZE } from '../render/spriteLayout.ts';

/** 旧 480px 幅時代の戦闘ゾーン幾何（接敵 gap 維持の基準） */
const LEGACY_CANVAS_W = 480;
const LEGACY_COMBAT_CENTER_X = LEGACY_CANVAS_W / 2;
const LEGACY_PARTY_FORMATION_LEFT_ANCHOR = 20;

/** 戦闘キャンバス幅（px）— 1280×720 中央レーンに合わせて拡大 */
export const CANVAS_W = 704;
const COMBAT_ZONE_SIDE_PADDING = (CANVAS_W - LEGACY_CANVAS_W) / 2;

/** 画面中央（敵 spawn オフセット基準） */
export const COMBAT_CAMERA_CENTER_X =
  LEGACY_COMBAT_CENTER_X + COMBAT_ZONE_SIDE_PADDING;

/** 味方隊列: 最後列（左端）の battleX */
export const PARTY_FORMATION_LEFT_ANCHOR =
  LEGACY_PARTY_FORMATION_LEFT_ANCHOR + COMBAT_ZONE_SIDE_PADDING;
/** 味方隊列: スロット間隔（px） */
export const PARTY_FORMATION_SLOT_SPACING = 32;

/** 周囲 aura 既定半径（障身法 AoE / 護法陣 / 援護系と同値） */
export const DEFAULT_SURROUND_AURA_RADIUS_PX = 50;

/** 敵 spawnX: 画面中心からの右オフセット上限（接敵 gap 維持のため legacy 240px 固定） */
export const SPAWN_X_MAX = LEGACY_COMBAT_CENTER_X;

export const SPRITE_WIDTH = SPRITE_LAYOUT_SIZE;
export const SPRITE_GAP = 38;

/** 1秒あたりの戦闘移動量（px）。120 なら 1秒で 120px 進む。 */
export const MOVE_PX_PER_SEC = 120;

/** deltaTime（秒）分の移動量（px） */
export function moveDeltaPx(
  pxPerSec: number,
  deltaSec: number,
): number {
  return pxPerSec * deltaSec;
}

/** PartyDeploy 進軍距離（px）— 速度変更時も配置完了が告知 fade-out 開始に揃う */
export function resolvePartyDeployTravelPx(
  pxPerSec: number = MOVE_PX_PER_SEC,
): number {
  return pxPerSec * PARTY_DEPLOY_TARGET_DURATION_SEC;
}

/** 画面内とみなす battleX の前方上限 */
export const BATTLE_ENEMY_VISIBLE_MAX_X = CANVAS_W + 32;
/** 進軍中スプライト表示の後方（左）下限 */
export const BATTLE_ENEMY_MARCH_VISIBLE_MIN_X = -40;
/** PartyDeploy 中: 味方が画面外左にいる間は非表示 */
export const BATTLE_ALLY_MARCH_VISIBLE_MIN_X = -40;

/** @deprecated カメラ廃止後は battleX 直 clamp 用に残す */
export const BATTLE_ENEMY_MARCH_VISIBLE_MAX_X = CANVAS_W + 200;

/** 接敵ビジュアル調整 */
export const ENGAGED_VISUAL_TUNING = {
  /** 0 = レイアウト箱同士が接する。負値は意図的重なり */
  bodyClearancePx: 0,
  /** 0 = engagedMinBodyGap を味方最前列↔敵最前列 gap に使用 */
  frontLineGapPx: 0,
  /** 接敵時に前列が敵側へ寄るブレンド率（低いほど隊形を維持） */
  leadingRowAdvanceT: 0.65,
  engageMoveSpeedPxPerSec: MOVE_PX_PER_SEC,
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

/** 敵遠距離: 近接前線からの奥行き（味方隊列深度と同程度） */
export function enemyRangedRearGap(partySize: number = 5): number {
  return Math.max(0, partySize - 1) * PARTY_FORMATION_SLOT_SPACING;
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

/** stages.json spawnX（中心からの右オフセット）→ battleX */
export function resolveEnemySpawnBattleX(spawnOffset: number): number {
  const clamped = Math.max(0, Math.min(spawnOffset, SPAWN_X_MAX));
  return COMBAT_CAMERA_CENTER_X + clamped;
}

/** @deprecated engage layout 移行中の互換（配置正本は partyFormation） */
export const ROW_X: Record<FormationRow, number> = {
  back: PARTY_FORMATION_LEFT_ANCHOR,
  front: PARTY_FORMATION_LEFT_ANCHOR + PARTY_FORMATION_SLOT_SPACING,
};
/** @deprecated */
export const PLAYER_ROW_SPACING = PARTY_FORMATION_SLOT_SPACING;
/** @deprecated */
export const ALLY_ROW_SPACING = PLAYER_ROW_SPACING;
/** @deprecated */
export const PLAYER_FORMATION_DEPTH =
  PARTY_FORMATION_SLOT_SPACING;
/** @deprecated */
export const ALLY_FORMATION_BACK_DEPTH = PLAYER_FORMATION_DEPTH;
