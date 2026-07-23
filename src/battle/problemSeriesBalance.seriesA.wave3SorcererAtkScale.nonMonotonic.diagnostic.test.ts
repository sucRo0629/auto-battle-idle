/**
 * R12n 1K / 1K-R1 — atkScale 0.93 / 0.90 非単調挙動の paired trace 診断（test-only）。
 *
 * 同一 build/seed で Wave2 guardian hpScale=0.75 + Wave3 sorcerer atkScale を
 * 0.93 と 0.90 に分けて実行し、Wave 3 構造 signature の最初の分岐を固定する。
 * 1K-R1 で核心観測を assertObservedNonMonotonicPairCore により直接固定。
 * 数値変更・production 採用・RNG 断定・所有者選定はしない。
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
  createSeriesAWave2GuardianHpScaleTransform,
  createSeriesAWave3SorcererAtkScaleTransform,
  runProblemSeriesSim,
  SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET,
  type ProblemSeriesSimCombatActionDiagnostic,
  type ProblemSeriesSimCombatFlowDamageEvent,
  type ProblemSeriesSimCombatFlowHealEvent,
  type ProblemSeriesSimFinalEnemyDiagnostic,
  type ProblemSeriesSimInput,
  type ProblemSeriesSimResolvedWaveTransform,
  type ProblemSeriesSimResult,
  type ProblemSeriesSimTickAliveUnitDiagnostic,
  type ProblemSeriesSimTickStateDiagnostic,
  type ProblemSeriesSimWaveTimeline,
} from './test/problemSeriesSim.harness.ts';

const EXPECTED_BASELINE_A_SHA256 =
  '2c6e6ad212bfaffb3259613d2d15a39a7910f7b7ba0474240f72cedd5c49062c';
const EXPECTED_BASELINE_B_SHA256 =
  'b575d9830b57bce29c3fc2d13ebb8db7044ee592d3363aae1bf457b0d7e1d47c';

const PROBLEM_SERIES_SEED = 'fixture-a';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_ID = 'r12m_series_a';
const GUARDIAN_HP_SCALE = 0.75;
const WAVE3_INDEX = SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.waveIndex;

const ATK_SCALE_HIGH = 0.93;
const ATK_SCALE_LOW = 0.9;
const EXPECTED_ATK_BY_SCALE: Readonly<Record<number, number>> = {
  [ATK_SCALE_HIGH]: 39,
  [ATK_SCALE_LOW]: 38,
};

const PAIR_IDENTITIES = [
  { buildId: 'alternate-core-24', battleRngSeed: 'r12n-1c-a-01' },
  { buildId: 'alternate-core-24', battleRngSeed: 'r12n-1c-a-02' },
  { buildId: 'alternate-core-24', battleRngSeed: 'r12n-1c-a-03' },
  { buildId: 'known-attack-24', battleRngSeed: 'r12n-1c-a-02' },
] as const;

/** 1K-R1: identity 別の最初の構造分岐 index（観測固定。原因断定ではない）。 */
const EXPECTED_DIVERGENCE_INDEX_BY_PAIR: Readonly<Record<string, number>> = {
  'alternate-core-24::r12n-1c-a-01': 116,
  'alternate-core-24::r12n-1c-a-02': 116,
  'alternate-core-24::r12n-1c-a-03': 116,
  'known-attack-24::r12n-1c-a-02': 115,
};

const EXPECTED_ALLY_HP_DIFF_AT_BRANCH: Readonly<Record<string, number>> = {
  df_guardian: -8,
  at_swordsman: -7,
};

type PairBuildId = (typeof PAIR_IDENTITIES)[number]['buildId'];
type PairSeed = (typeof PAIR_IDENTITIES)[number]['battleRngSeed'];
type AtkScale = typeof ATK_SCALE_HIGH | typeof ATK_SCALE_LOW;

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

interface AliveCheckpointUnit {
  readonly classId: string;
  readonly hp: number;
  readonly battleX: number;
}

interface EventCheckpoint {
  readonly allies: readonly AliveCheckpointUnit[];
  readonly enemies: readonly AliveCheckpointUnit[];
}

interface TraceActionEntry {
  readonly seq: number;
  readonly kind: 'action';
  readonly battleTimeSec: number;
  readonly actorId: string;
  readonly actorClassId: string;
  readonly actorSide: 'ally' | 'enemy';
  readonly slotKind: string;
  readonly skillId: string;
  readonly actorHp: number;
  readonly actorBattleX: number;
  readonly checkpoint: EventCheckpoint;
}

interface TraceDamageEntry {
  readonly seq: number;
  readonly kind: 'damage';
  readonly battleTimeSec: number;
  readonly actorId: string;
  readonly actorClassId: string;
  readonly actorSide: 'ally' | 'enemy';
  readonly targetId: string;
  readonly targetClassId: string;
  readonly targetSide: 'ally' | 'enemy';
  readonly skillId: string;
  readonly sourceKind: string;
  readonly slotKind: string;
  readonly amount: number;
  readonly hpDamage: number;
  readonly barrierDamage: number;
  readonly lethal: boolean;
  readonly checkpoint: EventCheckpoint;
}

interface TraceHealEntry {
  readonly seq: number;
  readonly kind: 'heal';
  readonly battleTimeSec: number;
  readonly actorId: string;
  readonly actorClassId: string;
  readonly actorSide: 'ally' | 'enemy';
  readonly targetId: string;
  readonly targetClassId: string;
  readonly targetSide: 'ally' | 'enemy';
  readonly amount: number;
  readonly checkpoint: EventCheckpoint;
}

type TraceEntry = TraceActionEntry | TraceDamageEntry | TraceHealEntry;

