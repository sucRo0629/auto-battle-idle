import type { AggregatedCategoryEffect } from '../battle/statusEffectDisplay.ts';
import {
  STATUS_BADGE_SLOT_ORDER,
  type StatusDisplayCategory,
} from '../battle/statusEffectDisplay.ts';
import {
  getStatusArrowImage,
  getStatusIconImage,
} from './StatusIconRegistry.ts';

export const STATUS_BADGE_GAP = 0;

export function statusBadgeWidth(
  scale: number,
  iconSize: number,
  arrowWidth: number,
): number {
  return (iconSize + arrowWidth) * scale;
}

export function statusBadgeRowWidth(
  badgeCount: number,
  scale: number,
  iconSize: number,
  arrowWidth: number,
  overlap = 0,
): number {
  if (badgeCount <= 0) return 0;
  const badgeW = statusBadgeWidth(scale, iconSize, arrowWidth);
  const gap = STATUS_BADGE_GAP * scale;
  const overlapPx = overlap * scale;
  return badgeCount * badgeW + (badgeCount - 1) * (gap - overlapPx);
}

export interface StatusBadgeDrawItem {
  category: StatusDisplayCategory;
  kind: 'buff' | 'debuff';
  remainingRatio: number;
}

export function orderBadgesForDraw(
  badges: AggregatedCategoryEffect[],
): StatusBadgeDrawItem[] {
  const byCategory = new Map(
    badges.map((badge) => [badge.category, badge] as const),
  );

  return STATUS_BADGE_SLOT_ORDER.flatMap((category) => {
    const badge = byCategory.get(category);
    if (!badge || !isCategoryEffectVisible(badge)) return [];
    return [{ category, kind: badge.kind, remainingRatio: badge.remainingRatio }];
  });
}

function isCategoryEffectVisible(agg: AggregatedCategoryEffect): boolean {
  return agg.kind === 'buff' || agg.kind === 'debuff';
}

export interface StatusBadgeTheme {
  buffColor: string;
  badgeBg: string;
  debuffColor: string;
  iconSize: number;
  arrowWidth: number;
  rowOverlap: number;
  overlayColor: string;
  iconFallbackAlpha: number;
  resolveIconFallbackColor: (
    category: StatusDisplayCategory,
  ) => string;
}

export function drawStatusBadgeRow(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  top: number,
  badges: StatusBadgeDrawItem[],
  scale: number,
  theme: StatusBadgeTheme,
): void {
  if (badges.length === 0) return;

  const badgeW = statusBadgeWidth(scale, theme.iconSize, theme.arrowWidth);
  const gap = STATUS_BADGE_GAP * scale;
  const overlapPx = theme.rowOverlap * scale;
  const rowW = statusBadgeRowWidth(
    badges.length,
    scale,
    theme.iconSize,
    theme.arrowWidth,
    theme.rowOverlap,
  );
  let x = centerX - rowW / 2;

  for (const badge of badges) {
    drawStatusBadge(ctx, x, top, badge, scale, theme);
    x += badgeW + gap - overlapPx;
  }
}

function drawStatusBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  badge: StatusBadgeDrawItem,
  scale: number,
  theme: StatusBadgeTheme,
): void {
  const accentColor =
    badge.kind === 'buff' ? theme.buffColor : theme.debuffColor;

  ctx.save();

  const iconSize = theme.iconSize * scale;
  const arrowWidth = theme.arrowWidth * scale;
  const iconX = x;
  const iconY = y;
  ctx.fillStyle = theme.badgeBg;
  ctx.fillRect(iconX, iconY, iconSize + arrowWidth, iconSize);
  drawStatusIcon(
    ctx,
    badge.category,
    iconX,
    iconY,
    iconSize,
    accentColor,
    badge.remainingRatio,
    theme,
  );

  const arrowX = iconX + iconSize;
  drawStatusArrow(
    ctx,
    arrowX,
    iconY,
    arrowWidth,
    iconSize,
    badge.kind === 'buff',
    accentColor,
    badge.remainingRatio,
    theme.overlayColor,
  );

  ctx.restore();
}

