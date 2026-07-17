import {
  type StatusEffectBadgeDisplay,
  type StatusDisplayCategory,
} from "../battle/statusEffectDisplay.ts";
import {
  drawBadgeBitmapLabel,
  drawBadgeBitmapLabelForBadgeSize,
} from "./badgeBitmapDigits.ts";
import {
  getStatusBadgePentagonImage,
  getStatusIconImage,
  onStatusIconsReady,
} from "./StatusIconRegistry.ts";

export {
  resolveBadgeLabelFontSize,
  resolveBadgeLabelLayoutScale,
  resolveBadgeLabelPixelScale,
} from "./badgeBitmapDigits.ts";

export const STATUS_BADGE_GAP = 1;

/** パッシブ由来バッジ（`isPassive`）の描画不透明度 */
export const STATUS_BADGE_PASSIVE_ALPHA = 0.55;

/** バッジスロット（オーバーレイ・累積数の基準枠） */
export const STATUS_BADGE_SLOT_PX = 20;
/** 五角形背景 PNG の描画サイズ（スロットと同一） */
export const STATUS_BADGE_PENTAGON_PX = STATUS_BADGE_SLOT_PX;
/** 効果アイコン PNG の描画サイズ（スロット内中央） */
export const STATUS_BADGE_EFFECT_ICON_PX = 12;
export const STATUS_BADGE_EFFECT_ICON_INSET_PX =
  (STATUS_BADGE_SLOT_PX - STATUS_BADGE_EFFECT_ICON_PX) / 2;
/** 五角形 Y オフセット用の行上下パディング（buff −2 のはみ出し分） */
export const STATUS_BADGE_ROW_PAD_Y = 2;
/** buff 五角形の Y オフセット（上へ 2px） */
export const STATUS_BADGE_PENTAGON_BUFF_OFFSET_PX = -2;
/** debuff 五角形の Y オフセット（スロット基準。効果アイコンは buff/debuff 同一位置のため 0） */
export const STATUS_BADGE_PENTAGON_DEBUFF_OFFSET_PX = 0;

function statusBadgePentagonOffsetY(kind: "buff" | "debuff"): number {
  return kind === "buff"
    ? STATUS_BADGE_PENTAGON_BUFF_OFFSET_PX
    : STATUS_BADGE_PENTAGON_DEBUFF_OFFSET_PX;
}

/** Party HUD / 敵 HP バー上 / 詳細 UI の正本スロット */
export const PARTY_HUD_STATUS_BADGE_ICON_SIZE = 20;

/** iconSize に対する 20px 正本レイアウトの倍率（20px 未満の敵フィールド用） */
export function statusBadgeLayoutScale(iconSize: number): number {
  return iconSize / STATUS_BADGE_SLOT_PX;
}

export function isCompactStatusBadgeIconSize(iconSize: number): boolean {
  return iconSize < STATUS_BADGE_SLOT_PX;
}

/** 1 行の描画高さ（スロット + 上下パディング） */
export function statusBadgeDrawableRowHeight(
  scale: number,
  slotPx: number,
): number {
  if (!isCompactStatusBadgeIconSize(slotPx)) {
    return slotPx * scale + STATUS_BADGE_ROW_PAD_Y * 2 * scale;
  }
  const layoutScale = statusBadgeLayoutScale(slotPx);
  return Math.round(
    slotPx * scale + STATUS_BADGE_ROW_PAD_Y * 2 * layoutScale * scale,
  );
}

/** Canvas 描画を DOM の pixel-icon-img と同様 nearest-neighbor（等倍）にする */
export function prepareStatusBadgeCanvasContext(
  ctx: CanvasRenderingContext2D
): void {
  ctx.imageSmoothingEnabled = false;
}

function preparePixelBufferContext(
  ctx: CanvasRenderingContext2D
): CanvasRenderingContext2D {
  prepareStatusBadgeCanvasContext(ctx);
  return ctx;
}

