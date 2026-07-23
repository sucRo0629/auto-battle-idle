/**
 * R12n 1B — 問題系列比較 harness（test-only 骨格）。
 *
 * production: loadGameData → catalog → resolveProblemSeriesFromSeed →
 * toProblemSeriesBattleWaves → 初期編成 → BattleEngine（resolved waves）。
 * baseline 固定・合否閾値・数値調整は行わない。
 */

import { BattleEngine } from '../BattleEngine.ts';
import { isValidSelectedCombatModuleId } from '../data/resolveCombatModuleBasic.ts';
import { loadGameData } from '../data/loadGameData.ts';
import { createProblemSeriesInitialParty } from '../problemSeries/initialParty.ts';
import { resolveProblemSeriesFromSeed } from '../problemSeries/seedResolve.ts';
import {
  toProblemSeriesBattleWaves,
  type ProblemSeriesBattleWave,
} from '../problemSeries/toBattleWaves.ts';
import { StageDamageStatsTracker } from '../stageDamageStats.ts';
import type {
  ClassId,
  GameData,
  PartySlotState,
} from '../types.ts';
import { PARTY_SLOT_COUNT } from '../types.ts';
import { loadLevelCurves } from '../../progression/levelGrowth.ts';
import { createMemberFromClass } from '../../progression/partyCompose.ts';
import { isOperationPassiveCandidateForClass } from '../../game/operationPassiveCatalogCore.ts';
import { resolveOperationPassiveAcquireCost } from '../../game/operationPassiveAcquireCost.ts';
import levelCurvesJson from '../../../data/levelCurves.json';
import { TICK_DT } from './battleFieldSpec.harness.ts';

/** R12n / R12m 対象 4 兵科（推測で増やさない）。 */
export const PROBLEM_SERIES_SIM_ALLOWED_CLASS_IDS = [
  'df_guardian',
  'at_swordsman',
  'at_sorcerer',
  'sp_cleric',
] as const satisfies readonly ClassId[];

export type ProblemSeriesSimAllowedClassId =
  (typeof PROBLEM_SERIES_SIM_ALLOWED_CLASS_IDS)[number];

export type ProblemSeriesSimBattleOutcome = 'victory' | 'defeat' | 'timeout';

export type ProblemSeriesSimWaveResult =
  | 'cleared'
  | 'defeat'
  | 'timeout';

export interface ProblemSeriesSimSlotPlan {
  readonly classId: ClassId;
  readonly initialCombatModuleId: string;
}

export interface ProblemSeriesSimWaveModuleChange {
  readonly slotIndex: number;
  readonly combatModuleId: string;
}

export interface ProblemSeriesSimWavePassiveAcquire {
  readonly slotIndex: number;
  readonly passiveId: string;
}

export interface ProblemSeriesSimWavePlan {
  readonly moduleChanges?: readonly ProblemSeriesSimWaveModuleChange[];
  readonly passiveAcquisitions?: readonly ProblemSeriesSimWavePassiveAcquire[];
}

export interface ProblemSeriesSimInput {
  readonly problemSeriesSeed: string;
  /** 問題系列選出 seed とは別。戦闘中 Math.random 置換用。 */
  readonly battleRngSeed: string | number;
  readonly maxTicks: number;
  /**
   * ちょうど 4 slot。省略時は production 初期編成（allowedClassIds）＋各兵科 default Module。
   */
  readonly slots?: readonly ProblemSeriesSimSlotPlan[];
  /** Wave index 0..2。Wave 勝利後に次 Wave 分だけ適用。 */
  readonly wavePlans?: readonly (ProblemSeriesSimWavePlan | undefined)[];
}

export interface ProblemSeriesSimSlotMetrics {
  readonly slotIndex: number;
  readonly classId: ClassId;
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly healingDealt: number;
}

export interface ProblemSeriesSimWaveTimeline {
  readonly waveIndex: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly startSec: number;
  readonly endSec: number;
  readonly result: ProblemSeriesSimWaveResult;
}

export interface ProblemSeriesSimWaveResourceLedger {
  readonly waveIndex: number;
  readonly grantAmount: number;
  readonly spentAmount: number;
  readonly remainingResource: number;
}

