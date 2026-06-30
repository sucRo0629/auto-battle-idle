import { describe, expect, it } from 'vitest';
import {
  PARTY_HUD_OVERLAY_STATUS_SLOT_COUNT,
  selectPartyHudOverlayStatusBadges,
} from './statusEffectDisplay.ts';
import type { StatusEffectBadgeDisplay } from './statusEffectDisplay.ts';

function mockBadge(id: string): StatusEffectBadgeDisplay {
  return {
    kind: 'buff',
    category: 'hot',
    statusEffectId: id,
    stackCount: 1,
    remainingRatio: 1,
    isPassive: false,
  };
}

describe('selectPartyHudOverlayStatusBadges', () => {
  it('shows up to 20 badges without overflow', () => {
    const badges = Array.from({ length: 20 }, (_, i) => mockBadge(`s${i}`));
    const result = selectPartyHudOverlayStatusBadges(badges);
    expect(result.visible).toHaveLength(20);
    expect(result.overflowCount).toBe(0);
  });

  it('reserves the last slot for +N when more than 20 badges exist', () => {
    const badges = Array.from({ length: 25 }, (_, i) => mockBadge(`s${i}`));
    const result = selectPartyHudOverlayStatusBadges(badges);
    expect(result.visible).toHaveLength(PARTY_HUD_OVERLAY_STATUS_SLOT_COUNT - 1);
    expect(result.overflowCount).toBe(6);
  });
});
