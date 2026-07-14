import { describe, expect, it } from 'vitest';
import {
  FIELD_VISUAL_DEPTH_RISE_PX,
  GRASS_TILE_BOTTOM_SHADE_ROWS,
  GRASS_TILE_HORIZON_ROWS,
  grassTileRepeatSource,
  staticGrassBandLayout,
  wrapScrollOffset,
} from './battleFieldBackground.ts';
import { BATTLE_FIELD_SPRITE_SCALE, GRASS_BAND_H } from './formationLayout.ts';
import {
  MAX_VISUAL_DEPTH_RISE,
  maxVisualDepthOffsetPx,
  maxVisualDepthRisePx,
} from './spriteVisualDepth.ts';

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
  it('aligns grass/sky seam with max swarm visual-depth rise at field scale', () => {
    const groundLineY = 100;
    const layout = staticGrassBandLayout(groundLineY);
    expect(FIELD_VISUAL_DEPTH_RISE_PX).toBe(
      maxVisualDepthRisePx(BATTLE_FIELD_SPRITE_SCALE),
    );
    expect(FIELD_VISUAL_DEPTH_RISE_PX).toBe(
      MAX_VISUAL_DEPTH_RISE * BATTLE_FIELD_SPRITE_SCALE,
    );
    expect(layout.grassTop).toBe(groundLineY - FIELD_VISUAL_DEPTH_RISE_PX);
    expect(layout.grassHeight).toBe(GRASS_BAND_H + FIELD_VISUAL_DEPTH_RISE_PX);
    expect(FIELD_VISUAL_DEPTH_RISE_PX).toBeGreaterThan(
      maxVisualDepthOffsetPx(BATTLE_FIELD_SPRITE_SCALE),
    );
  });
});

describe('grassTileRepeatSource', () => {
  it('excludes horizon and bottom shade rows so vertical seams stay grass-only', () => {
    const tileW = 64;
    const tileH = 54;
    const src = grassTileRepeatSource(tileW, tileH);
    expect(src).toEqual({
      srcX: 0,
      srcY: GRASS_TILE_HORIZON_ROWS,
      srcW: tileW,
      srcH: tileH - GRASS_TILE_HORIZON_ROWS - GRASS_TILE_BOTTOM_SHADE_ROWS,
    });
    expect(src!.srcY).toBe(4);
    expect(src!.srcH).toBe(43);
  });

  it('returns null when crop would be empty', () => {
    expect(grassTileRepeatSource(64, 10)).toBeNull();
  });
});
