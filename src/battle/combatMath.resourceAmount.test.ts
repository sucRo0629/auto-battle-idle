import { describe, expect, it } from 'vitest';
import {
  applyBarrierToTarget,
  applyDamageToTarget,
  applyHealToTarget,
  resolveDamage,
  resolveHotAmountFromStatus,
  resolveResourceAmount,
} from './combatMath.ts';
import type { CombatantState, ResourceAmountSpec } from './types.ts';

const passives = {};

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
    traits: { attackRange: 'ranged' },
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

describe('resolveResourceAmount', () => {
  const actor = mockCombatant({ atk: 20 });
  const target = mockCombatant({ hp: 50, maxHp: 100 });

  it('resolves atkBased with offset and scale', () => {
    const spec: ResourceAmountSpec = {
      kind: 'atkBased',
      atkOffset: 7,
      atkScale: 2,
    };
    // (20 + 7) * 2 = 54
    expect(resolveResourceAmount(actor, target, spec, passives)).toBe(54);
  });

  it('resolves flat amount', () => {
    expect(
      resolveResourceAmount(
        actor,
        target,
        { kind: 'flat', flatAmount: 10 },
        passives,
      ),
    ).toBe(10);
  });

  it('resolves percentMaxHp from target maxHp', () => {
    expect(
      resolveResourceAmount(
        actor,
        target,
        { kind: 'percentMaxHp', percentOfMaxHp: 0.1 },
        passives,
      ),
    ).toBe(10);
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
    ).toBe(10);
  });
});

describe('resolveHotAmountFromStatus', () => {
  it('flat party hot aura heals at least 1 per tick', () => {
    const healer = mockCombatant({ atk: 12, role: 'supporter' });
    const amount = resolveHotAmountFromStatus(
      healer,
      healer,
      {
        id: 'party_hot_healer',
        kind: 'buff',
        overlay: 'hot',
        amount: { kind: 'flat', flatAmount: 1 },
        sourceId: healer.id,
        multiplier: 1,
        durationSec: 99999,
        remainingSec: 99999,
      },
      passives,
    );
    expect(amount).toBeGreaterThanOrEqual(1);
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

describe('resolveDamage defenseIgnore', () => {
  const attacker = mockCombatant({ atk: 100 });
  const target = mockCombatant({ def: 50, reg: 20, isEnemy: true });
  const baseEffect = {
    type: 'damage' as const,
    targetRule: 'frontEnemy' as const,
    damageType: 'physical' as const,
    amount: { kind: 'flat' as const, flatAmount: 100 },
  };

  it('ignores flat DEF', () => {
    const withIgnore = resolveDamage(
      attacker,
      target,
      baseEffect,
      {},
      {
        effectDefenseIgnore: { def: { mode: 'flat', amount: 50 } },
      },
    );
    const baseline = resolveDamage(attacker, target, baseEffect, {});
    expect(withIgnore).toBeGreaterThan(baseline);
  });

  it('ignores REG percent for magic', () => {
    const magicTarget = mockCombatant({ def: 5, reg: 100, isEnemy: true });
    const magicEffect = { ...baseEffect, damageType: 'magic' as const };
    const withIgnore = resolveDamage(
      attacker,
      magicTarget,
      magicEffect,
      {},
      {
        effectDefenseIgnore: { reg: { percent: 0.5 } },
      },
    );
    const baseline = resolveDamage(attacker, magicTarget, magicEffect, {});
    expect(withIgnore).toBeGreaterThan(baseline);
  });
});
