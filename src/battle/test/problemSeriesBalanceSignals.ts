/**
 * R12n 1E — 問題系列バランス候補検出器（test-only・純粋関数）。
 *
 * 4 検出語は「候補」であり、自動不合格・真の唯一解・R12n 完了判定ではない。
 * baseline JSON / production を変更しない。数値閾値・勝率・平均は使わない。
 */

import type {
  ProblemSeriesSimBattleOutcome,
  ProblemSeriesSimInput,
  ProblemSeriesSimResult,
  ProblemSeriesSimSlotMetrics,
  ProblemSeriesSimWaveTimeline,
} from './problemSeriesSim.harness.ts';

/** R12n baseline 標準 maxTicks。これ以外は fail-closed。 */
export const PROBLEM_SERIES_BALANCE_STANDARD_MAX_TICKS = 90000;

export interface ProblemSeriesBalanceSignalCase {
  readonly buildId: string;
  readonly battleRngSeed: string;
  readonly input: ProblemSeriesSimInput;
  readonly result: ProblemSeriesSimResult;
}

export interface ProblemSeriesBalanceSignalCaseRef {
  readonly buildId: string;
  readonly battleRngSeed: string;
}

export interface ProblemSeriesBalanceIneffectiveChoicePair {
  readonly buildIdA: string;
  readonly buildIdB: string;
}

export interface ProblemSeriesBalanceSignalReport {
  readonly problemSeriesSeed: string;
  readonly generatorVersion: string;
  readonly seriesId: string;
  readonly maxTicks: number;
  readonly evaluatedCaseCount: number;
  /** canonical buildIds.length。ID配列 .length の代用ではなく report 明示フィールド。 */
  readonly evaluatedBuildCount: number;
  /** canonical battleRngSeeds.length。ID配列 .length の代用ではなく report 明示フィールド。 */
  readonly evaluatedSeedCount: number;
  readonly buildIds: readonly string[];
  readonly battleRngSeeds: readonly string[];
  readonly evaluatedPairCount: number;
  /** 即全滅候補: Wave 1（finalWaveIndex === 0）での敗北。 */
  readonly immediatePartyWipeCandidates: readonly ProblemSeriesBalanceSignalCaseRef[];
  /** 無限膠着候補: timeout 三条件完全一致。 */
  readonly stalemateCandidates: readonly ProblemSeriesBalanceSignalCaseRef[];
  /** 選択無効候補: 実適用 choice 差 + 全 seed で戦闘指標完全一致。 */
  readonly ineffectiveChoiceCandidatePairs: readonly ProblemSeriesBalanceIneffectiveChoicePair[];
  /** 単一正解化候補 buildId（ちょうど 1 構築が全 seed victory）。 */
  readonly singleSolutionCandidateBuildIds: readonly string[];
}

function compareString(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sortStrings(values: readonly string[]): string[] {
  return [...values].sort(compareString);
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`expected finite number for ${label}, got ${String(value)}`);
  }
  return value;
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`expected non-empty string for ${label}, got ${String(value)}`);
  }
  return value;
}

/**
 * slot 内は辞書順（重複は保持）。slot 順は入力の slot 対応を維持。
 * 入力配列は変更しない。
 */
export function canonicalizeAcquiredPassivesBySlot(
  acquiredPassivesBySlot: readonly (readonly string[])[],
): readonly (readonly string[])[] {
  return acquiredPassivesBySlot.map((slotPassives) => sortStrings(slotPassives));
}

