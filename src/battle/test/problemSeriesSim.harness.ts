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
  type ProblemSeriesBattleEnemyGroup,
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

/** test-only。解決済み Wave を BattleEngine 投入前に差し替える文脈。 */
export interface ProblemSeriesSimResolvedWaveTransformContext {
  readonly seriesId: string;
  readonly problemSeriesSeed: string;
  readonly generatorVersion: string;
}

/**
 * test-only。`toProblemSeriesBattleWaves` 直後の解決済み Wave を返す。
 * 未指定時は production 経路（変換なし）のまま。
 */
export type ProblemSeriesSimResolvedWaveTransform = (
  waves: readonly ProblemSeriesBattleWave[],
  context: ProblemSeriesSimResolvedWaveTransformContext,
) => ProblemSeriesBattleWave[];

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
  /**
   * test-only。指定時のみ解決済み Wave を差し替える。
   * 省略時は production の `toProblemSeriesBattleWaves` 結果をそのまま使う。
   */
  readonly transformResolvedBattleWaves?: ProblemSeriesSimResolvedWaveTransform;
  /**
   * test-only。最終 snapshot から不変な生存敵診断だけを受け取る任意 callback。
   * 省略時は呼ばれず、戻り値・正規化・production 相当経路は変えない。
   * `ProblemSeriesSimResult` / baseline JSON には含めない。
   */
  readonly onFinalEnemyDiagnostic?: ProblemSeriesSimOnFinalEnemyDiagnostic;
  /**
   * test-only。`onDamageApplied` 内から read-only 診断値だけを通知する。
   * 可変 `CombatantState` は外へ渡さない。省略時は未呼び出し・Result 不変。
   */
  readonly onCombatFlowDamage?: ProblemSeriesSimOnCombatFlowDamage;
  /**
   * test-only。`onHealRecorded` 内から read-only 診断値だけを通知する。
   * skillId 等の現行 callback に無い項目は推測しない。省略時は Result 不変。
   */
  readonly onCombatFlowHeal?: ProblemSeriesSimOnCombatFlowHeal;
  /**
   * test-only。各 `engine.tick` 後の snapshot から、alive 単位の不変コピーだけを通知する。
   * production snapshot / 可変配列自体は外へ渡さない。省略時は Result 不変。
   */
  readonly onTickStateDiagnostic?: ProblemSeriesSimOnTickStateDiagnostic;
  /**
   * test-only。`onCombatActionExecuted` から read-only 診断値だけを通知する。
   * 既存 damage/heal / StageDamageStats / Result は置換しない。省略時は Result 不変。
   */
  readonly onCombatActionDiagnostic?: ProblemSeriesSimOnCombatActionDiagnostic;
}

/** test-only。最終 snapshot 上の生存敵 1 体分（推測フィールドなし）。 */
export interface ProblemSeriesSimSurvivingEnemyDiagnostic {
  readonly id: string;
  readonly name: string;
  readonly classId: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly baseMaxHp: number;
  readonly barrierHp: number;
  readonly atk: number;
  readonly def: number;
  readonly res: number;
  readonly basicSkillId: string;
}

/**
 * test-only。最終 snapshot + 対応 Wave 入力の診断値。
 * Result / baseline を汚染しない外付け口。
 */
export interface ProblemSeriesSimFinalEnemyDiagnostic {
  readonly finalWaveIndex: number;
  readonly phase: string;
  readonly outcome: ProblemSeriesSimBattleOutcome;
  readonly survivingEnemies: readonly ProblemSeriesSimSurvivingEnemyDiagnostic[];
  readonly finalWaveEnemyInputs: ProblemSeriesBattleWave;
}

export type ProblemSeriesSimOnFinalEnemyDiagnostic = (
  diagnostic: ProblemSeriesSimFinalEnemyDiagnostic,
) => void;

/** test-only。combat-flow 診断用の単位スナップ（CombatantState 非共有）。 */
export interface ProblemSeriesSimCombatFlowUnitDiagnostic {
  readonly id: string;
  readonly classId: string;
  readonly isEnemy: boolean;
  /** 味方かつ取得可能なときのみ。 */
  readonly partySlotIndex?: number;
}

