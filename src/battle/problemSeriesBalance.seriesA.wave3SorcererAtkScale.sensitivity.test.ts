/**
 * R12n 1J / 1J-R1 — 系列A Wave 3 enemy sorcerer atkScale 感度比較（test-only）。
 *
 * 前提: Wave 2 guardian hpScale=0.75（1F〜1I で固定した接続経路）。
 * 観測点 1.00 / 0.98 / 0.95 / 0.93 / 0.90 × 3 構築 × 3 seed = 45 case。
 * 1J-R1 で scale 別の質的遷移を assertObservedAtkScaleTransition により直接固定。
 * production 採用・勝率/平均/近似閾値・合格 scale 断定はしない。
 * 候補検出は自動不合格・production 採用条件ではない。
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
  createSeriesAWave3SorcererAtkScaleTransform,
  normalizeProblemSeriesSimResultForCompare,
  runProblemSeriesSim,
  SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET,
  type ProblemSeriesSimCombatActionDiagnostic,
  type ProblemSeriesSimCombatFlowDamageEvent,
  type ProblemSeriesSimFinalEnemyDiagnostic,
  type ProblemSeriesSimInput,
  type ProblemSeriesSimResolvedWaveTransform,
  type ProblemSeriesSimResult,
  type ProblemSeriesSimSurvivingEnemyDiagnostic,
  type ProblemSeriesSimTickAliveUnitDiagnostic,
  type ProblemSeriesSimTickStateDiagnostic,
  type ProblemSeriesSimWavePlan,
} from './test/problemSeriesSim.harness.ts';
import { PARTY_SLOT_COUNT } from './types.ts';

const EXPECTED_BASELINE_A_SHA256 =
  '2c6e6ad212bfaffb3259613d2d15a39a7910f7b7ba0474240f72cedd5c49062c';
const EXPECTED_BASELINE_B_SHA256 =
  'b575d9830b57bce29c3fc2d13ebb8db7044ee592d3363aae1bf457b0d7e1d47c';

const PROBLEM_SERIES_SEED = 'fixture-a';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_ID = 'r12m_series_a';
const GUARDIAN_HP_SCALE = 0.75;

/** 1J 固定観測点。丸めで同一実 ATK になる重複点は含めない。 */
const ATK_SCALE_POINTS = [1.0, 0.98, 0.95, 0.93, 0.9] as const;
const EXPECTED_APPLIED_ATK_BY_SCALE: Readonly<Record<number, number>> = {
  1.0: 42,
  0.98: 41,
  0.95: 40,
  0.93: 39,
  0.9: 38,
};

const BUILD_IDS = [
  'no-spend-control',
  'known-attack-24',
  'alternate-core-24',
] as const;

const BATTLE_RNG_SEEDS = [
  'r12n-1c-a-01',
  'r12n-1c-a-02',
  'r12n-1c-a-03',
] as const;

const FRONTLINE_CLASS_CANDIDATES = ['df_guardian', 'at_swordsman'] as const;
const REAR_CLASS_IDS = ['sp_cleric', 'at_sorcerer'] as const;

type BuildId = (typeof BUILD_IDS)[number];
type BattleRngSeed = (typeof BATTLE_RNG_SEEDS)[number];
type AtkScale = (typeof ATK_SCALE_POINTS)[number];
type StopReason = 'first_rear_hit' | 'ally_sorcerer_lethal' | 'battle_end';

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

interface AllySorcererDamageTaken {
  readonly actorClassId: string;
  readonly skillId: string;
  readonly amount: number;
  readonly battleTimeSec: number;
  readonly lethal: boolean;
}

interface PostFrontlineObs {
  readonly checkpointHp: number | null;
  readonly chainDamageAmount: number;
  readonly chainHitCount: number;
  readonly chainLethal: boolean;
  readonly postBasicActionCount: number;
  readonly firstRearHit: boolean;
  readonly stopReason: StopReason | null;
  readonly allySorcererDamageAmounts: readonly number[];
}

interface SensitivityCaseRow {
  readonly atkScale: number;
  readonly appliedEnemySorcererAtk: number | null;
  readonly buildId: BuildId;
  readonly battleRngSeed: BattleRngSeed;
  readonly outcome: ProblemSeriesSimResult['outcome'];
  readonly finalWaveIndex: number;
  readonly waveResults: readonly string[];
  readonly tickCount: number;
  readonly survivingAllies: number;
  readonly survivingEnemies: number;
  readonly totalRemainingAllyHp: number;
  readonly totalRemainingEnemyHp: number;
  readonly slotStats: ProblemSeriesSimResult['slotStats'];
  readonly resourceLedger: ProblemSeriesSimResult['resourceLedger'];
  readonly appliedCombatModuleIdBySlot: readonly string[];
  readonly acquiredPassivesBySlot: readonly (readonly string[])[];
  readonly reachedWave3: boolean;
  readonly wave3PlannedApplied: boolean;
  readonly sorcererDamageToAllies: number;
  readonly sorcererLethalToAllies: number;
  readonly postFrontline: PostFrontlineObs | null;
  readonly finalRearHpByClass: Readonly<Record<string, number>>;
  readonly survivorClassIds: readonly string[];
}

/** Result 比較から enemyWaveInputs を除いた no-spend 非波及用。 */
interface NoSpendInvariantSlice {
  readonly outcome: ProblemSeriesSimResult['outcome'];
  readonly finalWaveIndex: number;
  readonly waveResults: readonly string[];
  readonly tickCount: number;
  readonly survivingAllies: number;
  readonly survivingEnemies: number;
  readonly totalRemainingAllyHp: number;
  readonly totalRemainingEnemyHp: number;
  readonly slotStats: ProblemSeriesSimResult['slotStats'];
  readonly resourceLedger: ProblemSeriesSimResult['resourceLedger'];
  readonly appliedCombatModuleIdBySlot: readonly string[];
  readonly acquiredPassivesBySlot: readonly (readonly string[])[];
}

interface DiagnosticBundle {
  readonly result: ProblemSeriesSimResult;
  readonly damageEvents: readonly ProblemSeriesSimCombatFlowDamageEvent[];
  readonly actionEvents: readonly ProblemSeriesSimCombatActionDiagnostic[];
  readonly tickStates: readonly ProblemSeriesSimTickStateDiagnostic[];
  readonly finalEnemy: ProblemSeriesSimFinalEnemyDiagnostic | undefined;
  readonly observationCompareKey: string;
}

const baselineAPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'test/baselines/r12n-series-a-before.json',
);
const baselineBPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'test/baselines/r12n-series-b-before.json',
);

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function assertBaselineShaUnchanged(): void {
  expect(sha256Hex(readFileSync(baselineAPath))).toBe(EXPECTED_BASELINE_A_SHA256);
  expect(sha256Hex(readFileSync(baselineBPath))).toBe(EXPECTED_BASELINE_B_SHA256);
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

function transformContext() {
  return {
    seriesId: SERIES_ID,
    problemSeriesSeed: PROBLEM_SERIES_SEED,
    generatorVersion: GENERATOR_VERSION,
  };
}

/** 適用順: Wave2 guardian hpScale → Wave3 sorcerer atkScale。 */
function composeSeriesAGuardianThenSorcererAtkTransform(
  guardianHpScale: number,
  sorcererAtkScale: number,
): ProblemSeriesSimResolvedWaveTransform {
  const guardian = createSeriesAWave2GuardianHpScaleTransform(guardianHpScale);
  const sorcerer = createSeriesAWave3SorcererAtkScaleTransform(sorcererAtkScale);
  return (waves, context) => sorcerer(guardian(waves, context), context);
}

function groupIdentityWithoutAtkScale(
  group: ProblemSeriesBattleEnemyGroup,
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...group };
  delete copy.atkScale;
  return copy;
}

/**
 * guardian hpScale=0.75 適用後 Wave を入力とし、sorcerer atkScale 以外不変を固定。
 */