/** 実適用 Module／passive signature（slot 対応維持）。 */
export function appliedChoiceSignature(result: ProblemSeriesSimResult): string {
  const modules = result.appliedCombatModuleIdBySlot;
  if (!Array.isArray(modules)) {
    throw new Error('appliedCombatModuleIdBySlot must be an array');
  }
  for (let i = 0; i < modules.length; i++) {
    assertNonEmptyString(modules[i], `appliedCombatModuleIdBySlot[${i}]`);
  }
  const passives = result.acquiredPassivesBySlot;
  if (!Array.isArray(passives)) {
    throw new Error('acquiredPassivesBySlot must be an array');
  }
  if (passives.length !== modules.length) {
    throw new Error(
      `acquiredPassivesBySlot length ${passives.length} !== appliedCombatModuleIdBySlot length ${modules.length}`,
    );
  }
  for (let slot = 0; slot < passives.length; slot++) {
    const slotPassives = passives[slot];
    if (!Array.isArray(slotPassives)) {
      throw new Error(`acquiredPassivesBySlot[${slot}] must be an array`);
    }
    for (let i = 0; i < slotPassives.length; i++) {
      assertNonEmptyString(slotPassives[i], `acquiredPassivesBySlot[${slot}][${i}]`);
    }
  }
  return JSON.stringify({
    appliedCombatModuleIdBySlot: modules,
    acquiredPassivesBySlot: canonicalizeAcquiredPassivesBySlot(passives),
  });
}

function canonicalizeSlotStats(
  slotStats: readonly ProblemSeriesSimSlotMetrics[],
): readonly ProblemSeriesSimSlotMetrics[] {
  const sorted = [...slotStats].sort((a, b) => a.slotIndex - b.slotIndex);
  return sorted.map((slot) => {
    assertFiniteNumber(slot.slotIndex, 'slotStats.slotIndex');
    assertNonEmptyString(slot.classId, 'slotStats.classId');
    assertFiniteNumber(slot.damageDealt, 'slotStats.damageDealt');
    assertFiniteNumber(slot.damageTaken, 'slotStats.damageTaken');
    assertFiniteNumber(slot.healingDealt, 'slotStats.healingDealt');
    return {
      slotIndex: slot.slotIndex,
      classId: slot.classId,
      damageDealt: slot.damageDealt,
      damageTaken: slot.damageTaken,
      healingDealt: slot.healingDealt,
    };
  });
}

function canonicalizeWaves(
  waves: readonly ProblemSeriesSimWaveTimeline[],
): readonly ProblemSeriesSimWaveTimeline[] {
  const sorted = [...waves].sort((a, b) => a.waveIndex - b.waveIndex);
  return sorted.map((wave) => {
    assertFiniteNumber(wave.waveIndex, 'waves.waveIndex');
    assertFiniteNumber(wave.startTick, 'waves.startTick');
    assertFiniteNumber(wave.endTick, 'waves.endTick');
    assertFiniteNumber(wave.startSec, 'waves.startSec');
    assertFiniteNumber(wave.endSec, 'waves.endSec');
    if (
      wave.result !== 'cleared' &&
      wave.result !== 'defeat' &&
      wave.result !== 'timeout'
    ) {
      throw new Error(`invalid wave result: ${String(wave.result)}`);
    }
    return {
      waveIndex: wave.waveIndex,
      startTick: wave.startTick,
      endTick: wave.endTick,
      startSec: wave.startSec,
      endSec: wave.endSec,
      result: wave.result,
    };
  });
}

/**
 * 戦闘指標 signature。
 * identity / planned / 実適用 choice / resourceLedger / enemyWaveInputs は含めない。
 */
export function battleMetricsSignature(result: ProblemSeriesSimResult): string {
  const outcome = result.outcome;
  if (outcome !== 'victory' && outcome !== 'defeat' && outcome !== 'timeout') {
    throw new Error(`invalid outcome: ${String(outcome)}`);
  }
  assertFiniteNumber(result.finalWaveIndex, 'finalWaveIndex');
  assertFiniteNumber(result.tickCount, 'tickCount');
  assertFiniteNumber(result.durationSec, 'durationSec');
  assertFiniteNumber(result.survivingAllies, 'survivingAllies');
  assertFiniteNumber(result.survivingEnemies, 'survivingEnemies');
  assertFiniteNumber(result.totalRemainingAllyHp, 'totalRemainingAllyHp');
  assertFiniteNumber(result.totalMaxAllyHp, 'totalMaxAllyHp');
  assertFiniteNumber(result.totalRemainingEnemyHp, 'totalRemainingEnemyHp');
  if (typeof result.timedOut !== 'boolean') {
    throw new Error(`timedOut must be boolean, got ${String(result.timedOut)}`);
  }
  if (!Array.isArray(result.waves)) {
    throw new Error('waves must be an array');
  }
  if (!Array.isArray(result.slotStats)) {
    throw new Error('slotStats must be an array');
  }
  return JSON.stringify({
    outcome,
    finalWaveIndex: result.finalWaveIndex,
    tickCount: result.tickCount,
    durationSec: result.durationSec,
    waves: canonicalizeWaves(result.waves),
    survivingAllies: result.survivingAllies,
    survivingEnemies: result.survivingEnemies,
    totalRemainingAllyHp: result.totalRemainingAllyHp,
    totalMaxAllyHp: result.totalMaxAllyHp,
    totalRemainingEnemyHp: result.totalRemainingEnemyHp,
    slotStats: canonicalizeSlotStats(result.slotStats),
    timedOut: result.timedOut,
  });
}