interface Wave3StartUnitSlice {
  readonly id: string;
  readonly classId: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly barrierHp: number;
  readonly battleX: number;
  readonly effectiveRangePx: number;
  readonly atk: number;
  readonly basicSkillId: string;
}

interface Wave3StartSnapshot {
  readonly battleTimeSec: number;
  readonly phase: string;
  readonly runtimePhase: string;
  readonly engaged: boolean;
  readonly allies: readonly Wave3StartUnitSlice[];
  readonly enemies: readonly Wave3StartUnitSlice[];
}

interface CapturedRun {
  readonly buildId: PairBuildId;
  readonly battleRngSeed: PairSeed;
  readonly atkScale: AtkScale;
  readonly result: ProblemSeriesSimResult;
  readonly wave3Start: Wave3StartSnapshot;
  readonly trace: readonly TraceEntry[];
  readonly finalEnemy: ProblemSeriesSimFinalEnemyDiagnostic;
}

interface StructuralDivergence {
  readonly index: number;
  readonly kind: 'event' | 'length' | 'identical';
  readonly highEvent: TraceEntry | null;
  readonly lowEvent: TraceEntry | null;
  readonly matchedPrefix: readonly TraceEntry[];
}

interface PairReport {
  readonly buildId: PairBuildId;
  readonly battleRngSeed: PairSeed;
  readonly divergenceIndex: number;
  readonly divergenceKind: 'event' | 'length' | 'identical';
  readonly matchedBefore: readonly TraceEntry[];
  readonly highBranchEvent: TraceEntry | null;
  readonly lowBranchEvent: TraceEntry | null;
  readonly highCheckpoint: EventCheckpoint | null;
  readonly lowCheckpoint: EventCheckpoint | null;
  readonly sorcererDamageDiffBeforeBranch: number;
  readonly allyHpDiffAtBranch: Readonly<Record<string, number>>;
  readonly clericHealDiff: {
    readonly high: readonly { targetId: string; targetClassId: string; amount: number }[];
    readonly low: readonly { targetId: string; targetClassId: string; amount: number }[];
    readonly highCount: number;
    readonly lowCount: number;
    readonly highTotalAmount: number;
    readonly lowTotalAmount: number;
  };
  readonly firstTargetSelectChangeIndex: number | null;
  readonly firstLethalChangeIndex: number | null;
  readonly firstActionOrderChangeIndex: number | null;
  readonly highSwordsmanDeathSec: number | null;
  readonly lowSwordsmanDeathSec: number | null;
  readonly highSwordsmanFinalAlive: boolean;
  readonly lowSwordsmanFinalAlive: boolean;
  readonly highOutcome: ProblemSeriesSimResult['outcome'];
  readonly lowOutcome: ProblemSeriesSimResult['outcome'];
  readonly highSurvivorClassIds: readonly string[];
  readonly lowSurvivorClassIds: readonly string[];
  readonly highRemainingEnemyHp: number;
  readonly lowRemainingEnemyHp: number;
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

    if (waveIndex !== WAVE3_INDEX) {
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
        expect(afterGroup.atkScale).toBe(atkScale);
      } else {
        expect(afterGroup).toEqual(beforeGroup);
      }
    }
    expect(sorcererCount).toBe(
      SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.expectedSorcererGroupCount,
    );
  }
}

function pairKey(buildId: string, battleRngSeed: string): string {
  return `${buildId}::${battleRngSeed}`;
}

function runKey(buildId: string, battleRngSeed: string, atkScale: number): string {
  return `${pairKey(buildId, battleRngSeed)}::${atkScale}`;
}

function sideOf(isEnemy: boolean): 'ally' | 'enemy' {
  return isEnemy ? 'enemy' : 'ally';
}

function cloneAliveCheckpoint(
  state: ProblemSeriesSimTickStateDiagnostic | null,
): EventCheckpoint {
  expect(state).not.toBeNull();
  return {
    allies: state!.allies.map((unit) => ({
      classId: unit.classId,
      hp: unit.hp,
      battleX: unit.battleX,
    })),
    enemies: state!.enemies.map((unit) => ({
      classId: unit.classId,
      hp: unit.hp,
      battleX: unit.battleX,
    })),
  };
}

function toWave3StartUnitSlice(
  unit: ProblemSeriesSimTickAliveUnitDiagnostic,
): Wave3StartUnitSlice {
  expect(unit.id.length).toBeGreaterThan(0);
  expect(unit.classId.length).toBeGreaterThan(0);
  expect(Number.isFinite(unit.hp)).toBe(true);
  expect(Number.isFinite(unit.maxHp)).toBe(true);
  expect(Number.isFinite(unit.barrierHp)).toBe(true);
  expect(Number.isFinite(unit.battleX)).toBe(true);
  expect(Number.isFinite(unit.effectiveRangePx)).toBe(true);
  expect(Number.isFinite(unit.atk)).toBe(true);
  expect(unit.basicSkillId.length).toBeGreaterThan(0);
  return {
    id: unit.id,
    classId: unit.classId,
    hp: unit.hp,
    maxHp: unit.maxHp,
    barrierHp: unit.barrierHp,
    battleX: unit.battleX,
    effectiveRangePx: unit.effectiveRangePx,
    atk: unit.atk,
    basicSkillId: unit.basicSkillId,
  };
}

function toWave3StartSnapshot(
  state: ProblemSeriesSimTickStateDiagnostic,
): Wave3StartSnapshot {
  return {
    battleTimeSec: state.battleTimeSec,
    phase: state.phase,
    runtimePhase: state.runtimePhase,
    engaged: state.engaged,
    allies: state.allies.map(toWave3StartUnitSlice),
    enemies: state.enemies.map(toWave3StartUnitSlice),
  };
}

