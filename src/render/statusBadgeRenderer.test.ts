import { describe, expect, it, vi } from 'vitest';
import {
  drawStatusBadgeBlock,
  measureStatusBadgeBlock,
  statusBadgeRowWidth,
  statusBadgeStride,
  statusBadgeWidth,
} from './statusBadgeRenderer.ts';

const hot = { category: 'hot' as const, kind: 'buff' as const, remainingRatio: 1, isPassive: false };
const dot = { category: 'dot' as const, kind: 'debuff' as const, remainingRatio: 1, isPassive: false };
const atk = { category: 'atk' as const, kind: 'buff' as const, remainingRatio: 1, isPassive: false };
const passiveAtk = { category: 'atk' as const, kind: 'buff' as const, remainingRatio: 1, isPassive: true };

describe('statusBadgeWidth', () => {
  it('matches icon size at scale 1', () => {
    expect(statusBadgeWidth(1, 16)).toBe(16);
  });
});

describe('statusBadgeRowWidth', () => {
  it('includes outline clearance between adjacent badges', () => {
    expect(statusBadgeRowWidth([hot, dot], 1, 16, 1, 0)).toBe(36);
  });

  it('matches legacy width when outline is disabled', () => {
    expect(statusBadgeRowWidth([hot, dot], 1, 16, 0, 0)).toBe(32);
  });

  it('adds outline clearance for each additional badge', () => {
    expect(statusBadgeRowWidth([atk, hot, dot], 1, 16, 1, 0)).toBe(56);
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
      16,
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
      beginPath() {},
      closePath() {},
      fill() {},
      stroke() {},
      moveTo() {},
      lineTo() {},
      drawImage(
        _image: CanvasImageSource,
        arg2: number,
        arg3: number,
        arg4?: number,
        arg5?: number,
        arg6?: number,
        arg7?: number,
        arg8?: number,
        arg9?: number,
      ) {
        if (arg4 === undefined) {
          drawImages.push({ x: arg2, y: arg3, width: 0, height: 0 });
          return;
        }
        if (arg6 !== undefined && arg7 !== undefined && arg8 !== undefined && arg9 !== undefined) {
          drawImages.push({ x: arg6, y: arg7, width: arg8, height: arg9 });
          return;
        }
        drawImages.push({ x: arg2, y: arg3, width: arg4, height: arg5 ?? arg4 });
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
          iconSize: 16,
          rowOverlap: 0,
          overlayColor: '#000',
          iconOutlineColor: '#000',
          iconOutlineWidth: 0,
          iconFallbackAlpha: 0,
          resolveIconFallbackColor: () => '#888',
        },
      );

      expect(drawImages.length).toBeGreaterThan(0);
      const ys = drawImages.map((entry) => entry.y);
      expect(Math.max(...ys)).toBeGreaterThan(Math.min(...ys));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('statusBadgeStride', () => {
  it('adds 2px outline pad per side between icons', () => {
    expect(statusBadgeStride(1, 16, 1, 0)).toBe(20);
  });
});