/** test-only。damage 適用時の不変診断イベント。 */
export interface ProblemSeriesSimCombatFlowDamageEvent {
  readonly waveIndex: number;
  readonly battleTimeSec: number;
  readonly actor: ProblemSeriesSimCombatFlowUnitDiagnostic;
  readonly target: ProblemSeriesSimCombatFlowUnitDiagnostic;
  readonly amount: number;
  readonly hpDamage: number;
  readonly barrierDamage: number;
  readonly lethal: boolean;
  readonly sourceKind: string;
  readonly skillId: string;
  readonly slotKind: string;
}

/** test-only。heal 記録時の不変診断イベント（現行 callback 供給値のみ）。 */
export interface ProblemSeriesSimCombatFlowHealEvent {
  readonly waveIndex: number;
  readonly battleTimeSec: number;
  readonly actor: ProblemSeriesSimCombatFlowUnitDiagnostic;
  readonly target: ProblemSeriesSimCombatFlowUnitDiagnostic;
  readonly amount: number;
}

export type ProblemSeriesSimOnCombatFlowDamage = (
  event: ProblemSeriesSimCombatFlowDamageEvent,
) => void;

export type ProblemSeriesSimOnCombatFlowHeal = (
  event: ProblemSeriesSimCombatFlowHealEvent,
) => void;

/** test-only。tick 診断用の alive 単位（snapshot 供給値の不変コピー）。 */
export interface ProblemSeriesSimTickAliveUnitDiagnostic {
  readonly id: string;
  readonly classId: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly barrierHp: number;
  readonly atk: number;
  readonly battleX: number;
  readonly effectiveRangePx: number;
  readonly bodyAnimMarching: boolean;
  readonly basicSkillId: string;
  /** 味方のみ。 */
  readonly partySlotIndex?: number;
  /** 味方のみ。snapshot に存在する場合。 */
  readonly useLocked?: boolean;
}

/** test-only。各 tick 後の状態診断（可変 snapshot 非共有）。 */
export interface ProblemSeriesSimTickStateDiagnostic {
  readonly waveIndex: number;
  readonly battleTimeSec: number;
  readonly phase: string;
  readonly runtimePhase: string;
  readonly engaged: boolean;
  readonly allies: readonly ProblemSeriesSimTickAliveUnitDiagnostic[];
  readonly enemies: readonly ProblemSeriesSimTickAliveUnitDiagnostic[];
  /**
   * 味方 slot ごとの runtime 取得 passive ID 列。
   * `runtime.passivesBySlot` の可変配列は共有しない（取得順・重複・slot 対応を維持したコピー）。
   * 敵 unit には付けない。
   */
  readonly acquiredPassivesBySlot: readonly (readonly string[])[];
}

/** test-only。戦闘アクション実行時の不変診断。 */
export interface ProblemSeriesSimCombatActionDiagnostic {
  readonly waveIndex: number;
  readonly battleTimeSec: number;
  readonly actor: {
    readonly id: string;
    readonly classId: string;
    readonly isEnemy: boolean;
    readonly partySlotIndex?: number;
    readonly hp: number;
    readonly battleX: number;
  };
  readonly slotKind: string;
  readonly skillId: string;
}

export type ProblemSeriesSimOnTickStateDiagnostic = (
  state: ProblemSeriesSimTickStateDiagnostic,
) => void;

export type ProblemSeriesSimOnCombatActionDiagnostic = (
  event: ProblemSeriesSimCombatActionDiagnostic,
) => void;

/** R12n 1F — 系列A Wave2 鉄衛士 hpScale 感度の対象境界（test-only）。 */
export const SERIES_A_WAVE2_GUARDIAN_HP_SCALE_TARGET = {
  seriesId: 'r12m_series_a',
  waveIndex: 1,
  classId: 'df_guardian' as const,
  expectedGuardianGroupCount: 2,
} as const;

/** R12n 1J — 系列A Wave3 魔術師 atkScale 感度の対象境界（test-only）。 */
export const SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET = {
  seriesId: 'r12m_series_a',
  waveIndex: 2,
  classId: 'at_sorcerer' as const,
  expectedSorcererGroupCount: 1,
  expectedCount: 1,
} as const;