function statusBadgeUsesWhiteSilhouette(
  category: StatusDisplayCategory
): boolean {
  return (
    category === "hp" ||
    category === "atk" ||
    category === "def" ||
    category === "res" ||
    category === "attackSpeed"
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
  rowOverlap = 0
): number {
  const badgeW = statusBadgeWidth(scale, iconSize);
  const outlinePad = statusBadgeOutlinePad(outlineWidth, scale);
  const gap = STATUS_BADGE_GAP * scale;
  const overlapPx = rowOverlap * scale;
  return badgeW + gap + outlinePad * 2 - overlapPx;
}

export function statusBadgeRowWidth(
  badges: ReadonlyArray<Pick<StatusBadgeDrawItem, "category">>,
  scale: number,
  iconSize: number,
  outlineWidth: number,
  rowOverlap = 0
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
  badges: StatusBadgeDrawItem[]
): StatusBadgeDrawItem[] {
  return badges.slice();
}

function chunkBadges(
  badges: StatusBadgeDrawItem[],
  size: number
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
  rowOverlap = 0
): StatusBadgeBlockLayout {
  const passiveRows = chunkBadges(badges, 4);
  const rowHeight = statusBadgeDrawableRowHeight(scale, iconSize);
  const rowGap = Math.max(1, scale);
  const passiveRowWidths = passiveRows.map((row) =>
    statusBadgeRowWidth(row, scale, iconSize, outlineWidth, rowOverlap)
  );
  const passiveBlockWidth =
    passiveRowWidths.length > 0 ? Math.max(...passiveRowWidths) : 0;
  const totalWidth = passiveBlockWidth;
  const totalHeight =
    passiveRows.length > 0
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
  theme: StatusBadgeTheme
): StatusBadgeBlockLayout {
  prepareStatusBadgeCanvasContext(ctx);
  const layout = measureStatusBadgeBlock(
    badges,
    scale,
    theme.iconSize,
    theme.iconOutlineWidth,
    theme.rowOverlap
  );

  if (layout.totalWidth <= 0) return layout;

  const rowHeight = statusBadgeDrawableRowHeight(scale, theme.iconSize);
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
      theme.rowOverlap
    );
    drawStatusBadgeRow(ctx, left + rowW / 2, passiveTop, row, scale, theme);
    passiveTop -= rowHeight + rowGap;
  }

  return layout;
}

export interface CompactStatusBadgeLayout {
  visibleCount: number;
  slotCount: number;
}

/** 敵頭上等: 3 +N（計 4 スロット） */
export const FIELD_COMPACT_STATUS_BADGE_LAYOUT: CompactStatusBadgeLayout = {
  visibleCount: 3,
  slotCount: 4,
};

/** Party HUD: 省略なし 4 枠 / +N 時 3 + 第 4 枠（計 4 スロット幅） */
export const PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT: CompactStatusBadgeLayout = {
  visibleCount: 4,
  slotCount: 4,
};

export function resolvePartyHudCompactStatusBadgeLayout(
  overflowCount: number,
): CompactStatusBadgeLayout {
  if (overflowCount > 0) {
    return { visibleCount: 3, slotCount: 4 };
  }
  return PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT;
}

/** @deprecated FIELD_COMPACT_STATUS_BADGE_LAYOUT.visibleCount を参照 */
export const COMPACT_STATUS_BADGE_VISIBLE_COUNT =
  FIELD_COMPACT_STATUS_BADGE_LAYOUT.visibleCount;

/** @deprecated FIELD_COMPACT_STATUS_BADGE_LAYOUT.slotCount を参照 */
export const COMPACT_STATUS_BADGE_SLOT_COUNT =
  FIELD_COMPACT_STATUS_BADGE_LAYOUT.slotCount;

export interface CompactStatusBadgeRowLayout {
  totalWidth: number;
  totalHeight: number;
}

