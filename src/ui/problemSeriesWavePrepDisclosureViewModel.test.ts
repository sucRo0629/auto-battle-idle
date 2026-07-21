import { describe, expect, it } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { createProblemSeriesOperationStartSnapshot } from '../battle/problemSeries/operationStartSnapshot.ts';
import type { ProblemSeriesOverviewNamedEnemyGroup } from '../battle/problemSeries/overviewViewModel.ts';
import { resolveProblemSeriesFromSeed } from '../battle/problemSeries/seedResolve.ts';
import {
  createProblemSeriesWavePrepDisclosureContext,
  type ProblemSeriesWavePrepDisclosureContext,
} from '../battle/problemSeries/wavePrepDisclosure.ts';
import {
  createProblemSeriesWavePrepEnemyChanges,
  type ProblemSeriesWavePrepEnemyChange,
} from '../battle/problemSeries/wavePrepEnemyChanges.ts';
import {
  createProblemSeriesOverviewEnemyGroupDisplay,
  type ProblemSeriesOverviewWaveDisplay,
} from './problemSeriesOverviewViewModel.ts';
import {
  createProblemSeriesWavePrepDisclosureDisplay,
  type ProblemSeriesWavePrepDisclosureDisplay,
} from './problemSeriesWavePrepDisclosureViewModel.ts';

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

const DISPLAY_GROUP_KEYS = [
  'classDisplayName',
  'classId',
  'combatModuleDisplayName',
  'count',
  'scaleSummary',
  'selectedCombatModuleId',
] as const;

const FORBIDDEN_OUTPUT_KEYS = [
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
  'previousWave',
  'stageId',
  'party',
  'passives',
  'points',
  'checkpoint',
  'save',
  'hasDifference',
  'hpScale',
  'atkScale',
  'defScale',
  'resScale',
  'scale',
  'recommendedFormation',
  'recommendedOrder',
  'killOrder',
  'winRate',
  'explanation',
] as const;

const FORBIDDEN_DISPLAY_JSON_SUBSTRINGS = [
  SERIES_A_ID,
  SERIES_B_ID,
  GENERATOR_VERSION,
  'internalProblemClass',
  'expectedFailureModes',
  'connection',
  'waveLinks',
  'waveRelationSummary',
  'finalWaveCompositeOf',
  'previousWave',
  'stageId',
  '推奨編成',
  '推奨撃破順',
  '正解',
] as const;

type DeepMutable<T> =
  T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;

type WavePrepDisclosureProductionPath = {
  seriesId: string;
  context: ProblemSeriesWavePrepDisclosureContext;
  enemyChanges: readonly ProblemSeriesWavePrepEnemyChange[];
  display: ProblemSeriesWavePrepDisclosureDisplay;
};

function runWavePrepDisclosureDisplayProductionPath(
  seed: string,
  targetWaveIndex: number,
  expectedSeriesId: string,
): WavePrepDisclosureProductionPath {
  const loaded = tryLoadGameData();
  if (!loaded.ok) {
    throw new Error(loaded.error);
  }
  expect(loaded.data.problemSeriesCatalog.series.length).toBeGreaterThan(0);

  const gameData = loaded.data;
  const catalog = gameData.problemSeriesCatalog;
  const result = resolveProblemSeriesFromSeed(catalog, seed);
  expect(result.series.seriesId).toBe(expectedSeriesId);

  const snapshot = createProblemSeriesOperationStartSnapshot(result);
  expect(snapshot.waves).toHaveLength(3);

  const context = createProblemSeriesWavePrepDisclosureContext(
    snapshot,
    targetWaveIndex,
    gameData,
  );
  const enemyChanges = createProblemSeriesWavePrepEnemyChanges(context);
  const display = createProblemSeriesWavePrepDisclosureDisplay(
    context,
    enemyChanges,
  );

  return {
    seriesId: result.series.seriesId,
    context,
    enemyChanges,
    display,
  };
}

function expectDisplayGroupShapeOnly(
  group: ReturnType<typeof createProblemSeriesOverviewEnemyGroupDisplay>,
): void {
  expect(Object.keys(group).sort()).toEqual([...DISPLAY_GROUP_KEYS].sort());
  expect(Object.keys(group)).toHaveLength(6);
  for (const forbidden of FORBIDDEN_OUTPUT_KEYS) {
    expect(group).not.toHaveProperty(forbidden);
  }
}

