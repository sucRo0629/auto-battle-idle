import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, CombatantState, GameData, SkillCooldown } from './types.ts';
import { BattleEngine } from './BattleEngine.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';
import { engagedMinBodyGap } from './battleConstants.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { shouldFireActiveSkill } from './skills/fireGate.ts';
import {
  asBattleEngineInternals,
  createStage1Engine,
  TICK_DT,
  waitForEngaged,
} from './test/battleFieldSpec.harness.ts';

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
    res: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test',
    formationRow: 'front',
    traits: {
      rangePx: 10,
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
    corpseVisible: true,
    ...overrides,
  };
}

const nagiharaSkill: ActiveSkillDef = {
  id: 'nagihara',
  name: '薙ぎ払い',
  trigger: { kind: 'time', value: 8 },
  firePolicy: 'smart',
  fireConditions: [{ kind: 'enemyCount', min: 2, scope: 'inRange' }],
  effect: [
    {
      type: 'damage',
      targetShape: 'pierce',
      damageType: 'physical',
      amount: { kind: 'atkBased', atkScale: 0.7 },
      target: { kind: 'distance', side: 'enemy', order: 'selfOrigin' },
    },
  ],
};

function createEngine(actives: Record<string, ActiveSkillDef>) {
  const gameData = structuredClone(loadGameData()) as GameData;
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
  return asBattleEngineInternals(engine);
}

describe('runUnitSkills fire gate', () => {
  it('does not fire smart active when inRange enemy count is below min', () => {
    const engine = createEngine({ nagihara: nagiharaSkill });
    const gap = engagedMinBodyGap();
    const contact = 200;
    const range = 10;
    const actor = mockUnit({
      id: 'hero',
      battleX: contact - gap - range,
      traits: {
        rangePx: range,
        damageType: 'physical',
        basicAttackVfx: { enabled: true },
      },
    });
    const inRangeEnemy = mockUnit({
      id: 'near',
      isEnemy: true,
      battleX: contact,
      classId: 'test_enemy',
    });
    const farEnemy = mockUnit({
      id: 'far',
      isEnemy: true,
      battleX: contact + gap + range + 1,
      classId: 'test_enemy',
    });
    const activeCd: SkillCooldown = {
      skillId: 'nagihara',
      remaining: 0,
      slotKind: 'active',
      slotIndex: 0,
    };
    actor.cooldowns = [activeCd];
    engine.players = [actor];
    engine.enemies = [inRangeEnemy, farEnemy];

    const fired: string[] = [];
    engine.onEvent((event) => {
      if (event.type === 'skill') fired.push(event.skillId);
    });

    engine.runUnitSkills!([actor]);

    expect(fired).toEqual([]);
    expect(activeCd.remaining).toBe(0);
  });

  it('fires smart active when inRange enemy count meets min', () => {
    const engine = createEngine({ nagihara: nagiharaSkill });
    const contact = 200;
    const range = 30;
    const actor = mockUnit({
      id: 'hero',
      battleX: contact - range,
      traits: {
        rangePx: range,
        damageType: 'physical',
        basicAttackVfx: { enabled: true },
      },
    });
    const enemyA = mockUnit({
      id: 'nearA',
      isEnemy: true,
      battleX: contact - 15,
      classId: 'test_enemy',
    });
    const enemyB = mockUnit({
      id: 'nearB',
      isEnemy: true,
      battleX: contact,
      classId: 'test_enemy',
    });
    const activeCd: SkillCooldown = {
      skillId: 'nagihara',
      remaining: 0,
      slotKind: 'active',
      slotIndex: 0,
    };
    actor.cooldowns = [activeCd];
    engine.players = [actor];
    engine.enemies = [enemyA, enemyB];

    const fired: string[] = [];
    engine.onEvent((event) => {
      if (event.type === 'skill') fired.push(event.skillId);
    });

    engine.runUnitSkills!([actor]);

    expect(fired.some((id) => id === 'nagihara')).toBe(true);
    expect(activeCd.remaining).toBe(8);
  });

  it('stage 1-1 engaged: at_swordsman nagihara gate sees two in-range enemies', () => {
    const engine = createStage1Engine();
    waitForEngaged(engine);
    for (let i = 0; i < 120; i++) engine.tick(TICK_DT);

    const internals = asBattleEngineInternals(engine);
    const warrior = internals.players.find((p) => p.classId === 'at_swordsman');
    const skill = internals.gameData.skillRegistry.actives.at_swordsman_active_2;
    expect(warrior).toBeDefined();
    expect(skill).toBeDefined();
    skill!.firePolicy = nagiharaSkill.firePolicy;
    skill!.fireConditions = nagiharaSkill.fireConditions;
    expect(skill?.fireConditions).toEqual([
      { kind: 'enemyCount', min: 2, scope: 'inRange' },
    ]);

    const contactX = warrior!.battleX;
    for (const enemy of internals.enemies.filter((unit) => unit.isAlive)) {
      enemy.battleX = contactX;
    }

    const ctx = {
      actor: warrior!,
      allies: internals.players,
      enemies: internals.enemies,
      skill: skill!,
      passives: [],
      gameData: internals.gameData,
      battleTimeSec: 0,
      isWaveStartPhase: false,
      isWaveEndPhase: false,
    };
    expect(shouldFireActiveSkill(ctx)).toBe(true);
  });
});

