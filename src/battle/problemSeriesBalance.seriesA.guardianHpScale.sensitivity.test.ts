/**
 * R12n 1F / 1F-R1 / 1M — 系列A Wave 2 鉄衛士 hpScale 感度比較と production default 回帰。
 *
 * 1M: production catalog は Wave2 guardian 2 group に `hpScale=0.75` を採用。
 * baseline JSON / SHA は変更前証拠として不変。
 * `hpScale=1.00` は変更前 baseline 再現、`hpScale=0.75` は production 採用値と一致する観測点。
 * 9 scale × 9 case の感度比較履歴は維持する（勝率・平均・近似閾値への集約や自動合格断定はしない）。
 * 候補検出は自動不合格・強度合格ではない。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { resolveProblemSeriesFromSeed } from './problemSeries/seedResolve.ts';
import {
  toProblemSeriesBattleWaves,
  type ProblemSeriesBattleEnemyGroup,
  type ProblemSeriesBattleWave,
} from './problemSeries/toBattleWaves.ts';
import {
  detectProblemSeriesBalanceSignals,
  type ProblemSeriesBalanceSignalCase,
  type ProblemSeriesBalanceSignalReport,
} from './test/problemSeriesBalanceSignals.ts';
import {
  createSeriesAWave2GuardianHpScaleTransform,
  normalizeProblemSeriesSimResultForCompare,
  runProblemSeriesSim,
  SERIES_A_WAVE2_GUARDIAN_HP_SCALE_TARGET,
  type ProblemSeriesSimInput,
  type ProblemSeriesSimResult,
  type ProblemSeriesSimWavePlan,
} from './test/problemSeriesSim.harness.ts';
import { PARTY_SLOT_COUNT } from './types.ts';

const BASELINE_RELATIVE_PATH =
  'src/battle/test/baselines/r12n-series-a-before.json';
const EXPECTED_BASELINE_A_SHA256 =
  '2c6e6ad212bfaffb3259613d2d15a39a7910f7b7ba0474240f72cedd5c49062c';
const EXPECTED_BASELINE_B_SHA256 =
  'b575d9830b57bce29c3fc2d13ebb8db7044ee592d3363aae1bf457b0d7e1d47c';

const PROBLEM_SERIES_SEED = 'fixture-a';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_ID = 'r12m_series_a';

/** 1M production 採用値（数値正本は catalog JSON）。 */
const PRODUCTION_GUARDIAN_HP_SCALE = 0.75;
/** 変更前 baseline 再現（プロパティ省略相当）。 */
const BEFORE_CHANGE_GUARDIAN_HP_SCALE = 1.0;

/** 1F + 1F-R1 統合観測点。近似閾値・自動採用基準ではない。0.75 は production 採用値と一致。 */
const HP_SCALE_POINTS = [
  1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6,
] as const;

const BUILD_NO_SPEND = 'no-spend-control';
const BUILD_KNOWN_ATTACK = 'known-attack-24';
const BUILD_ALTERNATE_CORE = 'alternate-core-24';
const BUILD_IDS = [
  BUILD_NO_SPEND,
  BUILD_KNOWN_ATTACK,
  BUILD_ALTERNATE_CORE,
] as const;

const BATTLE_RNG_SEEDS = [
  'r12n-1c-a-01',
  'r12n-1c-a-02',
  'r12n-1c-a-03',
] as const;

interface SeriesABaselineCase {
  readonly buildId: string;
  readonly battleRngSeed: string;
  readonly input: ProblemSeriesSimInput;
  readonly result: ProblemSeriesSimResult;
}

interface SeriesABaselineFile {
  readonly schemaVersion: number;
  readonly recordedAt: string;
  readonly sourceHead: string;
  readonly problemSeriesSeed: string;
  readonly generatorVersion: string;
  readonly seriesId: string;
  readonly purpose: string;
  readonly maxTicks: number;
  readonly cases: readonly SeriesABaselineCase[];
}

