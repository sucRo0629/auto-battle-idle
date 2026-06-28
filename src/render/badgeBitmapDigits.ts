/** 5×7 白ピクセルコア（'.' 透明 '#' 白） */
const GLYPH_ROWS: Record<string, readonly string[]> = {
  '0': ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['#####', '....#', '....#', '#####', '#....', '#....', '#####'],
  '3': ['#####', '....#', '....#', '#####', '....#', '....#', '#####'],
  '4': ['#...#', '#...#', '#...#', '#####', '....#', '....#', '....#'],
  '5': ['#####', '#....', '#....', '#####', '....#', '....#', '#####'],
  '6': ['#####', '#....', '#....', '#####', '#...#', '#...#', '#####'],
  '7': ['#####', '....#', '....#', '...#.', '..#..', '.#...', '.#...'],
  '8': ['#####', '#...#', '#...#', '#####', '#...#', '#...#', '#####'],
  '9': ['#####', '#...#', '#...#', '#####', '....#', '....#', '#####'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
};

const GLYPH_HEIGHT = 7;
const GLYPH_GAP = 1;
export const BADGE_BITMAP_LABEL_DEFAULT_OUTLINE_PX = 2;

export const BADGE_BITMAP_LABEL_HEIGHT = GLYPH_HEIGHT;

/** 累積数ラベルの正本バッジ幅（`STATUS_BADGE_SLOT_PX` と同値） */
export const BADGE_LABEL_REFERENCE_PX = 20;

export interface BadgeBitmapLabelDrawOptions {
  pixelScale: number;
  outlineThickness?: number;
}

interface ParsedGlyph {
  white: ReadonlySet<string>;
  black: ReadonlySet<string>;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const PARSED_GLYPHS = new Map<string, ParsedGlyph>();

function glyphCacheKey(char: string, outlineThickness: number): string {
  return `${char}:${outlineThickness}`;
}

function computeBounds(keys: Iterable<string>): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const key of keys) {
    const [x, y] = key.split(',').map(Number);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

function parseGlyph(char: string, outlineThickness: number): ParsedGlyph {
  const cacheKey = glyphCacheKey(char, outlineThickness);
  const cached = PARSED_GLYPHS.get(cacheKey);
  if (cached) return cached;

  const rows = GLYPH_ROWS[char];
  if (!rows) {
    const empty = {
      white: new Set<string>(),
      black: new Set<string>(),
      minX: 0,
      maxX: -1,
      minY: 0,
      maxY: -1,
    };
    PARSED_GLYPHS.set(cacheKey, empty);
    return empty;
  }

  const white = new Set<string>();
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') white.add(`${x},${y}`);
    }
  }

  const black = new Set<string>();
  for (const key of white) {
    const [sx, sy] = key.split(',').map(Number);
    for (let dy = -outlineThickness; dy <= outlineThickness; dy++) {
      for (let dx = -outlineThickness; dx <= outlineThickness; dx++) {
        const neighbor = `${sx + dx},${sy + dy}`;
        if (!white.has(neighbor)) black.add(neighbor);
      }
    }
  }

  const allKeys = [...white, ...black];
  const { minX, maxX, minY, maxY } = computeBounds(allKeys);
  const parsed = { white, black, minX, maxX, minY, maxY };
  PARSED_GLYPHS.set(cacheKey, parsed);
  return parsed;
}

/** 20px バッジ基準の整数 pixelScale（20px 未満は 1x のまま描画して潰れを防ぐ） */
export function resolveBadgeLabelPixelScale(badgeSize: number): number {
  if (badgeSize >= BADGE_LABEL_REFERENCE_PX) {
    return Math.max(1, Math.round(badgeSize / BADGE_LABEL_REFERENCE_PX));
  }
  return 1;
}

/** バッジサイズに比例したラベル表示倍率（20px = 1）。20px 未満は整数 1x 描画。 */
export function resolveBadgeLabelLayoutScale(badgeSize: number): number {
  if (badgeSize >= BADGE_LABEL_REFERENCE_PX) {
    return badgeSize / BADGE_LABEL_REFERENCE_PX;
  }
  return 1;
}