function cloneProblemSeriesBattleWaves(
  waves: readonly ProblemSeriesBattleWave[],
): ProblemSeriesBattleWave[] {
  return waves.map((wave) => ({
    prepResourceGrant: wave.prepResourceGrant,
    enemyGroups: wave.enemyGroups.map((group) => ({ ...group })),
  }));
}

/**
 * test-only。系列 A Wave 2（index 1）の `df_guardian` 2 group の `hpScale` だけを差し替える。
 * `hpScale === 1` は production 相当（プロパティ省略）へ戻す。
 * 対象外 series / 人数不一致は fail-closed。
 */
export function createSeriesAWave2GuardianHpScaleTransform(
  hpScale: number,
): ProblemSeriesSimResolvedWaveTransform {
  if (!Number.isFinite(hpScale) || hpScale <= 0) {
    throw new Error(
      `series A Wave2 guardian hpScale must be a finite number > 0, got ${String(hpScale)}`,
    );
  }
  return (waves, context) => {
    if (context.seriesId !== SERIES_A_WAVE2_GUARDIAN_HP_SCALE_TARGET.seriesId) {
      throw new Error(
        `createSeriesAWave2GuardianHpScaleTransform refuses seriesId "${context.seriesId}"`,
      );
    }
    if (waves.length !== 3) {
      throw new Error(
        `expected 3 resolved waves for series A hpScale transform, got ${waves.length}`,
      );
    }
    const cloned = cloneProblemSeriesBattleWaves(waves);
    const waveIndex = SERIES_A_WAVE2_GUARDIAN_HP_SCALE_TARGET.waveIndex;
    const wave = cloned[waveIndex];
    if (wave === undefined) {
      throw new Error(`missing resolved wave at index ${waveIndex}`);
    }
    let touchedGuardians = 0;
    wave.enemyGroups = wave.enemyGroups.map((group) => {
      if (group.classId !== SERIES_A_WAVE2_GUARDIAN_HP_SCALE_TARGET.classId) {
        return group;
      }
      touchedGuardians += 1;
      const next: ProblemSeriesBattleEnemyGroup = { ...group };
      if (hpScale === 1) {
        delete next.hpScale;
      } else {
        next.hpScale = hpScale;
      }
      return next;
    });
    if (
      touchedGuardians !==
      SERIES_A_WAVE2_GUARDIAN_HP_SCALE_TARGET.expectedGuardianGroupCount
    ) {
      throw new Error(
        `expected ${SERIES_A_WAVE2_GUARDIAN_HP_SCALE_TARGET.expectedGuardianGroupCount} ` +
          `df_guardian groups on Wave ${waveIndex}, touched ${touchedGuardians}`,
      );
    }
    return cloned;
  };
}

/**
 * test-only。系列 A Wave 3（index 2）の `at_sorcerer` 1 group の `atkScale` だけを差し替える。
 * `atkScale === 1` は production 相当（プロパティ省略）へ戻す。
 * 対象外 series / group 欠落・重複 / count 不一致は fail-closed。
 */
export function createSeriesAWave3SorcererAtkScaleTransform(
  atkScale: number,
): ProblemSeriesSimResolvedWaveTransform {
  if (!Number.isFinite(atkScale) || atkScale <= 0) {
    throw new Error(
      `series A Wave3 sorcerer atkScale must be a finite number > 0, got ${String(atkScale)}`,
    );
  }
  return (waves, context) => {
    if (context.seriesId !== SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.seriesId) {
      throw new Error(
        `createSeriesAWave3SorcererAtkScaleTransform refuses seriesId "${context.seriesId}"`,
      );
    }
    if (waves.length !== 3) {
      throw new Error(
        `expected 3 resolved waves for series A atkScale transform, got ${waves.length}`,
      );
    }
    const cloned = cloneProblemSeriesBattleWaves(waves);
    const waveIndex = SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.waveIndex;
    const wave = cloned[waveIndex];
    if (wave === undefined) {
      throw new Error(`missing resolved wave at index ${waveIndex}`);
    }
    let touchedSorcerers = 0;
    wave.enemyGroups = wave.enemyGroups.map((group) => {
      if (group.classId !== SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.classId) {
        return group;
      }
      touchedSorcerers += 1;
      if (group.count !== SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.expectedCount) {
        throw new Error(
          `expected at_sorcerer count ${SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.expectedCount} ` +
            `on Wave ${waveIndex}, got ${group.count}`,
        );
      }
      const next: ProblemSeriesBattleEnemyGroup = { ...group };
      if (atkScale === 1) {
        delete next.atkScale;
      } else {
        next.atkScale = atkScale;
      }
      return next;
    });
    if (
      touchedSorcerers !==
      SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.expectedSorcererGroupCount
    ) {
      throw new Error(
        `expected ${SERIES_A_WAVE3_SORCERER_ATK_SCALE_TARGET.expectedSorcererGroupCount} ` +
          `at_sorcerer groups on Wave ${waveIndex}, touched ${touchedSorcerers}`,
      );
    }
    return cloned;
  };
}

