import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import {
  ENEMY_GROUP_BASE_LEVEL,
  expandEnemyGroups,
  expandEnemyGroupsList,
} from './enemyGroupSpawn.ts';
import { resolveProblemSeriesFromSeed } from './problemSeries/seedResolve.ts';
import { toProblemSeriesBattleWaves } from './problemSeries/toBattleWaves.ts';
import type { StageDef, StageEnemyGroup } from './types.ts';

const FIXTURE_SEED_A = 'fixture-a';

function stageWithEnemyGroups(
  enemyGroups: StageEnemyGroup[],
): StageDef {
  return {
    id: 'test_stage',
    displayName: 'Test',
    enemyGroups,
    waves: [{ enemies: [] }],
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

describe('expandEnemyGroupsList (StageDef-independent)', () => {
  it('expands problem series A battle wave enemyGroups with concrete spawn keys', () => {
    const catalog = loadGameData().problemSeriesCatalog;
    const { series } = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
    expect(series.seriesId).toBe('r12m_series_a');

    const battleWaves = toProblemSeriesBattleWaves(series);
    expect(battleWaves).toHaveLength(3);

    // Wave 0: 3 groups × count 1 → 3 specs（実系列 A）
    const wave0Groups = battleWaves[0]!.enemyGroups;
    const wave0Expected = expectedCountSum(wave0Groups);
    expect(wave0Expected).toBe(3);

    const wave0Specs = expandEnemyGroupsList(wave0Groups);
    expect(wave0Specs).toHaveLength(wave0Expected);
    expect(wave0Specs.map((s) => [s.groupIndex, s.indexInGroup, s.groupCount, s.spawnUnitKey])).toEqual([
      [0, 0, 1, 'g0_i0'],
      [1, 0, 1, 'g1_i0'],
      [2, 0, 1, 'g2_i0'],
    ]);
    expect(wave0Specs.map((s) => s.classId)).toEqual([
      'df_guardian',
      'sp_cleric',
      'at_sorcerer',
    ]);
    expect(wave0Specs.map((s) => s.selectedCombatModuleId)).toEqual([
      'df_guardian_mod_nearest_strike',
      'sp_cleric_mod_single_mend',
      'at_sorcerer_mod_focus',
    ]);
    expect(wave0Specs.every((s) => s.level === ENEMY_GROUP_BASE_LEVEL)).toBe(true);
    // 系列 A は scale 未指定 → 既存展開どおり undefined のまま（補完しない）
    for (const spec of wave0Specs) {
      expect(spec.hpScale).toBeUndefined();
      expect(spec.atkScale).toBeUndefined();
      expect(spec.defScale).toBeUndefined();
      expect(spec.resScale).toBeUndefined();
    }

    // Wave 1: 4 groups × count 1 → 4 specs
    const wave1Groups = battleWaves[1]!.enemyGroups;
    const wave1Expected = expectedCountSum(wave1Groups);
    expect(wave1Expected).toBe(4);
    const wave1Specs = expandEnemyGroupsList(wave1Groups);
    expect(wave1Specs).toHaveLength(wave1Expected);
    expect(wave1Specs.map((s) => s.spawnUnitKey)).toEqual([
      'g0_i0',
      'g1_i0',
      'g2_i0',
      'g3_i0',
    ]);
    expect(wave1Specs.every((s) => s.selectedCombatModuleId !== undefined)).toBe(
      true,
    );
    expect(wave1Specs.map((s) => s.selectedCombatModuleId)).toEqual(
      wave1Groups.map((g) => g.selectedCombatModuleId),
    );

    // Wave 2: 4 groups × count 1 → 4 specs
    const wave2Groups = battleWaves[2]!.enemyGroups;
    const wave2Expected = expectedCountSum(wave2Groups);
    expect(wave2Expected).toBe(4);
    const wave2Specs = expandEnemyGroupsList(wave2Groups);
    expect(wave2Specs).toHaveLength(wave2Expected);
    expect(wave2Specs.map((s) => [s.groupIndex, s.indexInGroup, s.spawnUnitKey])).toEqual([
      [0, 0, 'g0_i0'],
      [1, 0, 'g1_i0'],
      [2, 0, 'g2_i0'],
      [3, 0, 'g3_i0'],
    ]);
    expect(wave2Specs.map((s) => s.selectedCombatModuleId)).toEqual([
      'df_guardian_mod_guard_focus',
      'at_swordsman_mod_pierce_slash',
      'sp_cleric_mod_party_mend',
      'at_sorcerer_mod_chain',
    ]);
  });

  it('keeps count order with multi-unit groups (indexInGroup / spawnUnitKey)', () => {
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
        hpScale: 1.5,
        atkScale: 2,
      },
    ];
    const expected = expectedCountSum(groups);
    expect(expected).toBe(5);

    const specs = expandEnemyGroupsList(groups);
    expect(specs).toHaveLength(expected);
    expect(specs.map((s) => [s.groupIndex, s.indexInGroup, s.groupCount, s.spawnUnitKey])).toEqual([
      [0, 0, 2, 'g0_i0'],
      [0, 1, 2, 'g0_i1'],
      [1, 0, 3, 'g1_i0'],
      [1, 1, 3, 'g1_i1'],
      [1, 2, 3, 'g1_i2'],
    ]);
    expect(specs.every((s) => s.selectedCombatModuleId !== undefined)).toBe(true);
    expect(specs.slice(0, 2).every((s) => s.selectedCombatModuleId === 'df_guardian_mod_nearest_strike')).toBe(
      true,
    );
    expect(specs.slice(2).every((s) => s.selectedCombatModuleId === 'at_sorcerer_mod_focus')).toBe(
      true,
    );
    for (const spec of specs.slice(0, 2)) {
      expect(spec.hpScale).toBeUndefined();
      expect(spec.atkScale).toBeUndefined();
      expect(spec.defScale).toBeUndefined();
      expect(spec.resScale).toBeUndefined();
    }
    for (const spec of specs.slice(2)) {
      expect(spec.hpScale).toBe(1.5);
      expect(spec.atkScale).toBe(2);
      expect(spec.defScale).toBeUndefined();
      expect(spec.resScale).toBeUndefined();
    }
  });

  it('matches expandEnemyGroups(stage) for the same groups', () => {
    const catalog = loadGameData().problemSeriesCatalog;
    const { series } = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
    const battleWaves = toProblemSeriesBattleWaves(series);
    const groups = battleWaves[0]!.enemyGroups;
    expect(groups.length).toBeGreaterThan(0);

    const fromList = expandEnemyGroupsList(groups);
    const fromStage = expandEnemyGroups(stageWithEnemyGroups([...groups]));

    expect(fromList).toEqual(fromStage);
    expect(fromList).toHaveLength(expectedCountSum(groups));
  });

  it('does not mutate the input groups array or group objects', () => {
    const groups: StageEnemyGroup[] = [
      {
        classId: 'df_guardian',
        count: 2,
        selectedCombatModuleId: 'mod_a',
        hpScale: 1.25,
      },
      {
        classId: 'sp_cleric',
        count: 1,
        selectedCombatModuleId: 'mod_b',
      },
    ];
    const snapshot = structuredClone(groups);
    const groupRefs = groups.map((g) => g);

    const specs = expandEnemyGroupsList(groups);
    expect(specs).toHaveLength(3);

    specs[0]!.classId = 'at_swordsman';
    specs[0]!.groupCount = 99;
    specs[0]!.selectedCombatModuleId = 'mutated';
    specs[0]!.hpScale = 9;
    specs.push({
      classId: 'at_sorcerer',
      level: 1,
      groupIndex: 9,
      indexInGroup: 9,
      groupCount: 9,
      spawnUnitKey: 'mutated',
    });

    expect(groups).toEqual(snapshot);
    expect(groups[0]).toBe(groupRefs[0]);
    expect(groups[1]).toBe(groupRefs[1]);
  });

  it('returns empty array for empty groups', () => {
    expect(expandEnemyGroupsList([])).toEqual([]);
  });
});
