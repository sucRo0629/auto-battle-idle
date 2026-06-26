import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import {
  applyAllyGuardCounterRetaliation,
  applyPassiveCounterRetaliation,
} from '../battle/counterEffects.ts';
import { expectUnlockTiersMatchGameData } from '../test/gameDataResilience.ts';
import { getClassSkillIds } from './skillUnlocks.ts';
import { syncBuffAuras, syncDebuffAuras } from '../battle/passiveEffects.ts';
import type { CombatantState, PassiveSkillDef } from '../battle/types.ts';
import {
  mockCombatant as mockCombatantBase,
  mockTargetingGameData,
} from '../battle/testFixtures.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return mockCombatantBase(
    {
      formationRow: 'front',
      traits: {
        rangePx: 60,
        damageType: 'physical',
        basicAttackVfx: { enabled: true },
      },
      ...overrides,
    },
    overrides.id,
  );
}

describe('at_lancer passive / active unlock structure', () => {
  const gameData = loadGameData();
  const lancerClass = gameData.classRegistry['at_lancer'];
  const { passives, actives } = gameData.skillRegistry;

  it('loads class skills with expected shapes', () => {
    for (const id of lancerClass.passiveIds ?? []) {
      expect(passives[id]?.id).toBe(id);
    }
    for (const id of getClassSkillIds(lancerClass.skills)) {
      expect(passives[id] ?? actives[id]).toBeDefined();
    }

    const a1 = actives['at_lancer_active_1'];
    expect(a1?.name).toBe('号令');
    expect(a1?.effect.some((e) => e.type === 'move')).toBe(false);
    expect(
      a1?.effect.some((e) => e.type === 'damage' && e.targetShape === 'pierce'),
    ).toBe(true);
    expect(a1?.effect.some((e) => e.type === 'buff' && e.buffStat === 'atk')).toBe(
      true,
    );

    const a2 = actives['at_lancer_active_2'];
    expect(a2?.name).toBe('崩勢');
    const a2Effects = a2?.effect ?? [];
    expect(a2Effects.some((e) => e.type === 'damage')).toBe(false);
    expect(
      a2Effects.some((e) => e.type === 'debuff' && e.debuffSubKind === 'stun'),
    ).toBe(true);
    expect(a2Effects.some((e) => e.type === 'knockback')).toBe(true);
    expect(a2Effects.filter((e) => e.type === 'debuff')).toHaveLength(1);

    const a3 = actives['at_lancer_active_3'];
    expect(a3?.name).toBe('鼓舞');
    const a3BuffStats = a3?.effect
      .filter((e) => e.type === 'buff')
      .map((e) => (e.type === 'buff' ? e.buffStat : undefined));
    expect(a3BuffStats).toContain('atk');
    expect(a3BuffStats).toContain('attackSpeed');

    const a4 = actives['at_lancer_active_4'];
    expect(a4?.name).toBe('追撃');
    expect(
      a4?.effect.some(
        (e) => e.type === 'buff' && e.buffSubKind === 'allyAttackFollowUp',
      ),
    ).toBe(true);
    expect(a4?.effect.some((e) => e.type === 'knockback')).toBe(false);
    const followUp = a4?.effect.find(
      (e) => e.type === 'buff' && e.buffSubKind === 'allyAttackFollowUp',
    );
    if (followUp?.type === 'buff') {
      expect(followUp.followUpDefDebuffMultiplier).toBe(0.95);
      expect(followUp.allyFollowUpRadiusPx).toBe(70);
    }

    const p3 = passives['at_lancer_passive_3'];
    expect(p3?.name).toBe('堅陣');
    expect(p3?.buffStatModifiers).toEqual([
      { stat: 'def', multiplier: 1.1 },
      { stat: 'reg', flatBonus: 5 },
    ]);

    const p4 = passives['at_lancer_passive_4'];
    expect(p4?.name).toBe('援護');
    expect(p4?.effect).toBe('counter');
    expect(p4?.counterTrigger).toBe('frontAllyDamaged');
    expect(p4?.chance).toBe(0.25);
    expect(p4?.counterResponses?.[0]).toMatchObject({
      kind: 'damage',
      amount: { kind: 'atkBased', atkScale: 0.5 },
    });
    expect(p4?.counterResponses?.[1]).toMatchObject({
      kind: 'debuff',
      debuffStat: 'atk',
      debuffMultiplier: 0.9,
    });
  });

  it('syncs member build with resolveLearnedSkills at each unlock tier', () => {
    expectUnlockTiersMatchGameData('at_lancer', gameData);
  });
});

