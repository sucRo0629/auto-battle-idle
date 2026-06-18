import { describe, expect, it } from 'vitest';
import type { CombatantState } from './types.ts';
import { hasMatchingDebuff } from './debuffMatching.ts';

function unit(statusEffects: CombatantState['statusEffects']): CombatantState {
  return {
    id: 'u',
    name: 'u',
    hp: 50,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test',
    formationRow: 'front',
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects,
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 0,
    visualX: 0,
    corpseVisible: true,
  };
}

describe('debuffMatching', () => {
  it('matches debuff tags with OR semantics', () => {
    const target = unit([
      {
        id: 'def',
        kind: 'debuff',
        stat: 'def',
        multiplier: 0.8,
        durationSec: 5,
        remainingSec: 5,
      },
    ]);
    expect(hasMatchingDebuff(target, ['atk', 'def'])).toBe(true);
    expect(hasMatchingDebuff(target, ['dot'])).toBe(false);
  });

  it('supports selfAppliedOnly for dot', () => {
    const target = unit([
      {
        id: 'dot',
        kind: 'debuff',
        overlay: 'dot',
        multiplier: 1,
        durationSec: 5,
        remainingSec: 5,
        sourceId: 'ally',
      },
    ]);
    expect(
      hasMatchingDebuff(target, ['dot'], {
        selfSourceId: 'self',
        selfAppliedOnly: true,
      }),
    ).toBe(false);
    expect(
      hasMatchingDebuff(target, ['dot'], {
        selfSourceId: 'ally',
        selfAppliedOnly: true,
      }),
    ).toBe(true);
  });
});
