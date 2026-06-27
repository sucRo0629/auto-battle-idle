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
const OUTLINE_THICKNESS = 2;

export const BADGE_BITMAP_LABEL_HEIGHT = GLYPH_HEIGHT;

interface ParsedGlyph {
  white: ReadonlySet<string>;
  black: ReadonlySet<string>;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const PARSED_GLYPHS = new Map<string, ParsedGlyph>();

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

function parseGlyph(char: string): ParsedGlyph {
  const cached = PARSED_GLYPHS.get(char);
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
    PARSED_GLYPHS.set(char, empty);
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
    for (let dy = -OUTLINE_THICKNESS; dy <= OUTLINE_THICKNESS; dy++) {
      for (let dx = -OUTLINE_THICKNESS; dx <= OUTLINE_THICKNESS; dx++) {
        const neighbor = `${sx + dx},${sy + dy}`;
        if (!white.has(neighbor)) black.add(neighbor);
      }
    }
  }

  const allKeys = [...white, ...black];
  const { minX, maxX, minY, maxY } = computeBounds(allKeys);
  const parsed = { white, black, minX, maxX, minY, maxY };
  PARSED_GLYPHS.set(char, parsed);
  return parsed;
}

/** 16px バッジ基準の整数スケール（8px バッジは 1、16px は 1、32px は 2） */
export function resolveBadgeLabelPixelScale(badgeSize: number): number {
  return Math.max(1, Math.round(badgeSize / 16));
}

/** @deprecated resolveBadgeLabelPixelScale のエイリアス（テスト互換） */
export function resolveBadgeLabelFontSize(badgeSize: number): number {
  return resolveBadgeLabelPixelScale(badgeSize) * BADGE_BITMAP_LABEL_HEIGHT;
}

export function measureBadgeBitmapLabel(
  text: string,
  pixelScale: number,
): { width: number; height: number } {
  const chars = [...text];
  if (chars.length === 0) return { width: 0, height: 0 };

  let width = 0;
  let maxHeight = 0;
  for (let i = 0; i < chars.length; i++) {
    const { minX, maxX, minY, maxY } = parseGlyph(chars[i]!);
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
): void {
  const { white, black } = parseGlyph(char);

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

/** 文字列右端・下端を anchorRight / anchorBottom に揃えて描画 */
export function drawBadgeBitmapLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorRight: number,
  anchorBottom: number,
  pixelScale: number,
): void {
  const chars = [...text];
  if (chars.length === 0) return;

  const anchorX = Math.round(anchorRight);
  const anchorY = Math.round(anchorBottom);
  let cursorRight = anchorX;

  for (let i = chars.length - 1; i >= 0; i--) {
    const char = chars[i]!;
    const { minX, maxX, minY, maxY } = parseGlyph(char);
    const originX = cursorRight - (maxX - minX + 1) * pixelScale;
    const originY = anchorY - (maxY - minY + 1) * pixelScale;
    drawGlyph(ctx, char, originX, originY, pixelScale, minX, minY);
    cursorRight = originX;
    if (i > 0) cursorRight -= GLYPH_GAP * pixelScale;
  }
}
