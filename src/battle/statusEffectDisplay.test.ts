import { describe, expect, it } from 'vitest';
import {
  aggregateStatStatusEffects,
  collectStatusEffectBadgeDisplays,
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

  it('hides passive aura status effects from badges', () => {
    const badges = aggregateStatStatusEffects(
      [
        {
          id: 'passive_buff_guard_block_block',
          kind: 'buff',
          overlay: 'block',
          blockChance: 0.2,
          multiplier: 1,
          durationSec: 99999,
          remainingSec: 99999,
        },
        {
          id: 'passive_dmg_reduction_tank_guard',
          kind: 'buff',
          stat: 'damageTaken',
          multiplier: 0.8,
          durationSec: 99999,
          remainingSec: 99999,
        },
      ],
      { atk: 10, def: 10, reg: 0 },
    );

    expect(badges).toEqual([]);
  });

  it('collects one badge per status effect and keeps passives on the left', () => {
    const badges = collectStatusEffectBadgeDisplays(
      [
        statEffect({
          id: 'passive_buff_guard_block_block',
          kind: 'buff',
          overlay: 'block',
          blockChance: 0.2,
        }),
        statEffect({
          id: 'vuln',
          kind: 'debuff',
          stat: 'damageTaken',
          multiplier: 1.5,
        }),
      ],
      { atk: 10, def: 10, reg: 0 },
    );

    expect(badges).toHaveLength(2);
    expect(badges[0]?.isPassive).toBe(true);
    expect(badges[0]?.category).toBe('block');
    expect(badges[1]?.isPassive).toBe(false);
    expect(badges[1]?.category).toBe('damageIncrease');
  });

  it('aggregates damageTakenToHeal overlay', () => {
    const badges = aggregateStatStatusEffects(
      [
        {
          id: 'damageTakenToHeal',
          kind: 'buff',
          overlay: 'damageTakenToHeal',
          ratio: 0.25,
          multiplier: 1,
          durationSec: 5,
          remainingSec: 5,
        },
      ],
      { atk: 10, def: 10, reg: 0 },
    );

    expect(badges.map((badge) => badge.category)).toEqual([
      'damageTakenToHeal',
    ]);
    expect(badges[0]?.kind).toBe('buff');
  });

  it('aggregates stun overlay', () => {
    const badges = aggregateStatStatusEffects(
      [
        {
          id: 'stun',
          kind: 'cc',
          overlay: 'stun',
          multiplier: 1,
          durationSec: 1.2,
          remainingSec: 0.8,
        },
      ],
      { atk: 10, def: 10, reg: 0 },
    );

    expect(badges.map((badge) => badge.category)).toEqual(['stun']);
    expect(badges[0]?.kind).toBe('debuff');
    expect(badges[0]?.remainingRatio).toBeCloseTo(0.8 / 1.2);
  });
});
