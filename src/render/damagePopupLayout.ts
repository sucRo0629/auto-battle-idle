import type { CombatantLayout } from "./IBattleRenderer.ts";
import { spriteDrawY } from "./spriteVisualDepth.ts";
import {
  hpBarRectsOverlapHorizontally,
  type HpBarRect,
} from "./enemyHpBarLayout.ts";
import { getPlaceholderSpriteYOffset } from "./placeholderSpriteAnim.ts";
import { getSheetCellHeight, SKILL_ANIM_CELL_HEIGHT } from "./spriteLayout.ts";

/** スプライト上端からポップアップ下端までの隙間（CombatReactionPopup の HEAD_LABEL_OFFSET_Y と同程度） */
export const HEAD_GAP_ABOVE_SPRITE = -20;

export interface DamagePopupLayoutInput {
  id: number;
  layoutX: number;
  elapsedMs: number;
  centerX: number;
  textWidth: number;
  textHeight: number;
}

export function computeSpriteDrawHeight(
  layout: Pick<CombatantLayout, "spriteKey" | "skillAnimKey">,
  scale: number
): number {
  if (layout.skillAnimKey) {
    return SKILL_ANIM_CELL_HEIGHT * scale;
  }
  return getSheetCellHeight(layout.spriteKey) * scale;
}

export function computeSpriteHeadTopY(
  layoutY: number,
  bob: number,
  spriteSize: number,
  drawH: number
): number {
  return layoutY + bob + spriteSize - drawH;
}

export function defaultDamagePopupAnchorY(
  headTopY: number,
  scale: number,
  offsetY: number,
  fallY: number
): number {
  return headTopY - HEAD_GAP_ABOVE_SPRITE * scale + offsetY + fallY;
}

export function computeDamagePopupBaseAnchorY(
  layout: Pick<
    CombatantLayout,
    "y" | "depthOffsetY" | "spriteKey" | "skillAnimKey" | "anim" | "animFrame"
  >,
  spriteSize: number,
  scale: number,
  offsetY: number,
  fallY: number
): number {
  const bob = getPlaceholderSpriteYOffset(layout, scale);
  const drawH = computeSpriteDrawHeight(layout, scale);
  const headTopY = computeSpriteHeadTopY(
    spriteDrawY(layout),
    bob,
    spriteSize,
    drawH,
  );
  return defaultDamagePopupAnchorY(headTopY, scale, offsetY, fallY);
}

export function damagePopupRect(
  centerX: number,
  anchorBottomY: number,
  textWidth: number,
  textHeight: number
): HpBarRect {
  const halfW = textWidth / 2;
  return {
    left: centerX - halfW,
    top: anchorBottomY - textHeight,
    right: centerX + halfW,
    bottom: anchorBottomY,
  };
}

/**
 * 前線（x 大）→ 古い popup（elapsed 大）の順に確定。
 * 水平重なり時は後から処理した popup（新しい／elapsed 小）が半分重ねで上へ。
 */
export function computeDamagePopupTops(
  popups: DamagePopupLayoutInput[],
  baseAnchorYById: Map<number, number>
): Map<number, number> {
  const placed: HpBarRect[] = [];
  const tops = new Map<number, number>();
  const sorted = [...popups].sort((a, b) => {
    if (b.layoutX !== a.layoutX) return b.layoutX - a.layoutX;
    return b.elapsedMs - a.elapsedMs;
  });

  for (const popup of sorted) {
    const baseAnchorY = baseAnchorYById.get(popup.id)!;
    let anchorBottomY = baseAnchorY;
    const { textWidth, textHeight } = popup;

    for (const placedRect of placed) {
      const candidate = damagePopupRect(
        popup.centerX,
        anchorBottomY,
        textWidth,
        textHeight
      );
      if (hpBarRectsOverlapHorizontally(candidate, placedRect)) {
        const placedHeight = placedRect.bottom - placedRect.top;
        const overlap = Math.max(textHeight, placedHeight) / 1.1;
        anchorBottomY = Math.min(anchorBottomY, placedRect.top + overlap);
      }
    }

    tops.set(popup.id, anchorBottomY);
    placed.push(
      damagePopupRect(popup.centerX, anchorBottomY, textWidth, textHeight)
    );
  }

  return tops;
}