function assertTransformTouchesOnlyWave3SorcererAtkScale(
  guardianOnlyWaves: readonly ProblemSeriesBattleWave[],
  transformed: readonly ProblemSeriesBattleWave[],
  atkScale: number,
): void {
  expect(transformed).toHaveLength(3);
  expect(guardianOnlyWaves).toHaveLength(3);

  for (let waveIndex = 0; waveIndex < 3; waveIndex++) {
    const before = guardianOnlyWaves[waveIndex]!;
    const after = transformed[waveIndex]!;
    expect(after.prepResourceGrant).toBe(before.prepResourceGrant);
    expect(after.enemyGroups).toHaveLength(before.enemyGroups.length);

    if (waveIndex !== SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.waveIndex) {
      expect(after).toEqual(before);
      continue;
    }

    let sorcererCount = 0;
    for (let groupIndex = 0; groupIndex < before.enemyGroups.length; groupIndex++) {
      const beforeGroup = before.enemyGroups[groupIndex]!;
      const afterGroup = after.enemyGroups[groupIndex]!;
      expect(groupIdentityWithoutAtkScale(afterGroup)).toEqual(
        groupIdentityWithoutAtkScale(beforeGroup),
      );
      if (beforeGroup.classId === SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.classId) {
        sorcererCount += 1;
        if (atkScale === 1) {
          expect(Object.prototype.hasOwnProperty.call(afterGroup, 'atkScale')).toBe(
            false,
          );
        } else {
          expect(afterGroup.atkScale).toBe(atkScale);
        }
      } else {
        expect(afterGroup).toEqual(beforeGroup);
      }
    }
    expect(sorcererCount).toBe(
      SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.expectedSorcererGroupCount,
    );
  }
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

function resolveFrontlineFromWave(wave: ProblemSeriesBattleWave): {
  classIds: string[];
  requiredDeaths: number;
} {
  const classIds: string[] = [];
  let requiredDeaths = 0;
  for (const candidate of FRONTLINE_CLASS_CANDIDATES) {
    let count = 0;
    for (const group of wave.enemyGroups) {
      if (group.classId === candidate) {
        count += group.count;
      }
    }
    if (count > 0) {
      classIds.push(candidate);
      requiredDeaths += count;
    }
  }
  return { classIds, requiredDeaths };
}

function captureWave3EnemySorcererAtk(
  tickStates: readonly ProblemSeriesSimTickStateDiagnostic[],
): number | null {
  for (const state of tickStates) {
    if (state.waveIndex !== SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.waveIndex) {
      continue;
    }
    const matches = state.enemies.filter(
      (enemy) =>
        enemy.classId === SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.classId,
    );
    if (matches.length === 0) continue;
    expect(matches).toHaveLength(1);
    expect(Number.isFinite(matches[0]!.atk)).toBe(true);
    return matches[0]!.atk;
  }
  return null;
}

function noSpendInvariantSlice(result: ProblemSeriesSimResult): NoSpendInvariantSlice {
  return {
    outcome: result.outcome,
    finalWaveIndex: result.finalWaveIndex,
    waveResults: result.waves.map((w) => `${w.waveIndex}:${w.result}`),
    tickCount: result.tickCount,
    survivingAllies: result.survivingAllies,
    survivingEnemies: result.survivingEnemies,
    totalRemainingAllyHp: result.totalRemainingAllyHp,
    totalRemainingEnemyHp: result.totalRemainingEnemyHp,
    slotStats: result.slotStats,
    resourceLedger: result.resourceLedger,
    appliedCombatModuleIdBySlot: result.appliedCombatModuleIdBySlot,
    acquiredPassivesBySlot: result.acquiredPassivesBySlot,
  };
}

function findUniqueAllySorcerer(
  allies: readonly ProblemSeriesSimTickAliveUnitDiagnostic[],
): ProblemSeriesSimTickAliveUnitDiagnostic | null {
  const matches = allies.filter((unit) => unit.classId === 'at_sorcerer');
  if (matches.length === 0) return null;
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

function buildObservationCompareKey(bundle: {
  result: ProblemSeriesSimResult;
  damageEvents: readonly ProblemSeriesSimCombatFlowDamageEvent[];
  actionEvents: readonly ProblemSeriesSimCombatActionDiagnostic[];
  tickStates: readonly ProblemSeriesSimTickStateDiagnostic[];
  finalEnemy: ProblemSeriesSimFinalEnemyDiagnostic | undefined;
}): string {
  const survivors =
    bundle.finalEnemy?.survivingEnemies.map((enemy) => ({
      classId: enemy.classId,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      atk: enemy.atk,
      basicSkillId: enemy.basicSkillId,
    })) ?? [];
  return JSON.stringify({
    result: bundle.result,
    damageEvents: bundle.damageEvents,
    actionEvents: bundle.actionEvents,
    tickAliveFingerprints: bundle.tickStates.map((state) => ({
      waveIndex: state.waveIndex,
      battleTimeSec: state.battleTimeSec,
      phase: state.phase,
      allies: state.allies.map((u) => ({
        id: u.id,
        classId: u.classId,
        hp: u.hp,
        atk: u.atk,
        battleX: u.battleX,
        bodyAnimMarching: u.bodyAnimMarching,
        useLocked: u.useLocked ?? null,
      })),
      enemies: state.enemies.map((u) => ({
        id: u.id,
        classId: u.classId,
        hp: u.hp,
        atk: u.atk,
        battleX: u.battleX,
      })),
    })),
    survivors,
  });
}

function runInstrumentedCase(
  baselineCase: SeriesABaselineCase,
  transform: ProblemSeriesSimResolvedWaveTransform,
): DiagnosticBundle {
  const damageEvents: ProblemSeriesSimCombatFlowDamageEvent[] = [];
  const actionEvents: ProblemSeriesSimCombatActionDiagnostic[] = [];
  const tickStates: ProblemSeriesSimTickStateDiagnostic[] = [];
  let finalEnemy: ProblemSeriesSimFinalEnemyDiagnostic | undefined;

  const result = runProblemSeriesSim({
    ...baselineCase.input,
    transformResolvedBattleWaves: transform,
    onCombatFlowDamage: (event) => {
      damageEvents.push(event);
    },
    onCombatActionDiagnostic: (event) => {
      actionEvents.push(event);
    },
    onTickStateDiagnostic: (state) => {
      tickStates.push(state);
    },
    onFinalEnemyDiagnostic: (diagnostic) => {
      finalEnemy = diagnostic;
    },
  });

  return {
    result,
    damageEvents,
    actionEvents,
    tickStates,
    finalEnemy,
    observationCompareKey: buildObservationCompareKey({
      result,
      damageEvents,
      actionEvents,
      tickStates,
      finalEnemy,
    }),
  };
}

function diagnosePostFrontline(
  bundle: DiagnosticBundle,
): PostFrontlineObs | null {
  const { result, damageEvents, actionEvents, tickStates } = bundle;
  if (result.finalWaveIndex < 2) return null;

  const finalWaveIndex = result.finalWaveIndex;
  const finalWaveInputs = result.enemyWaveInputs[finalWaveIndex];
  expect(finalWaveInputs).toBeDefined();
  const frontline = resolveFrontlineFromWave(finalWaveInputs!);
  expect(frontline.requiredDeaths).toBeGreaterThan(0);

  const finalWaveDamages = damageEvents.filter((e) => e.waveIndex === finalWaveIndex);
  const frontlineSet = new Set(frontline.classIds);
  const rearSet = new Set<string>(REAR_CLASS_IDS);

  let frontlineDeaths = 0;
  let lastFrontlineLethalSec: number | null = null;
  for (const event of finalWaveDamages) {
    if (
      event.lethal &&
      event.target.isEnemy &&
      frontlineSet.has(event.target.classId)
    ) {
      frontlineDeaths += 1;
      lastFrontlineLethalSec = event.battleTimeSec;
    }
  }
  // 最終前衛未処理: post-frontline 観測対象外（null）。Wave3 到達有無は row.reachedWave3 で別固定。
  if (frontlineDeaths < frontline.requiredDeaths || lastFrontlineLethalSec === null) {
    return null;
  }

  let checkpoint: ProblemSeriesSimTickStateDiagnostic | null = null;
  let lastAliveAllySorcerer: ProblemSeriesSimTickAliveUnitDiagnostic | null = null;
  for (const state of tickStates) {
    if (state.waveIndex !== finalWaveIndex) continue;
    if (state.battleTimeSec < lastFrontlineLethalSec) {
      const living = findUniqueAllySorcerer(state.allies);
      if (living) lastAliveAllySorcerer = living;
      continue;
    }
    if (checkpoint === null) {
      checkpoint = state;
      const living = findUniqueAllySorcerer(state.allies);
      if (living) lastAliveAllySorcerer = living;
      break;
    }
  }
  expect(checkpoint).not.toBeNull();
  expect(lastAliveAllySorcerer).not.toBeNull();
  const allySorcererId = lastAliveAllySorcerer!.id;
  const checkpointAlly = findUniqueAllySorcerer(checkpoint!.allies);
  const checkpointHp = checkpointAlly?.hp ?? null;

  let firstRearHitSec: number | null = null;
  let allySorcererLethalSec: number | null = null;
  for (const event of finalWaveDamages) {
    if (event.battleTimeSec < lastFrontlineLethalSec) continue;
    if (
      firstRearHitSec === null &&
      !event.actor.isEnemy &&
      event.target.isEnemy &&
      rearSet.has(event.target.classId)
    ) {
      firstRearHitSec = event.battleTimeSec;
    }
    if (
      allySorcererLethalSec === null &&
      event.lethal &&
      event.target.id === allySorcererId
    ) {
      allySorcererLethalSec = event.battleTimeSec;
    }
  }

  const battleEndSec = result.waves.find((w) => w.waveIndex === finalWaveIndex)!
    .endSec;
  const candidates: { reason: StopReason; sec: number }[] = [
    { reason: 'battle_end', sec: battleEndSec },
  ];
  if (firstRearHitSec !== null) {
    candidates.push({ reason: 'first_rear_hit', sec: firstRearHitSec });
  }
  if (allySorcererLethalSec !== null) {
    candidates.push({ reason: 'ally_sorcerer_lethal', sec: allySorcererLethalSec });
  }
  candidates.sort((a, b) => {
    if (a.sec !== b.sec) return a.sec - b.sec;
    const order: Record<StopReason, number> = {
      first_rear_hit: 0,
      ally_sorcerer_lethal: 1,
      battle_end: 2,
    };
    return order[a.reason] - order[b.reason];
  });
  const stopReason = candidates[0]!.reason;
  const stopSec = candidates[0]!.sec;

  const postDamageTaken: AllySorcererDamageTaken[] = [];
  for (const event of finalWaveDamages) {
    if (event.battleTimeSec < lastFrontlineLethalSec) continue;
    if (event.battleTimeSec > stopSec) continue;
    if (event.target.id !== allySorcererId) continue;
    if (!event.actor.isEnemy || event.target.isEnemy) continue;
    postDamageTaken.push({
      actorClassId: event.actor.classId,
      skillId: event.skillId,
      amount: event.amount,
      battleTimeSec: event.battleTimeSec,
      lethal: event.lethal,
    });
  }
  const chainExact = postDamageTaken.filter(
    (d) => d.skillId === 'at_sorcerer_mod_chain',
  );

  let postBasicActionCount = 0;
  for (const event of actionEvents) {
    if (event.waveIndex !== finalWaveIndex) continue;
    if (event.actor.id !== allySorcererId) continue;
    if (event.battleTimeSec < checkpoint!.battleTimeSec) continue;
    if (event.battleTimeSec > stopSec) continue;
    if (event.slotKind === 'basic') postBasicActionCount += 1;
  }

  return {
    checkpointHp,
    chainDamageAmount: chainExact.reduce((sum, d) => sum + d.amount, 0),
    chainHitCount: chainExact.length,
    chainLethal: chainExact.some((d) => d.lethal),
    postBasicActionCount,
    firstRearHit: firstRearHitSec !== null,
    stopReason,
    allySorcererDamageAmounts: chainExact.map((d) => d.amount),
  };
}

function finalRearHpByClass(
  finalEnemy: ProblemSeriesSimFinalEnemyDiagnostic | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!finalEnemy) return out;
  for (const survivor of finalEnemy.survivingEnemies) {
    if ((REAR_CLASS_IDS as readonly string[]).includes(survivor.classId)) {
      expect(
        Object.prototype.hasOwnProperty.call(out, survivor.classId),
      ).toBe(false);
      out[survivor.classId] = survivor.hp;
    }
  }
  return out;
}

function sorcererAllyDamageMetrics(
  damageEvents: readonly ProblemSeriesSimCombatFlowDamageEvent[],
  finalWaveIndex: number,
): { damage: number; lethals: number } {
  let damage = 0;
  let lethals = 0;
  for (const event of damageEvents) {
    if (event.waveIndex !== finalWaveIndex) continue;
    if (!event.actor.isEnemy || event.target.isEnemy) continue;
    if (event.actor.classId !== 'at_sorcerer') continue;
    damage += event.amount;
    if (event.lethal) lethals += 1;
  }
  return { damage, lethals };
}

function assertCaseMetricsPresent(result: ProblemSeriesSimResult): void {
  expect(result.seriesId).toBe(SERIES_ID);
  expect(result.problemSeriesSeed).toBe(PROBLEM_SERIES_SEED);
  expect(result.generatorVersion).toBe(GENERATOR_VERSION);
  expect(Number.isFinite(result.tickCount)).toBe(true);
  expect(result.tickCount).toBeGreaterThan(0);
  expect(result.slotStats).toHaveLength(PARTY_SLOT_COUNT);
  expect(result.appliedCombatModuleIdBySlot).toHaveLength(PARTY_SLOT_COUNT);
  expect(result.acquiredPassivesBySlot).toHaveLength(PARTY_SLOT_COUNT);
  expect(result.resourceLedger.length).toBe(result.finalWaveIndex + 1);
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

function assertBaselineCoverage(baseline: SeriesABaselineFile): void {
  const baselinePairKeys = new Set<string>();
  for (const caseEntry of baseline.cases) {
    expect(BUILD_IDS.includes(caseEntry.buildId as BuildId)).toBe(true);
    expect(
      BATTLE_RNG_SEEDS.includes(caseEntry.battleRngSeed as BattleRngSeed),
    ).toBe(true);
    const key = `${caseEntry.buildId}::${caseEntry.battleRngSeed}`;
    expect(baselinePairKeys.has(key)).toBe(false);
    baselinePairKeys.add(key);
  }
  expect(baselinePairKeys.size).toBe(9);
}

function caseKey(buildId: BuildId, battleRngSeed: BattleRngSeed): string {
  return `${buildId}::${battleRngSeed}`;
}

function indexRowsByBuildSeed(
  rows: readonly SensitivityCaseRow[],
): ReadonlyMap<string, SensitivityCaseRow> {
  const byKey = new Map<string, SensitivityCaseRow>();
  for (const row of rows) {
    const key = caseKey(row.buildId, row.battleRngSeed);
    expect(byKey.has(key)).toBe(false);
    byKey.set(key, row);
  }
  const expectedKeys = new Set<string>();
  for (const buildId of BUILD_IDS) {
    for (const seed of BATTLE_RNG_SEEDS) {
      expectedKeys.add(caseKey(buildId, seed));
    }
  }
  expect(byKey.size).toBe(expectedKeys.size);
  for (const key of expectedKeys) {
    expect(byKey.has(key)).toBe(true);
  }
  for (const key of byKey.keys()) {
    expect(expectedKeys.has(key)).toBe(true);
  }
  return byKey;
}

function requireRow(
  byKey: ReadonlyMap<string, SensitivityCaseRow>,
  buildId: BuildId,
  battleRngSeed: BattleRngSeed,
): SensitivityCaseRow {
  const row = byKey.get(caseKey(buildId, battleRngSeed));
  expect(row).toBeDefined();
  return row!;
}

function requirePostFrontline(row: SensitivityCaseRow): PostFrontlineObs {
  expect(row.postFrontline).not.toBeNull();
  return row.postFrontline!;
}

function assertRearOnlySurvivors(row: SensitivityCaseRow): void {
  expect(row.survivingEnemies).toBe(2);
  expect(row.survivorClassIds).toEqual([...REAR_CLASS_IDS].sort());
  expect(row.totalRemainingEnemyHp).toBe(180);
}

function assertUnprocessedFrontlineDefeat(row: SensitivityCaseRow): void {
  expect(row.outcome).toBe('defeat');
  expect(row.reachedWave3).toBe(true);
  expect(row.finalWaveIndex).toBe(2);
  // 最終前衛未処理のため post-frontline 観測なし
  expect(row.postFrontline).toBeNull();
  expect(row.survivingEnemies).toBe(3);
  expect(row.survivorClassIds).toEqual(
    ['at_sorcerer', 'at_swordsman', 'sp_cleric'].sort(),
  );
  expect(row.totalRemainingEnemyHp).toBe(238);
}

/**
 * 1J-R1: scale 別の質的遷移を直接固定する観測 assert。
 *
 * 固定できること（観測）:
 * - 直接 chain lethal の切れ目は 0.98 → 0.95
 * - alternate の後衛接続は 0.95
 * - alternate 勝利は 0.93
 * - 0.93 は両 spend 全勝（単一正解化候補が空）
 * - 0.90 では前衛処理・known seed 安定性が再び崩れる
 * - atkScale 単独では選択差を単調に説明できない
 *
 * 固定しないこと:
 * - 0.93 / 0.95 が適正値、lower atkScale ほど良い、非単調性の原因、production 採用
 *
 * 候補検出は自動不合格・production 採用条件ではない。
 */
function assertObservedAtkScaleTransition(
  atkScale: AtkScale,
  rows: readonly SensitivityCaseRow[],
  report: ProblemSeriesBalanceSignalReport,
): void {
  expect(rows).toHaveLength(9);
  expect(EXPECTED_APPLIED_ATK_BY_SCALE[atkScale]).toBeDefined();
  const byKey = indexRowsByBuildSeed(rows);

  // 4 検出語: 候補検出は自動不合格・production 採用条件ではない
  expect(report.immediatePartyWipeCandidates).toEqual([]);
  expect(report.stalemateCandidates).toEqual([]);
  expect(report.ineffectiveChoiceCandidatePairs).toEqual([]);
  const expectedSingleSolution: readonly string[] =
    atkScale === 1.0 || atkScale === 0.98 || atkScale === 0.95
      ? ['known-attack-24']
      : [];
  expect(report.singleSolutionCandidateBuildIds).toEqual(expectedSingleSolution);

  for (const seed of BATTLE_RNG_SEEDS) {
    const noSpend = requireRow(byKey, 'no-spend-control', seed);
    expect(noSpend.outcome).toBe('defeat');
    expect(noSpend.finalWaveIndex).toBe(1);
    expect(noSpend.reachedWave3).toBe(false);
    expect(noSpend.appliedEnemySorcererAtk).toBeNull();
    expect(noSpend.postFrontline).toBeNull();
    assertRearOnlySurvivors(noSpend);
  }

  if (atkScale === 1.0) {
    for (const seed of BATTLE_RNG_SEEDS) {
      const known = requireRow(byKey, 'known-attack-24', seed);
      expect(known.outcome).toBe('victory');
      expect(known.appliedEnemySorcererAtk).toBe(42);
      const pf = requirePostFrontline(known);
      expect(pf.allySorcererDamageAmounts).toEqual([22]);
      expect(pf.chainDamageAmount).toBe(22);
      expect(pf.chainHitCount).toBe(1);
      expect(pf.chainLethal).toBe(false);
      expect(pf.postBasicActionCount).toBe(2);
      expect(pf.firstRearHit).toBe(true);
      expect(pf.stopReason).toBe('first_rear_hit');

      const alt = requireRow(byKey, 'alternate-core-24', seed);
      expect(alt.outcome).toBe('defeat');
      expect(alt.appliedEnemySorcererAtk).toBe(42);
      const altPf = requirePostFrontline(alt);
      expect(altPf.checkpointHp).toBe(31);
      expect(altPf.allySorcererDamageAmounts).toEqual([22, 9]);
      expect(altPf.chainHitCount).toBe(2);
      expect(altPf.chainLethal).toBe(true);
      expect(altPf.postBasicActionCount).toBe(1);
      expect(altPf.firstRearHit).toBe(false);
      expect(altPf.stopReason).toBe('ally_sorcerer_lethal');
      assertRearOnlySurvivors(alt);
    }
    return;
  }

  if (atkScale === 0.98) {
    for (const seed of BATTLE_RNG_SEEDS) {
      const known = requireRow(byKey, 'known-attack-24', seed);
      expect(known.outcome).toBe('victory');
      expect(known.appliedEnemySorcererAtk).toBe(41);
      const pf = requirePostFrontline(known);
      expect(pf.allySorcererDamageAmounts).toEqual([21]);
      expect(pf.chainHitCount).toBe(1);
      expect(pf.chainLethal).toBe(false);
      expect(pf.postBasicActionCount).toBe(2);
      expect(pf.firstRearHit).toBe(true);
      expect(pf.stopReason).toBe('first_rear_hit');
    }

    // a-01 / a-02: なお直接 lethal。a-03 だけ前衛未処理（全 seed 同一経路とまとめない）。
    for (const seed of ['r12n-1c-a-01', 'r12n-1c-a-02'] as const) {
      const alt = requireRow(byKey, 'alternate-core-24', seed);
      expect(alt.outcome).toBe('defeat');
      expect(alt.appliedEnemySorcererAtk).toBe(41);
      const altPf = requirePostFrontline(alt);
      expect(altPf.checkpointHp).toBe(34);
      expect(altPf.allySorcererDamageAmounts).toEqual([21, 13]);
      expect(altPf.chainHitCount).toBe(2);
      expect(altPf.chainLethal).toBe(true);
      expect(altPf.postBasicActionCount).toBe(1);
      expect(altPf.firstRearHit).toBe(false);
      expect(altPf.stopReason).toBe('ally_sorcerer_lethal');
      assertRearOnlySurvivors(alt);
    }

    const alt03 = requireRow(byKey, 'alternate-core-24', 'r12n-1c-a-03');
    expect(alt03.appliedEnemySorcererAtk).toBe(41);
    assertUnprocessedFrontlineDefeat(alt03);
    return;
  }

  if (atkScale === 0.95) {
    for (const seed of BATTLE_RNG_SEEDS) {
      const known = requireRow(byKey, 'known-attack-24', seed);
      expect(known.outcome).toBe('victory');
      expect(known.appliedEnemySorcererAtk).toBe(40);
      const pf = requirePostFrontline(known);
      expect(pf.allySorcererDamageAmounts).toEqual([21]);
      expect(pf.chainHitCount).toBe(1);
      expect(pf.chainLethal).toBe(false);
      expect(pf.postBasicActionCount).toBe(2);
      expect(pf.firstRearHit).toBe(true);

      // lethal を越え後衛 hit へ接続したが、勝利にはならない
      const alt = requireRow(byKey, 'alternate-core-24', seed);
      expect(alt.outcome).toBe('defeat');
      expect(alt.appliedEnemySorcererAtk).toBe(40);
      const altPf = requirePostFrontline(alt);
      expect(altPf.checkpointHp).toBe(40);
      expect(altPf.allySorcererDamageAmounts).toEqual([21]);
      expect(altPf.chainHitCount).toBe(1);
      expect(altPf.chainLethal).toBe(false);
      expect(altPf.postBasicActionCount).toBe(2);
      expect(altPf.firstRearHit).toBe(true);
      expect(altPf.stopReason).toBe('first_rear_hit');
      assertRearOnlySurvivors(alt);
      expect(alt.finalRearHpByClass.sp_cleric).toBe(125);
      expect(alt.finalRearHpByClass.at_sorcerer).toBe(55);
    }
    return;
  }

  if (atkScale === 0.93) {
    // 両 spend 全 seed 勝利・単一正解化候補空。強度合格とは書かない。
    for (const seed of BATTLE_RNG_SEEDS) {
      const known = requireRow(byKey, 'known-attack-24', seed);
      expect(known.outcome).toBe('victory');
      expect(known.appliedEnemySorcererAtk).toBe(39);
      const pf = requirePostFrontline(known);
      expect(pf.postBasicActionCount).toBe(2);
      expect(pf.firstRearHit).toBe(true);
      expect(pf.checkpointHp).toBe(55);
      if (seed === 'r12n-1c-a-02') {
        expect(pf.allySorcererDamageAmounts).toEqual([20]);
        expect(pf.chainHitCount).toBe(1);
        expect(pf.chainLethal).toBe(false);
      } else {
        expect(pf.allySorcererDamageAmounts).toEqual([]);
        expect(pf.chainHitCount).toBe(0);
      }

      const alt = requireRow(byKey, 'alternate-core-24', seed);
      expect(alt.outcome).toBe('victory');
      expect(alt.appliedEnemySorcererAtk).toBe(39);
      const altPf = requirePostFrontline(alt);
      expect(altPf.checkpointHp).toBe(39);
      expect(altPf.allySorcererDamageAmounts).toEqual([20]);
      expect(altPf.chainHitCount).toBe(1);
      expect(altPf.chainLethal).toBe(false);
      expect(altPf.postBasicActionCount).toBe(2);
      expect(altPf.firstRearHit).toBe(true);
      expect(altPf.stopReason).toBe('first_rear_hit');
      expect(alt.survivingEnemies).toBe(0);
      expect(alt.totalRemainingEnemyHp).toBe(0);
      expect(alt.survivorClassIds).toEqual([]);
    }
    return;
  }

  // atkScale 0.90: 0.93 より ATK が低いのに alternate 全 seed と known a-02 が悪化（非単調）。原因は断定しない。
  expect(atkScale).toBe(0.9);
  for (const seed of ['r12n-1c-a-01', 'r12n-1c-a-03'] as const) {
    const known = requireRow(byKey, 'known-attack-24', seed);
    expect(known.outcome).toBe('victory');
    expect(known.appliedEnemySorcererAtk).toBe(38);
    const pf = requirePostFrontline(known);
    expect(pf.checkpointHp).toBe(35);
    expect(pf.allySorcererDamageAmounts).toEqual([20]);
    expect(pf.chainHitCount).toBe(1);
    expect(pf.chainLethal).toBe(false);
    expect(pf.postBasicActionCount).toBe(2);
    expect(pf.firstRearHit).toBe(true);
  }

  const known02 = requireRow(byKey, 'known-attack-24', 'r12n-1c-a-02');
  expect(known02.outcome).toBe('defeat');
  expect(known02.appliedEnemySorcererAtk).toBe(38);
  const known02Pf = requirePostFrontline(known02);
  expect(known02Pf.checkpointHp).toBe(22);
  expect(known02Pf.allySorcererDamageAmounts).toEqual([]);
  expect(known02Pf.chainHitCount).toBe(0);
  expect(known02Pf.postBasicActionCount).toBe(2);
  expect(known02Pf.firstRearHit).toBe(true);
  expect(known02Pf.stopReason).toBe('first_rear_hit');
  assertRearOnlySurvivors(known02);

  for (const seed of BATTLE_RNG_SEEDS) {
    const alt = requireRow(byKey, 'alternate-core-24', seed);
    expect(alt.appliedEnemySorcererAtk).toBe(38);
    assertUnprocessedFrontlineDefeat(alt);
  }
}

async function runSensitivityForAtkScale(
  atkScale: AtkScale,
  baseline: SeriesABaselineFile,
  guardianOnlyWaves: readonly ProblemSeriesBattleWave[],
  guardianOnlyByKey: ReadonlyMap<string, DiagnosticBundle>,
  noSpendReferenceSlices: readonly NoSpendInvariantSlice[],
): Promise<{
  readonly rows: SensitivityCaseRow[];
  readonly report: ProblemSeriesBalanceSignalReport;
}> {
  const expectedAtk = EXPECTED_APPLIED_ATK_BY_SCALE[atkScale];
  expect(expectedAtk).toBeDefined();

  const composed = composeSeriesAGuardianThenSorcererAtkTransform(
    GUARDIAN_HP_SCALE,
    atkScale,
  );
  const transformedPreview = composed(loadProductionBattleWaves(), transformContext());
  assertTransformTouchesOnlyWave3SorcererAtkScale(
    guardianOnlyWaves,
    transformedPreview,
    atkScale,
  );

  // 入力不変: guardian-only 入力オブジェクトを mutate していない
  const guardianOnlyAgain = createSeriesAWave2GuardianHpScaleTransform(
    GUARDIAN_HP_SCALE,
  )(loadProductionBattleWaves(), transformContext());
  expect(guardianOnlyAgain).toEqual(guardianOnlyWaves);

  const signalCases: ProblemSeriesBalanceSignalCase[] = [];
  const pairKeys = new Set<string>();
  const rows: SensitivityCaseRow[] = [];
  const noSpendSlices: NoSpendInvariantSlice[] = [];
  const observedWave3Atks: number[] = [];

  for (const baselineCase of baseline.cases) {
    await new Promise<void>((resolveTick) => {
      setImmediate(resolveTick);
    });

    const buildId = baselineCase.buildId as BuildId;
    const battleRngSeed = baselineCase.battleRngSeed as BattleRngSeed;
    const key = `${buildId}::${battleRngSeed}`;
    expect(pairKeys.has(key)).toBe(false);
    pairKeys.add(key);

    const bundle = runInstrumentedCase(baselineCase, composed);
    const { result } = bundle;
    assertCaseMetricsPresent(result);
    expect(result.battleRngSeed).toBe(battleRngSeed);

    assertTransformTouchesOnlyWave3SorcererAtkScale(
      guardianOnlyWaves,
      result.enemyWaveInputs,
      atkScale,
    );

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
        expect(acquired.includes(passiveId)).toBe(true);
      }
    } else {
      for (const passiveId of wave3Planned) {
        expect(acquired.includes(passiveId)).toBe(false);
      }
    }

    if (buildId === 'no-spend-control') {
      expect(result.outcome).toBe('defeat');
      expect(result.finalWaveIndex).toBe(1);
      expect(reachedWave3).toBe(false);
      noSpendSlices.push(noSpendInvariantSlice(result));
    }

    const appliedAtk = captureWave3EnemySorcererAtk(bundle.tickStates);
    if (reachedWave3) {
      expect(appliedAtk).not.toBeNull();
      expect(appliedAtk).toBe(expectedAtk);
      observedWave3Atks.push(appliedAtk!);
    } else {
      expect(appliedAtk).toBeNull();
    }

    if (atkScale === 1.0) {
      const guardianOnly = guardianOnlyByKey.get(key);
      expect(guardianOnly).toBeDefined();
      expect(normalizeProblemSeriesSimResultForCompare(result)).toBe(
        normalizeProblemSeriesSimResultForCompare(guardianOnly!.result),
      );
      expect(bundle.observationCompareKey).toBe(guardianOnly!.observationCompareKey);
    }

    const allyMetrics = sorcererAllyDamageMetrics(
      bundle.damageEvents,
      result.finalWaveIndex,
    );
    const postFrontline = diagnosePostFrontline(bundle);
    const survivors: ProblemSeriesSimSurvivingEnemyDiagnostic[] =
      bundle.finalEnemy?.survivingEnemies ?? [];

    signalCases.push({
      buildId,
      battleRngSeed,
      input: {
        ...baselineCase.input,
        transformResolvedBattleWaves: composed,
      },
      result,
    });

    rows.push({
      atkScale,
      appliedEnemySorcererAtk: appliedAtk,
      buildId,
      battleRngSeed,
      outcome: result.outcome,
      finalWaveIndex: result.finalWaveIndex,
      waveResults: result.waves.map((w) => `${w.waveIndex}:${w.result}`),
      tickCount: result.tickCount,
      survivingAllies: result.survivingAllies,
      survivingEnemies: result.survivingEnemies,
      totalRemainingAllyHp: result.totalRemainingAllyHp,
      totalRemainingEnemyHp: result.totalRemainingEnemyHp,
      slotStats: result.slotStats,
      resourceLedger: result.resourceLedger,
      appliedCombatModuleIdBySlot: result.appliedCombatModuleIdBySlot,
      acquiredPassivesBySlot: result.acquiredPassivesBySlot,
      reachedWave3,
      wave3PlannedApplied:
        wave3Planned.length > 0 &&
        reachedWave3 &&
        wave3Planned.every((id) => acquired.includes(id)),
      sorcererDamageToAllies: allyMetrics.damage,
      sorcererLethalToAllies: allyMetrics.lethals,
      postFrontline,
      finalRearHpByClass: finalRearHpByClass(bundle.finalEnemy),
      survivorClassIds: survivors.map((s) => s.classId).sort(),
    });
  }

  expect(pairKeys.size).toBe(9);
  expect(signalCases).toHaveLength(9);
  expect(rows).toHaveLength(9);
  expect(noSpendSlices).toHaveLength(3);
  expect(noSpendSlices).toEqual(noSpendReferenceSlices);
  expect(observedWave3Atks.length).toBeGreaterThan(0);
  for (const atk of observedWave3Atks) {
    expect(atk).toBe(expectedAtk);
  }

  const report = detectProblemSeriesBalanceSignals(signalCases);
  expect(report.evaluatedCaseCount).toBe(9);
  expect(report.evaluatedBuildCount).toBe(3);
  expect(report.evaluatedSeedCount).toBe(3);
  expect(report.seriesId).toBe(SERIES_ID);
  return { rows, report };
}