function expectWaveDisplayShapeOnly(wave: ProblemSeriesOverviewWaveDisplay): void {
  expect(Object.keys(wave).sort()).toEqual(
    ['enemyGroups', 'prepResourceGrant', 'waveNumber'].sort(),
  );
  expect(wave.enemyGroups.length).toBeGreaterThan(0);
  for (const group of wave.enemyGroups) {
    expectDisplayGroupShapeOnly(group);
  }
}

function expectDisclosureDisplayShapeOnly(
  display: ProblemSeriesWavePrepDisclosureDisplay,
): void {
  expect(Object.keys(display).sort()).toEqual(
    ['enemyChanges', 'nextWave', 'operationConditions', 'remainingWaves'].sort(),
  );
  for (const forbidden of FORBIDDEN_OUTPUT_KEYS) {
    expect(display).not.toHaveProperty(forbidden);
  }

  expectWaveDisplayShapeOnly(display.nextWave);
  expect(display.remainingWaves.length).toBeGreaterThan(0);
  for (const wave of display.remainingWaves) {
    expectWaveDisplayShapeOnly(wave);
  }

  for (const change of display.enemyChanges) {
    expect(Object.keys(change).sort()).toEqual(
      ['classDisplayName', 'classId', 'nextGroups', 'previousGroups'].sort(),
    );
    for (const forbidden of FORBIDDEN_OUTPUT_KEYS) {
      expect(change).not.toHaveProperty(forbidden);
    }
    for (const groups of [change.previousGroups, change.nextGroups]) {
      for (const group of groups) {
        expectDisplayGroupShapeOnly(group);
      }
    }
  }
}

function assertGroupMatchesOverviewAdapter(
  namedGroup: ProblemSeriesOverviewNamedEnemyGroup,
  displayGroup: ReturnType<typeof createProblemSeriesOverviewEnemyGroupDisplay>,
): void {
  expect(displayGroup).toEqual(
    createProblemSeriesOverviewEnemyGroupDisplay(namedGroup),
  );
  expect(displayGroup.classDisplayName.length).toBeGreaterThan(0);
  expect(displayGroup.combatModuleDisplayName.length).toBeGreaterThan(0);
  expect(displayGroup.count).toBeGreaterThan(0);
}

function cloneEnemyChanges(
  enemyChanges: readonly ProblemSeriesWavePrepEnemyChange[],
): DeepMutable<readonly ProblemSeriesWavePrepEnemyChange[]> {
  const copyGroup = (
    group: ProblemSeriesWavePrepEnemyChange['previousGroups'][number],
  ) => ({
    classId: group.classId,
    classDisplayName: group.classDisplayName,
    count: group.count,
    selectedCombatModuleId: group.selectedCombatModuleId,
    combatModuleDisplayName: group.combatModuleDisplayName,
    scale: { ...group.scale },
  });

  return enemyChanges.map((change) => ({
    classId: change.classId,
    classDisplayName: change.classDisplayName,
    previousGroups: change.previousGroups.map((group) => copyGroup(group)),
    nextGroups: change.nextGroups.map((group) => copyGroup(group)),
  }));
}

function cloneDisclosureContext(
  context: ProblemSeriesWavePrepDisclosureContext,
): DeepMutable<ProblemSeriesWavePrepDisclosureContext> {
  const copyGroup = (
    group: ProblemSeriesWavePrepDisclosureContext['previousWave']['enemyGroups'][number],
  ) => ({
    classId: group.classId,
    classDisplayName: group.classDisplayName,
    count: group.count,
    selectedCombatModuleId: group.selectedCombatModuleId,
    combatModuleDisplayName: group.combatModuleDisplayName,
    scale: { ...group.scale },
  });

  const copyWave = (
    wave: ProblemSeriesWavePrepDisclosureContext['previousWave'],
  ) => ({
    waveNumber: wave.waveNumber,
    prepResourceGrant: wave.prepResourceGrant,
    enemyGroups: wave.enemyGroups.map((group) => copyGroup(group)),
  });

  return {
    operationConditions: [...context.operationConditions],
    previousWave: copyWave(context.previousWave),
    nextWave: copyWave(context.nextWave),
    remainingWaves: context.remainingWaves.map((wave) => copyWave(wave)),
  };
}

