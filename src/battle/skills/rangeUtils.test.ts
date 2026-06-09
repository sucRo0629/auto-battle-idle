import { describe, expect, it } from 'vitest';
import type { CombatantState } from '../types.ts';
import { mockRangedTraits } from '../testFixtures.ts';
import { resolveSkillRangePx } from './rangeUtils.ts';

function mockActor(rangePx: number): CombatantState {
  return {
    id: 'ally',
    name: 'ally',
    hp: 100,
    maxHp: 100,
    atk: 10,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test',
    formationRow: 'front',
    traits: mockRangedTraits(rangePx),
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      { skillId: 'test_basic_attack', remaining: 0, slotKind: 'basic' },
    ],
    statusEffects: [],
    barrierHp: 0,
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 0,
    visualX: 0,
    corpseVisible: true,
  };
}

describe('resolveSkillRangePx', () => {
  it('uses effect range when set', () => {
    const actor = mockActor(40);
    expect(resolveSkillRangePx(actor, { range: 120 })).toBe(120);
  });

  it('falls back to actor traits.rangePx when omitted', () => {
    const actor = mockActor(40);
    expect(resolveSkillRangePx(actor, {})).toBe(40);
  });
});
