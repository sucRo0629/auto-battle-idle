/**
 * R12n 1B — 問題系列比較 harness 骨格の fail-closed 固定。
 * 特定構築の勝敗・秒数は固定しない（1C/1D baseline 前）。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { resolveProblemSeriesFromSeed } from './problemSeries/seedResolve.ts';
import { toProblemSeriesBattleWaves } from './problemSeries/toBattleWaves.ts';
import {
  createDefaultProblemSeriesSimSlots,
  normalizeProblemSeriesSimResultForCompare,
  runProblemSeriesSim,
  type ProblemSeriesSimInput,
  type ProblemSeriesSimResult,
} from './test/problemSeriesSim.harness.ts';
import { PARTY_SLOT_COUNT } from './types.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';
const SERIES_A_ID = 'r12m_series_a';
const SERIES_B_ID = 'r12m_series_b';
const BATTLE_RNG_SEED = 'r12n-1b-battle-rng';
/** 通常完走用。勝敗・秒数は assertion しない。 */
const DEFAULT_MAX_TICKS = 90_000;
/** timeout 固定用。意図的に短くする。 */
const TIMEOUT_MAX_TICKS = 3;

const OUTCOMES = new Set(['victory', 'defeat', 'timeout']);

function baseInput(
  overrides: Partial<ProblemSeriesSimInput> &
    Pick<ProblemSeriesSimInput, 'problemSeriesSeed'>,
): ProblemSeriesSimInput {
  return {
    battleRngSeed: BATTLE_RNG_SEED,
    maxTicks: DEFAULT_MAX_TICKS,
    ...overrides,
  };
}

function expectMetricFieldsPresent(result: ProblemSeriesSimResult): void {
  expect(result.problemSeriesSeed.length).toBeGreaterThan(0);
  expect(result.generatorVersion.length).toBeGreaterThan(0);
  expect(result.seriesId.length).toBeGreaterThan(0);
  expect(result.battleRngSeed.length).toBeGreaterThan(0);
  expect(OUTCOMES.has(result.outcome)).toBe(true);
  expect(Number.isInteger(result.finalWaveIndex)).toBe(true);
  expect(result.finalWaveIndex).toBeGreaterThanOrEqual(0);
  expect(result.finalWaveIndex).toBeLessThan(3);
  expect(Number.isFinite(result.tickCount)).toBe(true);
  expect(result.tickCount).toBeGreaterThan(0);
  expect(Number.isFinite(result.durationSec)).toBe(true);
  expect(result.durationSec).toBeGreaterThan(0);
  expect(result.waves.length).toBeGreaterThan(0);
  expect(result.waves.length).toBeLessThanOrEqual(3);
  for (const wave of result.waves) {
    expect(Number.isFinite(wave.startTick)).toBe(true);
    expect(Number.isFinite(wave.endTick)).toBe(true);
    expect(Number.isFinite(wave.startSec)).toBe(true);
    expect(Number.isFinite(wave.endSec)).toBe(true);
    expect(['cleared', 'defeat', 'timeout']).toContain(wave.result);
  }
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
  expect(result.appliedCombatModuleIdBySlot).toHaveLength(PARTY_SLOT_COUNT);
  expect(result.acquiredPassivesBySlot).toHaveLength(PARTY_SLOT_COUNT);
  expect(result.resourceLedger.length).toBeGreaterThan(0);
  for (const entry of result.resourceLedger) {
    expect(Number.isFinite(entry.grantAmount)).toBe(true);
    expect(Number.isFinite(entry.spentAmount)).toBe(true);
    expect(Number.isFinite(entry.remainingResource)).toBe(true);
  }
  expect(typeof result.timedOut).toBe('boolean');
  expect(result.enemyWaveInputs).toHaveLength(3);
}