describe('R12m createProblemSeriesWavePrepDisclosureDisplay (fixture-a Wave 2 prep)', () => {
  it('production path: nextWave Wave 2, remaining Waves 2–3, enemyChanges df_guardian/sp_cleric/at_sorcerer', () => {
    const path = runWavePrepDisclosureDisplayProductionPath(
      FIXTURE_SEED_A,
      1,
      SERIES_A_ID,
    );

    expect(path.seriesId).toBe(SERIES_A_ID);
    expect(path.context.nextWave.waveNumber).toBe(2);
    expect(path.display.nextWave.waveNumber).toBe(2);
    expect(path.display.remainingWaves.map((wave) => wave.waveNumber)).toEqual([
      2, 3,
    ]);
    expect(path.display.remainingWaves).toHaveLength(2);

    expect(path.enemyChanges.map((change) => change.classId)).toEqual([
      'df_guardian',
      'sp_cleric',
      'at_sorcerer',
    ]);
    expect(path.display.enemyChanges.map((change) => change.classId)).toEqual([
      'df_guardian',
      'sp_cleric',
      'at_sorcerer',
    ]);

    expectDisclosureDisplayShapeOnly(path.display);

    let inspectedGroupCount = 0;
    for (const group of path.context.nextWave.enemyGroups) {
      inspectedGroupCount += 1;
      const displayGroup = path.display.nextWave.enemyGroups.find(
        (candidate) =>
          candidate.classId === group.classId &&
          candidate.selectedCombatModuleId === group.selectedCombatModuleId,
      );
      expect(displayGroup).toBeDefined();
      assertGroupMatchesOverviewAdapter(group, displayGroup!);
    }
    expect(inspectedGroupCount).toBeGreaterThan(0);
    expect(path.display.nextWave.enemyGroups.length).toBe(inspectedGroupCount);

    const standardScaleTargets: Array<{
      waveNumber: number;
      classId: string;
      selectedCombatModuleId: string;
    }> = [];
    for (const wave of path.context.remainingWaves) {
      for (const group of wave.enemyGroups) {
        if (!group.scale.hasDifference) {
          standardScaleTargets.push({
            waveNumber: wave.waveNumber,
            classId: group.classId,
            selectedCombatModuleId: group.selectedCombatModuleId,
          });
        }
      }
    }
    expect(standardScaleTargets.length).toBeGreaterThan(0);

    for (const target of standardScaleTargets) {
      const displayWave = path.display.remainingWaves.find(
        (wave) => wave.waveNumber === target.waveNumber,
      )!;
      const displayGroup = displayWave.enemyGroups.find(
        (group) =>
          group.classId === target.classId &&
          group.selectedCombatModuleId === target.selectedCombatModuleId,
      )!;
      expect(displayGroup.scaleSummary).toBe('');
    }

    const json = JSON.stringify(path.display);
    for (const forbidden of FORBIDDEN_DISPLAY_JSON_SUBSTRINGS) {
      expect(json).not.toContain(forbidden);
    }
    for (const internalClass of SERIES_A_INTERNAL_CLASS_STRINGS) {
      expect(json).not.toContain(internalClass);
    }
  });
});

