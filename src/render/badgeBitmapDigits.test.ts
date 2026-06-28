import { describe, expect, it } from 'vitest';
import {
  drawBadgeBitmapLabel,
  measureBadgeBitmapLabel,
  resolveBadgeLabelFontSize,
  resolveBadgeLabelPixelScale,
} from './badgeBitmapDigits.ts';

describe('resolveBadgeLabelPixelScale', () => {
  it('uses 1x glyphs on 16px badges and 2x on 32px', () => {
    expect(resolveBadgeLabelPixelScale(16)).toBe(1);
    expect(resolveBadgeLabelPixelScale(8)).toBe(1);
    expect(resolveBadgeLabelPixelScale(32)).toBe(2);
  });
});

describe('resolveBadgeLabelFontSize', () => {
  it('returns glyph height scaled to 20px reference badge', () => {
    expect(resolveBadgeLabelFontSize(20)).toBe(7);
    expect(resolveBadgeLabelFontSize(16)).toBe(6);
    expect(resolveBadgeLabelFontSize(14)).toBe(5);
    expect(resolveBadgeLabelFontSize(32)).toBe(11);
  });
});

describe('measureBadgeBitmapLabel', () => {
  it('includes gap and outline padding between digits', () => {
    expect(measureBadgeBitmapLabel('3', 1)).toEqual({ width: 9, height: 11 });
    expect(measureBadgeBitmapLabel('12', 1)).toEqual({ width: 17, height: 11 });
    expect(measureBadgeBitmapLabel('+2', 1)).toEqual({ width: 19, height: 11 });
  });
});

describe('drawBadgeBitmapLabel', () => {
  it('aligns bottom-right of label with anchor', () => {
    const fills: Array<{ x: number; y: number; w: number; h: number }> = [];
    const ctx = {
      fillStyle: '#000',
      fillRect(x: number, y: number, w: number, h: number) {
        fills.push({ x, y, w, h });
      },
    } as unknown as CanvasRenderingContext2D;

    drawBadgeBitmapLabel(ctx, '3', 16, 16, 1);

    const maxX = Math.max(...fills.map((f) => f.x + f.w));
    const maxY = Math.max(...fills.map((f) => f.y + f.h));
    expect(maxX).toBe(16);
    expect(maxY).toBe(16);
    expect(Math.min(...fills.map((f) => f.x))).toBe(16 - 9);
    expect(Math.min(...fills.map((f) => f.y))).toBe(16 - 11);
  });
});
