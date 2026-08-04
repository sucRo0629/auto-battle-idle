/**
 * R12n 1P — 系列B Wave 2 enemy sorcerer `atkScale` 上側質的遷移探索（test-only）。
 *
 * 単一所有者: 系列B Wave index 1 / at_sorcerer / at_sorcerer_mod_chain / atkScale のみ。
 * 上側 5 scale [2.00, 2.25, 2.50, 2.75, 3.00] × 3 build × 3 seed = 45 case。
 * scale 2.00 は受け入れ済み 1N 観測アンカー。production 採用・強度合格・次所有者決定はしない。
 * 候補検出は自動不合格ではなく、候補なしは強度合格ではない。
 *
 * 質的遷移: Wave2 alive class / Wave2 lethal signature / Wave3開始 alive class /
 * Wave3到達 / outcome / finalWaveIndex / final surviving class の最初の変化。
 * 単なる HP 数値変化は質的遷移と呼ばない。非単調は実観測として固定し原因断定しない。
 *
 * 1P-R1: production default 9 case の `appliedCombatModuleIdBySlot`（全4 slot）と
 * `resourceLedger`（全 Wave・全 field）を lossless 参照保存し、上側45 case の Result と
 * 直接 deep compareする。slotStats は診断収集であり production 不変とは仮定しない。
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
  createSeriesBWave2SorcererAtkScaleTransform,
  normalizeProblemSeriesSimResultForCompare,
  runProblemSeriesSim,
  SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET,
  type ProblemSeriesSimCombatActionDiagnostic,
  type ProblemSeriesSimCombatFlowDamageEvent,
  type ProblemSeriesSimCombatFlowHealEvent,
  type ProblemSeriesSimFinalEnemyDiagnostic,
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
const WAVE3_INDEX = 2;
const SLOT_CLERIC = 3;

const ATK_SCALE_POINTS = [2.0, 2.25, 2.5, 2.75, 3.0] as const;
const EXPECTED_APPLIED_ATK_BY_SCALE: Readonly<Record<number, number>> = {
  2.0: 84,
  2.25: 95,
  2.5: 105,
  2.75: 116,
  3.0: 126,
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

interface AllyHpObs {
  readonly classId: string;
  readonly hp: number;
  readonly maxHp: number;
}

interface LethalObs {
  readonly order: number;
  readonly actorClassId: string;
  readonly actorIsEnemy: boolean;
  readonly skillId: string;
  readonly targetClassId: string;
  readonly targetIsEnemy: boolean;
  readonly battleTimeSec: number;
}

interface LethalSignatureEntry {
  readonly order: number;
  readonly actorClassId: string;
  readonly actorIsEnemy: boolean;
  readonly skillId: string;
  readonly targetClassId: string;
  readonly targetIsEnemy: boolean;
}

interface QualitativeSignature {
  readonly wave2AliveAllyClassSet: readonly string[];
  readonly wave2LethalSignature: readonly LethalSignatureEntry[];
  readonly wave3StartAliveAllyClassSet: readonly string[] | null;
  readonly reachedWave3: boolean;
  readonly outcome: ProblemSeriesSimResult['outcome'];
  readonly finalWaveIndex: number;
  readonly finalSurvivingAllyClassSet: readonly string[];
}

type ExpectedObsCase = {
  readonly outcome: ProblemSeriesSimResult['outcome'];
  readonly finalWaveIndex: number;
  readonly reachedWave2: boolean;
  readonly reachedWave3: boolean;
  readonly appliedEnemySorcererAtk: number;
  readonly lastAliveAllies: readonly AllyHpObs[];
  readonly wave3StartAliveAllies: readonly AllyHpObs[] | null;
  readonly enemySorcererDamageByTargetAllyClass: Readonly<Record<string, ClassAgg>>;
  readonly allyClericHealByTargetAllyClass: Readonly<Record<string, ClassAgg>>;
  readonly wave2AppliedClericModuleId: string;
  readonly wave2EndTotalAllyHp: number;
  readonly totalRemainingAllyHp: number;
  readonly survivingAllies: number;
  readonly finalSurvivors: readonly AllyHpObs[];
  readonly lethals: readonly LethalObs[];
  readonly sorcererActionCount: number;
  readonly qualitativeSig: QualitativeSignature;
  readonly finalEnemySurvivingClassIds: readonly string[];
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

type TransitionExpectation = {
  readonly firstTransitionScale: number | null;
  readonly before: QualitativeSignature;
  readonly after: QualitativeSignature | null;
  readonly changedFields: readonly string[];
};

const EXPECTED_OBS_BY_SCALE_RAW = {"2":{"signals":{"wipe":[],"stalemate":[],"ineffective":[],"single":[]},"cases":{"no-spend-control::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":268,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":488,"totalRemainingAllyHp":491,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":75,"maxHp":155},{"classId":"df_guardian","hp":236,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"no-spend-control::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":268,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":488,"totalRemainingAllyHp":491,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":75,"maxHp":155},{"classId":"df_guardian","hp":236,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"no-spend-control::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":268,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":488,"totalRemainingAllyHp":491,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":75,"maxHp":155},{"classId":"df_guardian","hp":236,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"single-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":278,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":498,"totalRemainingAllyHp":519,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":82,"maxHp":155},{"classId":"df_guardian","hp":257,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"single-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":268,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":488,"totalRemainingAllyHp":509,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":82,"maxHp":155},{"classId":"df_guardian","hp":247,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"single-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":268,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":488,"totalRemainingAllyHp":499,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":82,"maxHp":155},{"classId":"df_guardian","hp":237,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"party-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":25,"maxHp":155},{"classId":"df_guardian","hp":281,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":12},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":486,"totalRemainingAllyHp":464,"survivingAllies":3,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":284,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"party-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":25,"maxHp":155},{"classId":"df_guardian","hp":271,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":12},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":476,"totalRemainingAllyHp":454,"survivingAllies":3,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":274,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"party-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":25,"maxHp":155},{"classId":"df_guardian","hp":271,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":12},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":476,"totalRemainingAllyHp":444,"survivingAllies":3,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":264,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]}}},"3":{"signals":{"wipe":[],"stalemate":[],"ineffective":[],"single":[]},"cases":{"no-spend-control::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":126,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":202,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":169},"df_guardian":{"count":3,"total":243}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":2,"total":27}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":382,"totalRemainingAllyHp":492,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":75,"maxHp":155},{"classId":"df_guardian","hp":237,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"no-spend-control::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":126,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":202,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":169},"df_guardian":{"count":3,"total":243}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":2,"total":27}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":382,"totalRemainingAllyHp":491,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":75,"maxHp":155},{"classId":"df_guardian","hp":236,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"no-spend-control::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":126,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":202,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":169},"df_guardian":{"count":3,"total":243}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":2,"total":27}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":382,"totalRemainingAllyHp":491,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":75,"maxHp":155},{"classId":"df_guardian","hp":236,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"single-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":126,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":212,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":169},"df_guardian":{"count":3,"total":243}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":2,"total":27}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":392,"totalRemainingAllyHp":520,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":82,"maxHp":155},{"classId":"df_guardian","hp":258,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.466666666665766}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"single-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":126,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":202,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":169},"df_guardian":{"count":3,"total":243}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":2,"total":27}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":382,"totalRemainingAllyHp":499,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":82,"maxHp":155},{"classId":"df_guardian","hp":237,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"single-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":126,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":202,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":169},"df_guardian":{"count":3,"total":243}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":2,"total":27}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":382,"totalRemainingAllyHp":624,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":110,"maxHp":155},{"classId":"df_guardian","hp":334,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"party-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":126,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":201,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":148},"df_guardian":{"count":3,"total":243}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":1,"total":6},"df_guardian":{"count":3,"total":16}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":381,"totalRemainingAllyHp":465,"survivingAllies":3,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":285,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.466666666665766}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"party-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":126,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":191,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":148},"df_guardian":{"count":3,"total":243}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":1,"total":6},"df_guardian":{"count":3,"total":16}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":371,"totalRemainingAllyHp":444,"survivingAllies":3,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":264,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"party-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":126,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":191,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":148},"df_guardian":{"count":3,"total":243}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":1,"total":6},"df_guardian":{"count":3,"total":16}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":371,"totalRemainingAllyHp":578,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":47,"maxHp":155},{"classId":"df_guardian","hp":351,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]}}},"2.25":{"signals":{"wipe":[],"stalemate":[],"ineffective":[],"single":[]},"cases":{"no-spend-control::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":95,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":22,"maxHp":155},{"classId":"df_guardian","hp":247,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":147},"df_guardian":{"count":3,"total":183}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":449,"totalRemainingAllyHp":491,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":75,"maxHp":155},{"classId":"df_guardian","hp":236,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"no-spend-control::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":95,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":22,"maxHp":155},{"classId":"df_guardian","hp":247,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":147},"df_guardian":{"count":3,"total":183}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":449,"totalRemainingAllyHp":491,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":75,"maxHp":155},{"classId":"df_guardian","hp":236,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"no-spend-control::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":95,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":22,"maxHp":155},{"classId":"df_guardian","hp":247,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":147},"df_guardian":{"count":3,"total":183}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":449,"totalRemainingAllyHp":491,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":75,"maxHp":155},{"classId":"df_guardian","hp":236,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"single-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":95,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":22,"maxHp":155},{"classId":"df_guardian","hp":257,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":147},"df_guardian":{"count":3,"total":183}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":459,"totalRemainingAllyHp":519,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":82,"maxHp":155},{"classId":"df_guardian","hp":257,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"single-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":95,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":22,"maxHp":155},{"classId":"df_guardian","hp":247,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":147},"df_guardian":{"count":3,"total":183}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":449,"totalRemainingAllyHp":509,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":82,"maxHp":155},{"classId":"df_guardian","hp":247,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"single-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":95,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":22,"maxHp":155},{"classId":"df_guardian","hp":247,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":147},"df_guardian":{"count":3,"total":183}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":449,"totalRemainingAllyHp":499,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":82,"maxHp":155},{"classId":"df_guardian","hp":237,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"party-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":95,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":7,"maxHp":155},{"classId":"df_guardian","hp":260,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":147},"df_guardian":{"count":3,"total":183}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":12},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":447,"totalRemainingAllyHp":464,"survivingAllies":3,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":284,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"party-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":95,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":7,"maxHp":155},{"classId":"df_guardian","hp":250,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":147},"df_guardian":{"count":3,"total":183}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":12},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":437,"totalRemainingAllyHp":454,"survivingAllies":3,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":274,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"party-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":95,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":7,"maxHp":155},{"classId":"df_guardian","hp":250,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":147},"df_guardian":{"count":3,"total":183}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":12},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":437,"totalRemainingAllyHp":444,"survivingAllies":3,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":264,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]}}},"2.5":{"signals":{"wipe":[],"stalemate":[],"ineffective":[],"single":[]},"cases":{"no-spend-control::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":105,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":7,"maxHp":155},{"classId":"df_guardian","hp":226,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":162},"df_guardian":{"count":3,"total":204}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":413,"totalRemainingAllyHp":491,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":75,"maxHp":155},{"classId":"df_guardian","hp":236,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"no-spend-control::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":105,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":7,"maxHp":155},{"classId":"df_guardian","hp":226,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":162},"df_guardian":{"count":3,"total":204}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":413,"totalRemainingAllyHp":491,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":75,"maxHp":155},{"classId":"df_guardian","hp":236,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"no-spend-control::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":105,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":7,"maxHp":155},{"classId":"df_guardian","hp":226,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":162},"df_guardian":{"count":3,"total":204}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":413,"totalRemainingAllyHp":491,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":75,"maxHp":155},{"classId":"df_guardian","hp":236,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"single-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":105,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":7,"maxHp":155},{"classId":"df_guardian","hp":236,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":162},"df_guardian":{"count":3,"total":204}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":423,"totalRemainingAllyHp":519,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":82,"maxHp":155},{"classId":"df_guardian","hp":257,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"single-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":105,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":7,"maxHp":155},{"classId":"df_guardian","hp":226,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":162},"df_guardian":{"count":3,"total":204}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":413,"totalRemainingAllyHp":509,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":82,"maxHp":155},{"classId":"df_guardian","hp":247,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"single-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":105,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":7,"maxHp":155},{"classId":"df_guardian","hp":226,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":162},"df_guardian":{"count":3,"total":204}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":413,"totalRemainingAllyHp":499,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":82,"maxHp":155},{"classId":"df_guardian","hp":237,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":37.43333333333249}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"party-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":105,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":239,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":148},"df_guardian":{"count":3,"total":204}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":1,"total":6},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":419,"totalRemainingAllyHp":465,"survivingAllies":3,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":285,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.466666666665766}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"party-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":105,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":229,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":148},"df_guardian":{"count":3,"total":204}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":1,"total":6},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":409,"totalRemainingAllyHp":444,"survivingAllies":3,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":264,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"party-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":105,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":229,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":148},"df_guardian":{"count":3,"total":204}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":1,"total":6},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":409,"totalRemainingAllyHp":578,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":47,"maxHp":155},{"classId":"df_guardian","hp":351,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]}}},"2.75":{"signals":{"wipe":[],"stalemate":[],"ineffective":[],"single":[]},"cases":{"no-spend-control::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":116,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":220,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":169},"df_guardian":{"count":3,"total":225}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":2,"total":27}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":400,"totalRemainingAllyHp":492,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":75,"maxHp":155},{"classId":"df_guardian","hp":237,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"no-spend-control::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":116,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":220,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":169},"df_guardian":{"count":3,"total":225}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":2,"total":27}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":400,"totalRemainingAllyHp":491,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":75,"maxHp":155},{"classId":"df_guardian","hp":236,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"no-spend-control::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":116,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":220,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":169},"df_guardian":{"count":3,"total":225}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":2,"total":27}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":400,"totalRemainingAllyHp":491,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":75,"maxHp":155},{"classId":"df_guardian","hp":236,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"single-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":116,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":227,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":169},"df_guardian":{"count":3,"total":225}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":2,"total":24}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":407,"totalRemainingAllyHp":520,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":82,"maxHp":155},{"classId":"df_guardian","hp":258,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.466666666665766}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"single-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":116,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":220,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":169},"df_guardian":{"count":3,"total":225}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":2,"total":27}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":400,"totalRemainingAllyHp":499,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":82,"maxHp":155},{"classId":"df_guardian","hp":237,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"single-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":116,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":220,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":169},"df_guardian":{"count":3,"total":225}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":2,"total":27}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":400,"totalRemainingAllyHp":624,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":110,"maxHp":155},{"classId":"df_guardian","hp":334,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"party-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":116,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":218,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":148},"df_guardian":{"count":3,"total":225}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":1,"total":6},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":398,"totalRemainingAllyHp":465,"survivingAllies":3,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":285,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.466666666665766}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"party-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":116,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":209,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":148},"df_guardian":{"count":3,"total":225}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":1,"total":6},"df_guardian":{"count":3,"total":16}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":389,"totalRemainingAllyHp":444,"survivingAllies":3,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":264,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]},"party-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":116,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":209,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"wave3StartAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":155,"maxHp":155},{"classId":"df_guardian","hp":420,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":148},"df_guardian":{"count":3,"total":225}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":1,"total":6},"df_guardian":{"count":3,"total":16}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":389,"totalRemainingAllyHp":578,"survivingAllies":4,"finalSurvivors":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":47,"maxHp":155},{"classId":"df_guardian","hp":351,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"lethals":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true,"battleTimeSec":34.91666666666597},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false,"battleTimeSec":36.46666666666588},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true,"battleTimeSec":38.73333333333242}],"sorcererActionCount":3,"qualitativeSig":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalEnemySurvivingClassIds":[]}}}} as const;

const EXPECTED_FIRST_TRANSITION_BY_CASE_RAW = {"no-spend-control::r12n-1d-b-01":{"firstTransitionScale":2.75,"before":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"after":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"changedFields":["wave2AliveAllyClassSet","wave2LethalSignature"]},"no-spend-control::r12n-1d-b-02":{"firstTransitionScale":2.75,"before":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"after":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"changedFields":["wave2AliveAllyClassSet","wave2LethalSignature"]},"no-spend-control::r12n-1d-b-03":{"firstTransitionScale":2.75,"before":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"after":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"changedFields":["wave2AliveAllyClassSet","wave2LethalSignature"]},"party-mend-24::r12n-1d-b-01":{"firstTransitionScale":2.5,"before":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"after":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"changedFields":["wave2AliveAllyClassSet","wave2LethalSignature"]},"party-mend-24::r12n-1d-b-02":{"firstTransitionScale":2.5,"before":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"after":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"changedFields":["wave2AliveAllyClassSet","wave2LethalSignature"]},"party-mend-24::r12n-1d-b-03":{"firstTransitionScale":2.5,"before":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"after":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"changedFields":["wave2AliveAllyClassSet","wave2LethalSignature","finalSurvivingAllyClassSet"]},"single-mend-24::r12n-1d-b-01":{"firstTransitionScale":2.75,"before":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"after":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"changedFields":["wave2AliveAllyClassSet","wave2LethalSignature"]},"single-mend-24::r12n-1d-b-02":{"firstTransitionScale":2.75,"before":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"after":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"changedFields":["wave2AliveAllyClassSet","wave2LethalSignature"]},"single-mend-24::r12n-1d-b-03":{"firstTransitionScale":2.75,"before":{"wave2AliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"after":{"wave2AliveAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"],"wave2LethalSignature":[{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"skillId":"at_swordsman_mod_single_slash","targetClassId":"at_swordsman","targetIsEnemy":true},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"skillId":"at_sorcerer_mod_chain","targetClassId":"at_swordsman","targetIsEnemy":false},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"skillId":"at_sorcerer_mod_focus","targetClassId":"at_sorcerer","targetIsEnemy":true}],"wave3StartAliveAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"reachedWave3":true,"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"changedFields":["wave2AliveAllyClassSet","wave2LethalSignature"]}} as const;

const EXPECTED_OBS_BY_SCALE = EXPECTED_OBS_BY_SCALE_RAW as unknown as Readonly<
  Record<AtkScale, ExpectedObsPack>
>;

const EXPECTED_FIRST_TRANSITION_BY_CASE =
  EXPECTED_FIRST_TRANSITION_BY_CASE_RAW as unknown as Readonly<
    Record<string, TransitionExpectation>
  >;

/** 1N scale 2.00 受け入れ済みアンカー（自己比較ではない明示期待）。 */
const SCALE_2_ANCHOR_FROM_1N = {"no-spend-control::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":268,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":488,"totalRemainingAllyHp":491,"survivingAllies":4},"no-spend-control::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":268,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":488,"totalRemainingAllyHp":491,"survivingAllies":4},"no-spend-control::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":268,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":488,"totalRemainingAllyHp":491,"survivingAllies":4},"single-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":278,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":498,"totalRemainingAllyHp":519,"survivingAllies":4},"single-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":268,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":488,"totalRemainingAllyHp":509,"survivingAllies":4},"single-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":40,"maxHp":155},{"classId":"df_guardian","hp":268,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":27},"df_guardian":{"count":1,"total":12}},"wave2AppliedClericModuleId":"sp_cleric_mod_single_mend","wave2EndTotalAllyHp":488,"totalRemainingAllyHp":499,"survivingAllies":4},"party-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":25,"maxHp":155},{"classId":"df_guardian","hp":281,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":12},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":486,"totalRemainingAllyHp":464,"survivingAllies":3},"party-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":25,"maxHp":155},{"classId":"df_guardian","hp":271,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":12},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":476,"totalRemainingAllyHp":454,"survivingAllies":3},"party-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"reachedWave2":true,"reachedWave3":true,"appliedEnemySorcererAtk":84,"lastAliveAllies":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":25,"maxHp":155},{"classId":"df_guardian","hp":271,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}],"enemySorcererDamageByTargetAllyClass":{"at_swordsman":{"count":3,"total":129},"df_guardian":{"count":3,"total":162}},"allyClericHealByTargetAllyClass":{"at_swordsman":{"count":2,"total":12},"df_guardian":{"count":3,"total":15}},"wave2AppliedClericModuleId":"sp_cleric_mod_party_mend","wave2EndTotalAllyHp":476,"totalRemainingAllyHp":444,"survivingAllies":3}} as const;