interface SensitivityCaseRow {
  readonly hpScale: number;
  readonly buildId: string;
  readonly battleRngSeed: string;
  readonly outcome: ProblemSeriesSimResult['outcome'];
  readonly finalWaveIndex: number;
  readonly waveResults: readonly string[];
  readonly tickCount: number;
  readonly totalRemainingAllyHp: number;
  readonly totalRemainingEnemyHp: number;
  readonly reachedWave3: boolean;
  readonly wave3PlannedApplied: boolean;
  readonly appliedCombatModuleIdBySlot: readonly string[];
  readonly acquiredPassivesBySlot: readonly (readonly string[])[];
  readonly resourceLedger: ProblemSeriesSimResult['resourceLedger'];
  readonly slotStats: ProblemSeriesSimResult['slotStats'];
}

const baselineAPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'test/baselines/r12n-series-a-before.json',
);
const baselineBPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'test/baselines/r12n-series-b-before.json',
);

const transformContext = {
  seriesId: SERIES_ID,
  problemSeriesSeed: PROBLEM_SERIES_SEED,
  generatorVersion: GENERATOR_VERSION,
} as const;

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function loadBaselineA(): SeriesABaselineFile {
  const raw = readFileSync(baselineAPath);
  expect(sha256Hex(raw)).toBe(EXPECTED_BASELINE_A_SHA256);
  const parsed = JSON.parse(raw.toString('utf8')) as SeriesABaselineFile;
  expect(parsed.cases).toHaveLength(9);
  expect(parsed.problemSeriesSeed).toBe(PROBLEM_SERIES_SEED);
  expect(parsed.generatorVersion).toBe(GENERATOR_VERSION);
  expect(parsed.seriesId).toBe(SERIES_ID);
  return parsed;
}

function assertBaselineShaUnchanged(): void {
  expect(sha256Hex(readFileSync(baselineAPath))).toBe(EXPECTED_BASELINE_A_SHA256);
  expect(sha256Hex(readFileSync(baselineBPath))).toBe(EXPECTED_BASELINE_B_SHA256);
  expect(BASELINE_RELATIVE_PATH.replace(/\\/g, '/')).toContain(
    'r12n-series-a-before.json',
  );
}

function loadProductionBattleWaves(): ProblemSeriesBattleWave[] {
  const gameData = loadGameData();
  const resolved = resolveProblemSeriesFromSeed(
    gameData.problemSeriesCatalog,
    PROBLEM_SERIES_SEED,
  );
  expect(resolved.series.seriesId).toBe(SERIES_ID);
  expect(resolved.generatorVersion).toBe(GENERATOR_VERSION);
  return toProblemSeriesBattleWaves(resolved.series);
}

function groupIdentityWithoutHpScale(
  group: ProblemSeriesBattleEnemyGroup,
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...group };
  delete copy.hpScale;
  return copy;
}

/**
 * transform が Wave2 鉄衛士 2 group の hpScale 以外を変えていないことを deep 比較で固定。
 * production が既に 0.75 を持つ場合でも、transform 出力の境界だけを見る。
 */
