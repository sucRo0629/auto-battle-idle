import { describe, expect, it } from 'vitest';
import { resolveHudPointerTooltipAlignEnd } from './resolveHudPointerTooltipAlignEnd.ts';

describe('resolveHudPointerTooltipAlignEnd', () => {
  it('opens to the right of a left-edge cursor so the panel stays on-screen', () => {
    expect(resolveHudPointerTooltipAlignEnd(40, 1280, 220)).toBe(false);
  });

  it('opens to the left of a right-edge cursor so the panel stays on-screen', () => {
    expect(resolveHudPointerTooltipAlignEnd(1200, 1280, 220)).toBe(true);
  });

  it('uses mount midline when both sides fit', () => {
    expect(resolveHudPointerTooltipAlignEnd(200, 1280, 100)).toBe(false);
    expect(resolveHudPointerTooltipAlignEnd(900, 1280, 100)).toBe(true);
  });

  it('ignores DOM slot-index heuristics: left-half X never aligns end', () => {
    // Visual leftmost Party HUD cards use high slot indices under row-reverse.
    // Placement must follow X, not index >= 2.
    expect(resolveHudPointerTooltipAlignEnd(80, 1280, 220)).toBe(false);
  });
});
