import { describe, expect, it } from 'vitest';
import { tryLoadGameData } from '../data/loadGameData.ts';
import { createProblemSeriesOperationStartSnapshot } from './operationStartSnapshot.ts';
import {
  createProblemSeriesOverviewCore,
  createProblemSeriesOverviewNamed,
  type ProblemSeriesOverviewNamedWave,
} from './overviewViewModel.ts';
import { resolveProblemSeriesFromSeed } from './seedResolve.ts';
import {
  createProblemSeriesWavePrepDisclosureContext,
  type ProblemSeriesWavePrepDisclosureContext,
} from './wavePrepDisclosure.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';
const SERIES_A_ID = 'r12m_series_a';
const SERIES_B_ID = 'r12m_series_b';
const GENERATOR_VERSION = 'r12m-v1';

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

const FORBIDDEN_CONTEXT_KEYS = [
  'seed',
  'generatorVersion',
  'seriesId',
  'allowedClassIds',
  'internalProblemClass',
  'expectedFailureModes',
  'connection',
  'waveLinks',
  'waveRelationSummary',
  'finalWaveCompositeOf',
  'stageDef',
  'stageId',
  'party',
  'combatant',
  'combatants',
  'checkpoint',
  'save',
  'saveData',
  'waves',
  'displayName',
  'recommendedLevel',
  'formationHintJa',
  'id',
  'series',
  'enemies',
  'selectedCombatModuleIds',
  'combatModuleSelection',
  'operationPassives',
  'passives',
  'remainingPoints',
  'operationPoints',
  'prepResourceRemaining',
  'currentWaveIndex',
  'waveIndex',
  'selectionIndex',
  'selectionHash',
  'unlockClassIdsOnClear',
] as const;

const FORBIDDEN_WAVE_KEYS = [
  'seed',
  'generatorVersion',
  'seriesId',
  'allowedClassIds',
  'internalProblemClass',
  'expectedFailureModes',
  'connection',
  'waveLinks',
  'waveRelationSummary',
  'finalWaveCompositeOf',
  'stageDef',
  'stageId',
  'party',
  'combatant',
  'combatants',
  'checkpoint',
  'save',
  'saveData',
  'displayName',
  'recommendedLevel',
  'formationHintJa',
  'id',
  'series',
  'enemies',
  'selectedCombatModuleIds',
  'combatModuleSelection',
  'operationPassives',
  'passives',
  'remainingPoints',
  'operationPoints',
  'prepResourceRemaining',
  'currentWaveIndex',
  'waveIndex',
  'selectionIndex',
  'selectionHash',
  'unlockClassIdsOnClear',
  'operationConditions',
] as const;

function expectNamedWaveShapeOnly(wave: ProblemSeriesOverviewNamedWave): void {
  expect(Object.keys(wave).sort()).toEqual(
    ['enemyGroups', 'prepResourceGrant', 'waveNumber'].sort(),
  );
  for (const forbidden of FORBIDDEN_WAVE_KEYS) {
    expect(wave).not.toHaveProperty(forbidden);
  }

  for (const group of wave.enemyGroups) {
    expect(Object.keys(group).sort()).toEqual(
      [
        'classDisplayName',
        'classId',
        'combatModuleDisplayName',
        'count',
        'scale',
        'selectedCombatModuleId',
      ].sort(),
    );
    expect(Object.keys(group.scale).sort()).toEqual(
      ['atkScale', 'defScale', 'hasDifference', 'hpScale', 'resScale'].sort(),
    );
    for (const forbidden of FORBIDDEN_WAVE_KEYS) {
      expect(group).not.toHaveProperty(forbidden);
    }
  }
}

function expectDisclosureContextShapeOnly(
  context: ProblemSeriesWavePrepDisclosureContext,
): void {
  expect(Object.keys(context).sort()).toEqual(
    ['nextWave', 'operationConditions', 'previousWave', 'remainingWaves'].sort(),
  );
  for (const forbidden of FORBIDDEN_CONTEXT_KEYS) {
    expect(context).not.toHaveProperty(forbidden);
  }

  expectNamedWaveShapeOnly(context.previousWave);
  expectNamedWaveShapeOnly(context.nextWave);
  for (const wave of context.remainingWaves) {
    expectNamedWaveShapeOnly(wave);
  }
}