/**
 * timeout 三条件の成立数。
 * 0 = 非膠着、3 = 無限膠着候補、1〜2 = 矛盾（呼び出し側で throw）。
 */
export function countTimeoutTripleConditions(
  result: ProblemSeriesSimResult,
  maxTicks: number,
): number {
  assertFiniteNumber(result.tickCount, 'tickCount');
  assertFiniteNumber(maxTicks, 'maxTicks');
  if (typeof result.timedOut !== 'boolean') {
    throw new Error(`timedOut must be boolean, got ${String(result.timedOut)}`);
  }
  let count = 0;
  if (result.outcome === 'timeout') count += 1;
  if (result.timedOut === true) count += 1;
  if (result.tickCount === maxTicks) count += 1;
  return count;
}

function assertTimeoutTripleConsistent(
  result: ProblemSeriesSimResult,
  maxTicks: number,
  label: string,
): void {
  const count = countTimeoutTripleConditions(result, maxTicks);
  if (count === 1 || count === 2) {
    throw new Error(
      `timeout triple conditions contradicted for ${label}: ` +
        `outcome=${result.outcome}, timedOut=${String(result.timedOut)}, ` +
        `tickCount=${String(result.tickCount)}, maxTicks=${String(maxTicks)}`,
    );
  }
}

function normalizeBattleRngSeed(seed: string | number): string {
  if (typeof seed === 'number') {
    assertFiniteNumber(seed, 'battleRngSeed');
    return String(seed);
  }
  if (typeof seed !== 'string') {
    throw new Error(`battleRngSeed must be string or number, got ${typeof seed}`);
  }
  return seed;
}

interface ValidatedCase {
  readonly buildId: string;
  readonly battleRngSeed: string;
  readonly maxTicks: number;
  readonly input: ProblemSeriesSimInput;
  readonly result: ProblemSeriesSimResult;
  readonly appliedChoice: string;
  readonly battleMetrics: string;
}

