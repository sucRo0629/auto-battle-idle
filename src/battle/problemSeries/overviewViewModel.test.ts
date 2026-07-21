import { describe, expect, it } from 'vitest';
import { tryLoadGameData } from '../data/loadGameData.ts';
import { createProblemSeriesOperationStartSnapshot } from './operationStartSnapshot.ts';
import { createProblemSeriesOverviewScale } from './overviewScale.ts';
import {
  createProblemSeriesOverviewCore,
  type ProblemSeriesOverviewCore,
} from './overviewViewModel.ts';
import { resolveProblemSeriesFromSeed } from './seedResolve.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';
const SERIES_A_ID = 'r12m_series_a';
const SERIES_B_ID = 'r12m_series_b';
const GENERATOR_VERSION = 'r12m-v1';

const FORBIDDEN_OVERVIEW_KEYS = [
  'seriesId',
  'generatorVersion',
  'internalProblemClass',
  'expectedFailureModes',
  'connection',
  'waveLinks',
  'waveRelationSummary',
  'allowedClassIds',
  'displayName',
  'recommendedLevel',
  'formationHintJa',
  'operationConditions',
  'hpScale',
  'atkScale',
  'defScale',
  'resScale',
  'id',
  'series',
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
  'finalWaveCompositeOf',
  'unlockClassIdsOnClear',
] as const;

/** 系列 A wave 0 の internalProblemClass（JSON 非露出 assertion 用） */
const SERIES_A_INTERNAL_CLASS_STRINGS = [
  'single_protection',
  'multi_protection',
  'protection_scatter_pressure_composite',
] as const;

/** 系列 B の internalProblemClass（JSON 非露出 assertion 用） */
const SERIES_B_INTERNAL_CLASS_STRINGS = [
  'concentrated_pressure',
  'scattered_pressure',
  'concentrated_scattered_simultaneous_pressure',
] as const;

function expectOverviewShapeOnly(overview: ProblemSeriesOverviewCore): void {
  expect(Object.keys(overview).sort()).toEqual(['seed', 'waves'].sort());
  for (const forbidden of FORBIDDEN_OVERVIEW_KEYS) {
    expect(overview).not.toHaveProperty(forbidden);
  }

  for (const wave of overview.waves) {
    expect(Object.keys(wave).sort()).toEqual(
      ['enemyGroups', 'prepResourceGrant', 'waveNumber'].sort(),
    );
    for (const forbidden of FORBIDDEN_OVERVIEW_KEYS) {
      expect(wave).not.toHaveProperty(forbidden);
    }

    for (const group of wave.enemyGroups) {
      expect(Object.keys(group).sort()).toEqual(
        ['classId', 'count', 'scale', 'selectedCombatModuleId'].sort(),
      );
      expect(Object.keys(group.scale).sort()).toEqual(
        ['atkScale', 'defScale', 'hasDifference', 'hpScale', 'resScale'].sort(),
      );
      for (const forbidden of FORBIDDEN_OVERVIEW_KEYS) {
        expect(group).not.toHaveProperty(forbidden);
      }
    }
  }
}