/**
 * tick 診断口は def/res を供給しない。
 * Wave3 開始時点の def/res 同一性は、入力 group の defScale/resScale 他（atkScale 以外）
 * が一致することと、tick 上の他ステータス一致で固定する。
 */
function wave3StartComparableWithoutSorcererAtk(
  snapshot: Wave3StartSnapshot,
): unknown {
  return {
    phase: snapshot.phase,
    runtimePhase: snapshot.runtimePhase,
    engaged: snapshot.engaged,
    allies: snapshot.allies.map((unit) => ({
      id: unit.id,
      classId: unit.classId,
      hp: unit.hp,
      maxHp: unit.maxHp,
      barrierHp: unit.barrierHp,
      battleX: unit.battleX,
      effectiveRangePx: unit.effectiveRangePx,
      atk: unit.atk,
      basicSkillId: unit.basicSkillId,
    })),
    enemies: snapshot.enemies.map((unit) => ({
      id: unit.id,
      classId: unit.classId,
      hp: unit.hp,
      maxHp: unit.maxHp,
      barrierHp: unit.barrierHp,
      battleX: unit.battleX,
      effectiveRangePx: unit.effectiveRangePx,
      atk:
        unit.classId === SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.classId
          ? null
          : unit.atk,
      basicSkillId: unit.basicSkillId,
    })),
  };
}

function findUniqueEnemySorcererAtk(snapshot: Wave3StartSnapshot): number {
  const matches = snapshot.enemies.filter(
    (enemy) =>
      enemy.classId === SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.classId,
  );
  expect(matches).toHaveLength(1);
  return matches[0]!.atk;
}

function timelineBeforeWave3(
  waves: readonly ProblemSeriesSimWaveTimeline[],
): unknown {
  return waves
    .filter((wave) => wave.waveIndex < WAVE3_INDEX)
    .map((wave) => ({
      waveIndex: wave.waveIndex,
      startTick: wave.startTick,
      endTick: wave.endTick,
      startSec: wave.startSec,
      endSec: wave.endSec,
      result: wave.result,
    }));
}

function assertFiniteNonEmptyId(value: string, label: string): void {
  expect(typeof value).toBe('string');
  expect(value.length, label).toBeGreaterThan(0);
}

function assertTraceEntryFinite(entry: TraceEntry): void {
  expect(Number.isFinite(entry.seq)).toBe(true);
  expect(Number.isFinite(entry.battleTimeSec)).toBe(true);
  assertFiniteNonEmptyId(entry.actorId, 'actorId');
  assertFiniteNonEmptyId(entry.actorClassId, 'actorClassId');
  if (entry.kind === 'action') {
    assertFiniteNonEmptyId(entry.slotKind, 'slotKind');
    assertFiniteNonEmptyId(entry.skillId, 'skillId');
    expect(Number.isFinite(entry.actorHp)).toBe(true);
    expect(Number.isFinite(entry.actorBattleX)).toBe(true);
    return;
  }
  assertFiniteNonEmptyId(entry.targetId, 'targetId');
  assertFiniteNonEmptyId(entry.targetClassId, 'targetClassId');
  expect(Number.isFinite(entry.amount)).toBe(true);
  if (entry.kind === 'damage') {
    assertFiniteNonEmptyId(entry.skillId, 'skillId');
    assertFiniteNonEmptyId(entry.sourceKind, 'sourceKind');
    expect(Number.isFinite(entry.hpDamage)).toBe(true);
    expect(Number.isFinite(entry.barrierDamage)).toBe(true);
    expect(entry.hpDamage + entry.barrierDamage).toBe(entry.amount);
  }
}

function structuralSignature(entry: TraceEntry): string {
  if (entry.kind === 'action') {
    return [
      'action',
      entry.actorId,
      entry.actorClassId,
      entry.actorSide,
      entry.slotKind,
      entry.skillId,
    ].join('|');
  }
  if (entry.kind === 'damage') {
    return [
      'damage',
      entry.actorId,
      entry.actorClassId,
      entry.actorSide,
      entry.targetId,
      entry.targetClassId,
      entry.targetSide,
      entry.slotKind,
      entry.skillId,
      entry.sourceKind,
      entry.lethal ? 'lethal' : 'nonlethal',
    ].join('|');
  }
  return [
    'heal',
    entry.actorId,
    entry.actorClassId,
    entry.actorSide,
    entry.targetId,
    entry.targetClassId,
    entry.targetSide,
  ].join('|');
}

function findStructuralDivergence(
  highTrace: readonly TraceEntry[],
  lowTrace: readonly TraceEntry[],
): StructuralDivergence {
  expect(highTrace.length).toBeGreaterThan(0);
  expect(lowTrace.length).toBeGreaterThan(0);

  const minLen = Math.min(highTrace.length, lowTrace.length);
  for (let index = 0; index < minLen; index++) {
    const highEvent = highTrace[index]!;
    const lowEvent = lowTrace[index]!;
    if (structuralSignature(highEvent) !== structuralSignature(lowEvent)) {
      return {
        index,
        kind: 'event',
        highEvent,
        lowEvent,
        matchedPrefix: highTrace.slice(0, index),
      };
    }
  }

  if (highTrace.length === lowTrace.length) {
    return {
      index: minLen,
      kind: 'identical',
      highEvent: null,
      lowEvent: null,
      matchedPrefix: highTrace.slice(0, minLen),
    };
  }

  return {
    index: minLen,
    kind: 'length',
    highEvent: highTrace[minLen] ?? null,
    lowEvent: lowTrace[minLen] ?? null,
    matchedPrefix: highTrace.slice(0, minLen),
  };
}

