/**
 * R12n 1I / 1I-R1 — 系列A hpScale 0.75 前衛処理後の味方 sorcerer 状態・致死順序診断（test-only）。
 *
 * 1I: tick/action/damage から post-frontline を診断する。
 * 1I-R1: 所有者選定に使う質的事実を直接 assert（console だけに依存しない）。
 * 数値変更・production 採用・単一所有者の推測確定はしない。
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
  type ProblemSeriesBattleWave,
} from './problemSeries/toBattleWaves.ts';
import {
  createSeriesAWave2GuardianHpScaleTransform,
  normalizeProblemSeriesSimResultForCompare,
  runProblemSeriesSim,
  type ProblemSeriesSimCombatActionDiagnostic,
  type ProblemSeriesSimCombatFlowDamageEvent,
  type ProblemSeriesSimFinalEnemyDiagnostic,
  type ProblemSeriesSimInput,
  type ProblemSeriesSimResult,
  type ProblemSeriesSimSurvivingEnemyDiagnostic,
  type ProblemSeriesSimTickAliveUnitDiagnostic,
  type ProblemSeriesSimTickStateDiagnostic,
} from './test/problemSeriesSim.harness.ts';

const EXPECTED_BASELINE_A_SHA256 =
  '2c6e6ad212bfaffb3259613d2d15a39a7910f7b7ba0474240f72cedd5c49062c';
const EXPECTED_BASELINE_B_SHA256 =
  'b575d9830b57bce29c3fc2d13ebb8db7044ee592d3363aae1bf457b0d7e1d47c';

const PROBLEM_SERIES_SEED = 'fixture-a';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_ID = 'r12m_series_a';
const HP_SCALE = 0.75;

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

const KNOWN_ATTACK_PASSIVES = {
  swordsman: 'at_swordsman_passive_3',
  sorcererIgnition: 'at_sorcerer_op_ignition_damage',
} as const;

const ALTERNATE_PASSIVES = {
  swordsman: 'at_swordsman_passive_4',
  sorcererIgnition: 'at_sorcerer_op_ignition_threshold',
} as const;

/** 1G-R1 固定観測（弱めない）。 */
const EXPECTED_DEFEAT_SURVIVOR_BY_CLASS = {
  sp_cleric: {
    basicSkillId: 'sp_cleric_mod_party_mend',
    hp: 125,
    maxHp: 125,
  },
  at_sorcerer: {
    basicSkillId: 'at_sorcerer_mod_chain',
    hp: 55,
    maxHp: 55,
  },
} as const;

/** 1I-R1: checkpoint 共通の味方 sorcerer / 後衛距離。 */
const EXPECTED_CHECKPOINT_ALLY_SORCERER = {
  maxHp: 55,
  barrierHp: 0,
  battleX: 468,
  effectiveRangePx: 200,
} as const;

const EXPECTED_CHECKPOINT_REAR_BY_CLASS = {
  at_sorcerer: {
    enemyHp: 55,
    absDistance: 200,
    rangeSlack: 0,
    inRange: true,
  },
  sp_cleric: {
    enemyHp: 125,
    absDistance: 692,
    rangeSlack: 492,
    inRange: false,
  },
} as const;

const EXPECTED_ALIVE_ALLY_CLASS_IDS = ['at_sorcerer', 'sp_cleric'] as const;

type BuildId = (typeof BUILD_IDS)[number];
type BattleRngSeed = (typeof BATTLE_RNG_SEEDS)[number];
type StopReason = 'first_rear_hit' | 'ally_sorcerer_lethal' | 'battle_end';

/** known-attack-24: seed 別 checkpoint HP。 */
const KNOWN_ATTACK_CHECKPOINT_HP_BY_SEED: Readonly<
  Record<BattleRngSeed, number>
> = {
  'r12n-1c-a-01': 45,
  'r12n-1c-a-02': 23,
  'r12n-1c-a-03': 45,
};

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

interface RearDistanceSnapshot {
  readonly classId: string;
  readonly enemyId: string;
  readonly enemyHp: number;
  readonly enemyBattleX: number;
  readonly absDistance: number;
  readonly rangeSlack: number;
  readonly inRange: boolean;
}

