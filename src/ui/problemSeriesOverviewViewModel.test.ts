import { describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { createProblemSeriesOperationStartSnapshot } from '../battle/problemSeries/operationStartSnapshot.ts';
import {
  createProblemSeriesOverviewCore,
  createProblemSeriesOverviewNamed,
  type ProblemSeriesOverviewNamed,
  type ProblemSeriesOverviewNamedEnemyGroup,
} from '../battle/problemSeries/overviewViewModel.ts';
import { resolveProblemSeriesFromSeed } from '../battle/problemSeries/seedResolve.ts';
import {
  createProblemSeriesOverviewDisplay,
  createProblemSeriesOverviewEnemyGroupDisplay,
  type ProblemSeriesOverviewDisplay,
} from './problemSeriesOverviewViewModel.ts';
import * as stageEnemyCompositionPreview from './stageEnemyCompositionPreview.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';
const SERIES_A_ID = 'r12m_series_a';
const SERIES_B_ID = 'r12m_series_b';
const GENERATOR_VERSION = 'r12m-v1';

const DISPLAY_OUTPUT_KEYS = [
  'classDisplayName',
  'classId',
  'combatModuleDisplayName',
  'count',
  'scaleSummary',
  'selectedCombatModuleId',
] as const;

const FORBIDDEN_OUTPUT_KEYS = [
  'hasDifference',
  'hpScale',
  'atkScale',
  'defScale',
  'resScale',
  'scale',
  'problemClass',
  'problemClassification',
  'expectedDefeat',
  'connection',
  'connectionTag',
  'recommendation',
  'recommendedJudgment',
] as const;

const FORBIDDEN_DISPLAY_JSON_SUBSTRINGS = [
  SERIES_A_ID,
  GENERATOR_VERSION,
  'internalProblemClass',
  'expectedFailureModes',
  'connection',
  'operationConditions',
  '推奨編成',
  '推奨撃破順',
] as const;

const FORBIDDEN_DISPLAY_B_JSON_SUBSTRINGS = [
  SERIES_B_ID,
  GENERATOR_VERSION,
  'internalProblemClass',
  'expectedFailureModes',
  'connection',
  'operationConditions',
  'concentrated_pressure',
  'scattered_pressure',
  'concentrated_scattered_simultaneous_pressure',
  '推奨編成',
  '推奨撃破順',
] as const;

type ProblemSeriesOverviewDisplayProductionPath = {
  seriesId: string;
  snapshot: ReturnType<typeof createProblemSeriesOperationStartSnapshot>;
  named: ProblemSeriesOverviewNamed;
  display: ProblemSeriesOverviewDisplay;
  totalNamedGroups: number;
};

function runProblemSeriesOverviewDisplayProductionPath(
  catalog: Parameters<typeof resolveProblemSeriesFromSeed>[0],
  gameData: Parameters<typeof createProblemSeriesOverviewNamed>[1],
  seed: string,
): ProblemSeriesOverviewDisplayProductionPath {
  const result = resolveProblemSeriesFromSeed(catalog, seed);
  const snapshot = createProblemSeriesOperationStartSnapshot(result);
  const core = createProblemSeriesOverviewCore(snapshot);
  const named = createProblemSeriesOverviewNamed(core, gameData);
  const display = createProblemSeriesOverviewDisplay(named);
  const totalNamedGroups = named.waves.reduce(
    (sum, wave) => sum + wave.enemyGroups.length,
    0,
  );
  return {
    seriesId: result.series.seriesId,
    snapshot,
    named,
    display,
    totalNamedGroups,
  };
}

function projectDisplayWavesForComparison(display: ProblemSeriesOverviewDisplay) {
  return display.waves.map((wave) => ({
    waveNumber: wave.waveNumber,
    prepResourceGrant: wave.prepResourceGrant,
    enemyGroups: wave.enemyGroups.map((group) => ({
      classId: group.classId,
      count: group.count,
      selectedCombatModuleId: group.selectedCombatModuleId,
      scaleSummary: group.scaleSummary,
    })),
  }));
}

function assertDisplayMatchesNamedProductionPath(
  named: ProblemSeriesOverviewNamed,
  display: ProblemSeriesOverviewDisplay,
): number {
  const totalNamedGroups = named.waves.reduce(
    (sum, wave) => sum + wave.enemyGroups.length,
    0,
  );
  expect(totalNamedGroups).toBeGreaterThan(0);

  const totalDisplayGroups = display.waves.reduce(
    (sum, wave) => sum + wave.enemyGroups.length,
    0,
  );
  expect(totalDisplayGroups).toBe(totalNamedGroups);

  let inspectedGroupCount = 0;
  for (let waveIndex = 0; waveIndex < named.waves.length; waveIndex++) {
    const namedWave = named.waves[waveIndex]!;
    const displayWave = display.waves[waveIndex]!;

    expect(displayWave.waveNumber).toBe(namedWave.waveNumber);
    expect(displayWave.prepResourceGrant).toBe(namedWave.prepResourceGrant);
    expect(displayWave.enemyGroups.length).toBe(namedWave.enemyGroups.length);
    expect(displayWave.enemyGroups.length).toBeGreaterThan(0);

    for (
      let groupIndex = 0;
      groupIndex < namedWave.enemyGroups.length;
      groupIndex++
    ) {
      inspectedGroupCount += 1;
      const namedGroup = namedWave.enemyGroups[groupIndex]!;
      const displayGroup = displayWave.enemyGroups[groupIndex]!;
      const expectedGroup =
        createProblemSeriesOverviewEnemyGroupDisplay(namedGroup);

      expect(displayGroup).toEqual(expectedGroup);
    }
  }

  expect(inspectedGroupCount).toBe(totalNamedGroups);
  return inspectedGroupCount;
}

function createNamedGroup(
  scale: ProblemSeriesOverviewNamedEnemyGroup['scale'],
): ProblemSeriesOverviewNamedEnemyGroup {
  return {
    classId: 'df_guardian',
    classDisplayName: '鉄衛士',
    count: 2,
    selectedCombatModuleId: 'df_guardian_mod_nearest_strike',
    combatModuleDisplayName: '物理堅守',
    scale,
  };
}

function assertDisplayContract(
  group: ProblemSeriesOverviewNamedEnemyGroup,
  display: ReturnType<typeof createProblemSeriesOverviewEnemyGroupDisplay>,
  expectedScaleSummary: string,
): void {
  expect(display).toEqual({
    classId: 'df_guardian',
    classDisplayName: '鉄衛士',
    count: 2,
    selectedCombatModuleId: 'df_guardian_mod_nearest_strike',
    combatModuleDisplayName: '物理堅守',
    scaleSummary: expectedScaleSummary,
  });

  expect(Object.keys(display).sort()).toEqual([...DISPLAY_OUTPUT_KEYS]);
  expect(Object.keys(display)).toHaveLength(6);

  for (const key of FORBIDDEN_OUTPUT_KEYS) {
    expect(Object.prototype.hasOwnProperty.call(display, key)).toBe(false);
  }

  expect(display).not.toBe(group);
  expect(display).not.toBe(group.scale as unknown as typeof display);
}

describe('R12m createProblemSeriesOverviewEnemyGroupDisplay', () => {
  it('standard scale: keeps identity fields and yields empty scaleSummary via production formatter', () => {
    const group = createNamedGroup({
      hpScale: 1,
      atkScale: 1,
      defScale: 1,
      resScale: 1,
      hasDifference: false,
    });
    const groupBefore = structuredClone(group);
    const scaleBefore = structuredClone(group.scale);
    const scaleRef = group.scale;

    const formatSpy = vi.spyOn(
      stageEnemyCompositionPreview,
      'formatEnemyGroupScaleSummary',
    );

    const display = createProblemSeriesOverviewEnemyGroupDisplay(group);

    expect(formatSpy).toHaveBeenCalledTimes(1);
    expect(formatSpy).toHaveBeenCalledWith(group.scale);
    expect(formatSpy.mock.results[0]?.value).toBe('');

    assertDisplayContract(group, display, '');
    expect(group).toEqual(groupBefore);
    expect(group.scale).toBe(scaleRef);
    expect(group.scale).toEqual(scaleBefore);

    formatSpy.mockRestore();
  });

  it('non-standard scale: keeps identity fields and yields scaleSummary via production formatter', () => {
    const group = createNamedGroup({
      hpScale: 1.5,
      atkScale: 2,
      defScale: 1,
      resScale: 1,
      hasDifference: true,
    });
    const groupBefore = structuredClone(group);
    const scaleBefore = structuredClone(group.scale);
    const scaleRef = group.scale;

    const formatSpy = vi.spyOn(
      stageEnemyCompositionPreview,
      'formatEnemyGroupScaleSummary',
    );

    const display = createProblemSeriesOverviewEnemyGroupDisplay(group);

    expect(formatSpy).toHaveBeenCalledTimes(1);
    expect(formatSpy).toHaveBeenCalledWith(group.scale);
    expect(formatSpy.mock.results[0]?.value).toBe(' (hp×1.5 atk×2)');

    assertDisplayContract(group, display, ' (hp×1.5 atk×2)');
    expect(group).toEqual(groupBefore);
    expect(group.scale).toBe(scaleRef);
    expect(group.scale).toEqual(scaleBefore);
    expect(group.scale.hasDifference).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(display, 'hasDifference')).toBe(
      false,
    );

    formatSpy.mockRestore();
  });
});