/** R12n 1N — 系列B Wave2 chain 魔術師 atkScale 感度の対象境界（test-only）。 */
export const SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET = {
  seriesId: 'r12m_series_b',
  problemSeriesSeed: 'fixture-b',
  generatorVersion: 'r12m-v1',
  waveIndex: 1,
  classId: 'at_sorcerer' as const,
  selectedCombatModuleId: 'at_sorcerer_mod_chain',
  expectedSorcererGroupCount: 1,
  expectedCount: 1,
} as const;

/**
 * test-only。系列 B Wave 2（index 1）の `at_sorcerer_mod_chain` 1 group の `atkScale` だけを差し替える。
 * `atkScale === 1` は production 相当（プロパティ省略）へ戻す。
 * identity 不一致 / 対象欠落・重複 / 非有限・0以下は fail-closed。
 */
export function createSeriesBWave2SorcererAtkScaleTransform(
  atkScale: number,
): ProblemSeriesSimResolvedWaveTransform {
  if (!Number.isFinite(atkScale) || atkScale <= 0) {
    throw new Error(
      `series B Wave2 sorcerer atkScale must be a finite number > 0, got ${String(atkScale)}`,
    );
  }
  return (waves, context) => {
    if (context.seriesId !== SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.seriesId) {
      throw new Error(
        `createSeriesBWave2SorcererAtkScaleTransform refuses seriesId "${context.seriesId}"`,
      );
    }
    if (
      context.problemSeriesSeed !==
      SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.problemSeriesSeed
    ) {
      throw new Error(
        `createSeriesBWave2SorcererAtkScaleTransform refuses problemSeriesSeed "${context.problemSeriesSeed}"`,
      );
    }
    if (
      context.generatorVersion !==
      SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.generatorVersion
    ) {
      throw new Error(
        `createSeriesBWave2SorcererAtkScaleTransform refuses generatorVersion "${context.generatorVersion}"`,
      );
    }
    if (waves.length !== 3) {
      throw new Error(
        `expected 3 resolved waves for series B atkScale transform, got ${waves.length}`,
      );
    }
    const cloned = cloneProblemSeriesBattleWaves(waves);
    const waveIndex = SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.waveIndex;
    const wave = cloned[waveIndex];
    if (wave === undefined) {
      throw new Error(`missing resolved wave at index ${waveIndex}`);
    }
    let touchedSorcerers = 0;
    wave.enemyGroups = wave.enemyGroups.map((group) => {
      if (
        group.classId !== SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.classId ||
        group.selectedCombatModuleId !==
          SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.selectedCombatModuleId
      ) {
        return group;
      }
      touchedSorcerers += 1;
      if (group.count !== SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.expectedCount) {
        throw new Error(
          `expected at_sorcerer count ${SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.expectedCount} ` +
            `on Wave ${waveIndex}, got ${group.count}`,
        );
      }
      const next: ProblemSeriesBattleEnemyGroup = { ...group };
      if (atkScale === 1) {
        delete next.atkScale;
      } else {
        next.atkScale = atkScale;
      }
      return next;
    });
    if (
      touchedSorcerers !==
      SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.expectedSorcererGroupCount
    ) {
      throw new Error(
        `expected ${SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.expectedSorcererGroupCount} ` +
          `at_sorcerer_mod_chain groups on Wave ${waveIndex}, touched ${touchedSorcerers}`,
      );
    }
    return cloned;
  };
}

