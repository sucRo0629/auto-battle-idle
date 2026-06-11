import type { AggregatedCategoryEffect } from '../battle/statusEffectDisplay.ts';
import {
  STATUS_BADGE_SLOT_ORDER,
  type StatusDisplayCategory,
} from '../battle/statusEffectDisplay.ts';
import { getStatusIconImage } from './StatusIconRegistry.ts';

export const STATUS_BADGE_GAP = 0;

function statusBadgeUsesTint(category: StatusDisplayCategory): boolean {
  return (
    category === 'atk' ||
    category === 'def' ||
    category === 'reg' ||
    category === 'attackSpeed'
  );
}

export function statusBadgeWidth(scale: number, iconSize: number): number {
  return iconSize * scale;
}

/** 隣接アイコン原点間の横 stride（縁取りはみ出し分を含む） */
export function statusBadgeStride(
  scale: number,
  iconSize: number,
  outlineWidth: number,
  rowOverlap = 0,
): number {
  const badgeW = statusBadgeWidth(scale, iconSize);
  const outlinePad = statusBadgeOutlinePad(outlineWidth, scale);
  const gap = STATUS_BADGE_GAP * scale;
  const overlapPx = rowOverlap * scale;
  return badgeW + gap + outlinePad * 2 - overlapPx;
}

export function statusBadgeRowWidth(
  badges: ReadonlyArray<Pick<StatusBadgeDrawItem, 'category'>>,
  scale: number,
  iconSize: number,
  outlineWidth: number,
  rowOverlap = 0,
): number {
  if (badges.length <= 0) return 0;
  const badgeW = statusBadgeWidth(scale, iconSize);
  if (badges.length === 1) return badgeW;
  const stride = statusBadgeStride(scale, iconSize, outlineWidth, rowOverlap);
  return badgeW + (badges.length - 1) * stride;
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
  debuffColor: string;
  iconSize: number;
  rowOverlap: number;
  overlayColor: string;
  iconOutlineColor: string;
  iconOutlineWidth: number;
  iconFallbackAlpha: number;
  resolveIconFallbackColor: (
    category: StatusDisplayCategory,
  ) => string;
}

/** 縁取りがキャンバス端で切れないよう確保する余白（px） */
export function statusBadgeOutlinePad(
  outlineWidth: number,
  scale = 1,
): number {
  const widthPx = outlineWidth * scale;
  if (widthPx <= 0) return 0;
  return Math.ceil(widthPx) + 1;
}

/** 1px 刻みの周囲リング。不透明ピクセルのシルエットに沿った縁取り用 */
export function generateOutlineOffsets(
  width: number,
): ReadonlyArray<readonly [number, number]> {
  if (width <= 0) return [];
  const ring = Math.ceil(width);
  const offsets: Array<[number, number]> = [];
  for (let dy = -ring; dy <= ring; dy++) {
    for (let dx = -ring; dx <= ring; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= ring) {
        offsets.push([dx, dy]);
      }
    }
  }
  return offsets;
}

let outlineBuffer: HTMLCanvasElement | null = null;

function getOutlineBuffer(
  width: number,
  height: number,
): CanvasRenderingContext2D {
  if (!outlineBuffer) {
    outlineBuffer = document.createElement('canvas');
  }

  outlineBuffer.width = width;
  outlineBuffer.height = height;

  const bufferCtx = outlineBuffer.getContext('2d');
  if (!bufferCtx) throw new Error('Canvas 2D unavailable');

  bufferCtx.clearRect(0, 0, width, height);
  bufferCtx.globalCompositeOperation = 'source-over';
  bufferCtx.globalAlpha = 1;
  return bufferCtx;
}