function captureRun(
  baselineCase: SeriesABaselineCase,
  atkScale: AtkScale,
): CapturedRun {
  const buildId = baselineCase.buildId as PairBuildId;
  const battleRngSeed = baselineCase.battleRngSeed as PairSeed;
  const transform = composeSeriesAGuardianThenSorcererAtkTransform(
    GUARDIAN_HP_SCALE,
    atkScale,
  );

  let latestTick: ProblemSeriesSimTickStateDiagnostic | null = null;
  let wave3StartState: ProblemSeriesSimTickStateDiagnostic | null = null;
  const trace: TraceEntry[] = [];
  let seq = 0;
  let finalEnemy: ProblemSeriesSimFinalEnemyDiagnostic | undefined;

  const result = runProblemSeriesSim({
    ...baselineCase.input,
    transformResolvedBattleWaves: transform,
    onTickStateDiagnostic: (state) => {
      latestTick = state;
      if (state.waveIndex === WAVE3_INDEX && wave3StartState === null) {
        wave3StartState = {
          waveIndex: state.waveIndex,
          battleTimeSec: state.battleTimeSec,
          phase: state.phase,
          runtimePhase: state.runtimePhase,
          engaged: state.engaged,
          allies: state.allies.map((unit) => ({ ...unit })),
          enemies: state.enemies.map((unit) => ({ ...unit })),
        };
      }
    },
    onCombatActionDiagnostic: (event: ProblemSeriesSimCombatActionDiagnostic) => {
      if (event.waveIndex !== WAVE3_INDEX) return;
      seq += 1;
      trace.push({
        seq,
        kind: 'action',
        battleTimeSec: event.battleTimeSec,
        actorId: event.actor.id,
        actorClassId: event.actor.classId,
        actorSide: sideOf(event.actor.isEnemy),
        slotKind: event.slotKind,
        skillId: event.skillId,
        actorHp: event.actor.hp,
        actorBattleX: event.actor.battleX,
        checkpoint: cloneAliveCheckpoint(latestTick),
      });
    },
    onCombatFlowDamage: (event: ProblemSeriesSimCombatFlowDamageEvent) => {
      if (event.waveIndex !== WAVE3_INDEX) return;
      seq += 1;
      trace.push({
        seq,
        kind: 'damage',
        battleTimeSec: event.battleTimeSec,
        actorId: event.actor.id,
        actorClassId: event.actor.classId,
        actorSide: sideOf(event.actor.isEnemy),
        targetId: event.target.id,
        targetClassId: event.target.classId,
        targetSide: sideOf(event.target.isEnemy),
        skillId: event.skillId,
        sourceKind: event.sourceKind,
        slotKind: event.slotKind,
        amount: event.amount,
        hpDamage: event.hpDamage,
        barrierDamage: event.barrierDamage,
        lethal: event.lethal,
        checkpoint: cloneAliveCheckpoint(latestTick),
      });
    },
    onCombatFlowHeal: (event: ProblemSeriesSimCombatFlowHealEvent) => {
      if (event.waveIndex !== WAVE3_INDEX) return;
      seq += 1;
      trace.push({
        seq,
        kind: 'heal',
        battleTimeSec: event.battleTimeSec,
        actorId: event.actor.id,
        actorClassId: event.actor.classId,
        actorSide: sideOf(event.actor.isEnemy),
        targetId: event.target.id,
        targetClassId: event.target.classId,
        targetSide: sideOf(event.target.isEnemy),
        amount: event.amount,
        checkpoint: cloneAliveCheckpoint(latestTick),
      });
    },
    onFinalEnemyDiagnostic: (diagnostic) => {
      finalEnemy = diagnostic;
    },
  });

  expect(result.finalWaveIndex).toBe(WAVE3_INDEX);
  expect(wave3StartState).not.toBeNull();
  expect(trace.length).toBeGreaterThan(0);
  expect(finalEnemy).toBeDefined();
  for (const entry of trace) {
    assertTraceEntryFinite(entry);
  }

  const wave3Start = toWave3StartSnapshot(wave3StartState!);
  expect(findUniqueEnemySorcererAtk(wave3Start)).toBe(
    EXPECTED_ATK_BY_SCALE[atkScale],
  );

  return {
    buildId,
    battleRngSeed,
    atkScale,
    result,
    wave3Start,
    trace,
    finalEnemy: finalEnemy!,
  };
}

function assertPairedWave3StartEqualExceptSorcererAtk(
  high: CapturedRun,
  low: CapturedRun,
): void {
  expect(timelineBeforeWave3(high.result.waves)).toEqual(
    timelineBeforeWave3(low.result.waves),
  );
  expect(high.result.resourceLedger).toEqual(low.result.resourceLedger);
  expect(high.result.appliedCombatModuleIdBySlot).toEqual(
    low.result.appliedCombatModuleIdBySlot,
  );
  expect(high.result.acquiredPassivesBySlot).toEqual(
    low.result.acquiredPassivesBySlot,
  );

  expect(wave3StartComparableWithoutSorcererAtk(high.wave3Start)).toEqual(
    wave3StartComparableWithoutSorcererAtk(low.wave3Start),
  );
  expect(findUniqueEnemySorcererAtk(high.wave3Start)).toBe(39);
  expect(findUniqueEnemySorcererAtk(low.wave3Start)).toBe(38);

  const highWave3 = high.result.enemyWaveInputs[WAVE3_INDEX];
  const lowWave3 = low.result.enemyWaveInputs[WAVE3_INDEX];
  expect(highWave3).toBeDefined();
  expect(lowWave3).toBeDefined();
  expect(highWave3!.prepResourceGrant).toBe(lowWave3!.prepResourceGrant);
  expect(highWave3!.enemyGroups).toHaveLength(lowWave3!.enemyGroups.length);
  for (let i = 0; i < highWave3!.enemyGroups.length; i++) {
    const highGroup = highWave3!.enemyGroups[i]!;
    const lowGroup = lowWave3!.enemyGroups[i]!;
    expect(groupIdentityWithoutAtkScale(highGroup)).toEqual(
      groupIdentityWithoutAtkScale(lowGroup),
    );
    if (highGroup.classId === SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.classId) {
      expect(highGroup.atkScale).toBe(ATK_SCALE_HIGH);
      expect(lowGroup.atkScale).toBe(ATK_SCALE_LOW);
    } else {
      expect(highGroup).toEqual(lowGroup);
    }
  }
}

