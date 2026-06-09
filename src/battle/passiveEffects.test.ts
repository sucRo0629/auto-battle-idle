import { describe, expect, it, vi } from 'vitest';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import {
  feedBasicAttackToActives,
  getPassiveOutgoingDamageMultiplier,
  initializeCountTriggerCooldowns,
  resolveDebuffDurationWithPassives,
  rollsEvasion,
  syncPartyHotAuras,
} from './passiveEffects.ts';

function mockAlly(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 50,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test',
    formationRow: 'front',
    traits: { attackRange: 'melee' },
    build: {
      learnedPassiveIds: ['feed', 'heavy'],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      { skillId: 'heavy', remaining: 3, slotKind: 'active', slotIndex: 0 },
      { skillId: 'basic', remaining: 0, slotKind: 'basic' },
    ],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 0,
    visualX: 0,
    corpseVisible: true,
    ...overrides,
  };
}

const passives: Record<string, PassiveSkillDef> = {
  feed: {
    id: 'feed',
    name: 'Feed',
    effect: 'basicAttackFeedsActive',
  },
  heavy: {
    id: 'heavy',
    name: 'Heavy',
    effect: 'heavyStrikeDamageScale',
    scale: 1.5,
  },
  evade: {
    id: 'evade',
    name: 'Evade',
    effect: 'evasionChance',
    evasionChance: 1,
  },
  dotBonus: {
    id: 'dotBonus',
    name: 'DotBonus',
    effect: 'damageVsDotTarget',
    scale: 2,
  },
  aura: {
    id: 'aura',
    name: 'Aura',
    effect: 'partyHotAura',
    partyHotAuraAmount: { kind: 'flat', flatAmount: 2 },
  },
};

const actives = {
  heavy: {
    id: 'heavy',
    name: 'Heavy',
    trigger: { kind: 'basicAttackCount' as const, value: 4 },
    effect: [],
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    effect: [],
  },
};

describe('passiveEffects', () => {
  it('feedBasicAttackToActives decrements basicAttackCount cooldowns', () => {
    const warrior = mockAlly({ id: 'warrior' });
    feedBasicAttackToActives(warrior, passives, actives);
    expect(warrior.cooldowns[0]!.remaining).toBe(2);
  });

  it('initializeCountTriggerCooldowns sets count trigger remaining to trigger value', () => {
    const warrior = mockAlly({ id: 'warrior' });
    warrior.cooldowns[0]!.remaining = 0;
    initializeCountTriggerCooldowns(warrior, actives);
    expect(warrior.cooldowns[0]!.remaining).toBe(4);
  });

  it('rollsEvasion respects evasionChance', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const rogue = mockAlly({
      id: 'rogue',
      build: {
        learnedPassiveIds: ['evade'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    expect(rollsEvasion(rogue, passives)).toBe(true);
    vi.restoreAllMocks();
  });

  it('getPassiveOutgoingDamageMultiplier applies heavyStrike and dot bonus', () => {
    const warrior = mockAlly({ id: 'warrior', hp: 25, maxHp: 100 });
    const dotted = mockAlly({
      id: 'dotted',
      statusEffects: [
        {
          id: 'dot1',
          kind: 'debuff',
          overlay: 'dot',
          multiplier: 1,
          durationSec: 5,
          remainingSec: 5,
        },
      ],
    });
    dotted.build.learnedPassiveIds = ['dotBonus'];

    const heavyMul = getPassiveOutgoingDamageMultiplier(
      warrior,
      mockAlly({ id: 'enemy' }),
      passives,
      { skill: actives.heavy, slotKind: 'active' },
    );
    expect(heavyMul).toBe(1.5);

    const dotMul = getPassiveOutgoingDamageMultiplier(
      dotted,
      mockAlly({ id: 'enemy' }),
      passives,
    );
    expect(dotMul).toBe(1);

    dotted.build.learnedPassiveIds = ['dotBonus'];
    const hunterMul = getPassiveOutgoingDamageMultiplier(
      dotted,
      mockAlly({
        id: 'enemy',
        statusEffects: [
          {
            id: 'dot1',
            kind: 'debuff',
            overlay: 'dot',
            multiplier: 1,
            durationSec: 5,
            remainingSec: 5,
          },
        ],
      }),
      passives,
    );
    expect(hunterMul).toBe(2);
  });

  it('resolveDebuffDurationWithPassives extends duration', () => {
    const extendPassives: Record<string, PassiveSkillDef> = {
      extend: {
        id: 'extend',
        name: 'Extend',
        effect: 'extendSelfAppliedDebuff',
        extendSec: 2,
      },
    };
    const actor = mockAlly({
      id: 'actor',
      build: {
        learnedPassiveIds: ['extend'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    expect(resolveDebuffDurationWithPassives(actor, 4, extendPassives)).toBe(6);
  });

  it('syncPartyHotAuras applies hot overlay to all living allies', () => {
    const healer = mockAlly({
      id: 'healer',
      role: 'supporter',
      build: {
        learnedPassiveIds: ['aura'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const ally = mockAlly({
      id: 'ally',
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    syncPartyHotAuras([healer, ally], passives);
    expect(healer.statusEffects.some((e) => e.overlay === 'hot')).toBe(true);
    expect(ally.statusEffects.some((e) => e.overlay === 'hot')).toBe(true);
  });
});