describe('R12n 1J series A Wave3 sorcerer atkScale sensitivity (test-only)', () => {
  const guardianOnlyByKey = new Map<string, DiagnosticBundle>();
  let guardianOnlyWaves: ProblemSeriesBattleWave[] = [];
  let noSpendReferenceSlices: NoSpendInvariantSlice[] = [];
  let baselineCache: SeriesABaselineFile | null = null;

  it('loads guardian-only reference path once (hpScale=0.75)', async () => {
    assertBaselineShaUnchanged();
    baselineCache = loadBaselineA();
    assertBaselineCoverage(baselineCache);
    guardianOnlyWaves = createSeriesAWave2GuardianHpScaleTransform(
      GUARDIAN_HP_SCALE,
    )(loadProductionBattleWaves(), transformContext());
    expect(guardianOnlyWaves).toHaveLength(3);

    const guardianOnlyTransform =
      createSeriesAWave2GuardianHpScaleTransform(GUARDIAN_HP_SCALE);
    const noSpendSlices: NoSpendInvariantSlice[] = [];
    for (const baselineCase of baselineCache.cases) {
      await new Promise<void>((resolveTick) => {
        setImmediate(resolveTick);
      });
      const key = `${baselineCase.buildId}::${baselineCase.battleRngSeed}`;
      const bundle = runInstrumentedCase(baselineCase, guardianOnlyTransform);
      guardianOnlyByKey.set(key, bundle);
      if (baselineCase.buildId === 'no-spend-control') {
        expect(bundle.result.outcome).toBe('defeat');
        expect(bundle.result.finalWaveIndex).toBe(1);
        noSpendSlices.push(noSpendInvariantSlice(bundle.result));
      }
    }
    expect(guardianOnlyByKey.size).toBe(9);
    expect(noSpendSlices).toHaveLength(3);
    noSpendReferenceSlices = noSpendSlices;
    assertBaselineShaUnchanged();
  }, 300_000);

  it('transform scope: touches only Wave3 at_sorcerer atkScale', () => {
    assertBaselineShaUnchanged();
    expect(guardianOnlyWaves).toHaveLength(3);
    const inputSnapshot = structuredClone(guardianOnlyWaves);

    for (const atkScale of ATK_SCALE_POINTS) {
      const transform = createSeriesAWave3SorcererAtkScaleTransform(atkScale);
      const out = transform(guardianOnlyWaves, transformContext());
      assertTransformTouchesOnlyWave3SorcererAtkScale(
        guardianOnlyWaves,
        out,
        atkScale,
      );
      expect(guardianOnlyWaves).toEqual(inputSnapshot);
    }

    const omit = createSeriesAWave3SorcererAtkScaleTransform(1)(
      guardianOnlyWaves,
      transformContext(),
    );
    const w3 = omit[2]!;
    const sorcerer = w3.enemyGroups.find((g) => g.classId === 'at_sorcerer');
    expect(sorcerer).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(sorcerer, 'atkScale')).toBe(false);

    expect(() => createSeriesAWave3SorcererAtkScaleTransform(0)).toThrow(
      /finite number > 0/,
    );
    expect(() => createSeriesAWave3SorcererAtkScaleTransform(-1)).toThrow(
      /finite number > 0/,
    );
    expect(() => createSeriesAWave3SorcererAtkScaleTransform(Number.NaN)).toThrow(
      /finite number > 0/,
    );
    expect(() =>
      createSeriesAWave3SorcererAtkScaleTransform(0.95)(guardianOnlyWaves, {
        ...transformContext(),
        seriesId: 'r12m_series_b',
      }),
    ).toThrow(/refuses seriesId/);

    const missing = structuredClone(guardianOnlyWaves);
    missing[2] = {
      ...missing[2]!,
      enemyGroups: missing[2]!.enemyGroups.filter((g) => g.classId !== 'at_sorcerer'),
    };
    expect(() =>
      createSeriesAWave3SorcererAtkScaleTransform(0.95)(missing, transformContext()),
    ).toThrow(/at_sorcerer groups/);

    const duplicated = structuredClone(guardianOnlyWaves);
    const sorcererGroup = duplicated[2]!.enemyGroups.find(
      (g) => g.classId === 'at_sorcerer',
    )!;
    duplicated[2] = {
      ...duplicated[2]!,
      enemyGroups: [...duplicated[2]!.enemyGroups, { ...sorcererGroup }],
    };
    expect(() =>
      createSeriesAWave3SorcererAtkScaleTransform(0.95)(
        duplicated,
        transformContext(),
      ),
    ).toThrow(/at_sorcerer groups/);

    const wrongCount = structuredClone(guardianOnlyWaves);
    wrongCount[2] = {
      ...wrongCount[2]!,
      enemyGroups: wrongCount[2]!.enemyGroups.map((g) =>
        g.classId === 'at_sorcerer' ? { ...g, count: 2 } : g,
      ),
    };
    expect(() =>
      createSeriesAWave3SorcererAtkScaleTransform(0.95)(
        wrongCount,
        transformContext(),
      ),
    ).toThrow(/at_sorcerer count/);

    assertBaselineShaUnchanged();
  });

  for (const atkScale of ATK_SCALE_POINTS) {
    it(
      `atkScale=${atkScale}: 9 cases, applied ATK, signals (not a pass/fail threshold)`,
      async () => {
        assertBaselineShaUnchanged();
        expect(baselineCache).not.toBeNull();
        expect(guardianOnlyByKey.size).toBe(9);
        expect(guardianOnlyWaves).toHaveLength(3);
        expect(noSpendReferenceSlices).toHaveLength(3);

        const { rows, report } = await runSensitivityForAtkScale(
          atkScale,
          baselineCache!,
          guardianOnlyWaves,
          guardianOnlyByKey,
          noSpendReferenceSlices,
        );
        expect(rows).toHaveLength(9);
        assertObservedAtkScaleTransition(atkScale, rows, report);

        // eslint-disable-next-line no-console
        console.log(
          `1J atkScale=${atkScale} expectedAtk=${EXPECTED_APPLIED_ATK_BY_SCALE[atkScale]} signals: 即全滅=${formatSignalRefs(report.immediatePartyWipeCandidates)}; 無限膠着=${formatSignalRefs(report.stalemateCandidates)}; 選択無効=${formatIneffectivePairs(report.ineffectiveChoiceCandidatePairs)}; 単一正解化=${report.singleSolutionCandidateBuildIds.length === 0 ? '(empty)' : report.singleSolutionCandidateBuildIds.join(',')}`,
        );
        for (const row of rows) {
          const pf = row.postFrontline;
          // eslint-disable-next-line no-console
          console.log(
            [
              row.atkScale,
              row.appliedEnemySorcererAtk ?? 'n/a',
              row.buildId,
              row.battleRngSeed,
              row.outcome,
              row.finalWaveIndex,
              row.waveResults.join('/'),
              row.tickCount,
              `A${row.survivingAllies}/E${row.survivingEnemies}`,
              row.totalRemainingAllyHp,
              row.totalRemainingEnemyHp,
              row.reachedWave3 ? 'W3Y' : 'W3N',
              row.wave3PlannedApplied ? 'P3Y' : 'P3N',
              `sorcDmg=${row.sorcererDamageToAllies}`,
              `sorcLeth=${row.sorcererLethalToAllies}`,
              pf
                ? `pfHp=${pf.checkpointHp};chain=${pf.allySorcererDamageAmounts.join('+')};hits=${pf.chainHitCount};lethal=${pf.chainLethal};basic=${pf.postBasicActionCount};rearHit=${pf.firstRearHit};stop=${pf.stopReason}`
                : 'pf=n/a',
              `rearHp=${JSON.stringify(row.finalRearHpByClass)}`,
              `surv=${row.survivorClassIds.join(',')}`,
            ].join(' | '),
          );
        }
        assertBaselineShaUnchanged();
      },
      300_000,
    );
  }

  it('observes exactly 5 scale points × 9 cases without declaring production-ready', () => {
    expect(ATK_SCALE_POINTS).toEqual([1.0, 0.98, 0.95, 0.93, 0.9]);
    expect(ATK_SCALE_POINTS).toHaveLength(5);
    expect(BUILD_IDS).toHaveLength(3);
    expect(BATTLE_RNG_SEEDS).toHaveLength(3);
    expect(5 * 3 * 3).toBe(45);
    const appliedAtks = ATK_SCALE_POINTS.map(
      (scale) => EXPECTED_APPLIED_ATK_BY_SCALE[scale],
    );
    expect(appliedAtks).toEqual([42, 41, 40, 39, 38]);
    expect(new Set(appliedAtks).size).toBe(5);
  });
});