describe('R12m createProblemSeriesOverviewDisplay (fixture-a production path)', () => {
  it('fixture-a: tryLoadGameData → resolve → snapshot → core → named → display', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    expect(loaded.data.problemSeriesCatalog.series.length).toBeGreaterThan(0);

    const gameData = loaded.data;
    const catalog = gameData.problemSeriesCatalog;
    const result = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
    expect(result.series.seriesId).toBe(SERIES_A_ID);

    const snapshot = createProblemSeriesOperationStartSnapshot(result);
    expect(snapshot.waves).toHaveLength(3);

    const core = createProblemSeriesOverviewCore(snapshot);
    const named = createProblemSeriesOverviewNamed(core, gameData);
    expect(named.waves).toHaveLength(3);

    const namedBefore = structuredClone(named);
    const namedWavesRef = named.waves;
    const namedWaveRefs = named.waves.map((wave) => wave);
    const namedEnemyGroupsRefs = named.waves.map((wave) => wave.enemyGroups);
    const namedGroupRefs = named.waves.flatMap((wave) => [...wave.enemyGroups]);
    const namedScaleRefs = namedGroupRefs.map((group) => group.scale);

    const totalNamedGroups = namedGroupRefs.length;
    expect(totalNamedGroups).toBeGreaterThan(0);

    const display = createProblemSeriesOverviewDisplay(named);

    expect(display.seed).toBe('fixture-a');
    expect(display.waves).toHaveLength(3);
    expect(display.waves.map((wave) => wave.waveNumber)).toEqual([1, 2, 3]);

    expect(Object.keys(display).sort()).toEqual(['seed', 'waves']);

    const totalDisplayGroups = display.waves.reduce(
      (sum, wave) => sum + wave.enemyGroups.length,
      0,
    );
    expect(totalDisplayGroups).toBeGreaterThan(0);
    expect(totalDisplayGroups).toBe(totalNamedGroups);

    const seenDisplayGroups = new Set<object>();
    for (let waveIndex = 0; waveIndex < named.waves.length; waveIndex++) {
      const namedWave = named.waves[waveIndex]!;
      const displayWave = display.waves[waveIndex]!;

      expect(Object.keys(displayWave).sort()).toEqual([
        'enemyGroups',
        'prepResourceGrant',
        'waveNumber',
      ]);
      expect(displayWave.waveNumber).toBe(namedWave.waveNumber);
      expect(displayWave.prepResourceGrant).toBe(namedWave.prepResourceGrant);
      expect(displayWave.enemyGroups.length).toBe(namedWave.enemyGroups.length);
      expect(displayWave.enemyGroups.length).toBeGreaterThan(0);

      expect(displayWave).not.toBe(namedWave);
      expect(displayWave.enemyGroups).not.toBe(namedWave.enemyGroups);

      for (
        let groupIndex = 0;
        groupIndex < namedWave.enemyGroups.length;
        groupIndex++
      ) {
        const namedGroup = namedWave.enemyGroups[groupIndex]!;
        const displayGroup = displayWave.enemyGroups[groupIndex]!;
        const expectedGroup =
          createProblemSeriesOverviewEnemyGroupDisplay(namedGroup);

        expect(Object.keys(displayGroup).sort()).toEqual([...DISPLAY_OUTPUT_KEYS]);
        expect(displayGroup).toEqual(expectedGroup);
        expect(displayGroup).not.toBe(namedGroup);
        expect(displayGroup).not.toBe(expectedGroup);
        expect(seenDisplayGroups.has(displayGroup)).toBe(false);
        seenDisplayGroups.add(displayGroup);
      }
    }
    expect(seenDisplayGroups.size).toBe(totalDisplayGroups);

    expect(display.waves).not.toBe(named.waves);
    for (let waveIndex = 0; waveIndex < named.waves.length; waveIndex++) {
      expect(display.waves[waveIndex]).not.toBe(named.waves[waveIndex]);
      expect(display.waves[waveIndex]!.enemyGroups).not.toBe(
        named.waves[waveIndex]!.enemyGroups,
      );
    }

    expect(named).toEqual(namedBefore);
    expect(named.waves).toBe(namedWavesRef);
    for (let waveIndex = 0; waveIndex < named.waves.length; waveIndex++) {
      expect(named.waves[waveIndex]).toBe(namedWaveRefs[waveIndex]);
      expect(named.waves[waveIndex]!.enemyGroups).toBe(
        namedEnemyGroupsRefs[waveIndex],
      );
    }
    for (let groupIndex = 0; groupIndex < namedGroupRefs.length; groupIndex++) {
      expect(namedGroupRefs[groupIndex]!.scale).toBe(namedScaleRefs[groupIndex]);
    }
    let flatIndex = 0;
    for (const wave of named.waves) {
      for (const group of wave.enemyGroups) {
        expect(group).toBe(namedGroupRefs[flatIndex]);
        flatIndex += 1;
      }
    }

    const json = JSON.stringify(display);
    for (const forbidden of FORBIDDEN_DISPLAY_JSON_SUBSTRINGS) {
      expect(json).not.toContain(forbidden);
    }
  });
});