export interface ProblemSeriesSimResult {
  readonly problemSeriesSeed: string;
  readonly generatorVersion: string;
  readonly seriesId: string;
  readonly battleRngSeed: string;
  readonly outcome: ProblemSeriesSimBattleOutcome;
  readonly finalWaveIndex: number;
  readonly tickCount: number;
  readonly durationSec: number;
  readonly waves: readonly ProblemSeriesSimWaveTimeline[];
  readonly survivingAllies: number;
  readonly survivingEnemies: number;
  readonly totalRemainingAllyHp: number;
  readonly totalMaxAllyHp: number;
  readonly totalRemainingEnemyHp: number;
  readonly slotStats: readonly ProblemSeriesSimSlotMetrics[];
  /** slot → 最終適用 CombatModule */
  readonly appliedCombatModuleIdBySlot: readonly string[];
  /** slot → 実際に取得した作戦内パッシブ（取得順） */
  readonly acquiredPassivesBySlot: readonly (readonly string[])[];
  readonly resourceLedger: readonly ProblemSeriesSimWaveResourceLedger[];
  readonly timedOut: boolean;
  /** A/B 比較用。固定 Stage ではなく問題系列の解決済み敵 Wave。 */
  readonly enemyWaveInputs: readonly ProblemSeriesBattleWave[];
}

const levelCurves = loadLevelCurves(levelCurvesJson);

const ALLOWED_CLASS_SET = new Set<string>(PROBLEM_SERIES_SIM_ALLOWED_CLASS_IDS);

function assertFiniteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`expected finite number for ${label}, got ${String(value)}`);
  }
  return value;
}

function normalizeBattleRngSeed(seed: string | number): string {
  if (typeof seed === 'number') {
    if (!Number.isFinite(seed)) {
      throw new Error('battleRngSeed number must be finite');
    }
    return String(seed);
  }
  if (typeof seed !== 'string') {
    throw new Error('battleRngSeed must be a string or number');
  }
  return seed;
}

/** FNV-1a 32-bit → mulberry32 初期状態。 */
function hashBattleRngSeedToUint32(seed: string): number {
  let hash = 0x811c9dc5 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function createBattleRng(seed: string | number): () => number {
  let state = hashBattleRngSeedToUint32(normalizeBattleRngSeed(seed));
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isAllowedSimClassId(classId: ClassId): classId is ProblemSeriesSimAllowedClassId {
  return ALLOWED_CLASS_SET.has(classId);
}

function requireFixedPassiveCost(
  gameData: GameData,
  passiveId: string,
): number {
  const fixed = gameData.operationPassiveCatalog.fixedCostByPassiveId?.[passiveId];
  if (typeof fixed !== 'number' || !Number.isInteger(fixed) || fixed < 1) {
    throw new Error(
      `operation passive "${passiveId}" has no valid fixedCostByPassiveId entry`,
    );
  }
  return fixed;
}

function resolvePassiveAcquireCostFailClosed(
  gameData: GameData,
  passiveId: string,
  sameClassAlreadyAcquiredCount: number,
): number {
  requireFixedPassiveCost(gameData, passiveId);
  return resolveOperationPassiveAcquireCost(
    gameData.operationPassiveCatalog,
    passiveId,
    sameClassAlreadyAcquiredCount,
  );
}

export function createDefaultProblemSeriesSimSlots(
  gameData: GameData,
  allowedClassIds: readonly ClassId[],
): ProblemSeriesSimSlotPlan[] {
  const party = createProblemSeriesInitialParty(allowedClassIds, gameData);
  if (party.length !== PARTY_SLOT_COUNT) {
    throw new Error(
      `default party must have ${PARTY_SLOT_COUNT} slots, got ${party.length}`,
    );
  }
  const slots: ProblemSeriesSimSlotPlan[] = [];
  for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
    const member = party[slotIndex];
    if (!member) {
      throw new Error(`default party slot ${slotIndex} is empty`);
    }
    const preset = gameData.classRegistry[member.classId];
    const defaultModuleId = preset?.combatModuleIds?.[0];
    if (!defaultModuleId) {
      throw new Error(
        `class "${member.classId}" has no default combatModuleIds[0]`,
      );
    }
    slots.push({
      classId: member.classId,
      initialCombatModuleId: defaultModuleId,
    });
  }
  return slots;
}

function validateAndNormalizeSlots(
  gameData: GameData,
  seriesAllowedClassIds: readonly ClassId[],
  slots: readonly ProblemSeriesSimSlotPlan[],
): ProblemSeriesSimSlotPlan[] {
  if (slots.length !== PARTY_SLOT_COUNT) {
    throw new Error(
      `problem series sim requires exactly ${PARTY_SLOT_COUNT} slots, got ${slots.length}`,
    );
  }

  const seriesAllowed = new Set(seriesAllowedClassIds);
  const seen = new Set<ClassId>();
  const normalized: ProblemSeriesSimSlotPlan[] = [];

  for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
    const slot = slots[slotIndex];
    if (!slot) {
      throw new Error(`missing slot plan at index ${slotIndex}`);
    }
    const { classId, initialCombatModuleId } = slot;
    if (!isAllowedSimClassId(classId)) {
      throw new Error(
        `class "${classId}" is outside problem-series sim target classes`,
      );
    }
    if (!seriesAllowed.has(classId)) {
      throw new Error(
        `class "${classId}" is not in series allowedClassIds`,
      );
    }
    if (seen.has(classId)) {
      throw new Error(`duplicate classId in slots: ${classId}`);
    }
    seen.add(classId);

    const preset = gameData.classRegistry[classId];
    if (!preset) {
      throw new Error(`unknown classId: ${classId}`);
    }
    if (
      !isValidSelectedCombatModuleId(
        preset,
        gameData.combatModuleRegistry,
        initialCombatModuleId,
      )
    ) {
      throw new Error(
        `combat module "${initialCombatModuleId}" is not in pool for class "${classId}"`,
      );
    }
    normalized.push({ classId, initialCombatModuleId });
  }

  return normalized;
}

