import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyCounterRetaliation,
  applyPassiveCounterRetaliation,
  isCounterInTriggerRange,
  matchesCounterAttackMethod,
  resolveCounterRangePx,
} from './counterEffects.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  CounterResponseDef,
  PassiveSkillDef,
  StatusEffect,
} from './types.ts';
import { parseSkillEffect } from './data/validateGameData.ts';
import { mockCombatant as mockCombatantBase } from './testFixtures.ts';

const passives: Record<string, PassiveSkillDef> = {};

const actives: Record<string, ActiveSkillDef> = {
  test_basic: {
    id: 'test_basic',
    name: 'test_basic',
    trigger: { kind: 'time', value: 2 },
    effect: [],
  },
};

const counterChancePassive: PassiveSkillDef = {
  id: 'passive_counter_chance',
  name: '確率反撃',
  effect: 'counter',
  chance: 0.5,
  counterRange: 100,
  counterResponses: [
    { kind: 'damage', amount: { kind: 'flat', flatAmount: 25 } },
  ],
};

function mockCombatant(overrides: Partial<CombatantState> = {}): CombatantState {
  return mockCombatantBase(overrides, 'counterDefender');
}

function counterStatus(
  responses: CounterResponseDef[],
  overrides: Partial<StatusEffect> = {},
): StatusEffect {
  return {
    id: 'counter_1',
    kind: 'buff',
    overlay: 'counter',
    responses,
    counterRangePx: 0,
    multiplier: 1,
    durationSec: 5,
    remainingSec: 5,
    skillId: 'counter_skill',
    ...overrides,
  };
}


describe('isCounterInTriggerRange', () => {
  it('uses traits.rangePx when counter range is 0', () => {
    const victim = mockCombatant({
      battleX: 100,
      traits: {
        rangePx: 80,
        damageType: 'physical',
        basicAttackVfx: { enabled: true },
      },
    });
    const attacker = mockCombatant({
      id: 'atk',
      isEnemy: true,
      battleX: 150,
    });
    const effect = counterStatus(
      [{ kind: 'damage', amount: { kind: 'flat', flatAmount: 5 } }],
      { counterRangePx: 0 },
    );
    expect(isCounterInTriggerRange(effect, victim, attacker)).toBe(true);
  });

  it('allows melee contact when counter range is 0 and traits.rangePx is 0', () => {
    const victim = mockCombatant({ battleX: 100 });
    const attacker = mockCombatant({
      id: 'atk',
      isEnemy: true,
      battleX: 100,
    });
    const effect = counterStatus(
      [{ kind: 'damage', amount: { kind: 'flat', flatAmount: 5 } }],
      { counterRangePx: 0 },
    );
    expect(isCounterInTriggerRange(effect, victim, attacker)).toBe(true);
  });

  it('rejects ranged attacker when counter range is 0 and traits.rangePx is 0', () => {
    const victim = mockCombatant({ battleX: 100 });
    const attacker = mockCombatant({
      id: 'atk',
      isEnemy: true,
      battleX: 200,
      traits: {
        rangePx: 100,
        damageType: 'physical',
        basicAttackVfx: { enabled: true },
      },
    });
    const effect = counterStatus(
      [{ kind: 'damage', amount: { kind: 'flat', flatAmount: 5 } }],
      { counterRangePx: 0 },
    );
    expect(isCounterInTriggerRange(effect, victim, attacker)).toBe(false);
  });
});

describe('resolveCounterRangePx', () => {
  it('falls back to traits.rangePx for undefined and 0', () => {
    const victim = mockCombatant({
      traits: {
        rangePx: 120,
        damageType: 'physical',
        basicAttackVfx: { enabled: true },
      },
    });
    expect(resolveCounterRangePx(undefined, victim)).toBe(120);
    expect(resolveCounterRangePx(0, victim)).toBe(120);
    expect(resolveCounterRangePx(50, victim)).toBe(50);
  });
});

