import { describe, expect, it, vi } from 'vitest';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import {
  applyExcessHealToBarrierFromPassive,
  getPassiveDamageIncreaseMultiplier,
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
      learnedPassiveIds: [],
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
  evade: {
    id: 'evade',
    name: 'Evade',
    effect: 'evasionChance',
    evasionChance: 1,
  },
  dotBonus: {
    id: 'dotBonus',
    name: 'DotBonus',
    effect: 'damageIncrease',
    damageIncrease: {
      scale: 2,
      conditions: [{ kind: 'debuff', tags: ['dot'] }],
    },
  },
  aura: {
    id: 'aura',
    name: 'Aura',
    effect: 'partyHotAura',
    partyHotAuraAmount: { kind: 'flat', flatAmount: 2 },
  },
  excessBarrier: {
    id: 'excessBarrier',
    name: 'ExcessBarrier',
    effect: 'excessHealToBarrier',
    barrierScale: 1,
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

  it('getPassiveDamageIncreaseMultiplier applies low HP scaling and dot bonus', () => {
    const warrior = mockAlly({
      id: 'warrior',
      hp: 25,
      maxHp: 100,
      build: {
        learnedPassiveIds: ['lowHp'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const lowHpPassives: Record<string, PassiveSkillDef> = {
      lowHp: {
        id: 'lowHp',
        name: 'LowHp',
        effect: 'damageIncrease',
        damageIncrease: {
          scale: 0.6,
          conditions: [
            { kind: 'selfHp', maxHpRatio: 1, mode: 'scaling', maxMul: 1.5 },
          ],
        },
      },
    };
    const lowHpMul = getPassiveDamageIncreaseMultiplier(
      warrior,
      mockAlly({ id: 'enemy' }),
      lowHpPassives,
    );
    expect(lowHpMul).toBeCloseTo(1.45, 5);

    const dotted = mockAlly({
      id: 'dotted',
      build: {
        learnedPassiveIds: ['dotBonus'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const hunterMul = getPassiveDamageIncreaseMultiplier(
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

  it('applyExcessHealToBarrierFromPassive converts overheal and replaces barrier', () => {
    const healer = mockAlly({
      id: 'healer',
      build: {
        learnedPassiveIds: ['excessBarrier'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const target = mockAlly({ id: 'target', hp: 90, maxHp: 100, barrierHp: 5 });
    const grant = applyExcessHealToBarrierFromPassive(
      healer,
      target,
      20,
      passives,
    );
    expect(grant).toBe(10);
    expect(target.barrierHp).toBe(10);
  });

  it('getPassiveOutgoingDamageMultiplier only handles crowd bonus', () => {
    expect(
      getPassiveOutgoingDamageMultiplier(
        mockAlly({ id: 'a' }),
        mockAlly({ id: 'b' }),
        {},
        { targetShape: 'aoe', crowdHitCount: 3 },
      ),
    ).toBe(1);
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