describe('R12m createProblemSeriesOverviewCore (fixture-a production path)', () => {
  it('fixture-a: tryLoadGameData → resolve → snapshot → overview core', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    expect(loaded.data.problemSeriesCatalog.series.length).toBeGreaterThan(0);

    const catalog = loaded.data.problemSeriesCatalog;
    const result = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
    expect(result.series.seriesId).toBe(SERIES_A_ID);

    const snapshot = createProblemSeriesOperationStartSnapshot(result);
    expect(snapshot.waves).toHaveLength(3);

    const totalSnapshotGroups = snapshot.waves.reduce(
      (sum, wave) => sum + wave.enemyGroups.length,
      0,
    );
    expect(totalSnapshotGroups).toBeGreaterThan(0);

    const overview = createProblemSeriesOverviewCore(snapshot);

    expect(overview.seed).toBe('fixture-a');
    expect(overview.waves).toHaveLength(3);
    expect(overview.waves.map((wave) => wave.waveNumber)).toEqual([1, 2, 3]);

    let totalOverviewGroups = 0;
    for (let waveIndex = 0; waveIndex < snapshot.waves.length; waveIndex++) {
      const snapshotWave = snapshot.waves[waveIndex]!;
      const overviewWave = overview.waves[waveIndex]!;

      expect(overviewWave.enemyGroups.length).toBeGreaterThan(0);
      expect(overviewWave.enemyGroups.length).toBe(snapshotWave.enemyGroups.length);
      expect(overviewWave.prepResourceGrant).toBe(snapshotWave.prepResourceGrant);
      expect(overviewWave.waveNumber).toBe(waveIndex + 1);

      for (
        let groupIndex = 0;
        groupIndex < snapshotWave.enemyGroups.length;
        groupIndex++
      ) {
        totalOverviewGroups += 1;
        const snapshotGroup = snapshotWave.enemyGroups[groupIndex]!;
        const overviewGroup = overviewWave.enemyGroups[groupIndex]!;

        expect(overviewGroup.classId).toBe(snapshotGroup.classId);
        expect(overviewGroup.count).toBe(snapshotGroup.count);
        expect(overviewGroup.count).toBeGreaterThan(0);
        expect(overviewGroup.selectedCombatModuleId).toBe(
          snapshotGroup.selectedCombatModuleId,
        );
        expect(overviewGroup.selectedCombatModuleId.length).toBeGreaterThan(0);
        expect(overviewGroup.scale).toBeDefined();
        expect(overviewGroup.scale).toEqual(
          createProblemSeriesOverviewScale(snapshotGroup),
        );
      }
    }
    expect(totalOverviewGroups).toBeGreaterThan(0);
    expect(totalOverviewGroups).toBe(totalSnapshotGroups);

    expect(overview.waves).not.toBe(snapshot.waves);
    const seenScaleObjects = new Set<object>();
    for (let waveIndex = 0; waveIndex < snapshot.waves.length; waveIndex++) {
      expect(overview.waves[waveIndex]).not.toBe(snapshot.waves[waveIndex]);
      expect(overview.waves[waveIndex]!.enemyGroups).not.toBe(
        snapshot.waves[waveIndex]!.enemyGroups,
      );
      const groupCount = snapshot.waves[waveIndex]!.enemyGroups.length;
      for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
        const overviewGroup = overview.waves[waveIndex]!.enemyGroups[groupIndex]!;
        expect(overviewGroup).not.toBe(
          snapshot.waves[waveIndex]!.enemyGroups[groupIndex],
        );
        expect(seenScaleObjects.has(overviewGroup.scale)).toBe(false);
        seenScaleObjects.add(overviewGroup.scale);
      }
    }
    expect(seenScaleObjects.size).toBe(totalOverviewGroups);

    expectOverviewShapeOnly(overview);

    const json = JSON.stringify(overview);
    expect(json).not.toContain(SERIES_A_ID);
    expect(json).not.toContain(GENERATOR_VERSION);
    for (const internalClass of SERIES_A_INTERNAL_CLASS_STRINGS) {
      expect(json).not.toContain(internalClass);
    }
  });
});

describe('R12m createProblemSeriesOverviewCore (fixture-b production path)', () => {
  it('fixture-b: tryLoadGameData → resolve → snapshot → overview core', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    expect(loaded.data.problemSeriesCatalog.series.length).toBeGreaterThan(0);

    const catalog = loaded.data.problemSeriesCatalog;
    const result = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_B);
    expect(result.series.seriesId).toBe(SERIES_B_ID);

    const snapshot = createProblemSeriesOperationStartSnapshot(result);
    expect(snapshot.waves).toHaveLength(3);

    const totalSnapshotGroups = snapshot.waves.reduce(
      (sum, wave) => sum + wave.enemyGroups.length,
      0,
    );
    expect(totalSnapshotGroups).toBeGreaterThan(0);

    const overview = createProblemSeriesOverviewCore(snapshot);

    expect(overview.seed).toBe('fixture-b');
    expect(overview.waves).toHaveLength(3);
    expect(overview.waves.map((wave) => wave.waveNumber)).toEqual([1, 2, 3]);

    let totalOverviewGroups = 0;
    for (let waveIndex = 0; waveIndex < snapshot.waves.length; waveIndex++) {
      const snapshotWave = snapshot.waves[waveIndex]!;
      const overviewWave = overview.waves[waveIndex]!;

      expect(overviewWave.enemyGroups.length).toBeGreaterThan(0);
      expect(overviewWave.enemyGroups.length).toBe(snapshotWave.enemyGroups.length);
      expect(overviewWave.prepResourceGrant).toBe(snapshotWave.prepResourceGrant);
      expect(overviewWave.waveNumber).toBe(waveIndex + 1);

      for (
        let groupIndex = 0;
        groupIndex < snapshotWave.enemyGroups.length;
        groupIndex++
      ) {
        totalOverviewGroups += 1;
        const snapshotGroup = snapshotWave.enemyGroups[groupIndex]!;
        const overviewGroup = overviewWave.enemyGroups[groupIndex]!;

        expect(overviewGroup.classId).toBe(snapshotGroup.classId);
        expect(overviewGroup.count).toBe(snapshotGroup.count);
        expect(overviewGroup.count).toBeGreaterThan(0);
        expect(overviewGroup.selectedCombatModuleId).toBe(
          snapshotGroup.selectedCombatModuleId,
        );
        expect(overviewGroup.selectedCombatModuleId.length).toBeGreaterThan(0);
        expect(overviewGroup.scale).toBeDefined();
        expect(overviewGroup.scale).toEqual(
          createProblemSeriesOverviewScale(snapshotGroup),
        );
      }
    }
    expect(totalOverviewGroups).toBeGreaterThan(0);
    expect(totalOverviewGroups).toBe(totalSnapshotGroups);

    expect(overview.waves).not.toBe(snapshot.waves);
    const seenScaleObjects = new Set<object>();
    for (let waveIndex = 0; waveIndex < snapshot.waves.length; waveIndex++) {
      expect(overview.waves[waveIndex]).not.toBe(snapshot.waves[waveIndex]);
      expect(overview.waves[waveIndex]!.enemyGroups).not.toBe(
        snapshot.waves[waveIndex]!.enemyGroups,
      );
      const groupCount = snapshot.waves[waveIndex]!.enemyGroups.length;
      for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
        const overviewGroup = overview.waves[waveIndex]!.enemyGroups[groupIndex]!;
        expect(overviewGroup).not.toBe(
          snapshot.waves[waveIndex]!.enemyGroups[groupIndex],
        );
        expect(seenScaleObjects.has(overviewGroup.scale)).toBe(false);
        seenScaleObjects.add(overviewGroup.scale);
      }
    }
    expect(seenScaleObjects.size).toBe(totalOverviewGroups);

    expectOverviewShapeOnly(overview);

    const json = JSON.stringify(overview);
    expect(json).not.toContain(SERIES_B_ID);
    expect(json).not.toContain(GENERATOR_VERSION);
    for (const internalClass of SERIES_B_INTERNAL_CLASS_STRINGS) {
      expect(json).not.toContain(internalClass);
    }
  });
});

