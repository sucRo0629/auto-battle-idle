import { describe, expect, it } from 'vitest';
import type { StatusEffectBadgeDisplay } from '../battle/statusEffectDisplay.ts';
import {
  buildDetailStatusBadgeHitSignature,
  buildPartyHudStatusBadgeCanvasSignature,
  buildPartyHudStatusBadgeHitSignature,
} from './partyHudStatusBadgeHits.ts';

function badge(
  category: StatusEffectBadgeDisplay['category'],
  stackCount?: number,
  remainingRatio?: number,
): StatusEffectBadgeDisplay {
  return {
    category,
    kind: 'buff',
    stackCount,
    remainingRatio,
  };
}

describe('buildPartyHudStatusBadgeHitSignature', () => {
  it('changes when visible badges or overflow change', () => {
    const base = buildPartyHudStatusBadgeHitSignature(
      [badge('atk'), badge('def')],
      0,
      0,
    );
    const overflow = buildPartyHudStatusBadgeHitSignature(
      [badge('atk'), badge('def')],
      2,
      0,
    );
    const stacked = buildPartyHudStatusBadgeHitSignature(
      [badge('atk', 3), badge('def')],
      0,
      0,
    );

    expect(base).not.toBe(overflow);
    expect(base).not.toBe(stacked);
  });

  it('stays stable when only remaining ratio changes', () => {
    const low = buildPartyHudStatusBadgeHitSignature(
      [badge('hp', 2, 0.2), badge('atk', 1, 0.8)],
      1,
      2,
    );
    const high = buildPartyHudStatusBadgeHitSignature(
      [badge('hp', 2, 0.9), badge('atk', 1, 0.1)],
      1,
      2,
    );
    expect(low).toBe(high);
  });

  it('stays stable for identical badge layout', () => {
    const visible = [badge('hp'), badge('atk', 2)];
    const a = buildPartyHudStatusBadgeHitSignature(visible, 1, 2);
    const b = buildPartyHudStatusBadgeHitSignature(visible, 1, 2);
    expect(a).toBe(b);
  });
});

describe('buildPartyHudStatusBadgeCanvasSignature', () => {
  it('changes when remaining ratio step changes', () => {
    const fresh = buildPartyHudStatusBadgeCanvasSignature(
      [badge('hp', 2, 1)],
      0,
      0,
      96,
      28,
    );
    const fading = buildPartyHudStatusBadgeCanvasSignature(
      [badge('hp', 2, 0.1)],
      0,
      0,
      96,
      28,
    );
    expect(fresh).not.toBe(fading);
  });
});

describe('buildDetailStatusBadgeHitSignature', () => {
  it('ignores remaining ratio', () => {
    const a = buildDetailStatusBadgeHitSignature([badge('dot', 3, 0.9)]);
    const b = buildDetailStatusBadgeHitSignature([badge('dot', 3, 0.1)]);
    expect(a).toBe(b);
  });
});
