import { describe, expect, it } from 'vitest';
import {
  applyHealToTarget,
  clampHpToEffectiveMax,
  currentHpRatio,
  getEffectiveMaxHp,
} from './combatMath.ts';
import type { CombatantState, StatusEffect } from './types.ts';

function mockUnit(
  partial: Partial<CombatantState> & Pick<CombatantState, 'id'>,
): CombatantState {
  return {
    name: partial.id,
    hp: partial.hp ?? 100,
    maxHp: partial.maxHp ?? 100,
    atk: 10,
    def: 10,
    reg: 0,
    barrierHp: 0,
    role: 'attacker',
    classId: 'warrior',
    formationRow: 'front',
    traits: { rangePx: 100, damageType: 'physical' },
    build: { learnedPassiveIds: [], equippedActiveIds: [] },
    cooldowns: [],
    statusEffects: partial.statusEffects ?? [],
    spriteKey: 'warrior',
    iconKey: 'warrior',
    isEnemy: false,
    battleX: 200,
    corpseVisible: false,
    isAlive: partial.isAlive ?? true,
    ...partial,
  };
}

function hpBuff(flatBonus?: number, multiplier?: number): StatusEffect {
  return {
    id: 'hp_buff',
    kind: 'buff',
    stat: 'hp',
    multiplier: multiplier ?? 1,
    ...(flatBonus !== undefined ? { flatBonus } : {}),
    durationSec: 10,
    remainingSec: 10,
  };
}

describe('getEffectiveMaxHp', () => {
  it('applies flat and multiplier buffs to base maxHp', () => {
    const unit = mockUnit({
      id: 'a',
      maxHp: 100,
      statusEffects: [hpBuff(20, 1.1)],
    });
    expect(getEffectiveMaxHp(unit)).toBe(Math.floor((100 + 20) * 1.1));
  });

  it('caps current hp when effective max decreases', () => {
    const unit = mockUnit({
      id: 'a',
      hp: 150,
      maxHp: 100,
      statusEffects: [hpBuff(50)],
    });
    clampHpToEffectiveMax(unit);
    expect(unit.hp).toBe(150);

    unit.statusEffects = [];
    clampHpToEffectiveMax(unit);
    expect(unit.hp).toBe(100);
  });

  it('uses effective maxHp for heal cap and hp ratio', () => {
    const unit = mockUnit({
      id: 'a',
      hp: 100,
      maxHp: 100,
      statusEffects: [hpBuff(50)],
    });
    expect(getEffectiveMaxHp(unit)).toBe(150);
    expect(currentHpRatio(unit)).toBeCloseTo(100 / 150);

    const healed = applyHealToTarget(unit, 100);
    expect(healed).toBe(50);
    expect(unit.hp).toBe(150);
  });
});