function validateAndFreezeCases(
  cases: readonly ProblemSeriesBalanceSignalCase[],
): {
  readonly problemSeriesSeed: string;
  readonly generatorVersion: string;
  readonly seriesId: string;
  readonly maxTicks: number;
  readonly buildIds: readonly string[];
  readonly battleRngSeeds: readonly string[];
  readonly byBuildSeed: ReadonlyMap<string, ValidatedCase>;
} {
  if (!Array.isArray(cases)) {
    throw new Error('cases must be an array');
  }
  if (cases.length === 0) {
    throw new Error('cases must not be empty');
  }

  const seenPair = new Set<string>();
  const validated: ValidatedCase[] = [];

  let problemSeriesSeed: string | undefined;
  let generatorVersion: string | undefined;
  let seriesId: string | undefined;
  let maxTicks: number | undefined;

  for (let i = 0; i < cases.length; i++) {
    const entry = cases[i];
    if (entry == null || typeof entry !== 'object') {
      throw new Error(`cases[${i}] must be an object`);
    }
    const buildId = assertNonEmptyString(entry.buildId, `cases[${i}].buildId`);
    const caseBattleRngSeed = assertNonEmptyString(
      entry.battleRngSeed,
      `cases[${i}].battleRngSeed`,
    );
    const input = entry.input;
    const result = entry.result;
    if (input == null || typeof input !== 'object') {
      throw new Error(`cases[${i}].input must be an object`);
    }
    if (result == null || typeof result !== 'object') {
      throw new Error(`cases[${i}].result must be an object`);
    }

    const inputSeriesSeed = assertNonEmptyString(
      input.problemSeriesSeed,
      `cases[${i}].input.problemSeriesSeed`,
    );
    const resultSeriesSeed = assertNonEmptyString(
      result.problemSeriesSeed,
      `cases[${i}].result.problemSeriesSeed`,
    );
    if (inputSeriesSeed !== resultSeriesSeed) {
      throw new Error(
        `cases[${i}] problemSeriesSeed mismatch: input=${inputSeriesSeed} result=${resultSeriesSeed}`,
      );
    }

    const resultGeneratorVersion = assertNonEmptyString(
      result.generatorVersion,
      `cases[${i}].result.generatorVersion`,
    );
    const resultSeriesId = assertNonEmptyString(
      result.seriesId,
      `cases[${i}].result.seriesId`,
    );

    const inputMaxTicks = assertFiniteNumber(
      input.maxTicks,
      `cases[${i}].input.maxTicks`,
    );
    if (inputMaxTicks !== PROBLEM_SERIES_BALANCE_STANDARD_MAX_TICKS) {
      throw new Error(
        `cases[${i}].input.maxTicks must be ${PROBLEM_SERIES_BALANCE_STANDARD_MAX_TICKS}, got ${inputMaxTicks}`,
      );
    }

    const inputBattleRng = normalizeBattleRngSeed(input.battleRngSeed);
    const resultBattleRng = assertNonEmptyString(
      result.battleRngSeed,
      `cases[${i}].result.battleRngSeed`,
    );
    if (inputBattleRng !== resultBattleRng) {
      throw new Error(
        `cases[${i}] battleRngSeed input/result mismatch: input=${inputBattleRng} result=${resultBattleRng}`,
      );
    }
    if (caseBattleRngSeed !== inputBattleRng) {
      throw new Error(
        `cases[${i}] battleRngSeed case/input mismatch: case=${caseBattleRngSeed} input=${inputBattleRng}`,
      );
    }

    if (problemSeriesSeed === undefined) {
      problemSeriesSeed = inputSeriesSeed;
      generatorVersion = resultGeneratorVersion;
      seriesId = resultSeriesId;
      maxTicks = inputMaxTicks;
    } else {
      if (inputSeriesSeed !== problemSeriesSeed) {
        throw new Error(
          `mixed problemSeriesSeed: expected ${problemSeriesSeed}, got ${inputSeriesSeed} at cases[${i}]`,
        );
      }
      if (resultGeneratorVersion !== generatorVersion) {
        throw new Error(
          `mixed generatorVersion: expected ${generatorVersion}, got ${resultGeneratorVersion} at cases[${i}]`,
        );
      }
      if (resultSeriesId !== seriesId) {
        throw new Error(
          `mixed seriesId: expected ${seriesId}, got ${resultSeriesId} at cases[${i}]`,
        );
      }
      if (inputMaxTicks !== maxTicks) {
        throw new Error(
          `mixed maxTicks: expected ${maxTicks}, got ${inputMaxTicks} at cases[${i}]`,
        );
      }
    }

    const pairKey = `${buildId}\0${caseBattleRngSeed}`;
    if (seenPair.has(pairKey)) {
      throw new Error(
        `duplicate buildId × battleRngSeed: ${buildId} × ${caseBattleRngSeed}`,
      );
    }
    seenPair.add(pairKey);

    assertTimeoutTripleConsistent(
      result,
      inputMaxTicks,
      `cases[${i}] ${buildId}×${caseBattleRngSeed}`,
    );

    const appliedChoice = appliedChoiceSignature(result);
    const battleMetrics = battleMetricsSignature(result);

    validated.push({
      buildId,
      battleRngSeed: caseBattleRngSeed,
      maxTicks: inputMaxTicks,
      input,
      result,
      appliedChoice,
      battleMetrics,
    });
  }

  const buildIds = sortStrings([...new Set(validated.map((c) => c.buildId))]);
  const battleRngSeeds = sortStrings([
    ...new Set(validated.map((c) => c.battleRngSeed)),
  ]);

  if (buildIds.length < 3) {
    throw new Error(`expected at least 3 builds, got ${buildIds.length}`);
  }
  if (battleRngSeeds.length < 3) {
    throw new Error(`expected at least 3 battleRngSeeds, got ${battleRngSeeds.length}`);
  }

  const byBuildSeed = new Map<string, ValidatedCase>();
  for (const entry of validated) {
    byBuildSeed.set(`${entry.buildId}\0${entry.battleRngSeed}`, entry);
  }

  for (const buildId of buildIds) {
    for (const seed of battleRngSeeds) {
      const key = `${buildId}\0${seed}`;
      if (!byBuildSeed.has(key)) {
        throw new Error(`rectangular coverage missing: ${buildId} × ${seed}`);
      }
    }
  }

  const expectedCaseCount = buildIds.length * battleRngSeeds.length;
  if (validated.length !== expectedCaseCount) {
    throw new Error(
      `rectangular coverage size mismatch: cases=${validated.length} expected=${expectedCaseCount}`,
    );
  }

  return {
    problemSeriesSeed: problemSeriesSeed!,
    generatorVersion: generatorVersion!,
    seriesId: seriesId!,
    maxTicks: maxTicks!,
    buildIds,
    battleRngSeeds,
    byBuildSeed,
  };
}

