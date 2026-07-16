import { describe, expect, it, beforeEach, vi } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import {
  createAllyFromMember,
  createEnemyFromClassGroup,
  resetEntityIdCounter,
} from './entities.ts';
import { expandEnemyGroups } from './enemyGroupSpawn.ts';
import { loadLevelCurves, getBasicCooldownRate } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { getEffectiveAttackSpeedMultiplier } from './combatMath.ts';
import { resolveSelectedCombatModuleId } from './data/resolveCombatModuleBasic.ts';
import { initializeSkillCooldowns, resetCooldownAfterFire } from './skillTrigger.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';
import type {
  BattleEventListener,
  CombatantState,
  GameData,
  StageDef,
  StatusEffect,
} from './types.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from './types.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);

function createMinimalEngine(gameData: GameData = loadGameData()) {
  const save = createDefaultSave(gameData, 'demo');
  return new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
}

function tickCooldowns(
  engine: BattleEngine,
  units: CombatantState[],
  deltaTime: number,
): void {
  (
    engine as unknown as {
      tickCooldowns: (units: CombatantState[], deltaTime: number) => void;
    }
  ).tickCooldowns(units, deltaTime);
}

function runUnitSkills(engine: BattleEngine, actors: CombatantState[]): void {
  (
    engine as unknown as {
      runUnitSkills: (actors: CombatantState[]) => void;
    }
  ).runUnitSkills(actors);
}

function mockMember(classId: string) {
  return {
    classId,
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    progress: { level: 10, exp: 0 },
  };
}

function placeEnemyInBasicRange(
  actor: CombatantState,
  enemy: CombatantState,
): void {
  enemy.battleX = actor.battleX + Math.max(1, actor.traits.rangePx - 1);
}

function createSkillExecutor(
  gameData: GameData,
  allies: CombatantState[],
  enemies: CombatantState[],
) {
  const events: Parameters<BattleEventListener>[0][] = [];
  const runner = new SkillSequenceRunner();
  const executor = new SkillExecutor(gameData, (event) => events.push(event), {
    getSequenceRunner: () => runner,
    getBattleTimeSec: () => 0,
    getAllCombatants: () => [...allies, ...enemies],
  });
  return { executor, events, runner };
}

function stageWithEnemyGroup(classId: string, level = 10): StageDef {
  return {
    id: 'module_enemy_test',
    displayName: 'module enemy test',
    recommendedLevel: level,
    enemyGroups: [{ classId, count: 1 }],
    waves: [{ enemies: [] }],
  };
}

