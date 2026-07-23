/**
 * R12n 1H / 1H-R1 — 系列A hpScale 0.75 最終Wave combat flow 診断と観測回帰固定（test-only）。
 *
 * 1H: 既存 damage/heal callback から最終Waveを診断する。
 * 1H-R1: 所有者選定に使う質的事実を直接 assert（console だけに依存しない）。
 * 数値変更・production 採用・単一所有者の推測確定はしない。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createSeriesAWave2GuardianHpScaleTransform,
  normalizeProblemSeriesSimResultForCompare,
  runProblemSeriesSim,
  type ProblemSeriesSimCombatFlowDamageEvent,
  type ProblemSeriesSimCombatFlowHealEvent,
  type ProblemSeriesSimFinalEnemyDiagnostic,
  type ProblemSeriesSimInput,
  type ProblemSeriesSimResult,
  type ProblemSeriesSimSurvivingEnemyDiagnostic,
} from './test/problemSeriesSim.harness.ts';
import type { ProblemSeriesBattleWave } from './problemSeries/toBattleWaves.ts';

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

/** Wave 入力に現れるときだけ前衛扱い。存在しない class は補完しない。 */
const FRONTLINE_CLASS_CANDIDATES = ['df_guardian', 'at_swordsman'] as const;
const REAR_CLASS_IDS = ['sp_cleric', 'at_sorcerer'] as const;

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

type BuildId = (typeof BUILD_IDS)[number];
type BattleRngSeed = (typeof BATTLE_RNG_SEEDS)[number];

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

interface LethalTimelineEntry {
  readonly order: number;
  readonly battleTimeSec: number;
  readonly actorClassId: string;
  readonly targetClassId: string;
  readonly targetSide: 'ally' | 'enemy';
  readonly skillId: string;
  readonly targetId: string;
}

