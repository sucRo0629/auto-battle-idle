/**
 * R12n 1D — 系列B 変更前baseline照合。
 * planned cost（全Wave計画の予定費用）と applied cost（到達Waveまでの実消費）を分離して固定する。
 * 合否閾値・勝率・優劣判定には使わない。baseline JSON は読み取りのみ。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import {
  normalizeProblemSeriesSimResultForCompare,
  runProblemSeriesSim,
  type ProblemSeriesSimInput,
  type ProblemSeriesSimResult,
  type ProblemSeriesSimWavePlan,
} from './test/problemSeriesSim.harness.ts';
import { PARTY_SLOT_COUNT } from './types.ts';

const BASELINE_RELATIVE_PATH =
  'src/battle/test/baselines/r12n-series-b-before.json';
/** 開始ゲートと同一。テスト実行で書き換えないことの確認用。 */
const EXPECTED_BASELINE_SHA256 =
  'b575d9830b57bce29c3fc2d13ebb8db7044ee592d3363aae1bf457b0d7e1d47c';

const PROBLEM_SERIES_SEED = 'fixture-b';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_ID = 'r12m_series_b';

const BUILD_NO_SPEND = 'no-spend-control';
const BUILD_SINGLE_MEND = 'single-mend-24';
const BUILD_PARTY_MEND = 'party-mend-24';
const BUILD_IDS = [
  BUILD_NO_SPEND,
  BUILD_SINGLE_MEND,
  BUILD_PARTY_MEND,
] as const;

const BATTLE_RNG_SEEDS = [
  'r12n-1d-b-01',
  'r12n-1d-b-02',
  'r12n-1d-b-03',
] as const;

/** 「24点構築」= 全3 Wave 計画の予定費用合計が24。実消費済みを意味しない。 */
const PLANNED_COST_24 = 24;

const SLOT_CLERIC = 3;
const MODULE_SINGLE_MEND = 'sp_cleric_mod_single_mend';
const MODULE_PARTY_MEND = 'sp_cleric_mod_party_mend';

const SHARED_PLANNED_PASSIVES = [
  'df_guardian_op_fortress_stance',
  'df_guardian_op_block_rate_up',
  'df_guardian_op_frontline_maintenance',
  'sp_cleric_passive_3',
  'sp_cleric_op_heal_amount_up',
  'sp_cleric_op_interval_reduction',
] as const;

interface SeriesBBaselineCase {
  readonly buildId: string;
  readonly battleRngSeed: string;
  readonly input: ProblemSeriesSimInput;
  readonly result: ProblemSeriesSimResult;
}

interface SeriesBBaselineFile {
  readonly schemaVersion: number;
  readonly recordedAt: string;
  readonly sourceHead: string;
  readonly problemSeriesSeed: string;
  readonly generatorVersion: string;
  readonly seriesId: string;
  readonly purpose: string;
  readonly maxTicks: number;
  readonly cases: readonly SeriesBBaselineCase[];
}

const baselinePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'test/baselines/r12n-series-b-before.json',
);