describe('at_lancer combat helpers', () => {
  const gameData = loadGameData();
  const passives = gameData.skillRegistry.passives;

  it('P3 堅陣 applies DEF and REG buff auras near the lancer', () => {
    const lancer = mockUnit({
      id: 'lancer',
      classId: 'at_lancer',
      battleX: 100,
      build: {
        learnedPassiveIds: ['at_lancer_passive_3'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const nearAlly = mockUnit({ id: 'near', battleX: 118 });
    const farAlly = mockUnit({ id: 'far', battleX: 180 });

    syncBuffAuras([lancer, nearAlly, farAlly], [], passives, mockTargetingGameData());
    const defBuff = nearAlly.statusEffects.find((e) => e.stat === 'def');
    const regBuff = nearAlly.statusEffects.find((e) => e.stat === 'reg');
    expect(defBuff?.multiplier).toBe(1.1);
    expect(defBuff?.flatBonus).toBeUndefined();
    expect(regBuff?.flatBonus).toBe(5);
    expect(regBuff?.multiplier).toBe(1);
    expect(farAlly.statusEffects.some((e) => e.stat === 'def')).toBe(false);
  });

  it('P1/P2 passive bridge regressions still sync auras', () => {
    const lancer = mockUnit({
      id: 'lancer',
      classId: 'at_lancer',
      battleX: 100,
      build: {
        learnedPassiveIds: ['at_lancer_passive_1', 'at_lancer_passive_2'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const enemy = mockUnit({
      id: 'enemy',
      isEnemy: true,
      battleX: 140,
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const ally = mockUnit({ id: 'ally', battleX: 118 });

    syncDebuffAuras([lancer], [enemy], passives, mockTargetingGameData());
    syncBuffAuras([lancer, ally], [], passives, mockTargetingGameData());

    const p1 = passives['at_lancer_passive_1'];
    const p2 = passives['at_lancer_passive_2'];
    expect(
      enemy.statusEffects.some(
        (e) => e.stat === 'atk' && e.multiplier === p1?.debuffMultiplier,
      ),
    ).toBe(true);
    expect(
      ally.statusEffects.some(
        (e) => e.stat === 'atk' && e.multiplier === p2?.buffMultiplier,
      ),
    ).toBe(true);
  });
});

describe('at_lancer P4 ally guard counter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const allyGuardPassive: PassiveSkillDef = {
    id: 'at_lancer_passive_4',
    name: '援護',
    effect: 'counter',
    counterTrigger: 'frontAllyDamaged',
    chance: 1,
    counterResponses: [
      {
        kind: 'damage',
        amount: { kind: 'atkBased', atkScale: 0.5 },
        damageType: 'physical',
      },
      {
        kind: 'debuff',
        debuffStat: 'atk',
        debuffMultiplier: 0.9,
        debuffDurationSec: 5,
      },
    ],
  };

  it('counters from the lancer when a front ally is damaged', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const registry = { [allyGuardPassive.id]: allyGuardPassive };
    const lancer = mockUnit({
      id: 'lancer',
      atk: 40,
      battleX: 100,
      build: {
        learnedPassiveIds: [allyGuardPassive.id],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const frontAlly = mockUnit({
      id: 'guardian',
      battleX: 110,
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const attacker = mockUnit({
      id: 'attacker',
      hp: 100,
      def: 0,
      isEnemy: true,
      battleX: 110,
    });
    const emit = vi.fn();

    applyAllyGuardCounterRetaliation(
      frontAlly,
      attacker,
      { attackKind: 'damage', appliedDamage: 10 },
      [lancer, frontAlly],
      registry,
      {},
      { emit, getAllCombatants: () => [lancer, frontAlly, attacker] },
    );

    expect(attacker.hp).toBe(80);
    expect(attacker.statusEffects.some((e) => e.stat === 'atk')).toBe(true);
    expect(emit).toHaveBeenCalled();
  });

  it('does not proc ally guard from self-damaged counter passives', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const selfCounter: PassiveSkillDef = {
      id: 'self_counter',
      name: '自己反撃',
      effect: 'counter',
      chance: 1,
      counterResponses: [
        { kind: 'damage', amount: { kind: 'flat', flatAmount: 99 } },
      ],
    };
    const registry = { [selfCounter.id]: selfCounter };
    const ally = mockUnit({
      id: 'ally',
      battleX: 100,
      build: {
        learnedPassiveIds: [selfCounter.id],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const attacker = mockUnit({
      id: 'attacker',
      hp: 100,
      def: 0,
      isEnemy: true,
      battleX: 100,
    });
    const emit = vi.fn();

    applyPassiveCounterRetaliation(
      ally,
      attacker,
      { attackKind: 'damage', appliedDamage: 10 },
      registry,
      {},
      { emit, getAllCombatants: () => [ally, attacker] },
    );
    expect(attacker.hp).toBe(1);

    attacker.hp = 100;
    applyAllyGuardCounterRetaliation(
      ally,
      attacker,
      { attackKind: 'damage', appliedDamage: 10 },
      [ally],
      registry,
      {},
      { emit, getAllCombatants: () => [ally, attacker] },
    );
    expect(attacker.hp).toBe(100);
  });
});