describe('R12n 1B problemSeries balance harness skeleton', () => {
  afterEach(() => {
    // 他テスト汚染防止の保険（本体は harness finally で復元）
    expect(typeof Math.random).toBe('function');
  });

  it('1: fixture-a resolves to r12m_series_a with 3 waves', () => {
    const result = runProblemSeriesSim(baseInput({ problemSeriesSeed: FIXTURE_SEED_A }));
    expect(result.seriesId).toBe(SERIES_A_ID);
    expect(result.enemyWaveInputs).toHaveLength(3);
    expect(result.problemSeriesSeed).toBe(FIXTURE_SEED_A);
    expectMetricFieldsPresent(result);
  });

  it('2: fixture-b resolves to r12m_series_b with 3 waves', () => {
    const result = runProblemSeriesSim(baseInput({ problemSeriesSeed: FIXTURE_SEED_B }));
    expect(result.seriesId).toBe(SERIES_B_ID);
    expect(result.enemyWaveInputs).toHaveLength(3);
    expect(result.problemSeriesSeed).toBe(FIXTURE_SEED_B);
    expectMetricFieldsPresent(result);
  });

  it('3: does not use temporary StageDef / stageId', () => {
    const gameData = loadGameData();
    const stagesBefore = structuredClone(gameData.stages);
    const result = runProblemSeriesSim(baseInput({ problemSeriesSeed: FIXTURE_SEED_A }));

    expect(Object.prototype.hasOwnProperty.call(result, 'stageId')).toBe(false);
    expect(
      gameData.stages.some(
        (stage) =>
          stage.id === SERIES_A_ID ||
          stage.id === SERIES_B_ID ||
          stage.id === FIXTURE_SEED_A,
      ),
    ).toBe(false);
    expect(gameData.stages).toEqual(stagesBefore);

    const productionWaves = toProblemSeriesBattleWaves(
      resolveProblemSeriesFromSeed(
        gameData.problemSeriesCatalog,
        FIXTURE_SEED_A,
      ).series,
    );
    expect(result.enemyWaveInputs).toEqual(productionWaves);
  });

  it('4: identical full input + battleRngSeed yields identical normalized results', () => {
    const input = baseInput({ problemSeriesSeed: FIXTURE_SEED_A });
    const first = runProblemSeriesSim(input);
    const second = runProblemSeriesSim(input);
    expect(normalizeProblemSeriesSimResultForCompare(first)).toBe(
      normalizeProblemSeriesSimResultForCompare(second),
    );
    expect(first.outcome).toBe(second.outcome);
    expect(first.tickCount).toBe(second.tickCount);
    expect(first.slotStats).toEqual(second.slotStats);
  });

  it('5: restores Math.random after run', () => {
    const original = Math.random;
    const marker = () => 0.123456789;
    Math.random = marker;
    try {
      runProblemSeriesSim(baseInput({ problemSeriesSeed: FIXTURE_SEED_A }));
      expect(Math.random).toBe(marker);
      expect(Math.random()).toBe(0.123456789);
    } finally {
      Math.random = original;
    }
  });

  it('6: outcome is one of victory | defeat | timeout', () => {
    const result = runProblemSeriesSim(baseInput({ problemSeriesSeed: FIXTURE_SEED_A }));
    expect(OUTCOMES.has(result.outcome)).toBe(true);
  });

  it('7: timeout stops at specified maxTicks', () => {
    const result = runProblemSeriesSim(
      baseInput({
        problemSeriesSeed: FIXTURE_SEED_A,
        maxTicks: TIMEOUT_MAX_TICKS,
      }),
    );
    expect(result.outcome).toBe('timeout');
    expect(result.timedOut).toBe(true);
    expect(result.tickCount).toBe(TIMEOUT_MAX_TICKS);
    expect(result.tickCount).toBeLessThanOrEqual(TIMEOUT_MAX_TICKS);
  });

  it('8: metric fields are present and finite', () => {
    const result = runProblemSeriesSim(baseInput({ problemSeriesSeed: FIXTURE_SEED_B }));
    expectMetricFieldsPresent(result);
  });

  it('9: rejects illegal duplicate classIds', () => {
    const gameData = loadGameData();
    const slots = createDefaultProblemSeriesSimSlots(
      gameData,
      resolveProblemSeriesFromSeed(
        gameData.problemSeriesCatalog,
        FIXTURE_SEED_A,
      ).series.allowedClassIds,
    );
    const illegal = slots.map((slot, index) =>
      index === 1
        ? { ...slot, classId: slots[0]!.classId, initialCombatModuleId: slots[0]!.initialCombatModuleId }
        : slot,
    );
    expect(() =>
      runProblemSeriesSim(
        baseInput({ problemSeriesSeed: FIXTURE_SEED_A, slots: illegal }),
      ),
    ).toThrow(/duplicate classId/i);
  });

  it('10: rejects out-of-scope classId', () => {
    const gameData = loadGameData();
    const slots = createDefaultProblemSeriesSimSlots(
      gameData,
      resolveProblemSeriesFromSeed(
        gameData.problemSeriesCatalog,
        FIXTURE_SEED_A,
      ).series.allowedClassIds,
    );
    const rangerModule =
      gameData.classRegistry.at_ranger?.combatModuleIds?.[0] ??
      'missing_ranger_module';
    const illegal = [
      ...slots.slice(0, 3),
      { classId: 'at_ranger' as const, initialCombatModuleId: rangerModule },
    ];
    expect(illegal).toHaveLength(PARTY_SLOT_COUNT);
    expect(() =>
      runProblemSeriesSim(
        baseInput({ problemSeriesSeed: FIXTURE_SEED_A, slots: illegal }),
      ),
    ).toThrow(/outside problem-series sim target classes|not in series allowedClassIds/i);
  });

  it('11: rejects invalid combat module', () => {
    const gameData = loadGameData();
    const slots = createDefaultProblemSeriesSimSlots(
      gameData,
      resolveProblemSeriesFromSeed(
        gameData.problemSeriesCatalog,
        FIXTURE_SEED_A,
      ).series.allowedClassIds,
    );
    const illegal = slots.map((slot, index) =>
      index === 0
        ? { ...slot, initialCombatModuleId: 'not_a_real_combat_module' }
        : slot,
    );
    expect(() =>
      runProblemSeriesSim(
        baseInput({ problemSeriesSeed: FIXTURE_SEED_A, slots: illegal }),
      ),
    ).toThrow(/combat module/i);
  });

  it('12: rejects invalid operation passive', () => {
    expect(() =>
      runProblemSeriesSim(
        baseInput({
          problemSeriesSeed: FIXTURE_SEED_A,
          wavePlans: [
            {
              passiveAcquisitions: [
                {
                  slotIndex: 0,
                  passiveId: 'not_a_real_operation_passive',
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow(/passive|candidate|unknown/i);
  });

  it('13: rejects resource-insufficient acquisition', () => {
    // Wave 0 prepResourceGrant は 0。cost>=1 の取得は資源不足で拒否。
    expect(() =>
      runProblemSeriesSim(
        baseInput({
          problemSeriesSeed: FIXTURE_SEED_A,
          wavePlans: [
            {
              passiveAcquisitions: [
                {
                  slotIndex: 0,
                  passiveId: 'df_guardian_op_block_rate_up',
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow(/insufficient operation resource/i);
  });

  it('14: series A/B differ in seriesId and enemy wave inputs', () => {
    const resultA = runProblemSeriesSim(baseInput({ problemSeriesSeed: FIXTURE_SEED_A }));
    const resultB = runProblemSeriesSim(baseInput({ problemSeriesSeed: FIXTURE_SEED_B }));

    expect(resultA.seriesId).toBe(SERIES_A_ID);
    expect(resultB.seriesId).toBe(SERIES_B_ID);
    expect(resultA.seriesId).not.toBe(resultB.seriesId);
    expect(resultA.enemyWaveInputs).not.toEqual(resultB.enemyWaveInputs);
    expect(resultA.enemyWaveInputs).toHaveLength(3);
    expect(resultB.enemyWaveInputs).toHaveLength(3);

    const productionA = toProblemSeriesBattleWaves(
      resolveProblemSeriesFromSeed(
        loadGameData().problemSeriesCatalog,
        FIXTURE_SEED_A,
      ).series,
    );
    const productionB = toProblemSeriesBattleWaves(
      resolveProblemSeriesFromSeed(
        loadGameData().problemSeriesCatalog,
        FIXTURE_SEED_B,
      ).series,
    );
    expect(resultA.enemyWaveInputs).toEqual(productionA);
    expect(resultB.enemyWaveInputs).toEqual(productionB);
    expect(productionA).not.toEqual(productionB);
  });

  it('15: maxTicks 1 still rejects out-of-candidate passive on wave 3 only', () => {
    const wavePlans = [
      {},
      {},
      {
        passiveAcquisitions: [
          {
            slotIndex: 0,
            // 鉄衛士 slot に剣術士候補を置く（候補外）
            passiveId: 'at_swordsman_op_interval_reduction',
          },
        ],
      },
    ];
    expect(wavePlans[2]!.passiveAcquisitions!.length).toBeGreaterThan(0);
    expect(() =>
      runProblemSeriesSim(
        baseInput({
          problemSeriesSeed: FIXTURE_SEED_A,
          maxTicks: 1,
          wavePlans,
        }),
      ),
    ).toThrow(/passive|candidate/i);
  });

  it('16: maxTicks 1 still rejects out-of-pool combat module on later wave only', () => {
    const wavePlans = [
      {},
      {},
      {
        moduleChanges: [
          {
            slotIndex: 0,
            // registry 内だが鉄衛士 pool 外
            combatModuleId: 'at_swordsman_mod_single_slash',
          },
        ],
      },
    ];
    expect(wavePlans[2]!.moduleChanges!.length).toBeGreaterThan(0);
    expect(() =>
      runProblemSeriesSim(
        baseInput({
          problemSeriesSeed: FIXTURE_SEED_A,
          maxTicks: 1,
          wavePlans,
        }),
      ),
    ).toThrow(/combat module/i);
  });

  it('17: later-wave legal candidates that exceed grant+carryover throw resource error', () => {
    // Wave0 grant 0 + Wave1 12 + Wave2 12 = 24。Wave3 だけで cost10×3=30 は不足。
    const wavePlans = [
      {},
      {},
      {
        passiveAcquisitions: [
          { slotIndex: 0, passiveId: 'df_guardian_op_fortress_stance' },
          { slotIndex: 0, passiveId: 'df_guardian_passive_4' },
          { slotIndex: 1, passiveId: 'at_swordsman_passive_3' },
        ],
      },
    ];
    expect(wavePlans[2]!.passiveAcquisitions!.length).toBeGreaterThan(0);
    expect(() =>
      runProblemSeriesSim(
        baseInput({
          problemSeriesSeed: FIXTURE_SEED_A,
          maxTicks: 1,
          wavePlans,
        }),
      ),
    ).toThrow(/insufficient operation resource/i);
  });

  it('18: rejects wavePlans longer than battle wave count', () => {
    const wavePlans = [{}, {}, {}, {}];
    expect(wavePlans.length).toBeGreaterThan(3);
    expect(() =>
      runProblemSeriesSim(
        baseInput({
          problemSeriesSeed: FIXTURE_SEED_A,
          maxTicks: 1,
          wavePlans,
        }),
      ),
    ).toThrow(/wavePlans length|exceeds battle wave count/i);
  });

  it('19: preflight of legal later-wave plans does not mix into unreachable result outputs', () => {
    const gameData = loadGameData();
    const slots = createDefaultProblemSeriesSimSlots(
      gameData,
      resolveProblemSeriesFromSeed(
        gameData.problemSeriesCatalog,
        FIXTURE_SEED_A,
      ).series.allowedClassIds,
    );
    const initialModuleBySlot = slots.map((slot) => slot.initialCombatModuleId);
    const laterModuleId = 'df_guardian_mod_guard_focus';
    expect(laterModuleId).not.toBe(initialModuleBySlot[0]);
    const laterPassiveId = 'df_guardian_op_block_rate_up';

    const wavePlans = [
      {},
      {
        moduleChanges: [{ slotIndex: 0, combatModuleId: laterModuleId }],
        passiveAcquisitions: [{ slotIndex: 0, passiveId: laterPassiveId }],
      },
      {
        passiveAcquisitions: [
          { slotIndex: 0, passiveId: 'df_guardian_op_frontline_maintenance' },
        ],
      },
    ];
    expect(wavePlans[1]!.moduleChanges!.length).toBeGreaterThan(0);
    expect(wavePlans[1]!.passiveAcquisitions!.length).toBeGreaterThan(0);
    expect(wavePlans[2]!.passiveAcquisitions!.length).toBeGreaterThan(0);

    const result = runProblemSeriesSim(
      baseInput({
        problemSeriesSeed: FIXTURE_SEED_A,
        maxTicks: 1,
        slots,
        wavePlans,
      }),
    );

    expect(result.resourceLedger).toHaveLength(1);
    expect(result.resourceLedger[0]!.waveIndex).toBe(0);
    expect(result.appliedCombatModuleIdBySlot).toEqual(initialModuleBySlot);
    expect(result.acquiredPassivesBySlot.every((ids) => ids.length === 0)).toBe(
      true,
    );
    expect(
      result.acquiredPassivesBySlot.some((ids) => ids.includes(laterPassiveId)),
    ).toBe(false);
    expect(result.appliedCombatModuleIdBySlot).not.toContain(laterModuleId);
  });
});
