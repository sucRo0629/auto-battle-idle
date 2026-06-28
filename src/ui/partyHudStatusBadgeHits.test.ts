import { describe, expect, it } from 'vitest';
import type { StatusEffectBadgeDisplay } from '../battle/statusEffectDisplay.ts';
import { buildPartyHudStatusBadgeHitSignature } from './partyHudStatusBadgeHits.ts';

function badge(
  category: StatusEffectBadgeDisplay['category'],
  stackCount?: number,
): StatusEffectBadgeDisplay {
  return {
    category,
    kind: 'buff',
    stackCount,
  };
}

describe('buildPartyHudStatusBadgeHitSignature', () => {
  it('changes when visible badges or overflow change', () => {
    const base = buildPartyHudStatusBadgeHitSignature(
      [badge('atk'), badge('def')],
      0,
      0,
      120,
      24,
    );
    const overflow = buildPartyHudStatusBadgeHitSignature(
      [badge('atk'), badge('def')],
      2,
      0,
      120,
      24,
    );
    const stacked = buildPartyHudStatusBadgeHitSignature(
      [badge('atk', 3), badge('def')],
      0,
      0,
      120,
      24,
    );

    expect(base).not.toBe(overflow);
    expect(base).not.toBe(stacked);
  });

  it('stays stable for identical badge layout', () => {
    const visible = [badge('hp'), badge('atk', 2)];
    const a = buildPartyHudStatusBadgeHitSignature(visible, 1, 2, 96, 28);
    const b = buildPartyHudStatusBadgeHitSignature(visible, 1, 2, 96, 28);
    expect(a).toBe(b);
  });
});
