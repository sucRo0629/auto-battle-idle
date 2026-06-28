import { describe, expect, it } from 'vitest';
import type { CombatantState, StatusEffect } from './types.ts';
import { dispelDebuffsOnTarget } from './debuffDispel.ts';

function unit(statusEffects: StatusEffect[]): CombatantState {
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
    corpseVisible: true,
  };
}

describe('debuffDispel', () => {
  it('removes all matching debuffs when count is 0', () => {
    const target = unit([
      {
        id: 'd1',
        kind: 'debuff',
        stat: 'def',
        multiplier: 0.8,
        durationSec: 5,
        remainingSec: 5,
      },
      {
        id: 'd2',
        kind: 'debuff',
        overlay: 'dot',
        multiplier: 1,
        durationSec: 5,
        remainingSec: 3,
      },
    ]);
    expect(dispelDebuffsOnTarget(target, 0, ['def', 'dot'])).toBe(2);
    expect(target.statusEffects).toHaveLength(0);
  });

  it('removes longest remaining debuffs first when count > 0', () => {
    const target = unit([
      {
        id: 'short',
        kind: 'debuff',
        stat: 'def',
        multiplier: 0.8,
        durationSec: 5,
        remainingSec: 2,
      },
      {
        id: 'long',
        kind: 'debuff',
        stat: 'atk',
        multiplier: 0.8,
        durationSec: 8,
        remainingSec: 8,
      },
    ]);
    expect(dispelDebuffsOnTarget(target, 1, ['def', 'atk'])).toBe(1);
    expect(target.statusEffects).toHaveLength(1);
    expect(target.statusEffects[0]!.id).toBe('short');
  });

  it('removes strongest debuffs first when dispelPriority is strongest', () => {
    const target = unit([
      {
        id: 'weak',
        kind: 'debuff',
        stat: 'def',
        multiplier: 0.9,
        durationSec: 10,
        remainingSec: 10,
      },
      {
        id: 'strong',
        kind: 'debuff',
        stat: 'atk',
        multiplier: 0.5,
        durationSec: 3,
        remainingSec: 3,
      },
    ]);
    expect(
      dispelDebuffsOnTarget(target, 1, ['def', 'atk'], undefined, 'strongest'),
    ).toBe(1);
    expect(target.statusEffects).toHaveLength(1);
    expect(target.statusEffects[0]!.id).toBe('weak');
  });

  it('removes attackSpeed debuffs when tagged', () => {
    const target = unit([
      {
        id: 'spd',
        kind: 'debuff',
        stat: 'attackSpeed',
        multiplier: 0.85,
        durationSec: 10,
        remainingSec: 10,
      },
      {
        id: 'def',
        kind: 'debuff',
        stat: 'def',
        multiplier: 0.8,
        durationSec: 5,
        remainingSec: 5,
      },
    ]);
    expect(dispelDebuffsOnTarget(target, 0, ['attackSpeed'])).toBe(1);
    expect(target.statusEffects).toHaveLength(1);
    expect(target.statusEffects[0]!.id).toBe('def');
  });
});
