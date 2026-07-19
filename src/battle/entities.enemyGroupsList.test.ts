import { beforeEach, describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { loadGameData } from './data/loadGameData.ts';
import {
  computeStatsAtLevel,
  loadLevelCurves,
} from '../progression/levelGrowth.ts';
import {
  createEnemiesForStage,
  createEnemiesFromEnemyGroups,
  resetEntityIdCounter,
} from './entities.ts';
import { resolveProblemSeriesFromSeed } from './problemSeries/seedResolve.ts';
import { toProblemSeriesBattleWaves } from './problemSeries/toBattleWaves.ts';
import type { CombatantState, GameData, StageDef, StageEnemyGroup } from './types.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);
const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';

function stageWithEnemyGroups(
  enemyGroups: StageEnemyGroup[],
  id = 'enemy_groups_list_parity',
): StageDef {
  return {
    id,
    displayName: 'Enemy Groups List Parity',
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

function expectedCountSum(groups: readonly StageEnemyGroup[]): number {
  expect(groups.length).toBeGreaterThan(0);
  let sum = 0;
  for (const group of groups) {
    expect(group.count).toBeGreaterThan(0);
    sum += group.count;
  }
  return sum;
}

function expectedClassIdsInOrder(
  groups: readonly StageEnemyGroup[],
): string[] {
  const classIds: string[] = [];
  for (const group of groups) {
    for (let i = 0; i < group.count; i++) {
      classIds.push(group.classId);
    }
  }
  return classIds;
}

function basicSkillId(enemy: CombatantState): string {
  const basic = enemy.cooldowns.find((cd) => cd.slotKind === 'basic');
  expect(basic).toBeDefined();
  return basic!.skillId;
}

describe('createEnemiesFromEnemyGroups (StageDef-independent)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('builds combatants from problem series A battle wave enemyGroups (all 3 waves)', () => {
    const gameData = loadGameData();
    const catalog = gameData.problemSeriesCatalog;
    const { series } = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
    expect(series.seriesId).toBe('r12m_series_a');

    const battleWaves = toProblemSeriesBattleWaves(series);
    expect(battleWaves).toHaveLength(3);

    const waveExpectations = [
      {
        classIds: ['df_guardian', 'sp_cleric', 'at_sorcerer'],
        modules: [
          'df_guardian_mod_nearest_strike',
          'sp_cleric_mod_single_mend',
          'at_sorcerer_mod_focus',
        ],
      },
      {
        classIds: [
          'df_guardian',
          'df_guardian',
          'sp_cleric',
          'at_sorcerer',
        ],
        modules: [
          'df_guardian_mod_nearest_strike',
          'df_guardian_mod_guard_focus',
          'sp_cleric_mod_party_mend',
          'at_sorcerer_mod_chain',
        ],
      },
      {
        classIds: [
          'df_guardian',
          'at_swordsman',
          'sp_cleric',
          'at_sorcerer',
        ],
        modules: [
          'df_guardian_mod_guard_focus',
          'at_swordsman_mod_pierce_slash',
          'sp_cleric_mod_party_mend',
          'at_sorcerer_mod_chain',
        ],
      },
    ] as const;

    for (let waveIndex = 0; waveIndex < 3; waveIndex++) {
      const groups = battleWaves[waveIndex]!.enemyGroups;
      const expected = expectedCountSum(groups);
      expect(expected).toBe(waveExpectations[waveIndex]!.classIds.length);

      resetEntityIdCounter();
      const enemies = createEnemiesFromEnemyGroups(
        gameData,
        groups,
        levelCurves,
      );

      expect(enemies).toHaveLength(expected);
      expect(enemies.map((e) => e.classId)).toEqual(
        waveExpectations[waveIndex]!.classIds,
      );
      expect(enemies.map((e) => e.classId)).toEqual(
        expectedClassIdsInOrder(groups),
      );
      expect(enemies.every((e) => e.isEnemy)).toBe(true);

      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i]!;
        const moduleId = waveExpectations[waveIndex]!.modules[i]!;
        const preset = gameData.classRegistry[enemy.classId]!;
        expect(groups[i]!.selectedCombatModuleId).toBe(moduleId);
        expect(basicSkillId(enemy)).toBe(moduleId);
        expect(basicSkillId(enemy)).not.toBe(preset.basicAttackSkillId);
      }
    }
  });

  it('builds a real series B wave with a different composition from A', () => {
    const gameData = loadGameData();
    const catalog = gameData.problemSeriesCatalog;
    const { series: seriesA } = resolveProblemSeriesFromSeed(
      catalog,
      FIXTURE_SEED_A,
    );
    const { series: seriesB } = resolveProblemSeriesFromSeed(
      catalog,
      FIXTURE_SEED_B,
    );
    expect(seriesB.seriesId).toBe('r12m_series_b');

    const wavesA = toProblemSeriesBattleWaves(seriesA);
    const wavesB = toProblemSeriesBattleWaves(seriesB);
    const groupsB = wavesB[0]!.enemyGroups;
    const expected = expectedCountSum(groupsB);
    expect(expected).toBe(2);

    const enemiesB = createEnemiesFromEnemyGroups(
      gameData,
      groupsB,
      levelCurves,
    );
    expect(enemiesB).toHaveLength(expected);
    expect(enemiesB.map((e) => e.classId)).toEqual([
      'at_swordsman',
      'at_sorcerer',
    ]);
    expect(enemiesB.map((e) => basicSkillId(e))).toEqual([
      'at_swordsman_mod_single_slash',
      'at_sorcerer_mod_focus',
    ]);

    const enemiesA0 = createEnemiesFromEnemyGroups(
      gameData,
      wavesA[0]!.enemyGroups,
      levelCurves,
    );
    expect(enemiesB.map((e) => e.classId)).not.toEqual(
      enemiesA0.map((e) => e.classId),
    );
  });

  it('applies group scales to generated stats', () => {
    const gameData = loadGameData();
    const preset = gameData.classRegistry.df_paladin!;
    const groups: StageEnemyGroup[] = [
      {
        classId: 'df_paladin',
        count: 1,
        hpScale: 1.5,
        atkScale: 2,
        defScale: 0.8,
        resScale: 1.2,
      },
    ];
    const base = computeStatsAtLevel(preset, preset, 1, levelCurves);
    const [enemy] = createEnemiesFromEnemyGroups(
      gameData,
      groups,
      levelCurves,
    )!;

    expect(enemy).toMatchObject({
      maxHp: Math.round(base.maxHp * 1.5),
      atk: Math.round(base.atk * 2),
      def: Math.round(base.def * 0.8),
      res: Math.round(base.res * 1.2),
      hp: Math.round(base.maxHp * 1.5),
    });
  });

  it('keeps range-based spawn placement for mixed-range groups', () => {
    const gameData = loadGameData();
    const groups: StageEnemyGroup[] = [
      { classId: 'at_hunter', count: 1 },
      { classId: 'df_guardian', count: 1 },
    ];
    const enemies = createEnemiesFromEnemyGroups(
      gameData,
      groups,
      levelCurves,
    );
    expect(enemies).toHaveLength(2);
    // shorter range (guardian) is placed closer to the party than hunter
    const guardian = enemies.find((e) => e.classId === 'df_guardian')!;
    const hunter = enemies.find((e) => e.classId === 'at_hunter')!;
    expect(guardian.spawnX).toBeLessThan(hunter.spawnX);
  });

  it('expands multi-unit groups preserving classId order and counts', () => {
    const gameData = loadGameData();
    const groups: StageEnemyGroup[] = [
      {
        classId: 'df_guardian',
        count: 2,
        selectedCombatModuleId: 'df_guardian_mod_nearest_strike',
      },
      {
        classId: 'at_sorcerer',
        count: 3,
        selectedCombatModuleId: 'at_sorcerer_mod_focus',
      },
    ];
    const expected = expectedCountSum(groups);
    expect(expected).toBe(5);

    const enemies = createEnemiesFromEnemyGroups(
      gameData,
      groups,
      levelCurves,
    );
    expect(enemies).toHaveLength(expected);
    expect(enemies.map((e) => e.classId)).toEqual([
      'df_guardian',
      'df_guardian',
      'at_sorcerer',
      'at_sorcerer',
      'at_sorcerer',
    ]);
    expect(
      enemies
        .slice(0, 2)
        .every((e) => basicSkillId(e) === 'df_guardian_mod_nearest_strike'),
    ).toBe(true);
    expect(
      enemies
        .slice(2)
        .every((e) => basicSkillId(e) === 'at_sorcerer_mod_focus'),
    ).toBe(true);
  });

  it('matches createEnemiesForStage for the same groups after id counter reset', () => {
    const gameData = loadGameData();
    const catalog = gameData.problemSeriesCatalog;
    const { series } = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
    const groups = toProblemSeriesBattleWaves(series)[0]!.enemyGroups;
    expect(groups.length).toBeGreaterThan(0);

    const stage = stageWithEnemyGroups([...groups]);
    const stagedData = gameDataWithStage(stage);

    resetEntityIdCounter();
    const fromGroups = createEnemiesFromEnemyGroups(
      gameData,
      groups,
      levelCurves,
    );
    resetEntityIdCounter();
    const fromStage = createEnemiesForStage(
      stagedData,
      stage.id,
      0,
      levelCurves,
    );

    expect(fromGroups).toHaveLength(expectedCountSum(groups));
    expect(fromGroups).toEqual(fromStage);
  });

  it('does not mutate the input groups array or group objects', () => {
    const gameData = loadGameData();
    const groups: StageEnemyGroup[] = [
      {
        classId: 'df_guardian',
        count: 2,
        selectedCombatModuleId: 'df_guardian_mod_nearest_strike',
        hpScale: 1.25,
      },
      {
        classId: 'sp_cleric',
        count: 1,
        selectedCombatModuleId: 'sp_cleric_mod_single_mend',
      },
    ];
    const snapshot = structuredClone(groups);
    const groupRefs = groups.map((g) => g);

    const enemies = createEnemiesFromEnemyGroups(
      gameData,
      groups,
      levelCurves,
    );
    expect(enemies).toHaveLength(3);

    enemies[0]!.classId = 'at_swordsman';
    enemies[0]!.maxHp = 1;
    enemies.push({ ...enemies[0]!, id: 'mutated' });

    expect(groups).toEqual(snapshot);
    expect(groups[0]).toBe(groupRefs[0]);
    expect(groups[1]).toBe(groupRefs[1]);
  });

  it('returns empty array for empty groups', () => {
    expect(
      createEnemiesFromEnemyGroups(loadGameData(), [], levelCurves),
    ).toEqual([]);
  });
});
