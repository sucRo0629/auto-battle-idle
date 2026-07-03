import { describe, expect, it, beforeEach } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { loadGameData } from './data/loadGameData.ts';
import {
  computeStatsAtLevel,
  loadLevelCurves,
} from '../progression/levelGrowth.ts';
import {
  createEnemiesForStage,
  createEnemyFromClassGroup,
  resetEntityIdCounter,
} from './entities.ts';
import { expandEnemyGroups } from './enemyGroupSpawn.ts';
import type { GameData, StageDef } from './types.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);

function stageWithEnemyGroups(
  enemyGroups: NonNullable<StageDef['enemyGroups']>,
  recommendedLevel = 10,
  id = 'enemy_groups_test',
): StageDef {
  return {
    id,
    displayName: 'Enemy Groups Test',
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

describe('createEnemiesForStage enemyGroups path', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('spawns enemies from enemyGroups stage', () => {
    const stage = stageWithEnemyGroups([{ classId: 'df_paladin', count: 2 }]);
    const gameData = gameDataWithStage(stage);
    const enemies = createEnemiesForStage(
      gameData,
      stage.id,
      0,
      levelCurves,
    );

    expect(enemies).toHaveLength(2);
    expect(enemies.every((e) => e.isEnemy)).toBe(true);
    expect(enemies.every((e) => e.classId === 'df_paladin')).toBe(true);
    expect(expandEnemyGroups(stage)).toHaveLength(2);
  });

  it('expands count into separate combatants', () => {
    const stage = stageWithEnemyGroups([
      { classId: 'df_paladin', count: 2 },
      { classId: 'at_hunter', count: 1 },
    ]);
    const gameData = gameDataWithStage(stage);
    const enemies = createEnemiesForStage(
      gameData,
      stage.id,
      0,
      levelCurves,
    );

    expect(enemies).toHaveLength(3);
    expect(enemies.filter((e) => e.classId === 'df_paladin')).toHaveLength(2);
    expect(enemies.filter((e) => e.classId === 'at_hunter')).toHaveLength(1);
  });

  it('uses recommendedLevel for stats via computeStatsAtLevel', () => {
    const preset = loadGameData().classRegistry.df_paladin!;
    const stageLv5 = stageWithEnemyGroups(
      [{ classId: 'df_paladin', count: 1 }],
      5,
    );
    const stageLv15 = stageWithEnemyGroups(
      [{ classId: 'df_paladin', count: 1 }],
      15,
      'enemy_groups_lv15',
    );
    const expectedLv5 = computeStatsAtLevel(preset, preset, 5, levelCurves);
    const expectedLv15 = computeStatsAtLevel(preset, preset, 15, levelCurves);

    const [enemyLv5] = createEnemiesForStage(
      gameDataWithStage(stageLv5),
      stageLv5.id,
      0,
      levelCurves,
    )!;
    const [enemyLv15] = createEnemiesForStage(
      gameDataWithStage(stageLv15),
      stageLv15.id,
      0,
      levelCurves,
    )!;

    expect(enemyLv5).toMatchObject({
      maxHp: expectedLv5.maxHp,
      atk: expectedLv5.atk,
      def: expectedLv5.def,
      reg: expectedLv5.reg,
      hp: expectedLv5.maxHp,
    });
    expect(enemyLv15!.maxHp).toBeGreaterThan(enemyLv5!.maxHp);
    expect(enemyLv15).toMatchObject({
      maxHp: expectedLv15.maxHp,
      atk: expectedLv15.atk,
      def: expectedLv15.def,
    });
  });

  it('applies stat scales to combat stats', () => {
    const preset = loadGameData().classRegistry.df_paladin!;
    const stage = stageWithEnemyGroups([
      {
        classId: 'df_paladin',
        count: 1,
        hpScale: 1.5,
        atkScale: 2,
        defScale: 0.8,
        regScale: 1.2,
      },
    ]);
    const base = computeStatsAtLevel(preset, preset, 10, levelCurves);
    const [enemy] = createEnemiesForStage(
      gameDataWithStage(stage),
      stage.id,
      0,
      levelCurves,
    )!;

    expect(enemy).toMatchObject({
      maxHp: Math.round(base.maxHp * 1.5),
      atk: Math.round(base.atk * 2),
      def: Math.round(base.def * 0.8),
      reg: Math.round(base.reg * 1.2),
      hp: Math.round(base.maxHp * 1.5),
    });
  });

  it('treats undefined scales as 1', () => {
    const preset = loadGameData().classRegistry.df_paladin!;
    const stage = stageWithEnemyGroups([{ classId: 'df_paladin', count: 1 }]);
    const base = computeStatsAtLevel(preset, preset, 10, levelCurves);
    const [enemy] = createEnemiesForStage(
      gameDataWithStage(stage),
      stage.id,
      0,
      levelCurves,
    )!;

    expect(enemy).toMatchObject({
      maxHp: base.maxHp,
      atk: base.atk,
      def: base.def,
      reg: base.reg,
    });
  });

  it('keeps legacy stage generation unchanged', () => {
    const gameData = loadGameData();
    const enemies = createEnemiesForStage(gameData, '1', 0);

    expect(enemies.length).toBeGreaterThan(0);
    expect(enemies.every((e) => e.isEnemy)).toBe(true);
    const stage = gameData.stages.find((s) => s.id === '1')!;
    expect(stage.enemyGroups).toBeUndefined();
    const templateIds = stage.waves[0]!.enemies.map((e) => e.templateId);
    for (const enemy of enemies) {
      expect(gameData.enemyRegistry[enemy.classId]).toBeDefined();
      expect(templateIds).toContain(enemy.classId);
    }
  });

  it('returns empty array for waveIndex > 0 on enemyGroups stage', () => {
    const stage = stageWithEnemyGroups([{ classId: 'df_paladin', count: 2 }]);
    const gameData = gameDataWithStage(stage);

    expect(
      createEnemiesForStage(gameData, stage.id, 1, levelCurves),
    ).toEqual([]);
  });

  it('uses existing id generation (not spawnUnitKey)', () => {
    const stage = stageWithEnemyGroups([{ classId: 'df_paladin', count: 1 }]);
    const gameData = gameDataWithStage(stage);
    const spec = expandEnemyGroups(stage)[0]!;

    const enemy = createEnemyFromClassGroup(
      spec,
      gameData.classRegistry.df_paladin!,
      gameData,
      levelCurves,
    );

    expect(enemy.id).toMatch(/^df_paladin_\d+$/);
    expect(enemy.id).not.toBe(spec.spawnUnitKey);
  });

  it('floors scaled maxHp and atk on enemyGroups combatants', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_paladin!;
    const stage = stageWithEnemyGroups([
      {
        classId: 'df_paladin',
        count: 1,
        hpScale: 0.001,
        atkScale: 0.01,
      },
    ]);
    const spec = expandEnemyGroups(stage)[0]!;
    const enemy = createEnemyFromClassGroup(
      spec,
      preset,
      gameData,
      levelCurves,
    );

    expect(enemy.maxHp).toBe(1);
    expect(enemy.atk).toBe(1);
    expect(enemy.hp).toBe(enemy.maxHp);
  });

  it('limits battle actives by Lv0 / Lv10 / Lv20 unlock tiers', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_paladin!;

    const activeIdsAt = (level: number) => {
      const stage = stageWithEnemyGroups(
        [{ classId: 'df_paladin', count: 1 }],
        level,
        `tier_lv${level}`,
      );
      const [enemy] = createEnemiesForStage(
        gameDataWithStage(stage),
        stage.id,
        0,
        levelCurves,
      )!;
      return enemy.cooldowns
        .filter((cd) => cd.slotKind === 'active')
        .map((cd) => cd.skillId);
    };

    expect(activeIdsAt(0)).toHaveLength(2);
    expect(activeIdsAt(9)).toHaveLength(2);
    expect(activeIdsAt(10)).toHaveLength(3);
    expect(activeIdsAt(19)).toHaveLength(3);
    expect(activeIdsAt(20)).toHaveLength(4);

    const allLearned = preset.skills
      .filter((entry) => entry.level <= 20)
      .flatMap((entry) => entry.skillIds)
      .filter((id) => gameData.skillRegistry.actives[id]);
    expect(activeIdsAt(20).every((id) => allLearned.includes(id))).toBe(true);
  });
});

