import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/loadGameData.ts';
import {
  createProblemSeriesOperationStartSnapshot,
  type ProblemSeriesOperationStartSnapshot,
} from './operationStartSnapshot.ts';
import { resolveProblemSeriesFromSeed } from './seedResolve.ts';
import {
  createProblemSeriesVictoryResult,
  type ProblemSeriesVictoryResult,
} from './victoryResult.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';
const SERIES_A_ID = 'r12m_series_a';
const SERIES_B_ID = 'r12m_series_b';
const GENERATOR_VERSION = 'r12m-v1';
const EXPECTED_WAVE_COUNT = 3;
const EXPECTED_FINAL_WAVE_INDEX = EXPECTED_WAVE_COUNT - 1;

const ALLOWED_RESULT_KEYS = [
  'outcome',
  'seed',
  'generatorVersion',
  'seriesId',
  'reachedWaveIndex',
] as const;

const FORBIDDEN_RESULT_KEYS = [
  'stageId',
  'waves',
  'party',
  'operationPassives',
  'operationResource',
  'checkpoint',
  'save',
] as const;

function expectVictoryResultShapeOnly(
  result: ProblemSeriesVictoryResult,
): void {
  expect(Object.keys(result).sort()).toEqual([...ALLOWED_RESULT_KEYS].sort());
  for (const forbidden of FORBIDDEN_RESULT_KEYS) {
    expect(result).not.toHaveProperty(forbidden);
  }
}

function productionVictoryResult(seed: string): {
  snapshot: ProblemSeriesOperationStartSnapshot;
  result: ProblemSeriesVictoryResult;
} {
  const catalog = loadGameData().problemSeriesCatalog;
  const resolved = resolveProblemSeriesFromSeed(catalog, seed);
  const snapshot = createProblemSeriesOperationStartSnapshot(resolved);
  const result = createProblemSeriesVictoryResult(snapshot);
  return { snapshot, result };
}

describe('R12m createProblemSeriesVictoryResult (pure factory)', () => {
  it('fixture-a: loadGameData → resolve → snapshot → victory result', () => {
    const catalog = loadGameData().problemSeriesCatalog;
    const resolved = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
    expect(resolved.series.seriesId).toBe(SERIES_A_ID);

    const snapshot = createProblemSeriesOperationStartSnapshot(resolved);
    expect(snapshot.waves).toHaveLength(EXPECTED_WAVE_COUNT);

    const result = createProblemSeriesVictoryResult(snapshot);

    expect(result.outcome).toBe('victory');
    expect(result.seed).toBe(resolved.seed);
    expect(result.seed).toBe(FIXTURE_SEED_A);
    expect(result.generatorVersion).toBe(resolved.generatorVersion);
    expect(result.generatorVersion).toBe(catalog.generatorVersion);
    expect(result.generatorVersion).toBe(GENERATOR_VERSION);
    expect(result.seriesId).toBe(resolved.series.seriesId);
    expect(result.seriesId).toBe(SERIES_A_ID);
    expect(result.reachedWaveIndex).toBe(snapshot.waves.length - 1);
    expect(result.reachedWaveIndex).toBe(EXPECTED_FINAL_WAVE_INDEX);

    expectVictoryResultShapeOnly(result);
  });

  it('fixture-b: loadGameData → resolve → snapshot → victory result', () => {
    const catalog = loadGameData().problemSeriesCatalog;
    const resolved = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_B);
    expect(resolved.series.seriesId).toBe(SERIES_B_ID);

    const snapshot = createProblemSeriesOperationStartSnapshot(resolved);
    expect(snapshot.waves).toHaveLength(EXPECTED_WAVE_COUNT);

    const result = createProblemSeriesVictoryResult(snapshot);

    expect(result.outcome).toBe('victory');
    expect(result.seed).toBe(resolved.seed);
    expect(result.seed).toBe(FIXTURE_SEED_B);
    expect(result.generatorVersion).toBe(resolved.generatorVersion);
    expect(result.generatorVersion).toBe(catalog.generatorVersion);
    expect(result.generatorVersion).toBe(GENERATOR_VERSION);
    expect(result.seriesId).toBe(resolved.series.seriesId);
    expect(result.seriesId).toBe(SERIES_B_ID);
    expect(result.reachedWaveIndex).toBe(snapshot.waves.length - 1);
    expect(result.reachedWaveIndex).toBe(EXPECTED_FINAL_WAVE_INDEX);

    expectVictoryResultShapeOnly(result);
  });

  it('fixture-a and fixture-b select different seriesIds via production path', () => {
    const { result: resultA } = productionVictoryResult(FIXTURE_SEED_A);
    const { result: resultB } = productionVictoryResult(FIXTURE_SEED_B);

    expect(resultA.seriesId).toBe(SERIES_A_ID);
    expect(resultB.seriesId).toBe(SERIES_B_ID);
    expect(resultA.seriesId).not.toBe(resultB.seriesId);
    expect(resultA.seed).toBe(FIXTURE_SEED_A);
    expect(resultB.seed).toBe(FIXTURE_SEED_B);
    expect(resultA.reachedWaveIndex).toBe(EXPECTED_FINAL_WAVE_INDEX);
    expect(resultB.reachedWaveIndex).toBe(EXPECTED_FINAL_WAVE_INDEX);
  });

  it('result holds only scalar values without snapshot wave/group references', () => {
    const { snapshot, result } = productionVictoryResult(FIXTURE_SEED_A);

    expect(typeof result.outcome).toBe('string');
    expect(typeof result.seed).toBe('string');
    expect(typeof result.generatorVersion).toBe('string');
    expect(typeof result.seriesId).toBe('string');
    expect(typeof result.reachedWaveIndex).toBe('number');

    expect(result).not.toHaveProperty('waves');
    expect(result).not.toHaveProperty('enemyGroups');
    expect(result).not.toHaveProperty('series');
    expect(result).not.toHaveProperty('snapshot');

    for (const value of Object.values(result)) {
      expect(value).not.toBe(snapshot);
      expect(value).not.toBe(snapshot.waves);
      expect(value).not.toBe(snapshot.waves[0]);
      expect(value).not.toBe(snapshot.waves[0]!.enemyGroups);
      expect(value).not.toBe(snapshot.waves[0]!.enemyGroups[0]);
    }

    expectVictoryResultShapeOnly(result);
  });

  it('empty waves snapshot throws explicitly from factory', () => {
    const emptyWavesSnapshot = {
      seed: FIXTURE_SEED_A,
      generatorVersion: GENERATOR_VERSION,
      seriesId: SERIES_A_ID,
      waves: [],
    } as ProblemSeriesOperationStartSnapshot;

    expect(() => createProblemSeriesVictoryResult(emptyWavesSnapshot)).toThrow(
      /problem series victory result requires a snapshot with at least one wave/i,
    );
    expect(() => createProblemSeriesVictoryResult(emptyWavesSnapshot)).toThrow(
      /at least one wave/i,
    );
  });
});
