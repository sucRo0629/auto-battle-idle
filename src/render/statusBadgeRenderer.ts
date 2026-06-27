import {
  type StatusEffectBadgeDisplay,
  type StatusDisplayCategory,
} from '../battle/statusEffectDisplay.ts';
import {
  getStatusBadgePentagonImage,
  getStatusIconImage,
} from './StatusIconRegistry.ts';

export const STATUS_BADGE_GAP = 0;

function statusBadgeUsesWhiteSilhouette(
  category: StatusDisplayCategory,
): boolean {
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

export type StatusBadgeDrawItem = StatusEffectBadgeDisplay;

export interface StatusBadgeBlockLayout {
  passiveRows: StatusBadgeDrawItem[][];
  passiveBlockWidth: number;
  totalWidth: number;
  totalHeight: number;
  isMultilinePassive: boolean;
}

export function orderBadgesForDraw(
  badges: StatusBadgeDrawItem[],
): StatusBadgeDrawItem[] {
  return badges.slice();
}

function chunkBadges(
  badges: StatusBadgeDrawItem[],
  size: number,
): StatusBadgeDrawItem[][] {
  if (badges.length === 0) return [];
  const rows: StatusBadgeDrawItem[][] = [];
  for (let i = 0; i < badges.length; i += size) {
    rows.push(badges.slice(i, i + size));
  }
  return rows;
}

export function measureStatusBadgeBlock(
  badges: StatusBadgeDrawItem[],
  scale: number,
  iconSize: number,
  outlineWidth: number,
  rowOverlap = 0,
): StatusBadgeBlockLayout {
  const passiveRows = chunkBadges(badges, 4);
  const rowHeight = iconSize * scale;
  const rowGap = Math.max(1, scale);
  const passiveRowWidths = passiveRows.map((row) =>
    statusBadgeRowWidth(row, scale, iconSize, outlineWidth, rowOverlap),
  );
  const passiveBlockWidth =
    passiveRowWidths.length > 0 ? Math.max(...passiveRowWidths) : 0;
  const totalWidth = passiveBlockWidth;
  const totalHeight = passiveRows.length > 0
    ? rowHeight * passiveRows.length + rowGap * (passiveRows.length - 1)
    : rowHeight;

  return {
    passiveRows,
    passiveBlockWidth,
    totalWidth,
    totalHeight,
    isMultilinePassive: passiveRows.length > 1,
  };
}

export function drawStatusBadgeBlock(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  top: number,
  badges: StatusBadgeDrawItem[],
  scale: number,
  theme: StatusBadgeTheme,
): StatusBadgeBlockLayout {
  const layout = measureStatusBadgeBlock(
    badges,
    scale,
    theme.iconSize,
    theme.iconOutlineWidth,
    theme.rowOverlap,
  );

  if (layout.totalWidth <= 0) return layout;

  const rowHeight = theme.iconSize * scale;
  const rowGap = Math.max(1, scale);
  const left = centerX - layout.totalWidth / 2;

  let passiveTop =
    top + Math.max(0, layout.passiveRows.length - 1) * (rowHeight + rowGap);
  for (const row of layout.passiveRows) {
    const rowW = statusBadgeRowWidth(
      row,
      scale,
      theme.iconSize,
      theme.iconOutlineWidth,
      theme.rowOverlap,
    );
    drawStatusBadgeRow(ctx, left + rowW / 2, passiveTop, row, scale, theme);
    passiveTop -= rowHeight + rowGap;
  }

  return layout;
}

export const COMPACT_STATUS_BADGE_VISIBLE_COUNT = 3;
export const COMPACT_STATUS_BADGE_SLOT_COUNT = 4;

export interface CompactStatusBadgeRowLayout {
  totalWidth: number;
  totalHeight: number;
}

export function measureCompactStatusBadgeRow(
  scale: number,
  iconSize: number,
  outlineWidth: number,
  rowOverlap = 0,
): CompactStatusBadgeRowLayout {
  const rowHeight = iconSize * scale;
  const placeholder = Array.from(
    { length: COMPACT_STATUS_BADGE_SLOT_COUNT },
    () => ({ category: 'hot' as const }),
  );
  return {
    totalWidth: statusBadgeRowWidth(
      placeholder,
      scale,
      iconSize,
      outlineWidth,
      rowOverlap,
    ),
    totalHeight: rowHeight,
  };
}

export function drawCompactStatusBadgeRow(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  visible: StatusBadgeDrawItem[],
  overflowCount: number,
  scale: number,
  theme: StatusBadgeTheme,
): CompactStatusBadgeRowLayout {
  const layout = measureCompactStatusBadgeRow(
    scale,
    theme.iconSize,
    theme.iconOutlineWidth,
    theme.rowOverlap,
  );
  const stride = statusBadgeStride(
    scale,
    theme.iconSize,
    theme.iconOutlineWidth,
    theme.rowOverlap,
  );
  let x = left;

  for (let slot = 0; slot < COMPACT_STATUS_BADGE_VISIBLE_COUNT; slot++) {
    const badge = visible[slot];
    if (badge) {
      drawStatusBadge(ctx, x, top, badge, scale, theme);
    }
    x += stride;
  }

  if (overflowCount > 0) {
    drawOverflowCountBadge(ctx, x, top, overflowCount, scale, theme);
  }

  return layout;
}

export function drawOverflowCountBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  overflowCount: number,
  scale: number,
  theme: StatusBadgeTheme,
): void {
  const badgeSize = theme.iconSize * scale;
  const text = `+${overflowCount}`;
  const fontSize = Math.round(Math.max(8, badgeSize * 0.5625));
  ctx.save();
  ctx.font = `bold ${fontSize}px ${themeFontFamily(ctx)}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.5, fontSize * 0.22);
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#ffffff';
  const textX = x + badgeSize / 2;
  const textY = y + badgeSize / 2;
  ctx.strokeText(text, textX, textY);
  ctx.fillText(text, textX, textY);
  ctx.restore();
}

export interface StatusBadgeWrapLayout {
  rows: StatusBadgeDrawItem[][];
  totalWidth: number;
  totalHeight: number;
}

function packBadgesIntoRows(
  badges: StatusBadgeDrawItem[],
  maxWidth: number,
  scale: number,
  iconSize: number,
  outlineWidth: number,
  rowOverlap: number,
): StatusBadgeDrawItem[][] {
  if (badges.length === 0) return [];
  const rows: StatusBadgeDrawItem[][] = [];
  let currentRow: StatusBadgeDrawItem[] = [];

  for (const badge of badges) {
    const candidate = [...currentRow, badge];
    const rowW = statusBadgeRowWidth(
      candidate,
      scale,
      iconSize,
      outlineWidth,
      rowOverlap,
    );
    if (currentRow.length > 0 && rowW > maxWidth) {
      rows.push(currentRow);
      currentRow = [badge];
    } else {
      currentRow = candidate;
    }
  }

  if (currentRow.length > 0) rows.push(currentRow);
  return rows;
}

export function measureStatusBadgeWrap(
  badges: StatusBadgeDrawItem[],
  maxWidth: number,
  scale: number,
  iconSize: number,
  outlineWidth: number,
  rowOverlap = 0,
): StatusBadgeWrapLayout {
  const rows = packBadgesIntoRows(
    badges,
    maxWidth,
    scale,
    iconSize,
    outlineWidth,
    rowOverlap,
  );
  const rowHeight = iconSize * scale;
  const rowGap = Math.max(2, scale * 2);
  const rowWidths = rows.map((row) =>
    statusBadgeRowWidth(row, scale, iconSize, outlineWidth, rowOverlap),
  );
  return {
    rows,
    totalWidth: rowWidths.length > 0 ? Math.max(...rowWidths) : 0,
    totalHeight:
      rows.length > 0
        ? rowHeight * rows.length + rowGap * (rows.length - 1)
        : 0,
  };
}

export function drawStatusBadgeWrap(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  badges: StatusBadgeDrawItem[],
  maxWidth: number,
  scale: number,
  theme: StatusBadgeTheme,
): StatusBadgeWrapLayout {
  const layout = measureStatusBadgeWrap(
    badges,
    maxWidth,
    scale,
    theme.iconSize,
    theme.iconOutlineWidth,
    theme.rowOverlap,
  );
  const rowHeight = theme.iconSize * scale;
  const rowGap = Math.max(2, scale * 2);
  let rowTop = top;

  for (const row of layout.rows) {
    const rowW = statusBadgeRowWidth(
      row,
      scale,
      theme.iconSize,
      theme.iconOutlineWidth,
      theme.rowOverlap,
    );
    drawStatusBadgeRow(ctx, left + rowW / 2, rowTop, row, scale, theme);
    rowTop += rowHeight + rowGap;
  }

  return layout;
}

export interface StatusBadgeTheme {
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

function drawStackCountLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  stackCount: number,
): void {
  const text = String(stackCount);
  const fontSize = Math.round(Math.max(9, size * 0.5625));
  ctx.save();
  ctx.font = `bold ${fontSize}px ${themeFontFamily(ctx)}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.5, fontSize * 0.22);
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#ffffff';
  const textX = x + size;
  const textY = y + size;
  ctx.strokeText(text, textX, textY);
  ctx.fillText(text, textX, textY);
  ctx.restore();
}

