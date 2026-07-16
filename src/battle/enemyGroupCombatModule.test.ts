import { describe, expect, it, beforeEach, vi } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import {
  createEnemiesForStage,
  createEnemyFromClassGroup,
  resetEntityIdCounter,
} from './entities.ts';
import { expandEnemyGroups } from './enemyGroupSpawn.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { PartyCombatModuleSelection } from './partyCombatModuleSelection.ts';
import { initializeSkillCooldowns, resetCooldownAfterFire } from './skillTrigger.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';
import type {
  BattleEventListener,
  CombatantState,
  GameData,
  ResolvedEnemySpawnSpec,
  StageDef,
} from './types.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);

function stageWithGroups(
  enemyGroups: NonNullable<StageDef['enemyGroups']>,
  recommendedLevel = 10,
  id = 'enemy_module_test',
): StageDef {
  return {
    id,
    displayName: 'Enemy Module Test',
    recommendedLevel,
    enemyGroups,
    waves: [{ enemies: [] }],
  };
}

function gameDataWithStage(stage: StageDef): GameData {
  const base = loadGameData();
  return {
    ...base,
    stages: [...base.stages.filter((s) => s.id !== stage.id), stage],
  };
}

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

function placePlayerInBasicRange(
  enemy: CombatantState,
  player: CombatantState,
): void {
  player.battleX = enemy.battleX - Math.max(1, enemy.traits.rangePx - 1);
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

describe('enemy group selectedCombatModuleId runtime (R5e)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('8. unspecified group uses module A', () => {
    const gameData = loadGameData();
    const stage = stageWithGroups([{ classId: 'df_guardian', count: 1 }]);
    const [enemy] = createEnemiesForStage(
      gameDataWithStage(stage),
      stage.id,
      0,
      levelCurves,
    )!;

    expect(enemy.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'df_guardian_mod_nearest_strike',
    );
  });

  it('9. module B group uses B', () => {
    const gameData = loadGameData();
    const stage = stageWithGroups([
      {
        classId: 'at_sorcerer',
        count: 1,
        selectedCombatModuleId: 'at_sorcerer_mod_twin_bolt',
      },
    ]);
    const [enemy] = createEnemiesForStage(
      gameDataWithStage(stage),
      stage.id,
      0,
      levelCurves,
    )!;

    expect(enemy.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'at_sorcerer_mod_twin_bolt',
    );
  });

  it('10. all individuals in same group share module B', () => {
    const gameData = loadGameData();
    const stage = stageWithGroups([
      {
        classId: 'at_swordsman',
        count: 3,
        selectedCombatModuleId: 'at_swordsman_mod_pierce_slash',
      },
    ]);
    const enemies = createEnemiesForStage(
      gameDataWithStage(stage),
      stage.id,
      0,
      levelCurves,
    );

    expect(enemies).toHaveLength(3);
    for (const enemy of enemies) {
      expect(enemy.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
        'at_swordsman_mod_pierce_slash',
      );
    }
  });

  it('11. module B attackIntervalSec applies to initial basic cooldown', () => {
    const gameData = loadGameData();
    const moduleId = 'at_sorcerer_mod_twin_bolt';
    const interval = gameData.combatModuleRegistry[moduleId].attackIntervalSec;
    const stage = stageWithGroups([
      {
        classId: 'at_sorcerer',
        count: 1,
        selectedCombatModuleId: moduleId,
      },
    ]);
    const [enemy] = createEnemiesForStage(
      gameDataWithStage(stage),
      stage.id,
      0,
      levelCurves,
    )!;
    initializeSkillCooldowns(enemy, gameData.skillRegistry.actives);

    expect(enemy.cooldowns.find((cd) => cd.slotKind === 'basic')?.remaining).toBe(
      interval,
    );
    expect(interval).toBe(3.5);
  });

  it('12. post-fire cycle uses module B interval', () => {
    const gameData = loadGameData();
    const moduleId = 'at_swordsman_mod_pierce_slash';
    const interval = gameData.combatModuleRegistry[moduleId].attackIntervalSec;
    const preset = gameData.classRegistry.at_swordsman!;
    const stage = stageWithGroups([
      {
        classId: 'at_swordsman',
        count: 1,
        selectedCombatModuleId: moduleId,
      },
    ]);
    const [enemy] = createEnemiesForStage(
      gameDataWithStage(stage),
      stage.id,
      0,
      levelCurves,
    )!;
    initializeSkillCooldowns(enemy, gameData.skillRegistry.actives);
    enemy.battleX = 200;

    const player: CombatantState = {
      id: 'player',
      name: 'player',
      hp: 200,
      maxHp: 200,
      atk: 10,
      def: 5,
      res: 0,
      isAlive: true,
      role: 'defender',
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
      isEnemy: false,
      battleX: 100,
      corpseVisible: true,
    };
    placePlayerInBasicRange(enemy, player);

    const { executor } = createSkillExecutor(gameData, [player], [enemy]);
    const basicCd = enemy.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    const engine = createMinimalEngine(gameData);

    tickCooldowns(engine, [enemy], interval - 0.01);
    expect(executor.tryExecute(enemy, basicCd, [player], [enemy])).toBe(false);

    tickCooldowns(engine, [enemy], 0.02);
    expect(basicCd.remaining).toBe(0);
    expect(executor.tryExecute(enemy, basicCd, [player], [enemy])).toBe(true);
    resetCooldownAfterFire(basicCd, gameData.skillRegistry.actives[basicCd.skillId]);
    expect(basicCd.remaining).toBe(interval);
    expect(basicCd.skillId).toBe(moduleId);
    expect(basicCd.skillId).not.toBe(preset.basicAttackSkillId);
  });

  it('13. does not double-fire legacy basic or both module A/B', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_guardian!;
    const stage = stageWithGroups([
      {
        classId: 'df_guardian',
        count: 1,
        selectedCombatModuleId: 'df_guardian_mod_guard_focus',
      },
    ]);
    const [enemy] = createEnemiesForStage(
      gameDataWithStage(stage),
      stage.id,
      0,
      levelCurves,
    )!;
    initializeSkillCooldowns(enemy, gameData.skillRegistry.actives);
    const basicCd = enemy.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basicCd.remaining = 0;
    enemy.battleX = 200;

    const player: CombatantState = {
      id: 'player',
      name: 'player',
      hp: 200,
      maxHp: 200,
      atk: 10,
      def: 5,
      res: 0,
      isAlive: true,
      role: 'defender',
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
      isEnemy: false,
      battleX: 100,
      corpseVisible: true,
    };

    const engine = createMinimalEngine(gameData);
    const internals = engine as unknown as {
      players: CombatantState[];
      enemies: CombatantState[];
      executor: SkillExecutor;
    };
    internals.players = [player];
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

    runUnitSkills(engine, [enemy]);

    expect(firedSkillIds).toEqual(['df_guardian_mod_guard_focus']);
    expect(firedSkillIds).not.toContain(preset.basicAttackSkillId);
    expect(firedSkillIds).not.toContain('df_guardian_mod_nearest_strike');
  });

  it('14. multiple groups can specify A and B independently', () => {
    const gameData = loadGameData();
    const stage = stageWithGroups([
      { classId: 'df_guardian', count: 1 },
      {
        classId: 'df_guardian',
        count: 1,
        selectedCombatModuleId: 'df_guardian_mod_guard_focus',
      },
    ]);
    const enemies = createEnemiesForStage(
      gameDataWithStage(stage),
      stage.id,
      0,
      levelCurves,
    );

    expect(enemies).toHaveLength(2);
    const moduleIds = enemies.map(
      (enemy) => enemy.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId,
    );
    expect(moduleIds.sort()).toEqual(
      ['df_guardian_mod_guard_focus', 'df_guardian_mod_nearest_strike'].sort(),
    );
  });

  it('15. legacy group keeps synthesized legacy basic', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.at_assassin!;
    expect(preset.combatModuleIds).toBeUndefined();
    const stage = stageWithGroups([{ classId: 'at_assassin', count: 1 }]);
    const [enemy] = createEnemiesForStage(
      gameDataWithStage(stage),
      stage.id,
      0,
      levelCurves,
    )!;

    expect(enemy.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      preset.basicAttackSkillId,
    );
  });

  it('16. ally PartyCombatModuleSelection is unaffected by enemy group module', () => {
    const gameData = loadGameData();
    const selection = new PartyCombatModuleSelection();
    selection.setSelectedCombatModuleId(0, 'df_guardian_mod_guard_focus');

    const stage = stageWithGroups([
      {
        classId: 'at_sorcerer',
        count: 1,
        selectedCombatModuleId: 'at_sorcerer_mod_twin_bolt',
      },
    ]);
    const [enemy] = createEnemiesForStage(
      gameDataWithStage(stage),
      stage.id,
      0,
      levelCurves,
    )!;

    expect(enemy.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'at_sorcerer_mod_twin_bolt',
    );
    expect(selection.getSelectedCombatModuleId(0)).toBe(
      'df_guardian_mod_guard_focus',
    );
  });

  it('defensive fallback: invalid group module ID resolves to module A at runtime', () => {
    const gameData = loadGameData();
    const stage = stageWithGroups([{ classId: 'df_guardian', count: 1 }]);
    const spec: ResolvedEnemySpawnSpec = {
      ...expandEnemyGroups(stage)[0]!,
      selectedCombatModuleId: 'at_sorcerer_mod_twin_bolt',
    };
    const enemy = createEnemyFromClassGroup(
      spec,
      gameData.classRegistry.df_guardian!,
      gameData,
      levelCurves,
    );

    expect(enemy.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      'df_guardian_mod_nearest_strike',
    );
  });

  it('expandEnemyGroups preserves selectedCombatModuleId on each spec', () => {
    const stage = stageWithGroups([
      {
        classId: 'sp_cleric',
        count: 2,
        selectedCombatModuleId: 'sp_cleric_mod_party_mend',
      },
    ]);
    const specs = expandEnemyGroups(stage);

    expect(specs).toHaveLength(2);
    expect(specs.every((spec) => spec.selectedCombatModuleId === 'sp_cleric_mod_party_mend')).toBe(
      true,
    );
  });

  it('executes physical and magic enemy module B through SkillExecutor', () => {
    const gameData = loadGameData();
    const cases = [
      {
        classId: 'at_swordsman' as const,
        moduleId: 'at_swordsman_mod_pierce_slash',
        minEvents: 1,
      },
      {
        classId: 'at_sorcerer' as const,
        moduleId: 'at_sorcerer_mod_twin_bolt',
        minEvents: 2,
      },
    ];

    for (const testCase of cases) {
      const stage = stageWithGroups([
        {
          classId: testCase.classId,
          count: 1,
          selectedCombatModuleId: testCase.moduleId,
        },
      ]);
      const [enemy] = createEnemiesForStage(
        gameDataWithStage(stage),
        stage.id,
        0,
        levelCurves,
      )!;
      enemy.battleX = 200;

      const player: CombatantState = {
        id: 'player',
        name: 'player',
        hp: 200,
        maxHp: 200,
        atk: 10,
        def: 5,
        res: 0,
        isAlive: true,
        role: 'defender',
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
        isEnemy: false,
        battleX: 100,
        corpseVisible: true,
      };
      placePlayerInBasicRange(enemy, player);

      const { executor, events } = createSkillExecutor(gameData, [player], [enemy]);
      const basicCd = enemy.cooldowns.find((cd) => cd.slotKind === 'basic')!;
      basicCd.remaining = 0;

      expect(executor.tryExecute(enemy, basicCd, [player], [enemy])).toBe(true);
      const skillEvents = events.filter(
        (event) => event.type === 'skill' && event.slotKind === 'basic',
      );
      expect(skillEvents.length).toBeGreaterThanOrEqual(testCase.minEvents);
      expect(skillEvents.every((event) => event.skillId === testCase.moduleId)).toBe(
        true,
      );
      expect(skillEvents.some((event) => event.effect === 'damage')).toBe(true);
    }
  });

  it('enemy heal module B is wired as basic skillId (sp_cleric party mend)', () => {
    const gameData = loadGameData();
    const moduleId = 'sp_cleric_mod_party_mend';
    const stage = stageWithGroups([
      {
        classId: 'sp_cleric',
        count: 1,
        selectedCombatModuleId: moduleId,
      },
    ]);
    const [enemy] = createEnemiesForStage(
      gameDataWithStage(stage),
      stage.id,
      0,
      levelCurves,
    )!;

    expect(enemy.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      moduleId,
    );
    expect(
      gameData.skillRegistry.actives[moduleId]?.effect.some(
        (effect) => effect.type === 'heal',
      ),
    ).toBe(true);
  });
});