/** @deprecated resolveBadgeLabelPixelScale のエイリアス（テスト互換） */
export function resolveBadgeLabelFontSize(badgeSize: number): number {
  return BADGE_BITMAP_LABEL_HEIGHT * resolveBadgeLabelPixelScale(badgeSize);
}

export function measureBadgeBitmapLabel(
  text: string,
  pixelScale: number,
  outlineThickness = BADGE_BITMAP_LABEL_DEFAULT_OUTLINE_PX,
): { width: number; height: number } {
  const chars = [...text];
  if (chars.length === 0) return { width: 0, height: 0 };

  let width = 0;
  let maxHeight = 0;
  for (let i = 0; i < chars.length; i++) {
    const { minX, maxX, minY, maxY } = parseGlyph(
      chars[i]!,
      outlineThickness,
    );
    width += (maxX - minX + 1) * pixelScale;
    if (i > 0) width += GLYPH_GAP * pixelScale;
    maxHeight = Math.max(maxHeight, (maxY - minY + 1) * pixelScale);
  }
  return { width, height: maxHeight };
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  char: string,
  originX: number,
  originY: number,
  pixelScale: number,
  minX: number,
  minY: number,
  outlineThickness: number,
): void {
  const { white, black } = parseGlyph(char, outlineThickness);

  ctx.fillStyle = '#000000';
  for (const key of black) {
    const [x, y] = key.split(',').map(Number);
    ctx.fillRect(
      originX + (x - minX) * pixelScale,
      originY + (y - minY) * pixelScale,
      pixelScale,
      pixelScale,
    );
  }

  ctx.fillStyle = '#ffffff';
  for (const key of white) {
    const [x, y] = key.split(',').map(Number);
    ctx.fillRect(
      originX + (x - minX) * pixelScale,
      originY + (y - minY) * pixelScale,
      pixelScale,
      pixelScale,
    );
  }
}

function resolveBadgeBitmapLabelDrawOptions(
  pixelScaleOrOptions: number | BadgeBitmapLabelDrawOptions,
): Required<BadgeBitmapLabelDrawOptions> {
  if (typeof pixelScaleOrOptions === 'number') {
    return {
      pixelScale: pixelScaleOrOptions,
      outlineThickness: BADGE_BITMAP_LABEL_DEFAULT_OUTLINE_PX,
    };
  }
  return {
    pixelScale: pixelScaleOrOptions.pixelScale,
    outlineThickness:
      pixelScaleOrOptions.outlineThickness ??
      BADGE_BITMAP_LABEL_DEFAULT_OUTLINE_PX,
  };
}

/** 文字列右端・下端を anchorRight / anchorBottom に揃えて描画 */
export function drawBadgeBitmapLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorRight: number,
  anchorBottom: number,
  pixelScaleOrOptions: number | BadgeBitmapLabelDrawOptions,
): void {
  const { pixelScale, outlineThickness } =
    resolveBadgeBitmapLabelDrawOptions(pixelScaleOrOptions);
  const chars = [...text];
  if (chars.length === 0) return;

  const anchorX = Math.round(anchorRight);
  const anchorY = Math.round(anchorBottom);
  let cursorRight = anchorX;

  for (let i = chars.length - 1; i >= 0; i--) {
    const char = chars[i]!;
    const { minX, maxX, minY, maxY } = parseGlyph(char, outlineThickness);
    const originX = cursorRight - (maxX - minX + 1) * pixelScale;
    const originY = anchorY - (maxY - minY + 1) * pixelScale;
    drawGlyph(
      ctx,
      char,
      originX,
      originY,
      pixelScale,
      minX,
      minY,
      outlineThickness,
    );
    cursorRight = originX;
    if (i > 0) cursorRight -= GLYPH_GAP * pixelScale;
  }
}

/** バッジサイズに応じた累積数 / +N（整数 pixelScale のみ） */
export function drawBadgeBitmapLabelForBadgeSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorRight: number,
  anchorBottom: number,
  badgeSize: number,
): void {
  drawBadgeBitmapLabel(
    ctx,
    text,
    anchorRight,
    anchorBottom,
    resolveBadgeLabelPixelScale(badgeSize),
  );
}
