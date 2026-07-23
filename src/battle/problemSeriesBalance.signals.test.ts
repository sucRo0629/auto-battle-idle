/**
 * R12n 1E — 4 検出語の synthetic 発火試験 + 系列 A/B baseline 接続。
 *
 * 候補配列が非空であることを発火試験で先に固定する（空振り成功禁止）。
 * baseline で候補が空でも、coverage 件数を必ず assert し、強度合格・完了とは解釈しない。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  ProblemSeriesSimInput,
  ProblemSeriesSimResult,
  ProblemSeriesSimSlotMetrics,
  ProblemSeriesSimWaveTimeline,
} from './test/problemSeriesSim.harness.ts';
import {
  appliedChoiceSignature,
  battleMetricsSignature,
  detectProblemSeriesBalanceSignals,
  PROBLEM_SERIES_BALANCE_STANDARD_MAX_TICKS,
  type ProblemSeriesBalanceSignalCase,
  type ProblemSeriesBalanceSignalReport,
} from './test/problemSeriesBalanceSignals.ts';

const SERIES_SEED = 'synthetic-series';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_ID = 'synthetic_series';
const MAX_TICKS = PROBLEM_SERIES_BALANCE_STANDARD_MAX_TICKS;

const BUILD_A = 'build-a';
const BUILD_B = 'build-b';
const BUILD_C = 'build-c';
const SEED_1 = 'seed-01';
const SEED_2 = 'seed-02';
const SEED_3 = 'seed-03';

const EXPECTED_BASELINE_A_SHA256 =
  '2c6e6ad212bfaffb3259613d2d15a39a7910f7b7ba0474240f72cedd5c49062c';
const EXPECTED_BASELINE_B_SHA256 =
  'b575d9830b57bce29c3fc2d13ebb8db7044ee592d3363aae1bf457b0d7e1d47c';

const baselineAPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'test/baselines/r12n-series-a-before.json',
);
const baselineBPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'test/baselines/r12n-series-b-before.json',
);

interface BaselineFile {
  readonly schemaVersion: number;
  readonly sourceHead: string;
  readonly problemSeriesSeed: string;
  readonly generatorVersion: string;
  readonly seriesId: string;
  readonly maxTicks: number;
  readonly cases: readonly ProblemSeriesBalanceSignalCase[];
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function loadBaselineReadonly(
  absolutePath: string,
  expectedSha: string,
): BaselineFile {
  const raw = readFileSync(absolutePath);
  expect(sha256Hex(raw)).toBe(expectedSha);
  const parsed = JSON.parse(raw.toString('utf8')) as BaselineFile;
  expect(Array.isArray(parsed.cases)).toBe(true);
  return parsed;
}

function defaultSlotStats(): ProblemSeriesSimSlotMetrics[] {
  return [
    {
      slotIndex: 0,
      classId: 'df_guardian',
      damageDealt: 10,
      damageTaken: 20,
      healingDealt: 0,
    },
    {
      slotIndex: 1,
      classId: 'at_swordsman',
      damageDealt: 30,
      damageTaken: 10,
      healingDealt: 0,
    },
    {
      slotIndex: 2,
      classId: 'at_sorcerer',
      damageDealt: 40,
      damageTaken: 5,
      healingDealt: 0,
    },
    {
      slotIndex: 3,
      classId: 'sp_cleric',
      damageDealt: 0,
      damageTaken: 8,
      healingDealt: 15,
    },
  ];
}

function waveCleared(waveIndex: number): ProblemSeriesSimWaveTimeline {
  return {
    waveIndex,
    startTick: waveIndex * 100,
    endTick: waveIndex * 100 + 50,
    startSec: waveIndex,
    endSec: waveIndex + 0.5,
    result: 'cleared',
  };
}

function waveDefeat(waveIndex: number): ProblemSeriesSimWaveTimeline {
  return {
    waveIndex,
    startTick: waveIndex * 100,
    endTick: waveIndex * 100 + 80,
    startSec: waveIndex,
    endSec: waveIndex + 0.8,
    result: 'defeat',
  };
}

function makeInput(
  battleRngSeed: string,
  overrides: Partial<ProblemSeriesSimInput> = {},
): ProblemSeriesSimInput {
  return {
    problemSeriesSeed: SERIES_SEED,
    battleRngSeed,
    maxTicks: MAX_TICKS,
    ...overrides,
  };
}

function makeResult(
  battleRngSeed: string,
  overrides: Partial<ProblemSeriesSimResult> = {},
): ProblemSeriesSimResult {
  const {
    appliedCombatModuleIdBySlot,
    acquiredPassivesBySlot,
    waves,
    slotStats,
    enemyWaveInputs,
    resourceLedger,
    ...rest
  } = overrides;
  return {
    problemSeriesSeed: SERIES_SEED,
    generatorVersion: GENERATOR_VERSION,
    seriesId: SERIES_ID,
    battleRngSeed,
    outcome: 'defeat',
    finalWaveIndex: 1,
    tickCount: 1000,
    durationSec: 10,
    waves: waves ?? [waveCleared(0), waveDefeat(1)],
    survivingAllies: 0,
    survivingEnemies: 2,
    totalRemainingAllyHp: 0,
    totalMaxAllyHp: 700,
    totalRemainingEnemyHp: 100,
    slotStats: slotStats ?? defaultSlotStats(),
    appliedCombatModuleIdBySlot: appliedCombatModuleIdBySlot ?? [
      'mod-a',
      'mod-b',
      'mod-c',
      'mod-d',
    ],
    acquiredPassivesBySlot: acquiredPassivesBySlot ?? [[], [], [], []],
    resourceLedger: resourceLedger ?? [],
    timedOut: false,
    enemyWaveInputs: enemyWaveInputs ?? [],
    ...rest,
  };
}

function makeCase(
  buildId: string,
  battleRngSeed: string,
  resultOverrides: Partial<ProblemSeriesSimResult> = {},
  inputOverrides: Partial<ProblemSeriesSimInput> = {},
): ProblemSeriesBalanceSignalCase {
  return {
    buildId,
    battleRngSeed,
    input: makeInput(battleRngSeed, inputOverrides),
    result: makeResult(battleRngSeed, resultOverrides),
  };
}

/** 3 build × 3 seed の矩形。既定は全件 Wave 2 敗北（即全滅・膠着なし）。 */
function rectangularGrid(
  customize?: (
    buildId: string,
    seed: string,
  ) => Partial<ProblemSeriesSimResult> | undefined,
): ProblemSeriesBalanceSignalCase[] {
  const builds = [BUILD_A, BUILD_B, BUILD_C];
  const seeds = [SEED_1, SEED_2, SEED_3];
  const cases: ProblemSeriesBalanceSignalCase[] = [];
  for (const buildId of builds) {
    for (const seed of seeds) {
      const overrides = customize?.(buildId, seed);
      cases.push(makeCase(buildId, seed, overrides));
    }
  }
  return cases;
}

