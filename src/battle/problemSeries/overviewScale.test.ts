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

// R12n 1M で production 採用した系列 A Wave 2 guardian の hpScale。
// 対象は配列位置ではなく waveIndex / classId / Module ID の identity で判定する。
const SCALED_GUARDIAN_WAVE_INDEX = 1;
const SCALED_GUARDIAN_CLASS_ID = 'df_guardian';
const SCALED_GUARDIAN_MODULE_IDS: readonly string[] = [
  'df_guardian_mod_guard_focus',
  'df_guardian_mod_nearest_strike',
];
const SCALED_GUARDIAN_HP_SCALE = 0.75;

describe('R12m createProblemSeriesOverviewScale (fixture-a production path)', () => {
  it('fixture-a: tryLoadGameData → resolve → snapshot → adopted guardian hpScale + default scale normalization', () => {
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
    const scaledGuardianModuleIds: string[] = [];
    let totalGroups = 0;
    let defaultGroups = 0;

    for (const [waveIndex, wave] of snapshot.waves.entries()) {
      expect(wave.enemyGroups.length).toBeGreaterThan(0);

      for (const group of wave.enemyGroups) {
        totalGroups += 1;

        const isScaledGuardian =
          waveIndex === SCALED_GUARDIAN_WAVE_INDEX &&
          group.classId === SCALED_GUARDIAN_CLASS_ID &&
          SCALED_GUARDIAN_MODULE_IDS.includes(group.selectedCombatModuleId);

        const scale = createProblemSeriesOverviewScale(group);
        outputs.push(scale);

        if (isScaledGuardian) {
          scaledGuardianModuleIds.push(group.selectedCombatModuleId);

          expect(Object.prototype.hasOwnProperty.call(group, 'hpScale')).toBe(
            true,
          );
          expect(group.hpScale).toBe(SCALED_GUARDIAN_HP_SCALE);
          expect(Object.prototype.hasOwnProperty.call(group, 'atkScale')).toBe(
            false,
          );
          expect(Object.prototype.hasOwnProperty.call(group, 'defScale')).toBe(
            false,
          );
          expect(Object.prototype.hasOwnProperty.call(group, 'resScale')).toBe(
            false,
          );
          expect(group.atkScale).toBeUndefined();
          expect(group.defScale).toBeUndefined();
          expect(group.resScale).toBeUndefined();

          expect(scale).toEqual({
            hpScale: SCALED_GUARDIAN_HP_SCALE,
            atkScale: 1,
            defScale: 1,
            resScale: 1,
            hasDifference: true,
          });
          expect(scale.hpScale).toBe(SCALED_GUARDIAN_HP_SCALE);
          expect(scale.atkScale).toBe(1);
          expect(scale.defScale).toBe(1);
          expect(scale.resScale).toBe(1);
          expect(scale.hasDifference).toBe(true);
        } else {
          defaultGroups += 1;

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

          expect(scale).toEqual({
            hpScale: 1,
            atkScale: 1,
            defScale: 1,
            resScale: 1,
            hasDifference: false,
          });
          expect(scale.hpScale).toBe(1);
          expect(scale.atkScale).toBe(1);
          expect(scale.defScale).toBe(1);
          expect(scale.resScale).toBe(1);
          expect(scale.hasDifference).toBe(false);
        }

        expect(Object.keys(scale).sort()).toEqual([...SCALE_OUTPUT_KEYS]);
      }
    }

    // 採用済み scaled group は 2 件ちょうどで、Module ID の重複・欠落・余分を許さない。
    expect(scaledGuardianModuleIds).toHaveLength(2);
    expect([...scaledGuardianModuleIds].sort()).toEqual([
      ...SCALED_GUARDIAN_MODULE_IDS,
    ]);
    // default 正規化の対象 0 件成功を禁止する。
    expect(defaultGroups).toBeGreaterThan(0);
    expect(totalGroups).toBe(scaledGuardianModuleIds.length + defaultGroups);
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
