/**
 * R12n 1N / 1N-R1 / 1N-R2 / 1N-R2-R1 — 系列B Wave 2 enemy sorcerer `atkScale` 感度比較（test-only）。
 *
 * 単一所有者: 系列B Wave index 1 / at_sorcerer / at_sorcerer_mod_chain / atkScale のみ。
 * 5 scale × 3 build × 3 seed = 45 case。production 採用・勝率/平均/近似閾値・合格断定はしない。
 * 候補検出は自動不合格・強度合格・production 候補決定ではない。
 *
 * 1N-R1: Wave 1 Module は tick/action の runtime 観測。passive は予定空・ledger spent0・
 * 開始 tick 味方状態・最終 Result 取得列を production 参照と突合する。
 *
 * 1N-R2: Wave 1 戦闘中の runtime passive identity を既存 `onTickStateDiagnostic` snapshot の
 * `acquiredPassivesBySlot` から直接観測し、全 4 slot が空であることを固定する。
 *
 * 1N-R2-R1: tick diagnostic の slot コピーは欠落を空列へ正規化せず fail-closed。
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
  copyAcquiredPassivesBySlotForTickDiagnostic,
  createSeriesBWave2SorcererAtkScaleTransform,
  normalizeProblemSeriesSimResultForCompare,
  runProblemSeriesSim,
  SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET,
  type ProblemSeriesSimCombatActionDiagnostic,
  type ProblemSeriesSimCombatFlowDamageEvent,
  type ProblemSeriesSimCombatFlowHealEvent,
  type ProblemSeriesSimInput,
  type ProblemSeriesSimResolvedWaveTransform,
  type ProblemSeriesSimResult,
  type ProblemSeriesSimTickAliveUnitDiagnostic,
  type ProblemSeriesSimTickStateDiagnostic,
  type ProblemSeriesSimWavePlan,
} from './test/problemSeriesSim.harness.ts';
import { PARTY_SLOT_COUNT } from './types.ts';

const EXPECTED_BASELINE_A_SHA256 =
  '2c6e6ad212bfaffb3259613d2d15a39a7910f7b7ba0474240f72cedd5c49062c';
const EXPECTED_BASELINE_B_SHA256 =
  'b575d9830b57bce29c3fc2d13ebb8db7044ee592d3363aae1bf457b0d7e1d47c';

const PROBLEM_SERIES_SEED = 'fixture-b';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_ID = 'r12m_series_b';
const WAVE2_INDEX = SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.waveIndex;
const WAVE1_INDEX = 0;
const SLOT_CLERIC = 3;

const ATK_SCALE_POINTS = [1.0, 1.25, 1.5, 1.75, 2.0] as const;
const EXPECTED_APPLIED_ATK_BY_SCALE: Readonly<Record<number, number>> = {
  1.0: 42,
  1.25: 53,
  1.5: 63,
  1.75: 74,
  2.0: 84,
};

const EXPECTED_OBS_BY_SCALE_RAW = {
  1.0: {
    signals: {
      wipe: [],
      stalemate: [],
      ineffective: [],
      single: [],
    },
    cases: {
      'no-spend-control::r12n-1d-b-01': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":42,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":103,"maxHp":155},{"classId":"df_guardian","hp":349,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":63},"df_guardian":{"count":3,"total":81}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":632,"totalRemainingAllyHp":491,"survivingAllies":4},
      'no-spend-control::r12n-1d-b-02': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":42,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":103,"maxHp":155},{"classId":"df_guardian","hp":349,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":63},"df_guardian":{"count":3,"total":81}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":632,"totalRemainingAllyHp":491,"survivingAllies":4},
      'no-spend-control::r12n-1d-b-03': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":42,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":103,"maxHp":155},{"classId":"df_guardian","hp":349,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":63},"df_guardian":{"count":3,"total":81}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":632,"totalRemainingAllyHp":491,"survivingAllies":4},
      'single-mend-24::r12n-1d-b-01': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":42,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":103,"maxHp":155},{"classId":"df_guardian","hp":359,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":63},"df_guardian":{"count":3,"total":81}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":642,"totalRemainingAllyHp":519,"survivingAllies":4},
      'single-mend-24::r12n-1d-b-02': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":42,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":103,"maxHp":155},{"classId":"df_guardian","hp":349,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":63},"df_guardian":{"count":3,"total":81}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":632,"totalRemainingAllyHp":509,"survivingAllies":4},
      'single-mend-24::r12n-1d-b-03': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":42,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":103,"maxHp":155},{"classId":"df_guardian","hp":349,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":63},"df_guardian":{"count":3,"total":81}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":632,"totalRemainingAllyHp":499,"survivingAllies":4},
      'party-mend-24::r12n-1d-b-01': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":42,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":89,"maxHp":155},{"classId":"df_guardian","hp":362,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":63},"df_guardian":{"count":3,"total":81}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":10},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":631,"totalRemainingAllyHp":464,"survivingAllies":3},
      'party-mend-24::r12n-1d-b-02': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":42,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":89,"maxHp":155},{"classId":"df_guardian","hp":352,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":63},"df_guardian":{"count":3,"total":81}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":10},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":621,"totalRemainingAllyHp":454,"survivingAllies":3},
      'party-mend-24::r12n-1d-b-03': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":42,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":89,"maxHp":155},{"classId":"df_guardian","hp":352,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":63},"df_guardian":{"count":3,"total":81}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":10},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":621,"totalRemainingAllyHp":444,"survivingAllies":3},
    },
  },
  1.25: {
    signals: {
      wipe: [],
      stalemate: [],
      ineffective: [],
      single: [],
    },
    cases: {
      'no-spend-control::r12n-1d-b-01': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":53,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":85,"maxHp":155},{"classId":"df_guardian","hp":328,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":81},"df_guardian":{"count":3,"total":102}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":593,"totalRemainingAllyHp":491,"survivingAllies":4},
      'no-spend-control::r12n-1d-b-02': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":53,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":85,"maxHp":155},{"classId":"df_guardian","hp":328,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":81},"df_guardian":{"count":3,"total":102}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":593,"totalRemainingAllyHp":491,"survivingAllies":4},
      'no-spend-control::r12n-1d-b-03': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":53,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":85,"maxHp":155},{"classId":"df_guardian","hp":328,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":81},"df_guardian":{"count":3,"total":102}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":593,"totalRemainingAllyHp":491,"survivingAllies":4},
      'single-mend-24::r12n-1d-b-01': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":53,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":85,"maxHp":155},{"classId":"df_guardian","hp":338,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":81},"df_guardian":{"count":3,"total":102}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":603,"totalRemainingAllyHp":519,"survivingAllies":4},
      'single-mend-24::r12n-1d-b-02': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":53,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":85,"maxHp":155},{"classId":"df_guardian","hp":328,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":81},"df_guardian":{"count":3,"total":102}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":593,"totalRemainingAllyHp":509,"survivingAllies":4},
      'single-mend-24::r12n-1d-b-03': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":53,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":85,"maxHp":155},{"classId":"df_guardian","hp":328,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":81},"df_guardian":{"count":3,"total":102}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":593,"totalRemainingAllyHp":499,"survivingAllies":4},
      'party-mend-24::r12n-1d-b-01': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":53,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":72,"maxHp":155},{"classId":"df_guardian","hp":341,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":81},"df_guardian":{"count":3,"total":102}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":11},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":593,"totalRemainingAllyHp":464,"survivingAllies":3},
      'party-mend-24::r12n-1d-b-02': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":53,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":72,"maxHp":155},{"classId":"df_guardian","hp":331,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":81},"df_guardian":{"count":3,"total":102}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":11},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":583,"totalRemainingAllyHp":454,"survivingAllies":3},
      'party-mend-24::r12n-1d-b-03': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":53,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":72,"maxHp":155},{"classId":"df_guardian","hp":331,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":81},"df_guardian":{"count":3,"total":102}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":11},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":583,"totalRemainingAllyHp":444,"survivingAllies":3},
    },
  },
  1.5: {
    signals: {
      wipe: [],
      stalemate: [],
      ineffective: [],
      single: [],
    },
    cases: {
      'no-spend-control::r12n-1d-b-01': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":63,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":70,"maxHp":155},{"classId":"df_guardian","hp":310,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":96},"df_guardian":{"count":3,"total":120}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":560,"totalRemainingAllyHp":491,"survivingAllies":4},
      'no-spend-control::r12n-1d-b-02': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":63,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":70,"maxHp":155},{"classId":"df_guardian","hp":310,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":96},"df_guardian":{"count":3,"total":120}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":560,"totalRemainingAllyHp":491,"survivingAllies":4},
      'no-spend-control::r12n-1d-b-03': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":63,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":70,"maxHp":155},{"classId":"df_guardian","hp":310,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":96},"df_guardian":{"count":3,"total":120}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":560,"totalRemainingAllyHp":491,"survivingAllies":4},
      'single-mend-24::r12n-1d-b-01': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":63,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":70,"maxHp":155},{"classId":"df_guardian","hp":320,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":96},"df_guardian":{"count":3,"total":120}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":570,"totalRemainingAllyHp":519,"survivingAllies":4},
      'single-mend-24::r12n-1d-b-02': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":63,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":70,"maxHp":155},{"classId":"df_guardian","hp":310,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":96},"df_guardian":{"count":3,"total":120}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":560,"totalRemainingAllyHp":509,"survivingAllies":4},
      'single-mend-24::r12n-1d-b-03': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":63,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":70,"maxHp":155},{"classId":"df_guardian","hp":310,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":96},"df_guardian":{"count":3,"total":120}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":560,"totalRemainingAllyHp":499,"survivingAllies":4},
      'party-mend-24::r12n-1d-b-01': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":63,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":57,"maxHp":155},{"classId":"df_guardian","hp":323,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":96},"df_guardian":{"count":3,"total":120}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":11},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":560,"totalRemainingAllyHp":464,"survivingAllies":3},
      'party-mend-24::r12n-1d-b-02': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":63,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":57,"maxHp":155},{"classId":"df_guardian","hp":313,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":96},"df_guardian":{"count":3,"total":120}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":11},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":550,"totalRemainingAllyHp":454,"survivingAllies":3},
      'party-mend-24::r12n-1d-b-03': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":63,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":57,"maxHp":155},{"classId":"df_guardian","hp":313,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":96},"df_guardian":{"count":3,"total":120}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":11},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":550,"totalRemainingAllyHp":444,"survivingAllies":3},
    },
  },
  1.75: {
    signals: {
      wipe: [],
      stalemate: [],
      ineffective: [],
      single: [],
    },
    cases: {
      'no-spend-control::r12n-1d-b-01': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":74,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":52,"maxHp":155},{"classId":"df_guardian","hp":286,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":114},"df_guardian":{"count":3,"total":144}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":518,"totalRemainingAllyHp":491,"survivingAllies":4},
      'no-spend-control::r12n-1d-b-02': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":74,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":52,"maxHp":155},{"classId":"df_guardian","hp":286,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":114},"df_guardian":{"count":3,"total":144}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":518,"totalRemainingAllyHp":491,"survivingAllies":4},
      'no-spend-control::r12n-1d-b-03': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":74,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":52,"maxHp":155},{"classId":"df_guardian","hp":286,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":114},"df_guardian":{"count":3,"total":144}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":518,"totalRemainingAllyHp":491,"survivingAllies":4},
      'single-mend-24::r12n-1d-b-01': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":74,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":52,"maxHp":155},{"classId":"df_guardian","hp":296,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":114},"df_guardian":{"count":3,"total":144}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":528,"totalRemainingAllyHp":519,"survivingAllies":4},
      'single-mend-24::r12n-1d-b-02': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":74,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":52,"maxHp":155},{"classId":"df_guardian","hp":286,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":114},"df_guardian":{"count":3,"total":144}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":518,"totalRemainingAllyHp":509,"survivingAllies":4},
      'single-mend-24::r12n-1d-b-03': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":74,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":52,"maxHp":155},{"classId":"df_guardian","hp":286,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":114},"df_guardian":{"count":3,"total":144}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":24},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":518,"totalRemainingAllyHp":499,"survivingAllies":4},
      'party-mend-24::r12n-1d-b-01': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":74,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":299,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":114},"df_guardian":{"count":3,"total":144}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":12},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":519,"totalRemainingAllyHp":464,"survivingAllies":3},
      'party-mend-24::r12n-1d-b-02': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":74,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":289,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":114},"df_guardian":{"count":3,"total":144}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":12},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":509,"totalRemainingAllyHp":454,"survivingAllies":3},
      'party-mend-24::r12n-1d-b-03': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":74,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":289,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":114},"df_guardian":{"count":3,"total":144}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":12},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":509,"totalRemainingAllyHp":444,"survivingAllies":3},
    },
  },
  2.0: {
    signals: {
      wipe: [],
      stalemate: [],
      ineffective: [],
      single: [],
    },
    cases: {
      'no-spend-control::r12n-1d-b-01': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":268,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":488,"totalRemainingAllyHp":491,"survivingAllies":4},
      'no-spend-control::r12n-1d-b-02': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":268,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":488,"totalRemainingAllyHp":491,"survivingAllies":4},
      'no-spend-control::r12n-1d-b-03': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":268,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":488,"totalRemainingAllyHp":491,"survivingAllies":4},
      'single-mend-24::r12n-1d-b-01': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":278,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":498,"totalRemainingAllyHp":519,"survivingAllies":4},
      'single-mend-24::r12n-1d-b-02': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":268,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":488,"totalRemainingAllyHp":509,"survivingAllies":4},
      'single-mend-24::r12n-1d-b-03': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":268,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":488,"totalRemainingAllyHp":499,"survivingAllies":4},
      'party-mend-24::r12n-1d-b-01': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":25,"maxHp":155},{"classId":"df_guardian","hp":281,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":12},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":486,"totalRemainingAllyHp":464,"survivingAllies":3},
      'party-mend-24::r12n-1d-b-02': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":25,"maxHp":155},{"classId":"df_guardian","hp":271,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":12},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":476,"totalRemainingAllyHp":454,"survivingAllies":3},
      'party-mend-24::r12n-1d-b-03': {"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":25,"maxHp":155},{"classId":"df_guardian","hp":271,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":12},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":476,"totalRemainingAllyHp":444,"survivingAllies":3},
    },
  },
};


const BUILD_IDS = [
  'no-spend-control',
  'single-mend-24',
  'party-mend-24',
] as const;

const BATTLE_RNG_SEEDS = [
  'r12n-1d-b-01',
  'r12n-1d-b-02',
  'r12n-1d-b-03',
] as const;

type BuildId = (typeof BUILD_IDS)[number];
type BattleRngSeed = (typeof BATTLE_RNG_SEEDS)[number];
type AtkScale = (typeof ATK_SCALE_POINTS)[number];

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

interface ClassAgg {
  readonly count: number;
  readonly total: number;
}

interface LethalObs {
  readonly actorClassId: string;
  readonly targetClassId: string;
  readonly actorIsEnemy: boolean;
  readonly targetIsEnemy: boolean;
}

interface AllyHpObs {
  readonly classId: string;
  readonly hp: number;
  readonly maxHp: number;
}

type ExpectedObsCase = {
  readonly outcome: ProblemSeriesSimResult['outcome'];
  readonly finalWaveIndex: number;
  readonly reachedWave2: boolean;
  readonly reachedWave3: boolean;
  readonly appliedEnemySorcererAtk: number;
  readonly lastAliveAllies: readonly AllyHpObs[];
  readonly enemySorcererDamageByTargetAllyClass: Readonly<Record<string, ClassAgg>>;
  readonly allyClericHealByTargetAllyClass: Readonly<Record<string, ClassAgg>>;
  readonly wave2AppliedClericModuleId: string;
  readonly wave2EndTotalAllyHp: number;
  readonly totalRemainingAllyHp: number;
  readonly survivingAllies: number;
};

type ExpectedObsPack = {
  readonly signals: {
    readonly wipe: readonly unknown[];
    readonly stalemate: readonly unknown[];
    readonly ineffective: readonly unknown[];
    readonly single: readonly string[];
  };
  readonly cases: Readonly<Record<string, ExpectedObsCase>>;
};

const EXPECTED_OBS_BY_SCALE = EXPECTED_OBS_BY_SCALE_RAW as Readonly<
  Record<AtkScale, ExpectedObsPack>
>;

interface Wave2FlowObs {
  readonly enemyDamageByActorClass: Readonly<Record<string, ClassAgg>>;
  readonly enemySorcererDamageByTargetAllyClass: Readonly<
    Record<string, ClassAgg>
  >;
  readonly enemySwordsmanDamageByTargetAllyClass: Readonly<
    Record<string, ClassAgg>
  >;
  readonly allyClericHealByTargetAllyClass: Readonly<Record<string, ClassAgg>>;
  readonly lethals: readonly LethalObs[];
  readonly lastAliveAllies: readonly AllyHpObs[];
  readonly wave2EndTotalAllyHp: number;
  readonly wave2AppliedClericModuleId: string;
  readonly enemySorcererActionCount: number;
  readonly enemySorcererDamageCount: number;
  readonly allyClericActionCount: number;
  readonly allyClericHealCount: number;
}

/** Wave 1 開始 tick から取れる味方状態（slot 対応。passive id は含まない）。 */
interface Wave1StartAllyObs {
  readonly partySlotIndex: number;
  readonly classId: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly barrierHp: number;
  readonly atk: number;
  readonly basicSkillId: string;
}

