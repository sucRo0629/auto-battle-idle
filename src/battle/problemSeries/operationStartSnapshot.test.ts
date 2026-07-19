import { describe, expect, expectTypeOf, it } from 'vitest';
import { loadGameData } from '../data/loadGameData.ts';
import type { ProblemSeriesCatalogDef, ProblemSeriesDef } from '../types.ts';
import {
  createProblemSeriesOperationStartSnapshot,
  type ProblemSeriesOperationStartEnemyGroup,
  type ProblemSeriesOperationStartSnapshot,
} from './operationStartSnapshot.ts';
import { resolveProblemSeriesFromSeed } from './seedResolve.ts';
import { toProblemSeriesBattleWaves } from './toBattleWaves.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';

const FORBIDDEN_SNAPSHOT_KEYS = [
  'series',
  'id',
  'displayName',
  'recommendedLevel',
  'unlockClassIdsOnClear',
  'formationHintJa',
  'internalProblemClass',
  'expectedFailureModes',
  'connection',
  'waveLinks',
  'waveRelationSummary',
  'finalWaveCompositeOf',
  'operationConditions',
  'allowedClassIds',
  'enemies',
  'party',
  'selectedCombatModuleIds',
  'combatModuleSelection',
  'operationPassives',
  'passives',
  'remainingPoints',
  'operationPoints',
  'prepResourceRemaining',
  'currentWaveIndex',
  'waveIndex',
  'checkpoint',
  'combatants',
  'save',
  'saveData',
  'selectionIndex',
  'selectionHash',
] as const;

function expectSnapshotShapeOnly(
  snapshot: ProblemSeriesOperationStartSnapshot,
): void {
  expect(Object.keys(snapshot).sort()).toEqual(
    ['generatorVersion', 'seed', 'seriesId', 'waves'].sort(),
  );
  for (const forbidden of FORBIDDEN_SNAPSHOT_KEYS) {
    expect(snapshot).not.toHaveProperty(forbidden);
  }
  expect(snapshot.waves).toHaveLength(3);
  for (const wave of snapshot.waves) {
    expect(Object.keys(wave).sort()).toEqual(
      ['enemyGroups', 'prepResourceGrant'].sort(),
    );
    for (const forbidden of FORBIDDEN_SNAPSHOT_KEYS) {
      expect(wave).not.toHaveProperty(forbidden);
    }
  }
}

/**
 * production A/B 全 group で非空 Module ID が保持され、入力系列と一致することを固定する。
 * group 件数 0 では成功しない。
 */
function expectSelectedCombatModuleIdsMatchSeries(
  snapshot: ProblemSeriesOperationStartSnapshot,
  series: ProblemSeriesDef,
): void {
  expect(snapshot.waves).toHaveLength(3);
  expect(series.waves).toHaveLength(3);

  let groupCount = 0;
  for (let waveIndex = 0; waveIndex < 3; waveIndex++) {
    const snapshotWave = snapshot.waves[waveIndex]!;
    const seriesWave = series.waves[waveIndex]!;
    expect(snapshotWave.enemyGroups.length).toBe(seriesWave.enemyGroups.length);
    expect(snapshotWave.enemyGroups.length).toBeGreaterThan(0);

    for (
      let groupIndex = 0;
      groupIndex < seriesWave.enemyGroups.length;
      groupIndex++
    ) {
      groupCount += 1;
      const snapshotGroup = snapshotWave.enemyGroups[groupIndex]!;
      const seriesGroup = seriesWave.enemyGroups[groupIndex]!;
      expect(snapshotGroup.selectedCombatModuleId).toBe(
        seriesGroup.selectedCombatModuleId,
      );
      expect(snapshotGroup.selectedCombatModuleId.length).toBeGreaterThan(0);
    }
  }
  expect(groupCount).toBeGreaterThan(0);
}

function resolveFromProduction(
  seed: string,
): {
  catalog: ProblemSeriesCatalogDef;
  result: ReturnType<typeof resolveProblemSeriesFromSeed>;
} {
  const catalog = loadGameData().problemSeriesCatalog;
  const result = resolveProblemSeriesFromSeed(catalog, seed);
  return { catalog, result };
}