describe('R12m createProblemSeriesWavePrepDisclosureDisplay (fixture-b Wave 3 prep)', () => {
  it('production path: nextWave Wave 3, remaining Waves 3 only, enemyChanges match production diff', () => {
    const path = runWavePrepDisclosureDisplayProductionPath(
      FIXTURE_SEED_B,
      2,
      SERIES_B_ID,
    );

    expect(path.seriesId).toBe(SERIES_B_ID);
    expect(path.context.nextWave.waveNumber).toBe(3);
    expect(path.display.nextWave.waveNumber).toBe(3);
    expect(path.display.remainingWaves.map((wave) => wave.waveNumber)).toEqual([3]);
    expect(path.display.remainingWaves).toHaveLength(1);

    expect(path.enemyChanges.map((change) => change.classId)).toEqual([
      'at_swordsman',
      'sp_cleric',
    ]);
    expect(path.display.enemyChanges.map((change) => change.classId)).toEqual([
      'at_swordsman',
      'sp_cleric',
    ]);

    expectDisclosureDisplayShapeOnly(path.display);

    expect(path.display.nextWave.enemyGroups.length).toBeGreaterThan(0);
    for (let index = 0; index < path.context.nextWave.enemyGroups.length; index++) {
      const namedGroup = path.context.nextWave.enemyGroups[index]!;
      const displayGroup = path.display.nextWave.enemyGroups[index]!;
      assertGroupMatchesOverviewAdapter(namedGroup, displayGroup);
    }

    for (let changeIndex = 0; changeIndex < path.enemyChanges.length; changeIndex++) {
      const sourceChange = path.enemyChanges[changeIndex]!;
      const displayChange = path.display.enemyChanges[changeIndex]!;
      expect(displayChange.classId).toBe(sourceChange.classId);
      expect(displayChange.classDisplayName).toBe(sourceChange.classDisplayName);

      for (let groupIndex = 0; groupIndex < sourceChange.previousGroups.length; groupIndex++) {
        assertGroupMatchesOverviewAdapter(
          sourceChange.previousGroups[groupIndex]!,
          displayChange.previousGroups[groupIndex]!,
        );
      }
      for (let groupIndex = 0; groupIndex < sourceChange.nextGroups.length; groupIndex++) {
        assertGroupMatchesOverviewAdapter(
          sourceChange.nextGroups[groupIndex]!,
          displayChange.nextGroups[groupIndex]!,
        );
      }
    }

    const json = JSON.stringify(path.display);
    for (const forbidden of FORBIDDEN_DISPLAY_JSON_SUBSTRINGS) {
      expect(json).not.toContain(forbidden);
    }
    for (const internalClass of SERIES_B_INTERNAL_CLASS_STRINGS) {
      expect(json).not.toContain(internalClass);
    }
  });
});