function detectImmediatePartyWipeCandidates(
  buildIds: readonly string[],
  battleRngSeeds: readonly string[],
  byBuildSeed: ReadonlyMap<string, ValidatedCase>,
): ProblemSeriesBalanceSignalCaseRef[] {
  const out: ProblemSeriesBalanceSignalCaseRef[] = [];
  for (const buildId of buildIds) {
    for (const battleRngSeed of battleRngSeeds) {
      const entry = byBuildSeed.get(`${buildId}\0${battleRngSeed}`)!;
      if (
        entry.result.outcome === 'defeat' &&
        entry.result.finalWaveIndex === 0
      ) {
        out.push({ buildId, battleRngSeed });
      }
    }
  }
  return out;
}

function detectStalemateCandidates(
  buildIds: readonly string[],
  battleRngSeeds: readonly string[],
  byBuildSeed: ReadonlyMap<string, ValidatedCase>,
): ProblemSeriesBalanceSignalCaseRef[] {
  const out: ProblemSeriesBalanceSignalCaseRef[] = [];
  for (const buildId of buildIds) {
    for (const battleRngSeed of battleRngSeeds) {
      const entry = byBuildSeed.get(`${buildId}\0${battleRngSeed}`)!;
      if (countTimeoutTripleConditions(entry.result, entry.maxTicks) === 3) {
        out.push({ buildId, battleRngSeed });
      }
    }
  }
  return out;
}

function detectIneffectiveChoicePairs(
  buildIds: readonly string[],
  battleRngSeeds: readonly string[],
  byBuildSeed: ReadonlyMap<string, ValidatedCase>,
): ProblemSeriesBalanceIneffectiveChoicePair[] {
  const pairs: ProblemSeriesBalanceIneffectiveChoicePair[] = [];
  for (let i = 0; i < buildIds.length; i++) {
    for (let j = i + 1; j < buildIds.length; j++) {
      const buildIdA = buildIds[i]!;
      const buildIdB = buildIds[j]!;
      let allMatch = true;
      for (const seed of battleRngSeeds) {
        const a = byBuildSeed.get(`${buildIdA}\0${seed}`)!;
        const b = byBuildSeed.get(`${buildIdB}\0${seed}`)!;
        if (a.appliedChoice === b.appliedChoice) {
          allMatch = false;
          break;
        }
        if (a.battleMetrics !== b.battleMetrics) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        pairs.push({ buildIdA, buildIdB });
      }
    }
  }
  return pairs;
}