export function measureCompactStatusBadgeRow(
  scale: number,
  iconSize: number,
  outlineWidth: number,
  rowOverlap = 0,
  layout: CompactStatusBadgeLayout = FIELD_COMPACT_STATUS_BADGE_LAYOUT
): CompactStatusBadgeRowLayout {
  const rowHeight = statusBadgeDrawableRowHeight(scale, iconSize);
  const placeholder = Array.from({ length: layout.slotCount }, () => ({
    category: "hot" as const,
  }));
  return {
    totalWidth: statusBadgeRowWidth(
      placeholder,
      scale,
      iconSize,
      outlineWidth,
      rowOverlap
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
  layout: CompactStatusBadgeLayout = FIELD_COMPACT_STATUS_BADGE_LAYOUT
): CompactStatusBadgeRowLayout {
  prepareStatusBadgeCanvasContext(ctx);
  const rowLayout = measureCompactStatusBadgeRow(
    scale,
    theme.iconSize,
    theme.iconOutlineWidth,
    theme.rowOverlap,
    layout
  );
  const stride = statusBadgeStride(
    scale,
    theme.iconSize,
    theme.iconOutlineWidth,
    theme.rowOverlap
  );
  let x = left;

  for (let slot = 0; slot < layout.visibleCount; slot++) {
    const badge = visible[slot];
    if (badge) {
      drawStatusBadge(ctx, x, top, badge, scale, theme);
    }
    x += stride;
  }

  if (overflowCount > 0) {
    drawOverflowCountBadge(ctx, x, top, overflowCount, scale, theme);
  }

  return rowLayout;
}

export function drawOverflowCountBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  overflowCount: number,
  scale: number,
  theme: StatusBadgeTheme
): void {
  const layoutScale = statusBadgeLayoutScale(theme.iconSize);
  const badgeSize = theme.iconSize * scale;
  const slotY = y + STATUS_BADGE_ROW_PAD_Y * layoutScale * scale;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.fillRect(Math.round(x), Math.round(slotY), badgeSize, badgeSize);
  ctx.strokeStyle = 'rgba(143, 168, 200, 0.42)';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    Math.round(x) + 0.5,
    Math.round(slotY) + 0.5,
    badgeSize - 1,
    badgeSize - 1,
  );

  drawStatusStackLabel(
    ctx,
    `+${overflowCount}`,
    x + badgeSize,
    slotY + badgeSize,
    badgeSize,
    theme,
  );
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
  rowOverlap: number
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
      rowOverlap
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

export function resolveStatusBadgeWrapRowGap(
  scale: number,
  rowGap?: number,
): number {
  return rowGap ?? Math.max(2, scale * 2);
}

export function resolveStatusBadgeWrapRowHeight(
  scale: number,
  iconSize: number,
  rowHeight?: number,
): number {
  return rowHeight ?? statusBadgeDrawableRowHeight(scale, iconSize);
}

export function measureStatusBadgeWrap(
  badges: StatusBadgeDrawItem[],
  maxWidth: number,
  scale: number,
  iconSize: number,
  outlineWidth: number,
  rowOverlap = 0,
  rowGap?: number,
  rowHeight?: number,
): StatusBadgeWrapLayout {
  const rows = packBadgesIntoRows(
    badges,
    maxWidth,
    scale,
    iconSize,
    outlineWidth,
    rowOverlap
  );
  const resolvedRowHeight = resolveStatusBadgeWrapRowHeight(
    scale,
    iconSize,
    rowHeight,
  );
  const resolvedRowGap = resolveStatusBadgeWrapRowGap(scale, rowGap);
  const rowWidths = rows.map((row) =>
    statusBadgeRowWidth(row, scale, iconSize, outlineWidth, rowOverlap)
  );
  return {
    rows,
    totalWidth: rowWidths.length > 0 ? Math.max(...rowWidths) : 0,
    totalHeight:
      rows.length > 0
        ? resolvedRowHeight * rows.length +
          resolvedRowGap * (rows.length - 1)
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
  rowGap?: number,
  rowHeight?: number,
  drawTopOffset = 0,
): StatusBadgeWrapLayout {
  prepareStatusBadgeCanvasContext(ctx);
  const layout = measureStatusBadgeWrap(
    badges,
    maxWidth,
    scale,
    theme.iconSize,
    theme.iconOutlineWidth,
    theme.rowOverlap,
    rowGap,
    rowHeight,
  );
  const resolvedRowHeight = resolveStatusBadgeWrapRowHeight(
    scale,
    theme.iconSize,
    rowHeight,
  );
  const resolvedRowGap = resolveStatusBadgeWrapRowGap(scale, rowGap);
  let rowTop = top + drawTopOffset;

  for (const row of layout.rows) {
    const rowW = statusBadgeRowWidth(
      row,
      scale,
      theme.iconSize,
      theme.iconOutlineWidth,
      theme.rowOverlap
    );
    drawStatusBadgeRow(ctx, left + rowW / 2, rowTop, row, scale, theme);
    rowTop += resolvedRowHeight + resolvedRowGap;
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
  resolveIconFallbackColor: (category: StatusDisplayCategory) => string;
  /** 累積数 / +N の描画枠（px）。未指定時は badge スロットに追随 */
  stackLabelSlotPx?: number;
  /** 累積数ビットマップのアウトライン（px）。未指定時は 2 */
  stackLabelOutlinePx?: number;
}

/** 縁取りがキャンバス端で切れないよう確保する余白（px） */
export function statusBadgeOutlinePad(outlineWidth: number, scale = 1): number {
  const widthPx = outlineWidth * scale;
  if (widthPx <= 0) return 0;
  return Math.ceil(widthPx) + 1;
}

/** 1px 刻みの周囲リング。不透明ピクセルのシルエットに沿った縁取り用 */
export function generateOutlineOffsets(
  width: number
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
  height: number
): CanvasRenderingContext2D {
  if (!outlineBuffer) {
    outlineBuffer = document.createElement("canvas");
  }

  outlineBuffer.width = width;
  outlineBuffer.height = height;

  const bufferCtx = outlineBuffer.getContext("2d");
  if (!bufferCtx) throw new Error("Canvas 2D unavailable");

  bufferCtx.clearRect(0, 0, width, height);
  bufferCtx.globalCompositeOperation = "source-over";
  bufferCtx.globalAlpha = 1;
  return preparePixelBufferContext(bufferCtx);
}

function drawSilhouetteOutline(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  outlineColor: string,
  outlineWidth: number
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
  bufferCtx.globalCompositeOperation = "source-in";
  bufferCtx.fillStyle = outlineColor;
  bufferCtx.fillRect(0, 0, bufferW, bufferH);
  bufferCtx.globalCompositeOperation = "source-over";

  ctx.drawImage(
    outlineBuffer!,
    0,
    0,
    bufferW,
    bufferH,
    Math.round(x - pad),
    Math.round(y - pad),
    bufferW,
    bufferH
  );
}

export function drawStatusBadgeRow(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  top: number,
  badges: StatusBadgeDrawItem[],
  scale: number,
  theme: StatusBadgeTheme
): void {
  if (badges.length === 0) return;

  const rowW = statusBadgeRowWidth(
    badges,
    scale,
    theme.iconSize,
    theme.iconOutlineWidth,
    theme.rowOverlap
  );
  let x = centerX - rowW / 2;

  for (const badge of badges) {
    drawStatusBadge(ctx, x, top, badge, scale, theme);
    x += statusBadgeStride(
      scale,
      theme.iconSize,
      theme.iconOutlineWidth,
      theme.rowOverlap
    );
  }
}

function drawStatusStackLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorRight: number,
  anchorBottom: number,
  badgeSize: number,
  theme: StatusBadgeTheme,
): void {
  if (theme.stackLabelSlotPx !== undefined) {
    drawBadgeBitmapLabel(ctx, text, anchorRight, anchorBottom, {
      pixelScale: 1,
      outlineThickness: theme.stackLabelOutlinePx ?? 1,
    });
    return;
  }

  drawBadgeBitmapLabelForBadgeSize(
    ctx,
    text,
    anchorRight,
    anchorBottom,
    badgeSize,
  );
}

function drawStackCountLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  stackCount: number,
  theme: StatusBadgeTheme,
): void {
  drawStatusStackLabel(
    ctx,
    String(stackCount),
    x + size,
    y + size,
    size,
    theme,
  );
}

/** 残り時間オーバーレイのキャッシュ段数（見た目と CPU のバランス） */
export const BADGE_OVERLAY_STEPS = 24;
const MAX_STATUS_BADGE_CACHE_ENTRIES = 512;

export function quantizeBadgeOverlayStep(remainingRatio: number | undefined): number {
  const ratio = remainingRatio ?? 1;
  const elapsed = 1 - Math.max(0, Math.min(1, ratio));
  if (elapsed <= 0) return 0;
  return Math.min(
    BADGE_OVERLAY_STEPS,
    Math.max(1, Math.ceil(elapsed * BADGE_OVERLAY_STEPS)),
  );
}

function remainingRatioForOverlayStep(step: number): number {
  if (step <= 0) return 1;
  return 1 - step / BADGE_OVERLAY_STEPS;
}

const statusBadgeRenderCache = new Map<string, HTMLCanvasElement>();

export function clearStatusBadgeRenderCache(): void {
  statusBadgeRenderCache.clear();
}

function buildStatusBadgeCacheKey(
  badge: StatusBadgeDrawItem,
  badgeSize: number,
  rowHeight: number,
  overlayStep: number,
  theme: StatusBadgeTheme,
  iconOutlineWidth: number,
): string {
  return [
    badge.category,
    badge.kind,
    badge.isPassive ? 1 : 0,
    badge.stackCount ?? 1,
    badgeSize,
    rowHeight,
    overlayStep,
    theme.iconSize,
    theme.overlayColor,
    theme.iconOutlineColor,
    iconOutlineWidth,
  ].join("|");
}

function trimStatusBadgeRenderCache(): void {
  if (statusBadgeRenderCache.size < MAX_STATUS_BADGE_CACHE_ENTRIES) return;
  statusBadgeRenderCache.clear();
}

interface BadgeLayoutMetrics {
  badgeSize: number;
  rowHeight: number;
  slotY: number;
  pentagonPx: number;
  pentagonOffsetY: number;
  iconDrawSize: number;
  iconInset: number;
  iconOutlineWidth: number;
}

function computeBadgeLayoutMetricsForBadge(
  badge: StatusBadgeDrawItem,
  scale: number,
  theme: StatusBadgeTheme,
): BadgeLayoutMetrics {
  const compact = isCompactStatusBadgeIconSize(theme.iconSize);
  const layoutScale = compact ? statusBadgeLayoutScale(theme.iconSize) : 1;
  const badgeSize = theme.iconSize * scale;
  const rowHeight = statusBadgeDrawableRowHeight(scale, theme.iconSize);
  const slotY = compact
    ? STATUS_BADGE_ROW_PAD_Y * layoutScale * scale
    : STATUS_BADGE_ROW_PAD_Y * scale;
  const pentagonPx = compact
    ? STATUS_BADGE_PENTAGON_PX * layoutScale
    : STATUS_BADGE_PENTAGON_PX;
  const iconDrawSize = compact
    ? STATUS_BADGE_EFFECT_ICON_PX * layoutScale
    : STATUS_BADGE_EFFECT_ICON_PX;
  const iconInset = compact
    ? STATUS_BADGE_EFFECT_ICON_INSET_PX * layoutScale
    : STATUS_BADGE_EFFECT_ICON_INSET_PX;
  const iconOutlineWidth = compact
    ? theme.iconOutlineWidth * layoutScale
    : theme.iconOutlineWidth *
      (iconDrawSize / Math.max(1, theme.iconSize));

  return {
    badgeSize,
    rowHeight,
    slotY,
    pentagonPx,
    pentagonOffsetY: compact
      ? statusBadgePentagonOffsetY(badge.kind) * layoutScale
      : statusBadgePentagonOffsetY(badge.kind),
    iconDrawSize,
    iconInset,
    iconOutlineWidth,
  };
}

function paintStatusBadgeBuffer(
  bufferCtx: CanvasRenderingContext2D,
  badge: StatusBadgeDrawItem,
  metrics: BadgeLayoutMetrics,
  theme: StatusBadgeTheme,
  overlayRemainingRatio: number,
): void {
  const outlineColor = theme.iconOutlineColor;
  const {
    badgeSize,
    rowHeight,
    slotY,
    pentagonPx,
    pentagonOffsetY,
    iconDrawSize,
    iconInset,
    iconOutlineWidth,
  } = metrics;

  bufferCtx.clearRect(0, 0, badgeSize, rowHeight);

  if (badge.isPassive) {
    bufferCtx.save();
    bufferCtx.globalAlpha = STATUS_BADGE_PASSIVE_ALPHA;
  }

  const pentagon = getStatusBadgePentagonImage(badge.kind, badge.isPassive);
  if (pentagon) {
    drawImagePixelated(
      bufferCtx,
      pentagon,
      0,
      slotY + pentagonOffsetY,
      pentagonPx,
      pentagonPx,
    );
  }

  const iconTint = statusBadgeUsesWhiteSilhouette(badge.category)
    ? "#ffffff"
    : undefined;

  drawStatusIcon(
    bufferCtx,
    badge.category,
    iconInset,
    slotY + iconInset,
    iconDrawSize,
    iconTint,
    theme,
    outlineColor,
    iconOutlineWidth,
  );

  applyRemainingOverlayPixels(
    bufferCtx,
    badgeSize,
    rowHeight,
    overlayRemainingRatio,
    theme.overlayColor,
  );

  if (badge.stackCount !== undefined && badge.stackCount > 1) {
    drawStackCountLabel(
      bufferCtx,
      0,
      slotY,
      badgeSize,
      badge.stackCount,
      theme,
    );
  }

  if (badge.isPassive) {
    bufferCtx.restore();
  }
}

function getCachedStatusBadgeImage(
  badge: StatusBadgeDrawItem,
  scale: number,
  theme: StatusBadgeTheme,
): HTMLCanvasElement {
  const metrics = computeBadgeLayoutMetricsForBadge(badge, scale, theme);
  const overlayStep = quantizeBadgeOverlayStep(badge.remainingRatio);
  const key = buildStatusBadgeCacheKey(
    badge,
    metrics.badgeSize,
    metrics.rowHeight,
    overlayStep,
    theme,
    metrics.iconOutlineWidth,
  );
  const cached = statusBadgeRenderCache.get(key);
  if (cached) return cached;

  trimStatusBadgeRenderCache();
  const canvas = document.createElement("canvas");
  canvas.width = metrics.badgeSize;
  canvas.height = metrics.rowHeight;
  const bufferCtx = canvas.getContext("2d");
  if (!bufferCtx) throw new Error("Canvas 2D unavailable");
  paintStatusBadgeBuffer(
    preparePixelBufferContext(bufferCtx),
    badge,
    metrics,
    theme,
    remainingRatioForOverlayStep(overlayStep),
  );
  statusBadgeRenderCache.set(key, canvas);
  return canvas;
}

export function drawStatusBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  rowTop: number,
  badge: StatusBadgeDrawItem,
  scale: number,
  theme: StatusBadgeTheme
): void {
  const image = getCachedStatusBadgeImage(badge, scale, theme);
  prepareStatusBadgeCanvasContext(ctx);
  ctx.drawImage(
    image,
    Math.round(x),
    Math.round(rowTop),
    image.width,
    image.height,
  );
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
  outlineWidthPx: number
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
        outlineWidthPx
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
        outlineWidthPx
      );
    }
    return;
  }

  ctx.fillStyle =
    whiteSilhouetteTint ?? theme.resolveIconFallbackColor(category);
  ctx.globalAlpha = theme.iconFallbackAlpha;
  ctx.fillRect(x + size * 0.15, y + size * 0.15, size * 0.7, size * 0.7);
  ctx.globalAlpha = 1;
}