describe('R12m createProblemSeriesOverviewDisplay (fixture-a vs fixture-b production path)', () => {
  it('fixture-a and fixture-b: tryLoadGameData → resolve → snapshot → core → named → display', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    expect(loaded.data.problemSeriesCatalog.series.length).toBeGreaterThan(0);

    const gameData = loaded.data;
    const catalog = gameData.problemSeriesCatalog;

    const pathA = runProblemSeriesOverviewDisplayProductionPath(
      catalog,
      gameData,
      FIXTURE_SEED_A,
    );
    const pathB = runProblemSeriesOverviewDisplayProductionPath(
      catalog,
      gameData,
      FIXTURE_SEED_B,
    );

    expect(pathA.seriesId).toBe(SERIES_A_ID);
    expect(pathB.seriesId).toBe(SERIES_B_ID);
    expect(pathA.seriesId).not.toBe(pathB.seriesId);

    expect(pathA.snapshot.waves).toHaveLength(3);
    expect(pathB.snapshot.waves).toHaveLength(3);

    expect(pathA.named.waves).toHaveLength(3);
    expect(pathB.named.waves).toHaveLength(3);

    expect(pathA.display.seed).toBe(FIXTURE_SEED_A);
    expect(pathB.display.seed).toBe(FIXTURE_SEED_B);
    expect(pathA.display.waves).toHaveLength(3);
    expect(pathB.display.waves).toHaveLength(3);
    expect(pathA.display.waves.map((wave) => wave.waveNumber)).toEqual([1, 2, 3]);
    expect(pathB.display.waves.map((wave) => wave.waveNumber)).toEqual([1, 2, 3]);

    expect(pathA.totalNamedGroups).toBeGreaterThan(0);
    expect(pathB.totalNamedGroups).toBeGreaterThan(0);

    const inspectedGroupsA = assertDisplayMatchesNamedProductionPath(
      pathA.named,
      pathA.display,
    );
    const inspectedGroupsB = assertDisplayMatchesNamedProductionPath(
      pathB.named,
      pathB.display,
    );

    expect(inspectedGroupsA).toBe(pathA.totalNamedGroups);
    expect(inspectedGroupsB).toBe(pathB.totalNamedGroups);

    const projectedWavesA = projectDisplayWavesForComparison(pathA.display);
    const projectedWavesB = projectDisplayWavesForComparison(pathB.display);
    expect(projectedWavesA).not.toEqual(projectedWavesB);

    const jsonB = JSON.stringify(pathB.display);
    for (const forbidden of FORBIDDEN_DISPLAY_B_JSON_SUBSTRINGS) {
      expect(jsonB).not.toContain(forbidden);
    }
  });
});