function detectSingleSolutionCandidateBuildIds(
  buildIds: readonly string[],
  battleRngSeeds: readonly string[],
  byBuildSeed: ReadonlyMap<string, ValidatedCase>,
): string[] {
  const choiceColumnByBuild = new Map<string, string>();
  const outcomesByBuild = new Map<string, readonly ProblemSeriesSimBattleOutcome[]>();

  for (const buildId of buildIds) {
    const choiceParts: string[] = [];
    const outcomes: ProblemSeriesSimBattleOutcome[] = [];
    for (const seed of battleRngSeeds) {
      const entry = byBuildSeed.get(`${buildId}\0${seed}`)!;
      choiceParts.push(entry.appliedChoice);
      outcomes.push(entry.result.outcome);
    }
    choiceColumnByBuild.set(buildId, JSON.stringify(choiceParts));
    outcomesByBuild.set(buildId, outcomes);
  }

  const columns = [...choiceColumnByBuild.values()];
  const uniqueColumns = new Set(columns);
  if (uniqueColumns.size !== buildIds.length) {
    // 実適用 choice 列が構築間で同一 → 単一正解化候補ではない（非発火）。
    return [];
  }

  const allVictoryBuilds: string[] = [];
  const allNonVictoryBuilds: string[] = [];
  for (const buildId of buildIds) {
    const outcomes = outcomesByBuild.get(buildId)!;
    const allVictory = outcomes.every((o) => o === 'victory');
    const allNonVictory = outcomes.every((o) => o !== 'victory');
    if (allVictory) {
      allVictoryBuilds.push(buildId);
    } else if (allNonVictory) {
      allNonVictoryBuilds.push(buildId);
    } else {
      // mixed outcome → 条件不成立（非発火）。
      return [];
    }
  }

  if (allVictoryBuilds.length !== 1) {
    return [];
  }
  if (allNonVictoryBuilds.length !== buildIds.length - 1) {
    return [];
  }
  return [...allVictoryBuilds];
}

/**
 * 4 検出語の候補を検出する。入力配列は変更しない。
 * Math.random / 勝率 / 平均 / 近似閾値は使わない。
 */
export function detectProblemSeriesBalanceSignals(
  cases: readonly ProblemSeriesBalanceSignalCase[],
): ProblemSeriesBalanceSignalReport {
  const validated = validateAndFreezeCases(cases);
  const { buildIds, battleRngSeeds, byBuildSeed } = validated;

  const immediatePartyWipeCandidates = detectImmediatePartyWipeCandidates(
    buildIds,
    battleRngSeeds,
    byBuildSeed,
  );
  const stalemateCandidates = detectStalemateCandidates(
    buildIds,
    battleRngSeeds,
    byBuildSeed,
  );
  const ineffectiveChoiceCandidatePairs = detectIneffectiveChoicePairs(
    buildIds,
    battleRngSeeds,
    byBuildSeed,
  );
  const singleSolutionCandidateBuildIds = detectSingleSolutionCandidateBuildIds(
    buildIds,
    battleRngSeeds,
    byBuildSeed,
  );

  let evaluatedPairCount = 0;
  for (let i = 0; i < buildIds.length; i++) {
    for (let j = i + 1; j < buildIds.length; j++) {
      evaluatedPairCount += 1;
    }
  }

  return {
    problemSeriesSeed: validated.problemSeriesSeed,
    generatorVersion: validated.generatorVersion,
    seriesId: validated.seriesId,
    maxTicks: validated.maxTicks,
    evaluatedCaseCount: buildIds.length * battleRngSeeds.length,
    evaluatedBuildCount: buildIds.length,
    evaluatedSeedCount: battleRngSeeds.length,
    buildIds,
    battleRngSeeds,
    evaluatedPairCount,
    immediatePartyWipeCandidates,
    stalemateCandidates,
    ineffectiveChoiceCandidatePairs,
    singleSolutionCandidateBuildIds,
  };
}