let tintBuffer: HTMLCanvasElement | null = null;

function getTintBuffer(
  width: number,
  height: number
): CanvasRenderingContext2D {
  if (!tintBuffer) {
    tintBuffer = document.createElement("canvas");
  }

  if (tintBuffer.width !== width || tintBuffer.height !== height) {
    tintBuffer.width = width;
    tintBuffer.height = height;
  }

  const bufferCtx = tintBuffer.getContext("2d");
  if (!bufferCtx) throw new Error("Canvas 2D unavailable");

  bufferCtx.clearRect(0, 0, width, height);
  return preparePixelBufferContext(bufferCtx);
}

export function parseOverlayDarkenAlpha(overlayColor: string): number {
  const rgba = overlayColor.match(
    /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/i,
  );
  if (rgba) return Math.max(0, Math.min(1, Number(rgba[1])));
  return 0.55;
}

export function overlayMultiplyFillStyle(overlayColor: string): string {
  const shade = Math.round(255 * (1 - parseOverlayDarkenAlpha(overlayColor)));
  return `rgb(${shade}, ${shade}, ${shade})`;
}

/** alpha > 0 のピクセルのみ、上端から elapsed 分を暗化（2値 alpha 向け） */
export function darkenBadgeOverlayBand(
  data: Uint8ClampedArray,
  width: number,
  bandBottom: number,
  overlayColor: string,
): void {
  if (bandBottom <= 0) return;

  const factor = 1 - parseOverlayDarkenAlpha(overlayColor);
  const rowBytes = width * 4;

  for (let rowStart = 0; rowStart < bandBottom * rowBytes; rowStart += rowBytes) {
    for (let i = rowStart; i < rowStart + rowBytes; i += 4) {
      if (data[i + 3] === 0) continue;
      data[i] = Math.round(data[i] * factor);
      data[i + 1] = Math.round(data[i + 1] * factor);
      data[i + 2] = Math.round(data[i + 2] * factor);
    }
  }
}