function assertTransformTouchesOnlyWave2GuardianHpScale(
  production: readonly ProblemSeriesBattleWave[],
  transformed: readonly ProblemSeriesBattleWave[],
  hpScale: number,
): void {
  expect(transformed).toHaveLength(3);
  expect(production).toHaveLength(3);

  for (let waveIndex = 0; waveIndex < 3; waveIndex++) {
    const before = production[waveIndex]!;
    const after = transformed[waveIndex]!;
    expect(after.prepResourceGrant).toBe(before.prepResourceGrant);
    expect(after.enemyGroups).toHaveLength(before.enemyGroups.length);

    if (waveIndex !== SERIES_A_WAVE2_GUARDIAN_HP_SCALE_TARGET.waveIndex) {
      expect(after).toEqual(before);
      continue;
    }

    let guardianCount = 0;
    for (let groupIndex = 0; groupIndex < before.enemyGroups.length; groupIndex++) {
      const beforeGroup = before.enemyGroups[groupIndex]!;
      const afterGroup = after.enemyGroups[groupIndex]!;
      expect(groupIdentityWithoutHpScale(afterGroup)).toEqual(
        groupIdentityWithoutHpScale(beforeGroup),
      );
      if (beforeGroup.classId === SERIES_A_WAVE2_GUARDIAN_HP_SCALE_TARGET.classId) {
        guardianCount += 1;
        if (hpScale === 1) {
          expect(Object.prototype.hasOwnProperty.call(afterGroup, 'hpScale')).toBe(
            false,
          );
        } else {
          expect(afterGroup.hpScale).toBe(hpScale);
        }
      } else {
        expect(afterGroup).toEqual(beforeGroup);
      }
    }
    expect(guardianCount).toBe(
      SERIES_A_WAVE2_GUARDIAN_HP_SCALE_TARGET.expectedGuardianGroupCount,
    );
  }
}

/**
 * production Wave 構造: Wave2 guardian のみ hpScale=0.75。それ以外は変更前構造と同一。
 */
function assertProductionGuardianHpScaleOnly(
  production: readonly ProblemSeriesBattleWave[],
): void {
  const beforeChange = createSeriesAWave2GuardianHpScaleTransform(
    BEFORE_CHANGE_GUARDIAN_HP_SCALE,
  )(production, transformContext);

  expect(production).toHaveLength(3);
  expect(beforeChange).toHaveLength(3);

  expect(production[0]).toEqual(beforeChange[0]);
  expect(production[2]).toEqual(beforeChange[2]);

  const prodWave2 = production[1]!;
  const beforeWave2 = beforeChange[1]!;
  expect(prodWave2.prepResourceGrant).toBe(beforeWave2.prepResourceGrant);
  expect(prodWave2.enemyGroups).toHaveLength(beforeWave2.enemyGroups.length);

  let guardianCount = 0;
  for (let i = 0; i < beforeWave2.enemyGroups.length; i++) {
    const prodGroup = prodWave2.enemyGroups[i]!;
    const beforeGroup = beforeWave2.enemyGroups[i]!;
    if (prodGroup.classId === SERIES_A_WAVE2_GUARDIAN_HP_SCALE_TARGET.classId) {
      guardianCount += 1;
      expect(prodGroup.hpScale).toBe(PRODUCTION_GUARDIAN_HP_SCALE);
      expect(groupIdentityWithoutHpScale(prodGroup)).toEqual(
        groupIdentityWithoutHpScale(beforeGroup),
      );
      expect(Object.prototype.hasOwnProperty.call(beforeGroup, 'hpScale')).toBe(
        false,
      );
    } else {
      expect(prodGroup).toEqual(beforeGroup);
    }
  }
  expect(guardianCount).toBe(
    SERIES_A_WAVE2_GUARDIAN_HP_SCALE_TARGET.expectedGuardianGroupCount,
  );
}

function wave3PlannedPassiveIds(
  wavePlans: readonly (ProblemSeriesSimWavePlan | undefined)[],
): string[] {
  const ids: string[] = [];
  for (const acquire of wavePlans[2]?.passiveAcquisitions ?? []) {
    ids.push(acquire.passiveId);
  }
  return ids;
}

function allAcquiredPassiveIds(result: ProblemSeriesSimResult): string[] {
  const ids: string[] = [];
  for (const slot of result.acquiredPassivesBySlot) {
    ids.push(...slot);
  }
  return ids;
}