function readBaselineRaw(): Buffer {
  return readFileSync(baselinePath);
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function loadBaseline(): SeriesBBaselineFile {
  const raw = readBaselineRaw();
  expect(sha256Hex(raw)).toBe(EXPECTED_BASELINE_SHA256);
  const parsed = JSON.parse(raw.toString('utf8')) as SeriesBBaselineFile;
  expect(Array.isArray(parsed.cases)).toBe(true);
  expect(parsed.cases.length).toBeGreaterThan(0);
  return parsed;
}

/**
 * planned cost: 入力された全3 Wave計画の予定取得費用（fixedCostByPassiveId 正本）。
 * 到達有無に依存しない。
 */
function computePlannedCost(
  wavePlans: readonly (ProblemSeriesSimWavePlan | undefined)[] | undefined,
  fixedCostByPassiveId: Readonly<Record<string, number>>,
): number {
  expect(wavePlans).toBeDefined();
  expect(wavePlans!.length).toBe(3);
  let total = 0;
  for (const plan of wavePlans!) {
    for (const acquire of plan?.passiveAcquisitions ?? []) {
      const cost = fixedCostByPassiveId[acquire.passiveId];
      expect(
        typeof cost === 'number' && Number.isInteger(cost) && cost >= 1,
        `missing fixedCostByPassiveId for ${acquire.passiveId}`,
      ).toBe(true);
      total += cost;
    }
  }
  return total;
}

/** applied cost: 実際に到達したWaveまでの resourceLedger.spentAmount 合計。 */
function computeAppliedCost(result: ProblemSeriesSimResult): number {
  let total = 0;
  for (const entry of result.resourceLedger) {
    expect(Number.isFinite(entry.spentAmount)).toBe(true);
    total += entry.spentAmount;
  }
  return total;
}

/**
 * 到達済み Wave 計画だけから期待 applied cost を算出する。
 * 未到達 Wave の予定取得は加えない。
 */
function expectedAppliedCostFromReachedPlans(
  wavePlans: readonly (ProblemSeriesSimWavePlan | undefined)[],
  finalWaveIndex: number,
  fixedCostByPassiveId: Readonly<Record<string, number>>,
): number {
  let total = 0;
  for (let waveIndex = 0; waveIndex <= finalWaveIndex; waveIndex++) {
    for (const acquire of wavePlans[waveIndex]?.passiveAcquisitions ?? []) {
      const cost = fixedCostByPassiveId[acquire.passiveId];
      expect(
        typeof cost === 'number' && Number.isInteger(cost) && cost >= 1,
      ).toBe(true);
      total += cost!;
    }
  }
  return total;
}

function collectPlannedPassiveIds(
  wavePlans: readonly (ProblemSeriesSimWavePlan | undefined)[],
): string[] {
  const ids: string[] = [];
  for (const plan of wavePlans) {
    for (const acquire of plan?.passiveAcquisitions ?? []) {
      ids.push(acquire.passiveId);
    }
  }
  return ids;
}

function collectPlannedPassiveAcquisitions(
  wavePlans: readonly (ProblemSeriesSimWavePlan | undefined)[],
): Array<{ slotIndex: number; passiveId: string }> {
  const rows: Array<{ slotIndex: number; passiveId: string }> = [];
  for (const plan of wavePlans) {
    for (const acquire of plan?.passiveAcquisitions ?? []) {
      rows.push({
        slotIndex: acquire.slotIndex,
        passiveId: acquire.passiveId,
      });
    }
  }
  return rows;
}

function expectedAcquiredPassivesBySlot(
  wavePlans: readonly (ProblemSeriesSimWavePlan | undefined)[],
  finalWaveIndex: number,
): string[][] {
  const bySlot: string[][] = Array.from(
    { length: PARTY_SLOT_COUNT },
    () => [],
  );
  for (let waveIndex = 0; waveIndex <= finalWaveIndex; waveIndex++) {
    const plan = wavePlans[waveIndex];
    for (const acquire of plan?.passiveAcquisitions ?? []) {
      bySlot[acquire.slotIndex]!.push(acquire.passiveId);
    }
  }
  return bySlot;
}

function unreachablePlannedPassiveIds(
  wavePlans: readonly (ProblemSeriesSimWavePlan | undefined)[],
  finalWaveIndex: number,
): string[] {
  const ids: string[] = [];
  for (
    let waveIndex = finalWaveIndex + 1;
    waveIndex < wavePlans.length;
    waveIndex++
  ) {
    for (const acquire of wavePlans[waveIndex]?.passiveAcquisitions ?? []) {
      ids.push(acquire.passiveId);
    }
  }
  return ids;
}

function expectedAppliedModules(
  input: ProblemSeriesSimInput,
  buildId: string,
  finalWaveIndex: number,
): string[] {
  const initial = input.slots!.map((slot) => slot.initialCombatModuleId);
  // Wave 2 準備（wavePlans[1]）は Wave 1 クリア後＝finalWaveIndex >= 1 のときだけ適用。
  if (buildId === BUILD_PARTY_MEND && finalWaveIndex >= 1) {
    const next = [...initial];
    next[SLOT_CLERIC] = MODULE_PARTY_MEND;
    return next;
  }
  return initial;
}

function assertResourceLedgerContinuity(
  result: ProblemSeriesSimResult,
): void {
  expect(result.resourceLedger.length).toBe(result.finalWaveIndex + 1);
  let previousRemaining = 0;
  for (let i = 0; i < result.resourceLedger.length; i++) {
    const entry = result.resourceLedger[i]!;
    expect(entry.waveIndex).toBe(i);
    expect(Number.isFinite(entry.grantAmount)).toBe(true);
    expect(Number.isFinite(entry.spentAmount)).toBe(true);
    expect(Number.isFinite(entry.remainingResource)).toBe(true);
    expect(entry.remainingResource).toBe(
      previousRemaining + entry.grantAmount - entry.spentAmount,
    );
    previousRemaining = entry.remainingResource;
  }
}

function assertMetricsFinite(result: ProblemSeriesSimResult): void {
  expect(Number.isFinite(result.tickCount)).toBe(true);
  expect(result.tickCount).toBeGreaterThan(0);
  expect(Number.isFinite(result.durationSec)).toBe(true);
  expect(result.durationSec).toBeGreaterThan(0);
  expect(Number.isFinite(result.survivingAllies)).toBe(true);
  expect(Number.isFinite(result.survivingEnemies)).toBe(true);
  expect(Number.isFinite(result.totalRemainingAllyHp)).toBe(true);
  expect(Number.isFinite(result.totalMaxAllyHp)).toBe(true);
  expect(Number.isFinite(result.totalRemainingEnemyHp)).toBe(true);
  expect(result.slotStats).toHaveLength(PARTY_SLOT_COUNT);
  for (const row of result.slotStats) {
    expect(Number.isFinite(row.damageDealt)).toBe(true);
    expect(Number.isFinite(row.damageTaken)).toBe(true);
    expect(Number.isFinite(row.healingDealt)).toBe(true);
  }
  for (const wave of result.waves) {
    expect(Number.isFinite(wave.startTick)).toBe(true);
    expect(Number.isFinite(wave.endTick)).toBe(true);
    expect(Number.isFinite(wave.startSec)).toBe(true);
    expect(Number.isFinite(wave.endSec)).toBe(true);
  }
}

describe('R12n 1D series B baseline characterization (planned vs applied)', () => {
  it('loads baseline file without rewrite and matches expected SHA-256', () => {
    const raw = readBaselineRaw();
    expect(sha256Hex(raw)).toBe(EXPECTED_BASELINE_SHA256);
    // 相対パス正本と同一ファイルであること（自動snapshot更新経路なし）
    expect(BASELINE_RELATIVE_PATH.replace(/\\/g, '/')).toContain(
      'r12n-series-b-before.json',
    );
  });

  it('has exactly 3 builds × 3 RNG seeds with unique pairs', () => {
    const baseline = loadBaseline();
    expect(baseline.cases).toHaveLength(9);
    expect(baseline.problemSeriesSeed).toBe(PROBLEM_SERIES_SEED);
    expect(baseline.generatorVersion).toBe(GENERATOR_VERSION);
    expect(baseline.seriesId).toBe(SERIES_ID);
    expect(baseline.purpose).toBe(
      '合否閾値・勝率・優劣判定ではない変更前characterization',
    );

    const pairKeys = new Set<string>();
    const buildCounts = new Map<string, number>();
    const seedCounts = new Map<string, number>();

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
      expect(pairKeys.has(key)).toBe(false);
      pairKeys.add(key);
      buildCounts.set(
        caseEntry.buildId,
        (buildCounts.get(caseEntry.buildId) ?? 0) + 1,
      );
      seedCounts.set(
        caseEntry.battleRngSeed,
        (seedCounts.get(caseEntry.battleRngSeed) ?? 0) + 1,
      );
    }

    expect(pairKeys.size).toBe(9);
    for (const buildId of BUILD_IDS) {
      expect(buildCounts.get(buildId)).toBe(3);
    }
    for (const seed of BATTLE_RNG_SEEDS) {
      expect(seedCounts.get(seed)).toBe(3);
    }
  });

  it('characterizes all 9 cases: identity, planned/applied, modules, ledger', () => {
    const baseline = loadBaseline();
    expect(baseline.cases.length).toBe(9);

    const gameData = loadGameData();
    const fixedCostByPassiveId =
      gameData.operationPassiveCatalog.fixedCostByPassiveId ?? {};

    const singleMendPlansBySeed = new Map<
      string,
      Array<{ slotIndex: number; passiveId: string }>
    >();
    const singleMendSlotsBySeed = new Map<string, ProblemSeriesSimInput['slots']>();
    const singleMendInitialModulesBySeed = new Map<string, string[]>();

    for (const caseEntry of baseline.cases) {
      const { buildId, battleRngSeed, input, result } = caseEntry;

      expect(input.problemSeriesSeed).toBe(PROBLEM_SERIES_SEED);
      expect(input.battleRngSeed).toBe(battleRngSeed);
      expect(result.problemSeriesSeed).toBe(PROBLEM_SERIES_SEED);
      expect(result.generatorVersion).toBe(GENERATOR_VERSION);
      expect(result.seriesId).toBe(SERIES_ID);
      expect(result.battleRngSeed).toBe(battleRngSeed);

      // 完全入力の再実行が保存結果と完全一致（fail-closed: 0件スキップなし）
      const rerun = runProblemSeriesSim(input);
      expect(normalizeProblemSeriesSimResultForCompare(rerun)).toBe(
        normalizeProblemSeriesSimResultForCompare(result),
      );

      assertMetricsFinite(result);
      assertResourceLedgerContinuity(result);

      const wavePlans = input.wavePlans ?? [];
      expect(wavePlans.length).toBe(3);

      const plannedCost = computePlannedCost(wavePlans, fixedCostByPassiveId);
      const appliedCost = computeAppliedCost(result);
      const expectedApplied = expectedAppliedCostFromReachedPlans(
        wavePlans,
        result.finalWaveIndex,
        fixedCostByPassiveId,
      );
      expect(appliedCost).toBe(expectedApplied);
      expect(appliedCost).toBeLessThanOrEqual(plannedCost);

      const expectedAcquired = expectedAcquiredPassivesBySlot(
        wavePlans,
        result.finalWaveIndex,
      );
      expect(result.acquiredPassivesBySlot).toEqual(expectedAcquired);

      const unreachableIds = unreachablePlannedPassiveIds(
        wavePlans,
        result.finalWaveIndex,
      );
      for (const passiveId of unreachableIds) {
        expect(
          result.acquiredPassivesBySlot.some((ids) => ids.includes(passiveId)),
          `unreachable planned passive ${passiveId} must not appear in acquiredPassivesBySlot (${buildId}/${battleRngSeed})`,
        ).toBe(false);
      }

      expect(result.appliedCombatModuleIdBySlot).toEqual(
        expectedAppliedModules(input, buildId, result.finalWaveIndex),
      );

      if (buildId === BUILD_NO_SPEND) {
        expect(plannedCost).toBe(0);
        expect(appliedCost).toBe(0);
        expect(
          result.acquiredPassivesBySlot.every((ids) => ids.length === 0),
        ).toBe(true);
        expect(result.appliedCombatModuleIdBySlot).toEqual(
          input.slots!.map((slot) => slot.initialCombatModuleId),
        );
        for (const plan of wavePlans) {
          expect(plan?.moduleChanges ?? []).toHaveLength(0);
          expect(plan?.passiveAcquisitions ?? []).toHaveLength(0);
        }
        for (const entry of result.resourceLedger) {
          expect(entry.spentAmount).toBe(0);
        }
      }

      if (buildId === BUILD_SINGLE_MEND || buildId === BUILD_PARTY_MEND) {
        const plannedIds = collectPlannedPassiveIds(wavePlans);
        expect(plannedIds).toHaveLength(6);
        for (const passiveId of SHARED_PLANNED_PASSIVES) {
          expect(plannedIds).toContain(passiveId);
        }
        expect(plannedCost).toBe(PLANNED_COST_24);
        expect(input.slots!.map((slot) => slot.classId)).toEqual([
          'df_guardian',
          'at_swordsman',
          'at_sorcerer',
          'sp_cleric',
        ]);
        expect(input.slots![SLOT_CLERIC]!.initialCombatModuleId).toBe(
          MODULE_SINGLE_MEND,
        );
      }

      if (buildId === BUILD_SINGLE_MEND) {
        for (const plan of wavePlans) {
          expect(plan?.moduleChanges ?? []).toHaveLength(0);
        }
        expect(result.appliedCombatModuleIdBySlot[SLOT_CLERIC]).toBe(
          MODULE_SINGLE_MEND,
        );
        singleMendPlansBySeed.set(
          battleRngSeed,
          collectPlannedPassiveAcquisitions(wavePlans),
        );
        singleMendSlotsBySeed.set(battleRngSeed, input.slots);
        singleMendInitialModulesBySeed.set(
          battleRngSeed,
          input.slots!.map((slot) => slot.initialCombatModuleId),
        );
      }

      if (buildId === BUILD_PARTY_MEND) {
        const wave2Plan = wavePlans[1];
        expect(wave2Plan?.moduleChanges).toBeDefined();
        expect(wave2Plan!.moduleChanges!.length).toBeGreaterThan(0);
        expect(wave2Plan!.moduleChanges).toEqual([
          {
            slotIndex: SLOT_CLERIC,
            combatModuleId: MODULE_PARTY_MEND,
          },
        ]);
        for (const plan of [wavePlans[0], wavePlans[2]]) {
          expect(plan?.moduleChanges ?? []).toHaveLength(0);
        }

        const shared = singleMendPlansBySeed.get(battleRngSeed);
        expect(shared).toBeDefined();
        expect(collectPlannedPassiveAcquisitions(wavePlans)).toEqual(shared);
        expect(input.slots).toEqual(singleMendSlotsBySeed.get(battleRngSeed));
        expect(input.slots!.map((slot) => slot.initialCombatModuleId)).toEqual(
          singleMendInitialModulesBySeed.get(battleRngSeed),
        );

        if (result.finalWaveIndex >= 1) {
          expect(result.appliedCombatModuleIdBySlot[SLOT_CLERIC]).toBe(
            MODULE_PARTY_MEND,
          );
        } else {
          expect(result.appliedCombatModuleIdBySlot[SLOT_CLERIC]).toBe(
            MODULE_SINGLE_MEND,
          );
        }
      }

      // 強度合否へ変換しない（outcome / duration を勝率・閾値に集約しない）
      expect(['victory', 'defeat', 'timeout']).toContain(result.outcome);
      expect(typeof result.durationSec).toBe('number');
    }

    // 2つの24点構築が互いに揃う前提: single-mend が先に収集されていること
    expect(singleMendPlansBySeed.size).toBe(3);
  });
});