/**
 * Wave 1 非波及 slice。
 * Module は tick/action の runtime 観測。planned input を applied/acquired と命名しない。
 * runtime passive identity は tick snapshot の `acquiredPassivesBySlot` から直接観測する。
 */
interface Wave1InvariantSlice {
  readonly enemyWaveInput: ProblemSeriesBattleWave;
  readonly waveResult: string;
  readonly startTick: number;
  readonly endTick: number;
  readonly damageByActorTarget: Readonly<Record<string, ClassAgg>>;
  readonly healByActorTarget: Readonly<Record<string, ClassAgg>>;
  readonly startAliveAllies: readonly Wave1StartAllyObs[];
  readonly endAliveAllies: readonly AllyHpObs[];
  readonly endAliveEnemies: readonly AllyHpObs[];
  readonly resourceLedgerWave1: ProblemSeriesSimResult['resourceLedger'][number];
  /** Wave 1 tick/action から slot 対応で観測した Module identity。 */
  readonly observedCombatModuleIdBySlot: readonly string[];
  /**
   * Wave 1 全 tick の runtime 取得 passive ID 列（slot 対応）。
   * 本所有者感度では全 4 slot が空であることが直接固定される。
   */
  readonly observedRuntimeAcquiredPassivesBySlot: readonly (readonly string[])[];
}

