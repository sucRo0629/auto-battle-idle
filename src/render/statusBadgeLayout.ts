import {
  STATUS_BADGE_GAP,
  STATUS_BADGE_H,
} from './formationLayout.ts';
import { hpBarRectsOverlapHorizontally } from './enemyHpBarLayout.ts';

export { STATUS_BADGE_GAP, STATUS_BADGE_H };

export interface StatusBadgeLayoutInput {
  id: string;
  x: number;
  y: number;
}

export interface StatusBadgeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function defaultStatusBadgeTop(
  input: StatusBadgeLayoutInput,
  scale: number,
  rowHeight = STATUS_BADGE_H * scale,
): number {
  return input.y - STATUS_BADGE_GAP * scale - rowHeight;
}

export function statusBadgeRect(
  spriteX: number,
  badgeTop: number,
  rowWidth: number,
  rowHeight: number,
  scale: number,
  spriteSize: number,
): StatusBadgeRect {
  const spriteW = spriteSize * scale;
  const left = spriteX + (spriteW - rowWidth) / 2;
  return {
    left,
    top: badgeTop,
    right: left + rowWidth,
    bottom: badgeTop + rowHeight,
  };
}

/** 前線（右）→ 後方（左）の順にバッジ top を確定。水平重なり時は半分重ねて上へずらす。 */
export function computeStatusBadgeTops(
  units: StatusBadgeLayoutInput[],
  rowWidthById: Map<string, number>,
  scale: number,
  spriteSize: number,
  rowHeightById: Map<string, number> = new Map(),
): Map<string, number> {
  const placed: StatusBadgeRect[] = [];
  const tops = new Map<string, number>();
  const sorted = [...units].sort((a, b) => b.x - a.x);

  for (const unit of sorted) {
    const rowWidth = rowWidthById.get(unit.id) ?? 0;
    if (rowWidth <= 0) continue;
    const rowHeight = rowHeightById.get(unit.id) ?? STATUS_BADGE_H * scale;

    let top = defaultStatusBadgeTop(unit, scale, rowHeight);
    for (const placedBadge of placed) {
      const candidate = statusBadgeRect(
        unit.x,
        top,
        rowWidth,
        rowHeight,
        scale,
        spriteSize,
      );
      if (hpBarRectsOverlapHorizontally(candidate, placedBadge)) {
        const placedHeight = placedBadge.bottom - placedBadge.top;
        const overlap = Math.max(rowHeight, placedHeight) / 2;
        top = Math.min(top, placedBadge.top - overlap);
      }
    }

    const rect = statusBadgeRect(
      unit.x,
      top,
      rowWidth,
      rowHeight,
      scale,
      spriteSize,
    );
    tops.set(unit.id, top);
    placed.push(rect);
  }

  return tops;
}
