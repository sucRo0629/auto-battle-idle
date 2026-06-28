import { describe, expect, it } from 'vitest';
import {
  aggregateStatStatusEffects,
  assignCompactBadgeTier,
  collectStatusEffectBadgeDisplays,
  selectCompactStatusBadges,
  sortBadgesForCompactView,
  STATUS_BADGE_SLOT_ORDER,
  type StatusEffectBadgeDisplay,
} from './statusEffectDisplay.ts';
import {
  resolveCompactStatusOverflowTooltipLabel,
  resolveStatusBadgeTooltipLabel,
  resolveStatusDisplayCategoryLabel,
  STATUS_DISPLAY_CATEGORY_LABELS,
} from '../ui/gameTermGlossary.ts';
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
  it('collects passive hp buff badge', () => {
    const badges = collectStatusEffectBadgeDisplays(
      [
        statEffect({
          id: 'passive_buff_aura_herb_sp_alchemist_passive_2_hp_0',
          kind: 'buff',
          stat: 'hp',
          multiplier: 1.05,
        }),
      ],
      { baseMaxHp: 200, atk: 10, def: 10, reg: 0 },
    );

    expect(badges).toHaveLength(1);
    expect(badges[0]?.category).toBe('hp');
    expect(badges[0]?.kind).toBe('buff');
    expect(badges[0]?.isPassive).toBe(true);
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
      { baseMaxHp: 100, atk: 10, def: 10, reg: 10 },
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
      { baseMaxHp: 100, atk: 10, def: 10, reg: 0 },
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
      { baseMaxHp: 100, atk: 10, def: 10, reg: 0 },
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
      { baseMaxHp: 100, atk: 10, def: 10, reg: 0 },
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
      { baseMaxHp: 100, atk: 10, def: 10, reg: 0 },
    );

    expect(badges).toEqual([]);
  });

  it('collects stack badges as a single badge with stackCount for herbalPotency', () => {
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
      { baseMaxHp: 100, atk: 10, def: 10, reg: 0 },
    );

    expect(badges).toHaveLength(1);
    expect(badges[0]?.category).toBe('herbalPotency');
    expect(badges[0]?.stackCount).toBe(3);
  });

  it('aggregates multiple instances in the same category into one badge', () => {
    const badges = collectStatusEffectBadgeDisplays(
      [
        {
          id: 'bleed_a',
          kind: 'debuff',
          overlay: 'dot',
          dotFlavor: 'bleed',
          multiplier: 1,
          durationSec: 5,
          remainingSec: 4,
        },
        {
          id: 'bleed_b',
          kind: 'debuff',
          overlay: 'dot',
          dotFlavor: 'bleed',
          multiplier: 1,
          durationSec: 5,
          remainingSec: 2,
        },
      ],
      { baseMaxHp: 100, atk: 10, def: 10, reg: 0 },
    );

    expect(badges).toHaveLength(1);
    expect(badges[0]?.category).toBe('bleed');
    expect(badges[0]?.stackCount).toBe(2);
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
      { baseMaxHp: 100, atk: 10, def: 10, reg: 0 },
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
      { baseMaxHp: 100, atk: 10, def: 10, reg: 0 },
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
      { baseMaxHp: 100, atk: 10, def: 10, reg: 0 },
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
      { baseMaxHp: 100, atk: 10, def: 10, reg: 0 },
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
      { baseMaxHp: 100, atk: 10, def: 10, reg: 0 },
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
        { baseMaxHp: 100, atk: 10, def: 10, reg: 0 },
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
      { baseMaxHp: 100, atk: 10, def: 10, reg: 0 },
    );

    expect(badges.map((badge) => badge.category)).toEqual([
      'seedFlame',
      'blazingFlame',
    ]);
    expect(badges.every((badge) => badge.kind === 'debuff')).toBe(true);
  });

  it('collects arenaMark stack badges as one badge with stackCount', () => {
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
      { baseMaxHp: 100, atk: 10, def: 10, reg: 0 },
    );

    expect(badges).toHaveLength(1);
    expect(badges[0]?.category).toBe('arenaMark');
    expect(badges[0]?.kind).toBe('debuff');
    expect(badges[0]?.stackCount).toBe(2);
  });
});