interface SensitivityCaseRow {
  readonly atkScale: number;
  readonly appliedEnemySorcererAtk: number;
  readonly buildId: BuildId;
  readonly battleRngSeed: BattleRngSeed;
  readonly outcome: ProblemSeriesSimResult['outcome'];
  readonly finalWaveIndex: number;
  readonly waveResults: readonly string[];
  readonly waveTicks: readonly number[];
  readonly tickCount: number;
  readonly survivingAllies: number;
  readonly survivingEnemies: number;
  readonly totalRemainingAllyHp: number;
  readonly totalMaxAllyHp: number;
  readonly totalRemainingEnemyHp: number;
  readonly timedOut: boolean;
  readonly reachedWave2: boolean;
  readonly reachedWave3: boolean;
  readonly wave3PlannedApplied: boolean;
  readonly slotStats: ProblemSeriesSimResult['slotStats'];
  readonly resourceLedger: ProblemSeriesSimResult['resourceLedger'];
  readonly appliedCombatModuleIdBySlot: readonly string[];
  readonly acquiredPassivesBySlot: readonly (readonly string[])[];
  readonly wave2Flow: Wave2FlowObs;
  readonly wave1Slice: Wave1InvariantSlice;
}

interface DiagnosticBundle {
  readonly result: ProblemSeriesSimResult;
  readonly damageEvents: readonly ProblemSeriesSimCombatFlowDamageEvent[];
  readonly healEvents: readonly ProblemSeriesSimCombatFlowHealEvent[];
  readonly actionEvents: readonly ProblemSeriesSimCombatActionDiagnostic[];
  readonly tickStates: readonly ProblemSeriesSimTickStateDiagnostic[];
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

function loadBaselineB(): SeriesBBaselineFile {
  const raw = readFileSync(baselineBPath);
  expect(sha256Hex(raw)).toBe(EXPECTED_BASELINE_B_SHA256);
  const parsed = JSON.parse(raw.toString('utf8')) as SeriesBBaselineFile;
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

function groupIdentityWithoutAtkScale(
  group: ProblemSeriesBattleEnemyGroup,
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...group };
  delete copy.atkScale;
  return copy;
}

function assertTransformTouchesOnlyWave2ChainSorcererAtkScale(
  beforeWaves: readonly ProblemSeriesBattleWave[],
  transformed: readonly ProblemSeriesBattleWave[],
  atkScale: number,
): void {
  expect(transformed).toHaveLength(3);
  expect(beforeWaves).toHaveLength(3);

  for (let waveIndex = 0; waveIndex < 3; waveIndex++) {
    const before = beforeWaves[waveIndex]!;
    const after = transformed[waveIndex]!;
    expect(after.prepResourceGrant).toBe(before.prepResourceGrant);
    expect(after.enemyGroups).toHaveLength(before.enemyGroups.length);

    if (waveIndex !== WAVE2_INDEX) {
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
      const isTarget =
        beforeGroup.classId === SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.classId &&
        beforeGroup.selectedCombatModuleId ===
          SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.selectedCombatModuleId;
      if (isTarget) {
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
      SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.expectedSorcererGroupCount,
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

function addAgg(
  map: Map<string, { count: number; total: number }>,
  key: string,
  amount: number,
): void {
  const prev = map.get(key) ?? { count: 0, total: 0 };
  map.set(key, { count: prev.count + 1, total: prev.total + amount });
}

function freezeAggMap(
  map: Map<string, { count: number; total: number }>,
): Record<string, ClassAgg> {
  const out: Record<string, ClassAgg> = {};
  for (const key of [...map.keys()].sort()) {
    const row = map.get(key)!;
    out[key] = { count: row.count, total: row.total };
  }
  return out;
}

function allyHpSnapshot(
  units: readonly ProblemSeriesSimTickAliveUnitDiagnostic[],
): AllyHpObs[] {
  return [...units]
    .map((u) => ({ classId: u.classId, hp: u.hp, maxHp: u.maxHp }))
    .sort((a, b) =>
      a.classId === b.classId ? a.hp - b.hp : a.classId.localeCompare(b.classId),
    );
}

function captureWave2EnemySorcererAtk(
  tickStates: readonly ProblemSeriesSimTickStateDiagnostic[],
): number | null {
  for (const state of tickStates) {
    if (state.waveIndex !== WAVE2_INDEX) continue;
    const matches = state.enemies.filter(
      (enemy) =>
        enemy.classId === SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.classId &&
        enemy.basicSkillId ===
          SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.selectedCombatModuleId,
    );
    if (matches.length === 0) continue;
    expect(matches).toHaveLength(1);
    expect(Number.isFinite(matches[0]!.atk)).toBe(true);
    return matches[0]!.atk;
  }
  return null;
}

function lastTickForWave(
  tickStates: readonly ProblemSeriesSimTickStateDiagnostic[],
  waveIndex: number,
): ProblemSeriesSimTickStateDiagnostic | null {
  let last: ProblemSeriesSimTickStateDiagnostic | null = null;
  for (const state of tickStates) {
    if (state.waveIndex === waveIndex) last = state;
  }
  return last;
}

function firstTickForWave(
  tickStates: readonly ProblemSeriesSimTickStateDiagnostic[],
  waveIndex: number,
): ProblemSeriesSimTickStateDiagnostic | null {
  for (const state of tickStates) {
    if (state.waveIndex === waveIndex) return state;
  }
  return null;
}

function wave1StartAllySnapshot(
  allies: readonly ProblemSeriesSimTickAliveUnitDiagnostic[],
): Wave1StartAllyObs[] {
  const bySlot: (Wave1StartAllyObs | undefined)[] = Array.from(
    { length: PARTY_SLOT_COUNT },
    () => undefined,
  );
  expect(allies.length).toBe(PARTY_SLOT_COUNT);
  for (const ally of allies) {
    expect(typeof ally.partySlotIndex).toBe('number');
    const slotIndex = ally.partySlotIndex!;
    expect(slotIndex).toBeGreaterThanOrEqual(0);
    expect(slotIndex).toBeLessThan(PARTY_SLOT_COUNT);
    expect(bySlot[slotIndex]).toBeUndefined();
    expect(ally.classId.length).toBeGreaterThan(0);
    expect(ally.basicSkillId.length).toBeGreaterThan(0);
    bySlot[slotIndex] = {
      partySlotIndex: slotIndex,
      classId: ally.classId,
      hp: ally.hp,
      maxHp: ally.maxHp,
      barrierHp: ally.barrierHp,
      atk: ally.atk,
      basicSkillId: ally.basicSkillId,
    };
  }
  for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
    expect(bySlot[slotIndex]).toBeDefined();
  }
  return bySlot as Wave1StartAllyObs[];
}

/**
 * Wave 1 実観測 Module identity（slot 対応）。
 * tick の basicSkillId を主証拠、action の skillId を同一 Wave 内の突合に使う。
 * baselineCase.input.slots の予定値は使わない。
 */
function observeWave1CombatModuleIdBySlot(
  tickStates: readonly ProblemSeriesSimTickStateDiagnostic[],
  actionEvents: readonly ProblemSeriesSimCombatActionDiagnostic[],
): string[] {
  const bySlot: (string | undefined)[] = Array.from(
    { length: PARTY_SLOT_COUNT },
    () => undefined,
  );
  let wave1TickAllySightings = 0;

  for (const state of tickStates) {
    if (state.waveIndex !== WAVE1_INDEX) continue;
    for (const ally of state.allies) {
      expect(typeof ally.partySlotIndex).toBe('number');
      const slotIndex = ally.partySlotIndex!;
      expect(slotIndex).toBeGreaterThanOrEqual(0);
      expect(slotIndex).toBeLessThan(PARTY_SLOT_COUNT);
      expect(ally.basicSkillId.length).toBeGreaterThan(0);
      wave1TickAllySightings += 1;
      if (bySlot[slotIndex] === undefined) {
        bySlot[slotIndex] = ally.basicSkillId;
      } else {
        expect(ally.basicSkillId).toBe(bySlot[slotIndex]);
      }
    }
  }
  expect(wave1TickAllySightings).toBeGreaterThan(0);

  let wave1AllyActionCount = 0;
  for (const event of actionEvents) {
    if (event.waveIndex !== WAVE1_INDEX) continue;
    if (event.actor.isEnemy) continue;
    expect(typeof event.actor.partySlotIndex).toBe('number');
    const slotIndex = event.actor.partySlotIndex!;
    expect(slotIndex).toBeGreaterThanOrEqual(0);
    expect(slotIndex).toBeLessThan(PARTY_SLOT_COUNT);
    expect(event.skillId.length).toBeGreaterThan(0);
    expect(bySlot[slotIndex]).toBeDefined();
    expect(event.skillId).toBe(bySlot[slotIndex]);
    wave1AllyActionCount += 1;
  }
  expect(wave1AllyActionCount).toBeGreaterThan(0);

  for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
    expect(bySlot[slotIndex]).toBeDefined();
    expect(bySlot[slotIndex]!.length).toBeGreaterThan(0);
  }
  return bySlot as string[];
}

const WAVE1_EMPTY_RUNTIME_PASSIVES_BY_SLOT: readonly (readonly string[])[] =
  Object.freeze(
    Array.from({ length: PARTY_SLOT_COUNT }, () => Object.freeze([])),
  );

/**
 * Wave 1 全 tick の runtime 取得 passive ID 列を直接観測する。
 * slot 欠落・重複長・空 Wave 1 tick・非空列では失敗する（推測で埋めない）。
 */
function observeWave1RuntimeAcquiredPassivesBySlot(
  tickStates: readonly ProblemSeriesSimTickStateDiagnostic[],
): readonly (readonly string[])[] {
  let wave1TickCount = 0;
  let observed: readonly (readonly string[])[] | null = null;

  for (const state of tickStates) {
    if (state.waveIndex !== WAVE1_INDEX) continue;
    wave1TickCount += 1;

    expect(state.acquiredPassivesBySlot).toHaveLength(PARTY_SLOT_COUNT);
    const slotSeen = new Set<number>();
    for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
      expect(slotSeen.has(slotIndex)).toBe(false);
      slotSeen.add(slotIndex);
      const ids = state.acquiredPassivesBySlot[slotIndex];
      expect(ids).toBeDefined();
      expect(Array.isArray(ids)).toBe(true);
      expect(ids).toEqual([]);
    }
    expect(slotSeen.size).toBe(PARTY_SLOT_COUNT);

    const copied = state.acquiredPassivesBySlot.map((ids) => [...ids]);
    if (observed === null) {
      observed = copied;
    } else {
      expect(copied).toEqual(observed);
    }
  }

  expect(wave1TickCount).toBeGreaterThan(0);
  expect(observed).not.toBeNull();
  expect(observed).toEqual(WAVE1_EMPTY_RUNTIME_PASSIVES_BY_SLOT);
  return observed!;
}

function assertWave1TickRuntimePassivesEmpty(
  state: ProblemSeriesSimTickStateDiagnostic,
): void {
  expect(state.waveIndex).toBe(WAVE1_INDEX);
  expect(state.acquiredPassivesBySlot).toHaveLength(PARTY_SLOT_COUNT);
  for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
    expect(state.acquiredPassivesBySlot[slotIndex]).toEqual([]);
  }
}

/** 入力上の Wave 1 予定取得が空であること（applied/acquired とは呼ばない）。 */
function assertWave1PlannedPassiveAcquisitionsEmpty(
  wavePlans: readonly (ProblemSeriesSimWavePlan | undefined)[],
): void {
  expect(wavePlans).toHaveLength(3);
  expect(wavePlans[WAVE1_INDEX]?.passiveAcquisitions ?? []).toEqual([]);
}

function assertWave1LedgerSpentZero(
  ledger: ProblemSeriesSimResult['resourceLedger'][number],
): void {
  expect(ledger.waveIndex).toBe(WAVE1_INDEX);
  expect(ledger.spentAmount).toBe(0);
}

function buildWave2Flow(
  bundle: DiagnosticBundle,
  result: ProblemSeriesSimResult,
): Wave2FlowObs {
  const damageEvents = bundle.damageEvents.filter((e) => e.waveIndex === WAVE2_INDEX);
  const healEvents = bundle.healEvents.filter((e) => e.waveIndex === WAVE2_INDEX);
  const actionEvents = bundle.actionEvents.filter((e) => e.waveIndex === WAVE2_INDEX);

  const enemyDamageByActor = new Map<string, { count: number; total: number }>();
  const sorcererByTarget = new Map<string, { count: number; total: number }>();
  const swordsmanByTarget = new Map<string, { count: number; total: number }>();
  const clericHealByTarget = new Map<string, { count: number; total: number }>();
  const lethals: LethalObs[] = [];

  let enemySorcererDamageCount = 0;
  for (const event of damageEvents) {
    if (event.actor.isEnemy) {
      addAgg(enemyDamageByActor, event.actor.classId, event.amount);
      if (!event.target.isEnemy && event.actor.classId === 'at_sorcerer') {
        enemySorcererDamageCount += 1;
        addAgg(sorcererByTarget, event.target.classId, event.amount);
      }
      if (!event.target.isEnemy && event.actor.classId === 'at_swordsman') {
        addAgg(swordsmanByTarget, event.target.classId, event.amount);
      }
    }
    if (event.lethal) {
      lethals.push({
        actorClassId: event.actor.classId,
        targetClassId: event.target.classId,
        actorIsEnemy: event.actor.isEnemy,
        targetIsEnemy: event.target.isEnemy,
      });
    }
  }

  let allyClericHealCount = 0;
  for (const event of healEvents) {
    if (
      !event.actor.isEnemy &&
      event.actor.classId === 'sp_cleric' &&
      !event.target.isEnemy
    ) {
      allyClericHealCount += 1;
      addAgg(clericHealByTarget, event.target.classId, event.amount);
    }
  }

  const enemySorcererActionCount = actionEvents.filter(
    (e) =>
      e.actor.isEnemy &&
      e.actor.classId === 'at_sorcerer' &&
      e.skillId === SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.selectedCombatModuleId,
  ).length;
  const allyClericActionCount = actionEvents.filter(
    (e) => !e.actor.isEnemy && e.actor.classId === 'sp_cleric',
  ).length;

  const lastWave2 = lastTickForWave(bundle.tickStates, WAVE2_INDEX);
  expect(lastWave2).not.toBeNull();
  const lastAliveAllies = allyHpSnapshot(lastWave2!.allies);
  const wave2EndTotalAllyHp = lastAliveAllies.reduce((sum, a) => sum + a.hp, 0);
  const wave2AppliedClericModuleId =
    result.appliedCombatModuleIdBySlot[SLOT_CLERIC] ?? '';

  return {
    enemyDamageByActorClass: freezeAggMap(enemyDamageByActor),
    enemySorcererDamageByTargetAllyClass: freezeAggMap(sorcererByTarget),
    enemySwordsmanDamageByTargetAllyClass: freezeAggMap(swordsmanByTarget),
    allyClericHealByTargetAllyClass: freezeAggMap(clericHealByTarget),
    lethals,
    lastAliveAllies,
    wave2EndTotalAllyHp,
    wave2AppliedClericModuleId,
    enemySorcererActionCount,
    enemySorcererDamageCount,
    allyClericActionCount,
    allyClericHealCount,
  };
}

function buildWave1Slice(bundle: DiagnosticBundle): Wave1InvariantSlice {
  const { result } = bundle;
  const wave = result.waves.find((w) => w.waveIndex === WAVE1_INDEX);
  expect(wave).toBeDefined();
  expect(result.finalWaveIndex).toBeGreaterThanOrEqual(WAVE1_INDEX);
  const damageMap = new Map<string, { count: number; total: number }>();
  const healMap = new Map<string, { count: number; total: number }>();
  for (const event of bundle.damageEvents) {
    if (event.waveIndex !== WAVE1_INDEX) continue;
    addAgg(
      damageMap,
      `${event.actor.classId}->${event.target.classId}`,
      event.amount,
    );
  }
  for (const event of bundle.healEvents) {
    if (event.waveIndex !== WAVE1_INDEX) continue;
    addAgg(
      healMap,
      `${event.actor.classId}->${event.target.classId}`,
      event.amount,
    );
  }
  const firstWave1 = firstTickForWave(bundle.tickStates, WAVE1_INDEX);
  expect(firstWave1).not.toBeNull();
  const lastWave1 = lastTickForWave(bundle.tickStates, WAVE1_INDEX);
  expect(lastWave1).not.toBeNull();
  assertWave1TickRuntimePassivesEmpty(firstWave1!);
  assertWave1TickRuntimePassivesEmpty(lastWave1!);

  const resourceLedgerWave1 = result.resourceLedger.find(
    (e) => e.waveIndex === WAVE1_INDEX,
  );
  expect(resourceLedgerWave1).toBeDefined();
  assertWave1LedgerSpentZero(resourceLedgerWave1!);

  const observedCombatModuleIdBySlot = observeWave1CombatModuleIdBySlot(
    bundle.tickStates,
    bundle.actionEvents,
  );
  const observedRuntimeAcquiredPassivesBySlot =
    observeWave1RuntimeAcquiredPassivesBySlot(bundle.tickStates);
  expect(observedRuntimeAcquiredPassivesBySlot).toEqual(
    WAVE1_EMPTY_RUNTIME_PASSIVES_BY_SLOT,
  );
  expect(firstWave1!.acquiredPassivesBySlot).toEqual(
    observedRuntimeAcquiredPassivesBySlot,
  );
  expect(lastWave1!.acquiredPassivesBySlot).toEqual(
    observedRuntimeAcquiredPassivesBySlot,
  );

  const startAliveAllies = wave1StartAllySnapshot(firstWave1!.allies);
  for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
    expect(startAliveAllies[slotIndex]!.basicSkillId).toBe(
      observedCombatModuleIdBySlot[slotIndex],
    );
  }