interface Wave2FlowObs {
  readonly enemySorcererDamageByTargetAllyClass: Readonly<Record<string, ClassAgg>>;
  readonly allyClericHealByTargetAllyClass: Readonly<Record<string, ClassAgg>>;
  readonly lethals: readonly LethalObs[];
  readonly lastAliveAllies: readonly AllyHpObs[];
  readonly wave2EndTotalAllyHp: number;
  readonly wave2AppliedClericModuleId: string;
  readonly enemySorcererActionCount: number;
  readonly enemySorcererDamageCount: number;
}

interface Wave1StartAllyObs {
  readonly partySlotIndex: number;
  readonly classId: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly barrierHp: number;
  readonly atk: number;
  readonly basicSkillId: string;
}

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
  readonly observedCombatModuleIdBySlot: readonly string[];
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
  readonly wave3StartAliveAllies: readonly AllyHpObs[] | null;
  readonly finalSurvivors: readonly AllyHpObs[];
  readonly qualitativeSig: QualitativeSignature;
  readonly finalEnemy: ProblemSeriesSimFinalEnemyDiagnostic;
  readonly wave1Slice: Wave1InvariantSlice;
}

interface DiagnosticBundle {
  readonly result: ProblemSeriesSimResult;
  readonly damageEvents: readonly ProblemSeriesSimCombatFlowDamageEvent[];
  readonly healEvents: readonly ProblemSeriesSimCombatFlowHealEvent[];
  readonly actionEvents: readonly ProblemSeriesSimCombatActionDiagnostic[];
  readonly tickStates: readonly ProblemSeriesSimTickStateDiagnostic[];
  readonly finalEnemy: ProblemSeriesSimFinalEnemyDiagnostic;
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
        expect(afterGroup.atkScale).toBe(atkScale);
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

function allyClassSet(units: readonly AllyHpObs[]): string[] {
  return [...new Set(units.map((u) => u.classId))].sort();
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

function observeWave1RuntimeAcquiredPassivesBySlot(
  tickStates: readonly ProblemSeriesSimTickStateDiagnostic[],
): readonly (readonly string[])[] {
  let wave1TickCount = 0;
  let observed: readonly (readonly string[])[] | null = null;

  for (const state of tickStates) {
    if (state.waveIndex !== WAVE1_INDEX) continue;
    wave1TickCount += 1;
    expect(state.acquiredPassivesBySlot).toHaveLength(PARTY_SLOT_COUNT);
    for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
      const ids = state.acquiredPassivesBySlot[slotIndex];
      expect(ids).toBeDefined();
      expect(Array.isArray(ids)).toBe(true);
      expect(ids).toEqual([]);
    }
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

  const sorcererByTarget = new Map<string, { count: number; total: number }>();
  const clericHealByTarget = new Map<string, { count: number; total: number }>();
  const lethals: LethalObs[] = [];
  let enemySorcererDamageCount = 0;

  for (const event of damageEvents) {
    expect(event.actor.classId.length).toBeGreaterThan(0);
    expect(event.target.classId.length).toBeGreaterThan(0);
    if (event.actor.isEnemy && event.actor.classId === 'at_sorcerer' && !event.target.isEnemy) {
      enemySorcererDamageCount += 1;
      addAgg(sorcererByTarget, event.target.classId, event.amount);
    }
    if (event.lethal) {
      expect(event.skillId.length).toBeGreaterThan(0);
      expect(Number.isFinite(event.battleTimeSec)).toBe(true);
      lethals.push({
        order: lethals.length + 1,
        actorClassId: event.actor.classId,
        actorIsEnemy: event.actor.isEnemy,
        skillId: event.skillId,
        targetClassId: event.target.classId,
        targetIsEnemy: event.target.isEnemy,
        battleTimeSec: event.battleTimeSec,
      });
    }
  }

  for (const event of healEvents) {
    if (
      !event.actor.isEnemy &&
      event.actor.classId === 'sp_cleric' &&
      !event.target.isEnemy
    ) {
      addAgg(clericHealByTarget, event.target.classId, event.amount);
    }
  }

  const enemySorcererActionCount = actionEvents.filter(
    (e) =>
      e.actor.isEnemy &&
      e.actor.classId === 'at_sorcerer' &&
      e.skillId === SERIES_B_WAVE2_SORCERER_ATK_SCALE_TARGET.selectedCombatModuleId,
  ).length;

  const lastWave2 = lastTickForWave(bundle.tickStates, WAVE2_INDEX);
  expect(lastWave2).not.toBeNull();
  const lastAliveAllies = allyHpSnapshot(lastWave2!.allies);
  const wave2EndTotalAllyHp = lastAliveAllies.reduce((sum, a) => sum + a.hp, 0);
  const wave2AppliedClericModuleId =
    result.appliedCombatModuleIdBySlot[SLOT_CLERIC] ?? '';

  return {
    enemySorcererDamageByTargetAllyClass: freezeAggMap(sorcererByTarget),
    allyClericHealByTargetAllyClass: freezeAggMap(clericHealByTarget),
    lethals,
    lastAliveAllies,
    wave2EndTotalAllyHp,
    wave2AppliedClericModuleId,
    enemySorcererActionCount,
    enemySorcererDamageCount,
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

function buildQualitativeSignature(
  wave2Flow: Wave2FlowObs,
  wave3StartAliveAllies: readonly AllyHpObs[] | null,
  finalSurvivors: readonly AllyHpObs[],
  result: ProblemSeriesSimResult,
): QualitativeSignature {
  return {
    wave2AliveAllyClassSet: allyClassSet(wave2Flow.lastAliveAllies),
    wave2LethalSignature: wave2Flow.lethals.map((l) => ({
      order: l.order,
      actorClassId: l.actorClassId,
      actorIsEnemy: l.actorIsEnemy,
      skillId: l.skillId,
      targetClassId: l.targetClassId,
      targetIsEnemy: l.targetIsEnemy,
    })),
    wave3StartAliveAllyClassSet:
      wave3StartAliveAllies === null ? null : allyClassSet(wave3StartAliveAllies),
    reachedWave3: result.finalWaveIndex >= WAVE3_INDEX,
    outcome: result.outcome,
    finalWaveIndex: result.finalWaveIndex,
    finalSurvivingAllyClassSet: allyClassSet(finalSurvivors),
  };
}

function runInstrumentedCase(
  baselineCase: SeriesBBaselineCase,
  transform: ProblemSeriesSimResolvedWaveTransform,
): DiagnosticBundle {
  const damageEvents: ProblemSeriesSimCombatFlowDamageEvent[] = [];
  const healEvents: ProblemSeriesSimCombatFlowHealEvent[] = [];
  const actionEvents: ProblemSeriesSimCombatActionDiagnostic[] = [];
  const tickStates: ProblemSeriesSimTickStateDiagnostic[] = [];
  let finalEnemy: ProblemSeriesSimFinalEnemyDiagnostic | null = null;

  const result = runProblemSeriesSim({
    ...baselineCase.input,
    transformResolvedBattleWaves: transform,
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
    onFinalEnemyDiagnostic: (diagnostic) => {
      finalEnemy = diagnostic;
    },
  });

  expect(damageEvents.length + healEvents.length + actionEvents.length).toBeGreaterThan(
    0,
  );
  expect(tickStates.length).toBeGreaterThan(0);
  expect(finalEnemy).not.toBeNull();

  return {
    result,
    damageEvents,
    healEvents,
    actionEvents,
    tickStates,
    finalEnemy: finalEnemy!,
  };
}

function runProductionReferenceCase(
  baselineCase: SeriesBBaselineCase,
): DiagnosticBundle {
  const damageEvents: ProblemSeriesSimCombatFlowDamageEvent[] = [];
  const healEvents: ProblemSeriesSimCombatFlowHealEvent[] = [];
  const actionEvents: ProblemSeriesSimCombatActionDiagnostic[] = [];
  const tickStates: ProblemSeriesSimTickStateDiagnostic[] = [];
  let finalEnemy: ProblemSeriesSimFinalEnemyDiagnostic | null = null;

  const result = runProblemSeriesSim({
    ...baselineCase.input,
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
    onFinalEnemyDiagnostic: (diagnostic) => {
      finalEnemy = diagnostic;
    },
  });

  expect(finalEnemy).not.toBeNull();
  return {
    result,
    damageEvents,
    healEvents,
    actionEvents,
    tickStates,
    finalEnemy: finalEnemy!,
  };
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

function caseKey(buildId: BuildId, battleRngSeed: BattleRngSeed): string {
  return `${buildId}::${battleRngSeed}`;
}

/** production 非波及参照: 全 slot Module + 全 Wave ledger（Result と配列／object 参照を共有しない）。 */
interface ProductionAppliedModuleAndLedgerRef {
  readonly appliedCombatModuleIdBySlot: readonly string[];
  readonly resourceLedger: ProblemSeriesSimResult['resourceLedger'];
}

/**
 * test-only。appliedCombatModuleIdBySlot を lossless コピー。
 * 長さ不正・slot 欠落は空文字へ正規化せず fail-closed。
 */
function copyAppliedCombatModuleIdBySlotForProductionRef(
  modules: readonly string[],
): readonly string[] {
  if (modules.length !== PARTY_SLOT_COUNT) {
    throw new Error(
      `appliedCombatModuleIdBySlot production ref requires exactly ${PARTY_SLOT_COUNT} slots, got ${modules.length}`,
    );
  }
  const copied: string[] = [];
  for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
    const slotPresent = Object.prototype.hasOwnProperty.call(modules, slotIndex);
    const value = slotPresent ? modules[slotIndex] : undefined;
    if (!slotPresent || value === undefined) {
      throw new Error(
        `appliedCombatModuleIdBySlot production ref missing slot at index ${slotIndex}`,
      );
    }
    if (typeof value !== 'string') {
      throw new Error(
        `appliedCombatModuleIdBySlot production ref slot ${slotIndex} must be a string, got ${typeof value}`,
      );
    }
    copied.push(value);
  }
  return copied;
}

/**
 * test-only。resourceLedger を全 field lossless コピー。
 * Wave index 連続性欠落・entry 欠落は fail-closed（空 entry へ正規化しない）。
 * grant / spent / remaining（after）等の既存 field をすべて保持する。
 */
function copyResourceLedgerForProductionRef(
  ledger: ProblemSeriesSimResult['resourceLedger'],
): ProblemSeriesSimResult['resourceLedger'] {
  if (!Array.isArray(ledger) || ledger.length < 1) {
    throw new Error(
      `resourceLedger production ref requires at least 1 wave entry, got ${
        Array.isArray(ledger) ? ledger.length : String(ledger)
      }`,
    );
  }
  const copied: Array<{
    waveIndex: number;
    grantAmount: number;
    spentAmount: number;
    remainingResource: number;
  }> = [];
  for (let i = 0; i < ledger.length; i++) {
    const entryPresent = Object.prototype.hasOwnProperty.call(ledger, i);
    const entry = entryPresent ? ledger[i] : undefined;
    if (!entryPresent || entry === undefined) {
      throw new Error(
        `resourceLedger production ref missing wave at index ${i}`,
      );
    }
    if (entry.waveIndex !== i) {
      throw new Error(
        `resourceLedger production ref missing wave ${i}: found waveIndex ${String(entry.waveIndex)}`,
      );
    }
    // 可変 object 参照を共有しない。waveIndex / grantAmount / spentAmount / remainingResource を全 field 保持。
    copied.push({
      waveIndex: entry.waveIndex,
      grantAmount: entry.grantAmount,
      spentAmount: entry.spentAmount,
      remainingResource: entry.remainingResource,
    });
  }
  return copied;
}

function storeProductionAppliedModuleAndLedgerRef(
  map: Map<string, ProductionAppliedModuleAndLedgerRef>,
  key: string,
  result: Pick<
    ProblemSeriesSimResult,
    'appliedCombatModuleIdBySlot' | 'resourceLedger'
  >,
): void {
  if (map.has(key)) {
    throw new Error(
      `duplicate production applied module/ledger ref key: ${key}`,
    );
  }
  map.set(key, {
    appliedCombatModuleIdBySlot: copyAppliedCombatModuleIdBySlotForProductionRef(
      result.appliedCombatModuleIdBySlot,
    ),
    resourceLedger: copyResourceLedgerForProductionRef(result.resourceLedger),
  });
}

function requireProductionAppliedModuleAndLedgerRef(
  map: ReadonlyMap<string, ProductionAppliedModuleAndLedgerRef>,
  key: string,
): ProductionAppliedModuleAndLedgerRef {
  if (!map.has(key)) {
    throw new Error(
      `missing production applied module/ledger ref key: ${key}`,
    );
  }
  return map.get(key)!;
}

function assertExactNineProductionModuleLedgerKeys(
  map: ReadonlyMap<string, ProductionAppliedModuleAndLedgerRef>,
): void {
  const expectedKeys = new Set<string>();
  for (const buildId of BUILD_IDS) {
    for (const seed of BATTLE_RNG_SEEDS) {
      expectedKeys.add(caseKey(buildId, seed));
    }
  }
  expect(expectedKeys.size).toBe(9);
  expect(map.size).toBe(9);
  for (const key of expectedKeys) {
    // key 欠落は fail-closed（get undefined を通さない）。
    const ref = requireProductionAppliedModuleAndLedgerRef(map, key);
    expect(ref.appliedCombatModuleIdBySlot).toHaveLength(PARTY_SLOT_COUNT);
    expect(ref.resourceLedger.length).toBeGreaterThanOrEqual(1);
  }
  for (const key of map.keys()) {
    expect(expectedKeys.has(key)).toBe(true);
  }
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
  expect(byKey.size).toBe(9);
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

async function runUpperForAtkScale(
  atkScale: AtkScale,
  baseline: SeriesBBaselineFile,
  productionWaves: readonly ProblemSeriesBattleWave[],
  wave1ReferenceByKey: ReadonlyMap<string, Wave1InvariantSlice>,
  productionAcquiredPassivesByKey: ReadonlyMap<
    string,
    readonly (readonly string[])[]
  >,
  productionAppliedModuleAndLedgerByKey: ReadonlyMap<
    string,
    ProductionAppliedModuleAndLedgerRef
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

    // 1P-R1: 全 slot Module と全 Wave ledger を production 参照へ直接 deep compare。
    const productionModuleLedger = requireProductionAppliedModuleAndLedgerRef(
      productionAppliedModuleAndLedgerByKey,
      key,
    );
    expect(result.appliedCombatModuleIdBySlot).toEqual(
      productionModuleLedger.appliedCombatModuleIdBySlot,
    );
    expect(result.resourceLedger).toEqual(productionModuleLedger.resourceLedger);
    expect(result.appliedCombatModuleIdBySlot).toHaveLength(PARTY_SLOT_COUNT);
    expect(result.appliedCombatModuleIdBySlot).not.toBe(
      productionModuleLedger.appliedCombatModuleIdBySlot,
    );
    expect(result.resourceLedger).not.toBe(productionModuleLedger.resourceLedger);

    const wave3Planned = wave3PlannedPassiveIds(wavePlans);
    const acquired = allAcquiredPassiveIds(result);
    const reachedWave2 = result.finalWaveIndex >= WAVE2_INDEX;
    const reachedWave3 = result.finalWaveIndex >= WAVE3_INDEX;
    if (reachedWave3) {
      expect(result.waves.some((w) => w.waveIndex === WAVE3_INDEX)).toBe(true);
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
    expect(wave2Flow.enemySorcererActionCount).toBeGreaterThan(0);
    expect(wave2Flow.enemySorcererDamageCount).toBeGreaterThan(0);

    const firstWave3 = firstTickForWave(bundle.tickStates, WAVE3_INDEX);
    const wave3StartAliveAllies =
      firstWave3 === null ? null : allyHpSnapshot(firstWave3.allies);
    if (reachedWave3) {
      expect(wave3StartAliveAllies).not.toBeNull();
      expect(wave3StartAliveAllies!.length).toBeGreaterThan(0);
    } else {
      expect(wave3StartAliveAllies).toBeNull();
    }

    const finalWaveLast = lastTickForWave(bundle.tickStates, result.finalWaveIndex);
    expect(finalWaveLast).not.toBeNull();
    const finalSurvivors = allyHpSnapshot(finalWaveLast!.allies);
    const qualitativeSig = buildQualitativeSignature(
      wave2Flow,
      wave3StartAliveAllies,
      finalSurvivors,
      result,
    );

    const wave1Slice = buildWave1Slice(bundle);
    const referenceWave1 = wave1ReferenceByKey.get(key);
    expect(referenceWave1).toBeDefined();
    expect(wave1Slice).toEqual(referenceWave1);

    expect(bundle.finalEnemy.outcome).toBe(result.outcome);
    expect(bundle.finalEnemy.finalWaveIndex).toBe(result.finalWaveIndex);

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
      wave3StartAliveAllies,
      finalSurvivors,
      qualitativeSig,
      finalEnemy: bundle.finalEnemy,
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

function assertObservedAtkScalePack(
  atkScale: AtkScale,
  rows: readonly SensitivityCaseRow[],
  report: ProblemSeriesBalanceSignalReport,
): void {
  expect(rows).toHaveLength(9);
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
      expect(row.wave3StartAliveAllies).toEqual(expected.wave3StartAliveAllies);
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
      expect(row.finalSurvivors).toEqual(expected.finalSurvivors);
      expect(row.wave2Flow.lethals).toEqual(expected.lethals);
      expect(row.wave2Flow.enemySorcererActionCount).toBe(
        expected.sorcererActionCount,
      );
      expect(row.qualitativeSig).toEqual(expected.qualitativeSig);
      expect(
        row.finalEnemy.survivingEnemies.map((e) => e.classId).sort(),
      ).toEqual([...expected.finalEnemySurvivingClassIds]);
      expect(row.timedOut).toBe(false);
      expect(row.survivingEnemies).toBe(0);
      expect(row.totalRemainingEnemyHp).toBe(0);
      expect(row.totalMaxAllyHp).toBe(755);
    }
  }
}

function assertScale2AnchorsAgainst1N(rows: readonly SensitivityCaseRow[]): void {
  const byKey = indexRowsByBuildSeed(rows);
  expect(Object.keys(SCALE_2_ANCHOR_FROM_1N)).toHaveLength(9);
  for (const seed of BATTLE_RNG_SEEDS) {
    for (const buildId of BUILD_IDS) {
      const key = caseKey(buildId, seed);
      const row = requireRow(byKey, buildId, seed);
      const anchor = SCALE_2_ANCHOR_FROM_1N[key as keyof typeof SCALE_2_ANCHOR_FROM_1N];
      expect(anchor).toBeDefined();
      expect(row.outcome).toBe(anchor.outcome);
      expect(row.finalWaveIndex).toBe(anchor.finalWaveIndex);
      expect(row.reachedWave2).toBe(anchor.reachedWave2);
      expect(row.reachedWave3).toBe(anchor.reachedWave3);
      expect(row.appliedEnemySorcererAtk).toBe(anchor.appliedEnemySorcererAtk);
      expect(row.wave2Flow.lastAliveAllies).toEqual(anchor.lastAliveAllies);
      expect(row.wave2Flow.enemySorcererDamageByTargetAllyClass).toEqual(
        anchor.enemySorcererDamageByTargetAllyClass,
      );
      expect(row.wave2Flow.allyClericHealByTargetAllyClass).toEqual(
        anchor.allyClericHealByTargetAllyClass,
      );
      expect(row.wave2Flow.wave2AppliedClericModuleId).toBe(
        anchor.wave2AppliedClericModuleId,
      );
      expect(row.wave2Flow.wave2EndTotalAllyHp).toBe(anchor.wave2EndTotalAllyHp);
      expect(row.totalRemainingAllyHp).toBe(anchor.totalRemainingAllyHp);
      expect(row.survivingAllies).toBe(anchor.survivingAllies);
      expect(row.qualitativeSig.outcome).toBe('victory');
      expect(row.qualitativeSig.reachedWave3).toBe(true);
      expect(row.qualitativeSig.finalWaveIndex).toBe(2);
      expect(row.qualitativeSig.wave2LethalSignature.length).toBe(2);
      expect(
        row.qualitativeSig.wave2LethalSignature.every((l) => l.targetIsEnemy),
      ).toBe(true);
    }
  }
}

function assertFirstQualitativeTransitions(
  observationByScale: ReadonlyMap<
    number,
    { rows: SensitivityCaseRow[]; report: ProblemSeriesBalanceSignalReport }
  >,
): void {
  expect(observationByScale.size).toBe(5);
  const rowsByCase = new Map<string, SensitivityCaseRow[]>();
  for (const atkScale of ATK_SCALE_POINTS) {
    const pack = observationByScale.get(atkScale);
    expect(pack).toBeDefined();
    for (const row of pack!.rows) {
      const key = caseKey(row.buildId, row.battleRngSeed);
      const list = rowsByCase.get(key) ?? [];
      list.push(row);
      rowsByCase.set(key, list);
    }
  }
  expect(rowsByCase.size).toBe(9);

  for (const buildId of BUILD_IDS) {
    for (const seed of BATTLE_RNG_SEEDS) {
      const key = caseKey(buildId, seed);
      const expected = EXPECTED_FIRST_TRANSITION_BY_CASE[key];
      expect(expected).toBeDefined();
      const rows = rowsByCase.get(key)!;
      expect(rows).toHaveLength(5);
      rows.sort((a, b) => a.atkScale - b.atkScale);
      expect(rows[0]!.atkScale).toBe(2.0);
      expect(rows[0]!.qualitativeSig).toEqual(expected.before);

      let first: number | null = null;
      let after: QualitativeSignature | null = null;
      for (let i = 1; i < rows.length; i++) {
        if (
          JSON.stringify(rows[i]!.qualitativeSig) !==
          JSON.stringify(rows[0]!.qualitativeSig)
        ) {
          first = rows[i]!.atkScale;
          after = rows[i]!.qualitativeSig;
          break;
        }
      }
      expect(first).toBe(expected.firstTransitionScale);
      expect(after).toEqual(expected.after);
      if (expected.firstTransitionScale !== null) {
        expect(expected.changedFields.length).toBeGreaterThan(0);
        for (const field of expected.changedFields) {
          const beforeRec = expected.before as unknown as Record<
            string,
            unknown
          >;
          const afterRec = expected.after as unknown as Record<string, unknown>;
          expect(JSON.stringify(beforeRec[field])).not.toBe(
            JSON.stringify(afterRec[field]),
          );
        }
        const allyKill = expected.after!.wave2LethalSignature.find(
          (l) => l.actorIsEnemy && !l.targetIsEnemy,
        );
        expect(allyKill).toBeDefined();
        expect(allyKill!.actorClassId).toBe('at_sorcerer');
        expect(allyKill!.skillId).toBe('at_sorcerer_mod_chain');
        expect(allyKill!.targetClassId).toBe('at_swordsman');
      }
    }
  }

  // 同じ遷移 scale 内の 3 seed 差を直接固定（party-mend @2.5 / no-spend・single @2.75）。
  const partyAt25 = ATK_SCALE_POINTS.indexOf(2.5);
  expect(partyAt25).toBeGreaterThanOrEqual(0);
  const partyRows = BATTLE_RNG_SEEDS.map((seed) => {
    const pack = observationByScale.get(2.5)!;
    return requireRow(indexRowsByBuildSeed(pack.rows), 'party-mend-24', seed);
  });
  expect(partyRows.map((r) => r.survivingAllies)).toEqual([3, 3, 4]);
  expect(partyRows.map((r) => r.totalRemainingAllyHp)).toEqual([465, 444, 578]);
  expect(partyRows.map((r) => r.qualitativeSig.finalSurvivingAllyClassSet)).toEqual([
    ['at_sorcerer', 'df_guardian', 'sp_cleric'],
    ['at_sorcerer', 'df_guardian', 'sp_cleric'],
    ['at_sorcerer', 'at_swordsman', 'df_guardian', 'sp_cleric'],
  ]);

  const singleAt275 = BATTLE_RNG_SEEDS.map((seed) => {
    const pack = observationByScale.get(2.75)!;
    return requireRow(indexRowsByBuildSeed(pack.rows), 'single-mend-24', seed);
  });
  expect(singleAt275.map((r) => r.totalRemainingAllyHp)).toEqual([520, 499, 624]);
  expect(singleAt275.every((r) => r.survivingAllies === 4)).toBe(true);

  const noSpendAt275 = BATTLE_RNG_SEEDS.map((seed) => {
    const pack = observationByScale.get(2.75)!;
    return requireRow(indexRowsByBuildSeed(pack.rows), 'no-spend-control', seed);
  });
  expect(noSpendAt275.map((r) => r.totalRemainingAllyHp)).toEqual([492, 491, 491]);
}

describe('R12n 1P-R1 production applied Module / resourceLedger ref fail-closed (test-only)', () => {
  const sampleModules = [
    'at_swordsman_mod_a',
    'df_guardian_mod_a',
    'at_sorcerer_mod_a',
    'sp_cleric_mod_party_mend',
  ] as const;
  const sampleLedger: ProblemSeriesSimResult['resourceLedger'] = [
    {
      waveIndex: 0,
      grantAmount: 0,
      spentAmount: 0,
      remainingResource: 0,
    },
    {
      waveIndex: 1,
      grantAmount: 24,
      spentAmount: 10,
      remainingResource: 14,
    },
    {
      waveIndex: 2,
      grantAmount: 24,
      spentAmount: 0,
      remainingResource: 38,
    },
  ];

  it('rejects missing corresponding key', () => {
    const map = new Map<string, ProductionAppliedModuleAndLedgerRef>();
    expect(() =>
      requireProductionAppliedModuleAndLedgerRef(
        map,
        'no-spend-control::r12n-1d-b-01',
      ),
    ).toThrow(/missing production applied module\/ledger ref key/);
  });

  it('rejects insufficient Module slot count', () => {
    expect(() =>
      copyAppliedCombatModuleIdBySlotForProductionRef([
        'a',
        'b',
        'c',
      ]),
    ).toThrow(/exactly 4 slots, got 3/);
  });

  it('rejects missing ledger Wave', () => {
    expect(() =>
      copyResourceLedgerForProductionRef([
        {
          waveIndex: 0,
          grantAmount: 0,
          spentAmount: 0,
          remainingResource: 0,
        },
        {
          waveIndex: 2,
          grantAmount: 24,
          spentAmount: 0,
          remainingResource: 24,
        },
      ]),
    ).toThrow(/missing wave 1/);

    const sparse = [] as Array<{
      waveIndex: number;
      grantAmount: number;
      spentAmount: number;
      remainingResource: number;
    }>;
    sparse[0] = {
      waveIndex: 0,
      grantAmount: 0,
      spentAmount: 0,
      remainingResource: 0,
    };
    sparse[2] = {
      waveIndex: 2,
      grantAmount: 24,
      spentAmount: 0,
      remainingResource: 24,
    };
    sparse.length = 3;
    expect(() => copyResourceLedgerForProductionRef(sparse)).toThrow(
      /missing wave at index 1/,
    );
  });

  it('lossless-copies all Module slots and ledger fields without sharing refs', () => {
    const modules: string[] = [...sampleModules];
    const ledger = sampleLedger.map((entry) => ({ ...entry }));
    const map = new Map<string, ProductionAppliedModuleAndLedgerRef>();
    storeProductionAppliedModuleAndLedgerRef(map, 'party-mend-24::r12n-1d-b-01', {
      appliedCombatModuleIdBySlot: modules,
      resourceLedger: ledger,
    });
    expect(() =>
      storeProductionAppliedModuleAndLedgerRef(
        map,
        'party-mend-24::r12n-1d-b-01',
        {
          appliedCombatModuleIdBySlot: modules,
          resourceLedger: ledger,
        },
      ),
    ).toThrow(/duplicate production applied module\/ledger ref key/);

    const ref = requireProductionAppliedModuleAndLedgerRef(
      map,
      'party-mend-24::r12n-1d-b-01',
    );
    expect(ref.appliedCombatModuleIdBySlot).toEqual([...sampleModules]);
    expect(ref.appliedCombatModuleIdBySlot).toHaveLength(PARTY_SLOT_COUNT);
    expect(ref.appliedCombatModuleIdBySlot).not.toBe(modules);
    expect(ref.resourceLedger).toEqual(sampleLedger);
    expect(ref.resourceLedger).not.toBe(ledger);
    for (let i = 0; i < ledger.length; i++) {
      expect(ref.resourceLedger[i]).not.toBe(ledger[i]);
      expect(ref.resourceLedger[i]).toEqual({
        waveIndex: sampleLedger[i]!.waveIndex,
        grantAmount: sampleLedger[i]!.grantAmount,
        spentAmount: sampleLedger[i]!.spentAmount,
        remainingResource: sampleLedger[i]!.remainingResource,
      });
    }

    modules[0] = 'mutated-module';
    ledger[1]!.spentAmount = 999;
    ledger[1]!.remainingResource = -1;
    expect(ref.appliedCombatModuleIdBySlot[0]).toBe(sampleModules[0]);
    expect(ref.resourceLedger[1]).toEqual({
      waveIndex: 1,
      grantAmount: 24,
      spentAmount: 10,
      remainingResource: 14,
    });
  });
});

describe('R12n 1P series B Wave2 sorcerer atkScale upper qualitative transition (test-only)', () => {
  let baselineCache: SeriesBBaselineFile | null = null;
  let productionWaves: ProblemSeriesBattleWave[] = [];
  const wave1ReferenceByKey = new Map<string, Wave1InvariantSlice>();
  const productionAcquiredPassivesByKey = new Map<
    string,
    readonly (readonly string[])[]
  >();
  const productionAppliedModuleAndLedgerByKey = new Map<
    string,
    ProductionAppliedModuleAndLedgerRef
  >();
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

      const production = runProductionReferenceCase(baselineCase);
      expect(normalizeProblemSeriesSimResultForCompare(production.result)).toBe(
        normalizeProblemSeriesSimResultForCompare(baselineCase.result),
      );
      productionAcquiredPassivesByKey.set(
        key,
        production.result.acquiredPassivesBySlot.map((slot) => [...slot]),
      );
      storeProductionAppliedModuleAndLedgerRef(
        productionAppliedModuleAndLedgerByKey,
        key,
        production.result,
      );
      // production Result と参照を共有していないこと。
      const stored = requireProductionAppliedModuleAndLedgerRef(
        productionAppliedModuleAndLedgerByKey,
        key,
      );
      expect(stored.appliedCombatModuleIdBySlot).not.toBe(
        production.result.appliedCombatModuleIdBySlot,
      );
      expect(stored.resourceLedger).not.toBe(production.result.resourceLedger);
      for (let i = 0; i < stored.resourceLedger.length; i++) {
        expect(stored.resourceLedger[i]).not.toBe(
          production.result.resourceLedger[i],
        );
      }
      const productionWave1 = buildWave1Slice(production);
      expect(productionWave1.observedRuntimeAcquiredPassivesBySlot).toEqual(
        WAVE1_EMPTY_RUNTIME_PASSIVES_BY_SLOT,
      );
      wave1ReferenceByKey.set(key, productionWave1);
    }
    expect(wave1ReferenceByKey.size).toBe(9);
    expect(productionAcquiredPassivesByKey.size).toBe(9);
    assertExactNineProductionModuleLedgerKeys(
      productionAppliedModuleAndLedgerByKey,
    );
    assertBaselineShaUnchanged();
  }, 300_000);

  it('transform scope: touches only Wave2 chain sorcerer atkScale on upper points', () => {
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
    assertBaselineShaUnchanged();
  });

  for (const atkScale of ATK_SCALE_POINTS) {
    it(
      `atkScale=${atkScale}: 9 cases, applied ATK, Wave2/3 flow, signals, qualitative sig`,
      async () => {
        assertBaselineShaUnchanged();
        expect(baselineCache).not.toBeNull();
        expect(productionWaves).toHaveLength(3);
        expect(wave1ReferenceByKey.size).toBe(9);
        expect(productionAppliedModuleAndLedgerByKey.size).toBe(9);

        const { rows, report } = await runUpperForAtkScale(
          atkScale,
          baselineCache!,
          productionWaves,
          wave1ReferenceByKey,
          productionAcquiredPassivesByKey,
          productionAppliedModuleAndLedgerByKey,
        );
        expect(rows).toHaveLength(9);
        observationByScale.set(atkScale, { rows, report });
        assertObservedAtkScalePack(atkScale, rows, report);
        if (atkScale === 2.0) {
          assertScale2AnchorsAgainst1N(rows);
        }
        assertBaselineShaUnchanged();
      },
      300_000,
    );
  }

  it('locks first qualitative transitions per build×seed without declaring production-ready', () => {
    expect(ATK_SCALE_POINTS).toEqual([2.0, 2.25, 2.5, 2.75, 3.0]);
    expect(ATK_SCALE_POINTS).toHaveLength(5);
    expect(BUILD_IDS).toHaveLength(3);
    expect(BATTLE_RNG_SEEDS).toHaveLength(3);
    expect(5 * 3 * 3).toBe(45);
    expect(observationByScale.size).toBe(5);
    expect(
      ATK_SCALE_POINTS.map((scale) => EXPECTED_APPLIED_ATK_BY_SCALE[scale]),
    ).toEqual([84, 95, 105, 116, 126]);

    for (const atkScale of ATK_SCALE_POINTS) {
      const pack = observationByScale.get(atkScale);
      expect(pack).toBeDefined();
      expect(pack!.rows).toHaveLength(9);
      expect(pack!.report.immediatePartyWipeCandidates).toEqual([]);
      expect(pack!.report.stalemateCandidates).toEqual([]);
      expect(pack!.report.ineffectiveChoiceCandidatePairs).toEqual([]);
      expect(pack!.report.singleSolutionCandidateBuildIds).toEqual([]);
    }

    assertFirstQualitativeTransitions(observationByScale);

    expect(EXPECTED_FIRST_TRANSITION_BY_CASE['no-spend-control::r12n-1d-b-01']!.firstTransitionScale).toBe(2.75);
    expect(EXPECTED_FIRST_TRANSITION_BY_CASE['no-spend-control::r12n-1d-b-02']!.firstTransitionScale).toBe(2.75);
    expect(EXPECTED_FIRST_TRANSITION_BY_CASE['no-spend-control::r12n-1d-b-03']!.firstTransitionScale).toBe(2.75);
    expect(EXPECTED_FIRST_TRANSITION_BY_CASE['single-mend-24::r12n-1d-b-01']!.firstTransitionScale).toBe(2.75);
    expect(EXPECTED_FIRST_TRANSITION_BY_CASE['single-mend-24::r12n-1d-b-02']!.firstTransitionScale).toBe(2.75);
    expect(EXPECTED_FIRST_TRANSITION_BY_CASE['single-mend-24::r12n-1d-b-03']!.firstTransitionScale).toBe(2.75);
    expect(EXPECTED_FIRST_TRANSITION_BY_CASE['party-mend-24::r12n-1d-b-01']!.firstTransitionScale).toBe(2.5);
    expect(EXPECTED_FIRST_TRANSITION_BY_CASE['party-mend-24::r12n-1d-b-02']!.firstTransitionScale).toBe(2.5);
    expect(EXPECTED_FIRST_TRANSITION_BY_CASE['party-mend-24::r12n-1d-b-03']!.firstTransitionScale).toBe(2.5);

    assertBaselineShaUnchanged();
  });
});
