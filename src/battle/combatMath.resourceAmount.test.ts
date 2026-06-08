import { describe, expect, it } from 'vitest';
import {
  applyBarrierToTarget,
  applyDamageToTarget,
  applyHealToTarget,
  resolveResourceAmount,
} from './combatMath.ts';
import type { CombatantState, PassiveSkillDef, ResourceAmountSpec } from './types.ts';

const passives: Record<string, PassiveSkillDef> = {
  heal_passive: {
    id: 'heal_passive',
    name: 'Heal+',
    effect: 'healBonus',
    healBonus: 5,
  },
};

function mockCombatant(
  overrides: Partial<CombatantState> = {},
): CombatantState {
  return {
    id: 'unit',
    name: 'Unit',
    hp: 50,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'supporter',
    classId: 'test',
    formationRow: 'back',
    traits: { attackRange: 'ranged', rangePx: 120 },
    build: {
      learnedPassiveIds: ['heal_passive'],
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

describe('resolveResourceAmount', () => {
  const actor = mockCombatant({ atk: 20 });
  const target = mockCombatant({ hp: 50, maxHp: 100 });

  it('resolves atkBased with offset and scale', () => {
    const spec: ResourceAmountSpec = {
      kind: 'atkBased',
      atkOffset: 7,
      atkScale: 2,
    };
    // (20 + 5 + 7) * 2 = 64
    expect(resolveResourceAmount(actor, target, spec, passives)).toBe(64);
  });

  it('resolves flat with healBonus', () => {
    expect(
      resolveResourceAmount(
        actor,
        target,
        { kind: 'flat', flatAmount: 10 },
        passives,
      ),
    ).toBe(15);
  });

  it('resolves percentMaxHp from target maxHp with healBonus', () => {
    expect(
      resolveResourceAmount(
        actor,
        target,
        { kind: 'percentMaxHp', percentOfMaxHp: 0.1 },
        passives,
      ),
    ).toBe(15);
  });

  it('uses atkScaleOverride', () => {
    expect(
      resolveResourceAmount(
        actor,
        target,
        { kind: 'atkBased', atkScale: 1 },
        passives,
        0.5,
      ),
    ).toBe(12);
  });
});

describe('applyHealToTarget', () => {
  it('caps healing at maxHp', () => {
    const target = mockCombatant({ hp: 90, maxHp: 100 });
    expect(applyHealToTarget(target, 20)).toBe(10);
    expect(target.hp).toBe(100);
  });
});

describe('applyDamageToTarget', () => {
  it('absorbs damage with barrier first', () => {
    const target = mockCombatant({ hp: 80, maxHp: 100, barrierHp: 30 });
    const result = applyDamageToTarget(target, 50);
    expect(result.barrierDamage).toBe(30);
    expect(result.hpDamage).toBe(20);
    expect(target.barrierHp).toBe(0);
    expect(target.hp).toBe(60);
    expect(result.lethal).toBe(false);
  });

  it('damages hp after barrier is depleted', () => {
    const target = mockCombatant({ hp: 10, maxHp: 100, barrierHp: 0 });
    const result = applyDamageToTarget(target, 25);
    expect(result.barrierDamage).toBe(0);
    expect(result.hpDamage).toBe(10);
    expect(target.hp).toBe(0);
    expect(result.lethal).toBe(true);
  });
});

describe('applyBarrierToTarget', () => {
  it('replaces barrier by default', () => {
    const target = mockCombatant({ barrierHp: 40 });
    applyBarrierToTarget(target, 25, false);
    expect(target.barrierHp).toBe(25);
  });

  it('stacks barrier when enabled', () => {
    const target = mockCombatant({ barrierHp: 40 });
    applyBarrierToTarget(target, 25, true);
    expect(target.barrierHp).toBe(65);
  });
});