describe('R12m createProblemSeriesOperationStartSnapshot (pure factory)', () => {
  it('snapshot enemy group requires readonly selectedCombatModuleId: string', () => {
    expectTypeOf<
      ProblemSeriesOperationStartEnemyGroup['selectedCombatModuleId']
    >().toEqualTypeOf<string>();
    expectTypeOf<ProblemSeriesOperationStartEnemyGroup>().toMatchTypeOf<{
      readonly selectedCombatModuleId: string;
    }>();
    expectTypeOf<
      ProblemSeriesOperationStartSnapshot['waves'][number]['enemyGroups'][number]['selectedCombatModuleId']
    >().toEqualTypeOf<string>();
    // scale は optional のまま
    expectTypeOf<
      ProblemSeriesOperationStartEnemyGroup['hpScale']
    >().toEqualTypeOf<number | undefined>();
    expectTypeOf<
      ProblemSeriesOperationStartEnemyGroup['atkScale']
    >().toEqualTypeOf<number | undefined>();
    expectTypeOf<
      ProblemSeriesOperationStartEnemyGroup['defScale']
    >().toEqualTypeOf<number | undefined>();
    expectTypeOf<
      ProblemSeriesOperationStartEnemyGroup['resScale']
    >().toEqualTypeOf<number | undefined>();
  });

  it('fixture-a: production catalog → resolve → snapshot with series A waves', () => {
    const { catalog, result } = resolveFromProduction(FIXTURE_SEED_A);
    expect(result.series.seriesId).toBe('r12m_series_a');

    const snapshot = createProblemSeriesOperationStartSnapshot(result);
    const expectedWaves = toProblemSeriesBattleWaves(result.series);

    expect(snapshot.seed).toBe(result.seed);
    expect(snapshot.seed).toBe(FIXTURE_SEED_A);
    expect(snapshot.generatorVersion).toBe(result.generatorVersion);
    expect(snapshot.generatorVersion).toBe(catalog.generatorVersion);
    expect(snapshot.seriesId).toBe(result.series.seriesId);
    expect(snapshot.seriesId).toBe('r12m_series_a');
    expect(snapshot.waves).toEqual(expectedWaves);
    expectSnapshotShapeOnly(snapshot);
    expectSelectedCombatModuleIdsMatchSeries(snapshot, result.series);
  });

  it('fixture-b: production catalog → resolve → snapshot with series B waves', () => {
    const { catalog, result } = resolveFromProduction(FIXTURE_SEED_B);
    expect(result.series.seriesId).toBe('r12m_series_b');

    const snapshot = createProblemSeriesOperationStartSnapshot(result);
    const expectedWaves = toProblemSeriesBattleWaves(result.series);

    expect(snapshot.seed).toBe(result.seed);
    expect(snapshot.seed).toBe(FIXTURE_SEED_B);
    expect(snapshot.generatorVersion).toBe(result.generatorVersion);
    expect(snapshot.generatorVersion).toBe(catalog.generatorVersion);
    expect(snapshot.seriesId).toBe(result.series.seriesId);
    expect(snapshot.seriesId).toBe('r12m_series_b');
    expect(snapshot.waves).toEqual(expectedWaves);
    expectSnapshotShapeOnly(snapshot);
    expectSelectedCombatModuleIdsMatchSeries(snapshot, result.series);
  });

  it('uses resolver normalized seed (trim) without recomputing selection', () => {
    const catalog = loadGameData().problemSeriesCatalog;
    const result = resolveProblemSeriesFromSeed(catalog, '  fixture-a  ');
    expect(result.seed).toBe('fixture-a');
    expect(result.series.seriesId).toBe('r12m_series_a');

    const snapshot = createProblemSeriesOperationStartSnapshot(result);
    expect(snapshot.seed).toBe(result.seed);
    expect(snapshot.seed).toBe('fixture-a');
    expect(snapshot.seriesId).toBe(result.series.seriesId);
    expect(snapshot.generatorVersion).toBe(result.generatorVersion);
  });

  it('mutating input series waves/groups after factory does not change snapshot', () => {
    const { result } = resolveFromProduction(FIXTURE_SEED_A);
    const snapshot = createProblemSeriesOperationStartSnapshot(result);
    const snapshotBefore = structuredClone(snapshot);

    expect(snapshot.waves).not.toBe(result.series.waves);
    expect(snapshot.waves[0]).not.toBe(result.series.waves[0]);
    expect(snapshot.waves[0]!.enemyGroups).not.toBe(
      result.series.waves[0]!.enemyGroups,
    );
    expect(snapshot.waves[0]!.enemyGroups[0]).not.toBe(
      result.series.waves[0]!.enemyGroups[0],
    );

    result.series.waves[0]!.prepResourceGrant = 999;
    result.series.waves[0]!.enemyGroups[0]!.count = 99;
    result.series.waves[0]!.enemyGroups[0]!.classId = 'at_swordsman';
    result.series.waves[0]!.enemyGroups[0]!.selectedCombatModuleId =
      'mutated_module';
    result.series.waves[0]!.enemyGroups[0]!.hpScale = 7;
    result.series.waves[0]!.enemyGroups.push({
      classId: 'sp_cleric',
      count: 3,
      selectedCombatModuleId: 'extra',
    });
    result.series.waves.push({
      ...structuredClone(result.series.waves[0]!),
      prepResourceGrant: 1,
    });

    expect(snapshot).toEqual(snapshotBefore);
    expect(snapshot.waves).toHaveLength(3);
    expect(snapshot.waves[0]!.prepResourceGrant).toBe(
      snapshotBefore.waves[0]!.prepResourceGrant,
    );
    expect(snapshot.waves[0]!.enemyGroups[0]).toEqual(
      snapshotBefore.waves[0]!.enemyGroups[0],
    );
  });
});