describe('applyCounterRetaliation', () => {
  it('returns configured damage to attacker on hit', () => {
    const victim = mockCombatant({
      id: 'victim',
      battleX: 100,
      statusEffects: [
        counterStatus([
          {
            kind: 'damage',
            amount: { kind: 'flat', flatAmount: 20 },
          },
        ]),
      ],
    });
    const attacker = mockCombatant({
      id: 'attacker',
      hp: 100,
      def: 0,
      isEnemy: true,
      battleX: 100,
    });
    const emit = vi.fn();

    applyCounterRetaliation(
      victim,
      attacker,
      { attackKind: 'damage', appliedDamage: 10 },
      passives,
      actives,
      { emit, getAllCombatants: () => [victim, attacker] },
    );

    expect(attacker.hp).toBe(80);
    expect(emit).toHaveBeenCalled();
  });

  it('applies damage and stun responses together', () => {
    const victim = mockCombatant({
      id: 'victim',
      battleX: 100,
      statusEffects: [
        counterStatus([
          { kind: 'damage', amount: { kind: 'flat', flatAmount: 10 } },
          { kind: 'stun', durationSec: 2 },
        ]),
      ],
    });
    const attacker = mockCombatant({
      id: 'attacker',
      hp: 100,
      def: 0,
      isEnemy: true,
      battleX: 100,
      cooldowns: [
        { skillId: 'test_basic', remaining: 0, slotKind: 'basic' },
      ],
    });
    const emit = vi.fn();

    applyCounterRetaliation(
      victim,
      attacker,
      { attackKind: 'damage', appliedDamage: 10 },
      passives,
      actives,
      { emit, getAllCombatants: () => [victim, attacker] },
    );

    expect(attacker.hp).toBe(90);
    expect(attacker.statusEffects.some((e) => e.overlay === 'stun')).toBe(true);
    expect(
      attacker.cooldowns.find((cd) => cd.slotKind === 'basic')?.remaining,
    ).toBe(2);
  });

  it('applies debuff response to attacker', () => {
    const victim = mockCombatant({
      id: 'victim',
      battleX: 100,
      statusEffects: [
        counterStatus([
          {
            kind: 'debuff',
            debuffStat: 'atk',
            debuffMultiplier: 0.5,
            debuffDurationSec: 3,
          },
        ]),
      ],
    });
    const attacker = mockCombatant({
      id: 'attacker',
      isEnemy: true,
      battleX: 100,
    });
    const emit = vi.fn();

    applyCounterRetaliation(
      victim,
      attacker,
      { attackKind: 'damage', appliedDamage: 10 },
      passives,
      actives,
      { emit, getAllCombatants: () => [victim, attacker] },
    );

    expect(
      attacker.statusEffects.some(
        (e) => e.kind === 'debuff' && e.stat === 'atk',
      ),
    ).toBe(true);
  });

  it('does not retaliate when attacker is out of range', () => {
    const victim = mockCombatant({
      id: 'victim',
      battleX: 100,
      statusEffects: [
        counterStatus(
          [{ kind: 'damage', amount: { kind: 'flat', flatAmount: 20 } }],
          { counterRangePx: 0 },
        ),
      ],
    });
    const attacker = mockCombatant({
      id: 'attacker',
      hp: 100,
      isEnemy: true,
      battleX: 200,
      traits: {
        rangePx: 100,
        damageType: 'physical',
        basicAttackVfx: { enabled: true },
      },
    });
    const emit = vi.fn();

    applyCounterRetaliation(
      victim,
      attacker,
      { attackKind: 'damage', appliedDamage: 10 },
      passives,
      actives,
      { emit, getAllCombatants: () => [victim, attacker] },
    );

    expect(attacker.hp).toBe(100);
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not chain counter damage into another counter', () => {
    const victim = mockCombatant({
      id: 'victim',
      battleX: 100,
      statusEffects: [
        counterStatus([
          { kind: 'damage', amount: { kind: 'flat', flatAmount: 20 } },
        ]),
      ],
    });
    const attacker = mockCombatant({
      id: 'attacker',
      hp: 100,
      battleX: 100,
      statusEffects: [
        counterStatus([
          { kind: 'damage', amount: { kind: 'flat', flatAmount: 99 } },
        ]),
      ],
    });
    const emit = vi.fn();

    applyCounterRetaliation(
      victim,
      attacker,
      { attackKind: 'damage', appliedDamage: 10, isCounterDamage: true },
      passives,
      actives,
      { emit, getAllCombatants: () => [victim, attacker] },
    );

    expect(attacker.hp).toBe(100);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('applyPassiveCounterRetaliation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retaliates on proc success without granting counter status', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const registry = { [counterChancePassive.id]: counterChancePassive };
    const victim = mockCombatant({
      id: 'victim',
      battleX: 100,
      build: {
        learnedPassiveIds: [counterChancePassive.id],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const attacker = mockCombatant({
      id: 'attacker',
      hp: 100,
      def: 0,
      isEnemy: true,
      battleX: 100,
    });
    const emit = vi.fn();

    applyPassiveCounterRetaliation(
      victim,
      attacker,
      { attackKind: 'damage', appliedDamage: 10 },
      registry,
      actives,
      { emit, getAllCombatants: () => [victim, attacker] },
    );

    expect(victim.statusEffects).toHaveLength(0);
    expect(attacker.hp).toBe(75);
    expect(emit).toHaveBeenCalled();
  });

  it('does not retaliate when roll fails', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const registry = { [counterChancePassive.id]: counterChancePassive };
    const victim = mockCombatant({
      build: {
        learnedPassiveIds: [counterChancePassive.id],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      battleX: 100,
    });
    const attacker = mockCombatant({
      id: 'attacker',
      hp: 100,
      isEnemy: true,
      battleX: 100,
    });
    const emit = vi.fn();

    applyPassiveCounterRetaliation(
      victim,
      attacker,
      { attackKind: 'damage', appliedDamage: 10 },
      registry,
      actives,
      { emit, getAllCombatants: () => [victim, attacker] },
    );

    expect(attacker.hp).toBe(100);
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not proc when attacker is out of range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const registry = {
      [counterChancePassive.id]: {
        ...counterChancePassive,
        counterRange: 0,
      },
    };
    const victim = mockCombatant({
      build: {
        learnedPassiveIds: [counterChancePassive.id],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      battleX: 100,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
    });
    const attacker = mockCombatant({
      id: 'attacker',
      hp: 100,
      isEnemy: true,
      battleX: 200,
      traits: {
        rangePx: 100,
        damageType: 'physical',
        basicAttackVfx: { enabled: true },
      },
    });
    const emit = vi.fn();

    applyPassiveCounterRetaliation(
      victim,
      attacker,
      { attackKind: 'damage', appliedDamage: 10 },
      registry,
      actives,
      { emit, getAllCombatants: () => [victim, attacker] },
    );

    expect(attacker.hp).toBe(100);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('matchesCounterAttackMethod', () => {
  it('allows all bands when filter is empty', () => {
    expect(matchesCounterAttackMethod('melee', {})).toBe(true);
    expect(matchesCounterAttackMethod('ranged', {})).toBe(true);
  });

  it('filters melee and ranged attacks with OR semantics', () => {
    expect(
      matchesCounterAttackMethod('melee', { counterMelee: true }),
    ).toBe(true);
    expect(
      matchesCounterAttackMethod('ranged', {
        counterMelee: true,
      }),
    ).toBe(false);
    expect(
      matchesCounterAttackMethod('ranged', {
        counterRanged: true,
      }),
    ).toBe(true);
    expect(
      matchesCounterAttackMethod('melee', {
        counterMelee: true,
        counterRanged: true,
      }),
    ).toBe(true);
  });
});

describe('applyCounterRetaliation range band filter', () => {
  it('skips retaliation when incoming attack band is excluded', () => {
    const victim = mockCombatant({
      id: 'victim',
      battleX: 100,
      statusEffects: [
        counterStatus(
          [{ kind: 'damage', amount: { kind: 'flat', flatAmount: 20 } }],
          { counterRangePx: 200, counterMelee: true },
        ),
      ],
    });
    const attacker = mockCombatant({
      id: 'attacker',
      hp: 100,
      def: 0,
      isEnemy: true,
      battleX: 150,
    });
    const emit = vi.fn();

    applyCounterRetaliation(
      victim,
      attacker,
      {
        attackKind: 'damage',
        appliedDamage: 10,
        attackMethod: 'ranged',
      },
      passives,
      actives,
      { emit, getAllCombatants: () => [victim, attacker] },
    );

    expect(attacker.hp).toBe(100);
    expect(emit).not.toHaveBeenCalled();
  });

  it('retaliates when incoming attack band matches melee-only filter', () => {
    const victim = mockCombatant({
      id: 'victim',
      battleX: 100,
      statusEffects: [
        counterStatus(
          [{ kind: 'damage', amount: { kind: 'flat', flatAmount: 20 } }],
          { counterRangePx: 200, counterMelee: true },
        ),
      ],
    });
    const attacker = mockCombatant({
      id: 'attacker',
      hp: 100,
      def: 0,
      isEnemy: true,
      battleX: 150,
    });
    const emit = vi.fn();

    applyCounterRetaliation(
      victim,
      attacker,
      {
        attackKind: 'damage',
        appliedDamage: 10,
        attackMethod: 'melee',
      },
      passives,
      actives,
      { emit, getAllCombatants: () => [victim, attacker] },
    );

    expect(attacker.hp).toBe(80);
    expect(emit).toHaveBeenCalled();
  });
});

describe('parseSkillEffect counter', () => {
  it('normalizes target to self and parses responses', () => {
    const effect = parseSkillEffect(
      {
        type: 'counter',
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        durationSec: 5,
        range: 0,
        responses: [
          {
            kind: 'damage',
            amount: { kind: 'defBased', defScale: 0.5 },
          },
        ],
      },
      'test',
    );
    expect(effect.type).toBe('counter');
    if (effect.type !== 'counter') return;
    expect(effect.target).toEqual({ kind: 'self' });
    expect(effect.responses).toHaveLength(1);
    expect(effect.responses[0]?.kind).toBe('damage');
  });

  it('requires responses array for counter', () => {
    expect(() =>
      parseSkillEffect(
        {
          type: 'counter',
          durationSec: 5,
          amount: { kind: 'flat', flatAmount: 12 },
          damageType: 'magic',
        },
        'test',
      ),
    ).toThrow();
  });

  it('parses counterMelee and counterRanged flags', () => {
    const effect = parseSkillEffect(
      {
        type: 'counter',
        durationSec: 5,
        counterMelee: true,
        responses: [
          { kind: 'damage', amount: { kind: 'flat', flatAmount: 1 } },
        ],
      },
      'test',
    );
    expect(effect.type).toBe('counter');
    if (effect.type !== 'counter') return;
    expect(effect.counterMelee).toBe(true);
    expect(effect.counterRanged).toBeUndefined();
  });

  it('rejects multiLock targetShape', () => {
    expect(() =>
      parseSkillEffect(
        {
          type: 'counter',
          targetShape: 'multiLock',
          hitCount: 2,
          durationSec: 5,
          responses: [
            { kind: 'damage', amount: { kind: 'flat', flatAmount: 1 } },
          ],
        },
        'test',
      ),
    ).toThrow(/multiLock/);
  });
});

describe('parseSkillEffect move', () => {
  it('normalizes legacy behindTarget + behindOffsetPx to toAnchor + anchorOffsetPx', () => {
    const effect = parseSkillEffect(
      {
        type: 'move',
        moveMode: 'behindTarget',
        behindOffsetPx: 32,
        moveDurationSec: 0.2,
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
      },
      'test',
    );
    expect(effect.type).toBe('move');
    if (effect.type !== 'move') return;
    expect(effect.moveMode).toBe('toAnchor');
    expect(effect.anchorOffsetPx).toBe(32);
    expect('behindOffsetPx' in effect).toBe(false);
  });

  it('omits anchorOffsetPx when zero', () => {
    const effect = parseSkillEffect(
      {
        type: 'move',
        moveMode: 'toAnchor',
        anchorOffsetPx: 0,
        moveDurationSec: 0.2,
        target: { kind: 'distance', side: 'ally', order: 'nearest' },
      },
      'test',
    );
    expect(effect.type).toBe('move');
    if (effect.type !== 'move') return;
    expect(effect.anchorOffsetPx).toBeUndefined();
  });
});