function expectedAcquiredPassivesBySlot(
  wavePlans: readonly (ProblemSeriesSimWavePlan | undefined)[],
  finalWaveIndex: number,
): string[][] {
  const bySlot: string[][] = Array.from({ length: PARTY_SLOT_COUNT }, () => []);
  for (let waveIndex = 0; waveIndex <= finalWaveIndex; waveIndex++) {
    for (const acquire of wavePlans[waveIndex]?.passiveAcquisitions ?? []) {
      bySlot[acquire.slotIndex]!.push(acquire.passiveId);
    }
  }
  return bySlot;
}

function assertCaseMetricsPresent(result: ProblemSeriesSimResult): void {
  expect(result.seriesId).toBe(SERIES_ID);
  expect(result.problemSeriesSeed).toBe(PROBLEM_SERIES_SEED);
  expect(result.generatorVersion).toBe(GENERATOR_VERSION);
  expect(Number.isFinite(result.tickCount)).toBe(true);
  expect(result.tickCount).toBeGreaterThan(0);
  expect(Number.isFinite(result.totalRemainingAllyHp)).toBe(true);
  expect(Number.isFinite(result.totalRemainingEnemyHp)).toBe(true);
  expect(result.slotStats).toHaveLength(PARTY_SLOT_COUNT);
  expect(result.appliedCombatModuleIdBySlot).toHaveLength(PARTY_SLOT_COUNT);
  expect(result.acquiredPassivesBySlot).toHaveLength(PARTY_SLOT_COUNT);
  expect(result.resourceLedger.length).toBe(result.finalWaveIndex + 1);
  expect(result.waves.length).toBeGreaterThan(0);
}

function formatSignalRefs(
  refs: readonly { buildId: string; battleRngSeed: string }[],
): string {
  if (refs.length === 0) return '(empty)';
  return refs.map((r) => `${r.buildId}/${r.battleRngSeed}`).join(', ');
}

function formatIneffectivePairs(
  pairs: ProblemSeriesBalanceSignalReport['ineffectiveChoiceCandidatePairs'],
): string {
  if (pairs.length === 0) return '(empty)';
  return pairs.map((p) => `${p.buildIdA}↔${p.buildIdB}`).join(', ');
}

