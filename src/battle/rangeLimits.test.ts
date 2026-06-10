import { describe, expect, it } from 'vitest';
import {
  CANVAS_W,
  PARTY_FORMATION_LEFT_ANCHOR,
} from './battleConstants.ts';
import {
  CONFIGURABLE_RANGE_PX_MAX,
  assertConfigurableRangePx,
  configurableRangeHintJa,
} from './rangeLimits.ts';

describe('rangeLimits', () => {
  it('CONFIGURABLE_RANGE_PX_MAX spans left anchor to canvas right edge', () => {
    expect(CONFIGURABLE_RANGE_PX_MAX).toBe(
      CANVAS_W - PARTY_FORMATION_LEFT_ANCHOR,
    );
  });

  it('hint references the same max constant', () => {
    expect(configurableRangeHintJa()).toContain(String(CONFIGURABLE_RANGE_PX_MAX));
  });

  it('assertConfigurableRangePx rejects out-of-range values', () => {
    expect(() =>
      assertConfigurableRangePx('射程', CONFIGURABLE_RANGE_PX_MAX + 1),
    ).toThrow(String(CONFIGURABLE_RANGE_PX_MAX));
  });
});