function sorcererDamageSum(trace: readonly TraceEntry[], endExclusive: number): number {
  let sum = 0;
  for (let i = 0; i < endExclusive && i < trace.length; i++) {
    const entry = trace[i]!;
    if (
      entry.kind === 'damage' &&
      entry.actorSide === 'enemy' &&
      entry.actorClassId === 'at_sorcerer'
    ) {
      sum += entry.amount;
    }
  }
  return sum;
}

function allyHpByClass(checkpoint: EventCheckpoint | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!checkpoint) return out;
  for (const ally of checkpoint.allies) {
    out[ally.classId] = ally.hp;
  }
  return out;
}

function allyHpDiff(
  high: EventCheckpoint | null,
  low: EventCheckpoint | null,
): Record<string, number> {
  const highMap = allyHpByClass(high);
  const lowMap = allyHpByClass(low);
  const classes = new Set([...Object.keys(highMap), ...Object.keys(lowMap)]);
  const diff: Record<string, number> = {};
  for (const classId of classes) {
    diff[classId] = (highMap[classId] ?? 0) - (lowMap[classId] ?? 0);
  }
  return diff;
}

function enemyClericHeals(
  trace: readonly TraceEntry[],
  endExclusive: number,
): { targetId: string; targetClassId: string; amount: number }[] {
  const out: { targetId: string; targetClassId: string; amount: number }[] = [];
  for (let i = 0; i < endExclusive && i < trace.length; i++) {
    const entry = trace[i]!;
    if (
      entry.kind === 'heal' &&
      entry.actorSide === 'enemy' &&
      entry.actorClassId === 'sp_cleric'
    ) {
      out.push({
        targetId: entry.targetId,
        targetClassId: entry.targetClassId,
        amount: entry.amount,
      });
    }
  }
  return out;
}

function firstTargetSelectChangeIndex(
  highTrace: readonly TraceEntry[],
  lowTrace: readonly TraceEntry[],
): number | null {
  const minLen = Math.min(highTrace.length, lowTrace.length);
  for (let i = 0; i < minLen; i++) {
    const high = highTrace[i]!;
    const low = lowTrace[i]!;
    if (high.kind === 'action' || low.kind === 'action') continue;
    if (high.kind !== low.kind) continue;
    if (high.targetId !== low.targetId || high.targetClassId !== low.targetClassId) {
      return i;
    }
  }
  return null;
}

function firstLethalChangeIndex(
  highTrace: readonly TraceEntry[],
  lowTrace: readonly TraceEntry[],
): number | null {
  const minLen = Math.min(highTrace.length, lowTrace.length);
  for (let i = 0; i < minLen; i++) {
    const high = highTrace[i]!;
    const low = lowTrace[i]!;
    if (high.kind !== 'damage' || low.kind !== 'damage') continue;
    if (high.lethal !== low.lethal) return i;
  }
  return null;
}

function firstActionOrderChangeIndex(
  highTrace: readonly TraceEntry[],
  lowTrace: readonly TraceEntry[],
): number | null {
  const highActions = highTrace.filter((e) => e.kind === 'action');
  const lowActions = lowTrace.filter((e) => e.kind === 'action');
  const minLen = Math.min(highActions.length, lowActions.length);
  for (let i = 0; i < minLen; i++) {
    if (structuralSignature(highActions[i]!) !== structuralSignature(lowActions[i]!)) {
      const highSeq = highActions[i]!.seq;
      const lowSeq = lowActions[i]!.seq;
      const highIndex = highTrace.findIndex((e) => e.seq === highSeq);
      const lowIndex = lowTrace.findIndex((e) => e.seq === lowSeq);
      expect(highIndex).toBeGreaterThanOrEqual(0);
      expect(lowIndex).toBeGreaterThanOrEqual(0);
      return Math.min(highIndex, lowIndex);
    }
  }
  if (highActions.length !== lowActions.length) {
    const shared = minLen;
    if (shared < highActions.length) {
      return highTrace.findIndex((e) => e.seq === highActions[shared]!.seq);
    }
    if (shared < lowActions.length) {
      return lowTrace.findIndex((e) => e.seq === lowActions[shared]!.seq);
    }
  }
  return null;
}

function swordsmanLethalSec(trace: readonly TraceEntry[]): number | null {
  for (const entry of trace) {
    if (
      entry.kind === 'damage' &&
      entry.lethal &&
      entry.targetSide === 'enemy' &&
      entry.targetClassId === 'at_swordsman'
    ) {
      return entry.battleTimeSec;
    }
  }
  return null;
}

function swordsmanFinalAlive(
  finalEnemy: ProblemSeriesSimFinalEnemyDiagnostic,
): boolean {
  return finalEnemy.survivingEnemies.some(
    (enemy) => enemy.classId === 'at_swordsman',
  );
}

