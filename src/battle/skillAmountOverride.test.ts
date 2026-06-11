import { describe, expect, it } from 'vitest';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import { resolveEffectiveAmountSpec } from './skillAmountOverride.ts';
import { resolveDamage } from './combatMath.ts';
import {
  applyPassiveBarrierFromPassive,
  applyPassiveHotFromPassive,
} from './passiveEffects.ts';
import { resolveHotAmountFromStatus } from './combatMath.ts';

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
    role: 'attacker',
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
  override_basic: {
    id: 'override_basic',
    name: 'Override',
    effect: 'skillAmountOverride',
    targetSkillId: 'basic',
    amount: { kind: 'atkBased', atkScale: 3 },
  },
  override_effect1: {
    id: 'override_effect1',
    name: 'OverrideEffect1',
    effect: 'skillAmountOverride',
    targetSkillId: 'multi',
    effectIndex: 1,
    amount: { kind: 'flat', flatAmount: 99 },
  },
  override_hot: {
    id: 'override_hot',
    name: 'OverrideHot',
    effect: 'skillAmountOverride',
    targetSkillId: 'hot_passive',
    amount: { kind: 'flat', flatAmount: 12 },
  },
  hot_passive: {
    id: 'hot_passive',
    name: 'Hot',
    effect: 'heal',
    healSubKind: 'hot',
    hotAmount: { kind: 'flat', flatAmount: 2 },
    hotTargetRule: { kind: 'self' },
  },
  barrier_passive: {
    id: 'barrier_passive',
    name: 'Barrier',
    effect: 'buff',
    buffSubKind: 'barrier',
    barrierAmount: { kind: 'flat', flatAmount: 5 },
    buffTargetRule: { kind: 'self' },
    periodicTrigger: 'stageStart',
  },
  override_barrier: {
    id: 'override_barrier',
    name: 'OverrideBarrier',
    effect: 'skillAmountOverride',
    targetSkillId: 'barrier_passive',
    amount: { kind: 'flat', flatAmount: 20 },
  },
  low_priority: {
    id: 'low_priority',
    name: 'Low',
    effect: 'skillAmountOverride',
    targetSkillId: 'basic',
    amount: { kind: 'flat', flatAmount: 1 },
  },
  high_priority: {
    id: 'high_priority',
    name: 'High',
    effect: 'skillAmountOverride',
    targetSkillId: 'basic',
    amount: { kind: 'flat', flatAmount: 50 },
  },
};

describe('resolveEffectiveAmountSpec', () => {
  it('returns override amount when target skill matches', () => {
    const actor = mockUnit({
      id: 'a1',
      build: {
        learnedPassiveIds: ['override_basic'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const original = { kind: 'atkBased' as const, atkScale: 1 };
    const result = resolveEffectiveAmountSpec(actor, passives, original, {
      skillId: 'basic',
      effectIndex: 0,
    });
    expect(result).toEqual({ kind: 'atkBased', atkScale: 3 });
  });

  it('returns original when no override matches', () => {
    const actor = mockUnit({
      id: 'a1',
      build: {
        learnedPassiveIds: ['override_basic'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const original = { kind: 'flat' as const, flatAmount: 7 };
    const result = resolveEffectiveAmountSpec(actor, passives, original, {
      skillId: 'other',
    });
    expect(result).toEqual(original);
  });

  it('filters by effectIndex', () => {
    const actor = mockUnit({
      id: 'a1',
      build: {
        learnedPassiveIds: ['override_effect1'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const original = { kind: 'atkBased' as const, atkScale: 1 };
    expect(
      resolveEffectiveAmountSpec(actor, passives, original, {
        skillId: 'multi',
        effectIndex: 0,
      }),
    ).toEqual(original);
    expect(
      resolveEffectiveAmountSpec(actor, passives, original, {
        skillId: 'multi',
        effectIndex: 1,
      }),
    ).toEqual({ kind: 'flat', flatAmount: 99 });
  });

  it('prefers later learnedPassiveIds entry', () => {
    const actor = mockUnit({
      id: 'a1',
      build: {
        learnedPassiveIds: ['low_priority', 'high_priority'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const result = resolveEffectiveAmountSpec(
      actor,
      passives,
      { kind: 'flat', flatAmount: 0 },
      { skillId: 'basic' },
    );
    expect(result).toEqual({ kind: 'flat', flatAmount: 50 });
  });
});

describe('skillAmountOverride integration', () => {
  it('changes resolveDamage output', () => {
    const attacker = mockUnit({
      id: 'atk',
      atk: 10,
      build: {
        learnedPassiveIds: ['override_basic'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const target = mockUnit({ id: 'tgt', def: 0, isEnemy: true });
    const effect = {
      type: 'damage' as const,
      target: { kind: 'self' as const },
      amount: { kind: 'atkBased' as const, atkScale: 1 },
    };
    const baseline = resolveDamage(attacker, target, effect, passives);
    const overridden = resolveDamage(
      attacker,
      target,
      {
        ...effect,
        amount: resolveEffectiveAmountSpec(
          attacker,
          passives,
          effect.amount,
          { skillId: 'basic', effectIndex: 0 },
        ),
      },
      passives,
    );
    expect(overridden).toBeGreaterThan(baseline);
    expect(overridden).toBe(30);
  });

  it('overrides passive hot amount on apply and tick', () => {
    const healer = mockUnit({
      id: 'healer',
      build: {
        learnedPassiveIds: ['hot_passive', 'override_hot'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    applyPassiveHotFromPassive(
      healer,
      passives.hot_passive,
      [healer],
      [],
      passives,
    );
    const hot = healer.statusEffects.find((e) => e.overlay === 'hot');
    expect(hot?.amount).toEqual({ kind: 'flat', flatAmount: 12 });
    const tickAmount = resolveHotAmountFromStatus(healer, healer, hot!, passives);
    expect(tickAmount).toBe(12);
  });

  it('overrides passive barrier amount', () => {
    const unit = mockUnit({
      id: 'unit',
      build: {
        learnedPassiveIds: ['barrier_passive', 'override_barrier'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    applyPassiveBarrierFromPassive(
      unit,
      passives.barrier_passive,
      [unit],
      [],
      passives,
    );
    expect(unit.barrierHp).toBe(20);
  });
});