describe('eg_smoke pilot stage (stages.json)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('validates and spawns via enemyGroups path from real game data', () => {
    const gameData = loadGameData();
    const stage = gameData.stages.find((s) => s.id === 'eg_smoke');

    expect(stage).toMatchObject({
      id: 'eg_smoke',
      recommendedLevel: 10,
      enemyGroups: [
        { classId: 'df_guardian', count: 1 },
        { classId: 'at_hunter', count: 1 },
      ],
      waves: [{ enemies: [] }],
    });
    expect(stage!.waves[0]?.enemies).toHaveLength(0);

    const enemies = createEnemiesForStage(
      gameData,
      'eg_smoke',
      0,
      levelCurves,
    );

    expect(enemies).toHaveLength(2);
    expect(enemies.every((e) => e.isEnemy)).toBe(true);
    expect(enemies.map((e) => e.classId).sort()).toEqual([
      'at_hunter',
      'df_guardian',
    ]);
    const specs = expandEnemyGroups(stage!);
    expect(specs).toHaveLength(2);
    expect(specs.every((s) => s.level === 10)).toBe(true);
  });
});

describe('ranged_test stage (stages.json)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('validates and spawns via enemyGroups path from real game data', () => {
    const gameData = loadGameData();
    const stage = gameData.stages.find((s) => s.id === 'ranged_test');

    expect(stage).toMatchObject({
      id: 'ranged_test',
      recommendedLevel: 10,
      enemyGroups: [
        { classId: 'df_guardian', count: 1 },
        { classId: 'at_hunter', count: 2 },
      ],
      waves: [{ enemies: [] }],
    });
    expect(stage!.waves[0]?.enemies).toHaveLength(0);

    const enemies = createEnemiesForStage(
      gameData,
      'ranged_test',
      0,
      levelCurves,
    );

    expect(enemies).toHaveLength(3);
    expect(enemies.every((e) => e.isEnemy)).toBe(true);
    expect(enemies.filter((e) => e.classId === 'df_guardian')).toHaveLength(1);
    expect(enemies.filter((e) => e.classId === 'at_hunter')).toHaveLength(2);
    const specs = expandEnemyGroups(stage!);
    expect(specs).toHaveLength(3);
    expect(specs.every((s) => s.level === 10)).toBe(true);
  });
});
