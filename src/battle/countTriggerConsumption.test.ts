import { describe, expect, it } from 'vitest';
import type {
  ActiveSkillDef,
  CombatantState,
  GameData,
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

type EngineInternals = BattleEngine & {
  players: CombatantState[];
  enemies: CombatantState[];
  runUnitSkills: (actors: CombatantState[]) => void;
  tickCountTriggers: (unitId: string, kind: SkillTriggerKind) => void;
  skillSequenceRunner: SkillSequenceRunner;
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
      basicAttackVfx: { preset: 'slash' },
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
  ) as EngineInternals;
  engine.startBattle();
  return { engine, gameData };
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
      interval: 0,
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
    const executor = new SkillExecutor(
      gameData,
      (event) => {
        if (event.type === 'skill') fired.push(event.skillId);
      },
      {
        getBattleTimeSec: () => 0,
        enqueuePendingHits: () => {},
        getAllCombatants: () => [actor, enemy],
        getSequenceRunner: () => runner,
      },
    );
    (engine as unknown as { executor: SkillExecutor }).executor = executor;

    for (let i = 0; i < 3; i++) {
      executor.tryExecute(actor, basicCd, [actor], [enemy]);
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

    const fired = trackSkillFires(engine);

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

    const fired = trackSkillFires(engine);

    engine.skillSequenceRunner.beginUse('actor', 1);
    engine.tickCountTriggers(actor.id, 'hitsTaken');
    expect(fired).toEqual([]);

    engine.skillSequenceRunner.tickUseLocks(1);
    engine.tickCountTriggers(actor.id, 'hitsTaken');
    expect(fired).toEqual(['guard_busy']);
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

    const fired = trackSkillFires(engine);

    engine.runUnitSkills([actor]);

    expect(fired).toEqual(['time_burst']);
    expect(activeCd.remaining).toBe(5);
  });
});