async function runSensitivityForHpScale(
  hpScale: number,
  baseline: SeriesABaselineFile,
  productionWaves: readonly ProblemSeriesBattleWave[],
): Promise<{
  readonly rows: SensitivityCaseRow[];
  readonly report: ProblemSeriesBalanceSignalReport;
}> {
  const transform = createSeriesAWave2GuardianHpScaleTransform(hpScale);
  const transformedPreview = transform(productionWaves, transformContext);
  assertTransformTouchesOnlyWave2GuardianHpScale(
    productionWaves,
    transformedPreview,
    hpScale,
  );

  const signalCases: ProblemSeriesBalanceSignalCase[] = [];
  const pairKeys = new Set<string>();
  const rows: SensitivityCaseRow[] = [];

  for (const baselineCase of baseline.cases) {
    // 長時間同期ループ中の vitest worker RPC timeout 回避
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    const key = `${baselineCase.buildId}::${baselineCase.battleRngSeed}`;
    expect(pairKeys.has(key)).toBe(false);
    pairKeys.add(key);

    const input: ProblemSeriesSimInput = {
      ...baselineCase.input,
      transformResolvedBattleWaves: transform,
    };
    const result = runProblemSeriesSim(input);
    assertCaseMetricsPresent(result);
    expect(result.battleRngSeed).toBe(baselineCase.battleRngSeed);

    assertTransformTouchesOnlyWave2GuardianHpScale(
      productionWaves,
      result.enemyWaveInputs,
      hpScale,
    );

    // hpScale=1.00 は変更前 baseline 再現として維持
    if (hpScale === BEFORE_CHANGE_GUARDIAN_HP_SCALE) {
      expect(normalizeProblemSeriesSimResultForCompare(result)).toBe(
        normalizeProblemSeriesSimResultForCompare(baselineCase.result),
      );
    }

    const wavePlans = baselineCase.input.wavePlans ?? [];
    expect(wavePlans).toHaveLength(3);
    expect(result.acquiredPassivesBySlot).toEqual(
      expectedAcquiredPassivesBySlot(wavePlans, result.finalWaveIndex),
    );

    const wave3Planned = wave3PlannedPassiveIds(wavePlans);
    const acquired = allAcquiredPassiveIds(result);
    const reachedWave3 = result.finalWaveIndex >= 2;
    if (reachedWave3) {
      expect(result.waves.some((w) => w.waveIndex === 2)).toBe(true);
      for (const passiveId of wave3Planned) {
        expect(
          acquired.includes(passiveId),
          `Wave3 planned ${passiveId} must be acquired when reached (${baselineCase.buildId}/${baselineCase.battleRngSeed}/hpScale=${hpScale})`,
        ).toBe(true);
      }
    } else {
      for (const passiveId of wave3Planned) {
        expect(
          acquired.includes(passiveId),
          `Wave3 planned ${passiveId} must NOT be acquired when not reached (${baselineCase.buildId}/${baselineCase.battleRngSeed}/hpScale=${hpScale})`,
        ).toBe(false);
      }
    }

    signalCases.push({
      buildId: baselineCase.buildId,
      battleRngSeed: baselineCase.battleRngSeed,
      input,
      result,
    });

    rows.push({
      hpScale,
      buildId: baselineCase.buildId,
      battleRngSeed: baselineCase.battleRngSeed,
      outcome: result.outcome,
      finalWaveIndex: result.finalWaveIndex,
      waveResults: result.waves.map((w) => `${w.waveIndex}:${w.result}`),
      tickCount: result.tickCount,
      totalRemainingAllyHp: result.totalRemainingAllyHp,
      totalRemainingEnemyHp: result.totalRemainingEnemyHp,
      reachedWave3,
      wave3PlannedApplied:
        wave3Planned.length > 0 &&
        reachedWave3 &&
        wave3Planned.every((id) => acquired.includes(id)),
      appliedCombatModuleIdBySlot: result.appliedCombatModuleIdBySlot,
      acquiredPassivesBySlot: result.acquiredPassivesBySlot,
      resourceLedger: result.resourceLedger,
      slotStats: result.slotStats,
    });
  }

  expect(pairKeys.size).toBe(9);
  expect(signalCases).toHaveLength(9);
  expect(rows).toHaveLength(9);
  const report = detectProblemSeriesBalanceSignals(signalCases);
  expect(report.evaluatedCaseCount).toBe(9);
  expect(report.evaluatedBuildCount).toBe(3);
  expect(report.evaluatedSeedCount).toBe(3);
  expect(report.seriesId).toBe(SERIES_ID);
  return { rows, report };
}

function assertBaselineCoverage(baseline: SeriesABaselineFile): void {
  const baselinePairKeys = new Set<string>();
  for (const caseEntry of baseline.cases) {
    expect(
      BUILD_IDS.includes(caseEntry.buildId as (typeof BUILD_IDS)[number]),
    ).toBe(true);
    expect(
      BATTLE_RNG_SEEDS.includes(
        caseEntry.battleRngSeed as (typeof BATTLE_RNG_SEEDS)[number],
      ),
    ).toBe(true);
    const key = `${caseEntry.buildId}::${caseEntry.battleRngSeed}`;
    expect(baselinePairKeys.has(key)).toBe(false);
    baselinePairKeys.add(key);
  }
  expect(baselinePairKeys.size).toBe(9);
}