describe('R12m createProblemSeriesWavePrepDisclosureDisplay (focused: operationConditions)', () => {
  it('copies operationConditions without sharing references; input mutation does not affect display', () => {
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
    const enemyChanges = createProblemSeriesWavePrepEnemyChanges(context);
    const display = createProblemSeriesWavePrepDisclosureDisplay(
      context,
      enemyChanges,
    );

    expect(display.operationConditions).toEqual([
      'condition one',
      'condition two',
    ]);
    expect(display.operationConditions).not.toBe(context.operationConditions);
    expect(display.operationConditions).not.toBe(snapshot.operationConditions);
    expect(display.operationConditions).not.toBe(operationConditions);

    operationConditions.push('mutated');
    expect(display.operationConditions).toEqual([
      'condition one',
      'condition two',
    ]);
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

describe('R12m createProblemSeriesWavePrepDisclosureDisplay (focused: scale difference)', () => {
  it('scaleSummary matches createProblemSeriesOverviewEnemyGroupDisplay and is non-empty after hpScale mutation', () => {
    const path = runWavePrepDisclosureDisplayProductionPath(
      FIXTURE_SEED_A,
      1,
      SERIES_A_ID,
    );
    const mutableContext = cloneDisclosureContext(path.context);

    const targetGroup = mutableContext.nextWave.enemyGroups[0]!;
    const previousHpScale = targetGroup.scale.hpScale;
    targetGroup.scale = {
      ...targetGroup.scale,
      hpScale: previousHpScale + 0.5,
    };

    const enemyChanges = createProblemSeriesWavePrepEnemyChanges(mutableContext);
    const display = createProblemSeriesWavePrepDisclosureDisplay(
      mutableContext,
      enemyChanges,
    );

    const displayGroup = display.nextWave.enemyGroups[0]!;
    const expectedGroup = createProblemSeriesOverviewEnemyGroupDisplay(targetGroup);

    expect(displayGroup.scaleSummary).toBe(expectedGroup.scaleSummary);
    expect(displayGroup.scaleSummary.length).toBeGreaterThan(0);
    expect(displayGroup).toEqual(expectedGroup);
  });
});

describe('R12m createProblemSeriesWavePrepDisclosureDisplay (focused: reference isolation)', () => {
  it('output does not share references with input; mutating input copies does not affect display', () => {
    const path = runWavePrepDisclosureDisplayProductionPath(
      FIXTURE_SEED_A,
      1,
      SERIES_A_ID,
    );
    const mutableContext = cloneDisclosureContext(path.context);
    const mutableEnemyChanges = cloneEnemyChanges(path.enemyChanges);
    expect(mutableEnemyChanges.length).toBeGreaterThan(0);
    expect(path.enemyChanges.length).toBeGreaterThan(0);

    const display = createProblemSeriesWavePrepDisclosureDisplay(
      mutableContext,
      mutableEnemyChanges,
    );

    expect(display.operationConditions).not.toBe(mutableContext.operationConditions);
    expect(display.nextWave).not.toBe(mutableContext.nextWave);
    expect(display.nextWave.enemyGroups).not.toBe(mutableContext.nextWave.enemyGroups);
    expect(display.enemyChanges).not.toBe(mutableEnemyChanges);
    expect(display.remainingWaves).not.toBe(mutableContext.remainingWaves);

    for (const wave of display.remainingWaves) {
      expect(mutableContext.remainingWaves.some((inputWave) => inputWave === wave)).toBe(
        false,
      );
      for (const inputWave of mutableContext.remainingWaves) {
        expect(wave.enemyGroups).not.toBe(inputWave.enemyGroups);
      }
    }

    for (let groupIndex = 0; groupIndex < mutableContext.nextWave.enemyGroups.length; groupIndex++) {
      expect(display.nextWave.enemyGroups[groupIndex]).not.toBe(
        mutableContext.nextWave.enemyGroups[groupIndex],
      );
    }

    for (let changeIndex = 0; changeIndex < display.enemyChanges.length; changeIndex++) {
      const displayChange = display.enemyChanges[changeIndex]!;
      const mutableChange = mutableEnemyChanges[changeIndex]!;

      expect(displayChange).not.toBe(mutableChange);
      expect(displayChange.previousGroups).not.toBe(mutableChange.previousGroups);
      expect(displayChange.nextGroups).not.toBe(mutableChange.nextGroups);

      for (let groupIndex = 0; groupIndex < displayChange.previousGroups.length; groupIndex++) {
        expect(displayChange.previousGroups[groupIndex]).not.toBe(
          mutableChange.previousGroups[groupIndex],
        );
      }
      for (let groupIndex = 0; groupIndex < displayChange.nextGroups.length; groupIndex++) {
        expect(displayChange.nextGroups[groupIndex]).not.toBe(
          mutableChange.nextGroups[groupIndex],
        );
      }
    }

    for (let waveIndex = 0; waveIndex < display.remainingWaves.length; waveIndex++) {
      const displayWave = display.remainingWaves[waveIndex]!;
      const inputWave = mutableContext.remainingWaves[waveIndex]!;
      expect(displayWave).not.toBe(inputWave);
      for (let groupIndex = 0; groupIndex < displayWave.enemyGroups.length; groupIndex++) {
        expect(displayWave.enemyGroups[groupIndex]).not.toBe(
          inputWave.enemyGroups[groupIndex],
        );
      }
    }

    const frozenDisplay = JSON.parse(JSON.stringify(display));

    const mutableChangeGroups = mutableEnemyChanges.flatMap((change) => [
      ...change.previousGroups,
      ...change.nextGroups,
    ]);
    expect(mutableChangeGroups.length).toBeGreaterThan(0);

    for (const group of mutableChangeGroups) {
      group.count = group.count + 99;
      group.scale.atkScale = group.scale.atkScale + 99;
    }

    expect(JSON.stringify(display)).toBe(JSON.stringify(frozenDisplay));

    mutableContext.operationConditions.push('mutated condition');
    for (const wave of [
      mutableContext.previousWave,
      mutableContext.nextWave,
      ...mutableContext.remainingWaves,
    ]) {
      for (const group of wave.enemyGroups) {
        group.count = group.count + 99;
        group.scale = {
          ...group.scale,
          atkScale: group.scale.atkScale + 99,
        };
      }
    }

    expect(JSON.stringify(display)).toBe(JSON.stringify(frozenDisplay));
  });
});