function expectWaveMatchesSnapshotNamed(
  wave: ProblemSeriesOverviewNamedWave,
  snapshotWaveIndex: number,
  named: ReturnType<typeof createProblemSeriesOverviewNamed>,
): void {
  const expectedWave = named.waves[snapshotWaveIndex]!;
  expect(wave.waveNumber).toBe(expectedWave.waveNumber);
  expect(wave.prepResourceGrant).toBe(expectedWave.prepResourceGrant);
  expect(wave.enemyGroups.length).toBe(expectedWave.enemyGroups.length);
  expect(wave.enemyGroups.length).toBeGreaterThan(0);

  for (let groupIndex = 0; groupIndex < expectedWave.enemyGroups.length; groupIndex++) {
    const actualGroup = wave.enemyGroups[groupIndex]!;
    const expectedGroup = expectedWave.enemyGroups[groupIndex]!;

    expect(actualGroup.classId).toBe(expectedGroup.classId);
    expect(actualGroup.classDisplayName).toBe(expectedGroup.classDisplayName);
    expect(actualGroup.classDisplayName.length).toBeGreaterThan(0);
    expect(actualGroup.count).toBe(expectedGroup.count);
    expect(actualGroup.count).toBeGreaterThan(0);
    expect(actualGroup.selectedCombatModuleId).toBe(expectedGroup.selectedCombatModuleId);
    expect(actualGroup.selectedCombatModuleId.length).toBeGreaterThan(0);
    expect(actualGroup.combatModuleDisplayName).toBe(expectedGroup.combatModuleDisplayName);
    expect(actualGroup.combatModuleDisplayName.length).toBeGreaterThan(0);
    expect(actualGroup.scale).toEqual(expectedGroup.scale);
  }
}

describe('R12m createProblemSeriesWavePrepDisclosureContext (fixture-a Wave 2 prep)', () => {
  it('fixture-a: production path for Wave 2 preparation (targetWaveIndex=1)', () => {
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

    const context = createProblemSeriesWavePrepDisclosureContext(
      snapshot,
      1,
      gameData,
    );

    expect(context.previousWave.waveNumber).toBe(1);
    expect(context.nextWave.waveNumber).toBe(2);
    expect(context.remainingWaves.map((wave) => wave.waveNumber)).toEqual([2, 3]);
    expect(context.remainingWaves).toHaveLength(2);
    expect(context.remainingWaves[0]).toBe(context.nextWave);

    expectWaveMatchesSnapshotNamed(context.previousWave, 0, named);
    expectWaveMatchesSnapshotNamed(context.nextWave, 1, named);
    expectWaveMatchesSnapshotNamed(context.remainingWaves[0]!, 1, named);
    expectWaveMatchesSnapshotNamed(context.remainingWaves[1]!, 2, named);

    expectDisclosureContextShapeOnly(context);

    const json = JSON.stringify(context);
    expect(json).not.toContain(SERIES_A_ID);
    expect(json).not.toContain(GENERATOR_VERSION);
    for (const internalClass of SERIES_A_INTERNAL_CLASS_STRINGS) {
      expect(json).not.toContain(internalClass);
    }
  });
});

describe('R12m createProblemSeriesWavePrepDisclosureContext (fixture-b Wave 3 prep)', () => {
  it('fixture-b: production path for Wave 3 preparation (targetWaveIndex=2)', () => {
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

    const core = createProblemSeriesOverviewCore(snapshot);
    const named = createProblemSeriesOverviewNamed(core, gameData);

    const context = createProblemSeriesWavePrepDisclosureContext(
      snapshot,
      2,
      gameData,
    );

    expect(context.previousWave.waveNumber).toBe(2);
    expect(context.nextWave.waveNumber).toBe(3);
    expect(context.remainingWaves.map((wave) => wave.waveNumber)).toEqual([3]);
    expect(context.remainingWaves).toHaveLength(1);
    expect(context.remainingWaves[0]).toBe(context.nextWave);

    expectWaveMatchesSnapshotNamed(context.previousWave, 1, named);
    expectWaveMatchesSnapshotNamed(context.nextWave, 2, named);
    expectWaveMatchesSnapshotNamed(context.remainingWaves[0]!, 2, named);

    expectDisclosureContextShapeOnly(context);

    const json = JSON.stringify(context);
    expect(json).not.toContain(SERIES_B_ID);
    expect(json).not.toContain(GENERATOR_VERSION);
    for (const internalClass of SERIES_B_INTERNAL_CLASS_STRINGS) {
      expect(json).not.toContain(internalClass);
    }
  });
});