  return {
    enemyWaveInput: result.enemyWaveInputs[WAVE1_INDEX]!,
    waveResult: wave!.result,
    startTick: wave!.startTick,
    endTick: wave!.endTick,
    damageByActorTarget: freezeAggMap(damageMap),
    healByActorTarget: freezeAggMap(healMap),
    startAliveAllies,
    endAliveAllies: allyHpSnapshot(lastWave1!.allies),
    endAliveEnemies: allyHpSnapshot(lastWave1!.enemies),
    resourceLedgerWave1: resourceLedgerWave1!,
    observedCombatModuleIdBySlot,
    observedRuntimeAcquiredPassivesBySlot,
  };
}

function runInstrumentedCase(
  baselineCase: SeriesBBaselineCase,
  transform: ProblemSeriesSimResolvedWaveTransform | undefined,
): DiagnosticBundle {
  const damageEvents: ProblemSeriesSimCombatFlowDamageEvent[] = [];
  const healEvents: ProblemSeriesSimCombatFlowHealEvent[] = [];
  const actionEvents: ProblemSeriesSimCombatActionDiagnostic[] = [];
  const tickStates: ProblemSeriesSimTickStateDiagnostic[] = [];

  const result = runProblemSeriesSim({
    ...baselineCase.input,
    ...(transform === undefined
      ? {}
      : { transformResolvedBattleWaves: transform }),
    onCombatFlowDamage: (event) => {
      damageEvents.push(event);
    },
    onCombatFlowHeal: (event) => {
      healEvents.push(event);
    },
    onCombatActionDiagnostic: (event) => {
      actionEvents.push(event);
    },
    onTickStateDiagnostic: (state) => {
      tickStates.push(state);
    },
  });

  expect(damageEvents.length + healEvents.length + actionEvents.length).toBeGreaterThan(
    0,
  );
  expect(tickStates.length).toBeGreaterThan(0);

  return { result, damageEvents, healEvents, actionEvents, tickStates };
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

function assertWave2FlowNonEmpty(flow: Wave2FlowObs, reachedWave2: boolean): void {
  if (!reachedWave2) {
    expect(flow.enemySorcererDamageCount).toBe(0);
    expect(flow.enemySorcererActionCount).toBe(0);
    return;
  }
  expect(flow.enemySorcererActionCount).toBeGreaterThan(0);
  expect(flow.enemySorcererDamageCount).toBeGreaterThan(0);
  expect(Object.keys(flow.enemySorcererDamageByTargetAllyClass).length).toBeGreaterThan(
    0,
  );
  if (flow.allyClericHealCount > 0) {
    expect(flow.allyClericActionCount).toBeGreaterThan(0);
    expect(flow.wave2AppliedClericModuleId.startsWith('sp_cleric_mod_')).toBe(true);
    expect(Object.keys(flow.allyClericHealByTargetAllyClass).length).toBeGreaterThan(0);
  }
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

async function runSensitivityForAtkScale(
  atkScale: AtkScale,
  baseline: SeriesBBaselineFile,
  productionWaves: readonly ProblemSeriesBattleWave[],
  wave1ReferenceByKey: ReadonlyMap<string, Wave1InvariantSlice>,
  productionAcquiredPassivesByKey: ReadonlyMap<
    string,
    readonly (readonly string[])[]
  >,
): Promise<{
  readonly rows: SensitivityCaseRow[];
  readonly report: ProblemSeriesBalanceSignalReport;
}> {
  const expectedAtk = EXPECTED_APPLIED_ATK_BY_SCALE[atkScale];
  expect(expectedAtk).toBeDefined();
  const transform = createSeriesBWave2SorcererAtkScaleTransform(atkScale);
  assertTransformTouchesOnlyWave2ChainSorcererAtkScale(
    productionWaves,
    transform(productionWaves, transformContext()),
    atkScale,
  );

  const signalCases: ProblemSeriesBalanceSignalCase[] = [];
  const pairKeys = new Set<string>();
  const rows: SensitivityCaseRow[] = [];

  for (const baselineCase of baseline.cases) {
    await new Promise<void>((resolveTick) => {
      setImmediate(resolveTick);
    });

    const buildId = baselineCase.buildId as BuildId;
    const battleRngSeed = baselineCase.battleRngSeed as BattleRngSeed;
    const key = caseKey(buildId, battleRngSeed);
    expect(pairKeys.has(key)).toBe(false);
    pairKeys.add(key);

    const bundle = runInstrumentedCase(baselineCase, transform);
    const { result } = bundle;
    assertCaseMetricsPresent(result);
    expect(result.battleRngSeed).toBe(battleRngSeed);
    assertTransformTouchesOnlyWave2ChainSorcererAtkScale(
      productionWaves,
      result.enemyWaveInputs,
      atkScale,
    );

    const wavePlans = baselineCase.input.wavePlans ?? [];
    assertWave1PlannedPassiveAcquisitionsEmpty(wavePlans);
    expect(result.acquiredPassivesBySlot).toEqual(
      expectedAcquiredPassivesBySlot(wavePlans, result.finalWaveIndex),
    );
    const productionAcquired = productionAcquiredPassivesByKey.get(key);
    expect(productionAcquired).toBeDefined();
    expect(result.acquiredPassivesBySlot).toEqual(productionAcquired);

    const wave3Planned = wave3PlannedPassiveIds(wavePlans);
    const acquired = allAcquiredPassiveIds(result);
    const reachedWave2 = result.finalWaveIndex >= 1;
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

    const appliedAtk = captureWave2EnemySorcererAtk(bundle.tickStates);
    expect(reachedWave2).toBe(true);
    expect(appliedAtk).not.toBeNull();
    expect(appliedAtk).toBe(expectedAtk);

    const wave2Flow = buildWave2Flow(bundle, result);
    assertWave2FlowNonEmpty(wave2Flow, reachedWave2);
    const wave1Slice = buildWave1Slice(bundle);
    const referenceWave1 = wave1ReferenceByKey.get(key);
    expect(referenceWave1).toBeDefined();
    expect(wave1Slice).toEqual(referenceWave1);
    expect(wave1Slice.observedCombatModuleIdBySlot).toEqual(
      referenceWave1!.observedCombatModuleIdBySlot,
    );
    expect(wave1Slice.observedRuntimeAcquiredPassivesBySlot).toEqual(
      referenceWave1!.observedRuntimeAcquiredPassivesBySlot,
    );
    expect(wave1Slice.observedRuntimeAcquiredPassivesBySlot).toEqual(
      WAVE1_EMPTY_RUNTIME_PASSIVES_BY_SLOT,
    );
    expect(wave1Slice.startAliveAllies).toEqual(referenceWave1!.startAliveAllies);
    assertWave1LedgerSpentZero(wave1Slice.resourceLedgerWave1);

    signalCases.push({
      buildId,
      battleRngSeed,
      input: {
        ...baselineCase.input,
        transformResolvedBattleWaves: transform,
      },
      result,
    });

    rows.push({
      atkScale,
      appliedEnemySorcererAtk: appliedAtk!,
      buildId,
      battleRngSeed,
      outcome: result.outcome,
      finalWaveIndex: result.finalWaveIndex,
      waveResults: result.waves.map((w) => `${w.waveIndex}:${w.result}`),
      waveTicks: result.waves.map((w) => w.endTick - w.startTick),
      tickCount: result.tickCount,
      survivingAllies: result.survivingAllies,
      survivingEnemies: result.survivingEnemies,
      totalRemainingAllyHp: result.totalRemainingAllyHp,
      totalMaxAllyHp: result.totalMaxAllyHp,
      totalRemainingEnemyHp: result.totalRemainingEnemyHp,
      timedOut: result.timedOut,
      reachedWave2,
      reachedWave3,
      wave3PlannedApplied:
        wave3Planned.length > 0 &&
        reachedWave3 &&
        wave3Planned.every((id) => acquired.includes(id)),
      slotStats: result.slotStats,
      resourceLedger: result.resourceLedger,
      appliedCombatModuleIdBySlot: result.appliedCombatModuleIdBySlot,
      acquiredPassivesBySlot: result.acquiredPassivesBySlot,
      wave2Flow,
      wave1Slice,
    });
  }

  expect(pairKeys.size).toBe(9);
  expect(signalCases).toHaveLength(9);
  expect(rows).toHaveLength(9);

  const report = detectProblemSeriesBalanceSignals(signalCases);
  expect(report.evaluatedCaseCount).toBe(9);
  expect(report.evaluatedBuildCount).toBe(3);
  expect(report.evaluatedSeedCount).toBe(3);
  expect(report.seriesId).toBe(SERIES_ID);
  return { rows, report };
}

/**
 * 初回観測後に昇格した直接 assert。
 * 未昇格時は dump のみで fail-closed にしないよう、観測 dump 後に本関数へ固定値を入れる。
 */
function assertObservedAtkScaleTransition(
  atkScale: AtkScale,
  rows: readonly SensitivityCaseRow[],
  report: ProblemSeriesBalanceSignalReport,
): void {
  expect(rows).toHaveLength(9);
  expect(EXPECTED_APPLIED_ATK_BY_SCALE[atkScale]).toBeDefined();
  const byKey = indexRowsByBuildSeed(rows);
  const expectedPack = EXPECTED_OBS_BY_SCALE[atkScale];
  expect(expectedPack).toBeDefined();

  expect(report.immediatePartyWipeCandidates).toEqual(expectedPack.signals.wipe);
  expect(report.stalemateCandidates).toEqual(expectedPack.signals.stalemate);
  expect(report.ineffectiveChoiceCandidatePairs).toEqual(
    expectedPack.signals.ineffective,
  );
  expect(report.singleSolutionCandidateBuildIds).toEqual(
    expectedPack.signals.single,
  );

  const expectedCaseKeys = new Set(Object.keys(expectedPack.cases));
  expect(expectedCaseKeys.size).toBe(9);
  for (const key of byKey.keys()) {
    expect(expectedCaseKeys.has(key)).toBe(true);
  }
  for (const key of expectedCaseKeys) {
    expect(byKey.has(key)).toBe(true);
  }

  for (const seed of BATTLE_RNG_SEEDS) {
    for (const buildId of BUILD_IDS) {
      const row = requireRow(byKey, buildId, seed);
      const key = caseKey(buildId, seed);
      const expected = expectedPack.cases[key];
      expect(expected).toBeDefined();
      expect(row.outcome).toBe(expected.outcome);
      expect(row.finalWaveIndex).toBe(expected.finalWaveIndex);
      expect(row.reachedWave2).toBe(expected.reachedWave2);
      expect(row.reachedWave3).toBe(expected.reachedWave3);
      expect(row.appliedEnemySorcererAtk).toBe(expected.appliedEnemySorcererAtk);
      expect(row.wave2Flow.lastAliveAllies).toEqual(expected.lastAliveAllies);
      expect(row.wave2Flow.enemySorcererDamageByTargetAllyClass).toEqual(
        expected.enemySorcererDamageByTargetAllyClass,
      );
      expect(row.wave2Flow.allyClericHealByTargetAllyClass).toEqual(
        expected.allyClericHealByTargetAllyClass,
      );
      expect(row.wave2Flow.wave2AppliedClericModuleId).toBe(
        expected.wave2AppliedClericModuleId,
      );
      expect(row.wave2Flow.wave2EndTotalAllyHp).toBe(expected.wave2EndTotalAllyHp);
      expect(row.totalRemainingAllyHp).toBe(expected.totalRemainingAllyHp);
      expect(row.survivingAllies).toBe(expected.survivingAllies);
      expect(row.timedOut).toBe(false);
      expect(row.survivingEnemies).toBe(0);
      expect(row.totalRemainingEnemyHp).toBe(0);
      expect(row.totalMaxAllyHp).toBe(755);
    }
  }
}

describe('R12n 1N-R2-R1 tick acquiredPassivesBySlot copy fail-closed (test-only)', () => {
  it('rejects 3-slot outer array', () => {
    expect(() =>
      copyAcquiredPassivesBySlotForTickDiagnostic([['a'], ['b'], ['c']]),
    ).toThrow(/exactly 4 slots, got 3/);
  });

  it('rejects 5-slot outer array', () => {
    expect(() =>
      copyAcquiredPassivesBySlotForTickDiagnostic([
        ['a'],
        ['b'],
        ['c'],
        ['d'],
        ['e'],
      ]),
    ).toThrow(/exactly 4 slots, got 5/);
  });

  it('rejects sparse outer array (hole at slot index)', () => {
    const sparse = [] as (readonly string[])[];
    sparse[0] = ['a'];
    sparse[2] = ['c'];
    sparse[3] = ['d'];
    sparse.length = PARTY_SLOT_COUNT;
    expect(() =>
      copyAcquiredPassivesBySlotForTickDiagnostic(sparse),
    ).toThrow(/missing slot at index 1/);
  });

  it('rejects undefined slot value', () => {
    expect(() =>
      copyAcquiredPassivesBySlotForTickDiagnostic([
        ['a'],
        undefined as unknown as readonly string[],
        ['c'],
        ['d'],
      ]),
    ).toThrow(/missing slot at index 1/);
  });

  it('rejects non-array slot value', () => {
    expect(() =>
      copyAcquiredPassivesBySlotForTickDiagnostic([
        ['a'],
        'not-array' as unknown as readonly string[],
        ['c'],
        ['d'],
      ]),
    ).toThrow(/slot 1 must be an array/);
  });

  it('lossless-copies 4 slots with duplicate passive IDs and acquisition order', () => {
    const input: string[][] = [
      ['p_a', 'p_a', 'p_b'],
      [],
      ['p_c'],
      ['p_d', 'p_d'],
    ];
    const copied = copyAcquiredPassivesBySlotForTickDiagnostic(input);
    expect(copied).toHaveLength(PARTY_SLOT_COUNT);
    expect(copied).toEqual([
      ['p_a', 'p_a', 'p_b'],
      [],
      ['p_c'],
      ['p_d', 'p_d'],
    ]);
    expect(copied).not.toBe(input);
    for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
      expect(copied[slotIndex]).not.toBe(input[slotIndex]);
    }
    input[0]!.push('mutated');
    input[2]![0] = 'mutated-c';
    expect(copied[0]).toEqual(['p_a', 'p_a', 'p_b']);
    expect(copied[2]).toEqual(['p_c']);
  });
});

describe('R12n 1N series B Wave2 sorcerer atkScale sensitivity (test-only)', () => {
  let baselineCache: SeriesBBaselineFile | null = null;
  let productionWaves: ProblemSeriesBattleWave[] = [];
  const wave1ReferenceByKey = new Map<string, Wave1InvariantSlice>();
  const productionAcquiredPassivesByKey = new Map<
    string,
    readonly (readonly string[])[]
  >();
  const productionNormalizedByKey = new Map<string, string>();
  const observationByScale = new Map<
    number,
    {
      rows: SensitivityCaseRow[];
      report: ProblemSeriesBalanceSignalReport;
    }
  >();

  it('loads production / baseline references and Wave1 identity anchors', async () => {
    assertBaselineShaUnchanged();
    baselineCache = loadBaselineB();
    productionWaves = loadProductionBattleWaves();
    expect(productionWaves).toHaveLength(3);

    for (const baselineCase of baselineCache.cases) {
      await new Promise<void>((resolveTick) => {
        setImmediate(resolveTick);
      });
      const key = `${baselineCase.buildId}::${baselineCase.battleRngSeed}`;
      const wavePlans = baselineCase.input.wavePlans ?? [];
      assertWave1PlannedPassiveAcquisitionsEmpty(wavePlans);

      // 参照値は transform なし production 実行（scale=1 transform ではない）。
      const production = runInstrumentedCase(baselineCase, undefined);
      expect(normalizeProblemSeriesSimResultForCompare(production.result)).toBe(
        normalizeProblemSeriesSimResultForCompare(baselineCase.result),
      );
      productionNormalizedByKey.set(
        key,
        normalizeProblemSeriesSimResultForCompare(production.result),
      );
      productionAcquiredPassivesByKey.set(
        key,
        production.result.acquiredPassivesBySlot.map((slot) => [...slot]),
      );

      const productionWave1 = buildWave1Slice(production);
      expect(productionWave1.observedCombatModuleIdBySlot).toHaveLength(
        PARTY_SLOT_COUNT,
      );
      expect(productionWave1.observedRuntimeAcquiredPassivesBySlot).toEqual(
        WAVE1_EMPTY_RUNTIME_PASSIVES_BY_SLOT,
      );
      assertWave1LedgerSpentZero(productionWave1.resourceLedgerWave1);
      wave1ReferenceByKey.set(key, productionWave1);

      const scale1 = runInstrumentedCase(
        baselineCase,
        createSeriesBWave2SorcererAtkScaleTransform(1.0),
      );
      expect(normalizeProblemSeriesSimResultForCompare(scale1.result)).toBe(
        productionNormalizedByKey.get(key),
      );
      assertTransformTouchesOnlyWave2ChainSorcererAtkScale(
        productionWaves,
        scale1.result.enemyWaveInputs,
        1.0,
      );
      expect(buildWave1Slice(scale1)).toEqual(productionWave1);
      expect(scale1.result.acquiredPassivesBySlot).toEqual(
        productionAcquiredPassivesByKey.get(key),
      );
    }
    expect(productionNormalizedByKey.size).toBe(9);
    expect(wave1ReferenceByKey.size).toBe(9);
    expect(productionAcquiredPassivesByKey.size).toBe(9);
    assertBaselineShaUnchanged();
  }, 300_000);

  it('transform scope: touches only Wave2 chain sorcerer atkScale', () => {
    assertBaselineShaUnchanged();
    expect(productionWaves).toHaveLength(3);
    const inputSnapshot = structuredClone(productionWaves);

    for (const atkScale of ATK_SCALE_POINTS) {
      const transform = createSeriesBWave2SorcererAtkScaleTransform(atkScale);
      const out = transform(productionWaves, transformContext());
      assertTransformTouchesOnlyWave2ChainSorcererAtkScale(
        productionWaves,
        out,
        atkScale,
      );
      expect(productionWaves).toEqual(inputSnapshot);
    }

    const omit = createSeriesBWave2SorcererAtkScaleTransform(1)(
      productionWaves,
      transformContext(),
    );
    const w2 = omit[WAVE2_INDEX]!;
    const sorcerer = w2.enemyGroups.find(
      (g) =>
        g.classId === 'at_sorcerer' &&
        g.selectedCombatModuleId === 'at_sorcerer_mod_chain',
    );
    expect(sorcerer).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(sorcerer, 'atkScale')).toBe(false);

    expect(() => createSeriesBWave2SorcererAtkScaleTransform(0)).toThrow(
      /finite number > 0/,
    );
    expect(() => createSeriesBWave2SorcererAtkScaleTransform(-1)).toThrow(
      /finite number > 0/,
    );
    expect(() => createSeriesBWave2SorcererAtkScaleTransform(Number.NaN)).toThrow(
      /finite number > 0/,
    );
    expect(() =>
      createSeriesBWave2SorcererAtkScaleTransform(1.25)(productionWaves, {
        ...transformContext(),
        seriesId: 'r12m_series_a',
      }),
    ).toThrow(/refuses seriesId/);
    expect(() =>
      createSeriesBWave2SorcererAtkScaleTransform(1.25)(productionWaves, {
        ...transformContext(),
        problemSeriesSeed: 'fixture-a',
      }),
    ).toThrow(/refuses problemSeriesSeed/);
    expect(() =>
      createSeriesBWave2SorcererAtkScaleTransform(1.25)(productionWaves, {
        ...transformContext(),
        generatorVersion: 'other',
      }),
    ).toThrow(/refuses generatorVersion/);

    const missing = structuredClone(productionWaves);
    missing[WAVE2_INDEX] = {
      ...missing[WAVE2_INDEX]!,
      enemyGroups: missing[WAVE2_INDEX]!.enemyGroups.filter(
        (g) => g.classId !== 'at_sorcerer',
      ),
    };
    expect(() =>
      createSeriesBWave2SorcererAtkScaleTransform(1.25)(missing, transformContext()),
    ).toThrow(/at_sorcerer_mod_chain groups/);

    const duplicated = structuredClone(productionWaves);
    const sorcererGroup = duplicated[WAVE2_INDEX]!.enemyGroups.find(
      (g) =>
        g.classId === 'at_sorcerer' &&
        g.selectedCombatModuleId === 'at_sorcerer_mod_chain',
    )!;
    duplicated[WAVE2_INDEX] = {
      ...duplicated[WAVE2_INDEX]!,
      enemyGroups: [...duplicated[WAVE2_INDEX]!.enemyGroups, { ...sorcererGroup }],
    };
    expect(() =>
      createSeriesBWave2SorcererAtkScaleTransform(1.25)(
        duplicated,
        transformContext(),
      ),
    ).toThrow(/at_sorcerer_mod_chain groups/);

    const wrongModule = structuredClone(productionWaves);
    wrongModule[WAVE2_INDEX] = {
      ...wrongModule[WAVE2_INDEX]!,
      enemyGroups: wrongModule[WAVE2_INDEX]!.enemyGroups.map((g) =>
        g.classId === 'at_sorcerer'
          ? { ...g, selectedCombatModuleId: 'at_sorcerer_mod_focus' }
          : g,
      ),
    };
    expect(() =>
      createSeriesBWave2SorcererAtkScaleTransform(1.25)(
        wrongModule,
        transformContext(),
      ),
    ).toThrow(/at_sorcerer_mod_chain groups/);

    assertBaselineShaUnchanged();
  });

  for (const atkScale of ATK_SCALE_POINTS) {
    it(
      `atkScale=${atkScale}: 9 cases, applied ATK, Wave2 flow, signals (asserted)`,
      async () => {
        assertBaselineShaUnchanged();
        expect(baselineCache).not.toBeNull();
        expect(productionWaves).toHaveLength(3);
        expect(wave1ReferenceByKey.size).toBe(9);

        const { rows, report } = await runSensitivityForAtkScale(
          atkScale,
          baselineCache!,
          productionWaves,
          wave1ReferenceByKey,
          productionAcquiredPassivesByKey,
        );
        expect(rows).toHaveLength(9);
        observationByScale.set(atkScale, { rows, report });
        assertObservedAtkScaleTransition(atkScale, rows, report);

        // eslint-disable-next-line no-console
        console.log(
          `1N atkScale=${atkScale} expectedAtk=${EXPECTED_APPLIED_ATK_BY_SCALE[atkScale]} signals: 即全滅=${formatSignalRefs(report.immediatePartyWipeCandidates)}; 無限膠着=${formatSignalRefs(report.stalemateCandidates)}; 選択無効=${formatIneffectivePairs(report.ineffectiveChoiceCandidatePairs)}; 単一正解化=${report.singleSolutionCandidateBuildIds.length === 0 ? '(empty)' : report.singleSolutionCandidateBuildIds.join(',')}`,
        );
        for (const row of rows) {
          // eslint-disable-next-line no-console
          console.log(
            [
              row.atkScale,
              row.appliedEnemySorcererAtk,
              row.buildId,
              row.battleRngSeed,
              row.outcome,
              row.finalWaveIndex,
              row.waveResults.join('/'),
              row.waveTicks.join('/'),
              row.tickCount,
              `A${row.survivingAllies}/E${row.survivingEnemies}`,
              `${row.totalRemainingAllyHp}/${row.totalMaxAllyHp}`,
              row.totalRemainingEnemyHp,
              row.timedOut ? 'TO' : 'ok',
              row.reachedWave3 ? 'W3Y' : 'W3N',
              row.wave3PlannedApplied ? 'P3Y' : 'P3N',
              `W2endAllyHp=${row.wave2Flow.wave2EndTotalAllyHp}`,
              `alive=${row.wave2Flow.lastAliveAllies.map((a) => `${a.classId}:${a.hp}/${a.maxHp}`).join(',')}`,
              `sorcT=${JSON.stringify(row.wave2Flow.enemySorcererDamageByTargetAllyClass)}`,
              `clericHeal=${JSON.stringify(row.wave2Flow.allyClericHealByTargetAllyClass)}`,
              `mod=${row.wave2Flow.wave2AppliedClericModuleId}`,
            ].join(' | '),
          );
        }
        assertBaselineShaUnchanged();
      },
      300_000,
    );
  }

  it('observes exactly 5 scale points × 9 cases without declaring production-ready', () => {
    expect(ATK_SCALE_POINTS).toEqual([1.0, 1.25, 1.5, 1.75, 2.0]);
    expect(ATK_SCALE_POINTS).toHaveLength(5);
    expect(BUILD_IDS).toHaveLength(3);
    expect(BATTLE_RNG_SEEDS).toHaveLength(3);
    expect(5 * 3 * 3).toBe(45);
    expect(observationByScale.size).toBe(5);
    const appliedAtks = ATK_SCALE_POINTS.map(
      (scale) => EXPECTED_APPLIED_ATK_BY_SCALE[scale],
    );
    expect(appliedAtks).toEqual([42, 53, 63, 74, 84]);
    expect(new Set(appliedAtks).size).toBe(5);
    for (const atkScale of ATK_SCALE_POINTS) {
      const pack = observationByScale.get(atkScale);
      expect(pack).toBeDefined();
      expect(pack!.rows).toHaveLength(9);
      expect(pack!.report.immediatePartyWipeCandidates).toEqual([]);
      expect(pack!.report.stalemateCandidates).toEqual([]);
      expect(pack!.report.ineffectiveChoiceCandidatePairs).toEqual([]);
      expect(pack!.report.singleSolutionCandidateBuildIds).toEqual([]);
    }
  });
});