export function applyRemainingOverlayPixels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  remainingRatio: number,
  overlayColor: string,
): void {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(remainingRatio)
  ) {
    return;
  }
  const elapsedRatio = 1 - Math.max(0, Math.min(1, remainingRatio));
  if (elapsedRatio <= 0) return;

  const pixelWidth = Math.max(0, Math.floor(width));
  const pixelHeight = Math.max(0, Math.floor(height));
  const bandBottom = Math.min(
    pixelHeight,
    Math.ceil(pixelHeight * elapsedRatio),
  );
  if (pixelWidth <= 0 || bandBottom <= 0) return;

  const imageData = ctx.getImageData(0, 0, pixelWidth, bandBottom);
  darkenBadgeOverlayBand(
    imageData.data,
    pixelWidth,
    bandBottom,
    overlayColor,
  );
  ctx.putImageData(imageData, 0, 0);
}

function resolveImageSourceSize(
  image: CanvasImageSource,
  fallback: number
): { width: number; height: number } {
  if (
    typeof image === "object" &&
    image !== null &&
    "naturalWidth" in image &&
    typeof (image as HTMLImageElement).naturalWidth === "number"
  ) {
    const img = image as HTMLImageElement;
    return {
      width: img.naturalWidth || fallback,
      height: img.naturalHeight || fallback,
    };
  }
  if (
    typeof image === "object" &&
    image !== null &&
    "width" in image &&
    "height" in image &&
    typeof (image as HTMLCanvasElement).width === "number" &&
    typeof (image as HTMLCanvasElement).height === "number"
  ) {
    const canvas = image as HTMLCanvasElement;
    return { width: canvas.width, height: canvas.height };
  }
  return { width: fallback, height: fallback };
}

