import { describe, expect, it } from 'vitest';
import { mockTargetingGameData } from './testFixtures.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import {
  applyExcessHealToBarrierFromPassive,
  getPassiveDamageIncreaseMultiplier,
  getPassiveOutgoingDamageMultiplier,
  resolveIncomingHealAmount,
  applyPassiveBarrierFromPassive,
  applyPassiveHotFromPassive,
  firePeriodicPassivesForTrigger,
  syncHotAuras,
  syncBuffAuras,
  syncDamageReductionAuras,
  syncSelfHpRatioBuffAuras,
  resolveSelfHpRatioBuffScale,
  rollsEvasion,
} from './passiveEffects.ts';
import { aggregateStatStatusEffects } from './statusEffectDisplay.ts';

function mockAlly(
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
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      { skillId: 'heavy', remaining: 3, slotKind: 'active', slotIndex: 0 },
      { skillId: 'basic', remaining: 0, slotKind: 'basic' },
    ],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 0,
    corpseVisible: true,
    ...overrides,
  };
}

const passives: Record<string, PassiveSkillDef> = {
  evade: {
    id: 'evade',
    name: 'Evade',
    effect: 'buff',
    buffSubKind: 'evasion',
    chance: 1,
    buffTargetRule: { kind: 'self' },
  },
  dotBonus: {
    id: 'dotBonus',
    name: 'DotBonus',
    effect: 'specialEffect',
    specialEffectApplyTo: 'damage',
    specialEffect: {
      scale: 2,
      conditions: [{ kind: 'debuff', tags: ['dot'] }],
    },
  },
  aura: {
    id: 'aura',
    name: 'Aura',
    effect: 'heal',
    healSubKind: 'hot',
    hotTargetRule: { kind: "self" },
    hotAmount: { kind: 'flat', flatAmount: 2 },
  },
  excessBarrier: {
    id: 'excessBarrier',
    name: 'ExcessBarrier',
    effect: 'excessHealToBarrier',
    barrierScale: 1,
  },
};

