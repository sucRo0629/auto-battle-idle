import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import { SPRITE_LAYOUT_SIZE } from './spriteLayout.ts';
import {
  sortForSpriteDraw,
  type SpriteDrawOrderInput,
} from './spriteDrawOrder.ts';

/** 奥行き 1 段あたりの Y オフセット（スケール 1 基準。描画時に scale を乗算） */
export const VISUAL_DEPTH_STEP_PX = 10;

/** 取りうる最大奥行き段数（4 人編成 → 3 段）。敵群れも同上限 */
export const VISUAL_DEPTH_MAX_STEPS = PARTY_SLOT_COUNT - 1;

/** スプライト Y ずれの上限（px, scale 1） */
export const MAX_VISUAL_DEPTH_OFFSET =
  VISUAL_DEPTH_STEP_PX * VISUAL_DEPTH_MAX_STEPS;

/**
 * 草帯上方向延長に足すモデル占有分（scale 1）。
 * ずらし最大だけでは足りないので、スプライト layout 箱ぶん地面を高くする。
 */
export const GRASS_MODEL_FOOTPRINT_PX = SPRITE_LAYOUT_SIZE;

/**
 * 草タイル上端を上げる量（scale 1）= ずらし最大 + モデル占有。
 * フィールド描画は `maxVisualDepthRisePx(BATTLE_FIELD_SPRITE_SCALE)` を使う。
 */
export const MAX_VISUAL_DEPTH_RISE =
  MAX_VISUAL_DEPTH_OFFSET + GRASS_MODEL_FOOTPRINT_PX;

/** @deprecated GRASS_MODEL_FOOTPRINT_PX を使う */
export const GRASS_DEPTH_MARGIN_PX = GRASS_MODEL_FOOTPRINT_PX;

/** キャンバス上端の余白（スプライト奥行き最大分, scale 1） */
export const VISUAL_DEPTH_TOP_PAD_PX = MAX_VISUAL_DEPTH_OFFSET;

/** 描画スケール込みの最大 Y ずらし（群れ奥行きの上限） */
export function maxVisualDepthOffsetPx(scale: number): number {
  return MAX_VISUAL_DEPTH_OFFSET * scale;
}

/**
 * 空／地面境界用: 最大 Y ずらし + モデル占有（スケール込み）。
 * ずらし幅最大より必ず大きく、草帯上端・空下端・ホライゾンに使う。
 */
export function maxVisualDepthRisePx(scale: number): number {
  return MAX_VISUAL_DEPTH_RISE * scale;
}

/** キャンバス上端余白（スケール込み） */
export function visualDepthTopPadPx(scale: number): number {
  return VISUAL_DEPTH_TOP_PAD_PX * scale;
}

export type VisualDepthLayout = SpriteDrawOrderInput;

export interface AssignVisualDepthOptions {
  /**
   * 敵の depth 割当の正本（倒れた敵を含む Wave 全員）。
   * 未指定時は layouts 内の敵のみ。生存敵の Y は倒れた敵がいても変わらない。
   */
  enemyDepthReference?: readonly VisualDepthLayout[];
}

/** 足元アンカー（battleX ライン）。VFX の論理位置にも使う */
export function spriteFootY(layout: { y: number }): number {
  return layout.y;
}

/** スプライト描画 Y（奥行き分だけ上へ。スケールは変更しない） */
export function spriteDrawY(layout: {
  y: number;
  depthOffsetY?: number;
}): number {
  return layout.y - (layout.depthOffsetY ?? 0);
}

/**
 * 陣営ごとに spriteDrawOrder と同じ並びで depthOffsetY を割り当てる。
 * 奥（先に描画）ほど大きい offset → 画面上で上へずれる。
 */
export function assignVisualDepthOffsets(
  layouts: readonly VisualDepthLayout[],
  scale: number,
  options: AssignVisualDepthOptions = {},
): Map<string, number> {
  const stepPx = VISUAL_DEPTH_STEP_PX * scale;
  const offsets = new Map<string, number>();

  const enemyDepthPool =
    options.enemyDepthReference ??
    layouts.filter((layout) => layout.isEnemy);
  const allyDepthPool = layouts.filter((layout) => !layout.isEnemy);

  for (const factionLayouts of [enemyDepthPool, allyDepthPool]) {
    if (factionLayouts.length === 0) continue;
    const sorted = sortForSpriteDraw(factionLayouts);
    const maxIndex = sorted.length - 1;
    sorted.forEach((layout, index) => {
      // 敵群れが増えても草帯／空境界の最大高さを超えない
      const depthIndex = Math.min(maxIndex - index, VISUAL_DEPTH_MAX_STEPS);
      offsets.set(layout.id, depthIndex * stepPx);
    });
  }

  return offsets;
}

export function applyVisualDepthOffsets<
  T extends VisualDepthLayout & { depthOffsetY?: number },
>(
  layouts: T[],
  scale: number,
  options: AssignVisualDepthOptions = {},
): void {
  const offsets = assignVisualDepthOffsets(layouts, scale, options);
  for (const layout of layouts) {
    layout.depthOffsetY = offsets.get(layout.id) ?? 0;
  }
}