function createPartyFromSlots(
  slots: readonly ProblemSeriesSimSlotPlan[],
  gameData: GameData,
): PartySlotState[] {
  return slots.map((slot) => createMemberFromClass(slot.classId, gameData));
}

interface PrepRuntime {
  unspentResource: number;
  moduleBySlot: string[];
  passivesBySlot: string[][];
  resourceLedger: ProblemSeriesSimWaveResourceLedger[];
}

function createPrepRuntime(
  slots: readonly ProblemSeriesSimSlotPlan[],
): PrepRuntime {
  return {
    unspentResource: 0,
    moduleBySlot: slots.map((slot) => slot.initialCombatModuleId),
    passivesBySlot: Array.from({ length: PARTY_SLOT_COUNT }, () => []),
    resourceLedger: [],
  };
}

/**
 * 到達有無に依存せず、入力された全 Wave 計画を fail-closed で検証する。
 * 仮 PrepRuntime のみを更新し、呼び出し側の実戦 runtime には触れない。
 */
function preflightAllWavePlans(options: {
  gameData: GameData;
  slots: readonly ProblemSeriesSimSlotPlan[];
  battleWaves: readonly ProblemSeriesBattleWave[];
  wavePlans: readonly (ProblemSeriesSimWavePlan | undefined)[] | undefined;
}): void {
  const { gameData, slots, battleWaves, wavePlans } = options;
  if (wavePlans !== undefined && wavePlans.length > battleWaves.length) {
    throw new Error(
      `wavePlans length ${wavePlans.length} exceeds battle wave count ${battleWaves.length}`,
    );
  }

  const preflightRuntime = createPrepRuntime(slots);
  for (let waveIndex = 0; waveIndex < battleWaves.length; waveIndex++) {
    applyWavePrepPlan({
      gameData,
      slots,
      waveIndex,
      battleWaves,
      wavePlan: wavePlans?.[waveIndex],
      runtime: preflightRuntime,
    });
  }
}

