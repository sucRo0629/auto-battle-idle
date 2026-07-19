import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/loadGameData.ts';
import type { ProblemSeriesDef } from '../types.ts';
import { resolveProblemSeriesFromSeed } from './seedResolve.ts';
import {
  toProblemSeriesBattleWaves,
  type ProblemSeriesBattleWave,
} from './toBattleWaves.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';

const AUTHORING_OR_STAGE_KEYS = [
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
  'seriesId',
  'generatorVersion',
  'seed',
  'enemies',
  'allowedClassIds',
] as const;

function expectWavesMatchSeries(
  waves: ProblemSeriesBattleWave[],
  series: ProblemSeriesDef,
): void {
  expect(waves).toHaveLength(3);
  expect(series.waves).toHaveLength(3);

  for (let waveIndex = 0; waveIndex < 3; waveIndex++) {
    const inputWave = series.waves[waveIndex]!;
    const outputWave = waves[waveIndex]!;

    expect(outputWave.prepResourceGrant).toBe(inputWave.prepResourceGrant);
    expect(outputWave.enemyGroups).toHaveLength(inputWave.enemyGroups.length);

    for (let groupIndex = 0; groupIndex < inputWave.enemyGroups.length; groupIndex++) {
      const inputGroup = inputWave.enemyGroups[groupIndex]!;
      const outputGroup = outputWave.enemyGroups[groupIndex]!;
      expect(outputGroup.classId).toBe(inputGroup.classId);
      expect(outputGroup.count).toBe(inputGroup.count);
      expect(outputGroup.selectedCombatModuleId).toBe(
        inputGroup.selectedCombatModuleId,
      );
      expect(outputGroup.hpScale).toBe(inputGroup.hpScale);
      expect(outputGroup.atkScale).toBe(inputGroup.atkScale);
      expect(outputGroup.defScale).toBe(inputGroup.defScale);
      expect(outputGroup.resScale).toBe(inputGroup.resScale);
    }
  }
}

function expectNoAuthoringOrStageFields(waves: ProblemSeriesBattleWave[]): void {
  expect(waves).toHaveLength(3);
  for (const wave of waves) {
    const waveKeys = Object.keys(wave);
    expect(waveKeys.sort()).toEqual(['enemyGroups', 'prepResourceGrant'].sort());
    for (const forbidden of AUTHORING_OR_STAGE_KEYS) {
      expect(wave).not.toHaveProperty(forbidden);
    }
    for (const group of wave.enemyGroups) {
      for (const forbidden of AUTHORING_OR_STAGE_KEYS) {
        expect(group).not.toHaveProperty(forbidden);
      }
      expect(Object.keys(group).every((key) =>
        [
          'classId',
          'count',
          'selectedCombatModuleId',
          'hpScale',
          'atkScale',
          'defScale',
          'resScale',
        ].includes(key),
      )).toBe(true);
    }
  }
}

describe('R12m toProblemSeriesBattleWaves (pure conversion)', () => {
  it('fixture-a: production catalog → seed resolve → 3 battle waves match series A', () => {
    const catalog = loadGameData().problemSeriesCatalog;
    const { series } = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
    expect(series.seriesId).toBe('r12m_series_a');

    const waves = toProblemSeriesBattleWaves(series);

    expectWavesMatchSeries(waves, series);
    expectNoAuthoringOrStageFields(waves);
  });

  it('fixture-b: production catalog → seed resolve → 3 battle waves match series B', () => {
    const catalog = loadGameData().problemSeriesCatalog;
    const { series } = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_B);
    expect(series.seriesId).toBe('r12m_series_b');

    const waves = toProblemSeriesBattleWaves(series);

    expectWavesMatchSeries(waves, series);
    expectNoAuthoringOrStageFields(waves);
  });

  it('does not share wave/group object references with the input series', () => {
    const catalog = loadGameData().problemSeriesCatalog;
    const { series } = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
    const seriesSnapshot = structuredClone(series);

    const waves = toProblemSeriesBattleWaves(series);
    expect(waves).not.toBe(series.waves);
    expect(waves[0]).not.toBe(series.waves[0]);
    expect(waves[0]!.enemyGroups).not.toBe(series.waves[0]!.enemyGroups);
    expect(waves[0]!.enemyGroups[0]).not.toBe(series.waves[0]!.enemyGroups[0]);

    waves[0]!.prepResourceGrant = 999;
    waves[0]!.enemyGroups[0]!.count = 99;
    waves[0]!.enemyGroups[0]!.classId = 'at_swordsman';
    waves[0]!.enemyGroups[0]!.selectedCombatModuleId = 'mutated_module';
    waves[0]!.enemyGroups[0]!.hpScale = 7;
    waves.push({
      prepResourceGrant: 1,
      enemyGroups: [],
    });
    waves[0]!.enemyGroups.push({
      classId: 'sp_cleric',
      count: 3,
      selectedCombatModuleId: 'extra',
    });

    expect(series).toEqual(seriesSnapshot);
    expect(series.waves).toHaveLength(3);
    expect(series.waves[0]!.prepResourceGrant).toBe(
      seriesSnapshot.waves[0]!.prepResourceGrant,
    );
    expect(series.waves[0]!.enemyGroups[0]).toEqual(
      seriesSnapshot.waves[0]!.enemyGroups[0],
    );
  });

  it('preserves explicit scales without writing unspecified scales as 1', () => {
    const catalog = loadGameData().problemSeriesCatalog;
    const { series: base } = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_B);
    const series: ProblemSeriesDef = structuredClone(base);
    series.waves[1]!.enemyGroups[0]!.hpScale = 1.5;
    series.waves[1]!.enemyGroups[0]!.atkScale = 2;
    // defScale / resScale intentionally omitted

    const waves = toProblemSeriesBattleWaves(series);
    const group = waves[1]!.enemyGroups[0]!;

    expect(group.hpScale).toBe(1.5);
    expect(group.atkScale).toBe(2);
    expect(group).not.toHaveProperty('defScale');
    expect(group).not.toHaveProperty('resScale');
    expect(Object.prototype.hasOwnProperty.call(group, 'defScale')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(group, 'hpScale')).toBe(true);
  });

  it('rejects series that are not exactly 3 waves', () => {
    const catalog = loadGameData().problemSeriesCatalog;
    const { series: base } = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
    const truncated: ProblemSeriesDef = {
      ...base,
      waves: base.waves.slice(0, 2),
    };
    expect(() => toProblemSeriesBattleWaves(truncated)).toThrow(/exactly 3 waves/);
  });
});