interface PostFrontlineCaseRow {
  readonly buildId: BuildId;
  readonly battleRngSeed: BattleRngSeed;
  readonly outcome: ProblemSeriesSimResult['outcome'];
  readonly finalWaveIndex: number;
  readonly checkpointWaveIndex: number;
  readonly checkpointBattleTimeSec: number;
  readonly lastFrontlineLethalSec: number;
  readonly aliveAllyClassIds: readonly string[];
  readonly allySorcererAliveAtCheckpoint: boolean;
  readonly allySorcererId: string;
  readonly allySorcererHp: number;
  readonly allySorcererMaxHp: number;
  readonly allySorcererBarrierHp: number;
  readonly allySorcererBattleX: number;
  readonly allySorcererEffectiveRangePx: number;
  readonly allySorcererMarchingAtCheckpoint: boolean;
  readonly allySorcererUseLockedAtCheckpoint: boolean | null;
  readonly rearDistancesAtCheckpoint: readonly RearDistanceSnapshot[];
  readonly postMinAllySorcererHp: number;
  readonly postDamageTaken: readonly AllySorcererDamageTaken[];
  readonly postChainDamageAmount: number;
  readonly postChainHitCount: number;
  readonly postBasicActionCount: number;
  readonly postActiveActionCount: number;
  readonly postBasicActionTimes: readonly number[];
  readonly postActiveActionTimes: readonly number[];
  readonly postMarchingTickCount: number;
  readonly postUseLockedTickCount: number;
  readonly postObservedTickCount: number;
  readonly minDistanceByRearClass: Readonly<Record<string, number>>;
  readonly rearEnteredRange: boolean;
  readonly stopReason: StopReason;
  readonly firstRearHitSec: number | null;
  readonly allySorcererLethalSec: number | null;
  readonly battleEndSec: number;
  readonly elapsedFromCheckpointToStopSec: number;
  readonly acquiredPassivesBySlot: readonly (readonly string[])[];
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

/** 1G/1H で固定済みの finalWave。未知値の推測ではない。 */
function expectedFinalWaveIndex(buildId: BuildId): number {
  if (buildId === 'no-spend-control') return 1;
  return 2;
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

function loadTransformedSeriesAWaves(): readonly ProblemSeriesBattleWave[] {
  const transform = createSeriesAWave2GuardianHpScaleTransform(HP_SCALE);
  const gameData = loadGameData();
  const resolved = resolveProblemSeriesFromSeed(
    gameData.problemSeriesCatalog,
    PROBLEM_SERIES_SEED,
  );
  expect(resolved.series.seriesId).toBe(SERIES_ID);
  expect(resolved.generatorVersion).toBe(GENERATOR_VERSION);
  const production = toProblemSeriesBattleWaves(resolved.series);
  return transform(production, {
    seriesId: resolved.series.seriesId,
    problemSeriesSeed: resolved.seed,
    generatorVersion: resolved.generatorVersion,
  });
}

function assertExactRearFullHpDefeatSurvivors(
  result: ProblemSeriesSimResult,
  diagnostic: ProblemSeriesSimFinalEnemyDiagnostic,
): void {
  expect(diagnostic.survivingEnemies).toHaveLength(2);
  expect(result.survivingEnemies).toBe(2);
  const byClassId = new Map<string, ProblemSeriesSimSurvivingEnemyDiagnostic>();
  for (const survivor of diagnostic.survivingEnemies) {
    expect(byClassId.has(survivor.classId)).toBe(false);
    byClassId.set(survivor.classId, survivor);
  }
  expect([...byClassId.keys()].sort()).toEqual(['at_sorcerer', 'sp_cleric']);
  for (const classId of ['sp_cleric', 'at_sorcerer'] as const) {
    const expected = EXPECTED_DEFEAT_SURVIVOR_BY_CLASS[classId];
    const survivor = byClassId.get(classId)!;
    expect(survivor.basicSkillId).toBe(expected.basicSkillId);
    expect(survivor.hp).toBe(expected.hp);
    expect(survivor.maxHp).toBe(expected.maxHp);
  }
  expect(result.totalRemainingEnemyHp).toBe(180);
}

function assertDamageEventIntegrity(
  event: ProblemSeriesSimCombatFlowDamageEvent,
): void {
  expect(Number.isFinite(event.waveIndex)).toBe(true);
  expect(Number.isFinite(event.battleTimeSec)).toBe(true);
  expect(Number.isFinite(event.amount)).toBe(true);
  expect(Number.isFinite(event.hpDamage)).toBe(true);
  expect(Number.isFinite(event.barrierDamage)).toBe(true);
  expect(event.actor.id.length).toBeGreaterThan(0);
  expect(event.target.id.length).toBeGreaterThan(0);
  expect(event.actor.classId.length).toBeGreaterThan(0);
  expect(event.target.classId.length).toBeGreaterThan(0);
  expect(event.sourceKind.length).toBeGreaterThan(0);
  expect(event.hpDamage + event.barrierDamage).toBe(event.amount);
}

function assertTickStateIntegrity(state: ProblemSeriesSimTickStateDiagnostic): void {
  expect(Number.isFinite(state.waveIndex)).toBe(true);
  expect(Number.isFinite(state.battleTimeSec)).toBe(true);
  expect(state.phase.length).toBeGreaterThan(0);
  expect(state.runtimePhase.length).toBeGreaterThan(0);
  const seenIds = new Set<string>();
  for (const unit of [...state.allies, ...state.enemies]) {
    expect(seenIds.has(unit.id)).toBe(false);
    seenIds.add(unit.id);
    expect(unit.id.length).toBeGreaterThan(0);
    expect(unit.classId.length).toBeGreaterThan(0);
    expect(Number.isFinite(unit.hp)).toBe(true);
    expect(Number.isFinite(unit.maxHp)).toBe(true);
    expect(Number.isFinite(unit.barrierHp)).toBe(true);
    expect(Number.isFinite(unit.battleX)).toBe(true);
    expect(Number.isFinite(unit.effectiveRangePx)).toBe(true);
    expect(unit.hp).toBeGreaterThan(0);
  }
}

function assertActionIntegrity(
  event: ProblemSeriesSimCombatActionDiagnostic,
): void {
  expect(Number.isFinite(event.waveIndex)).toBe(true);
  expect(Number.isFinite(event.battleTimeSec)).toBe(true);
  expect(event.actor.id.length).toBeGreaterThan(0);
  expect(event.actor.classId.length).toBeGreaterThan(0);
  expect(Number.isFinite(event.actor.hp)).toBe(true);
  expect(Number.isFinite(event.actor.battleX)).toBe(true);
  expect(event.slotKind.length).toBeGreaterThan(0);
  expect(event.skillId.length).toBeGreaterThan(0);
}

function findUniqueAllySorcerer(
  allies: readonly ProblemSeriesSimTickAliveUnitDiagnostic[],
): ProblemSeriesSimTickAliveUnitDiagnostic | null {
  const matches = allies.filter((unit) => unit.classId === 'at_sorcerer');
  if (matches.length === 0) return null;
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

function buildRearDistances(
  allyBattleX: number,
  allyRange: number,
  enemies: readonly ProblemSeriesSimTickAliveUnitDiagnostic[],
): RearDistanceSnapshot[] {
  const rear = enemies.filter((unit) =>
    (REAR_CLASS_IDS as readonly string[]).includes(unit.classId),
  );
  const byClass = new Map<string, number>();
  for (const unit of rear) {
    byClass.set(unit.classId, (byClass.get(unit.classId) ?? 0) + 1);
  }
  for (const [classId, count] of byClass) {
    expect(count, `rear class ${classId} must be unique`).toBe(1);
  }
  return rear.map((enemy) => {
    const absDistance = Math.abs(enemy.battleX - allyBattleX);
    const rangeSlack = absDistance - allyRange;
    return {
      classId: enemy.classId,
      enemyId: enemy.id,
      enemyHp: enemy.hp,
      enemyBattleX: enemy.battleX,
      absDistance,
      rangeSlack,
      inRange: absDistance <= allyRange,
    };
  });
}

function expectKnownOutcome(
  buildId: BuildId,
  result: ProblemSeriesSimResult,
): void {
  if (buildId === 'no-spend-control') {
    expect(result.outcome).toBe('defeat');
    expect(result.finalWaveIndex).toBe(1);
  } else if (buildId === 'known-attack-24') {
    expect(result.outcome).toBe('victory');
    expect(result.finalWaveIndex).toBe(2);
    expect(result.survivingEnemies).toBe(0);
  } else {
    expect(result.outcome).toBe('defeat');
    expect(result.finalWaveIndex).toBe(2);
  }
}

function assertPassiveDifferencesApplied(
  buildId: BuildId,
  acquiredPassivesBySlot: readonly (readonly string[])[],
): void {
  const flat = acquiredPassivesBySlot.flat();
  if (buildId === 'known-attack-24') {
    expect(flat.includes(KNOWN_ATTACK_PASSIVES.swordsman)).toBe(true);
    expect(flat.includes(KNOWN_ATTACK_PASSIVES.sorcererIgnition)).toBe(true);
    expect(flat.includes(ALTERNATE_PASSIVES.swordsman)).toBe(false);
    expect(flat.includes(ALTERNATE_PASSIVES.sorcererIgnition)).toBe(false);
  } else if (buildId === 'alternate-core-24') {
    expect(flat.includes(ALTERNATE_PASSIVES.swordsman)).toBe(true);
    expect(flat.includes(ALTERNATE_PASSIVES.sorcererIgnition)).toBe(true);
    expect(flat.includes(KNOWN_ATTACK_PASSIVES.swordsman)).toBe(false);
    expect(flat.includes(KNOWN_ATTACK_PASSIVES.sorcererIgnition)).toBe(false);
  } else {
    expect(flat.includes(KNOWN_ATTACK_PASSIVES.swordsman)).toBe(false);
    expect(flat.includes(ALTERNATE_PASSIVES.swordsman)).toBe(false);
    expect(flat.includes(KNOWN_ATTACK_PASSIVES.sorcererIgnition)).toBe(false);
    expect(flat.includes(ALTERNATE_PASSIVES.sorcererIgnition)).toBe(false);
  }
}

function uniqueRearByClassId(
  distances: readonly RearDistanceSnapshot[],
): Map<string, RearDistanceSnapshot> {
  expect(distances.length).toBeGreaterThan(0);
  const byClass = new Map<string, RearDistanceSnapshot>();
  for (const dist of distances) {
    expect(
      byClass.has(dist.classId),
      `rear classId ${dist.classId} must be unique at checkpoint`,
    ).toBe(false);
    byClass.set(dist.classId, dist);
  }
  expect([...byClass.keys()].sort()).toEqual([...REAR_CLASS_IDS].sort());
  expect(byClass.size).toBe(REAR_CLASS_IDS.length);
  return byClass;
}

/** 1I-R1: 全9 case 共通の post-frontline checkpoint 事実。 */
function assertSharedPostFrontlineFacts(row: PostFrontlineCaseRow): void {
  expect([...row.aliveAllyClassIds].sort()).toEqual([
    ...EXPECTED_ALIVE_ALLY_CLASS_IDS,
  ]);
  expect(row.allySorcererAliveAtCheckpoint).toBe(true);
  expect(row.allySorcererMaxHp).toBe(EXPECTED_CHECKPOINT_ALLY_SORCERER.maxHp);
  expect(row.allySorcererBarrierHp).toBe(
    EXPECTED_CHECKPOINT_ALLY_SORCERER.barrierHp,
  );
  expect(row.allySorcererBattleX).toBe(
    EXPECTED_CHECKPOINT_ALLY_SORCERER.battleX,
  );
  expect(row.allySorcererEffectiveRangePx).toBe(
    EXPECTED_CHECKPOINT_ALLY_SORCERER.effectiveRangePx,
  );
  expect(row.allySorcererMarchingAtCheckpoint).toBe(false);
  expect(row.allySorcererUseLockedAtCheckpoint).toBe(false);

  const rearByClass = uniqueRearByClassId(row.rearDistancesAtCheckpoint);
  for (const classId of REAR_CLASS_IDS) {
    const expected = EXPECTED_CHECKPOINT_REAR_BY_CLASS[classId];
    const actual = rearByClass.get(classId)!;
    expect(actual.enemyHp).toBe(expected.enemyHp);
    expect(actual.absDistance).toBe(expected.absDistance);
    expect(actual.rangeSlack).toBe(expected.rangeSlack);
    expect(actual.inRange).toBe(expected.inRange);
  }

  expect(row.rearEnteredRange).toBe(true);
  expect(row.postMarchingTickCount).toBe(0);
  expect(row.postUseLockedTickCount).toBe(0);

  expect(Object.keys(row.minDistanceByRearClass).sort()).toEqual(
    [...REAR_CLASS_IDS].sort(),
  );
  expect(row.minDistanceByRearClass.at_sorcerer).toBe(200);
  expect(row.minDistanceByRearClass.sp_cleric).toBe(692);
}

/** 1I-R1: no-spend-control の直接固定。 */
function assertNoSpendPostFrontlineFacts(row: PostFrontlineCaseRow): void {
  expect(row.allySorcererHp).toBe(16);
  expect(row.allySorcererMaxHp).toBe(55);
  expect(row.stopReason).toBe('first_rear_hit');
  expect(row.firstRearHitSec).not.toBeNull();
  expect(row.postBasicActionCount).toBe(2);
  expect(row.postActiveActionCount).toBe(0);
  expect(row.postChainDamageAmount).toBe(0);
  expect(row.postChainHitCount).toBe(0);
  expect(row.postDamageTaken).toHaveLength(0);
  expect(row.postObservedTickCount).toBe(181);

  // 停止時点までの lethal として扱わない（first rear より後、または未発生）
  if (row.allySorcererLethalSec !== null) {
    expect(row.allySorcererLethalSec).toBeGreaterThan(row.firstRearHitSec!);
  }

  expect(row.firstRearHitSec!).toBeGreaterThan(row.checkpointBattleTimeSec);
  expect(row.elapsedFromCheckpointToStopSec).toBe(
    row.firstRearHitSec! - row.checkpointBattleTimeSec,
  );
}

/** 1I-R1: known-attack-24 の直接固定。 */
function assertKnownAttackPostFrontlineFacts(row: PostFrontlineCaseRow): void {
  expect(row.stopReason).toBe('first_rear_hit');
  expect(row.firstRearHitSec).not.toBeNull();
  expect(row.allySorcererLethalSec).toBeNull();

  const expectedHp = KNOWN_ATTACK_CHECKPOINT_HP_BY_SEED[row.battleRngSeed];
  expect(expectedHp).toBeDefined();
  expect(row.allySorcererHp).toBe(expectedHp);
  expect(row.allySorcererMaxHp).toBe(55);

  expect(row.postBasicActionCount).toBe(2);
  expect(row.postActiveActionCount).toBe(0);
  expect(row.postChainDamageAmount).toBe(22);
  expect(row.postChainHitCount).toBe(1);
  expect(row.postDamageTaken).toHaveLength(1);
  expect(row.postObservedTickCount).toBe(181);

  const chain = row.postDamageTaken[0]!;
  expect(chain.actorClassId).toBe('at_sorcerer');
  expect(chain.skillId).toBe('at_sorcerer_mod_chain');
  expect(chain.amount).toBe(22);
  expect(chain.lethal).toBe(false);

  expect(row.firstRearHitSec!).toBeGreaterThan(row.checkpointBattleTimeSec);
  expect(row.elapsedFromCheckpointToStopSec).toBe(
    row.firstRearHitSec! - row.checkpointBattleTimeSec,
  );
}

/** 1I-R1: alternate-core-24 の直接固定。 */
function assertAlternatePostFrontlineFacts(row: PostFrontlineCaseRow): void {
  expect(row.allySorcererHp).toBe(31);
  expect(row.allySorcererMaxHp).toBe(55);

  const enemySorcerer = row.rearDistancesAtCheckpoint.find(
    (d) => d.classId === 'at_sorcerer',
  );
  expect(enemySorcerer).toBeDefined();
  expect(enemySorcerer!.inRange).toBe(true);

  expect(row.stopReason).toBe('ally_sorcerer_lethal');
  expect(row.firstRearHitSec).toBeNull();
  expect(row.allySorcererLethalSec).not.toBeNull();

  expect(row.postBasicActionCount).toBe(1);
  expect(row.postActiveActionCount).toBe(0);
  expect(row.postChainDamageAmount).toBe(31);
  expect(row.postChainHitCount).toBe(2);
  expect(row.postObservedTickCount).toBe(27);

  expect(row.postDamageTaken).toHaveLength(2);
  const [first, second] = row.postDamageTaken;
  expect(first).toBeDefined();
  expect(second).toBeDefined();
  for (const event of [first!, second!]) {
    expect(event.actorClassId).toBe('at_sorcerer');
    expect(event.skillId).toBe('at_sorcerer_mod_chain');
  }
  expect(first!.battleTimeSec).toBe(second!.battleTimeSec);
  expect(first!.amount).toBe(22);
  expect(first!.lethal).toBe(false);
  expect(second!.amount).toBe(9);
  expect(second!.lethal).toBe(true);
  expect(first!.amount + second!.amount).toBe(row.allySorcererHp);
  expect(first!.amount + second!.amount).toBe(31);

  expect(row.allySorcererLethalSec!).toBeGreaterThan(row.checkpointBattleTimeSec);
  expect(row.elapsedFromCheckpointToStopSec).toBe(
    row.allySorcererLethalSec! - row.checkpointBattleTimeSec,
  );

  // 後衛への hit は 0 のまま。停止時点も marching / useLocked ではない
  expect(row.firstRearHitSec).toBeNull();
  expect(row.postMarchingTickCount).toBe(0);
  expect(row.postUseLockedTickCount).toBe(0);
  expect(row.allySorcererMarchingAtCheckpoint).toBe(false);
  expect(row.allySorcererUseLockedAtCheckpoint).toBe(false);
}

function assertBuildPostFrontlineFacts(row: PostFrontlineCaseRow): void {
  assertSharedPostFrontlineFacts(row);
  if (row.buildId === 'no-spend-control') {
    assertNoSpendPostFrontlineFacts(row);
  } else if (row.buildId === 'known-attack-24') {
    assertKnownAttackPostFrontlineFacts(row);
  } else {
    assertAlternatePostFrontlineFacts(row);
  }
}

function diagnosePostFrontlineCase(options: {
  buildId: BuildId;
  battleRngSeed: BattleRngSeed;
  result: ProblemSeriesSimResult;
  finalWaveInputs: ProblemSeriesBattleWave;
  damageEvents: readonly ProblemSeriesSimCombatFlowDamageEvent[];
  postTickStates: readonly ProblemSeriesSimTickStateDiagnostic[];
  checkpoint: ProblemSeriesSimTickStateDiagnostic;
  lastAliveAllySorcererBeforeOrAtCheckpoint: ProblemSeriesSimTickAliveUnitDiagnostic;
  allySorcererId: string;
  actionEvents: readonly ProblemSeriesSimCombatActionDiagnostic[];
  lastFrontlineLethalSec: number;
  lastFrontlineLethalWaveIndex: number;
}): PostFrontlineCaseRow {
  const {
    buildId,
    battleRngSeed,
    result,
    finalWaveInputs,
    damageEvents,
    postTickStates,
    checkpoint,
    lastAliveAllySorcererBeforeOrAtCheckpoint,
    allySorcererId,
    actionEvents,
    lastFrontlineLethalSec,
    lastFrontlineLethalWaveIndex,
  } = options;

  expect(postTickStates.length).toBeGreaterThan(0);
  for (const state of postTickStates) {
    assertTickStateIntegrity(state);
  }
  for (const event of damageEvents) {
    assertDamageEventIntegrity(event);
  }
  for (const event of actionEvents) {
    assertActionIntegrity(event);
  }

  expect(checkpoint.waveIndex).toBe(lastFrontlineLethalWaveIndex);
  expect(checkpoint.waveIndex).toBe(result.finalWaveIndex);
  expect(checkpoint.battleTimeSec).toBeGreaterThanOrEqual(lastFrontlineLethalSec);

  const rearSet = new Set<string>(REAR_CLASS_IDS);
  const finalWaveIndex = result.finalWaveIndex;
  const finalWaveDamages = damageEvents.filter((e) => e.waveIndex === finalWaveIndex);
  expect(finalWaveDamages.length).toBeGreaterThan(0);

  const checkpointAllySorcerer = findUniqueAllySorcerer(checkpoint.allies);
  const allySorcererAliveAtCheckpoint = checkpointAllySorcerer !== null;
  if (checkpointAllySorcerer !== null) {
    expect(checkpointAllySorcerer.id).toBe(allySorcererId);
  }

  const allySnapshotAtCheckpoint =
    checkpointAllySorcerer ?? lastAliveAllySorcererBeforeOrAtCheckpoint;
  expect(allySnapshotAtCheckpoint.id).toBe(allySorcererId);
  expect(allySnapshotAtCheckpoint.classId).toBe('at_sorcerer');

  const allyHpAtCheckpoint = checkpointAllySorcerer
    ? checkpointAllySorcerer.hp
    : 0;
  const allyBarrierAtCheckpoint = checkpointAllySorcerer
    ? checkpointAllySorcerer.barrierHp
    : 0;

  const aliveAllyClassIds = [...checkpoint.allies.map((a) => a.classId)].sort();
  const rearDistancesAtCheckpoint = buildRearDistances(
    allySnapshotAtCheckpoint.battleX,
    allySnapshotAtCheckpoint.effectiveRangePx,
    checkpoint.enemies,
  );
  for (const rearClassId of REAR_CLASS_IDS) {
    const inWave = finalWaveInputs.enemyGroups.some(
      (g) => g.classId === rearClassId && g.count > 0,
    );
    if (!inWave) continue;
    expect(
      rearDistancesAtCheckpoint.filter((d) => d.classId === rearClassId),
    ).toHaveLength(1);
  }

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
  expect(Number.isFinite(battleEndSec)).toBe(true);

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

  const postBasicActionTimes: number[] = [];
  const postActiveActionTimes: number[] = [];
  for (const event of actionEvents) {
    if (event.waveIndex !== finalWaveIndex) continue;
    if (event.actor.id !== allySorcererId) continue;
    if (event.battleTimeSec < checkpoint.battleTimeSec) continue;
    if (event.battleTimeSec > stopSec) continue;
    if (event.slotKind === 'basic') postBasicActionTimes.push(event.battleTimeSec);
    else if (event.slotKind === 'active') {
      postActiveActionTimes.push(event.battleTimeSec);
    }
  }

  let postMarchingTickCount = 0;
  let postUseLockedTickCount = 0;
  let postObservedTickCount = 0;
  let postMinAllySorcererHp = allyHpAtCheckpoint;
  let rearEnteredRange = false;
  const minDistanceByRearClass: Record<string, number> = {};

  for (const dist of rearDistancesAtCheckpoint) {
    minDistanceByRearClass[dist.classId] = dist.absDistance;
    if (dist.inRange) rearEnteredRange = true;
  }

  for (const state of postTickStates) {
    if (state.battleTimeSec < checkpoint.battleTimeSec) continue;
    if (state.battleTimeSec > stopSec) break;
    postObservedTickCount += 1;
    const ally = state.allies.find((unit) => unit.id === allySorcererId);
    if (ally) {
      postMinAllySorcererHp = Math.min(postMinAllySorcererHp, ally.hp);
      if (ally.bodyAnimMarching) postMarchingTickCount += 1;
      if (ally.useLocked === true) postUseLockedTickCount += 1;
      for (const dist of buildRearDistances(
        ally.battleX,
        ally.effectiveRangePx,
        state.enemies,
      )) {
        const prev = minDistanceByRearClass[dist.classId];
        if (prev === undefined || dist.absDistance < prev) {
          minDistanceByRearClass[dist.classId] = dist.absDistance;
        }
        if (dist.inRange) rearEnteredRange = true;
      }
    } else {
      postMinAllySorcererHp = Math.min(postMinAllySorcererHp, 0);
    }
  }
  expect(postObservedTickCount).toBeGreaterThan(0);

  return {
    buildId,
    battleRngSeed,
    outcome: result.outcome,
    finalWaveIndex,
    checkpointWaveIndex: checkpoint.waveIndex,
    checkpointBattleTimeSec: checkpoint.battleTimeSec,
    lastFrontlineLethalSec,
    aliveAllyClassIds,
    allySorcererAliveAtCheckpoint,
    allySorcererId,
    allySorcererHp: allyHpAtCheckpoint,
    allySorcererMaxHp: allySnapshotAtCheckpoint.maxHp,
    allySorcererBarrierHp: allyBarrierAtCheckpoint,
    allySorcererBattleX: allySnapshotAtCheckpoint.battleX,
    allySorcererEffectiveRangePx: allySnapshotAtCheckpoint.effectiveRangePx,
    allySorcererMarchingAtCheckpoint:
      checkpointAllySorcerer?.bodyAnimMarching === true,
    allySorcererUseLockedAtCheckpoint:
      checkpointAllySorcerer === null
        ? null
        : checkpointAllySorcerer.useLocked === true,
    rearDistancesAtCheckpoint,
    postMinAllySorcererHp,
    postDamageTaken,
    postChainDamageAmount: chainExact.reduce((sum, d) => sum + d.amount, 0),
    postChainHitCount: chainExact.length,
    postBasicActionCount: postBasicActionTimes.length,
    postActiveActionCount: postActiveActionTimes.length,
    postBasicActionTimes,
    postActiveActionTimes,
    postMarchingTickCount,
    postUseLockedTickCount,
    postObservedTickCount,
    minDistanceByRearClass,
    rearEnteredRange,
    stopReason,
    firstRearHitSec,
    allySorcererLethalSec,
    battleEndSec,
    elapsedFromCheckpointToStopSec: stopSec - checkpoint.battleTimeSec,
    acquiredPassivesBySlot: result.acquiredPassivesBySlot,
  };
}

function formatRearDistances(distances: readonly RearDistanceSnapshot[]): string {
  if (distances.length === 0) return '(none)';
  return distances
    .map(
      (d) =>
        `${d.classId}:dist=${d.absDistance.toFixed(2)},slack=${d.rangeSlack.toFixed(2)},inRange=${d.inRange},hp=${d.enemyHp}`,
    )
    .join(';');
}

describe('R12n 1I/1I-R1 series A hpScale=0.75 post-frontline ally sorcerer state diagnostic (test-only)', () => {
  it(
    'diagnoses post-frontline ally sorcerer state/actions for all 9 cases (fail-closed)',
    async () => {
      assertBaselineShaUnchanged();
      const baseline = loadBaselineA();
      const transform = createSeriesAWave2GuardianHpScaleTransform(HP_SCALE);
      const transformedWaves = loadTransformedSeriesAWaves();

      const pairKeys = new Set<string>();
      const rows: PostFrontlineCaseRow[] = [];
      let casesReachedTickDiagnostic = 0;
      let casesReachedCheckpoint = 0;

      for (const baselineCase of baseline.cases) {
        await new Promise<void>((resolveTick) => {
          setImmediate(resolveTick);
        });

        expect(BUILD_IDS.includes(baselineCase.buildId as BuildId)).toBe(true);
        expect(
          BATTLE_RNG_SEEDS.includes(
            baselineCase.battleRngSeed as BattleRngSeed,
          ),
        ).toBe(true);

        const buildId = baselineCase.buildId as BuildId;
        const battleRngSeed = baselineCase.battleRngSeed as BattleRngSeed;
        const key = `${buildId}::${battleRngSeed}`;
        expect(pairKeys.has(key)).toBe(false);
        pairKeys.add(key);

        const expectedFw = expectedFinalWaveIndex(buildId);
        const finalWaveInputs = transformedWaves[expectedFw];
        expect(finalWaveInputs).toBeDefined();
        const { classIds: frontlineClassIds, requiredDeaths } =
          resolveFrontlineFromWave(finalWaveInputs!);
        expect(requiredDeaths).toBeGreaterThan(0);
        const frontlineSet = new Set(frontlineClassIds);

        const damageEvents: ProblemSeriesSimCombatFlowDamageEvent[] = [];
        const actionEvents: ProblemSeriesSimCombatActionDiagnostic[] = [];
        // checkpoint 以降〜停止までだけ保持（全 tick 巨大配列化しない）
        const postTickStates: ProblemSeriesSimTickStateDiagnostic[] = [];
        let lastAliveAllySorcerer: ProblemSeriesSimTickAliveUnitDiagnostic | null =
          null;
        let allySorcererId: string | null = null;
        let frontlineLethalCount = 0;
        const frontlineLethalTargetIds = new Set<string>();
        let lastFrontlineLethalSec: number | null = null;
        let lastFrontlineLethalWaveIndex: number | null = null;
        let checkpoint: ProblemSeriesSimTickStateDiagnostic | null = null;
        let stopStreaming = false;
        let tickDiagnosticReached = false;
        let survivorDiag: ProblemSeriesSimFinalEnemyDiagnostic | undefined;

        const input: ProblemSeriesSimInput = {
          ...baselineCase.input,
          transformResolvedBattleWaves: transform,
          onCombatFlowDamage: (event) => {
            damageEvents.push(event);
            if (event.waveIndex !== expectedFw) return;
            if (
              event.lethal &&
              event.target.isEnemy &&
              frontlineSet.has(event.target.classId) &&
              !frontlineLethalTargetIds.has(event.target.id)
            ) {
              frontlineLethalTargetIds.add(event.target.id);
              frontlineLethalCount += 1;
              if (frontlineLethalCount === requiredDeaths) {
                lastFrontlineLethalSec = event.battleTimeSec;
                lastFrontlineLethalWaveIndex = event.waveIndex;
              }
            }
            if (checkpoint === null || allySorcererId === null) return;
            if (stopStreaming) return;
            if (
              event.lethal &&
              event.target.id === allySorcererId &&
              event.battleTimeSec >= lastFrontlineLethalSec!
            ) {
              stopStreaming = true;
            }
            if (
              !event.actor.isEnemy &&
              event.target.isEnemy &&
              (REAR_CLASS_IDS as readonly string[]).includes(event.target.classId) &&
              event.battleTimeSec >= lastFrontlineLethalSec!
            ) {
              stopStreaming = true;
            }
          },
          onTickStateDiagnostic: (state) => {
            tickDiagnosticReached = true;
            // 味方 sorcerer id は Wave 再生成で変わる。最終Wave 内だけで一意固定する。
            if (state.waveIndex !== expectedFw) {
              return;
            }

            const found = findUniqueAllySorcerer(state.allies);
            if (found) {
              if (allySorcererId === null) allySorcererId = found.id;
              else expect(found.id).toBe(allySorcererId);
              lastAliveAllySorcerer = found;
            }

            if (checkpoint === null) {
              if (
                lastFrontlineLethalSec !== null &&
                state.battleTimeSec >= lastFrontlineLethalSec
              ) {
                checkpoint = state;
                casesReachedCheckpoint += 1;
                postTickStates.push(state);
                if (state.phase === 'victory' || state.phase === 'defeat') {
                  stopStreaming = true;
                }
              }
              return;
            }

            if (stopStreaming) {
              if (
                (state.phase === 'victory' || state.phase === 'defeat') &&
                postTickStates[postTickStates.length - 1]?.phase !== state.phase
              ) {
                postTickStates.push(state);
              }
              return;
            }

            postTickStates.push(state);
            if (state.phase === 'victory' || state.phase === 'defeat') {
              stopStreaming = true;
            }
          },
          onCombatActionDiagnostic: (event) => {
            if (event.waveIndex === expectedFw) {
              actionEvents.push(event);
            }
          },
          onFinalEnemyDiagnostic: (diagnostic) => {
            survivorDiag = diagnostic;
          },
        };

        const result = runProblemSeriesSim(input);
        expect(result.seriesId).toBe(SERIES_ID);
        expect(result.battleRngSeed).toBe(battleRngSeed);
        expectKnownOutcome(buildId, result);
        expect(result.finalWaveIndex).toBe(expectedFw);
        expect(result.enemyWaveInputs[expectedFw]).toEqual(finalWaveInputs);

        expect(tickDiagnosticReached).toBe(true);
        casesReachedTickDiagnostic += 1;
        expect(checkpoint).not.toBeNull();
        expect(lastFrontlineLethalSec).not.toBeNull();
        expect(lastFrontlineLethalWaveIndex).toBe(expectedFw);
        expect(allySorcererId).not.toBeNull();
        expect(lastAliveAllySorcerer).not.toBeNull();
        expect(survivorDiag).toBeDefined();

        if (buildId === 'known-attack-24') {
          expect(survivorDiag!.survivingEnemies).toEqual([]);
          expect(result.survivingEnemies).toBe(0);
        } else {
          assertExactRearFullHpDefeatSurvivors(result, survivorDiag!);
        }

        assertPassiveDifferencesApplied(buildId, result.acquiredPassivesBySlot);

        // 1H: 最終前衛 lethal と checkpoint wave 一致
        expect(checkpoint!.waveIndex).toBe(lastFrontlineLethalWaveIndex);

        const row = diagnosePostFrontlineCase({
          buildId,
          battleRngSeed,
          result,
          finalWaveInputs: finalWaveInputs!,
          damageEvents,
          postTickStates,
          checkpoint: checkpoint!,
          lastAliveAllySorcererBeforeOrAtCheckpoint: lastAliveAllySorcerer!,
          allySorcererId: allySorcererId!,
          actionEvents,
          lastFrontlineLethalSec: lastFrontlineLethalSec!,
          lastFrontlineLethalWaveIndex: lastFrontlineLethalWaveIndex!,
        });
        rows.push(row);
      }

      expect(pairKeys.size).toBe(9);
      expect(rows).toHaveLength(9);
      expect(casesReachedTickDiagnostic).toBe(9);
      expect(casesReachedCheckpoint).toBe(9);
      for (const buildId of BUILD_IDS) {
        for (const seed of BATTLE_RNG_SEEDS) {
          expect(pairKeys.has(`${buildId}::${seed}`)).toBe(true);
        }
      }

      // 1H-R1 主要観測の維持 + 1I-R1 直接固定
      for (const row of rows) {
        if (row.buildId === 'no-spend-control') {
          expect(row.firstRearHitSec).not.toBeNull();
          expect(row.stopReason).toBe('first_rear_hit');
        } else if (row.buildId === 'known-attack-24') {
          expect(row.firstRearHitSec).not.toBeNull();
          expect(row.stopReason).toBe('first_rear_hit');
        } else {
          expect(row.firstRearHitSec).toBeNull();
          expect(row.allySorcererLethalSec).not.toBeNull();
        }
        assertBuildPostFrontlineFacts(row);
      }

      // eslint-disable-next-line no-console
      console.log(
        'build|seed|outcome|fw|aliveAllies|sorcAlive|hp/max/barrier|battleX|effRange|march/lock|rearDist|postActions(b/a)|chainDmg/hits|rearInRange|stop|firstRear|sorcLethal|elapsed',
      );
      for (const row of rows) {
        // eslint-disable-next-line no-console
        console.log(
          [
            row.buildId,
            row.battleRngSeed,
            row.outcome,
            row.finalWaveIndex,
            row.aliveAllyClassIds.join(','),
            row.allySorcererAliveAtCheckpoint,
            `${row.allySorcererHp}/${row.allySorcererMaxHp}/${row.allySorcererBarrierHp}`,
            row.allySorcererBattleX.toFixed(2),
            row.allySorcererEffectiveRangePx.toFixed(2),
            `${row.allySorcererMarchingAtCheckpoint}/${String(row.allySorcererUseLockedAtCheckpoint)}`,
            formatRearDistances(row.rearDistancesAtCheckpoint),
            `${row.postBasicActionCount}/${row.postActiveActionCount}`,
            `${row.postChainDamageAmount}/${row.postChainHitCount}`,
            row.rearEnteredRange,
            row.stopReason,
            row.firstRearHitSec ?? 'none',
            row.allySorcererLethalSec ?? 'none',
            row.elapsedFromCheckpointToStopSec,
          ].join(' | '),
        );
        // eslint-disable-next-line no-console
        console.log(
          `  post: minHp=${row.postMinAllySorcererHp} marchTicks=${row.postMarchingTickCount}/${row.postObservedTickCount} lockTicks=${row.postUseLockedTickCount} minDist=${JSON.stringify(row.minDistanceByRearClass)} dmgTaken=${row.postDamageTaken.map((d) => `${d.actorClassId}:${d.skillId}:${d.amount}@${d.battleTimeSec}${d.lethal ? '!L' : ''}`).join(',') || '(none)'}`,
        );
      }

      assertBaselineShaUnchanged();
    },
    300_000,
  );

  it('omitted tick/action callbacks leave Result / normalize identical to noop path', () => {
    assertBaselineShaUnchanged();
    const baseline = loadBaselineA();
    const sample = baseline.cases[0]!;
    const transform = createSeriesAWave2GuardianHpScaleTransform(HP_SCALE);

    const withoutCallback = runProblemSeriesSim({
      ...sample.input,
      transformResolvedBattleWaves: transform,
    });
    const withNoopCallbacks = runProblemSeriesSim({
      ...sample.input,
      transformResolvedBattleWaves: transform,
      onTickStateDiagnostic: () => {},
      onCombatActionDiagnostic: () => {},
      onCombatFlowDamage: () => {},
      onCombatFlowHeal: () => {},
    });

    expect(normalizeProblemSeriesSimResultForCompare(withoutCallback)).toBe(
      normalizeProblemSeriesSimResultForCompare(withNoopCallbacks),
    );
    expect(
      Object.prototype.hasOwnProperty.call(withoutCallback, 'tickStateEvents'),
    ).toBe(false);
    assertBaselineShaUnchanged();
  });
});