function drawImagePixelated(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  prepareStatusBadgeCanvasContext(ctx);
  const source = resolveImageSourceSize(image, width);
  ctx.drawImage(
    image,
    0,
    0,
    source.width,
    source.height,
    Math.round(x),
    Math.round(y),
    Math.round(width),
    Math.round(height)
  );
}

function drawPlainImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  outlineColor: string,
  outlineWidth: number
): void {
  drawSilhouetteOutline(
    ctx,
    image,
    x,
    y,
    width,
    height,
    outlineColor,
    outlineWidth
  );

  drawImagePixelated(ctx, image, x, y, width, height);
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
  outlineWidth: number
): void {
  drawSilhouetteOutline(
    ctx,
    image,
    x,
    y,
    width,
    height,
    outlineColor,
    outlineWidth
  );

  const bufferW = Math.ceil(width);
  const bufferH = Math.ceil(height);
  const bufferCtx = getTintBuffer(bufferW, bufferH);

  bufferCtx.drawImage(image, 0, 0, bufferW, bufferH);
  bufferCtx.globalCompositeOperation = "source-in";
  bufferCtx.fillStyle = color;
  bufferCtx.fillRect(0, 0, bufferW, bufferH);
  bufferCtx.globalCompositeOperation = "source-over";

  prepareStatusBadgeCanvasContext(ctx);
  ctx.drawImage(
    tintBuffer!,
    0,
    0,
    bufferW,
    bufferH,
    Math.round(x),
    Math.round(y),
    Math.round(width),
    Math.round(height)
  );
}

onStatusIconsReady(() => {
  clearStatusBadgeRenderCache();
});
