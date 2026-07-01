import { describe, expect, it } from 'vitest';
import { resolveClampDelta } from './clampElementToMountBounds.ts';

describe('resolveClampDelta', () => {
  const bounds = { left: 0, right: 200, top: 0, bottom: 120 };

  it('shifts right when overflowing the left edge', () => {
    const visual = { left: -20, right: 60, top: 20, bottom: 44 };
    expect(resolveClampDelta(visual, bounds, 4)).toEqual({ dx: 24, dy: 0 });
  });

  it('shifts left when overflowing the right edge', () => {
    const visual = { left: 150, right: 230, top: 20, bottom: 44 };
    expect(resolveClampDelta(visual, bounds, 4)).toEqual({ dx: -34, dy: 0 });
  });

  it('shifts down when overflowing the top edge', () => {
    const visual = { left: 20, right: 100, top: -10, bottom: 14 };
    expect(resolveClampDelta(visual, bounds, 4)).toEqual({ dx: 0, dy: 14 });
  });

  it('shifts up when overflowing the bottom edge', () => {
    const visual = { left: 20, right: 100, top: 100, bottom: 130 };
    expect(resolveClampDelta(visual, bounds, 4)).toEqual({ dx: 0, dy: -14 });
  });

  it('returns zero when already inside bounds', () => {
    const visual = { left: 20, right: 100, top: 20, bottom: 44 };
    expect(resolveClampDelta(visual, bounds, 4)).toEqual({ dx: 0, dy: 0 });
  });
});