function themeFontFamily(ctx: CanvasRenderingContext2D): string {
  const raw = ctx.font;
  const match = /(\d+(?:\.\d+)?px)\s+(.+)/.exec(raw);
  return match?.[2] ?? 'sans-serif';
}

function drawStatusBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  badge: StatusBadgeDrawItem,
  scale: number,
  theme: StatusBadgeTheme,
): void {
  const outlineColor = theme.iconOutlineColor;
  const badgeSize = theme.iconSize * scale;

  ctx.save();

  const pentagon = getStatusBadgePentagonImage(badge.kind, badge.isPassive);
  if (pentagon) {
    ctx.drawImage(pentagon, x, y, badgeSize, badgeSize);
  }

  const iconTint = statusBadgeUsesWhiteSilhouette(badge.category)
    ? '#ffffff'
    : undefined;

  drawStatusIcon(
    ctx,
    badge.category,
    x,
    y,
    badgeSize,
    iconTint,
    theme,
    outlineColor,
    theme.iconOutlineWidth * (badgeSize / Math.max(1, theme.iconSize)),
  );

  drawBadgeRemainingOverlay(
    ctx,
    x,
    y,
    badgeSize,
    badgeSize,
    badge.remainingRatio,
    theme.overlayColor,
  );

  if (badge.stackCount !== undefined && badge.stackCount > 1) {
    drawStackCountLabel(ctx, x, y, badgeSize, badge.stackCount);
  }

  ctx.restore();
}

