import { describe, expect, it } from 'vitest';
import type {
  ActiveSkillDef,
  CombatantState,
  GameData,
  PendingSkillHit,
  SkillCooldown,
  SkillTriggerKind,
} from './types.ts';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';
import { applyStunToTarget } from './ccEffects.ts';
import {
  asBattleEngineInternals,
  type BattleEngineInternals,
} from './test/battleFieldSpec.harness.ts';

type EngineInternals = BattleEngineInternals & {
  runUnitSkills: (actors: CombatantState[]) => void;
  tickCountTriggers: (unitId: string, kind: SkillTriggerKind) => void;
};

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test',
    formationRow: 'front',
    traits: {
      rangePx: 0,
      damageType: 'physical',
      basicAttackVfx: { enabled: true },
    },
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
    battleX: 200,
    visualX: 200,
    corpseVisible: true,
    ...overrides,
  };
}

function createTestEngine(actives: Record<string, ActiveSkillDef>): {
  engine: EngineInternals;
  gameData: GameData;
} {
  const gameData = structuredClone(loadGameData());
  gameData.skillRegistry.actives = {
    ...gameData.skillRegistry.actives,
    ...actives,
  };
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
  engine.startBattle();
  return { engine: asBattleEngineInternals(engine) as EngineInternals, gameData };
}

function trackSkillFires(engine: BattleEngine): string[] {
  const fired: string[] = [];
  engine.onEvent((event) => {
    if (event.type === 'skill') {
      fired.push(event.skillId);
    }
  });
  return fired;
}

function createExecutor(
  gameData: GameData,
  units: CombatantState[],
  options?: {
    enqueuePendingHits?: (hits: PendingSkillHit[]) => void;
    getBattleTimeSec?: () => number;
    onSkillFire?: (skillId: string) => void;
  },
  runner = new SkillSequenceRunner(),
): SkillExecutor {
  const executor = new SkillExecutor(
    gameData,
    (event) => {
      if (event.type === 'skill') options?.onSkillFire?.(event.skillId);
    },
    {
      getBattleTimeSec: options?.getBattleTimeSec ?? (() => 0),
      enqueuePendingHits: options?.enqueuePendingHits ?? (() => {}),
      getAllCombatants: () => units,
      getSequenceRunner: () => runner,
    },
  );
  return executor;
}