/** R12n 1O — 系列B Wave2 pierce 剣術士 atkScale 感度の対象境界（test-only）。 */
export const SERIES_B_WAVE2_SWORDSMAN_ATK_SCALE_TARGET = {
  seriesId: 'r12m_series_b',
  problemSeriesSeed: 'fixture-b',
  generatorVersion: 'r12m-v1',
  waveIndex: 1,
  classId: 'at_swordsman' as const,
  selectedCombatModuleId: 'at_swordsman_mod_pierce_slash',
  expectedSwordsmanGroupCount: 1,
  expectedCount: 1,
} as const;

/**
 * test-only。系列 B Wave 2（index 1）の `at_swordsman_mod_pierce_slash` 1 group の `atkScale` だけを差し替える。
 * `atkScale === 1` は production 相当（プロパティ省略）へ戻す。
 * identity 不一致 / 対象欠落・重複 / 非有限・0以下は fail-closed。
 */
export function createSeriesBWave2SwordsmanAtkScaleTransform(
  atkScale: number,
): ProblemSeriesSimResolvedWaveTransform {
  if (!Number.isFinite(atkScale) || atkScale <= 0) {
    throw new Error(
      `series B Wave2 swordsman atkScale must be a finite number > 0, got ${String(atkScale)}`,
    );
  }
  return (waves, context) => {
    if (context.seriesId !== SERIES_B_WAVE2_SWORDSMAN_ATK_SCALE_TARGET.seriesId) {
      throw new Error(
        `createSeriesBWave2SwordsmanAtkScaleTransform refuses seriesId "${context.seriesId}"`,
      );
    }
    if (
      context.problemSeriesSeed !==
      SERIES_B_WAVE2_SWORDSMAN_ATK_SCALE_TARGET.problemSeriesSeed
    ) {
      throw new Error(
        `createSeriesBWave2SwordsmanAtkScaleTransform refuses problemSeriesSeed "${context.problemSeriesSeed}"`,
      );
    }
    if (
      context.generatorVersion !==
      SERIES_B_WAVE2_SWORDSMAN_ATK_SCALE_TARGET.generatorVersion
    ) {
      throw new Error(
        `createSeriesBWave2SwordsmanAtkScaleTransform refuses generatorVersion "${context.generatorVersion}"`,
      );
    }
    if (waves.length !== 3) {
      throw new Error(
        `expected 3 resolved waves for series B swordsman atkScale transform, got ${waves.length}`,
      );
    }
    const cloned = cloneProblemSeriesBattleWaves(waves);
    const waveIndex = SERIES_B_WAVE2_SWORDSMAN_ATK_SCALE_TARGET.waveIndex;
    const wave = cloned[waveIndex];
    if (wave === undefined) {
      throw new Error(`missing resolved wave at index ${waveIndex}`);
    }
    let touchedSwordsmen = 0;
    wave.enemyGroups = wave.enemyGroups.map((group) => {
      if (
        group.classId !== SERIES_B_WAVE2_SWORDSMAN_ATK_SCALE_TARGET.classId ||
        group.selectedCombatModuleId !==
          SERIES_B_WAVE2_SWORDSMAN_ATK_SCALE_TARGET.selectedCombatModuleId
      ) {
        return group;
      }
      touchedSwordsmen += 1;
      if (group.count !== SERIES_B_WAVE2_SWORDSMAN_ATK_SCALE_TARGET.expectedCount) {
        throw new Error(
          `expected at_swordsman count ${SERIES_B_WAVE2_SWORDSMAN_ATK_SCALE_TARGET.expectedCount} ` +
            `on Wave ${waveIndex}, got ${group.count}`,
        );
      }
      const next: ProblemSeriesBattleEnemyGroup = { ...group };
      if (atkScale === 1) {
        delete next.atkScale;
      } else {
        next.atkScale = atkScale;
      }
      return next;
    });
    if (
      touchedSwordsmen !==
      SERIES_B_WAVE2_SWORDSMAN_ATK_SCALE_TARGET.expectedSwordsmanGroupCount
    ) {
      throw new Error(
        `expected ${SERIES_B_WAVE2_SWORDSMAN_ATK_SCALE_TARGET.expectedSwordsmanGroupCount} ` +
          `at_swordsman_mod_pierce_slash groups on Wave ${waveIndex}, touched ${touchedSwordsmen}`,
      );
    }
    return cloned;
  };
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

/** test-only。可変 CombatantState を共有せず、診断用の浅い不変コピーを作る。 */
function toCombatFlowUnitDiagnostic(
  unit: {
    id: string;
    classId?: string;
    isEnemy: boolean;
    partySlotIndex?: number;
  },
): ProblemSeriesSimCombatFlowUnitDiagnostic {
  const base: ProblemSeriesSimCombatFlowUnitDiagnostic = {
    id: unit.id,
    classId: unit.classId ?? '',
    isEnemy: unit.isEnemy,
  };
  if (!unit.isEnemy && typeof unit.partySlotIndex === 'number') {
    return { ...base, partySlotIndex: unit.partySlotIndex };
  }
  return base;
}

/** test-only。alive snapshot 単位の不変コピー。 */
function toTickAliveUnitDiagnostic(unit: {
  id: string;
  classId?: string;
  hp: number;
  maxHp: number;
  barrierHp: number;
  atk: number;
  battleX: number;
  effectiveRangePx: number;
  bodyAnimMarching: boolean;
  basicSkillId?: string;
  isEnemy: boolean;
  partySlotIndex?: number;
  useLocked?: boolean;
}): ProblemSeriesSimTickAliveUnitDiagnostic {
  const base: ProblemSeriesSimTickAliveUnitDiagnostic = {
    id: unit.id,
    classId: unit.classId ?? '',
    hp: assertFiniteNumber(unit.hp, 'tickAlive.hp'),
    maxHp: assertFiniteNumber(unit.maxHp, 'tickAlive.maxHp'),
    barrierHp: assertFiniteNumber(unit.barrierHp, 'tickAlive.barrierHp'),
    atk: assertFiniteNumber(unit.atk, 'tickAlive.atk'),
    battleX: assertFiniteNumber(unit.battleX, 'tickAlive.battleX'),
    effectiveRangePx: assertFiniteNumber(
      unit.effectiveRangePx,
      'tickAlive.effectiveRangePx',
    ),
    bodyAnimMarching: unit.bodyAnimMarching === true,
    basicSkillId: unit.basicSkillId ?? '',
  };
  if (unit.isEnemy) {
    return base;
  }
  const ally: ProblemSeriesSimTickAliveUnitDiagnostic = {
    ...base,
    ...(typeof unit.partySlotIndex === 'number'
      ? { partySlotIndex: unit.partySlotIndex }
      : {}),
    ...(typeof unit.useLocked === 'boolean' ? { useLocked: unit.useLocked } : {}),
  };
  return ally;
}

/**
 * test-only。runtime.passivesBySlot の可変配列を共有しないコピー。
 * slot 欠落・長さ不正・非配列は空列へ正規化せず fail-closed。
 * positional 配列のため「重複 slot」は表現不能。passive ID 重複は取得履歴として維持する。
 */
export function copyAcquiredPassivesBySlotForTickDiagnostic(
  passivesBySlot: readonly (readonly string[])[],
): readonly (readonly string[])[] {
  if (passivesBySlot.length !== PARTY_SLOT_COUNT) {
    throw new Error(
      `acquiredPassivesBySlot tick diagnostic requires exactly ${PARTY_SLOT_COUNT} slots, got ${passivesBySlot.length}`,
    );
  }
  const copied: string[][] = [];
  for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
    const slotPresent = Object.prototype.hasOwnProperty.call(
      passivesBySlot,
      slotIndex,
    );
    const slot = slotPresent ? passivesBySlot[slotIndex] : undefined;
    if (!slotPresent || slot === undefined) {
      throw new Error(
        `acquiredPassivesBySlot tick diagnostic missing slot at index ${slotIndex}`,
      );
    }
    if (!Array.isArray(slot)) {
      throw new Error(
        `acquiredPassivesBySlot tick diagnostic slot ${slotIndex} must be an array, got ${String(slot)}`,
      );
    }
    copied.push([...slot]);
  }
  return copied;
}