describe('combat module basic attack (R5c)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('registers synthesized module skills in skillRegistry.actives', () => {
    const gameData = loadGameData();
    const module = gameData.combatModuleRegistry.df_guardian_mod_nearest_strike;
    const skill = gameData.skillRegistry.actives[module.id];
    expect(skill).toBeDefined();
    expect(skill?.trigger).toEqual({
      kind: 'time',
      value: module.attackIntervalSec,
    });
    expect(skill?.effect).toEqual(module.action.effect);
  });

  it('ally uses combatModuleIds[0] synthetic skill as basic slot', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_guardian!;
    const expectedModuleId = resolveSelectedCombatModuleId(
      preset,
      gameData.combatModuleRegistry,
    );
    expect(expectedModuleId).toBe('df_guardian_mod_nearest_strike');

    const ally = createAllyFromMember(
      mockMember('df_guardian'),
      preset,
      levelCurves,
      gameData,
    );
    const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic');
    expect(basicCd?.skillId).toBe(expectedModuleId);
    expect(basicCd?.skillId).not.toBe(preset.basicAttackSkillId);
    expect(
      ally.cooldowns.some(
        (cd) =>
          cd.skillId === preset.basicAttackSkillId && cd.slotKind !== 'basic',
      ),
    ).toBe(false);
  });

  it('enemy uses the same module selection rule', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.at_sorcerer!;
    const stage = stageWithEnemyGroup('at_sorcerer');
    const spec = expandEnemyGroups(stage)[0]!;
    const enemy = createEnemyFromClassGroup(
      spec,
      preset,
      gameData,
      levelCurves,
    );
    const expectedModuleId = resolveSelectedCombatModuleId(
      preset,
      gameData.combatModuleRegistry,
    );
    expect(expectedModuleId).toBe('at_sorcerer_mod_focus');

    const basicCd = enemy.cooldowns.find((cd) => cd.slotKind === 'basic');
    expect(basicCd?.skillId).toBe(expectedModuleId);
    expect(basicCd?.skillId).not.toBe(preset.basicAttackSkillId);
  });

  it('legacy class keeps synthesized legacy basic skill id', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_duelist!;
    expect(preset.combatModuleIds).toBeUndefined();

    const ally = createAllyFromMember(
      mockMember('df_duelist'),
      preset,
      levelCurves,
      gameData,
    );
    const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic');
    expect(basicCd?.skillId).toBe(preset.basicAttackSkillId);
  });

  it('paladin uses CombatModule basic after R12g-d2', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_paladin!;
    expect(preset.combatModuleIds?.[0]).toBe('df_paladin_mod_frontline_ward');

    const ally = createAllyFromMember(
      mockMember('df_paladin'),
      preset,
      levelCurves,
      gameData,
    );
    const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic');
    expect(basicCd?.skillId).toBe('df_paladin_mod_frontline_ward');
  });

  it('initializes first action cooldown from attackIntervalSec, not legacy trigger=2', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_guardian!;
    const moduleId = resolveSelectedCombatModuleId(
      preset,
      gameData.combatModuleRegistry,
    )!;
    const module = gameData.combatModuleRegistry[moduleId];
    const legacyBasic = gameData.skillRegistry.actives[preset.basicAttackSkillId];

    const ally = createAllyFromMember(
      mockMember('df_guardian'),
      preset,
      levelCurves,
      gameData,
    );
    initializeSkillCooldowns(ally, gameData.skillRegistry.actives);

    const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    expect(basicCd.remaining).toBe(module.attackIntervalSec);
    expect(basicCd.remaining).not.toBe(legacyBasic?.trigger?.value ?? 2);
  });

  it('does not fire before attackIntervalSec elapses and resets to the same interval after fire', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.at_swordsman!;
    const moduleId = resolveSelectedCombatModuleId(
      preset,
      gameData.combatModuleRegistry,
    )!;
    const interval =
      gameData.combatModuleRegistry[moduleId].attackIntervalSec;

    const ally = createAllyFromMember(
      mockMember('at_swordsman'),
      preset,
      levelCurves,
      gameData,
    );
    initializeSkillCooldowns(ally, gameData.skillRegistry.actives);
    ally.battleX = 100;

    const enemy: CombatantState = {
      id: 'enemy',
      name: 'enemy',
      hp: 200,
      maxHp: 200,
      atk: 10,
      def: 5,
      res: 0,
      isAlive: true,
      role: 'attacker',
      classId: 'df_paladin',
      formationRow: 'front',
      traits: { rangePx: 30, damageType: 'physical' },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
      statusEffects: [],
      barrierHp: 0,
      spriteKey: 'placeholder',
      iconKey: 'placeholder',
      isEnemy: true,
      battleX: 200,
      corpseVisible: true,
    };
    placeEnemyInBasicRange(ally, enemy);

    const { executor } = createSkillExecutor(gameData, [ally], [enemy]);

    const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    expect(executor.tryExecute(ally, basicCd, [ally], [enemy])).toBe(false);

    const engine = createMinimalEngine(gameData);
    tickCooldowns(engine, [ally], interval - 0.01);
    expect(basicCd.remaining).toBeGreaterThan(0);
    expect(executor.tryExecute(ally, basicCd, [ally], [enemy])).toBe(false);

    tickCooldowns(engine, [ally], 0.02);
    expect(basicCd.remaining).toBe(0);
    expect(executor.tryExecute(ally, basicCd, [ally], [enemy])).toBe(true);
    expect(basicCd.remaining).toBe(interval);

    tickCooldowns(engine, [ally], interval);
    expect(basicCd.remaining).toBe(0);
  });

  it('bypasses attackSpeedTier for module basic cooldown tick', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_guardian!;
    const stage = stageWithEnemyGroup('df_guardian');
    const spec = expandEnemyGroups(stage)[0]!;
    const enemy = createEnemyFromClassGroup(
      spec,
      preset,
      gameData,
      levelCurves,
    );
    const basicCd = enemy.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basicCd.remaining = 3;

    const legacyRate = getBasicCooldownRate(
      preset.attackSpeedTier ?? 'normal',
      levelCurves,
    );
    expect(legacyRate).not.toBe(1);

    tickCooldowns(createMinimalEngine(gameData), [enemy], 1);
    expect(basicCd.remaining).toBeCloseTo(2);
  });

  function withAttackSpeedEffect(
    unit: CombatantState,
    effect: Pick<StatusEffect, 'multiplier' | 'kind'>,
  ): void {
    unit.statusEffects.push({
      id: 'test_attack_speed',
      kind: effect.kind,
      stat: 'attackSpeed',
      multiplier: effect.multiplier,
      durationSec: 999,
      remainingSec: 999,
      sourceId: unit.id,
    });
  }

  it('module basic uses effective attackSpeed buff without attackSpeedTier', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.at_sorcerer!;
    const ally = createAllyFromMember(
      mockMember('at_sorcerer'),
      preset,
      levelCurves,
      gameData,
    );
    withAttackSpeedEffect(ally, { kind: 'buff', multiplier: 1.5 });
    expect(getEffectiveAttackSpeedMultiplier(ally)).toBeCloseTo(1.5);

    const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basicCd.remaining = 3;

    const tierRate = getBasicCooldownRate(
      preset.attackSpeedTier ?? 'normal',
      levelCurves,
    );
    expect(tierRate).not.toBe(1);

    tickCooldowns(createMinimalEngine(gameData), [ally], 1);
    expect(basicCd.remaining).toBeCloseTo(3 - 1.5);
  });

  it('module basic uses effective attackSpeed debuff without attackSpeedTier', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.sp_cleric!;
    const ally = createAllyFromMember(
      mockMember('sp_cleric'),
      preset,
      levelCurves,
      gameData,
    );
    withAttackSpeedEffect(ally, { kind: 'debuff', multiplier: 0.5 });
    expect(getEffectiveAttackSpeedMultiplier(ally)).toBeCloseTo(0.5);

    const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basicCd.remaining = 3;

    tickCooldowns(createMinimalEngine(gameData), [ally], 1);
    expect(basicCd.remaining).toBeCloseTo(2.5);
  });

  it('legacy basic still applies attackSpeedTier and effective attackSpeed together', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_duelist!;
    expect(preset.combatModuleIds).toBeUndefined();
    const stage = stageWithEnemyGroup('df_duelist');
    const spec = expandEnemyGroups(stage)[0]!;
    const enemy = createEnemyFromClassGroup(
      spec,
      preset,
      gameData,
      levelCurves,
    );
    withAttackSpeedEffect(enemy, { kind: 'buff', multiplier: 1.2 });

    const basicCd = enemy.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basicCd.remaining = 10;

    const tierRate = getBasicCooldownRate(
      preset.attackSpeedTier ?? 'normal',
      levelCurves,
    );
    const speedMul = getEffectiveAttackSpeedMultiplier(enemy);
    expect(tierRate * speedMul).not.toBe(1);

    tickCooldowns(createMinimalEngine(gameData), [enemy], 1);
    expect(basicCd.remaining).toBeCloseTo(10 - tierRate * speedMul);
  });

  it('executes physical, magic, and heal module actions through SkillExecutor.tryExecute', () => {
    const gameData = loadGameData();
    const cases = [
      {
        classId: 'at_swordsman' as const,
        moduleId: 'at_swordsman_mod_single_slash',
        expectEffect: 'damage' as const,
        expectDamageType: 'physical' as const,
      },
      {
        classId: 'at_sorcerer' as const,
        moduleId: 'at_sorcerer_mod_focus',
        expectEffect: 'damage' as const,
        expectDamageType: 'magic' as const,
      },
      {
        classId: 'sp_cleric' as const,
        moduleId: 'sp_cleric_mod_single_mend',
        expectEffect: 'heal' as const,
      },
    ];

    for (const testCase of cases) {
      const preset = gameData.classRegistry[testCase.classId]!;
      const actor = createAllyFromMember(
        mockMember(testCase.classId),
        preset,
        levelCurves,
        gameData,
      );
      actor.battleX = 100;

      const targetEnemy: CombatantState = {
        id: `${testCase.classId}_enemy`,
        name: 'enemy',
        hp: 200,
        maxHp: 200,
        atk: 10,
        def: 5,
        res: 0,
        isAlive: true,
        role: 'attacker',
        classId: 'df_paladin',
        formationRow: 'front',
        traits: { rangePx: 30, damageType: 'physical' },
        build: {
          learnedPassiveIds: [],
          learnedActiveIds: [],
          equippedActiveSlots: [],
        },
        cooldowns: [],
        statusEffects: [],
        barrierHp: 0,
        spriteKey: 'placeholder',
        iconKey: 'placeholder',
        isEnemy: true,
        battleX: 200,
        corpseVisible: true,
      };
      placeEnemyInBasicRange(actor, targetEnemy);

      const woundedAlly: CombatantState = {
        ...actor,
        id: `${testCase.classId}_wounded`,
        hp: Math.floor(actor.maxHp * 0.4),
        battleX: actor.battleX,
      };

      const allies =
        testCase.classId === 'sp_cleric' ? [actor, woundedAlly] : [actor];
      const enemies = [targetEnemy];
      const { executor, events } = createSkillExecutor(
        gameData,
        allies,
        enemies,
      );

      const basicCd = actor.cooldowns.find((cd) => cd.slotKind === 'basic')!;
      basicCd.remaining = 0;

      expect(executor.tryExecute(actor, basicCd, allies, enemies)).toBe(true);

      const skillEvents = events.filter(
        (event) => event.type === 'skill' && event.slotKind === 'basic',
      );
      expect(skillEvents.length).toBe(1);
      expect(skillEvents[0]?.skillId).toBe(testCase.moduleId);

      if (testCase.expectEffect === 'heal') {
        const healEvent = skillEvents.find((event) => event.effect === 'heal');
        expect(healEvent).toBeDefined();
        expect(healEvent?.targetId).toBe(woundedAlly.id);
        expect(healEvent?.targetId).not.toBe(targetEnemy.id);
      } else {
        const damageEvent = skillEvents.find((event) => event.effect === 'damage');
        expect(damageEvent).toBeDefined();
        expect(damageEvent?.targetId).toBe(targetEnemy.id);
        if (testCase.expectDamageType === 'magic') {
          const moduleSkill = gameData.skillRegistry.actives[testCase.moduleId];
          expect(moduleSkill?.effect[0]).toMatchObject({
            type: 'damage',
            damageType: 'magic',
          });
        }
      }
    }
  });

  it('does not double-fire legacy basic alongside module basic in runUnitSkills', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_guardian!;
    const ally = createAllyFromMember(
      mockMember('df_guardian'),
      preset,
      levelCurves,
      gameData,
    );
    initializeSkillCooldowns(ally, gameData.skillRegistry.actives);
    const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basicCd.remaining = 0;
    ally.battleX = 100;

    const enemy: CombatantState = {
      id: 'enemy',
      name: 'enemy',
      hp: 200,
      maxHp: 200,
      atk: 10,
      def: 5,
      res: 0,
      isAlive: true,
      role: 'attacker',
      classId: 'df_paladin',
      formationRow: 'front',
      traits: { rangePx: 30, damageType: 'physical' },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
      statusEffects: [],
      barrierHp: 0,
      spriteKey: 'placeholder',
      iconKey: 'placeholder',
      isEnemy: true,
      battleX: 150,
      corpseVisible: true,
    };

    const engine = createMinimalEngine(gameData);
    const internals = engine as unknown as {
      players: CombatantState[];
      enemies: CombatantState[];
      executor: SkillExecutor;
    };
    internals.players = [ally];
    internals.enemies = [enemy];

    const firedSkillIds: string[] = [];
    const originalTryExecute = internals.executor.tryExecute.bind(
      internals.executor,
    );
    vi.spyOn(internals.executor, 'tryExecute').mockImplementation(
      (actor, cd, allies, enemies) => {
        const fired = originalTryExecute(actor, cd, allies, enemies);
        if (fired && cd.slotKind === 'basic') {
          firedSkillIds.push(cd.skillId);
        }
        return fired;
      },
    );

    placeEnemyInBasicRange(ally, enemy);

    runUnitSkills(engine, [ally]);

    expect(firedSkillIds).toEqual(['df_guardian_mod_nearest_strike']);
    expect(firedSkillIds).not.toContain(preset.basicAttackSkillId);
  });

  it('covers all R5 target classes with module basic ids', () => {
    const gameData = loadGameData();
    for (const classId of R5_COMBAT_MODULE_CLASS_IDS) {
      const preset = gameData.classRegistry[classId]!;
      const moduleId = resolveSelectedCombatModuleId(
        preset,
        gameData.combatModuleRegistry,
      );
      expect(moduleId).toBe(preset.combatModuleIds?.[0]);

      const ally = createAllyFromMember(
        mockMember(classId),
        preset,
        levelCurves,
        gameData,
      );
      const basicCd = ally.cooldowns.find((cd) => cd.slotKind === 'basic');
      expect(basicCd?.skillId).toBe(moduleId);
    }
  });

  it('resetCooldownAfterFire uses attackIntervalSec for module skills', () => {
    const gameData = loadGameData();
    const skill = gameData.skillRegistry.actives.at_sorcerer_mod_focus!;
    const cd = { skillId: skill.id, remaining: 0, slotKind: 'basic' as const };
    resetCooldownAfterFire(cd, skill);
    expect(cd.remaining).toBe(
      gameData.combatModuleRegistry.at_sorcerer_mod_focus.attackIntervalSec,
    );
  });
});
