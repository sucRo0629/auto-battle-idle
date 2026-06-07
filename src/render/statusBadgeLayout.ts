import {
  STATUS_BADGE_GAP,
  STATUS_BADGE_H,
} from './formationLayout.ts';
import {
  defaultEnemyHpBarTop,
  hpBarRectsOverlapHorizontally,
} from './enemyHpBarLayout.ts';

export { STATUS_BADGE_GAP, STATUS_BADGE_H };

export interface StatusBadgeLayoutInput {
  id: string;
  x: number;
  y: number;
  isEnemy: boolean;
  hpBarTop?: number;
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
): number {
  const anchorTop = input.isEnemy
    ? (input.hpBarTop ?? defaultEnemyHpBarTop(input.y, scale))
    : input.y;
  return anchorTop - STATUS_BADGE_GAP * scale - STATUS_BADGE_H * scale;
}

export function statusBadgeRect(
  spriteX: number,
  badgeTop: number,
  rowWidth: number,
  scale: number,
  spriteSize: number,
): StatusBadgeRect {
  const spriteW = spriteSize * scale;
  const left = spriteX + (spriteW - rowWidth) / 2;
  const height = STATUS_BADGE_H * scale;
  return {
    left,
    top: badgeTop,
    right: left + rowWidth,
    bottom: badgeTop + height,
  };
}

/** 前線（右）→ 後方（左）の順にバッジ top を確定。水平重なり時は半分重ねて上へずらす。 */
export function computeStatusBadgeTops(
  units: StatusBadgeLayoutInput[],
  rowWidthById: Map<string, number>,
  scale: number,
  spriteSize: number,
): Map<string, number> {
  const placed: StatusBadgeRect[] = [];
  const tops = new Map<string, number>();
  const sorted = [...units].sort((a, b) => b.x - a.x);
  const stackOverlap = (STATUS_BADGE_H * scale) / 2;

  for (const unit of sorted) {
    const rowWidth = rowWidthById.get(unit.id) ?? 0;
    if (rowWidth <= 0) continue;

    let top = defaultStatusBadgeTop(unit, scale);
    for (const placedBadge of placed) {
      const candidate = statusBadgeRect(
        unit.x,
        top,
        rowWidth,
        scale,
        spriteSize,
      );
      if (hpBarRectsOverlapHorizontally(candidate, placedBadge)) {
        top = Math.min(top, placedBadge.top - stackOverlap);
      }
    }

    const rect = statusBadgeRect(unit.x, top, rowWidth, scale, spriteSize);
    tops.set(unit.id, top);
    placed.push(rect);
  }

  return tops;
}