describe('passiveEffects', () => {
  it('getPassiveDamageIncreaseMultiplier applies dot bonus', () => {
    const dotted = mockAlly({
      id: 'dotted',
      build: {
        learnedPassiveIds: ['dotBonus'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const hunterMul = getPassiveDamageIncreaseMultiplier(
      dotted,
      mockAlly({
        id: 'enemy',
        statusEffects: [
          {
            id: 'dot1',
            kind: 'debuff',
            overlay: 'dot',
            multiplier: 1,
            durationSec: 5,
            remainingSec: 5,
          },
        ],
      }),
      passives,
    );
    expect(hunterMul).toBe(2);
  });

  it('resolveIncomingHealAmount scales heal and hot by target passives', () => {
    const target = mockAlly({
      id: 'target',
      build: {
        learnedPassiveIds: ['healBoost'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const healPassives: Record<string, PassiveSkillDef> = {
      healBoost: {
        id: 'healBoost',
        name: 'HealBoost',
        effect: 'specialEffect',
        specialEffectApplyTo: 'heal',
        specialEffect: { scale: 1.25, conditions: [] },
      },
    };
    expect(resolveIncomingHealAmount(target, 100, healPassives)).toBe(125);
    expect(resolveIncomingHealAmount(target, 0, healPassives)).toBe(0);
    expect(resolveIncomingHealAmount(target, 100, {})).toBe(100);
  });

  it('resolveIncomingHealAmount sums percent from multiple passives', () => {
    const target = mockAlly({
      id: 'target',
      build: {
        learnedPassiveIds: ['a', 'b'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const healPassives: Record<string, PassiveSkillDef> = {
      a: {
        id: 'a',
        name: 'A',
        effect: 'specialEffect',
        specialEffectApplyTo: 'heal',
        specialEffect: { scale: 1.1, conditions: [] },
      },
      b: {
        id: 'b',
        name: 'B',
        effect: 'specialEffect',
        specialEffectApplyTo: 'heal',
        specialEffect: { scale: 1.15, conditions: [] },
      },
    };
    expect(resolveIncomingHealAmount(target, 100, healPassives)).toBe(126);
  });

  it('applyExcessHealToBarrierFromPassive converts overheal and replaces barrier', () => {
    const healer = mockAlly({
      id: 'healer',
      build: {
        learnedPassiveIds: ['excessBarrier'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const target = mockAlly({ id: 'target', hp: 90, maxHp: 100, barrierHp: 5 });
    const grant = applyExcessHealToBarrierFromPassive(
      healer,
      target,
      20,
      passives,
      'outgoing',
    );
    expect(grant).toBe(10);
    expect(target.barrierHp).toBe(10);
  });

  it('applyExcessHealToBarrierFromPassive supports incoming heal on target', () => {
    const target = mockAlly({
      id: 'target',
      hp: 90,
      maxHp: 100,
      build: {
        learnedPassiveIds: ['incomingBarrier'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const incomingPassives: Record<string, PassiveSkillDef> = {
      incomingBarrier: {
        id: 'incomingBarrier',
        name: 'IncomingBarrier',
        effect: 'excessHealToBarrier',
        barrierScale: 1,
        excessHealSources: ['incoming'],
      },
    };
    const grant = applyExcessHealToBarrierFromPassive(
      target,
      target,
      20,
      incomingPassives,
      'incoming',
    );
    expect(grant).toBe(10);
    expect(target.barrierHp).toBe(10);
  });

  it('getPassiveOutgoingDamageMultiplier only handles crowd bonus', () => {
    expect(
      getPassiveOutgoingDamageMultiplier(
        mockAlly({ id: 'a' }),
        mockAlly({ id: 'b' }),
        {},
        { targetShape: 'aoe', crowdHitCount: 3 },
      ),
    ).toBe(1);
  });

  it('rollsEvasion uses evasion overlay from status effects', () => {
    const unit = mockAlly({ id: 'unit' });
    unit.statusEffects.push({
      id: 'evasion_buff',
      kind: 'buff',
      overlay: 'evasion',
      evasionChance: 1,
      multiplier: 1,
      durationSec: 5,
      remainingSec: 5,
    });
    expect(rollsEvasion(unit, {})).toBe(true);
  });

  it('syncHotAuras applies hot overlay to the selected target only', () => {
    const healer = mockAlly({
      id: 'healer',
      role: 'supporter',
      build: {
        learnedPassiveIds: ['aura'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const ally = mockAlly({
      id: 'ally',
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    syncHotAuras([healer, ally], [], passives, mockTargetingGameData());
    expect(healer.statusEffects.some((e) => e.overlay === 'hot')).toBe(true);
    expect(ally.statusEffects.some((e) => e.overlay === 'hot')).toBe(false);
  });

  it('syncHotAuras preserves hot tick progress when resynced', () => {
    const healer = mockAlly({
      id: 'healer',
      role: 'supporter',
      build: {
        learnedPassiveIds: ['aura'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    syncHotAuras([healer], [], passives, mockTargetingGameData());
    const hot = healer.statusEffects.find((e) => e.overlay === 'hot');
    expect(hot).toBeDefined();
    if (!hot) return;
    hot.tickSec = 0.35;
    syncHotAuras([healer], [], passives, mockTargetingGameData());
    const refreshed = healer.statusEffects.find((e) => e.overlay === 'hot');
    expect(refreshed?.tickSec).toBeCloseTo(0.35, 5);
  });

  it('syncHotAuras respects hotTargetRule', () => {
    const passivesWithAllyTarget = {
      ...passives,
      aura: {
        ...passives.aura,
        hotTargetRule: { kind: "stat", side: "ally", stat: "hp", order: "ratio" } as const,
      },
    };
    const healer = mockAlly({
      id: 'healer',
      role: 'supporter',
      hp: 100,
      build: {
        learnedPassiveIds: ['aura'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const ally = mockAlly({
      id: 'ally',
      hp: 50,
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    syncHotAuras([healer, ally], [], passivesWithAllyTarget, mockTargetingGameData());
    expect(healer.statusEffects.some((e) => e.overlay === 'hot')).toBe(false);
    expect(ally.statusEffects.some((e) => e.overlay === 'hot')).toBe(true);
  });

  it('syncHotAuras applies hot to all allies when hotTargetRule is allAllies', () => {
    const passivesWithPartyHot = {
      ...passives,
      aura: {
        ...passives.aura,
        hotTargetRule: { kind: "all", side: "ally" } as const,
      },
    };
    const healer = mockAlly({
      id: 'healer',
      build: {
        learnedPassiveIds: ['aura'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const ally = mockAlly({
      id: 'ally',
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    syncHotAuras([healer, ally], [], passivesWithPartyHot, mockTargetingGameData());
    expect(healer.statusEffects.some((e) => e.overlay === 'hot')).toBe(true);
    expect(ally.statusEffects.some((e) => e.overlay === 'hot')).toBe(true);
  });

  it('syncBuffAuras applies block overlay on self without status badges', () => {
    const blockPassives = {
      ...passives,
      defender_passive_1: {
        id: 'defender_passive_1',
        name: '盾受け',
        effect: 'buff' as const,
        buffSubKind: 'block' as const,
        chance: 0.15,
        buffTargetRule: { kind: 'self' as const },
      },
    };
    const guard = mockAlly({
      id: 'guard',
      build: {
        learnedPassiveIds: ['defender_passive_1'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    syncBuffAuras([guard], [], blockPassives, mockTargetingGameData());
    const blockEffect = guard.statusEffects.find((e) => e.overlay === 'block');
    expect(blockEffect?.blockChance).toBe(0.15);
    expect(blockEffect?.stat).toBeUndefined();

    const badges = aggregateStatStatusEffects(guard.statusEffects, {
      baseMaxHp: guard.maxHp,
      atk: guard.atk,
      def: guard.def,
      reg: guard.reg,
    });
    expect(badges).toEqual([]);
  });

  it('syncBuffAuras replaces block aura instead of stacking duplicates', () => {
    const blockPassives = {
      ...passives,
      defender_passive_1: {
        id: 'defender_passive_1',
        name: '盾受け',
        effect: 'buff' as const,
        buffSubKind: 'block' as const,
        chance: 0.15,
        buffTargetRule: { kind: 'self' as const },
      },
    };
    const guard = mockAlly({
      id: 'guard',
      build: {
        learnedPassiveIds: ['defender_passive_1'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });

    syncBuffAuras([guard], [], blockPassives, mockTargetingGameData());
    syncBuffAuras([guard], [], blockPassives, mockTargetingGameData());

    const blockEffects = guard.statusEffects.filter((e) => e.overlay === 'block');
    expect(blockEffects).toHaveLength(1);
    expect(blockEffects[0]?.id.startsWith('passive_buff_aura_')).toBe(true);
  });

  it('syncDamageReductionAuras applies damageTaken reduction to selected targets', () => {
    const reductionPassives = {
      ...passives,
      guard: {
        id: 'guard',
        name: 'Guard',
        effect: 'damageReduction' as const,
        damageReductionPercent: 0.25,
        damageReductionTargetRule: { kind: "all", side: "ally" } as const,
      },
    };
    const tank = mockAlly({
      id: 'tank',
      build: {
        learnedPassiveIds: ['guard'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const ally = mockAlly({
      id: 'ally',
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    syncDamageReductionAuras([tank, ally], [], reductionPassives, mockTargetingGameData());
    const tankMul = tank.statusEffects.find((e) => e.stat === 'damageTaken')
      ?.multiplier;
    const allyMul = ally.statusEffects.find((e) => e.stat === 'damageTaken')
      ?.multiplier;
    expect(tankMul).toBe(0.75);
    expect(allyMul).toBe(0.75);
  });

  it('applyPassiveHotFromPassive respects hotDurationSec', () => {
    const periodicHotPassives = {
      aura: {
        id: 'aura',
        name: 'Aura',
        effect: 'heal' as const,
        healSubKind: 'hot' as const,
        hotTargetRule: { kind: 'self' as const },
        hotAmount: { kind: 'flat' as const, flatAmount: 2 },
        hotDurationSec: 8,
      },
    };
    const healer = mockAlly({ id: 'healer', role: 'supporter' });
    applyPassiveHotFromPassive(
      healer,
      periodicHotPassives.aura,
      [healer],
      [],
      periodicHotPassives,
      mockTargetingGameData(),
    );
    const hot = healer.statusEffects.find((e) => e.overlay === 'hot');
    expect(hot?.durationSec).toBe(8);
    expect(hot?.remainingSec).toBe(8);
  });

  it('syncHotAuras skips passives with stageStart trigger', () => {
    const periodicHotPassives = {
      aura: {
        id: 'aura',
        name: 'Aura',
        effect: 'heal' as const,
        healSubKind: 'hot' as const,
        hotTargetRule: { kind: 'self' as const },
        hotAmount: { kind: 'flat' as const, flatAmount: 2 },
        periodicTrigger: 'stageStart' as const,
      },
    };
    const healer = mockAlly({
      id: 'healer',
      build: {
        learnedPassiveIds: ['aura'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    syncHotAuras([healer], [], periodicHotPassives, mockTargetingGameData());
    expect(healer.statusEffects.some((e) => e.overlay === 'hot')).toBe(false);
  });

  it('applyPassiveBarrierFromPassive grants barrier to target', () => {
    const barrierPassives = {
      shield: {
        id: 'shield',
        name: 'Shield',
        effect: 'buff' as const,
        buffSubKind: 'barrier' as const,
        buffTargetRule: { kind: 'self' as const },
        barrierAmount: { kind: 'flat' as const, flatAmount: 25 },
        periodicTrigger: 'stageStart' as const,
      },
    };
    const guard = mockAlly({
      id: 'guard',
      def: 30,
      build: {
        learnedPassiveIds: ['shield'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    applyPassiveBarrierFromPassive(
      guard,
      barrierPassives.shield,
      [guard],
      [],
      barrierPassives,
      mockTargetingGameData(),
    );
    expect(guard.barrierHp).toBe(25);
  });

  it('firePeriodicPassivesForTrigger applies barrier on waveStart', () => {
    const barrierPassives = {
      shield: {
        id: 'shield',
        name: 'Shield',
        effect: 'buff' as const,
        buffSubKind: 'barrier' as const,
        buffTargetRule: { kind: 'self' as const },
        barrierAmount: { kind: 'flat' as const, flatAmount: 12 },
        periodicTrigger: 'waveStart' as const,
      },
    };
    const guard = mockAlly({
      id: 'guard',
      build: {
        learnedPassiveIds: ['shield'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    firePeriodicPassivesForTrigger(
      'waveStart',
      [guard],
      [guard],
      [],
      barrierPassives,
      mockTargetingGameData(),
    );
    expect(guard.barrierHp).toBe(12);
  });

  it('firePeriodicPassivesForTrigger skips hot when trigger chance fails', () => {
    const periodicHotPassives = {
      aura: {
        id: 'aura',
        name: 'Aura',
        effect: 'heal' as const,
        healSubKind: 'hot' as const,
        hotTargetRule: { kind: 'self' as const },
        hotAmount: { kind: 'flat' as const, flatAmount: 2 },
        periodicTrigger: 'stageStart' as const,
        chance: 0,
      },
    };
    const healer = mockAlly({
      id: 'healer',
      build: {
        learnedPassiveIds: ['aura'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    firePeriodicPassivesForTrigger(
      'stageStart',
      [healer],
      [healer],
      [],
      periodicHotPassives,
      mockTargetingGameData(),
    );
    expect(healer.statusEffects.some((e) => e.overlay === 'hot')).toBe(false);
  });

  it('firePeriodicPassivesForTrigger applies hot on stageStart', () => {
    const periodicHotPassives = {
      aura: {
        id: 'aura',
        name: 'Aura',
        effect: 'heal' as const,
        healSubKind: 'hot' as const,
        hotTargetRule: { kind: 'self' as const },
        hotAmount: { kind: 'flat' as const, flatAmount: 2 },
        periodicTrigger: 'stageStart' as const,
      },
    };
    const healer = mockAlly({
      id: 'healer',
      build: {
        learnedPassiveIds: ['aura'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    firePeriodicPassivesForTrigger(
      'stageStart',
      [healer],
      [healer],
      [],
      periodicHotPassives,
      mockTargetingGameData(),
    );
    expect(healer.statusEffects.some((e) => e.overlay === 'hot')).toBe(true);
  });

  it('syncHotAuras treats legacy intervalSec-only passives as aura mode', () => {
    const periodicHotPassives = {
      aura: {
        id: 'aura',
        name: 'Aura',
        effect: 'heal' as const,
        healSubKind: 'hot' as const,
        hotTargetRule: { kind: 'self' as const },
        hotAmount: { kind: 'flat' as const, flatAmount: 2 },
        intervalSec: 5,
      },
    };
    const healer = mockAlly({
      id: 'healer',
      build: {
        learnedPassiveIds: ['aura'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    syncHotAuras([healer], [], periodicHotPassives, mockTargetingGameData());
    expect(healer.statusEffects.some((e) => e.overlay === 'hot')).toBe(true);
  });

  it('continuous lancer aura syncs immediately while waveStart passive waits for the trigger', () => {
    const passives = {
      at_lancer_passive_2: {
        id: 'at_lancer_passive_2',
        name: '槍術士の援護',
        effect: 'buff' as const,
        buffSubKind: 'stat' as const,
        buffTargetRule: { kind: 'distance' as const, side: 'ally' as const, order: 'selfOrigin' as const },
        buffTargetShape: 'aoe' as const,
        buffRange: 100,
        buffAoeRadiusPx: 25,
        buffStat: 'def',
        buffMultiplier: 1.1,
      },
      at_lancer_passive_2_periodic: {
        id: 'at_lancer_passive_2_periodic',
        name: '槍術士の援護(周期)',
        effect: 'buff' as const,
        buffSubKind: 'stat' as const,
        buffTargetRule: { kind: 'distance' as const, side: 'ally' as const, order: 'selfOrigin' as const },
        buffTargetShape: 'aoe' as const,
        buffRange: 100,
        buffAoeRadiusPx: 25,
        buffStat: 'def',
        buffMultiplier: 1.25,
        buffDurationSec: 5,
        periodicTrigger: 'waveStart' as const,
      },
    };
    const lancer = mockAlly({
      id: 'lancer',
      role: 'attacker',
      battleX: 100,
      build: {
        learnedPassiveIds: ['at_lancer_passive_2', 'at_lancer_passive_2_periodic'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const ally = mockAlly({
      id: 'ally',
      battleX: 118,
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const farAlly = mockAlly({
      id: 'far',
      battleX: 180,
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });

    syncBuffAuras([lancer, ally, farAlly], [], passives, mockTargetingGameData());
    expect(
      lancer.statusEffects.some((e) => e.stat === 'def' && e.multiplier === 1.1),
    ).toBe(true);
    expect(
      lancer.statusEffects.some((e) => e.stat === 'def' && e.multiplier === 1.25),
    ).toBe(false);
    expect(
      ally.statusEffects.some((e) => e.stat === 'def' && e.multiplier === 1.1),
    ).toBe(true);
    expect(
      ally.statusEffects.some((e) => e.stat === 'def' && e.multiplier === 1.25),
    ).toBe(false);

    firePeriodicPassivesForTrigger(
      'waveStart',
      [lancer, ally, farAlly],
      [lancer, ally, farAlly],
      [],
      passives,
      mockTargetingGameData(),
    );
    expect(
      lancer.statusEffects.some((e) => e.stat === 'def' && e.multiplier === 1.25),
    ).toBe(true);
    expect(
      ally.statusEffects.some((e) => e.stat === 'def' && e.multiplier === 1.25),
    ).toBe(true);
    expect(
      farAlly.statusEffects.some((e) => e.stat === 'def' && e.multiplier === 1.25),
    ).toBe(false);
  });

  it('resolveSelfHpRatioBuffScale scales from full HP to max ratio', () => {
    const unit = mockAlly({ id: 'unit', hp: 100, maxHp: 100 });
    expect(resolveSelfHpRatioBuffScale(unit, 0)).toBe(0);
    unit.hp = 50;
    expect(resolveSelfHpRatioBuffScale(unit, 0)).toBeCloseTo(0.5, 5);
    unit.hp = 0;
    expect(resolveSelfHpRatioBuffScale(unit, 0)).toBe(1);
  });

  it('resolveSelfHpRatioBuffScale ignores barrierHp', () => {
    const unit = mockAlly({ id: 'unit', hp: 100, maxHp: 100, barrierHp: 80 });
    expect(resolveSelfHpRatioBuffScale(unit, 0)).toBe(0);
    unit.hp = 50;
    unit.barrierHp = 100;
    expect(resolveSelfHpRatioBuffScale(unit, 0)).toBeCloseTo(0.5, 5);
  });

  it('syncSelfHpRatioBuffAuras applies atk buff at low HP', () => {
    const warrior = mockAlly({
      id: 'warrior',
      hp: 50,
      maxHp: 100,
      atk: 20,
      build: {
        learnedPassiveIds: ['lowHpBuff'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const lowHpPassives: Record<string, PassiveSkillDef> = {
      lowHpBuff: {
        id: 'lowHpBuff',
        name: 'LowHpBuff',
        effect: 'selfHpRatioBuff',
        buffStat: 'atk',
        buffMultiplierMax: 2,
        maxBuffAtHpRatio: 0,
      },
    };
    syncSelfHpRatioBuffAuras([warrior], [], lowHpPassives);
    const atkEffect = warrior.statusEffects.find((e) => e.stat === 'atk');
    expect(atkEffect?.multiplier).toBeCloseTo(1.5, 5);
    const badges = aggregateStatStatusEffects(warrior.statusEffects, {
      baseMaxHp: warrior.maxHp,
      atk: warrior.atk,
      def: warrior.def,
      reg: warrior.reg,
    });
    expect(badges.find((b) => b.category === 'atk')).toBeUndefined();
  });
});
