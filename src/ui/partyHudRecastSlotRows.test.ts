import { describe, expect, it } from 'vitest';
import { resolvePartyHudRecastSlotRows } from './PartyHudPanel.ts';

describe('resolvePartyHudRecastSlotRows', () => {
  it('uses 1 row for 2 unlocked slots and 2 rows for 3–4', () => {
    expect(resolvePartyHudRecastSlotRows(2)).toBe(1);
    expect(resolvePartyHudRecastSlotRows(3)).toBe(2);
    expect(resolvePartyHudRecastSlotRows(4)).toBe(2);
  });
});
