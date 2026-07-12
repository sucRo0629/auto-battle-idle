import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __setSpriteBufferForTest,
  drawSpriteWithBuffGlow,
} from './buffGlowEffect.ts';

describe('drawSpriteWithBuffGlow', () => {
  afterEach(() => {
    __setSpriteBufferForTest(null);
  });

  it('blits the glow buffer at the layout origin on the battlefield', () => {
    const layoutSize = 64;
    const bufferSize = 96;
    const pixelSize = 96;
    const anchorX = 280;
    const anchorY = 160;

    const bufferCtx = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(pixelSize * pixelSize * 4),
      })),
      putImageData: vi.fn(),
    };

    __setSpriteBufferForTest({
      width: pixelSize,
      height: pixelSize,
      getContext: vi.fn(() => bufferCtx),
    } as unknown as HTMLCanvasElement);

    const save = vi.fn();
    const restore = vi.fn();
    const translate = vi.fn();
    const drawImage = vi.fn();

    const ctx = {
      save,
      restore,
      translate,
      drawImage,
    } as unknown as CanvasRenderingContext2D;

    drawSpriteWithBuffGlow(
      ctx,
      bufferSize,
      layoutSize,
      0.5,
      (localCtx) => {
        localCtx.fillRect(0, 0, 1, 1);
      },
      255,
      255,
      255,
      anchorX,
      anchorY,
    );

    expect(translate).toHaveBeenCalledWith(anchorX, anchorY);
    expect(save).toHaveBeenCalled();
    expect(restore).toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      pixelSize,
      pixelSize,
      layoutSize / 2 - pixelSize / 2,
      layoutSize - pixelSize,
      pixelSize,
      pixelSize,
    );
  });
});