function drawStatusIcon(
  ctx: CanvasRenderingContext2D,
  category: StatusDisplayCategory,
  x: number,
  y: number,
  size: number,
  color: string,
  remainingRatio: number,
  theme: StatusBadgeTheme,
): void {
  const image = getStatusIconImage(category);
  if (image) {
    drawTintedImage(
      ctx,
      image,
      x,
      y,
      size,
      size,
      color,
      remainingRatio,
      theme.overlayColor,
    );
    return;
  }

  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = theme.resolveIconFallbackColor(category);
  ctx.globalAlpha = theme.iconFallbackAlpha;
  ctx.fillRect(x + size * 0.2, y + size * 0.2, size * 0.6, size * 0.6);
  ctx.globalAlpha = 1;
  drawRemainingDarkOverlay(
    ctx,
    x,
    y,
    size,
    size,
    remainingRatio,
    theme.overlayColor,
  );
}

let tintBuffer: HTMLCanvasElement | null = null;

function getTintBuffer(width: number, height: number): CanvasRenderingContext2D {
  if (!tintBuffer) {
    tintBuffer = document.createElement('canvas');
  }

  tintBuffer.width = width;
  tintBuffer.height = height;

  const bufferCtx = tintBuffer.getContext('2d');
  if (!bufferCtx) throw new Error('Canvas 2D unavailable');

  bufferCtx.clearRect(0, 0, width, height);
  return bufferCtx;
}

function drawRemainingDarkOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  remainingRatio: number,
  overlayColor: string,
): void {
  const elapsedRatio = 1 - Math.max(0, Math.min(1, remainingRatio));
  if (elapsedRatio <= 0) return;

  const darkH = height * elapsedRatio;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = overlayColor;
  ctx.fillRect(x, y, width, darkH);
  ctx.restore();
}

function drawTintedImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  remainingRatio: number,
  overlayColor: string,
): void {
  const bufferW = Math.ceil(width);
  const bufferH = Math.ceil(height);
  const bufferCtx = getTintBuffer(bufferW, bufferH);

  bufferCtx.drawImage(image, 0, 0, bufferW, bufferH);
  bufferCtx.globalCompositeOperation = 'source-in';
  bufferCtx.fillStyle = color;
  bufferCtx.fillRect(0, 0, bufferW, bufferH);
  bufferCtx.globalCompositeOperation = 'source-over';

  const elapsedRatio = 1 - Math.max(0, Math.min(1, remainingRatio));
  if (elapsedRatio > 0) {
    const darkH = bufferH * elapsedRatio;
    bufferCtx.save();
    bufferCtx.globalCompositeOperation = 'source-atop';
    bufferCtx.fillStyle = overlayColor;
    bufferCtx.fillRect(0, 0, bufferW, darkH);
    bufferCtx.restore();
  }

  ctx.drawImage(tintBuffer!, 0, 0, bufferW, bufferH, x, y, width, height);
}

function drawStatusArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  isUp: boolean,
  color: string,
  remainingRatio: number,
  overlayColor: string,
): void {
  const image = getStatusArrowImage(isUp ? 'up' : 'down');
  if (image) {
    drawTintedImage(
      ctx,
      image,
      x,
      y,
      width,
      height,
      color,
      remainingRatio,
      overlayColor,
    );
    return;
  }

  const halfH = width * 0.35;
  const baseInset = halfH * 0.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (isUp) {
    const baseY = y + height;
    const tipY = baseY - halfH - baseInset;
    ctx.moveTo(x + width / 2, tipY);
    ctx.lineTo(x + width, baseY - baseInset);
    ctx.lineTo(x, baseY - baseInset);
  } else {
    const baseY = y;
    const tipY = baseY + halfH + baseInset;
    ctx.moveTo(x + width / 2, tipY);
    ctx.lineTo(x + width, baseY + baseInset);
    ctx.lineTo(x, baseY + baseInset);
  }
  ctx.closePath();
  ctx.fill();
  drawRemainingDarkOverlay(
    ctx,
    x,
    y,
    width,
    height,
    remainingRatio,
    overlayColor,
  );
}