describe('R12m createProblemSeriesOverviewCore (fixture-a vs fixture-b waves content)', () => {
  it('fixture-a and fixture-b: production path → overview waves differ in content', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    expect(loaded.data.problemSeriesCatalog.series.length).toBeGreaterThan(0);
    const catalog = loaded.data.problemSeriesCatalog;

    const resultA = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
    expect(resultA.series.seriesId).toBe(SERIES_A_ID);
    const snapshotA = createProblemSeriesOperationStartSnapshot(resultA);
    expect(snapshotA.waves).toHaveLength(3);
    const overviewA = createProblemSeriesOverviewCore(snapshotA);
    expect(overviewA.waves).toHaveLength(3);

    const resultB = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_B);
    expect(resultB.series.seriesId).toBe(SERIES_B_ID);
    const snapshotB = createProblemSeriesOperationStartSnapshot(resultB);
    expect(snapshotB.waves).toHaveLength(3);
    const overviewB = createProblemSeriesOverviewCore(snapshotB);
    expect(overviewB.waves).toHaveLength(3);

    let totalGroupsA = 0;
    for (const wave of overviewA.waves) {
      expect(wave.enemyGroups.length).toBeGreaterThan(0);
      for (const group of wave.enemyGroups) {
        totalGroupsA += 1;
        expect(group.count).toBeGreaterThan(0);
        expect(group.selectedCombatModuleId.length).toBeGreaterThan(0);
      }
    }
    expect(totalGroupsA).toBeGreaterThan(0);

    let totalGroupsB = 0;
    for (const wave of overviewB.waves) {
      expect(wave.enemyGroups.length).toBeGreaterThan(0);
      for (const group of wave.enemyGroups) {
        totalGroupsB += 1;
        expect(group.count).toBeGreaterThan(0);
        expect(group.selectedCombatModuleId.length).toBeGreaterThan(0);
      }
    }
    expect(totalGroupsB).toBeGreaterThan(0);

    expect(overviewA.seed).not.toBe(overviewB.seed);
    expect(overviewA.waves).not.toEqual(overviewB.waves);

    const waveContentDiffs: Array<{
      waveIndex: number;
      fields: Array<
        'classId' | 'count' | 'selectedCombatModuleId' | 'prepResourceGrant'
      >;
    }> = [];

    for (let waveIndex = 0; waveIndex < overviewA.waves.length; waveIndex++) {
      const waveA = overviewA.waves[waveIndex]!;
      const waveB = overviewB.waves[waveIndex]!;
      const fields: Array<
        'classId' | 'count' | 'selectedCombatModuleId' | 'prepResourceGrant'
      > = [];

      const classIdsA = waveA.enemyGroups.map((group) => group.classId);
      const classIdsB = waveB.enemyGroups.map((group) => group.classId);
      if (JSON.stringify(classIdsA) !== JSON.stringify(classIdsB)) {
        fields.push('classId');
      }

      const countsA = waveA.enemyGroups.map((group) => group.count);
      const countsB = waveB.enemyGroups.map((group) => group.count);
      if (JSON.stringify(countsA) !== JSON.stringify(countsB)) {
        fields.push('count');
      }

      const moduleIdsA = waveA.enemyGroups.map(
        (group) => group.selectedCombatModuleId,
      );
      const moduleIdsB = waveB.enemyGroups.map(
        (group) => group.selectedCombatModuleId,
      );
      if (JSON.stringify(moduleIdsA) !== JSON.stringify(moduleIdsB)) {
        fields.push('selectedCombatModuleId');
      }

      if (waveA.prepResourceGrant !== waveB.prepResourceGrant) {
        fields.push('prepResourceGrant');
      }

      if (fields.length > 0) {
        waveContentDiffs.push({ waveIndex, fields });
      }
    }

    expect(waveContentDiffs.length).toBeGreaterThan(0);
  });
});