function applyWavePrepPlan(options: {
  gameData: GameData;
  slots: readonly ProblemSeriesSimSlotPlan[];
  waveIndex: number;
  battleWaves: readonly ProblemSeriesBattleWave[];
  wavePlan: ProblemSeriesSimWavePlan | undefined;
  runtime: PrepRuntime;
}): void {
  const { gameData, slots, waveIndex, battleWaves, wavePlan, runtime } = options;
  const wave = battleWaves[waveIndex];
  if (wave === undefined) {
    throw new Error(`battle wave missing at index ${waveIndex}`);
  }

  const grantAmount = wave.prepResourceGrant;
  if (
    typeof grantAmount !== 'number' ||
    !Number.isInteger(grantAmount) ||
    grantAmount < 0
  ) {
    throw new Error(
      `invalid prepResourceGrant at wave ${waveIndex}: ${String(grantAmount)}`,
    );
  }
  runtime.unspentResource += grantAmount;

  let spentAmount = 0;

  for (const change of wavePlan?.moduleChanges ?? []) {
    const { slotIndex, combatModuleId } = change;
    if (
      !Number.isInteger(slotIndex) ||
      slotIndex < 0 ||
      slotIndex >= PARTY_SLOT_COUNT
    ) {
      throw new Error(`invalid module change slotIndex: ${String(slotIndex)}`);
    }
    const classId = slots[slotIndex]!.classId;
    const preset = gameData.classRegistry[classId]!;
    if (
      !isValidSelectedCombatModuleId(
        preset,
        gameData.combatModuleRegistry,
        combatModuleId,
      )
    ) {
      throw new Error(
        `combat module "${combatModuleId}" is not in pool for class "${classId}" (wave ${waveIndex})`,
      );
    }
    runtime.moduleBySlot[slotIndex] = combatModuleId;
  }

  for (const acquire of wavePlan?.passiveAcquisitions ?? []) {
    const { slotIndex, passiveId } = acquire;
    if (
      !Number.isInteger(slotIndex) ||
      slotIndex < 0 ||
      slotIndex >= PARTY_SLOT_COUNT
    ) {
      throw new Error(`invalid passive acquire slotIndex: ${String(slotIndex)}`);
    }
    if (typeof passiveId !== 'string' || passiveId.trim().length === 0) {
      throw new Error(`invalid passiveId at wave ${waveIndex}`);
    }
    const classId = slots[slotIndex]!.classId;
    if (
      !isOperationPassiveCandidateForClass(
        gameData.operationPassiveCatalog,
        classId,
        passiveId,
      )
    ) {
      throw new Error(
        `passive "${passiveId}" is not an operation candidate for class "${classId}"`,
      );
    }
    if (!gameData.skillRegistry.passives[passiveId]) {
      throw new Error(`unknown operation passive id: ${passiveId}`);
    }
    const acquired = runtime.passivesBySlot[slotIndex]!;
    if (acquired.includes(passiveId)) {
      throw new Error(
        `passive "${passiveId}" already acquired on slot ${slotIndex}`,
      );
    }
    const cost = resolvePassiveAcquireCostFailClosed(
      gameData,
      passiveId,
      acquired.length,
    );
    if (runtime.unspentResource < cost) {
      throw new Error(
        `insufficient operation resource to acquire "${passiveId}" on slot ${slotIndex}: need ${cost}, have ${runtime.unspentResource}`,
      );
    }
    runtime.unspentResource -= cost;
    spentAmount += cost;
    acquired.push(passiveId);
  }

  runtime.resourceLedger.push({
    waveIndex,
    grantAmount,
    spentAmount,
    remainingResource: runtime.unspentResource,
  });
}

/**
 * 問題系列 A/B を同一形式で実行し、生の戦闘指標を返す。
 * 合否閾値・baseline 固定はしない。
 */