function assertCoverage(
  report: ProblemSeriesBalanceSignalReport,
  caseCount: number,
  buildCount: number,
  seedCount: number,
): void {
  expect(report.evaluatedCaseCount).toBe(caseCount);
  expect(report.evaluatedBuildCount).toBe(buildCount);
  expect(report.evaluatedSeedCount).toBe(seedCount);
  expect(report.evaluatedPairCount).toBe(
    (buildCount * (buildCount - 1)) / 2,
  );
}

describe('problemSeriesBalanceSignals (R12n 1E)', () => {
  describe('signatures', () => {
    it('canonicalizes acquired passives per slot without dropping duplicates', () => {
      const result = makeResult(SEED_1, {
        acquiredPassivesBySlot: [
          ['z', 'a', 'a'],
          ['b'],
          [],
          ['m', 'm', 'c'],
        ],
      });
      const sig = appliedChoiceSignature(result);
      expect(sig).toContain('"a","a","z"');
      expect(sig).toContain('"c","m","m"');
      expect(JSON.parse(sig).acquiredPassivesBySlot[0]).toEqual(['a', 'a', 'z']);
    });

    it('battle metrics signature ignores applied choice and resource ledger', () => {
      const base = makeResult(SEED_1, {
        appliedCombatModuleIdBySlot: ['x', 'x', 'x', 'x'],
        acquiredPassivesBySlot: [['p'], [], [], []],
        resourceLedger: [
          { waveIndex: 0, grantAmount: 1, spentAmount: 1, remainingResource: 0 },
        ],
      });
      const alt = makeResult(SEED_1, {
        appliedCombatModuleIdBySlot: ['y', 'y', 'y', 'y'],
        acquiredPassivesBySlot: [['q'], ['q'], [], []],
        resourceLedger: [
          { waveIndex: 0, grantAmount: 99, spentAmount: 99, remainingResource: 0 },
        ],
      });
      expect(battleMetricsSignature(base)).toBe(battleMetricsSignature(alt));
      expect(appliedChoiceSignature(base)).not.toBe(appliedChoiceSignature(alt));
    });
  });

  describe('synthetic: immediate party wipe candidates', () => {
    it('fires for Wave 1 defeat and does not fire for Wave 2/3 defeat', () => {
      const cases = rectangularGrid((buildId, seed) => {
        if (buildId === BUILD_A && seed === SEED_1) {
          return {
            outcome: 'defeat',
            finalWaveIndex: 0,
            waves: [waveDefeat(0)],
            tickCount: 200,
            durationSec: 2,
          };
        }
        if (buildId === BUILD_A && seed === SEED_2) {
          return {
            outcome: 'defeat',
            finalWaveIndex: 1,
            waves: [waveCleared(0), waveDefeat(1)],
          };
        }
        if (buildId === BUILD_A && seed === SEED_3) {
          return {
            outcome: 'defeat',
            finalWaveIndex: 2,
            waves: [waveCleared(0), waveCleared(1), waveDefeat(2)],
          };
        }
        return undefined;
      });
      const report = detectProblemSeriesBalanceSignals(cases);
      expect(report.immediatePartyWipeCandidates.length).toBeGreaterThan(0);
      expect(report.immediatePartyWipeCandidates).toEqual([
        { buildId: BUILD_A, battleRngSeed: SEED_1 },
      ]);
      expect(report.immediatePartyWipeCandidates).toHaveLength(1);
    });
  });

  describe('synthetic: stalemate candidates', () => {
    it('fires only when all three timeout conditions match', () => {
      const cases = rectangularGrid((buildId, seed) => {
        if (buildId === BUILD_B && seed === SEED_2) {
          return {
            outcome: 'timeout',
            timedOut: true,
            tickCount: MAX_TICKS,
            finalWaveIndex: 1,
            waves: [
              waveCleared(0),
              {
                waveIndex: 1,
                startTick: 100,
                endTick: MAX_TICKS,
                startSec: 1,
                endSec: MAX_TICKS / 60,
                result: 'timeout',
              },
            ],
            durationSec: MAX_TICKS / 60,
          };
        }
        return undefined;
      });
      const report = detectProblemSeriesBalanceSignals(cases);
      expect(report.stalemateCandidates.length).toBeGreaterThan(0);
      expect(report.stalemateCandidates).toEqual([
        { buildId: BUILD_B, battleRngSeed: SEED_2 },
      ]);
    });

    it.each([
      {
        label: 'A only (outcome timeout)',
        overrides: {
          outcome: 'timeout' as const,
          timedOut: false,
          tickCount: 1000,
        },
      },
      {
        label: 'B only (timedOut true)',
        overrides: {
          outcome: 'defeat' as const,
          timedOut: true,
          tickCount: 1000,
        },
      },
      {
        label: 'C only (tickCount maxTicks)',
        overrides: {
          outcome: 'defeat' as const,
          timedOut: false,
          tickCount: MAX_TICKS,
        },
      },
      {
        label: 'A+B only (outcome+timedOut)',
        overrides: {
          outcome: 'timeout' as const,
          timedOut: true,
          tickCount: 1000,
        },
      },
      {
        label: 'A+C only (outcome+maxTicks)',
        overrides: {
          outcome: 'timeout' as const,
          timedOut: false,
          tickCount: MAX_TICKS,
        },
      },
      {
        label: 'B+C only (timedOut+maxTicks)',
        overrides: {
          outcome: 'defeat' as const,
          timedOut: true,
          tickCount: MAX_TICKS,
        },
      },
    ])('throws on timeout triple contradiction: $label', ({ overrides }) => {
      const cases = rectangularGrid((buildId, seed) => {
        if (buildId === BUILD_A && seed === SEED_1) {
          return overrides;
        }
        return undefined;
      });
      expect(() => detectProblemSeriesBalanceSignals(cases)).toThrow(
        /timeout triple conditions contradicted/,
      );
    });
  });

  describe('synthetic: ineffective choice candidate pairs', () => {
    it('fires when every seed has different applied choice and identical metrics', () => {
      const cases = rectangularGrid((buildId, seed) => {
        const metricsBase = {
          outcome: 'defeat' as const,
          finalWaveIndex: 1,
          tickCount: 5000,
          durationSec: 50,
          survivingAllies: 0,
          survivingEnemies: 1,
          totalRemainingAllyHp: 0,
          totalMaxAllyHp: 700,
          totalRemainingEnemyHp: 40,
          timedOut: false,
          waves: [waveCleared(0), waveDefeat(1)],
          slotStats: defaultSlotStats(),
        };
        if (buildId === BUILD_A) {
          return {
            ...metricsBase,
            appliedCombatModuleIdBySlot: ['mod-a1', 'mod-b', 'mod-c', 'mod-d'],
            acquiredPassivesBySlot: [['p-a'], [], [], []],
          };
        }
        if (buildId === BUILD_B) {
          return {
            ...metricsBase,
            appliedCombatModuleIdBySlot: ['mod-a2', 'mod-b', 'mod-c', 'mod-d'],
            acquiredPassivesBySlot: [['p-b'], [], [], []],
          };
        }
        // BUILD_C: different metrics so not paired with A/B as ineffective
        return {
          ...metricsBase,
          tickCount: 5000 + (seed === SEED_1 ? 1 : 0),
          appliedCombatModuleIdBySlot: ['mod-a3', 'mod-b', 'mod-c', 'mod-d'],
          acquiredPassivesBySlot: [['p-c'], [], [], []],
        };
      });
      const report = detectProblemSeriesBalanceSignals(cases);
      expect(report.ineffectiveChoiceCandidatePairs.length).toBeGreaterThan(0);
      expect(report.ineffectiveChoiceCandidatePairs).toEqual([
        { buildIdA: BUILD_A, buildIdB: BUILD_B },
      ]);
    });

    it('does not fire when one seed has a metrics difference', () => {
      const cases = rectangularGrid((buildId, seed) => {
        const metricsBase = {
          outcome: 'defeat' as const,
          finalWaveIndex: 1,
          tickCount: 5000,
          durationSec: 50,
          timedOut: false,
          waves: [waveCleared(0), waveDefeat(1)],
          slotStats: defaultSlotStats(),
        };
        const choiceA = {
          appliedCombatModuleIdBySlot: ['mod-a1', 'mod-b', 'mod-c', 'mod-d'],
          acquiredPassivesBySlot: [['p-a'], [], [], []] as const,
        };
        const choiceB = {
          appliedCombatModuleIdBySlot: ['mod-a2', 'mod-b', 'mod-c', 'mod-d'],
          acquiredPassivesBySlot: [['p-b'], [], [], []] as const,
        };
        if (buildId === BUILD_A) {
          return { ...metricsBase, ...choiceA };
        }
        if (buildId === BUILD_B) {
          return {
            ...metricsBase,
            ...choiceB,
            tickCount: seed === SEED_3 ? 5001 : 5000,
          };
        }
        return {
          ...metricsBase,
          tickCount: 6000,
          appliedCombatModuleIdBySlot: ['mod-a3', 'mod-b', 'mod-c', 'mod-d'],
          acquiredPassivesBySlot: [['p-c'], [], [], []],
        };
      });
      const report = detectProblemSeriesBalanceSignals(cases);
      expect(report.ineffectiveChoiceCandidatePairs).toEqual([]);
    });

    it('does not fire when only planned differs and applied choice is identical', () => {
      const cases = rectangularGrid((buildId) => {
        const sharedApplied = {
          outcome: 'defeat' as const,
          finalWaveIndex: 1,
          tickCount: 5000,
          durationSec: 50,
          timedOut: false,
          waves: [waveCleared(0), waveDefeat(1)],
          slotStats: defaultSlotStats(),
          appliedCombatModuleIdBySlot: ['mod-same', 'mod-b', 'mod-c', 'mod-d'],
          acquiredPassivesBySlot: [[], [], [], []],
        };
        if (buildId === BUILD_C) {
          return {
            ...sharedApplied,
            tickCount: 7000,
            appliedCombatModuleIdBySlot: ['mod-other', 'mod-b', 'mod-c', 'mod-d'],
          };
        }
        return sharedApplied;
      });
      // planned 差は input.wavePlans にだけ置き、実適用は同一のまま。
      const withPlanned: ProblemSeriesBalanceSignalCase[] = cases.map((entry) => {
        if (entry.buildId === BUILD_A) {
          return {
            ...entry,
            input: {
              ...entry.input,
              wavePlans: [
                {
                  passiveAcquisitions: [
                    { slotIndex: 1, passiveId: 'planned-only-a' },
                  ],
                },
                {},
                {},
              ],
            },
          };
        }
        if (entry.buildId === BUILD_B) {
          return {
            ...entry,
            input: {
              ...entry.input,
              wavePlans: [
                {
                  passiveAcquisitions: [
                    { slotIndex: 1, passiveId: 'planned-only-b' },
                  ],
                },
                {},
                {},
              ],
            },
          };
        }
        return entry;
      });
      const report = detectProblemSeriesBalanceSignals(withPlanned);
      expect(
        withPlanned.some(
          (c) =>
            c.buildId === BUILD_A &&
            (c.input.wavePlans?.[0]?.passiveAcquisitions?.length ?? 0) > 0,
        ),
      ).toBe(true);
      expect(
        withPlanned.some(
          (c) =>
            c.buildId === BUILD_B &&
            (c.input.wavePlans?.[0]?.passiveAcquisitions?.length ?? 0) > 0,
        ),
      ).toBe(true);
      expect(report.ineffectiveChoiceCandidatePairs).toEqual([]);
    });
  });

  describe('synthetic: single solution candidates', () => {
    it('fires when exactly one build wins all seeds and others never win', () => {
      const cases = rectangularGrid((buildId) => {
        if (buildId === BUILD_A) {
          return {
            outcome: 'victory',
            finalWaveIndex: 2,
            timedOut: false,
            tickCount: 8000,
            durationSec: 80,
            survivingAllies: 4,
            survivingEnemies: 0,
            totalRemainingAllyHp: 400,
            totalRemainingEnemyHp: 0,
            waves: [waveCleared(0), waveCleared(1), waveCleared(2)],
            appliedCombatModuleIdBySlot: ['mod-a', 'mod-b', 'mod-c', 'mod-d'],
            acquiredPassivesBySlot: [['win'], [], [], []],
          };
        }
        if (buildId === BUILD_B) {
          return {
            outcome: 'defeat',
            finalWaveIndex: 1,
            timedOut: false,
            appliedCombatModuleIdBySlot: ['mod-a', 'mod-b', 'mod-c', 'mod-d'],
            acquiredPassivesBySlot: [['lose-b'], [], [], []],
          };
        }
        return {
          outcome: 'defeat',
          finalWaveIndex: 0,
          timedOut: false,
          waves: [waveDefeat(0)],
          appliedCombatModuleIdBySlot: ['mod-a', 'mod-b', 'mod-c', 'mod-d'],
          acquiredPassivesBySlot: [['lose-c'], [], [], []],
        };
      });
      const report = detectProblemSeriesBalanceSignals(cases);
      expect(report.singleSolutionCandidateBuildIds.length).toBeGreaterThan(0);
      expect(report.singleSolutionCandidateBuildIds).toEqual([BUILD_A]);
    });

    it('does not fire when zero builds win all seeds', () => {
      const cases = rectangularGrid((buildId) => {
        if (buildId === BUILD_A) {
          return {
            outcome: 'defeat',
            finalWaveIndex: 1,
            timedOut: false,
            acquiredPassivesBySlot: [['lose-a'], [], [], []],
          };
        }
        if (buildId === BUILD_B) {
          return {
            outcome: 'defeat',
            finalWaveIndex: 1,
            timedOut: false,
            acquiredPassivesBySlot: [['lose-b'], [], [], []],
          };
        }
        return {
          outcome: 'defeat',
          finalWaveIndex: 0,
          timedOut: false,
          waves: [waveDefeat(0)],
          acquiredPassivesBySlot: [['lose-c'], [], [], []],
        };
      });
      const report = detectProblemSeriesBalanceSignals(cases);
      expect(report.singleSolutionCandidateBuildIds).toEqual([]);
    });

    it('does not fire when two builds win all seeds', () => {
      const cases = rectangularGrid((buildId) => {
        if (buildId === BUILD_A) {
          return {
            outcome: 'victory',
            finalWaveIndex: 2,
            timedOut: false,
            waves: [waveCleared(0), waveCleared(1), waveCleared(2)],
            acquiredPassivesBySlot: [['win-a'], [], [], []],
          };
        }
        if (buildId === BUILD_B) {
          return {
            outcome: 'victory',
            finalWaveIndex: 2,
            timedOut: false,
            waves: [waveCleared(0), waveCleared(1), waveCleared(2)],
            acquiredPassivesBySlot: [['win-b'], [], [], []],
          };
        }
        return {
          outcome: 'defeat',
          finalWaveIndex: 1,
          timedOut: false,
          acquiredPassivesBySlot: [['lose-c'], [], [], []],
        };
      });
      const report = detectProblemSeriesBalanceSignals(cases);
      expect(report.singleSolutionCandidateBuildIds).toEqual([]);
    });

    it('does not fire when a second build also wins one seed', () => {
      const cases = rectangularGrid((buildId, seed) => {
        if (buildId === BUILD_A) {
          return {
            outcome: 'victory',
            finalWaveIndex: 2,
            timedOut: false,
            waves: [waveCleared(0), waveCleared(1), waveCleared(2)],
            acquiredPassivesBySlot: [['win-a'], [], [], []],
          };
        }
        if (buildId === BUILD_B && seed === SEED_1) {
          return {
            outcome: 'victory',
            finalWaveIndex: 2,
            timedOut: false,
            waves: [waveCleared(0), waveCleared(1), waveCleared(2)],
            acquiredPassivesBySlot: [['win-b'], [], [], []],
          };
        }
        return {
          outcome: 'defeat',
          finalWaveIndex: 1,
          timedOut: false,
          acquiredPassivesBySlot: [[`lose-${buildId}`], [], [], []],
        };
      });
      const report = detectProblemSeriesBalanceSignals(cases);
      expect(report.singleSolutionCandidateBuildIds).toEqual([]);
    });

    it('does not fire when applied choice columns are identical across builds', () => {
      const cases = rectangularGrid((buildId) => {
        if (buildId === BUILD_A) {
          return {
            outcome: 'victory',
            finalWaveIndex: 2,
            timedOut: false,
            waves: [waveCleared(0), waveCleared(1), waveCleared(2)],
            appliedCombatModuleIdBySlot: ['same', 'same', 'same', 'same'],
            acquiredPassivesBySlot: [[], [], [], []],
          };
        }
        return {
          outcome: 'defeat',
          finalWaveIndex: 1,
          timedOut: false,
          appliedCombatModuleIdBySlot: ['same', 'same', 'same', 'same'],
          acquiredPassivesBySlot: [[], [], [], []],
        };
      });
      const report = detectProblemSeriesBalanceSignals(cases);
      expect(report.singleSolutionCandidateBuildIds).toEqual([]);
    });

    it('does not fire when a build has mixed outcomes across seeds', () => {
      const cases = rectangularGrid((buildId, seed) => {
        if (buildId === BUILD_A) {
          return {
            outcome: 'victory',
            finalWaveIndex: 2,
            timedOut: false,
            waves: [waveCleared(0), waveCleared(1), waveCleared(2)],
            acquiredPassivesBySlot: [['win-a'], [], [], []],
          };
        }
        if (buildId === BUILD_B) {
          return {
            outcome: seed === SEED_2 ? 'victory' : 'defeat',
            finalWaveIndex: seed === SEED_2 ? 2 : 1,
            timedOut: false,
            waves:
              seed === SEED_2
                ? [waveCleared(0), waveCleared(1), waveCleared(2)]
                : [waveCleared(0), waveDefeat(1)],
            acquiredPassivesBySlot: [['mixed-b'], [], [], []],
          };
        }
        return {
          outcome: 'defeat',
          finalWaveIndex: 1,
          timedOut: false,
          acquiredPassivesBySlot: [['lose-c'], [], [], []],
        };
      });
      const report = detectProblemSeriesBalanceSignals(cases);
      expect(report.singleSolutionCandidateBuildIds).toEqual([]);
    });

    it('throws for fewer than 3 builds', () => {
      const cases = [
        makeCase(BUILD_A, SEED_1),
        makeCase(BUILD_A, SEED_2),
        makeCase(BUILD_A, SEED_3),
        makeCase(BUILD_B, SEED_1),
        makeCase(BUILD_B, SEED_2),
        makeCase(BUILD_B, SEED_3),
      ];
      expect(() => detectProblemSeriesBalanceSignals(cases)).toThrow(
        /at least 3 builds/,
      );
    });

    it('throws for fewer than 3 seeds', () => {
      const cases = [
        makeCase(BUILD_A, SEED_1),
        makeCase(BUILD_A, SEED_2),
        makeCase(BUILD_B, SEED_1),
        makeCase(BUILD_B, SEED_2),
        makeCase(BUILD_C, SEED_1),
        makeCase(BUILD_C, SEED_2),
      ];
      expect(() => detectProblemSeriesBalanceSignals(cases)).toThrow(
        /at least 3 battleRngSeeds/,
      );
    });

    it('throws when rectangular coverage is missing', () => {
      const cases = rectangularGrid().filter(
        (c) => !(c.buildId === BUILD_C && c.battleRngSeed === SEED_3),
      );
      expect(cases.length).toBe(8);
      expect(() => detectProblemSeriesBalanceSignals(cases)).toThrow(
        /rectangular coverage missing/,
      );
    });
  });

  describe('fail-closed input validation', () => {
    it('throws on empty cases', () => {
      expect(() => detectProblemSeriesBalanceSignals([])).toThrow(
        /must not be empty/,
      );
    });

    it('throws on duplicate buildId × battleRngSeed', () => {
      const cases = [
        ...rectangularGrid().slice(0, 8),
        makeCase(BUILD_A, SEED_1, { tickCount: 999 }),
      ];
      expect(() => detectProblemSeriesBalanceSignals(cases)).toThrow(
        /duplicate buildId × battleRngSeed/,
      );
    });

    it('throws on input/result problemSeriesSeed mismatch', () => {
      const cases = rectangularGrid().map((entry, index) => {
        if (index !== 0) return entry;
        return {
          ...entry,
          result: { ...entry.result, problemSeriesSeed: 'other-seed' },
        };
      });
      expect(() => detectProblemSeriesBalanceSignals(cases)).toThrow(
        /problemSeriesSeed mismatch/,
      );
    });

    it('throws on mixed problemSeriesSeed across cases', () => {
      const cases = rectangularGrid().map((entry) => {
        if (entry.buildId !== BUILD_C || entry.battleRngSeed !== SEED_3) {
          return entry;
        }
        return {
          ...entry,
          input: { ...entry.input, problemSeriesSeed: 'other-series-seed' },
          result: { ...entry.result, problemSeriesSeed: 'other-series-seed' },
        };
      });
      expect(() => detectProblemSeriesBalanceSignals(cases)).toThrow(
        /mixed problemSeriesSeed/,
      );
    });

    it('throws on mixed generatorVersion across cases', () => {
      const cases = rectangularGrid((buildId, seed) => {
        if (buildId === BUILD_C && seed === SEED_3) {
          return { generatorVersion: 'other-generator' };
        }
        return undefined;
      });
      expect(() => detectProblemSeriesBalanceSignals(cases)).toThrow(
        /mixed generatorVersion/,
      );
    });

    it('throws on mixed seriesId across cases', () => {
      const cases = rectangularGrid((buildId, seed) => {
        if (buildId === BUILD_C && seed === SEED_3) {
          return { seriesId: 'other-series' };
        }
        return undefined;
      });
      expect(() => detectProblemSeriesBalanceSignals(cases)).toThrow(
        /mixed seriesId/,
      );
    });

    it('throws on input/result battleRngSeed mismatch', () => {
      const cases = rectangularGrid().map((entry, index) => {
        if (index !== 0) return entry;
        return {
          ...entry,
          result: { ...entry.result, battleRngSeed: 'mismatched-rng' },
        };
      });
      expect(() => detectProblemSeriesBalanceSignals(cases)).toThrow(
        /battleRngSeed input\/result mismatch/,
      );
    });

    it('throws on case/input battleRngSeed mismatch', () => {
      const cases = rectangularGrid().map((entry, index) => {
        if (index !== 0) return entry;
        return {
          ...entry,
          battleRngSeed: 'case-label-mismatch',
        };
      });
      expect(() => detectProblemSeriesBalanceSignals(cases)).toThrow(
        /battleRngSeed case\/input mismatch/,
      );
    });

    it('throws on non-finite battle metrics values', () => {
      const cases = rectangularGrid((buildId, seed) => {
        if (buildId === BUILD_A && seed === SEED_1) {
          return { durationSec: Number.NaN };
        }
        return undefined;
      });
      expect(() => detectProblemSeriesBalanceSignals(cases)).toThrow(
        /finite number/,
      );
    });

    it('throws when maxTicks is not the standard value', () => {
      const cases = rectangularGrid().map((entry, index) => {
        if (index !== 0) return entry;
        return {
          ...entry,
          input: { ...entry.input, maxTicks: 89999 },
        };
      });
      expect(() => detectProblemSeriesBalanceSignals(cases)).toThrow(
        /maxTicks must be 90000/,
      );
    });
  });

  describe('input order independence', () => {
    it('returns identical reports for reversed and shuffled input order', () => {
      const base = rectangularGrid((buildId, seed) => {
        if (buildId === BUILD_A && seed === SEED_1) {
          return {
            outcome: 'defeat',
            finalWaveIndex: 0,
            waves: [waveDefeat(0)],
          };
        }
        if (buildId === BUILD_B && seed === SEED_2) {
          return {
            outcome: 'timeout',
            timedOut: true,
            tickCount: MAX_TICKS,
            finalWaveIndex: 1,
            waves: [
              waveCleared(0),
              {
                waveIndex: 1,
                startTick: 100,
                endTick: MAX_TICKS,
                startSec: 1,
                endSec: MAX_TICKS / 60,
                result: 'timeout',
              },
            ],
            durationSec: MAX_TICKS / 60,
          };
        }
        return {
          appliedCombatModuleIdBySlot: [
            `mod-${buildId}`,
            'mod-b',
            'mod-c',
            'mod-d',
          ],
          acquiredPassivesBySlot: [[`p-${buildId}`], [], [], []],
          tickCount: 4000,
          durationSec: 40,
          outcome: 'defeat',
          finalWaveIndex: 1,
          timedOut: false,
          waves: [waveCleared(0), waveDefeat(1)],
          slotStats: defaultSlotStats(),
        };
      });
      const reversed = [...base].reverse();
      const shuffled = [
        base[5]!,
        base[0]!,
        base[8]!,
        base[2]!,
        base[7]!,
        base[1]!,
        base[4]!,
        base[6]!,
        base[3]!,
      ];
      const reportBase = detectProblemSeriesBalanceSignals(base);
      const reportReversed = detectProblemSeriesBalanceSignals(reversed);
      const reportShuffled = detectProblemSeriesBalanceSignals(shuffled);
      expect(reportReversed).toEqual(reportBase);
      expect(reportShuffled).toEqual(reportBase);
      expect(reportBase.immediatePartyWipeCandidates.length).toBeGreaterThan(0);
      expect(reportBase.stalemateCandidates.length).toBeGreaterThan(0);
    });
  });

  describe('production baseline connection (read-only)', () => {
    /**
     * 現行 baseline で 4 候補が空でも、coverage を固定する。
     * 候補なし ≠ 強度合格 / Player 完了 / Backend 完了 / R12n 完了。
     */
    it('series A baseline: coverage 9=3×3 and all four candidate arrays empty', () => {
      const baseline = loadBaselineReadonly(
        baselineAPath,
        EXPECTED_BASELINE_A_SHA256,
      );
      expect(baseline.sourceHead).toBe(
        '88a470090442e83dfdc61542074d7e5e318b2d89',
      );
      expect(baseline.cases.length).toBe(9);
      const report = detectProblemSeriesBalanceSignals(baseline.cases);
      expect(report.evaluatedCaseCount).toBe(9);
      expect(report.evaluatedBuildCount).toBe(3);
      expect(report.evaluatedSeedCount).toBe(3);
      assertCoverage(report, 9, 3, 3);
      expect(report.problemSeriesSeed).toBe(baseline.problemSeriesSeed);
      expect(report.generatorVersion).toBe(baseline.generatorVersion);
      expect(report.seriesId).toBe(baseline.seriesId);
      expect(report.maxTicks).toBe(MAX_TICKS);
      expect(report.immediatePartyWipeCandidates).toEqual([]);
      expect(report.stalemateCandidates).toEqual([]);
      expect(report.ineffectiveChoiceCandidatePairs).toEqual([]);
      expect(report.singleSolutionCandidateBuildIds).toEqual([]);
      // 空候補は完了宣言に使わない（coverage 固定が本試験の主 assertion）。
      expect(report.evaluatedCaseCount).toBeGreaterThan(0);
    });

    it('series B baseline: coverage 9=3×3 and all four candidate arrays empty', () => {
      const baseline = loadBaselineReadonly(
        baselineBPath,
        EXPECTED_BASELINE_B_SHA256,
      );
      expect(baseline.sourceHead).toBe(
        '88a470090442e83dfdc61542074d7e5e318b2d89',
      );
      expect(baseline.cases.length).toBe(9);
      const report = detectProblemSeriesBalanceSignals(baseline.cases);
      expect(report.evaluatedCaseCount).toBe(9);
      expect(report.evaluatedBuildCount).toBe(3);
      expect(report.evaluatedSeedCount).toBe(3);
      assertCoverage(report, 9, 3, 3);
      expect(report.problemSeriesSeed).toBe(baseline.problemSeriesSeed);
      expect(report.generatorVersion).toBe(baseline.generatorVersion);
      expect(report.seriesId).toBe(baseline.seriesId);
      expect(report.maxTicks).toBe(MAX_TICKS);
      expect(report.immediatePartyWipeCandidates).toEqual([]);
      expect(report.stalemateCandidates).toEqual([]);
      expect(report.ineffectiveChoiceCandidatePairs).toEqual([]);
      expect(report.singleSolutionCandidateBuildIds).toEqual([]);
      expect(report.evaluatedCaseCount).toBeGreaterThan(0);
    });
  });
});