function survivorClassIds(
  finalEnemy: ProblemSeriesSimFinalEnemyDiagnostic,
): string[] {
  return finalEnemy.survivingEnemies.map((enemy) => enemy.classId).sort();
}

function summarizeEvent(entry: TraceEntry | null): unknown {
  if (!entry) return null;
  if (entry.kind === 'action') {
    return {
      seq: entry.seq,
      kind: entry.kind,
      battleTimeSec: entry.battleTimeSec,
      actorId: entry.actorId,
      actorClassId: entry.actorClassId,
      actorSide: entry.actorSide,
      slotKind: entry.slotKind,
      skillId: entry.skillId,
      actorHp: entry.actorHp,
      actorBattleX: entry.actorBattleX,
      signature: structuralSignature(entry),
    };
  }
  if (entry.kind === 'damage') {
    return {
      seq: entry.seq,
      kind: entry.kind,
      battleTimeSec: entry.battleTimeSec,
      actorId: entry.actorId,
      actorClassId: entry.actorClassId,
      actorSide: entry.actorSide,
      targetId: entry.targetId,
      targetClassId: entry.targetClassId,
      targetSide: entry.targetSide,
      skillId: entry.skillId,
      sourceKind: entry.sourceKind,
      slotKind: entry.slotKind,
      amount: entry.amount,
      lethal: entry.lethal,
      signature: structuralSignature(entry),
    };
  }
  return {
    seq: entry.seq,
    kind: entry.kind,
    battleTimeSec: entry.battleTimeSec,
    actorId: entry.actorId,
    actorClassId: entry.actorClassId,
    actorSide: entry.actorSide,
    targetId: entry.targetId,
    targetClassId: entry.targetClassId,
    targetSide: entry.targetSide,
    amount: entry.amount,
    signature: structuralSignature(entry),
  };
}

function checkpointAt(
  trace: readonly TraceEntry[],
  index: number,
  branchEvent: TraceEntry | null,
): EventCheckpoint | null {
  if (branchEvent) return branchEvent.checkpoint;
  if (index <= 0) return null;
  return trace[index - 1]?.checkpoint ?? null;
}

function buildPairReport(high: CapturedRun, low: CapturedRun): PairReport {
  const divergence = findStructuralDivergence(high.trace, low.trace);
  const matchedBefore = divergence.matchedPrefix.slice(-3);
  const highHeals = enemyClericHeals(high.trace, divergence.index);
  const lowHeals = enemyClericHeals(low.trace, divergence.index);
  const highCheckpoint = checkpointAt(
    high.trace,
    divergence.index,
    divergence.highEvent,
  );
  const lowCheckpoint = checkpointAt(
    low.trace,
    divergence.index,
    divergence.lowEvent,
  );

  return {
    buildId: high.buildId,
    battleRngSeed: high.battleRngSeed,
    divergenceIndex: divergence.index,
    divergenceKind: divergence.kind,
    matchedBefore,
    highBranchEvent: divergence.highEvent,
    lowBranchEvent: divergence.lowEvent,
    highCheckpoint,
    lowCheckpoint,
    sorcererDamageDiffBeforeBranch:
      sorcererDamageSum(high.trace, divergence.index) -
      sorcererDamageSum(low.trace, divergence.index),
    allyHpDiffAtBranch: allyHpDiff(highCheckpoint, lowCheckpoint),
    clericHealDiff: {
      high: highHeals,
      low: lowHeals,
      highCount: highHeals.length,
      lowCount: lowHeals.length,
      highTotalAmount: highHeals.reduce((sum, h) => sum + h.amount, 0),
      lowTotalAmount: lowHeals.reduce((sum, h) => sum + h.amount, 0),
    },
    firstTargetSelectChangeIndex: firstTargetSelectChangeIndex(
      high.trace,
      low.trace,
    ),
    firstLethalChangeIndex: firstLethalChangeIndex(high.trace, low.trace),
    firstActionOrderChangeIndex: firstActionOrderChangeIndex(
      high.trace,
      low.trace,
    ),
    highSwordsmanDeathSec: swordsmanLethalSec(high.trace),
    lowSwordsmanDeathSec: swordsmanLethalSec(low.trace),
    highSwordsmanFinalAlive: swordsmanFinalAlive(high.finalEnemy),
    lowSwordsmanFinalAlive: swordsmanFinalAlive(low.finalEnemy),
    highOutcome: high.result.outcome,
    lowOutcome: low.result.outcome,
    highSurvivorClassIds: survivorClassIds(high.finalEnemy),
    lowSurvivorClassIds: survivorClassIds(low.finalEnemy),
    highRemainingEnemyHp: high.result.totalRemainingEnemyHp,
    lowRemainingEnemyHp: low.result.totalRemainingEnemyHp,
  };
}

function assertMaintained1JR1Outcomes(high: CapturedRun, low: CapturedRun): void {
  if (high.buildId === 'alternate-core-24') {
    expect(high.result.outcome).toBe('victory');
    expect(high.result.survivingEnemies).toBe(0);
    expect(high.result.totalRemainingEnemyHp).toBe(0);
    expect(high.finalEnemy.survivingEnemies).toEqual([]);
    expect(highSwordsmanMustDie(high)).toBe(true);

    expect(low.result.outcome).toBe('defeat');
    expect(survivorClassIds(low.finalEnemy)).toEqual(
      ['at_sorcerer', 'at_swordsman', 'sp_cleric'].sort(),
    );
    expect(low.result.totalRemainingEnemyHp).toBe(238);
    expect(swordsmanFinalAlive(low.finalEnemy)).toBe(true);
    return;
  }

  expect(high.buildId).toBe('known-attack-24');
  expect(high.battleRngSeed).toBe('r12n-1c-a-02');
  expect(high.result.outcome).toBe('victory');
  expect(high.result.survivingEnemies).toBe(0);

  expect(low.result.outcome).toBe('defeat');
  expect(survivorClassIds(low.finalEnemy)).toEqual(
    ['at_sorcerer', 'sp_cleric'].sort(),
  );
  expect(low.result.totalRemainingEnemyHp).toBe(180);
  expect(
    low.trace.some(
      (entry) =>
        entry.kind === 'damage' &&
        entry.actorSide === 'ally' &&
        entry.targetSide === 'enemy' &&
        (entry.targetClassId === 'sp_cleric' ||
          entry.targetClassId === 'at_sorcerer'),
    ),
  ).toBe(true);
}