export function runProblemSeriesSim(
  input: ProblemSeriesSimInput,
): ProblemSeriesSimResult {
  if (
    typeof input.maxTicks !== 'number' ||
    !Number.isInteger(input.maxTicks) ||
    input.maxTicks < 1
  ) {
    throw new Error('maxTicks must be an integer >= 1');
  }

  const battleRngSeed = normalizeBattleRngSeed(input.battleRngSeed);
  const gameData = loadGameData();
  const catalog = gameData.problemSeriesCatalog;
  const resolved = resolveProblemSeriesFromSeed(
    catalog,
    input.problemSeriesSeed,
  );
  const battleWaves = toProblemSeriesBattleWaves(resolved.series);
  if (battleWaves.length !== 3) {
    throw new Error(
      `expected 3 battle waves, got ${battleWaves.length} for ${resolved.series.seriesId}`,
    );
  }

  const slots = validateAndNormalizeSlots(
    gameData,
    resolved.series.allowedClassIds,
    input.slots ??
      createDefaultProblemSeriesSimSlots(
        gameData,
        resolved.series.allowedClassIds,
      ),
  );

  // BattleEngine / Math.random 差し替えより前に、未到達分を含む全 Wave 計画を検証する。
  preflightAllWavePlans({
    gameData,
    slots,
    battleWaves,
    wavePlans: input.wavePlans,
  });

  const party = createPartyFromSlots(slots, gameData);

  // 実戦用 runtime。preflight の仮 runtime とは別インスタンス。
  const runtime = createPrepRuntime(slots);

  applyWavePrepPlan({
    gameData,
    slots,
    waveIndex: 0,
    battleWaves,
    wavePlan: input.wavePlans?.[0],
    runtime,
  });

  const stageDamageStats = new StageDamageStatsTracker();
  stageDamageStats.resetForStage(`problem-series:${resolved.series.seriesId}`);

  const waveTimelines: Array<{
    waveIndex: number;
    startTick: number;
    endTick: number;
    startSec: number;
    endSec: number;
    result: ProblemSeriesSimWaveResult | 'open';
  }> = [];

  const originalRandom = Math.random;
  const battleRng = createBattleRng(battleRngSeed);

  try {
    Math.random = battleRng;

    const engine = new BattleEngine(
      gameData,
      levelCurves,
      () => party,
      // 解決済み Wave provider が正本。仮 stageId / StageDef は作らない。
      () => '',
      {
        onDamageApplied: (actor, target, amount, meta) => {
          stageDamageStats.recordDamage(
            actor,
            target,
            amount,
            meta,
            engine.getBattleTimeSec(),
          );
        },
        onHealRecorded: (actor, _target, amount) => {
          stageDamageStats.recordHeal(actor, amount);
        },
        getSelectedCombatModuleId: (slotIndex) =>
          runtime.moduleBySlot[slotIndex],
        getAcquiredOperationPassiveIds: (slotIndex) =>
          runtime.passivesBySlot[slotIndex] ?? [],
        getResolvedWavesCombatInput: () => battleWaves,
      },
    );

    engine.startBattle();
    waveTimelines.push({
      waveIndex: 0,
      startTick: 0,
      endTick: 0,
      startSec: 0,
      endSec: 0,
      result: 'open',
    });

    let tickCount = 0;
    let phase = engine.getSnapshot().phase;
    let timedOut = false;

    while (tickCount < input.maxTicks) {
      engine.tick(TICK_DT);
      tickCount += 1;

      const snap = engine.getSnapshot();
      if (snap.awaitingNextWave) {
        const current = waveTimelines[waveTimelines.length - 1];
        if (current && current.result === 'open') {
          current.endTick = tickCount;
          current.endSec = tickCount * TICK_DT;
          current.result = 'cleared';
        }

        const nextWaveIndex = snap.waveIndex + 1;
        if (nextWaveIndex < 0 || nextWaveIndex >= battleWaves.length) {
          throw new Error(
            `invalid next wave index ${nextWaveIndex} (waveCount=${battleWaves.length})`,
          );
        }

        applyWavePrepPlan({
          gameData,
          slots,
          waveIndex: nextWaveIndex,
          battleWaves,
          wavePlan: input.wavePlans?.[nextWaveIndex],
          runtime,
        });

        const started = engine.startNextWave();
        if (!started) {
          throw new Error(
            `BattleEngine.startNextWave failed at waveIndex=${snap.waveIndex}`,
          );
        }

        waveTimelines.push({
          waveIndex: nextWaveIndex,
          startTick: tickCount,
          endTick: tickCount,
          startSec: tickCount * TICK_DT,
          endSec: tickCount * TICK_DT,
          result: 'open',
        });
      }

      phase = engine.getSnapshot().phase;
      if (phase === 'victory' || phase === 'defeat') {
        break;
      }
    }

    const finalSnap = engine.getSnapshot();
    phase = finalSnap.phase;

    if (phase !== 'victory' && phase !== 'defeat') {
      timedOut = true;
    }

    const openWave = waveTimelines[waveTimelines.length - 1];
    if (openWave && openWave.result === 'open') {
      openWave.endTick = tickCount;
      openWave.endSec = tickCount * TICK_DT;
      if (phase === 'victory') {
        openWave.result = 'cleared';
      } else if (phase === 'defeat') {
        openWave.result = 'defeat';
      } else {
        openWave.result = 'timeout';
      }
    }

    const outcome: ProblemSeriesSimBattleOutcome =
      phase === 'victory'
        ? 'victory'
        : phase === 'defeat'
          ? 'defeat'
          : 'timeout';

    const alliesAlive = finalSnap.allies.filter((ally) => ally.hp > 0);
    const displayRows = stageDamageStats.getDisplayRows(
      party,
      gameData.classRegistry,
    );
    const slotStats: ProblemSeriesSimSlotMetrics[] = [];
    for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
      const classId = slots[slotIndex]!.classId;
      const row = displayRows.find((entry) => entry.slotIndex === slotIndex);
      slotStats.push({
        slotIndex,
        classId,
        damageDealt: assertFiniteNumber(row?.damageDealt ?? 0, `slot${slotIndex}.damageDealt`),
        damageTaken: assertFiniteNumber(row?.damageTaken ?? 0, `slot${slotIndex}.damageTaken`),
        healingDealt: assertFiniteNumber(
          row?.healingDealt ?? 0,
          `slot${slotIndex}.healingDealt`,
        ),
      });
    }

    const waves: ProblemSeriesSimWaveTimeline[] = waveTimelines.map((wave) => {
      if (wave.result === 'open') {
        throw new Error(`wave ${wave.waveIndex} timeline left open`);
      }
      return {
        waveIndex: wave.waveIndex,
        startTick: assertFiniteNumber(wave.startTick, 'wave.startTick'),
        endTick: assertFiniteNumber(wave.endTick, 'wave.endTick'),
        startSec: assertFiniteNumber(wave.startSec, 'wave.startSec'),
        endSec: assertFiniteNumber(wave.endSec, 'wave.endSec'),
        result: wave.result,
      };
    });

    return {
      problemSeriesSeed: resolved.seed,
      generatorVersion: resolved.generatorVersion,
      seriesId: resolved.series.seriesId,
      battleRngSeed,
      outcome,
      finalWaveIndex: finalSnap.waveIndex,
      tickCount,
      durationSec: tickCount * TICK_DT,
      waves,
      survivingAllies: alliesAlive.length,
      survivingEnemies: finalSnap.enemies.filter((enemy) => enemy.hp > 0).length,
      totalRemainingAllyHp: alliesAlive.reduce((sum, ally) => sum + ally.hp, 0),
      totalMaxAllyHp: finalSnap.allies.reduce((sum, ally) => sum + ally.maxHp, 0),
      totalRemainingEnemyHp: finalSnap.enemies.reduce(
        (sum, enemy) => sum + Math.max(0, enemy.hp),
        0,
      ),
      slotStats,
      appliedCombatModuleIdBySlot: [...runtime.moduleBySlot],
      acquiredPassivesBySlot: runtime.passivesBySlot.map((ids) => [...ids]),
      resourceLedger: runtime.resourceLedger.map((entry) => ({ ...entry })),
      timedOut,
      enemyWaveInputs: battleWaves.map((wave) => ({
        prepResourceGrant: wave.prepResourceGrant,
        enemyGroups: wave.enemyGroups.map((group) => ({ ...group })),
      })),
    };
  } finally {
    Math.random = originalRandom;
  }
}

/** 正規化済み結果の決定論比較用（入力エコーを含む構造全体）。 */
export function normalizeProblemSeriesSimResultForCompare(
  result: ProblemSeriesSimResult,
): string {
  return JSON.stringify(result);
}
