import { describe, expect, it } from 'vitest';
import { hasMatchingDebuff } from './debuffMatching.ts';
import type { CombatantState } from './types.ts';

function unit(statusEffects: CombatantState['statusEffects']): CombatantState {
  return {
    id: 'u',
    name: 'u',
    hp: 50,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    res: 0,
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

describe('dotFlavor debuff tag matching', () => {
  const bleedEffect = {
    id: 'bleed',
    kind: 'debuff' as const,
    overlay: 'dot' as const,
    dotFlavor: 'bleed' as const,
    multiplier: 1,
    durationSec: 5,
    remainingSec: 5,
  };
  const poisonEffect = {
    id: 'poison',
    kind: 'debuff' as const,
    overlay: 'dot' as const,
    dotFlavor: 'poison' as const,
    multiplier: 1,
    durationSec: 5,
    remainingSec: 5,
  };
  const genericDotEffect = {
    id: 'dot',
    kind: 'debuff' as const,
    overlay: 'dot' as const,
    multiplier: 1,
    durationSec: 5,
    remainingSec: 5,
  };

  it('bleed tag matches bleed only', () => {
    expect(hasMatchingDebuff(unit([bleedEffect]), ['bleed'])).toBe(true);
    expect(hasMatchingDebuff(unit([poisonEffect]), ['bleed'])).toBe(false);
    expect(hasMatchingDebuff(unit([genericDotEffect]), ['bleed'])).toBe(false);
  });

  it('poison tag matches poison only', () => {
    expect(hasMatchingDebuff(unit([poisonEffect]), ['poison'])).toBe(true);
    expect(hasMatchingDebuff(unit([bleedEffect]), ['poison'])).toBe(false);
    expect(hasMatchingDebuff(unit([genericDotEffect]), ['poison'])).toBe(false);
  });

  it('dot tag matches all dot overlays regardless of flavor', () => {
    expect(hasMatchingDebuff(unit([bleedEffect]), ['dot'])).toBe(true);
    expect(hasMatchingDebuff(unit([poisonEffect]), ['dot'])).toBe(true);
    expect(hasMatchingDebuff(unit([genericDotEffect]), ['dot'])).toBe(true);
  });
});