function drawStatusIcon(
  ctx: CanvasRenderingContext2D,
  category: StatusDisplayCategory,
  x: number,
  y: number,
  size: number,
  whiteSilhouetteTint: string | undefined,
  theme: StatusBadgeTheme,
  outlineColor: string,
  outlineWidthPx: number,
): void {
  const image = getStatusIconImage(category);
  if (image) {
    if (whiteSilhouetteTint === undefined) {
      drawPlainImage(
        ctx,
        image,
        x,
        y,
        size,
        size,
        outlineColor,
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
        whiteSilhouetteTint,
        outlineColor,
        outlineWidthPx,
      );
    }
    return;
  }

  ctx.fillStyle = whiteSilhouetteTint ?? theme.resolveIconFallbackColor(category);
  ctx.globalAlpha = theme.iconFallbackAlpha;
  ctx.fillRect(x + size * 0.15, y + size * 0.15, size * 0.7, size * 0.7);
  ctx.globalAlpha = 1;
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

function drawBadgeRemainingOverlay(
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

  ctx.save();
  ctx.fillStyle = overlayColor;
  ctx.fillRect(x, y, width, height * elapsedRatio);
  ctx.restore();
}

function drawPlainImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
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

  ctx.drawImage(image, x, y, width, height);
}

function drawTintedImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
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

  ctx.drawImage(tintBuffer!, 0, 0, bufferW, bufferH, x, y, width, height);
}