function toTickStateDiagnostic(
  snap: {
    waveIndex: number;
    phase: string;
    runtimePhase: string;
    engaged: boolean;
    allies: readonly {
      id: string;
      classId?: string;
      hp: number;
      maxHp: number;
      barrierHp: number;
      atk: number;
      battleX: number;
      effectiveRangePx: number;
      bodyAnimMarching: boolean;
      basicSkillId?: string;
      isEnemy: boolean;
      partySlotIndex?: number;
      useLocked?: boolean;
    }[];
    enemies: readonly {
      id: string;
      classId?: string;
      hp: number;
      maxHp: number;
      barrierHp: number;
      atk: number;
      battleX: number;
      effectiveRangePx: number;
      bodyAnimMarching: boolean;
      basicSkillId?: string;
      isEnemy: boolean;
      partySlotIndex?: number;
      useLocked?: boolean;
    }[];
  },
  battleTimeSec: number,
  passivesBySlot: readonly (readonly string[])[],
): ProblemSeriesSimTickStateDiagnostic {
  return {
    waveIndex: assertFiniteNumber(snap.waveIndex, 'tickState.waveIndex'),
    battleTimeSec: assertFiniteNumber(battleTimeSec, 'tickState.battleTimeSec'),
    phase: String(snap.phase),
    runtimePhase: String(snap.runtimePhase),
    engaged: snap.engaged === true,
    allies: snap.allies
      .filter((unit) => unit.hp > 0)
      .map((unit) => toTickAliveUnitDiagnostic(unit)),
    enemies: snap.enemies
      .filter((unit) => unit.hp > 0)
      .map((unit) => toTickAliveUnitDiagnostic(unit)),
    // 味方 slot 列のみ。敵 snapshot には付けない。
    acquiredPassivesBySlot:
      copyAcquiredPassivesBySlotForTickDiagnostic(passivesBySlot),
  };
}