function highSwordsmanMustDie(high: CapturedRun): boolean {
  return swordsmanLethalSec(high.trace) !== null && !swordsmanFinalAlive(high.finalEnemy);
}

/**
 * 1K-R1: 0.93/0.90 pair の核心観測を直接固定する。
 *
 * 固定できること（観測）:
 * - 最初の構造分岐は ally cleric heal の target 差（event）
 * - 分岐直前の enemy sorcerer damage 累積差と味方 HP 差
 * - 分岐前の enemy cleric heal 列は両 scale で同一
 * - lethal / action order の後続差 index
 *
 * 固定しないこと:
 * - damage 差が何発目で確定したか、RNG 原因、単一所有者、production 採用
 */
function assertObservedNonMonotonicPairCore(report: PairReport): void {
  const key = pairKey(report.buildId, report.battleRngSeed);
  const expectedDivergenceIndex = EXPECTED_DIVERGENCE_INDEX_BY_PAIR[key];
  expect(expectedDivergenceIndex, `unexpected pair identity ${key}`).toBeDefined();
  expect(report.divergenceIndex).toBe(expectedDivergenceIndex);
  expect(report.divergenceKind).toBe('event');

  expect(report.highBranchEvent).not.toBeNull();
  expect(report.lowBranchEvent).not.toBeNull();
  const highBranch = report.highBranchEvent!;
  const lowBranch = report.lowBranchEvent!;
  expect(highBranch.kind).toBe('heal');
  expect(lowBranch.kind).toBe('heal');
  expect(highBranch.kind === 'heal').toBe(true);
  expect(lowBranch.kind === 'heal').toBe(true);
  if (highBranch.kind !== 'heal' || lowBranch.kind !== 'heal') {
    throw new Error('expected heal branch events');
  }

  expect(highBranch.actorSide).toBe('ally');
  expect(highBranch.actorClassId).toBe('sp_cleric');
  expect(highBranch.targetSide).toBe('ally');
  expect(highBranch.targetClassId).toBe('at_swordsman');
  expect(highBranch.amount).toBe(15);

  expect(lowBranch.actorSide).toBe('ally');
  expect(lowBranch.actorClassId).toBe('sp_cleric');
  expect(lowBranch.targetSide).toBe('ally');
  expect(lowBranch.targetClassId).toBe('df_guardian');
  expect(lowBranch.amount).toBe(12);

  expect(report.firstTargetSelectChangeIndex).toBe(report.divergenceIndex);

  expect(report.sorcererDamageDiffBeforeBranch).toBe(15);

  const allyDiff = report.allyHpDiffAtBranch;
  expect(allyDiff.df_guardian).toBe(EXPECTED_ALLY_HP_DIFF_AT_BRANCH.df_guardian);
  expect(allyDiff.at_swordsman).toBe(EXPECTED_ALLY_HP_DIFF_AT_BRANCH.at_swordsman);
  for (const [classId, value] of Object.entries(allyDiff)) {
    if (
      classId === 'df_guardian' ||
      classId === 'at_swordsman'
    ) {
      continue;
    }
    expect(value, `unexpected non-zero ally HP diff for ${classId}`).toBe(0);
  }

  const heals = report.clericHealDiff;
  expect(heals.highCount).toBe(6);
  expect(heals.lowCount).toBe(6);
  expect(heals.highTotalAmount).toBe(30);
  expect(heals.lowTotalAmount).toBe(30);
  expect(heals.high).toHaveLength(6);
  expect(heals.low).toHaveLength(6);
  expect(heals.high).toEqual(heals.low);
  for (const heal of heals.high) {
    expect(heal.targetClassId).toBe('df_guardian');
    expect(heal.amount).toBe(5);
  }
  for (const heal of heals.low) {
    expect(heal.targetClassId).toBe('df_guardian');
    expect(heal.amount).toBe(5);
  }

  expect(report.firstLethalChangeIndex).toBe(167);
  expect(report.firstActionOrderChangeIndex).toBe(173);
}

function indexPairReportsByBuildSeed(
  reports: readonly PairReport[],
): ReadonlyMap<string, PairReport> {
  const byKey = new Map<string, PairReport>();
  for (const report of reports) {
    const key = pairKey(report.buildId, report.battleRngSeed);
    expect(byKey.has(key)).toBe(false);
    byKey.set(key, report);
  }

  const expectedKeys = new Set(
    PAIR_IDENTITIES.map((identity) =>
      pairKey(identity.buildId, identity.battleRngSeed),
    ),
  );
  expect(byKey.size).toBe(expectedKeys.size);
  expect(byKey.size).toBe(4);
  for (const key of expectedKeys) {
    expect(byKey.has(key)).toBe(true);
    expect(EXPECTED_DIVERGENCE_INDEX_BY_PAIR[key]).toBeDefined();
  }
  for (const key of byKey.keys()) {
    expect(expectedKeys.has(key)).toBe(true);
  }
  return byKey;
}

