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
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 0,
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

  it('targetHp ignores barrierHp when comparing hp ratio', () => {
    const attacker = unit({ id: 'a' });
    const target = unit({ id: 't', hp: 100, maxHp: 100, barrierHp: 50 });
    const mul = resolveDamageIncreaseMultiplier(attacker, target, {
      scale: 2,
      conditions: [{ kind: 'targetHp', maxHpRatio: 0.5 }],
    });
    expect(mul).toBe(1);
  });

  it('attackType ranged matches enemies by rangePx band', () => {
    const attacker = unit({ id: 'a' });
    const ranged = unit({
      id: 'r',
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
    });
    const melee = unit({
      id: 'm',
      traits: { rangePx: 30, damageType: 'physical', basicAttackVfx: { enabled: true } },
    });
    const spec = {
      scale: 1.2,
      conditions: [{ kind: 'attackType' as const, ranged: true }],
    };
    expect(resolveDamageIncreaseMultiplier(attacker, ranged, spec)).toBe(1.2);
    expect(resolveDamageIncreaseMultiplier(attacker, melee, spec)).toBe(1);
  });

  it('attackType ranged + excludeRoles skips supporter bonus', () => {
    const attacker = unit({ id: 'a' });
    const rangedSupporter = unit({
      id: 's',
      role: 'supporter',
      traits: { rangePx: 110, damageType: 'physical', basicAttackVfx: { enabled: true } },
    });
    const rangedAttacker = unit({
      id: 'r',
      role: 'attacker',
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
    });
    const spec = {
      scale: 1.2,
      conditions: [
        {
          kind: 'attackType' as const,
          ranged: true,
          excludeRoles: ['supporter' as const],
        },
      ],
    };
    expect(resolveDamageIncreaseMultiplier(attacker, rangedSupporter, spec)).toBe(1);
    expect(resolveDamageIncreaseMultiplier(attacker, rangedAttacker, spec)).toBe(1.2);
  });

  it('requires all conditions (AND)', () => {
    const attacker = unit({ id: 'a', hp: 20, maxHp: 100 });
    const target = unit({ id: 't', hp: 30, maxHp: 100 });
    const mul = resolveDamageIncreaseMultiplier(attacker, target, {
      scale: 2,
      conditions: [
        { kind: 'targetHp', maxHpRatio: 0.5 },
        { kind: 'targetHp', maxHpRatio: 0.4 },
      ],
    });
    expect(mul).toBe(4);
  });
});
