/**
 * R12n 1C-R1 — 系列A 変更前baseline照合。
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
  'src/battle/test/baselines/r12n-series-a-before.json';
/** 開始ゲートと同一。テスト実行で書き換えないことの確認用。 */
const EXPECTED_BASELINE_SHA256 =
  '2c6e6ad212bfaffb3259613d2d15a39a7910f7b7ba0474240f72cedd5c49062c';

const PROBLEM_SERIES_SEED = 'fixture-a';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_ID = 'r12m_series_a';

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

/** 「24点構築」= 全3 Wave 計画の予定費用合計が24。実消費済みを意味しない。 */
const PLANNED_COST_24 = 24;

const KNOWN_ATTACK_PLANNED_PASSIVES = [
  'at_swordsman_passive_3',
  'at_swordsman_op_interval_reduction',
  'at_swordsman_op_physical_damage_up',
  'at_sorcerer_op_ignition_damage',
  'at_sorcerer_op_magic_damage_up',
  'at_sorcerer_op_res_ignore_up',
] as const;

const ALTERNATE_CORE_PLANNED_PASSIVES = [
  'at_swordsman_passive_4',
  'at_swordsman_op_interval_reduction',
  'at_swordsman_op_physical_damage_up',
  'at_sorcerer_op_ignition_threshold',
  'at_sorcerer_op_magic_damage_up',
  'at_sorcerer_op_res_ignore_up',
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

const baselinePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'test/baselines/r12n-series-a-before.json',
);

function readBaselineRaw(): Buffer {
  return readFileSync(baselinePath);
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function loadBaseline(): SeriesABaselineFile {
  const raw = readBaselineRaw();
  expect(sha256Hex(raw)).toBe(EXPECTED_BASELINE_SHA256);
  const parsed = JSON.parse(raw.toString('utf8')) as SeriesABaselineFile;
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

describe('R12n 1C-R1 series A baseline characterization (planned vs applied)', () => {
  it('loads baseline file without rewrite and matches expected SHA-256', () => {
    const raw = readBaselineRaw();
    expect(sha256Hex(raw)).toBe(EXPECTED_BASELINE_SHA256);
    // 相対パス正本と同一ファイルであること（自動snapshot更新経路なし）
    expect(BASELINE_RELATIVE_PATH.replace(/\\/g, '/')).toContain(
      'r12n-series-a-before.json',
    );
  });

  it('has exactly 3 builds × 3 RNG seeds with unique pairs', () => {
    const baseline = loadBaseline();
    expect(baseline.cases).toHaveLength(9);
    expect(baseline.problemSeriesSeed).toBe(PROBLEM_SERIES_SEED);
    expect(baseline.generatorVersion).toBe(GENERATOR_VERSION);
    expect(baseline.seriesId).toBe(SERIES_ID);
    // 正本 purpose: 合否閾値・勝率・優劣判定ではない変更前characterization（否定の文言を含む）
    expect(baseline.purpose).toBe(
      '合否閾値・勝率・優劣判定ではない変更前characterization',
    );

    const pairKeys = new Set<string>();
    const buildCounts = new Map<string, number>();
    const seedCounts = new Map<string, number>();

    for (const caseEntry of baseline.cases) {
      expect(BUILD_IDS.includes(caseEntry.buildId as (typeof BUILD_IDS)[number])).toBe(
        true,
      );
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

  it('characterizes all 9 cases: identity, planned/applied costs, ledger, reachability', () => {
    const baseline = loadBaseline();
    expect(baseline.cases.length).toBe(9);

    const gameData = loadGameData();
    const fixedCostByPassiveId =
      gameData.operationPassiveCatalog.fixedCostByPassiveId ?? {};

    const plannedByBuild = new Map<string, number>();
    const appliedByBuild = new Map<string, number>();

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
      expect(appliedCost).toBeLessThanOrEqual(plannedCost);

      plannedByBuild.set(buildId, plannedCost);
      appliedByBuild.set(buildId, appliedCost);

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

      // 変更前characterization: 全9件 Wave2 敗北。勝率へ集約しない。
      expect(result.outcome).toBe('defeat');
      expect(result.finalWaveIndex).toBe(1);
      expect(result.timedOut).toBe(false);

      if (buildId === BUILD_NO_SPEND) {
        expect(plannedCost).toBe(0);
        expect(appliedCost).toBe(0);
        expect(
          result.acquiredPassivesBySlot.every((ids) => ids.length === 0),
        ).toBe(true);
        expect(result.appliedCombatModuleIdBySlot).toEqual(
          input.slots!.map((slot) => slot.initialCombatModuleId),
        );
        for (const entry of result.resourceLedger) {
          expect(entry.spentAmount).toBe(0);
        }
      }

      if (buildId === BUILD_KNOWN_ATTACK) {
        const plannedIds = collectPlannedPassiveIds(wavePlans);
        expect(plannedIds).toHaveLength(6);
        for (const passiveId of KNOWN_ATTACK_PLANNED_PASSIVES) {
          expect(plannedIds).toContain(passiveId);
        }
        expect(plannedCost).toBe(PLANNED_COST_24);
        expect(appliedCost).toBe(12);
        expect(unreachableIds.length).toBeGreaterThan(0);
        for (const passiveId of [
          'at_sorcerer_op_ignition_damage',
          'at_sorcerer_op_magic_damage_up',
          'at_sorcerer_op_res_ignore_up',
        ]) {
          expect(unreachableIds).toContain(passiveId);
        }
      }

      if (buildId === BUILD_ALTERNATE_CORE) {
        const plannedIds = collectPlannedPassiveIds(wavePlans);
        expect(plannedIds).toHaveLength(6);
        for (const passiveId of ALTERNATE_CORE_PLANNED_PASSIVES) {
          expect(plannedIds).toContain(passiveId);
        }
        expect(plannedCost).toBe(PLANNED_COST_24);
        expect(appliedCost).toBe(12);
        expect(unreachableIds.length).toBeGreaterThan(0);
        for (const passiveId of [
          'at_sorcerer_op_ignition_threshold',
          'at_sorcerer_op_magic_damage_up',
          'at_sorcerer_op_res_ignore_up',
        ]) {
          expect(unreachableIds).toContain(passiveId);
        }
      }
    }

    // 構築ごとの planned/applied は seed 間で同一（生結果の意味固定）
    expect(plannedByBuild.get(BUILD_NO_SPEND)).toBe(0);
    expect(appliedByBuild.get(BUILD_NO_SPEND)).toBe(0);
    expect(plannedByBuild.get(BUILD_KNOWN_ATTACK)).toBe(PLANNED_COST_24);
    expect(appliedByBuild.get(BUILD_KNOWN_ATTACK)).toBe(12);
    expect(plannedByBuild.get(BUILD_ALTERNATE_CORE)).toBe(PLANNED_COST_24);
    expect(appliedByBuild.get(BUILD_ALTERNATE_CORE)).toBe(12);

    // 9件を勝率へ集約しないことの保険（defeat件数の集約表現を導入しない）
    expect(baseline.cases.every((c) => c.result.outcome === 'defeat')).toBe(
      true,
    );
  });
});