describe('R12n 1K series A Wave3 sorcerer atkScale 0.93/0.90 non-monotonic paired trace (test-only)', () => {
  it('pairs 4 identities × 2 scales, asserts Wave3 start parity, finds first structural branch', async () => {
    assertBaselineShaUnchanged();
    const baseline = loadBaselineA();
    const baselineByKey = new Map<string, SeriesABaselineCase>();
    for (const caseEntry of baseline.cases) {
      baselineByKey.set(
        pairKey(caseEntry.buildId, caseEntry.battleRngSeed),
        caseEntry,
      );
    }

    const guardianOnlyWaves = createSeriesAWave2GuardianHpScaleTransform(
      GUARDIAN_HP_SCALE,
    )(loadProductionBattleWaves(), transformContext());
    for (const atkScale of [ATK_SCALE_HIGH, ATK_SCALE_LOW] as const) {
      const composed = composeSeriesAGuardianThenSorcererAtkTransform(
        GUARDIAN_HP_SCALE,
        atkScale,
      );
      assertTransformTouchesOnlyWave3SorcererAtkScale(
        guardianOnlyWaves,
        composed(loadProductionBattleWaves(), transformContext()),
        atkScale,
      );
    }

    const expectedRunKeys = new Set<string>();
    for (const identity of PAIR_IDENTITIES) {
      for (const atkScale of [ATK_SCALE_HIGH, ATK_SCALE_LOW] as const) {
        expectedRunKeys.add(
          runKey(identity.buildId, identity.battleRngSeed, atkScale),
        );
      }
    }
    expect(expectedRunKeys.size).toBe(8);

    const runs = new Map<string, CapturedRun>();
    const pairReports: PairReport[] = [];

    for (const identity of PAIR_IDENTITIES) {
      await new Promise<void>((resolveTick) => {
        setImmediate(resolveTick);
      });

      const baselineCase = baselineByKey.get(
        pairKey(identity.buildId, identity.battleRngSeed),
      );
      expect(baselineCase).toBeDefined();

      const high = captureRun(baselineCase!, ATK_SCALE_HIGH);
      const low = captureRun(baselineCase!, ATK_SCALE_LOW);

      const highKey = runKey(identity.buildId, identity.battleRngSeed, ATK_SCALE_HIGH);
      const lowKey = runKey(identity.buildId, identity.battleRngSeed, ATK_SCALE_LOW);
      expect(runs.has(highKey)).toBe(false);
      expect(runs.has(lowKey)).toBe(false);
      runs.set(highKey, high);
      runs.set(lowKey, low);

      assertPairedWave3StartEqualExceptSorcererAtk(high, low);
      assertMaintained1JR1Outcomes(high, low);

      const report = buildPairReport(high, low);
      assertObservedNonMonotonicPairCore(report);
      pairReports.push(report);

      // eslint-disable-next-line no-console
      console.info(
        JSON.stringify(
          {
            pair: `${identity.buildId}/${identity.battleRngSeed}`,
            divergenceIndex: report.divergenceIndex,
            divergenceKind: report.divergenceKind,
            matchedBefore: report.matchedBefore.map(summarizeEvent),
            highBranchEvent: summarizeEvent(report.highBranchEvent),
            lowBranchEvent: summarizeEvent(report.lowBranchEvent),
            highCheckpoint: report.highCheckpoint,
            lowCheckpoint: report.lowCheckpoint,
            sorcererDamageDiffBeforeBranch: report.sorcererDamageDiffBeforeBranch,
            allyHpDiffAtBranch: report.allyHpDiffAtBranch,
            clericHealDiff: report.clericHealDiff,
            firstTargetSelectChangeIndex: report.firstTargetSelectChangeIndex,
            firstLethalChangeIndex: report.firstLethalChangeIndex,
            firstActionOrderChangeIndex: report.firstActionOrderChangeIndex,
            highSwordsmanDeathSec: report.highSwordsmanDeathSec,
            lowSwordsmanDeathSec: report.lowSwordsmanDeathSec,
            highSwordsmanFinalAlive: report.highSwordsmanFinalAlive,
            lowSwordsmanFinalAlive: report.lowSwordsmanFinalAlive,
            highOutcome: report.highOutcome,
            lowOutcome: report.lowOutcome,
            highSurvivorClassIds: report.highSurvivorClassIds,
            lowSurvivorClassIds: report.lowSurvivorClassIds,
            highRemainingEnemyHp: report.highRemainingEnemyHp,
            lowRemainingEnemyHp: report.lowRemainingEnemyHp,
            highTraceLength: high.trace.length,
            lowTraceLength: low.trace.length,
          },
          null,
          2,
        ),
      );
    }

    expect(runs.size).toBe(8);
    for (const key of expectedRunKeys) {
      expect(runs.has(key)).toBe(true);
    }
    for (const key of runs.keys()) {
      expect(expectedRunKeys.has(key)).toBe(true);
    }
    expect(pairReports).toHaveLength(4);

    // 配列順に依存せず 4 identity の重複・欠落・余分を失敗させる
    const reportsByKey = indexPairReportsByBuildSeed(pairReports);
    for (const identity of PAIR_IDENTITIES) {
      expect(
        reportsByKey.has(pairKey(identity.buildId, identity.battleRngSeed)),
      ).toBe(true);
    }

    // 余分 identity 禁止（PAIR_IDENTITIES 矩形以外を走らせていない）
    expect(PAIR_IDENTITIES).toHaveLength(4);
    const identityKeys = PAIR_IDENTITIES.map((id) =>
      pairKey(id.buildId, id.battleRngSeed),
    );
    expect(new Set(identityKeys).size).toBe(4);

    assertBaselineShaUnchanged();
  }, 300_000);
});
