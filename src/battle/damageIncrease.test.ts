import { describe, expect, it } from 'vitest';
import type { CombatantState } from './types.ts';
import { resolveDamageIncreaseMultiplier } from './damageIncrease.ts';

function unit(
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

describe('damageIncrease', () => {
  it('applies debuff condition with OR tags', () => {
    const attacker = unit({ id: 'a' });
    const target = unit({
      id: 't',
      statusEffects: [
        {
          id: 'dot1',
          kind: 'debuff',
          overlay: 'dot',
          multiplier: 1,
          durationSec: 5,
          remainingSec: 5,
          sourceId: 'a',
        },
      ],
    });
    const mul = resolveDamageIncreaseMultiplier(attacker, target, {
      scale: 1.5,
      conditions: [{ kind: 'debuff', tags: ['dot'], selfAppliedOnly: true }],
    });
    expect(mul).toBe(1.5);
  });

  it('requires all conditions (AND)', () => {
    const attacker = unit({ id: 'a', hp: 20, maxHp: 100 });
    const target = unit({ id: 't', hp: 30, maxHp: 100 });
    const mul = resolveDamageIncreaseMultiplier(attacker, target, {
      scale: 2,
      conditions: [
        { kind: 'targetHp', maxHpRatio: 0.5 },
        { kind: 'selfHp', maxHpRatio: 0.5, mode: 'threshold' },
      ],
    });
    expect(mul).toBe(4);
  });

  it('supports selfHp scaling mode', () => {
    const attacker = unit({ id: 'a', hp: 25, maxHp: 100 });
    const target = unit({ id: 't' });
    const mul = resolveDamageIncreaseMultiplier(attacker, target, {
      scale: 0.6,
      conditions: [
        { kind: 'selfHp', maxHpRatio: 1, mode: 'scaling', maxMul: 1.5 },
      ],
    });
    expect(mul).toBeCloseTo(1.45, 5);
  });
});