function toCombatActionDiagnostic(
  actor: {
    id: string;
    classId?: string;
    isEnemy: boolean;
    partySlotIndex?: number;
    hp: number;
    battleX: number;
  },
  info: { slotKind: string; skillId: string },
  waveIndex: number,
  battleTimeSec: number,
): ProblemSeriesSimCombatActionDiagnostic {
  const actorCopy: ProblemSeriesSimCombatActionDiagnostic['actor'] = {
    id: actor.id,
    classId: actor.classId ?? '',
    isEnemy: actor.isEnemy,
    hp: assertFiniteNumber(actor.hp, 'combatAction.actor.hp'),
    battleX: assertFiniteNumber(actor.battleX, 'combatAction.actor.battleX'),
  };
  if (!actor.isEnemy && typeof actor.partySlotIndex === 'number') {
    return {
      waveIndex: assertFiniteNumber(waveIndex, 'combatAction.waveIndex'),
      battleTimeSec: assertFiniteNumber(
        battleTimeSec,
        'combatAction.battleTimeSec',
      ),
      actor: { ...actorCopy, partySlotIndex: actor.partySlotIndex },
      slotKind: String(info.slotKind),
      skillId: String(info.skillId),
    };
  }
  return {
    waveIndex: assertFiniteNumber(waveIndex, 'combatAction.waveIndex'),
    battleTimeSec: assertFiniteNumber(
      battleTimeSec,
      'combatAction.battleTimeSec',
    ),
    actor: actorCopy,
    slotKind: String(info.slotKind),
    skillId: String(info.skillId),
  };
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
  const productionBattleWaves = toProblemSeriesBattleWaves(resolved.series);
  if (productionBattleWaves.length !== 3) {
    throw new Error(
      `expected 3 battle waves, got ${productionBattleWaves.length} for ${resolved.series.seriesId}`,
    );
  }

  const battleWaves =
    input.transformResolvedBattleWaves === undefined
      ? productionBattleWaves
      : input.transformResolvedBattleWaves(productionBattleWaves, {
          seriesId: resolved.series.seriesId,
          problemSeriesSeed: resolved.seed,
          generatorVersion: resolved.generatorVersion,
        });
  if (battleWaves.length !== 3) {
    throw new Error(
      `expected 3 battle waves after transform, got ${battleWaves.length} for ${resolved.series.seriesId}`,
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
          if (input.onCombatFlowDamage !== undefined) {
            if (meta?.event === undefined) {
              throw new Error(
                'combat-flow damage diagnostic requires meta.event; refusing empty success',
              );
            }
            const event = meta.event;
            const snap = engine.getSnapshot();
            input.onCombatFlowDamage({
              waveIndex: snap.waveIndex,
              battleTimeSec: assertFiniteNumber(
                engine.getBattleTimeSec(),
                'combatFlow.battleTimeSec',
              ),
              actor: toCombatFlowUnitDiagnostic(actor),
              target: toCombatFlowUnitDiagnostic(target),
              amount: assertFiniteNumber(amount, 'combatFlow.amount'),
              hpDamage: assertFiniteNumber(event.hpDamage, 'combatFlow.hpDamage'),
              barrierDamage: assertFiniteNumber(
                event.barrierDamage,
                'combatFlow.barrierDamage',
              ),
              lethal: event.lethal === true,
              sourceKind: String(event.sourceKind),
              skillId: typeof event.skillId === 'string' ? event.skillId : '',
              slotKind:
                typeof event.slotKind === 'string' ? event.slotKind : '',
            });
          }
        },
        onHealRecorded: (actor, target, amount) => {
          stageDamageStats.recordHeal(actor, amount);
          if (input.onCombatFlowHeal !== undefined) {
            const snap = engine.getSnapshot();
            input.onCombatFlowHeal({
              waveIndex: snap.waveIndex,
              battleTimeSec: assertFiniteNumber(
                engine.getBattleTimeSec(),
                'combatFlowHeal.battleTimeSec',
              ),
              actor: toCombatFlowUnitDiagnostic(actor),
              target: toCombatFlowUnitDiagnostic(target),
              amount: assertFiniteNumber(amount, 'combatFlowHeal.amount'),
            });
          }
        },
        onCombatActionExecuted: (actor, info) => {
          if (input.onCombatActionDiagnostic === undefined) {
            return;
          }
          const snap = engine.getSnapshot();
          input.onCombatActionDiagnostic(
            toCombatActionDiagnostic(
              actor,
              info,
              snap.waveIndex,
              engine.getBattleTimeSec(),
            ),
          );
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
      if (input.onTickStateDiagnostic !== undefined) {
        input.onTickStateDiagnostic(
          toTickStateDiagnostic(
            snap,
            engine.getBattleTimeSec(),
            runtime.passivesBySlot,
          ),
        );
      }
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

    const survivingEnemySnapshots = finalSnap.enemies.filter(
      (enemy) => enemy.hp > 0,
    );
    const enemyWaveInputs = battleWaves.map((wave) => ({
      prepResourceGrant: wave.prepResourceGrant,
      enemyGroups: wave.enemyGroups.map((group) => ({ ...group })),
    }));

    // test-only 診断口。省略時は未到達・未呼び出しのまま Result を変えない。
    if (input.onFinalEnemyDiagnostic !== undefined) {
      const finalWave = enemyWaveInputs[finalSnap.waveIndex];
      if (finalWave === undefined) {
        throw new Error(
          `missing enemyWaveInputs for finalWaveIndex=${finalSnap.waveIndex}`,
        );
      }
      const survivingEnemies: ProblemSeriesSimSurvivingEnemyDiagnostic[] =
        survivingEnemySnapshots.map((enemy) => ({
          id: enemy.id,
          name: enemy.name,
          // snapshot 供給値のみ。無い項目は推測補完せず空文字（呼び出し側で fail-closed）。
          classId: enemy.classId ?? '',
          hp: assertFiniteNumber(enemy.hp, 'survivor.hp'),
          maxHp: assertFiniteNumber(enemy.maxHp, 'survivor.maxHp'),
          baseMaxHp: assertFiniteNumber(enemy.baseMaxHp, 'survivor.baseMaxHp'),
          barrierHp: assertFiniteNumber(enemy.barrierHp, 'survivor.barrierHp'),
          atk: assertFiniteNumber(enemy.atk, 'survivor.atk'),
          def: assertFiniteNumber(enemy.def, 'survivor.def'),
          res: assertFiniteNumber(enemy.res, 'survivor.res'),
          basicSkillId: enemy.basicSkillId ?? '',
        }));
      input.onFinalEnemyDiagnostic({
        finalWaveIndex: finalSnap.waveIndex,
        phase: String(phase),
        outcome,
        survivingEnemies,
        finalWaveEnemyInputs: {
          prepResourceGrant: finalWave.prepResourceGrant,
          enemyGroups: finalWave.enemyGroups.map((group) => ({ ...group })),
        },
      });
    }

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
      survivingEnemies: survivingEnemySnapshots.length,
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
      enemyWaveInputs,
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
