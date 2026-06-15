import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __registerEntityBodyForTest,
  __resetEntityAtlasForTest,
  getEntityAnimSpriteDef,
  getEntityFrameRect,
  hasEntityBodyAtlas,
} from './entityAtlas.ts';
import { drawSpriteFrameAtFootAnchor } from './spriteFrameDraw.ts';
import {
  __registerEntityAnimForTest,
  __resetSpriteSheetsForTest,
} from './spriteSheetRegistry.ts';

function mockImage(width: number, height = 48): HTMLImageElement {
  return { width, height } as HTMLImageElement;
}

describe('entityAtlas layout', () => {
  afterEach(() => {
    __resetEntityAtlasForTest();
  });

  it('maps idle/move/death frames to atlas rows', () => {
    expect(getEntityFrameRect('df_guardian', 'idle', 0)).toMatchObject({
      sx: 0,
      sy: 0,
      sw: 48,
      sh: 48,
      clampedFrame: 0,
    });
    expect(getEntityFrameRect('df_guardian', 'move', 2)).toMatchObject({
      sx: 96,
      sy: 48,
      clampedFrame: 2,
    });
    expect(getEntityFrameRect('df_guardian', 'death', 2)).toMatchObject({
      sx: 96,
      sy: 96,
      clampedFrame: 2,
    });
  });

  it('clamps frame index to anim length', () => {
    expect(getEntityFrameRect('any', 'death', 99).clampedFrame).toBe(2);
    expect(getEntityFrameRect('any', 'idle', -3).clampedFrame).toBe(0);
  });

  it('exposes sprite defs aligned with layout json', () => {
    expect(getEntityAnimSpriteDef('idle')).toEqual({
      frames: 4,
      fps: 8,
      loop: true,
    });
    expect(getEntityAnimSpriteDef('death')).toEqual({
      frames: 3,
      fps: 8,
      loop: false,
    });
  });

  it('registers body atlas for preload lookup', () => {
    expect(hasEntityBodyAtlas('df_guardian')).toBe(false);
    __registerEntityBodyForTest('df_guardian', mockImage(192, 144));
    expect(hasEntityBodyAtlas('df_guardian')).toBe(true);
  });
});

describe('drawSpriteFrameAtFootAnchor body atlas', () => {
  afterEach(() => {
    __resetEntityAtlasForTest();
    __resetSpriteSheetsForTest();
    vi.restoreAllMocks();
  });

  it('draws from body atlas when present', () => {
    const atlas = mockImage(192, 144);
    __registerEntityBodyForTest('df_guardian', atlas);
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;

    drawSpriteFrameAtFootAnchor(ctx, 'df_guardian', 'idle', 1, 16, 32, 32, 32, 1);

    expect(drawImage).toHaveBeenCalledWith(
      atlas,
      48,
      0,
      48,
      48,
      -8,
      -16,
      48,
      48,
    );
  });

  it('falls back to legacy per-anim sheet when body atlas is missing', () => {
    const legacy = mockImage(192);
    __registerEntityAnimForTest('df_guardian', 'idle', legacy);
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;

    drawSpriteFrameAtFootAnchor(ctx, 'df_guardian', 'idle', 2, 16, 32, 32, 32, 1);

    expect(drawImage).toHaveBeenCalledWith(
      legacy,
      96,
      0,
      48,
      48,
      -8,
      -16,
      48,
      48,
    );
  });
});
