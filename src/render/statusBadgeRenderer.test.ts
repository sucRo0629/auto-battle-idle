import { describe, expect, it, vi } from 'vitest';
import {
  drawStatusBadgeBlock,
  measureStatusBadgeBlock,
  statusBadgeRowWidth,
  statusBadgeStride,
} from './statusBadgeRenderer.ts';

const hot = { category: 'hot' as const, kind: 'buff' as const, remainingRatio: 1, isPassive: false };
const dot = { category: 'dot' as const, kind: 'debuff' as const, remainingRatio: 1, isPassive: false };
const atk = { category: 'atk' as const, kind: 'buff' as const, remainingRatio: 1, isPassive: false };
const passiveAtk = { category: 'atk' as const, kind: 'buff' as const, remainingRatio: 1, isPassive: true };

describe('statusBadgeRowWidth', () => {
  it('includes outline clearance between adjacent badges', () => {
    expect(statusBadgeRowWidth([hot, dot], 1, 8, 1, 0)).toBe(20);
  });

  it('matches legacy width when outline is disabled', () => {
    expect(statusBadgeRowWidth([hot, dot], 1, 8, 0, 0)).toBe(16);
  });

  it('adds outline clearance for each additional badge', () => {
    expect(statusBadgeRowWidth([atk, hot, dot], 1, 8, 1, 0)).toBe(32);
  });
});

describe('measureStatusBadgeBlock', () => {
  it('splits passive badges into rows of four', () => {
    const layout = measureStatusBadgeBlock(
      [
        passiveAtk,
        { ...passiveAtk, category: 'def' as const },
        { ...passiveAtk, category: 'reg' as const },
        { ...passiveAtk, category: 'attackSpeed' as const },
        { ...passiveAtk, category: 'damageReduction' as const },
        { ...passiveAtk, category: 'damageIncrease' as const },
        { ...passiveAtk, category: 'hot' as const },
        { ...passiveAtk, category: 'dot' as const },
        { ...passiveAtk, category: 'block' as const },
      ],
      1,
      8,
      1,
      0,
    );

    expect(layout.isMultilinePassive).toBe(true);
    expect(layout.passiveRows).toHaveLength(3);
    expect(layout.passiveRows[0]).toHaveLength(4);
    expect(layout.passiveRows[1]).toHaveLength(4);
    expect(layout.passiveRows[2]).toHaveLength(1);
  });
});

describe('drawStatusBadgeBlock', () => {
  it('stacks later passive rows above the first row', () => {
    const drawImages: Array<{ x: number; y: number; width: number; height: number }> = [];
    const bufferCtx = {
      clearRect() {},
      drawImage() {},
      fillRect() {},
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
    };
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => bufferCtx,
        width: 0,
        height: 0,
      }),
    });
    const ctx = {
      save() {},
      restore() {},
      clearRect() {},
      drawImage(
        _image: CanvasImageSource,
        _sx: number,
        _sy: number,
        _sw: number,
        _sh: number,
        dx: number,
        dy: number,
        dw: number,
        dh: number,
      ) {
        drawImages.push({ x: dx, y: dy, width: dw, height: dh });
      },
      fillRect() {},
    } as unknown as CanvasRenderingContext2D;

    try {
      drawStatusBadgeBlock(
        ctx,
        0,
        0,
        [passiveAtk, passiveAtk, passiveAtk, passiveAtk, passiveAtk],
        1,
        {
          buffColor: '#fff',
          debuffColor: '#f00',
          iconSize: 8,
          rowOverlap: 0,
          overlayColor: '#000',
          iconOutlineColor: '#000',
          passiveIconOutlineColor: '#fff',
          iconOutlineWidth: 0,
          iconFallbackAlpha: 0,
          resolveIconFallbackColor: () => '#888',
        },
      );

      expect(drawImages.length).toBeGreaterThan(0);
      expect(drawImages[0]?.y).toBeGreaterThan(drawImages[4]?.y ?? -1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('statusBadgeStride', () => {
  it('adds 2px outline pad per side between icons', () => {
    expect(statusBadgeStride(1, 8, 1, 0)).toBe(12);
  });
});
