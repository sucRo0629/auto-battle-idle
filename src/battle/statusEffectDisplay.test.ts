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

  it('collects stack badges as repeated icons for herbalPotency', () => {
    const badges = collectStatusEffectBadgeDisplays(
      [
        {
          id: 'herbal_potency_stacks_ally1',
          kind: 'buff',
          overlay: 'herbalPotency',
          stacks: 3,
          multiplier: 1,
          durationSec: 99999,
          remainingSec: 99999,
        },
      ],
      { atk: 10, def: 10, reg: 0 },
    );

    expect(badges).toHaveLength(3);
    expect(badges.every((b) => b.category === 'herbalPotency')).toBe(true);
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

  it('aggregates damageDelay overlay', () => {
    const badges = aggregateStatStatusEffects(
      [
        {
          id: 'damageDelay',
          kind: 'buff',
          overlay: 'damageDelay',
          ratio: 0.25,
          multiplier: 1,
          durationSec: 5,
          remainingSec: 5,
        },
      ],
      { atk: 10, def: 10, reg: 0 },
    );

    expect(badges.map((badge) => badge.category)).toEqual(['damageDelay']);
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

  it('aggregates moveLock overlay separately from stun', () => {
    const badges = aggregateStatStatusEffects(
      [
        {
          id: 'stun',
          kind: 'debuff',
          overlay: 'stun',
          multiplier: 1,
          durationSec: 3,
          remainingSec: 2,
        },
        {
          id: 'move_lock',
          kind: 'debuff',
          overlay: 'moveLock',
          multiplier: 1,
          durationSec: 1.5,
          remainingSec: 1,
        },
      ],
      { atk: 10, def: 10, reg: 0 },
    );

    expect(badges.map((badge) => badge.category)).toEqual(['stun', 'moveLock']);
    expect(badges.every((badge) => badge.kind === 'debuff')).toBe(true);
  });

  it('collects basicAttackTransform overlay badge', () => {
    const badges = collectStatusEffectBadgeDisplays(
      [
        {
          id: 'bat',
          kind: 'buff',
          overlay: 'basicAttackTransform',
          multiplier: 1,
          durationSec: 5,
          remainingSec: 3,
        },
      ],
      { atk: 10, def: 10, reg: 0 },
    );

    expect(badges).toHaveLength(1);
    expect(badges[0]?.category).toBe('basicAttackTransform');
    expect(badges[0]?.kind).toBe('buff');
  });

  it('collects class-specific overlay badges', () => {
    const overlays = [
      ['blockResonanceStance', 'blockResonanceStance', 'buff'],
      ['invulnerable', 'invulnerable', 'buff'],
      ['lastStandGuts', 'lastStandGuts', 'buff'],
      ['arenaDominance', 'arenaDominance', 'buff'],
      ['duelistPride', 'duelistPride', 'debuff'],
      ['ballistaMark', 'ballistaMark', 'debuff'],
      ['allyAttackFollowUp', 'allyAttackFollowUp', 'buff'],
      ['nextOutgoingDamage', 'nextOutgoingDamage', 'buff'],
    ] as const;

    for (const [overlay, category, kind] of overlays) {
      const badges = collectStatusEffectBadgeDisplays(
        [
          {
            id: overlay,
            kind: kind,
            overlay,
            multiplier: 1,
            durationSec: 5,
            remainingSec: 4,
          },
        ],
        { atk: 10, def: 10, reg: 0 },
      );
      expect(badges).toHaveLength(1);
      expect(badges[0]?.category).toBe(category);
      expect(badges[0]?.kind).toBe(kind);
    }
  });

  it('collects dot flavor badges for seedFlame and blazingFlame', () => {
    const badges = collectStatusEffectBadgeDisplays(
      [
        {
          id: 'seed',
          kind: 'debuff',
          overlay: 'dot',
          dotFlavor: 'seedFlame',
          multiplier: 1,
          durationSec: 10,
          remainingSec: 8,
        },
        {
          id: 'blaze',
          kind: 'debuff',
          overlay: 'dot',
          dotFlavor: 'blazingFlame',
          multiplier: 1,
          durationSec: 10,
          remainingSec: 6,
        },
      ],
      { atk: 10, def: 10, reg: 0 },
    );

    expect(badges.map((badge) => badge.category)).toEqual([
      'seedFlame',
      'blazingFlame',
    ]);
    expect(badges.every((badge) => badge.kind === 'debuff')).toBe(true);
  });

  it('collects arenaMark stack badges with arenaMark category', () => {
    const badges = collectStatusEffectBadgeDisplays(
      [
        {
          id: 'arena_mark_enemy1',
          kind: 'debuff',
          overlay: 'arenaMark',
          stacks: 2,
          multiplier: 1,
          durationSec: 15,
          remainingSec: 10,
        },
      ],
      { atk: 10, def: 10, reg: 0 },
    );

    expect(badges).toHaveLength(2);
    expect(badges.every((badge) => badge.category === 'arenaMark')).toBe(true);
    expect(badges.every((badge) => badge.kind === 'debuff')).toBe(true);
  });
});
