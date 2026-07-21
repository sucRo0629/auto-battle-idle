import { describe, expect, it } from 'vitest';
import { tryLoadGameData } from '../data/loadGameData.ts';
import { createProblemSeriesOperationStartSnapshot } from './operationStartSnapshot.ts';
import {
  createProblemSeriesOverviewCore,
  createProblemSeriesOverviewNamed,
  type ProblemSeriesOverviewNamed,
} from './overviewViewModel.ts';
import { resolveProblemSeriesFromSeed } from './seedResolve.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';
const SERIES_A_ID = 'r12m_series_a';
const SERIES_B_ID = 'r12m_series_b';
const GENERATOR_VERSION = 'r12m-v1';
const UNKNOWN_CLASS_ID = 'r12m_unknown_class';
const UNKNOWN_MODULE_ID = 'r12m_unknown_combat_module';

const SERIES_A_INTERNAL_CLASS_STRINGS = [
  'single_protection',
  'multi_protection',
  'protection_scatter_pressure_composite',
] as const;

const SERIES_B_INTERNAL_CLASS_STRINGS = [
  'concentrated_pressure',
  'scattered_pressure',
  'concentrated_scattered_simultaneous_pressure',
] as const;

const FORBIDDEN_NAMED_KEYS = [
  'seriesId',
  'generatorVersion',
  'internalProblemClass',
  'expectedFailureModes',
  'connection',
  'waveLinks',
  'waveRelationSummary',
  'allowedClassIds',
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

function expectNamedOverviewShapeOnly(named: ProblemSeriesOverviewNamed): void {
  expect(Object.keys(named).sort()).toEqual(['seed', 'waves'].sort());
  for (const forbidden of FORBIDDEN_NAMED_KEYS) {
    expect(named).not.toHaveProperty(forbidden);
  }

  for (const wave of named.waves) {
    expect(Object.keys(wave).sort()).toEqual(
      ['enemyGroups', 'prepResourceGrant', 'waveNumber'].sort(),
    );
    for (const forbidden of FORBIDDEN_NAMED_KEYS) {
      expect(wave).not.toHaveProperty(forbidden);
    }

    for (const group of wave.enemyGroups) {
      expect(Object.keys(group).sort()).toEqual(
        [
          'classDisplayName',
          'classId',
          'combatModuleDisplayName',
          'count',
          'selectedCombatModuleId',
        ].sort(),
      );
      for (const forbidden of FORBIDDEN_NAMED_KEYS) {
        expect(group).not.toHaveProperty(forbidden);
      }
    }
  }
}

describe('R12m createProblemSeriesOverviewNamed (fixture-a production path)', () => {
  it('fixture-a: tryLoadGameData → resolve → snapshot → core → named', () => {
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

    const totalSnapshotGroups = snapshot.waves.reduce(
      (sum, wave) => sum + wave.enemyGroups.length,
      0,
    );
    expect(totalSnapshotGroups).toBeGreaterThan(0);

    const core = createProblemSeriesOverviewCore(snapshot);
    expect(core.waves).toHaveLength(3);

    const totalCoreGroups = core.waves.reduce(
      (sum, wave) => sum + wave.enemyGroups.length,
      0,
    );
    expect(totalCoreGroups).toBeGreaterThan(0);

    const named = createProblemSeriesOverviewNamed(core, gameData);

    expect(named.seed).toBe('fixture-a');
    expect(named.waves).toHaveLength(3);
    expect(named.waves.map((wave) => wave.waveNumber)).toEqual([1, 2, 3]);

    let totalNamedGroups = 0;
    for (let waveIndex = 0; waveIndex < core.waves.length; waveIndex++) {
      const coreWave = core.waves[waveIndex]!;
      const namedWave = named.waves[waveIndex]!;

      expect(namedWave.enemyGroups.length).toBeGreaterThan(0);
      expect(namedWave.enemyGroups.length).toBe(coreWave.enemyGroups.length);
      expect(namedWave.prepResourceGrant).toBe(coreWave.prepResourceGrant);
      expect(namedWave.waveNumber).toBe(coreWave.waveNumber);

      for (let groupIndex = 0; groupIndex < coreWave.enemyGroups.length; groupIndex++) {
        totalNamedGroups += 1;
        const coreGroup = coreWave.enemyGroups[groupIndex]!;
        const namedGroup = namedWave.enemyGroups[groupIndex]!;

        expect(namedGroup.classId).toBe(coreGroup.classId);
        expect(namedGroup.count).toBe(coreGroup.count);
        expect(namedGroup.count).toBeGreaterThan(0);
        expect(namedGroup.selectedCombatModuleId).toBe(coreGroup.selectedCombatModuleId);
        expect(namedGroup.selectedCombatModuleId.length).toBeGreaterThan(0);

        expect(namedGroup.classDisplayName.length).toBeGreaterThan(0);
        expect(namedGroup.combatModuleDisplayName.length).toBeGreaterThan(0);
        expect(namedGroup.classDisplayName).toBe(
          gameData.classRegistry[coreGroup.classId as keyof typeof gameData.classRegistry]!
            .displayName,
        );
        expect(namedGroup.combatModuleDisplayName).toBe(
          gameData.combatModuleRegistry[coreGroup.selectedCombatModuleId]!.displayName,
        );
      }
    }
    expect(totalNamedGroups).toBeGreaterThan(0);
    expect(totalNamedGroups).toBe(totalCoreGroups);

    expect(named.waves).not.toBe(core.waves);
    for (let waveIndex = 0; waveIndex < core.waves.length; waveIndex++) {
      expect(named.waves[waveIndex]).not.toBe(core.waves[waveIndex]);
      expect(named.waves[waveIndex]!.enemyGroups).not.toBe(core.waves[waveIndex]!.enemyGroups);
      const groupCount = core.waves[waveIndex]!.enemyGroups.length;
      for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
        expect(named.waves[waveIndex]!.enemyGroups[groupIndex]).not.toBe(
          core.waves[waveIndex]!.enemyGroups[groupIndex],
        );
      }
    }

    expectNamedOverviewShapeOnly(named);

    const json = JSON.stringify(named);
    expect(json).not.toContain(SERIES_A_ID);
    expect(json).not.toContain(GENERATOR_VERSION);
    for (const internalClass of SERIES_A_INTERNAL_CLASS_STRINGS) {
      expect(json).not.toContain(internalClass);
    }
  });

  it('fixture-a: unknown classId is rejected without displayName fallback', () => {
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
    const core = createProblemSeriesOverviewCore(snapshot);
    expect(core.waves).toHaveLength(3);

    const totalCoreGroups = core.waves.reduce(
      (sum, wave) => sum + wave.enemyGroups.length,
      0,
    );
    expect(totalCoreGroups).toBeGreaterThan(0);
    expect(core.waves[0]!.enemyGroups.length).toBeGreaterThan(0);

    const originalFirstGroup = core.waves[0]!.enemyGroups[0]!;
    expect(originalFirstGroup.classId.length).toBeGreaterThan(0);
    expect(
      gameData.classRegistry[UNKNOWN_CLASS_ID as keyof typeof gameData.classRegistry],
    ).toBeUndefined();

    const coreSnapshotBefore = {
      seed: core.seed,
      waves: core.waves.map((wave) => ({
        waveNumber: wave.waveNumber,
        prepResourceGrant: wave.prepResourceGrant,
        enemyGroups: wave.enemyGroups.map((group) => ({
          classId: group.classId,
          count: group.count,
          selectedCombatModuleId: group.selectedCombatModuleId,
          scale: { ...group.scale },
        })),
      })),
    };

    const corruptedCore = {
      seed: core.seed,
      waves: core.waves.map((wave, waveIndex) => ({
        waveNumber: wave.waveNumber,
        prepResourceGrant: wave.prepResourceGrant,
        enemyGroups: wave.enemyGroups.map((group, groupIndex) =>
          waveIndex === 0 && groupIndex === 0
            ? {
                classId: UNKNOWN_CLASS_ID,
                count: group.count,
                selectedCombatModuleId: group.selectedCombatModuleId,
                scale: { ...group.scale },
              }
            : {
                classId: group.classId,
                count: group.count,
                selectedCombatModuleId: group.selectedCombatModuleId,
                scale: { ...group.scale },
              },
        ),
      })),
    };

    expect(corruptedCore.waves[0]!.enemyGroups[0]!.classId).toBe(UNKNOWN_CLASS_ID);
    expect(corruptedCore.waves[0]!.enemyGroups[0]!.selectedCombatModuleId).toBe(
      originalFirstGroup.selectedCombatModuleId,
    );
    expect(corruptedCore.waves[0]!.enemyGroups[0]!.selectedCombatModuleId.length).toBeGreaterThan(
      0,
    );

    for (let waveIndex = 0; waveIndex < corruptedCore.waves.length; waveIndex++) {
      const corruptedWave = corruptedCore.waves[waveIndex]!;
      const originalWave = core.waves[waveIndex]!;
      for (let groupIndex = 0; groupIndex < corruptedWave.enemyGroups.length; groupIndex++) {
        const corruptedGroup = corruptedWave.enemyGroups[groupIndex]!;
        const originalGroup = originalWave.enemyGroups[groupIndex]!;
        expect(corruptedGroup.scale).toEqual(originalGroup.scale);
        expect(corruptedGroup.scale).not.toBe(originalGroup.scale);
        if (waveIndex === 0 && groupIndex === 0) {
          expect(corruptedGroup.classId).toBe(UNKNOWN_CLASS_ID);
          expect(corruptedGroup.selectedCombatModuleId).toBe(originalGroup.selectedCombatModuleId);
          continue;
        }
        expect(corruptedGroup.classId).toBe(originalGroup.classId);
        expect(corruptedGroup.classId).not.toBe(UNKNOWN_CLASS_ID);
        expect(corruptedGroup.selectedCombatModuleId).toBe(originalGroup.selectedCombatModuleId);
      }
    }

    expect(core.waves[0]!.enemyGroups[0]!.classId).toBe(originalFirstGroup.classId);
    expect(core.waves[0]!.enemyGroups[0]!.classId).not.toBe(UNKNOWN_CLASS_ID);
    expect(core).toEqual(coreSnapshotBefore);

    let thrown: unknown;
    try {
      createProblemSeriesOverviewNamed(corruptedCore, gameData);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('unknown classId');
    expect(message).toContain(UNKNOWN_CLASS_ID);
    // throw するため unknown ID を classDisplayName へ fallback しない

    expect(core).toEqual(coreSnapshotBefore);
    expect(core.waves[0]!.enemyGroups[0]!.classId).toBe(originalFirstGroup.classId);
  });

  it('fixture-a: unknown combatModuleId is rejected without displayName fallback', () => {
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
    const core = createProblemSeriesOverviewCore(snapshot);
    expect(core.waves).toHaveLength(3);

    const totalCoreGroups = core.waves.reduce(
      (sum, wave) => sum + wave.enemyGroups.length,
      0,
    );
    expect(totalCoreGroups).toBeGreaterThan(0);
    expect(core.waves[0]!.enemyGroups.length).toBeGreaterThan(0);

    const originalFirstGroup = core.waves[0]!.enemyGroups[0]!;
    expect(originalFirstGroup.selectedCombatModuleId.length).toBeGreaterThan(0);
    expect(gameData.combatModuleRegistry[UNKNOWN_MODULE_ID]).toBeUndefined();
    expect(
      gameData.classRegistry[originalFirstGroup.classId as keyof typeof gameData.classRegistry],
    ).toBeDefined();

    const coreSnapshotBefore = {
      seed: core.seed,
      waves: core.waves.map((wave) => ({
        waveNumber: wave.waveNumber,
        prepResourceGrant: wave.prepResourceGrant,
        enemyGroups: wave.enemyGroups.map((group) => ({
          classId: group.classId,
          count: group.count,
          selectedCombatModuleId: group.selectedCombatModuleId,
          scale: { ...group.scale },
        })),
      })),
    };

    const corruptedCore = {
      seed: core.seed,
      waves: core.waves.map((wave, waveIndex) => ({
        waveNumber: wave.waveNumber,
        prepResourceGrant: wave.prepResourceGrant,
        enemyGroups: wave.enemyGroups.map((group, groupIndex) =>
          waveIndex === 0 && groupIndex === 0
            ? {
                classId: group.classId,
                count: group.count,
                selectedCombatModuleId: UNKNOWN_MODULE_ID,
                scale: { ...group.scale },
              }
            : {
                classId: group.classId,
                count: group.count,
                selectedCombatModuleId: group.selectedCombatModuleId,
                scale: { ...group.scale },
              },
        ),
      })),
    };

    expect(corruptedCore.waves[0]!.enemyGroups[0]!.selectedCombatModuleId).toBe(UNKNOWN_MODULE_ID);
    expect(corruptedCore.waves[0]!.enemyGroups[0]!.classId).toBe(originalFirstGroup.classId);
    expect(corruptedCore.waves[0]!.enemyGroups[0]!.classId.length).toBeGreaterThan(0);

    for (let waveIndex = 0; waveIndex < corruptedCore.waves.length; waveIndex++) {
      const corruptedWave = corruptedCore.waves[waveIndex]!;
      const originalWave = core.waves[waveIndex]!;
      for (let groupIndex = 0; groupIndex < corruptedWave.enemyGroups.length; groupIndex++) {
        const corruptedGroup = corruptedWave.enemyGroups[groupIndex]!;
        const originalGroup = originalWave.enemyGroups[groupIndex]!;
        expect(corruptedGroup.scale).toEqual(originalGroup.scale);
        expect(corruptedGroup.scale).not.toBe(originalGroup.scale);
        if (waveIndex === 0 && groupIndex === 0) {
          expect(corruptedGroup.selectedCombatModuleId).toBe(UNKNOWN_MODULE_ID);
          expect(corruptedGroup.classId).toBe(originalGroup.classId);
          continue;
        }
        expect(corruptedGroup.selectedCombatModuleId).toBe(originalGroup.selectedCombatModuleId);
        expect(corruptedGroup.selectedCombatModuleId).not.toBe(UNKNOWN_MODULE_ID);
        expect(corruptedGroup.classId).toBe(originalGroup.classId);
      }
    }

    expect(core.waves[0]!.enemyGroups[0]!.selectedCombatModuleId).toBe(
      originalFirstGroup.selectedCombatModuleId,
    );
    expect(core.waves[0]!.enemyGroups[0]!.selectedCombatModuleId).not.toBe(UNKNOWN_MODULE_ID);
    expect(core).toEqual(coreSnapshotBefore);

    let thrown: unknown;
    try {
      createProblemSeriesOverviewNamed(corruptedCore, gameData);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('unknown combatModuleId');
    expect(message).toContain(UNKNOWN_MODULE_ID);
    // throw するため unknown ID を combatModuleDisplayName へ fallback しない

    expect(core).toEqual(coreSnapshotBefore);
    expect(core.waves[0]!.enemyGroups[0]!.selectedCombatModuleId).toBe(
      originalFirstGroup.selectedCombatModuleId,
    );
  });
});

describe('R12m createProblemSeriesOverviewNamed (fixture-b production path)', () => {
  it('fixture-b: tryLoadGameData → resolve → snapshot → core → named', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    expect(loaded.data.problemSeriesCatalog.series.length).toBeGreaterThan(0);

    const gameData = loaded.data;
    const catalog = gameData.problemSeriesCatalog;
    const result = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_B);
    expect(result.series.seriesId).toBe(SERIES_B_ID);

    const snapshot = createProblemSeriesOperationStartSnapshot(result);
    expect(snapshot.waves).toHaveLength(3);

    const totalSnapshotGroups = snapshot.waves.reduce(
      (sum, wave) => sum + wave.enemyGroups.length,
      0,
    );
    expect(totalSnapshotGroups).toBeGreaterThan(0);

    const core = createProblemSeriesOverviewCore(snapshot);
    expect(core.waves).toHaveLength(3);

    const totalCoreGroups = core.waves.reduce(
      (sum, wave) => sum + wave.enemyGroups.length,
      0,
    );
    expect(totalCoreGroups).toBeGreaterThan(0);

    const named = createProblemSeriesOverviewNamed(core, gameData);

    expect(named.seed).toBe('fixture-b');
    expect(named.waves).toHaveLength(3);
    expect(named.waves.map((wave) => wave.waveNumber)).toEqual([1, 2, 3]);

    let totalNamedGroups = 0;
    for (let waveIndex = 0; waveIndex < core.waves.length; waveIndex++) {
      const coreWave = core.waves[waveIndex]!;
      const namedWave = named.waves[waveIndex]!;

      expect(namedWave.enemyGroups.length).toBeGreaterThan(0);
      expect(namedWave.enemyGroups.length).toBe(coreWave.enemyGroups.length);
      expect(namedWave.prepResourceGrant).toBe(coreWave.prepResourceGrant);
      expect(namedWave.waveNumber).toBe(coreWave.waveNumber);

      for (let groupIndex = 0; groupIndex < coreWave.enemyGroups.length; groupIndex++) {
        totalNamedGroups += 1;
        const coreGroup = coreWave.enemyGroups[groupIndex]!;
        const namedGroup = namedWave.enemyGroups[groupIndex]!;

        expect(namedGroup.classId).toBe(coreGroup.classId);
        expect(namedGroup.count).toBe(coreGroup.count);
        expect(namedGroup.count).toBeGreaterThan(0);
        expect(namedGroup.selectedCombatModuleId).toBe(coreGroup.selectedCombatModuleId);
        expect(namedGroup.selectedCombatModuleId.length).toBeGreaterThan(0);

        expect(namedGroup.classDisplayName.length).toBeGreaterThan(0);
        expect(namedGroup.combatModuleDisplayName.length).toBeGreaterThan(0);
        expect(namedGroup.classDisplayName).toBe(
          gameData.classRegistry[coreGroup.classId as keyof typeof gameData.classRegistry]!
            .displayName,
        );
        expect(namedGroup.combatModuleDisplayName).toBe(
          gameData.combatModuleRegistry[coreGroup.selectedCombatModuleId]!.displayName,
        );
      }
    }
    expect(totalNamedGroups).toBeGreaterThan(0);
    expect(totalNamedGroups).toBe(totalCoreGroups);

    expect(named.waves).not.toBe(core.waves);
    for (let waveIndex = 0; waveIndex < core.waves.length; waveIndex++) {
      expect(named.waves[waveIndex]).not.toBe(core.waves[waveIndex]);
      expect(named.waves[waveIndex]!.enemyGroups).not.toBe(core.waves[waveIndex]!.enemyGroups);
      const groupCount = core.waves[waveIndex]!.enemyGroups.length;
      for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
        expect(named.waves[waveIndex]!.enemyGroups[groupIndex]).not.toBe(
          core.waves[waveIndex]!.enemyGroups[groupIndex],
        );
      }
    }

    expectNamedOverviewShapeOnly(named);

    const json = JSON.stringify(named);
    expect(json).not.toContain(SERIES_B_ID);
    expect(json).not.toContain(GENERATOR_VERSION);
    for (const internalClass of SERIES_B_INTERNAL_CLASS_STRINGS) {
      expect(json).not.toContain(internalClass);
    }
  });
});