describe('R12m createProblemSeriesWavePrepDisclosureContext (operationConditions)', () => {
  it('copies operationConditions without sharing array reference', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    expect(loaded.data.problemSeriesCatalog.series.length).toBeGreaterThan(0);

    const gameData = loaded.data;
    const catalog = gameData.problemSeriesCatalog;
    const result = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
    expect(result.series.seriesId).toBe(SERIES_A_ID);

    const operationConditions = ['condition one', 'condition two'];
    const resultWithConditions = {
      ...result,
      series: {
        ...result.series,
        operationConditions,
      },
    };

    const snapshot = createProblemSeriesOperationStartSnapshot(resultWithConditions);
    expect(snapshot.operationConditions).toEqual([
      'condition one',
      'condition two',
    ]);

    const context = createProblemSeriesWavePrepDisclosureContext(
      snapshot,
      1,
      gameData,
    );

    expect(context.operationConditions).toEqual([
      'condition one',
      'condition two',
    ]);
    expect(context.operationConditions).not.toBe(snapshot.operationConditions);
    expect(context.operationConditions).not.toBe(operationConditions);

    operationConditions.push('mutated');

    expect(context.operationConditions).toEqual([
      'condition one',
      'condition two',
    ]);
    expect(snapshot.operationConditions).toEqual([
      'condition one',
      'condition two',
    ]);
  });
});

describe('R12m createProblemSeriesWavePrepDisclosureContext (invalid targetWaveIndex)', () => {
  function loadSnapshotAndGameData() {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    const gameData = loaded.data;
    const catalog = gameData.problemSeriesCatalog;
    const result = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
    const snapshot = createProblemSeriesOperationStartSnapshot(result);
    expect(snapshot.waves).toHaveLength(3);
    return { snapshot, gameData };
  }

  it('rejects targetWaveIndex=-1', () => {
    const { snapshot, gameData } = loadSnapshotAndGameData();

    let thrown: unknown;
    try {
      createProblemSeriesWavePrepDisclosureContext(snapshot, -1, gameData);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('invalid targetWaveIndex: -1');
  });

  it('rejects targetWaveIndex=0', () => {
    const { snapshot, gameData } = loadSnapshotAndGameData();

    let thrown: unknown;
    try {
      createProblemSeriesWavePrepDisclosureContext(snapshot, 0, gameData);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('invalid targetWaveIndex: 0');
  });

  it('rejects targetWaveIndex=snapshot.waves.length', () => {
    const { snapshot, gameData } = loadSnapshotAndGameData();

    let thrown: unknown;
    try {
      createProblemSeriesWavePrepDisclosureContext(
        snapshot,
        snapshot.waves.length,
        gameData,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      `invalid targetWaveIndex: ${snapshot.waves.length}`,
    );
  });

  it('rejects fractional targetWaveIndex', () => {
    const { snapshot, gameData } = loadSnapshotAndGameData();

    let thrown: unknown;
    try {
      createProblemSeriesWavePrepDisclosureContext(snapshot, 1.5, gameData);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('invalid targetWaveIndex: 1.5');
  });

  it('rejects NaN targetWaveIndex', () => {
    const { snapshot, gameData } = loadSnapshotAndGameData();

    let thrown: unknown;
    try {
      createProblemSeriesWavePrepDisclosureContext(snapshot, NaN, gameData);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('invalid targetWaveIndex: NaN');
  });
});
