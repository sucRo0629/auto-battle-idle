import { describe, expect, it, vi } from 'vitest';
import {
  drawCompactStatusBadgeRow,
  drawStatusBadgeBlock,
  FIELD_COMPACT_STATUS_BADGE_LAYOUT,
  measureCompactStatusBadgeRow,
  measureStatusBadgeBlock,
  applyRemainingOverlayPixels,
  BADGE_OVERLAY_STEPS,
  darkenBadgeOverlayBand,
  overlayMultiplyFillStyle,
  parseOverlayDarkenAlpha,
  PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT,
  PARTY_HUD_STATUS_BADGE_ICON_SIZE,
  resolveBadgeLabelFontSize,
  STATUS_BADGE_EFFECT_ICON_INSET_PX,
  STATUS_BADGE_EFFECT_ICON_PX,
  STATUS_BADGE_PENTAGON_BUFF_OFFSET_PX,
  STATUS_BADGE_PENTAGON_DEBUFF_OFFSET_PX,
  STATUS_BADGE_PENTAGON_PX,
  STATUS_BADGE_ROW_PAD_Y,
  STATUS_BADGE_SLOT_PX,
  statusBadgeDrawableRowHeight,
  statusBadgeRowWidth,
  statusBadgeStride,
  statusBadgeWidth,
  quantizeBadgeOverlayStep,
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

describe('status badge icon layout', () => {
  it('uses 12px icons inset 4px in 20px slot', () => {
    expect(STATUS_BADGE_EFFECT_ICON_PX).toBe(12);
    expect(STATUS_BADGE_EFFECT_ICON_INSET_PX).toBe(4);
  });

  it('uses 20px slot and pentagon with 2px row padding', () => {
    expect(STATUS_BADGE_SLOT_PX).toBe(20);
    expect(STATUS_BADGE_PENTAGON_PX).toBe(STATUS_BADGE_SLOT_PX);
    expect(STATUS_BADGE_ROW_PAD_Y).toBe(2);
    expect(statusBadgeDrawableRowHeight(1, STATUS_BADGE_SLOT_PX)).toBe(24);
    expect(statusBadgeDrawableRowHeight(1, 16)).toBe(19);
    expect(statusBadgeDrawableRowHeight(1, 14)).toBe(17);
    expect(STATUS_BADGE_PENTAGON_BUFF_OFFSET_PX).toBe(-2);
    expect(STATUS_BADGE_PENTAGON_DEBUFF_OFFSET_PX).toBe(0);
  });

  it('draws buff and debuff effect icons at the same slot-centered Y', () => {
    const slotY = STATUS_BADGE_ROW_PAD_Y;
    const iconY = slotY + STATUS_BADGE_EFFECT_ICON_INSET_PX;
    const buffPentagonY = slotY + STATUS_BADGE_PENTAGON_BUFF_OFFSET_PX;
    const debuffPentagonY = slotY + STATUS_BADGE_PENTAGON_DEBUFF_OFFSET_PX;

    expect(iconY - buffPentagonY).toBe(
      STATUS_BADGE_EFFECT_ICON_INSET_PX - STATUS_BADGE_PENTAGON_BUFF_OFFSET_PX,
    );
    expect(iconY - debuffPentagonY).toBe(STATUS_BADGE_EFFECT_ICON_INSET_PX);
  });
});

describe('remaining overlay color', () => {
  it('maps rgba overlay alpha to multiply gray', () => {
    expect(parseOverlayDarkenAlpha('rgba(0, 0, 0, 0.55)')).toBe(0.55);
    expect(overlayMultiplyFillStyle('rgba(0, 0, 0, 0.55)')).toBe('rgb(115, 115, 115)');
  });

  it('darkens only non-transparent pixels in elapsed band', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    const white = (index: number) => {
      data[index * 4] = 255;
      data[index * 4 + 1] = 255;
      data[index * 4 + 2] = 255;
      data[index * 4 + 3] = 255;
    };
    white(5);
    white(6);
    white(9);
    white(10);

    darkenBadgeOverlayBand(data, 4, 2, 'rgba(0, 0, 0, 0.5)');

    expect(Array.from(data.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(data[4 * 5]).toBe(128);
    expect(data[4 * 5 + 3]).toBe(255);
    expect(data[4 * 10 + 3]).toBe(255);
    expect(data[4 * 10]).toBe(255);
  });

  it('uses integer pixel dimensions for fractional scaled badge buffers', () => {
    const imageData = {
      data: new Uint8ClampedArray(20 * 12 * 4),
    } as ImageData;
    const getImageData = vi.fn(() => imageData);
    const putImageData = vi.fn();
    const ctx = {
      getImageData,
      putImageData,
    } as unknown as CanvasRenderingContext2D;

    applyRemainingOverlayPixels(
      ctx,
      20.8,
      24.8,
      0.5,
      'rgba(0, 0, 0, 0.5)',
    );

    expect(getImageData).toHaveBeenCalledWith(0, 0, 20, 12);
    expect(putImageData).toHaveBeenCalledWith(imageData, 0, 0);
  });

  it('skips pixel reads when layout inputs are not finite', () => {
    const getImageData = vi.fn();
    const putImageData = vi.fn();
    const ctx = {
      getImageData,
      putImageData,
    } as unknown as CanvasRenderingContext2D;

    applyRemainingOverlayPixels(
      ctx,
      Number.NaN,
      24,
      0.5,
      'rgba(0, 0, 0, 0.5)',
    );
    applyRemainingOverlayPixels(
      ctx,
      20,
      24,
      Number.NaN,
      'rgba(0, 0, 0, 0.5)',
    );

    expect(getImageData).not.toHaveBeenCalled();
    expect(putImageData).not.toHaveBeenCalled();
  });
});

describe('quantizeBadgeOverlayStep', () => {
  it('returns 0 while the effect is still full', () => {
    expect(quantizeBadgeOverlayStep(1)).toBe(0);
  });

  it('reaches the final step when elapsed', () => {
    expect(quantizeBadgeOverlayStep(0)).toBe(BADGE_OVERLAY_STEPS);
  });

  it('buckets elapsed time into discrete steps', () => {
    expect(quantizeBadgeOverlayStep(0.5)).toBe(12);
  });
});

describe('statusBadgeRowWidth', () => {
  it('includes outline clearance and 1px gap between adjacent badges', () => {
    expect(statusBadgeRowWidth([hot, dot], 1, 16, 1, 0)).toBe(37);
  });

  it('includes 1px gap when outline is disabled', () => {
    expect(statusBadgeRowWidth([hot, dot], 1, 16, 0, 0)).toBe(33);
  });

  it('adds outline clearance and gap for each additional badge', () => {
    expect(statusBadgeRowWidth([atk, hot, dot], 1, 16, 1, 0)).toBe(58);
  });
});

describe('measureStatusBadgeBlock', () => {
  it('splits passive badges into rows of four', () => {
    const layout = measureStatusBadgeBlock(
      [
        passiveAtk,
        { ...passiveAtk, category: 'def' as const },
        { ...passiveAtk, category: 'res' as const },
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
      save() {},
      restore() {},
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
      save() {},
      restore() {},
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

describe('measureCompactStatusBadgeRow', () => {
  it('uses a fixed four-slot row width for field layout', () => {
    const layout = measureCompactStatusBadgeRow(1, 16, 1, 0);
    expect(layout.totalWidth).toBe(
      statusBadgeRowWidth(
        [
          { category: 'hot' },
          { category: 'hot' },
          { category: 'hot' },
          { category: 'hot' },
        ],
        1,
        16,
        1,
        0,
      ),
    );
    expect(layout.totalHeight).toBe(19);
  });

  it('uses four slots for Party HUD layout at 20px', () => {
    const layout = measureCompactStatusBadgeRow(
      1,
      PARTY_HUD_STATUS_BADGE_ICON_SIZE,
      1,
      0,
      PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT,
    );
    expect(layout.totalHeight).toBe(24);
    expect(layout.totalWidth).toBeGreaterThanOrEqual(80);
  });

  it('uses four slots for Party HUD layout', () => {
    const layout = measureCompactStatusBadgeRow(
      1,
      16,
      1,
      0,
      PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT,
    );
    expect(layout.totalWidth).toBe(
      statusBadgeRowWidth(
        Array.from({ length: 4 }, () => ({ category: 'hot' as const })),
        1,
        16,
        1,
        0,
      ),
    );
    expect(PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT.visibleCount).toBe(4);
    expect(PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT.slotCount).toBe(4);
    expect(FIELD_COMPACT_STATUS_BADGE_LAYOUT.slotCount).toBe(4);
  });
});

describe('drawCompactStatusBadgeRow', () => {
  it('reserves the fourth slot for overflow count', () => {
    const drawImages: Array<{ x: number; y: number }> = [];
    const bufferCtx = {
      clearRect() {},
      drawImage() {},
      fillRect() {},
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      save() {},
      restore() {},
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
      fillRect() {},
      strokeRect() {},
      strokeText() {},
      fillText() {},
      font: 'bold 9px sans-serif',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      lineJoin: 'round',
      lineWidth: 1,
      strokeStyle: '#000',
      fillStyle: '#fff',
      save() {},
      restore() {},
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
          drawImages.push({ x: arg2, y: arg3 });
          return;
        }
        if (arg6 !== undefined && arg7 !== undefined) {
          drawImages.push({ x: arg6, y: arg7 });
          return;
        }
        drawImages.push({ x: arg2, y: arg3 });
      },
    } as unknown as CanvasRenderingContext2D;

    try {
      drawCompactStatusBadgeRow(
        ctx,
        0,
        0,
        [
          { category: 'stun', kind: 'debuff', remainingRatio: 1, isPassive: false },
          { category: 'def', kind: 'debuff', remainingRatio: 1, isPassive: false },
          { category: 'dot', kind: 'debuff', remainingRatio: 1, isPassive: false },
        ],
        2,
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

      const xs = drawImages.map((entry) => entry.x);
      expect(xs.length).toBeGreaterThanOrEqual(3);
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(statusBadgeStride(1, 16, 0, 0) * 2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('badge label font size', () => {
  it('uses 1x bitmap labels below 20px badges to avoid squash', () => {
    expect(resolveBadgeLabelFontSize(20)).toBe(7);
    expect(resolveBadgeLabelFontSize(14)).toBe(7);
    expect(resolveBadgeLabelFontSize(32)).toBe(14);
  });
});

describe('statusBadgeStride', () => {
  it('adds 2px outline pad per side and 1px gap between icons', () => {
    expect(statusBadgeStride(1, 16, 1, 0)).toBe(21);
  });
});
