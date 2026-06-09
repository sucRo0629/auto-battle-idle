import { describe, expect, it } from 'vitest';
import {
  STATUS_BADGE_SLOT_ORDER,
  aggregateStatStatusEffects,
} from './statusEffectDisplay.ts';
import type { StatusEffect } from './types.ts';

function statEffect(
  partial: Partial<StatusEffect> & Pick<StatusEffect, 'id' | 'kind' | 'stat'>,
): StatusEffect {
  return {
    multiplier: 1,
    durationSec: 5,
    remainingSec: 5,
    ...partial,
  };
}

describe('statusEffectDisplay', () => {
  it('orders badges with separate damage reduction and increase slots', () => {
    expect(STATUS_BADGE_SLOT_ORDER).toEqual([
      'atk',
      'def',
      'reg',
      'damageReduction',
      'damageIncrease',
      'hot',
      'dot',
      'block',
    ]);
  });

  it('aggregates reg buff as magic resistance increase', () => {
    const badges = aggregateStatStatusEffects(
      [
        statEffect({
          id: 'reg_up',
          kind: 'buff',
          stat: 'reg',
          multiplier: 2,
        }),
      ],
      { atk: 10, def: 10, reg: 10 },
    );

    const regBadge = badges.find((badge) => badge.category === 'reg');
    expect(regBadge?.kind).toBe('buff');
    expect(regBadge?.netMul).toBe(2);
  });

  it('maps damageTaken debuff to damageIncrease badge', () => {
    const badges = aggregateStatStatusEffects(
      [
        statEffect({
          id: 'vuln',
          kind: 'debuff',
          stat: 'damageTaken',
          multiplier: 1.5,
        }),
      ],
      { atk: 10, def: 10, reg: 0 },
    );

    expect(badges).toHaveLength(1);
    expect(badges[0]?.category).toBe('damageIncrease');
    expect(badges[0]?.kind).toBe('debuff');
  });

  it('maps damageTaken buff to damageReduction badge', () => {
    const badges = aggregateStatStatusEffects(
      [
        statEffect({
          id: 'guard',
          kind: 'buff',
          stat: 'damageTaken',
          multiplier: 0.75,
        }),
      ],
      { atk: 10, def: 10, reg: 0 },
    );

    expect(badges).toHaveLength(1);
    expect(badges[0]?.category).toBe('damageReduction');
    expect(badges[0]?.kind).toBe('buff');
  });

  it('aggregates block overlay', () => {
    const badges = aggregateStatStatusEffects(
      [
        {
          id: 'block',
          kind: 'buff',
          overlay: 'block',
          blockChance: 0.25,
          multiplier: 1,
          durationSec: 3,
          remainingSec: 3,
        },
      ],
      { atk: 10, def: 10, reg: 0 },
    );

    expect(badges.map((badge) => badge.category)).toEqual(['block']);
    expect(badges[0]?.kind).toBe('buff');
  });
});
