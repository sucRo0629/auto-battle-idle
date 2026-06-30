import { describe, expect, it } from 'vitest';
import { measurePartyHudOverlayStatusGrid } from './partyHudOverlayStatusGrid.ts';
import {
  PARTY_HUD_OVERLAY_STATUS_COLS,
  PARTY_HUD_OVERLAY_STATUS_ROWS,
} from '../battle/statusEffectDisplay.ts';

describe('partyHudOverlayStatusGrid', () => {
  it('measures a fixed 2-row grid layout', () => {
    const layout = measurePartyHudOverlayStatusGrid(1, 20, 1, 0);
    expect(layout.rows).toBe(PARTY_HUD_OVERLAY_STATUS_ROWS);
    expect(layout.cols).toBe(PARTY_HUD_OVERLAY_STATUS_COLS);
    expect(layout.totalHeight).toBeGreaterThan(40);
    expect(layout.totalWidth).toBeGreaterThan(180);
  });
});
