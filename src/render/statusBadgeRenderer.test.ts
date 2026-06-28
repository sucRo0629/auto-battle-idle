import { describe, expect, it, vi } from 'vitest';
import {
  drawCompactStatusBadgeRow,
  drawStatusBadgeBlock,
  FIELD_COMPACT_STATUS_BADGE_LAYOUT,
  measureCompactStatusBadgeRow,
  measureStatusBadgeBlock,
  PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT,
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
    expect(STATUS_BADGE_PENTAGON_BUFF_OFFSET_PX).toBe(-2);
    expect(STATUS_BADGE_PENTAGON_DEBUFF_OFFSET_PX).toBe(2);
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
    expect(layout.totalHeight).toBe(20);
  });

  it('uses five slots for Party HUD layout', () => {
    const layout = measureCompactStatusBadgeRow(
      1,
      16,
      1,
      0,
      PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT,
    );
    expect(layout.totalWidth).toBe(
      statusBadgeRowWidth(
        Array.from({ length: 5 }, () => ({ category: 'hot' as const })),
        1,
        16,
        1,
        0,
      ),
    );
    expect(PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT.visibleCount).toBe(4);
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
      strokeText() {},
      fillText() {},
      font: 'bold 9px sans-serif',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      lineJoin: 'round',
      lineWidth: 1,
      strokeStyle: '#000',
      fillStyle: '#fff',
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
  it('uses 7px-tall bitmap labels on 16px badges', () => {
    expect(resolveBadgeLabelFontSize(16)).toBe(7);
    expect(resolveBadgeLabelFontSize(32)).toBe(14);
  });
});

describe('statusBadgeStride', () => {
  it('adds 2px outline pad per side between icons', () => {
    expect(statusBadgeStride(1, 16, 1, 0)).toBe(20);
  });
});
