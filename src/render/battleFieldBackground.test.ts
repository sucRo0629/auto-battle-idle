import { describe, expect, it } from 'vitest';
import { staticGrassBandLayout, wrapScrollOffset } from './battleFieldBackground.ts';
import { GRASS_BAND_H } from './formationLayout.ts';
import { MAX_VISUAL_DEPTH_RISE } from './spriteVisualDepth.ts';

describe('wrapScrollOffset', () => {
  it('wraps negative offsets into tile width range', () => {
    expect(wrapScrollOffset(0, 64)).toBe(0);
    expect(wrapScrollOffset(32, 64)).toBe(32);
    expect(wrapScrollOffset(64, 64)).toBe(0);
    expect(wrapScrollOffset(100, 64)).toBe(28);
  });

  it('floors fractional offsets before wrapping', () => {
    expect(wrapScrollOffset(32.9, 64)).toBe(wrapScrollOffset(32, 64));
    expect(wrapScrollOffset(100.7, 64)).toBe(wrapScrollOffset(100, 64));
  });

  it('returns 0 for invalid tile width', () => {
    expect(wrapScrollOffset(50, 0)).toBe(0);
  });
});

describe('staticGrassBandLayout', () => {
  it('extends grass above max sprite depth offset with one-step margin', () => {
    const groundLineY = 100;
    const layout = staticGrassBandLayout(groundLineY);
    expect(layout.grassTop).toBe(groundLineY - MAX_VISUAL_DEPTH_RISE);
    expect(layout.grassHeight).toBe(GRASS_BAND_H + MAX_VISUAL_DEPTH_RISE);
    expect(MAX_VISUAL_DEPTH_RISE).toBeGreaterThan(30);
  });
});
