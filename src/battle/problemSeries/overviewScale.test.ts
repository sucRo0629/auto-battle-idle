import { describe, expect, it } from 'vitest';
import { tryLoadGameData } from '../data/loadGameData.ts';
import { createProblemSeriesOperationStartSnapshot } from './operationStartSnapshot.ts';
import {
  createProblemSeriesOverviewScale,
  type ProblemSeriesOverviewScale,
} from './overviewScale.ts';
import { resolveProblemSeriesFromSeed } from './seedResolve.ts';

const FIXTURE_SEED_A = 'fixture-a';
const SERIES_A_ID = 'r12m_series_a';

const SCALE_OUTPUT_KEYS = [
  'atkScale',
  'defScale',
  'hasDifference',
  'hpScale',
  'resScale',
] as const;

describe('R12m createProblemSeriesOverviewScale (fixture-a production path)', () => {
  it('fixture-a: tryLoadGameData → resolve → snapshot → default scale normalization', () => {
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

    const snapshotBefore = structuredClone(snapshot);
    const outputs: ProblemSeriesOverviewScale[] = [];
    let totalGroups = 0;

    for (const wave of snapshot.waves) {
      expect(wave.enemyGroups.length).toBeGreaterThan(0);

      for (const group of wave.enemyGroups) {
        totalGroups += 1;

        expect(Object.prototype.hasOwnProperty.call(group, 'hpScale')).toBe(
          false,
        );
        expect(Object.prototype.hasOwnProperty.call(group, 'atkScale')).toBe(
          false,
        );
        expect(Object.prototype.hasOwnProperty.call(group, 'defScale')).toBe(
          false,
        );
        expect(Object.prototype.hasOwnProperty.call(group, 'resScale')).toBe(
          false,
        );
        expect(group.hpScale).toBeUndefined();
        expect(group.atkScale).toBeUndefined();
        expect(group.defScale).toBeUndefined();
        expect(group.resScale).toBeUndefined();

        const scale = createProblemSeriesOverviewScale(group);
        outputs.push(scale);

        expect(scale).toEqual({
          hpScale: 1,
          atkScale: 1,
          defScale: 1,
          resScale: 1,
          hasDifference: false,
        });
        expect(Object.keys(scale).sort()).toEqual([...SCALE_OUTPUT_KEYS]);
      }
    }

    expect(totalGroups).toBeGreaterThan(0);
    expect(outputs).toHaveLength(totalGroups);

    for (let i = 0; i < outputs.length; i++) {
      for (let j = i + 1; j < outputs.length; j++) {
        expect(outputs[i]).not.toBe(outputs[j]);
      }
    }

    expect(snapshot).toEqual(snapshotBefore);
  });
});

describe('R12m createProblemSeriesOverviewScale (explicit hp/atk scale)', () => {
  it('keeps explicit hp/atk scales and defaults unspecified def/res to 1', () => {
    // Technical fixture values reused from toBattleWaves.test.ts (not balance values).
    const input = {
      hpScale: 1.5,
      atkScale: 2,
    };
    const inputBefore = structuredClone(input);

    const first = createProblemSeriesOverviewScale(input);
    const second = createProblemSeriesOverviewScale(input);

    expect(first).toEqual({
      hpScale: 1.5,
      atkScale: 2,
      defScale: 1,
      resScale: 1,
      hasDifference: true,
    });
    // Explicit hp/atk must be kept as-is (no recalculation / rounding).
    expect(first.hpScale).toBe(1.5);
    expect(first.atkScale).toBe(2);
    // Unspecified def/res default to 1 only.
    expect(first.defScale).toBe(1);
    expect(first.resScale).toBe(1);
    expect(first.hasDifference).toBe(true);
    expect(Object.keys(first).sort()).toEqual([...SCALE_OUTPUT_KEYS]);
    expect(Object.keys(first)).toHaveLength(5);

    expect(input).toEqual(inputBefore);
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});

describe('R12m createProblemSeriesOverviewScale (explicit def/res scale)', () => {
  it('keeps explicit def/res scales and defaults unspecified hp/atk to 1', () => {
    // Technical fixture values reused from toBattleWaves.test.ts (not balance values).
    const input = {
      defScale: 1.5,
      resScale: 2,
    };
    const inputBefore = structuredClone(input);

    const first = createProblemSeriesOverviewScale(input);
    const second = createProblemSeriesOverviewScale(input);

    expect(first).toEqual({
      hpScale: 1,
      atkScale: 1,
      defScale: 1.5,
      resScale: 2,
      hasDifference: true,
    });
    // Explicit def/res must be kept as-is (no recalculation / rounding).
    expect(first.defScale).toBe(1.5);
    expect(first.resScale).toBe(2);
    // Unspecified hp/atk default to 1 only.
    expect(first.hpScale).toBe(1);
    expect(first.atkScale).toBe(1);
    expect(first.hasDifference).toBe(true);
    expect(Object.keys(first).sort()).toEqual([...SCALE_OUTPUT_KEYS]);
    expect(Object.keys(first)).toHaveLength(5);

    expect(input).toEqual(inputBefore);
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});