function assertProductionDefaultBuildOutcomes(
  buildId: string,
  result: ProblemSeriesSimResult,
  wavePlans: readonly (ProblemSeriesSimWavePlan | undefined)[],
): void {
  const wave3Planned = wave3PlannedPassiveIds(wavePlans);
  const acquired = allAcquiredPassiveIds(result);
  const reachedWave3 = result.finalWaveIndex >= 2;
  const wave3PlannedApplied =
    wave3Planned.length > 0 &&
    reachedWave3 &&
    wave3Planned.every((id) => acquired.includes(id));

  expect(result.acquiredPassivesBySlot).toEqual(
    expectedAcquiredPassivesBySlot(wavePlans, result.finalWaveIndex),
  );
  expect(result.appliedCombatModuleIdBySlot).toHaveLength(PARTY_SLOT_COUNT);
  expect(result.slotStats).toHaveLength(PARTY_SLOT_COUNT);
  expect(result.resourceLedger.length).toBe(result.finalWaveIndex + 1);

  if (buildId === BUILD_NO_SPEND) {
    expect(result.outcome).toBe('defeat');
    expect(result.finalWaveIndex).toBe(1);
    expect(reachedWave3).toBe(false);
    expect(wave3PlannedApplied).toBe(false);
    for (const passiveId of wave3Planned) {
      expect(acquired.includes(passiveId)).toBe(false);
    }
  }

  if (buildId === BUILD_KNOWN_ATTACK) {
    expect(result.outcome).toBe('victory');
    expect(result.finalWaveIndex).toBe(2);
    expect(reachedWave3).toBe(true);
    expect(wave3PlannedApplied).toBe(true);
    expect(wave3Planned.length).toBeGreaterThan(0);
  }

  if (buildId === BUILD_ALTERNATE_CORE) {
    expect(result.outcome).toBe('defeat');
    expect(result.finalWaveIndex).toBe(2);
    expect(reachedWave3).toBe(true);
    expect(wave3PlannedApplied).toBe(true);
    expect(wave3Planned.length).toBeGreaterThan(0);
  }
}