function drawSilhouetteOutline(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  outlineColor: string,
  outlineWidth: number,
): void {
  if (outlineWidth <= 0) return;
  const offsets = generateOutlineOffsets(outlineWidth);
  if (offsets.length === 0) return;

  const pad = statusBadgeOutlinePad(outlineWidth);
  const bufferW = Math.ceil(width + pad * 2);
  const bufferH = Math.ceil(height + pad * 2);
  const bufferCtx = getOutlineBuffer(bufferW, bufferH);
  const originX = pad;
  const originY = pad;

  for (const [dx, dy] of offsets) {
    bufferCtx.drawImage(image, originX + dx, originY + dy, width, height);
  }
  bufferCtx.globalCompositeOperation = 'source-in';
  bufferCtx.fillStyle = outlineColor;
  bufferCtx.fillRect(0, 0, bufferW, bufferH);
  bufferCtx.globalCompositeOperation = 'source-over';

  ctx.drawImage(
    outlineBuffer!,
    0,
    0,
    bufferW,
    bufferH,
    x - pad,
    y - pad,
    bufferW,
    bufferH,
  );
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

  const rowW = statusBadgeRowWidth(
    badges,
    scale,
    theme.iconSize,
    theme.iconOutlineWidth,
    theme.rowOverlap,
  );
  let x = centerX - rowW / 2;

  for (const badge of badges) {
    drawStatusBadge(ctx, x, top, badge, scale, theme);
    x += statusBadgeStride(
      scale,
      theme.iconSize,
      theme.iconOutlineWidth,
      theme.rowOverlap,
    );
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
  drawStatusIcon(
    ctx,
    badge.category,
    x,
    y,
    iconSize,
    accentColor,
    badge.remainingRatio,
    theme,
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
  const outlineWidthPx =
    theme.iconOutlineWidth * (size / Math.max(1, theme.iconSize));
  if (image) {
    if (!statusBadgeUsesTint(category)) {
      drawPlainImage(
        ctx,
        image,
        x,
        y,
        size,
        size,
        remainingRatio,
        theme.overlayColor,
        theme.iconOutlineColor,
        outlineWidthPx,
      );
    } else {
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
        theme.iconOutlineColor,
        outlineWidthPx,
      );
    }
    return;
  }

  const pad = statusBadgeOutlinePad(outlineWidthPx);
  if (pad > 0) {
    ctx.fillStyle = theme.iconOutlineColor;
    ctx.fillRect(x - pad, y - pad, size + pad * 2, size + pad * 2);
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

function drawPlainImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  remainingRatio: number,
  overlayColor: string,
  outlineColor: string,
  outlineWidth: number,
): void {
  drawSilhouetteOutline(
    ctx,
    image,
    x,
    y,
    width,
    height,
    outlineColor,
    outlineWidth,
  );

  const bufferW = Math.ceil(width);
  const bufferH = Math.ceil(height);
  const bufferCtx = getTintBuffer(bufferW, bufferH);
  bufferCtx.drawImage(image, 0, 0, bufferW, bufferH);
  drawRemainingDarkOverlay(
    bufferCtx,
    0,
    0,
    bufferW,
    bufferH,
    remainingRatio,
    overlayColor,
  );
  ctx.drawImage(tintBuffer!, 0, 0, bufferW, bufferH, x, y, width, height);
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
  outlineColor: string,
  outlineWidth: number,
): void {
  drawSilhouetteOutline(
    ctx,
    image,
    x,
    y,
    width,
    height,
    outlineColor,
    outlineWidth,
  );

  const bufferW = Math.ceil(width);
  const bufferH = Math.ceil(height);
  const bufferCtx = getTintBuffer(bufferW, bufferH);

  bufferCtx.drawImage(image, 0, 0, bufferW, bufferH);
  bufferCtx.globalCompositeOperation = 'source-in';
  bufferCtx.fillStyle = color;
  bufferCtx.fillRect(0, 0, bufferW, bufferH);
  bufferCtx.globalCompositeOperation = 'source-over';

  drawRemainingDarkOverlay(
    bufferCtx,
    0,
    0,
    bufferW,
    bufferH,
    remainingRatio,
    overlayColor,
  );

  ctx.drawImage(tintBuffer!, 0, 0, bufferW, bufferH, x, y, width, height);
}