describe('count trigger consumption', () => {
  it('basicAttackCount reaches max on Nth basic without firing, consumes on N+1 attack slot', () => {
    const countActive: ActiveSkillDef = {
      id: 'count_burst',
      name: 'count_burst',
      trigger: { kind: 'basicAttackCount', value: 3 },
      effect: [
        {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 2 },
        },
      ],
    };
    const basicSkill: ActiveSkillDef = {
      id: 'test_basic',
      name: 'test_basic',
      trigger: { kind: 'time', value: 0 },
      effect: [
        {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1 },
        },
      ],
    };

    const { engine, gameData } = createTestEngine({
      count_burst: countActive,
      test_basic: basicSkill,
    });
    const actor = mockUnit({ id: 'actor', battleX: 200 });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 200, hp: 500 });
    const basicCd: SkillCooldown = {
      skillId: 'test_basic',
      remaining: 0,
      slotKind: 'basic',
    };
    const activeCd: SkillCooldown = {
      skillId: 'count_burst',
      remaining: 3,
      slotKind: 'active',
      slotIndex: 0,
    };
    actor.cooldowns = [basicCd, activeCd];
    engine.players = [actor];
    engine.enemies = [enemy];

    const fired: string[] = [];
    const runner = new SkillSequenceRunner();
    const executor = createExecutor(gameData, [actor, enemy], {
      onSkillFire: (skillId) => fired.push(skillId),
    }, runner);
    (engine as unknown as { executor: SkillExecutor }).executor = executor;

    for (let i = 0; i < 3; i++) {
      executor.tryExecute(actor, basicCd, [actor], [enemy]);
      runner.tickUseLocks(1);
    }

    expect(activeCd.remaining).toBe(0);
    expect(fired).toEqual(['test_basic', 'test_basic', 'test_basic']);

    engine.runUnitSkills([actor]);

    expect(fired).toEqual([
      'test_basic',
      'test_basic',
      'test_basic',
      'count_burst',
    ]);
    expect(activeCd.remaining).toBe(3);
    expect(fired.filter((id) => id === 'test_basic').length).toBe(3);
  });

  it('basicAttackCount charges twice per multiLock basic attack slot', () => {
    const countActive: ActiveSkillDef = {
      id: 'count_burst',
      name: 'count_burst',
      trigger: { kind: 'basicAttackCount', value: 4 },
      effect: [
        {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 2 },
        },
      ],
    };
    const multiBasic: ActiveSkillDef = {
      id: 'multi_basic',
      name: 'multi_basic',
      trigger: { kind: 'time', value: 0 },
      effect: [
        {
          type: 'damage',
          targetShape: 'multiLock',
          hitCount: 2,
          range: 50,
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1 },
        },
      ],
    };

    const { gameData } = createTestEngine({
      count_burst: countActive,
      multi_basic: multiBasic,
    });
    const actor = mockUnit({ id: 'actor', battleX: 200, traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { enabled: true } } });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 200, hp: 500 });
    const basicCd: SkillCooldown = {
      skillId: 'multi_basic',
      remaining: 0,
      slotKind: 'basic',
    };
    const activeCd: SkillCooldown = {
      skillId: 'count_burst',
      remaining: 4,
      slotKind: 'active',
      slotIndex: 0,
    };
    actor.cooldowns = [basicCd, activeCd];

    const executor = createExecutor(gameData, [actor, enemy]);
    executor.tryExecute(actor, basicCd, [actor], [enemy]);

    expect(activeCd.remaining).toBe(2);
  });

  it('basicAttackCount charges all basicAttackCount actives per hit', () => {
    const firstActive: ActiveSkillDef = {
      id: 'count_a',
      name: 'count_a',
      trigger: { kind: 'basicAttackCount', value: 8 },
      effect: [
        {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 2 },
        },
      ],
    };
    const secondActive: ActiveSkillDef = {
      id: 'count_b',
      name: 'count_b',
      trigger: { kind: 'basicAttackCount', value: 12 },
      effect: [
        {
          type: 'buff',
          target: { kind: 'self' },
          buffStat: 'atk',
          buffMultiplier: 1.2,
          buffDurationSec: 2,
        },
      ],
    };
    const basicSkill: ActiveSkillDef = {
      id: 'test_basic',
      name: 'test_basic',
      trigger: { kind: 'time', value: 0 },
      effect: [
        {
          type: 'damage',
          targetShape: 'single',
          hitCount: 2,
          hitDurationSec: 0.2,
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1 },
        },
      ],
    };

    const { gameData } = createTestEngine({
      count_a: firstActive,
      count_b: secondActive,
      test_basic: basicSkill,
    });
    const actor = mockUnit({ id: 'actor', battleX: 200 });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 200, hp: 500 });
    const basicCd: SkillCooldown = {
      skillId: 'test_basic',
      remaining: 0,
      slotKind: 'basic',
    };
    const activeCdA: SkillCooldown = {
      skillId: 'count_a',
      remaining: 8,
      slotKind: 'active',
      slotIndex: 0,
    };
    const activeCdB: SkillCooldown = {
      skillId: 'count_b',
      remaining: 12,
      slotKind: 'active',
      slotIndex: 1,
    };
    actor.cooldowns = [basicCd, activeCdA, activeCdB];

    const pending: PendingSkillHit[] = [];
    const executor = createExecutor(gameData, [actor, enemy], {
      enqueuePendingHits: (hits) => pending.push(...hits),
    });

    executor.tryExecute(actor, basicCd, [actor], [enemy]);
    executor.applyPendingHit(pending[0]!);
    expect(activeCdA.remaining).toBe(7);
    expect(activeCdB.remaining).toBe(11);

    executor.applyPendingHit(pending[1]!);
    expect(activeCdA.remaining).toBe(6);
    expect(activeCdB.remaining).toBe(10);
  });

  it('basicAttackCount charges once per spread pending hit', () => {
    const countActive: ActiveSkillDef = {
      id: 'count_burst',
      name: 'count_burst',
      trigger: { kind: 'basicAttackCount', value: 4 },
      effect: [
        {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 2 },
        },
      ],
    };
    const spreadBasic: ActiveSkillDef = {
      id: 'spread_basic',
      name: 'spread_basic',
      trigger: { kind: 'time', value: 0 },
      effect: [
        {
          type: 'damage',
          targetShape: 'single',
          hitCount: 2,
          hitDurationSec: 0.2,
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 0.5 },
        },
      ],
    };

    const { gameData } = createTestEngine({
      count_burst: countActive,
      spread_basic: spreadBasic,
    });
    const actor = mockUnit({ id: 'actor', battleX: 200 });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 200, hp: 500 });
    const basicCd: SkillCooldown = {
      skillId: 'spread_basic',
      remaining: 0,
      slotKind: 'basic',
    };
    const activeCd: SkillCooldown = {
      skillId: 'count_burst',
      remaining: 4,
      slotKind: 'active',
      slotIndex: 0,
    };
    actor.cooldowns = [basicCd, activeCd];

    const pending: PendingSkillHit[] = [];
    const executor = createExecutor(gameData, [actor, enemy], {
      enqueuePendingHits: (hits) => pending.push(...hits),
    });

    executor.tryExecute(actor, basicCd, [actor], [enemy]);
    expect(activeCd.remaining).toBe(4);
    expect(pending).toHaveLength(2);

    executor.applyPendingHit(pending[0]!);
    expect(activeCd.remaining).toBe(3);

    executor.applyPendingHit(pending[1]!);
    expect(activeCd.remaining).toBe(2);
  });

  it('basicAttackCount does not consume active mid multi-hit when reaching ready', () => {
    const countActive: ActiveSkillDef = {
      id: 'count_burst',
      name: 'count_burst',
      trigger: { kind: 'basicAttackCount', value: 1 },
      effect: [
        {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 2 },
        },
      ],
    };
    const spreadBasic: ActiveSkillDef = {
      id: 'spread_basic',
      name: 'spread_basic',
      trigger: { kind: 'time', value: 0 },
      effect: [
        {
          type: 'damage',
          targetShape: 'single',
          hitCount: 2,
          hitDurationSec: 0.2,
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 0.5 },
        },
      ],
    };

    const { engine, gameData } = createTestEngine({
      count_burst: countActive,
      spread_basic: spreadBasic,
    });
    const actor = mockUnit({ id: 'actor', battleX: 200 });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 200, hp: 500 });
    const basicCd: SkillCooldown = {
      skillId: 'spread_basic',
      remaining: 0,
      slotKind: 'basic',
    };
    const activeCd: SkillCooldown = {
      skillId: 'count_burst',
      remaining: 1,
      slotKind: 'active',
      slotIndex: 0,
    };
    actor.cooldowns = [basicCd, activeCd];
    engine.players = [actor];
    engine.enemies = [enemy];

    const pending: PendingSkillHit[] = [];
    const fired: string[] = [];
    const executor = createExecutor(gameData, [actor, enemy], {
      enqueuePendingHits: (hits) => pending.push(...hits),
      onSkillFire: (skillId) => fired.push(skillId),
    });
    (engine as unknown as { executor: SkillExecutor }).executor = executor;

    executor.tryExecute(actor, basicCd, [actor], [enemy]);
    executor.applyPendingHit(pending[0]!);
    executor.applyPendingHit(pending[1]!);

    expect(activeCd.remaining).toBe(0);
    expect(fired).not.toContain('count_burst');

    basicCd.remaining = 0;
    engine.runUnitSkills([actor]);

    expect(fired).toContain('count_burst');
    expect(activeCd.remaining).toBe(1);
  });

  it('hitsTaken reaches max on Nth hurt without firing, consumes on N+1 hurt', () => {
    const guardActive: ActiveSkillDef = {
      id: 'guard_burst',
      name: 'guard_burst',
      trigger: { kind: 'hitsTaken', value: 3 },
      effect: [
        {
          type: 'buff',
          target: { kind: 'self' },
          buffStat: 'def',
          buffMultiplier: 1.5,
          buffDurationSec: 2,
        },
      ],
    };

    const { engine } = createTestEngine({ guard_burst: guardActive });
    const actor = mockUnit({ id: 'actor', battleX: 200 });
    const activeCd: SkillCooldown = {
      skillId: 'guard_burst',
      remaining: 3,
      slotKind: 'active',
      slotIndex: 0,
    };
    actor.cooldowns = [activeCd];
    engine.players = [actor];
    engine.enemies = [];

    const fired = trackSkillFires(engine as unknown as BattleEngine);

    for (let i = 0; i < 3; i++) {
      engine.tickCountTriggers(actor.id, 'hitsTaken');
    }

    expect(activeCd.remaining).toBe(0);
    expect(fired).toEqual([]);

    engine.tickCountTriggers(actor.id, 'hitsTaken');

    expect(fired).toEqual(['guard_burst']);
    expect(activeCd.remaining).toBe(3);
  });

  it('defers hitsTaken consumption while actor is busy', () => {
    const guardActive: ActiveSkillDef = {
      id: 'guard_busy',
      name: 'guard_busy',
      trigger: { kind: 'hitsTaken', value: 1 },
      useDurationSec: 1,
      effect: [
        {
          type: 'buff',
          target: { kind: 'self' },
          buffStat: 'def',
          buffMultiplier: 1.5,
          buffDurationSec: 2,
        },
      ],
    };

    const { engine } = createTestEngine({ guard_busy: guardActive });
    const actor = mockUnit({ id: 'actor', battleX: 200 });
    const activeCd: SkillCooldown = {
      skillId: 'guard_busy',
      remaining: 0,
      slotKind: 'active',
      slotIndex: 0,
    };
    actor.cooldowns = [activeCd];
    engine.players = [actor];
    engine.enemies = [];

    const fired = trackSkillFires(engine as unknown as BattleEngine);

    engine.skillSequenceRunner.beginUse('actor', 1);
    engine.tickCountTriggers(actor.id, 'hitsTaken');
    expect(fired).toEqual([]);

    engine.skillSequenceRunner.tickUseLocks(1);
    engine.tickCountTriggers(actor.id, 'hitsTaken');
    expect(fired).toEqual(['guard_busy']);
  });

  it('charges hitsTaken while stunned but defers consumption until stun ends', () => {
    const guardActive: ActiveSkillDef = {
      id: 'guard_stunned',
      name: 'guard_stunned',
      trigger: { kind: 'hitsTaken', value: 1 },
      effect: [
        {
          type: 'buff',
          target: { kind: 'self' },
          buffStat: 'def',
          buffMultiplier: 1.5,
          buffDurationSec: 2,
        },
      ],
    };

    const { engine } = createTestEngine({ guard_stunned: guardActive });
    const actor = mockUnit({ id: 'actor', battleX: 200 });
    const activeCd: SkillCooldown = {
      skillId: 'guard_stunned',
      remaining: 1,
      slotKind: 'active',
      slotIndex: 0,
    };
    actor.cooldowns = [activeCd];
    engine.players = [actor];
    engine.enemies = [];

    const fired = trackSkillFires(engine as unknown as BattleEngine);
    applyStunToTarget(actor, 1, { skillId: 'stun_test', sourceId: 'enemy' });

    engine.tickCountTriggers(actor.id, 'hitsTaken');
    expect(activeCd.remaining).toBe(0);
    expect(fired).toEqual([]);

    engine.tickCountTriggers(actor.id, 'hitsTaken');
    expect(fired).toEqual([]);

    actor.statusEffects = [];
    engine.tickCountTriggers(actor.id, 'hitsTaken');
    expect(fired).toEqual(['guard_stunned']);
  });

  it('time trigger still fires from active slot when remaining is zero', () => {
    const timeActive: ActiveSkillDef = {
      id: 'time_burst',
      name: 'time_burst',
      trigger: { kind: 'time', value: 5 },
      effect: [
        {
          type: 'buff',
          target: { kind: 'self' },
          buffStat: 'atk',
          buffMultiplier: 1.2,
          buffDurationSec: 2,
        },
      ],
    };

    const { engine } = createTestEngine({ time_burst: timeActive });
    const actor = mockUnit({ id: 'actor', battleX: 200 });
    const activeCd: SkillCooldown = {
      skillId: 'time_burst',
      remaining: 0,
      slotKind: 'active',
      slotIndex: 0,
    };
    actor.cooldowns = [activeCd];
    engine.players = [actor];
    engine.enemies = [];

    const fired = trackSkillFires(engine as unknown as BattleEngine);

    engine.runUnitSkills([actor]);

    expect(fired).toEqual(['time_burst']);
    expect(activeCd.remaining).toBe(5);
  });
});