describe('R12n 1F/1F-R1/1M series A Wave2 guardian hpScale sensitivity + production default', () => {
  // scale ごとに分割（長時間単一 it は vitest worker RPC timeout を誘発するため）
  for (const hpScale of HP_SCALE_POINTS) {
    it(
      `hpScale=${hpScale}: 9 cases, transform scope, signals (not a pass/fail threshold)`,
      async () => {
        assertBaselineShaUnchanged();
        const baseline = loadBaselineA();
        assertBaselineCoverage(baseline);
        const productionWaves = loadProductionBattleWaves();
        const { rows, report } = await runSensitivityForHpScale(
          hpScale,
          baseline,
          productionWaves,
        );
        expect(rows).toHaveLength(9);
        // 観測ログ（集約・合格断定なし）
        // eslint-disable-next-line no-console
        console.log(
          `1F/1M hpScale=${hpScale} signals: 即全滅=${formatSignalRefs(report.immediatePartyWipeCandidates)}; 無限膠着=${formatSignalRefs(report.stalemateCandidates)}; 選択無効=${formatIneffectivePairs(report.ineffectiveChoiceCandidatePairs)}; 単一正解化=${report.singleSolutionCandidateBuildIds.length === 0 ? '(empty)' : report.singleSolutionCandidateBuildIds.join(',')}`,
        );
        for (const row of rows) {
          // eslint-disable-next-line no-console
          console.log(
            [
              row.hpScale,
              row.buildId,
              row.battleRngSeed,
              row.outcome,
              row.finalWaveIndex,
              row.waveResults.join('/'),
              row.tickCount,
              row.totalRemainingAllyHp,
              row.totalRemainingEnemyHp,
              row.reachedWave3 ? 'Y' : 'N',
              row.wave3PlannedApplied ? 'Y' : 'N',
            ].join(' | '),
          );
        }
        assertBaselineShaUnchanged();
      },
      180_000,
    );
  }

  it('observes exactly 9 scale points; 0.75 is production-adopted observation point', () => {
    // 観測点の固定。近似閾値・自動採用ではない。0.75 は 1M production 採用値と一致する。
    expect(HP_SCALE_POINTS).toEqual([
      1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6,
    ]);
    expect(HP_SCALE_POINTS).toHaveLength(9);
    expect(HP_SCALE_POINTS).toContain(PRODUCTION_GUARDIAN_HP_SCALE);
    expect(HP_SCALE_POINTS).toContain(BEFORE_CHANGE_GUARDIAN_HP_SCALE);
    expect(BUILD_IDS).toHaveLength(3);
    expect(BATTLE_RNG_SEEDS).toHaveLength(3);
    expect(9 * 3 * 3).toBe(81);
  });

  it(
    'production default (no transform): 9-case rectangle matches explicit hpScale=0.75 and expected outcomes/signals',
    () => {
      assertBaselineShaUnchanged();
      const baseline = loadBaselineA();
      assertBaselineCoverage(baseline);
      const productionWaves = loadProductionBattleWaves();
      assertProductionGuardianHpScaleOnly(productionWaves);

      const explicitTransform = createSeriesAWave2GuardianHpScaleTransform(
        PRODUCTION_GUARDIAN_HP_SCALE,
      );
      const signalCases: ProblemSeriesBalanceSignalCase[] = [];
      const pairKeys = new Set<string>();

      for (const baselineCase of baseline.cases) {
        const key = `${baselineCase.buildId}::${baselineCase.battleRngSeed}`;
        expect(pairKeys.has(key)).toBe(false);
        pairKeys.add(key);

        const wavePlans = baselineCase.input.wavePlans ?? [];
        expect(wavePlans).toHaveLength(3);

        // production default 経路（transform なし）
        const defaultResult = runProblemSeriesSim(baselineCase.input);
        assertCaseMetricsPresent(defaultResult);
        expect(defaultResult.battleRngSeed).toBe(baselineCase.battleRngSeed);
        expect(defaultResult.enemyWaveInputs).toEqual(productionWaves);

        // 明示 transform 0.75 と正規化完全一致（9 case すべて）
        const explicitResult = runProblemSeriesSim({
          ...baselineCase.input,
          transformResolvedBattleWaves: explicitTransform,
        });
        expect(normalizeProblemSeriesSimResultForCompare(defaultResult)).toBe(
          normalizeProblemSeriesSimResultForCompare(explicitResult),
        );

        assertProductionDefaultBuildOutcomes(
          baselineCase.buildId,
          defaultResult,
          wavePlans,
        );

        signalCases.push({
          buildId: baselineCase.buildId,
          battleRngSeed: baselineCase.battleRngSeed,
          input: baselineCase.input,
          result: defaultResult,
        });
      }

      expect(pairKeys.size).toBe(9);
      expect(signalCases).toHaveLength(9);

      const report = detectProblemSeriesBalanceSignals(signalCases);
      expect(report.evaluatedCaseCount).toBe(9);
      expect(report.evaluatedBuildCount).toBe(3);
      expect(report.evaluatedSeedCount).toBe(3);
      // 4 検出語（候補。強度合格・自動不合格ではない）
      expect(report.immediatePartyWipeCandidates).toEqual([]);
      expect(report.stalemateCandidates).toEqual([]);
      expect(report.ineffectiveChoiceCandidatePairs).toEqual([]);
      expect(report.singleSolutionCandidateBuildIds).toEqual([
        BUILD_KNOWN_ATTACK,
      ]);

      assertBaselineShaUnchanged();
    },
    180_000,
  );

  it('refuses transform on non-series-A identity (fail-closed)', () => {
    const productionWaves = loadProductionBattleWaves();
    const transform = createSeriesAWave2GuardianHpScaleTransform(0.7);
    expect(() =>
      transform(productionWaves, {
        seriesId: 'r12m_series_b',
        problemSeriesSeed: 'fixture-b',
        generatorVersion: GENERATOR_VERSION,
      }),
    ).toThrow(/refuses seriesId/);
  });
});