const tatakiTsukeSkill: ActiveSkillDef = {
  id: 'tataki',
  name: '叩き付け',
  trigger: { kind: 'basicAttackCount', value: 2 },
  firePolicy: 'smart',
  fireConditions: [{ kind: 'targetHp', maxHpRatio: 0.5, compare: 'gte' }],
  effect: [
    {
      type: 'damage',
      damageType: 'physical',
      amount: { kind: 'atkBased', atkScale: 1.6 },
      target: { kind: 'distance', side: 'enemy', order: 'nearest' },
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
      damageType: 'physical',
      amount: { kind: 'atkBased', atkScale: 1 },
      target: { kind: 'distance', side: 'enemy', order: 'nearest' },
    },
  ],
};

function createExecutor(
  gameData: GameData,
  units: CombatantState[],
  onSkillFire?: (skillId: string) => void,
  runner = new SkillSequenceRunner(),
): SkillExecutor {
  return new SkillExecutor(
    gameData,
    (event) => {
      if (event.type === 'skill') onSkillFire?.(event.skillId);
    },
    {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: () => {},
      getAllCombatants: () => units,
      getSequenceRunner: () => runner,
    },
  );
}

describe('basicAttackCount fire gate', () => {
  it('does not fire when target HP is below gte threshold', () => {
    const engine = createEngine({ tataki: tatakiTsukeSkill, test_basic: basicSkill });
    const actor = mockUnit({ id: 'hero', battleX: 200 });
    const enemy = mockUnit({
      id: 'enemy',
      isEnemy: true,
      battleX: 200,
      hp: 30,
      maxHp: 100,
    });
    const basicCd: SkillCooldown = {
      skillId: 'test_basic',
      remaining: 0,
      slotKind: 'basic',
    };
    const activeCd: SkillCooldown = {
      skillId: 'tataki',
      remaining: 0,
      slotKind: 'active',
      slotIndex: 0,
    };
    actor.cooldowns = [basicCd, activeCd];
    engine.players = [actor];
    engine.enemies = [enemy];

    const fired: string[] = [];
    const runner = new SkillSequenceRunner();
    const executor = createExecutor(
      engine.gameData,
      [actor, enemy],
      (skillId) => fired.push(skillId),
      runner,
    );
    (engine as unknown as { executor: SkillExecutor }).executor = executor;

    engine.runUnitSkills!([actor]);

    expect(fired).toEqual(['test_basic']);
    expect(activeCd.remaining).toBe(0);
  });

  it('fires when target HP meets gte threshold', () => {
    const engine = createEngine({ tataki: tatakiTsukeSkill, test_basic: basicSkill });
    const actor = mockUnit({ id: 'hero', battleX: 200 });
    const enemy = mockUnit({
      id: 'enemy',
      isEnemy: true,
      battleX: 200,
      hp: 80,
      maxHp: 100,
    });
    const basicCd: SkillCooldown = {
      skillId: 'test_basic',
      remaining: 0,
      slotKind: 'basic',
    };
    const activeCd: SkillCooldown = {
      skillId: 'tataki',
      remaining: 0,
      slotKind: 'active',
      slotIndex: 0,
    };
    actor.cooldowns = [basicCd, activeCd];
    engine.players = [actor];
    engine.enemies = [enemy];

    const fired: string[] = [];
    const runner = new SkillSequenceRunner();
    const executor = createExecutor(
      engine.gameData,
      [actor, enemy],
      (skillId) => fired.push(skillId),
      runner,
    );
    (engine as unknown as { executor: SkillExecutor }).executor = executor;

    engine.runUnitSkills!([actor]);

    expect(fired.some((id) => id === 'tataki')).toBe(true);
    expect(activeCd.remaining).toBe(2);
  });
});