describe('compact status badge selection', () => {
  function badge(
    partial: Partial<StatusEffectBadgeDisplay> &
      Pick<StatusEffectBadgeDisplay, 'category' | 'kind'>,
  ): StatusEffectBadgeDisplay {
    return {
      remainingRatio: 1,
      isPassive: false,
      ...partial,
    };
  }

  it('assigns CC debuffs to tier 1', () => {
    expect(assignCompactBadgeTier(badge({ category: 'stun', kind: 'debuff' }))).toBe(1);
    expect(assignCompactBadgeTier(badge({ category: 'moveLock', kind: 'debuff' }))).toBe(1);
    expect(assignCompactBadgeTier(badge({ category: 'damageDelay', kind: 'buff' }))).toBe(1);
  });

  it('prioritizes def/reg debuff over other debuffs', () => {
    const sorted = sortBadgesForCompactView([
      badge({ category: 'dot', kind: 'debuff' }),
      badge({ category: 'def', kind: 'debuff' }),
      badge({ category: 'mark', kind: 'debuff' }),
    ]);
    expect(sorted.map((entry) => entry.category)).toEqual(['def', 'dot', 'mark']);
  });

  it('puts damageIncrease debuff in tier 3 and damageReduction buff in tier 5', () => {
    const sorted = sortBadgesForCompactView([
      badge({ category: 'damageReduction', kind: 'buff' }),
      badge({ category: 'damageIncrease', kind: 'debuff' }),
      badge({ category: 'atk', kind: 'buff' }),
    ]);
    expect(sorted.map((entry) => entry.category)).toEqual([
      'damageIncrease',
      'atk',
      'damageReduction',
    ]);
    expect(assignCompactBadgeTier(badge({ category: 'damageIncrease', kind: 'debuff' }))).toBe(3);
    expect(assignCompactBadgeTier(badge({ category: 'damageReduction', kind: 'buff' }))).toBe(5);
  });

  it('selects at most three visible badges and reports overflow (field default)', () => {
    const selection = selectCompactStatusBadges([
      badge({ category: 'stun', kind: 'debuff' }),
      badge({ category: 'def', kind: 'debuff' }),
      badge({ category: 'dot', kind: 'debuff' }),
      badge({ category: 'mark', kind: 'debuff' }),
      badge({ category: 'atk', kind: 'buff' }),
    ]);
    expect(selection.visible).toHaveLength(3);
    expect(selection.visible.map((entry) => entry.category)).toEqual([
      'stun',
      'def',
      'dot',
    ]);
    expect(selection.overflowCount).toBe(2);
  });

  it('selects four visible badges for Party HUD compact', () => {
    const selection = selectCompactStatusBadges(
      [
        badge({ category: 'stun', kind: 'debuff' }),
        badge({ category: 'def', kind: 'debuff' }),
        badge({ category: 'dot', kind: 'debuff' }),
        badge({ category: 'mark', kind: 'debuff' }),
        badge({ category: 'atk', kind: 'buff' }),
      ],
      { visibleCount: 4 },
    );
    expect(selection.visible).toHaveLength(4);
    expect(selection.overflowCount).toBe(1);
  });

  it('leaves overflow at zero when three or fewer badges', () => {
    const selection = selectCompactStatusBadges([
      badge({ category: 'hot', kind: 'buff' }),
      badge({ category: 'block', kind: 'buff' }),
    ]);
    expect(selection.visible).toHaveLength(2);
    expect(selection.overflowCount).toBe(0);
  });

  it('defines a display label for every badge slot category', () => {
    for (const category of STATUS_BADGE_SLOT_ORDER) {
      expect(STATUS_DISPLAY_CATEGORY_LABELS[category].length).toBeGreaterThan(0);
      expect(resolveStatusDisplayCategoryLabel(category)).toBe(
        STATUS_DISPLAY_CATEGORY_LABELS[category],
      );
    }
  });

  it('formats badge tooltip labels with optional stack count', () => {
    expect(
      resolveStatusBadgeTooltipLabel({
        category: 'blockResonance',
        kind: 'buff',
        remainingRatio: 1,
        isPassive: true,
      }),
    ).toBe('防壁');

    expect(
      resolveStatusBadgeTooltipLabel({
        category: 'blockResonance',
        kind: 'buff',
        remainingRatio: 1,
        isPassive: true,
        stackCount: 3,
      }),
    ).toBe('防壁 ×3');
  });

  it('joins overflow badge tooltip labels for hidden compact badges', () => {
    const badges = [
      badge({ category: 'hot', kind: 'buff' }),
      badge({ category: 'block', kind: 'buff' }),
      badge({ category: 'stun', kind: 'debuff' }),
      badge({ category: 'poison', kind: 'debuff' }),
      badge({ category: 'bleed', kind: 'debuff' }),
    ];
    const expected = sortBadgesForCompactView(badges)
      .slice(4)
      .map(resolveStatusBadgeTooltipLabel)
      .join('、');
    expect(resolveCompactStatusOverflowTooltipLabel(badges, 4)).toBe(expected);
    expect(expected.length).toBeGreaterThan(0);
  });
});
