import { describe, expect, it, vi } from 'vitest';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import {
  applyBlockToPhysicalDamage,
  computeBlockMitigationRatio,
  getBlockChance,
} from './blockMitigation.ts';

function mockUnit(
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
    role: 'defender',
    classId: 'test',
    formationRow: 'front',
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
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
  block15: {
    id: 'block15',
    name: 'Block15',
    effect: 'block',
    blockChance: 0.15,
  },
  block30: {
    id: 'block30',
    name: 'Block30',
    effect: 'block',
    blockChance: 0.3,
  },
};

describe('blockMitigation', () => {
  it('computeBlockMitigationRatio uses 0.25 + atk/100 capped at 1', () => {
    expect(computeBlockMitigationRatio(mockUnit({ id: 'a', atk: 0 }))).toBe(0.25);
    expect(computeBlockMitigationRatio(mockUnit({ id: 'b', atk: 50 }))).toBe(0.75);
    expect(computeBlockMitigationRatio(mockUnit({ id: 'c', atk: 100 }))).toBe(1);
    expect(computeBlockMitigationRatio(mockUnit({ id: 'd', atk: 200 }))).toBe(1);
  });

  it('getBlockChance sums passives and status effects capped at 1', () => {
    const unit = mockUnit({
      id: 'u',
      build: {
        learnedPassiveIds: ['block15', 'block30'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      statusEffects: [
        {
          id: 'temp',
          kind: 'buff',
          overlay: 'block',
          blockChance: 0.5,
          multiplier: 1,
          durationSec: 5,
          remainingSec: 5,
        },
      ],
    });
    expect(getBlockChance(unit, passives)).toBe(0.95);
  });

  it('getBlockChance ignores expired block status', () => {
    const unit = mockUnit({
      id: 'u',
      statusEffects: [
        {
          id: 'expired',
          kind: 'buff',
          overlay: 'block',
          blockChance: 0.5,
          multiplier: 1,
          durationSec: 5,
          remainingSec: 0,
        },
      ],
    });
    expect(getBlockChance(unit, passives)).toBe(0);
  });

  it('applyBlockToPhysicalDamage reduces damage on successful roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const defender = mockUnit({
      id: 'd',
      atk: 100,
      build: {
        learnedPassiveIds: ['block15'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const result = applyBlockToPhysicalDamage(defender, 80, passives);
    expect(result.didBlock).toBe(true);
    expect(result.blockedAmount).toBe(80);
    expect(result.finalDamage).toBe(0);
    vi.restoreAllMocks();
  });

  it('applyBlockToPhysicalDamage leaves damage unchanged when roll fails', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const defender = mockUnit({
      id: 'd',
      build: {
        learnedPassiveIds: ['block15'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const result = applyBlockToPhysicalDamage(defender, 80, passives);
    expect(result.didBlock).toBe(false);
    expect(result.finalDamage).toBe(80);
    vi.restoreAllMocks();
  });
});