interface CombatFlowCaseSummary {
  readonly buildId: BuildId;
  readonly battleRngSeed: BattleRngSeed;
  readonly outcome: ProblemSeriesSimResult['outcome'];
  readonly finalWaveIndex: number;
  readonly finalWaveEndSec: number;
  readonly allyDamageToEnemyByClass: Readonly<Record<string, number>>;
  readonly enemyDamageToAllyByActorClass: Readonly<Record<string, number>>;
  readonly enemyDamageToAllyBySkillId: Readonly<Record<string, number>>;
  readonly enemyLethalCountByActorClass: Readonly<Record<string, number>>;
  readonly enemyHealByActorClass: Readonly<Record<string, { amount: number; count: number }>>;
  readonly enemyHealByTargetClass: Readonly<Record<string, { amount: number; count: number }>>;
  readonly clericHealToFrontline: { amount: number; count: number };
  readonly sorcererDamageToAllies: number;
  readonly sorcererLethalToAllies: number;
  readonly lethalTimeline: readonly LethalTimelineEntry[];
  readonly sameSideDamageCount: number;
  readonly frontlineClassIds: readonly string[];
  readonly requiredFrontlineDeaths: number;
  readonly lastFrontlineLethalSec: number | null;
  readonly firstRearHitAfterFrontlineSec: number | null | 'none';
  readonly rearAllyDamageEventCount: number;
  /** 味方→後衛の各 damage event（順序は発生順）。 */
  readonly rearAllyDamageEvents: readonly {
    readonly targetClassId: string;
    readonly amount: number;
    readonly battleTimeSec: number;
  }[];
  readonly alliesAliveAfterFrontlineClear: boolean | null;
  readonly deltaFrontlineClearToRearOrEndSec: number | null;
  readonly finalWaveDamageEventCount: number;
  readonly finalWaveHealEventCount: number;
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

function addToNumberMap(
  map: Record<string, number>,
  key: string,
  amount: number,
): void {
  map[key] = (map[key] ?? 0) + amount;
}

function addToCountAmountMap(
  map: Record<string, { amount: number; count: number }>,
  key: string,
  amount: number,
): void {
  const prev = map[key] ?? { amount: 0, count: 0 };
  map[key] = { amount: prev.amount + amount, count: prev.count + 1 };
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
  expect(byClassId.has('df_guardian')).toBe(false);
  for (const classId of ['sp_cleric', 'at_sorcerer'] as const) {
    const expected = EXPECTED_DEFEAT_SURVIVOR_BY_CLASS[classId];
    const survivor = byClassId.get(classId)!;
    expect(survivor.basicSkillId).toBe(expected.basicSkillId);
    expect(survivor.hp).toBe(expected.hp);
    expect(survivor.maxHp).toBe(expected.maxHp);
    expect(survivor.hp).toBe(survivor.maxHp);
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
  // 現行契約: amount = hp + barrier
  expect(event.hpDamage + event.barrierDamage).toBe(event.amount);
}

function assertHealEventIntegrity(
  event: ProblemSeriesSimCombatFlowHealEvent,
): void {
  expect(Number.isFinite(event.waveIndex)).toBe(true);
  expect(Number.isFinite(event.battleTimeSec)).toBe(true);
  expect(Number.isFinite(event.amount)).toBe(true);
  expect(event.actor.id.length).toBeGreaterThan(0);
  expect(event.target.id.length).toBeGreaterThan(0);
  expect(event.actor.classId.length).toBeGreaterThan(0);
  expect(event.target.classId.length).toBeGreaterThan(0);
}

function summarizeFinalWaveCombatFlow(options: {
  buildId: BuildId;
  battleRngSeed: BattleRngSeed;
  result: ProblemSeriesSimResult;
  damageEvents: readonly ProblemSeriesSimCombatFlowDamageEvent[];
  healEvents: readonly ProblemSeriesSimCombatFlowHealEvent[];
  finalWaveInputs: ProblemSeriesBattleWave;
}): CombatFlowCaseSummary {
  const { buildId, battleRngSeed, result, damageEvents, healEvents, finalWaveInputs } =
    options;
  const finalWaveIndex = result.finalWaveIndex;
  const finalWaveDamages = damageEvents.filter((e) => e.waveIndex === finalWaveIndex);
  const finalWaveHeals = healEvents.filter((e) => e.waveIndex === finalWaveIndex);
  expect(finalWaveDamages.length).toBeGreaterThan(0);

  const { classIds: frontlineClassIds, requiredDeaths } =
    resolveFrontlineFromWave(finalWaveInputs);
  expect(requiredDeaths).toBeGreaterThan(0);
  const frontlineSet = new Set(frontlineClassIds);
  const rearSet = new Set<string>(REAR_CLASS_IDS);

  const allyDamageToEnemyByClass: Record<string, number> = {};
  const enemyDamageToAllyByActorClass: Record<string, number> = {};
  const enemyDamageToAllyBySkillId: Record<string, number> = {};
  const enemyLethalCountByActorClass: Record<string, number> = {};
  const enemyHealByActorClass: Record<string, { amount: number; count: number }> =
    {};
  const enemyHealByTargetClass: Record<string, { amount: number; count: number }> =
    {};

  let sameSideDamageCount = 0;
  let sorcererDamageToAllies = 0;
  let sorcererLethalToAllies = 0;
  let clericHealToFrontlineAmount = 0;
  let clericHealToFrontlineCount = 0;
  const rearAllyDamageEvents: {
    targetClassId: string;
    amount: number;
    battleTimeSec: number;
  }[] = [];

  const lethalSeenTargetIds = new Set<string>();
  const lethalTimeline: LethalTimelineEntry[] = [];
  const frontlineLethalOrder: { targetId: string; battleTimeSec: number }[] = [];

  for (const event of finalWaveDamages) {
    assertDamageEventIntegrity(event);
    const sameSide = event.actor.isEnemy === event.target.isEnemy;
    if (sameSide) {
      sameSideDamageCount += 1;
      // 同サイドは通常集計へ混ぜない（明示報告のみ）
      continue;
    }

    if (!event.actor.isEnemy && event.target.isEnemy) {
      addToNumberMap(allyDamageToEnemyByClass, event.target.classId, event.amount);
      if (rearSet.has(event.target.classId)) {
        rearAllyDamageEvents.push({
          targetClassId: event.target.classId,
          amount: event.amount,
          battleTimeSec: event.battleTimeSec,
        });
      }
    } else if (event.actor.isEnemy && !event.target.isEnemy) {
      addToNumberMap(
        enemyDamageToAllyByActorClass,
        event.actor.classId,
        event.amount,
      );
      addToNumberMap(
        enemyDamageToAllyBySkillId,
        event.skillId.length > 0 ? event.skillId : '(empty-skillId)',
        event.amount,
      );
      if (event.actor.classId === 'at_sorcerer') {
        sorcererDamageToAllies += event.amount;
      }
      if (event.lethal) {
        addToNumberMap(enemyLethalCountByActorClass, event.actor.classId, 1);
        if (event.actor.classId === 'at_sorcerer') {
          sorcererLethalToAllies += 1;
        }
      }
    }

    if (event.lethal && !lethalSeenTargetIds.has(event.target.id)) {
      lethalSeenTargetIds.add(event.target.id);
      lethalTimeline.push({
        order: lethalTimeline.length + 1,
        battleTimeSec: event.battleTimeSec,
        actorClassId: event.actor.classId,
        targetClassId: event.target.classId,
        targetSide: event.target.isEnemy ? 'enemy' : 'ally',
        skillId: event.skillId,
        targetId: event.target.id,
      });
      if (event.target.isEnemy && frontlineSet.has(event.target.classId)) {
        frontlineLethalOrder.push({
          targetId: event.target.id,
          battleTimeSec: event.battleTimeSec,
        });
      }
    }
  }

  const rearAllyDamageEventCount = rearAllyDamageEvents.length;

  for (const event of finalWaveHeals) {
    assertHealEventIntegrity(event);
    if (event.actor.isEnemy) {
      addToCountAmountMap(enemyHealByActorClass, event.actor.classId, event.amount);
      addToCountAmountMap(
        enemyHealByTargetClass,
        event.target.classId,
        event.amount,
      );
      if (
        event.actor.classId === 'sp_cleric' &&
        frontlineSet.has(event.target.classId)
      ) {
        clericHealToFrontlineAmount += event.amount;
        clericHealToFrontlineCount += 1;
      }
    }
  }

  const finalWaveTimeline = result.waves.find((w) => w.waveIndex === finalWaveIndex);
  expect(finalWaveTimeline).toBeDefined();
  const finalWaveEndSec = finalWaveTimeline!.endSec;
  expect(Number.isFinite(finalWaveEndSec)).toBe(true);

  let lastFrontlineLethalSec: number | null = null;
  if (frontlineLethalOrder.length >= requiredDeaths) {
    lastFrontlineLethalSec =
      frontlineLethalOrder[requiredDeaths - 1]!.battleTimeSec;
  }

  let firstRearHitAfterFrontlineSec: number | null | 'none' = null;
  let alliesAliveAfterFrontlineClear: boolean | null = null;
  let deltaFrontlineClearToRearOrEndSec: number | null = null;

  if (lastFrontlineLethalSec !== null) {
    const rearHitsAfter = finalWaveDamages.filter(
      (e) =>
        !e.actor.isEnemy &&
        e.target.isEnemy &&
        rearSet.has(e.target.classId) &&
        e.battleTimeSec >= lastFrontlineLethalSec! &&
        e.actor.isEnemy !== e.target.isEnemy,
    );
    if (rearHitsAfter.length === 0) {
      firstRearHitAfterFrontlineSec = 'none';
      deltaFrontlineClearToRearOrEndSec =
        finalWaveEndSec - lastFrontlineLethalSec;
    } else {
      firstRearHitAfterFrontlineSec = Math.min(
        ...rearHitsAfter.map((e) => e.battleTimeSec),
      );
      deltaFrontlineClearToRearOrEndSec =
        firstRearHitAfterFrontlineSec - lastFrontlineLethalSec;
    }

    const eventsAfterClear = [
      ...finalWaveDamages.filter((e) => e.battleTimeSec > lastFrontlineLethalSec!),
      ...finalWaveHeals.filter((e) => e.battleTimeSec > lastFrontlineLethalSec!),
    ];
    // 前衛クリア後にイベントが続く = その瞬間以降も戦闘主体が動いている（味方生存中）
    alliesAliveAfterFrontlineClear = eventsAfterClear.length > 0;
    const allyLethalAfter = lethalTimeline.some(
      (entry) =>
        entry.targetSide === 'ally' &&
        entry.battleTimeSec >= lastFrontlineLethalSec!,
    );
    if (allyLethalAfter) {
      alliesAliveAfterFrontlineClear = true;
    }
  }

  return {
    buildId,
    battleRngSeed,
    outcome: result.outcome,
    finalWaveIndex,
    finalWaveEndSec,
    allyDamageToEnemyByClass,
    enemyDamageToAllyByActorClass,
    enemyDamageToAllyBySkillId,
    enemyLethalCountByActorClass,
    enemyHealByActorClass,
    enemyHealByTargetClass,
    clericHealToFrontline: {
      amount: clericHealToFrontlineAmount,
      count: clericHealToFrontlineCount,
    },
    sorcererDamageToAllies,
    sorcererLethalToAllies,
    lethalTimeline,
    sameSideDamageCount,
    frontlineClassIds,
    requiredFrontlineDeaths: requiredDeaths,
    lastFrontlineLethalSec,
    firstRearHitAfterFrontlineSec,
    rearAllyDamageEventCount,
    rearAllyDamageEvents,
    alliesAliveAfterFrontlineClear,
    deltaFrontlineClearToRearOrEndSec,
    finalWaveDamageEventCount: finalWaveDamages.length,
    finalWaveHealEventCount: finalWaveHeals.length,
  };
}

function formatMap(map: Readonly<Record<string, number>>): string {
  const keys = Object.keys(map).sort();
  if (keys.length === 0) return '(none)';
  return keys.map((k) => `${k}:${map[k]}`).join(',');
}

function formatHealMap(
  map: Readonly<Record<string, { amount: number; count: number }>>,
): string {
  const keys = Object.keys(map).sort();
  if (keys.length === 0) return '(none)';
  return keys
    .map((k) => `${k}:${map[k]!.amount}x${map[k]!.count}`)
    .join(',');
}

const KNOWN_ATTACK_SEED_EXPECTATIONS: Record<
  BattleRngSeed,
  { sorcererDamage: number; clericHealAmount: number; clericHealCount: number }
> = {
  'r12n-1c-a-01': {
    sorcererDamage: 864,
    clericHealAmount: 76,
    clericHealCount: 14,
  },
  'r12n-1c-a-02': {
    sorcererDamage: 886,
    clericHealAmount: 88,
    clericHealCount: 16,
  },
  'r12n-1c-a-03': {
    sorcererDamage: 864,
    clericHealAmount: 76,
    clericHealCount: 14,
  },
};

/** 1H-R1: 全9 case 共通の質的事実。 */
function assertSharedCombatFlowFacts(summary: CombatFlowCaseSummary): void {
  expect(summary.lastFrontlineLethalSec).not.toBeNull();
  const lastFl = summary.lastFrontlineLethalSec!;
  expect(Number.isFinite(lastFl)).toBe(true);

  expect(summary.sameSideDamageCount).toBe(0);

  const lethalActors = Object.keys(summary.enemyLethalCountByActorClass).sort();
  expect(lethalActors).toEqual(['at_sorcerer']);
  expect(summary.enemyLethalCountByActorClass.at_sorcerer).toBe(
    summary.sorcererLethalToAllies,
  );

  expect(
    Object.prototype.hasOwnProperty.call(
      summary.enemyDamageToAllyBySkillId,
      'at_sorcerer_mod_chain',
    ),
  ).toBe(true);
  expect(summary.enemyDamageToAllyBySkillId['at_sorcerer_mod_chain']).toBeGreaterThan(
    0,
  );

  expect(summary.finalWaveEndSec).toBeGreaterThan(lastFl);
}

/**
 * 前衛死亡後に味方が生存していた証拠（lethal timeline から直接）。
 * 1H 観測: 敗北6 case は後続の味方対象 lethal がある。
 * victory（known-attack）は前衛クリア後に味方が後衛を撃破して勝つため、
 * 味方対象 lethal は後続せず、後衛 hit を生存証拠にする（assertKnownAttack）。
 */
function assertAllyLethalAfterFrontlineClear(
  summary: CombatFlowCaseSummary,
): void {
  const lastFl = summary.lastFrontlineLethalSec!;
  const allyLethalAfterFrontline = summary.lethalTimeline.filter(
    (entry) =>
      entry.targetSide === 'ally' && entry.battleTimeSec >= lastFl,
  );
  expect(
    allyLethalAfterFrontline.length,
    '前衛死亡後に味方対象 lethal が1件以上必要',
  ).toBeGreaterThan(0);
}

/** 1H-R1: no-spend-control の直接固定。 */
function assertNoSpendCombatFlowFacts(summary: CombatFlowCaseSummary): void {
  expect(summary.outcome).toBe('defeat');
  expect(summary.finalWaveIndex).toBe(1);
  assertAllyLethalAfterFrontlineClear(summary);
  expect(summary.rearAllyDamageEventCount).toBe(1);
  expect(summary.rearAllyDamageEvents).toHaveLength(1);
  expect(summary.rearAllyDamageEvents[0]!.targetClassId).toBe('at_sorcerer');
  expect(summary.rearAllyDamageEvents[0]!.amount).toBe(35);
  expect(summary.allyDamageToEnemyByClass.at_sorcerer).toBe(35);
  expect(summary.allyDamageToEnemyByClass.sp_cleric ?? 0).toBe(0);
  expect(
    Object.prototype.hasOwnProperty.call(
      summary.allyDamageToEnemyByClass,
      'sp_cleric',
    ),
  ).toBe(false);

  expect(typeof summary.firstRearHitAfterFrontlineSec).toBe('number');
  const firstRear = summary.firstRearHitAfterFrontlineSec as number;
  expect(firstRear).toBeGreaterThan(summary.lastFrontlineLethalSec!);
  expect(summary.rearAllyDamageEvents[0]!.battleTimeSec).toBe(firstRear);

  expect(summary.clericHealToFrontline.amount).toBe(86);
  expect(summary.clericHealToFrontline.count).toBe(16);
  expect(summary.sorcererDamageToAllies).toBe(1243);
  expect(summary.sorcererLethalToAllies).toBe(4);
  expect(summary.enemyDamageToAllyByActorClass.at_sorcerer).toBe(1243);
  expect(summary.enemyLethalCountByActorClass.at_sorcerer).toBe(4);
}

/** 1H-R1: known-attack-24 の直接固定。 */
function assertKnownAttackCombatFlowFacts(summary: CombatFlowCaseSummary): void {
  expect(summary.outcome).toBe('victory');
  expect(summary.finalWaveIndex).toBe(2);
  expect(summary.rearAllyDamageEventCount).toBe(6);
  expect(summary.rearAllyDamageEvents).toHaveLength(6);

  const rearTargets = new Set(
    summary.rearAllyDamageEvents.map((e) => e.targetClassId),
  );
  expect(rearTargets.has('at_sorcerer')).toBe(true);
  expect(rearTargets.has('sp_cleric')).toBe(true);
  expect(summary.allyDamageToEnemyByClass.at_sorcerer).toBe(61);
  expect(summary.allyDamageToEnemyByClass.sp_cleric).toBe(144);

  // victory: 前衛クリア後の味方生存証拠は後衛 hit（味方 lethal は後続しない）
  expect(typeof summary.firstRearHitAfterFrontlineSec).toBe('number');
  const firstRear = summary.firstRearHitAfterFrontlineSec as number;
  expect(firstRear).toBeGreaterThan(summary.lastFrontlineLethalSec!);

  expect(summary.sorcererLethalToAllies).toBe(2);
  expect(summary.enemyLethalCountByActorClass.at_sorcerer).toBe(2);

  const seedExpected = KNOWN_ATTACK_SEED_EXPECTATIONS[summary.battleRngSeed];
  expect(summary.sorcererDamageToAllies).toBe(seedExpected.sorcererDamage);
  expect(summary.enemyDamageToAllyByActorClass.at_sorcerer).toBe(
    seedExpected.sorcererDamage,
  );
  expect(summary.clericHealToFrontline.amount).toBe(seedExpected.clericHealAmount);
  expect(summary.clericHealToFrontline.count).toBe(seedExpected.clericHealCount);
}

/** 1H-R1: alternate-core-24 の直接固定。 */
function assertAlternateCombatFlowFacts(summary: CombatFlowCaseSummary): void {
  expect(summary.outcome).toBe('defeat');
  expect(summary.finalWaveIndex).toBe(2);
  expect(summary.lastFrontlineLethalSec).not.toBeNull();
  assertAllyLethalAfterFrontlineClear(summary);
  expect(summary.rearAllyDamageEventCount).toBe(0);
  expect(summary.rearAllyDamageEvents).toHaveLength(0);
  expect(
    Object.prototype.hasOwnProperty.call(
      summary.allyDamageToEnemyByClass,
      'sp_cleric',
    ),
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(
      summary.allyDamageToEnemyByClass,
      'at_sorcerer',
    ),
  ).toBe(false);

  expect(summary.firstRearHitAfterFrontlineSec).toBe('none');
  expect(summary.deltaFrontlineClearToRearOrEndSec).toBe(
    summary.finalWaveEndSec - summary.lastFrontlineLethalSec!,
  );

  expect(summary.clericHealToFrontline.amount).toBe(92);
  expect(summary.clericHealToFrontline.count).toBe(17);
  expect(summary.sorcererDamageToAllies).toBe(1185);
  expect(summary.sorcererLethalToAllies).toBe(4);
  expect(summary.enemyDamageToAllyByActorClass.at_sorcerer).toBe(1185);
  expect(summary.enemyLethalCountByActorClass.at_sorcerer).toBe(4);
}

function assertBuildCombatFlowFacts(summary: CombatFlowCaseSummary): void {
  assertSharedCombatFlowFacts(summary);
  if (summary.buildId === 'no-spend-control') {
    assertNoSpendCombatFlowFacts(summary);
  } else if (summary.buildId === 'known-attack-24') {
    assertKnownAttackCombatFlowFacts(summary);
  } else {
    assertAlternateCombatFlowFacts(summary);
  }
}

describe('R12n 1H/1H-R1 series A hpScale=0.75 final-wave combat-flow diagnostic (test-only)', () => {
  it(
    'diagnoses final-wave combat flow for all 9 cases (fail-closed structure)',
    async () => {
      assertBaselineShaUnchanged();
      const baseline = loadBaselineA();
      const transform = createSeriesAWave2GuardianHpScaleTransform(HP_SCALE);

      const pairKeys = new Set<string>();
      const summaries: CombatFlowCaseSummary[] = [];
      let casesWithAnyCombatFlowEvent = 0;

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

        const damageEvents: ProblemSeriesSimCombatFlowDamageEvent[] = [];
        const healEvents: ProblemSeriesSimCombatFlowHealEvent[] = [];
        let survivorDiag: ProblemSeriesSimFinalEnemyDiagnostic | undefined;

        const input: ProblemSeriesSimInput = {
          ...baselineCase.input,
          transformResolvedBattleWaves: transform,
          onCombatFlowDamage: (event) => {
            damageEvents.push(event);
          },
          onCombatFlowHeal: (event) => {
            healEvents.push(event);
          },
          onFinalEnemyDiagnostic: (diagnostic) => {
            survivorDiag = diagnostic;
          },
        };

        const result = runProblemSeriesSim(input);
        expect(result.seriesId).toBe(SERIES_ID);
        expect(result.battleRngSeed).toBe(battleRngSeed);

        // 1G-R1 outcome / finalWave を弱めない
        if (buildId === 'no-spend-control') {
          expect(result.outcome).toBe('defeat');
          expect(result.finalWaveIndex).toBe(1);
        } else if (buildId === 'known-attack-24') {
          expect(result.outcome).toBe('victory');
          expect(result.finalWaveIndex).toBe(2);
        } else {
          expect(result.outcome).toBe('defeat');
          expect(result.finalWaveIndex).toBe(2);
        }

        expect(damageEvents.length + healEvents.length).toBeGreaterThan(0);
        casesWithAnyCombatFlowEvent += 1;
        expect(survivorDiag).toBeDefined();

        if (buildId === 'known-attack-24') {
          expect(survivorDiag!.survivingEnemies).toEqual([]);
          expect(result.survivingEnemies).toBe(0);
          expect(result.totalRemainingEnemyHp).toBe(0);
        } else {
          assertExactRearFullHpDefeatSurvivors(result, survivorDiag!);
        }

        const finalWaveInputs =
          result.enemyWaveInputs[result.finalWaveIndex] ??
          survivorDiag!.finalWaveEnemyInputs;
        expect(finalWaveInputs.enemyGroups.length).toBeGreaterThan(0);

        const summary = summarizeFinalWaveCombatFlow({
          buildId,
          battleRngSeed,
          result,
          damageEvents,
          healEvents,
          finalWaveInputs,
        });
        expect(summary.finalWaveDamageEventCount).toBeGreaterThan(0);
        // 1H-R1: 質的観測の直接固定（回帰正本。console ではない）
        assertBuildCombatFlowFacts(summary);
        summaries.push(summary);
      }

      expect(pairKeys.size).toBe(9);
      expect(summaries).toHaveLength(9);
      expect(casesWithAnyCombatFlowEvent).toBe(9);
      for (const buildId of BUILD_IDS) {
        for (const seed of BATTLE_RNG_SEEDS) {
          expect(pairKeys.has(`${buildId}::${seed}`)).toBe(true);
        }
      }

      // 補助ログのみ（回帰証拠の正本は assertBuildCombatFlowFacts）
      // eslint-disable-next-line no-console
      console.log(
        'build|seed|outcome|fw|allyDmgByEnemyClass|enemyDmgByActor|enemyDmgBySkill|enemyLethal|enemyHealActor|clericHealFront|sorcDmg/lethal|rearHits|lastFL|firstRear|delta|aliveAfterFL|sameSide',
      );
      for (const row of summaries) {
        // eslint-disable-next-line no-console
        console.log(
          [
            row.buildId,
            row.battleRngSeed,
            row.outcome,
            row.finalWaveIndex,
            formatMap(row.allyDamageToEnemyByClass),
            formatMap(row.enemyDamageToAllyByActorClass),
            formatMap(row.enemyDamageToAllyBySkillId),
            formatMap(row.enemyLethalCountByActorClass),
            formatHealMap(row.enemyHealByActorClass),
            `${row.clericHealToFrontline.amount}x${row.clericHealToFrontline.count}`,
            `${row.sorcererDamageToAllies}/${row.sorcererLethalToAllies}`,
            row.rearAllyDamageEventCount,
            row.lastFrontlineLethalSec ?? 'null',
            String(row.firstRearHitAfterFrontlineSec),
            row.deltaFrontlineClearToRearOrEndSec ?? 'null',
            String(row.alliesAliveAfterFrontlineClear),
            row.sameSideDamageCount,
          ].join(' | '),
        );
        // eslint-disable-next-line no-console
        console.log(
          `  lethalTimeline(${row.battleRngSeed}): ` +
            row.lethalTimeline
              .map(
                (e) =>
                  `#${e.order}@${e.battleTimeSec}:${e.actorClassId}->${e.targetSide}/${e.targetClassId}/${e.skillId || '(no-skill)'}`,
              )
              .join(' ; '),
        );
      }

      assertBaselineShaUnchanged();
    },
    180_000,
  );

  it('omitted combat-flow callbacks leave Result / normalize identical to no-callback path', () => {
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
      onCombatFlowDamage: () => {},
      onCombatFlowHeal: () => {},
    });

    expect(normalizeProblemSeriesSimResultForCompare(withoutCallback)).toBe(
      normalizeProblemSeriesSimResultForCompare(withNoopCallbacks),
    );
    expect(
      Object.prototype.hasOwnProperty.call(withoutCallback, 'combatFlowEvents'),
    ).toBe(false);
    assertBaselineShaUnchanged();
  });
});
