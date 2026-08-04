/**
 * R12n 1Q / 1Q-R1 — 系列B Player party-mend heal atkScale 感度比較（test-only）。
 *
 * 単一所有者: sp_cleric_mod_party_mend / action.effect 内単一 heal の amount.atkScale。
 * BattleEngine は合成済み skillRegistry.actives[moduleId] を読むため、transform は
 * CombatModule 所有 field と合成 active ミラーへ同値 atkScale を載せる。
 * 5 scale × 3 build × 3 seed = 45 case。production 採用・強度合格・次所有者決定はしない。
 * 候補検出は自動不合格ではなく、候補なしは強度合格ではない。
 *
 * 質的 signature: Wave別 alive class / lethal / outcome / finalWaveIndex / final surviving class。
 * HP 微小差だけでは質的遷移としない。
 *
 * 1Q-R1: party-mend 切替は Wave 2 準備の moduleChanges。全 build×seed×scale で Wave 1 へ
 * 非波及であることを、production 参照 9 key の Wave 1 slice 直接 deep compare で固定する。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { synthesizeCombatModuleSkill } from './data/synthesizeCombatModuleSkill.ts';
import {
  detectProblemSeriesBalanceSignals,
  type ProblemSeriesBalanceSignalCase,
  type ProblemSeriesBalanceSignalReport,
} from './test/problemSeriesBalanceSignals.ts';
import {
  createPartyMendHealAtkScaleTransform,
  normalizeProblemSeriesSimResultForCompare,
  runProblemSeriesSim,
  SERIES_B_PARTY_MEND_HEAL_ATK_SCALE_TARGET,
  type ProblemSeriesSimCombatActionDiagnostic,
  type ProblemSeriesSimCombatFlowDamageEvent,
  type ProblemSeriesSimCombatFlowHealEvent,
  type ProblemSeriesSimCombatFlowUnitDiagnostic,
  type ProblemSeriesSimGameDataTransform,
  type ProblemSeriesSimInput,
  type ProblemSeriesSimResult,
  type ProblemSeriesSimTickAliveUnitDiagnostic,
  type ProblemSeriesSimTickStateDiagnostic,
} from './test/problemSeriesSim.harness.ts';
import type { CombatModuleDef, GameData } from './types.ts';
import { PARTY_SLOT_COUNT } from './types.ts';

const EXPECTED_BASELINE_A_SHA256 =
  '2c6e6ad212bfaffb3259613d2d15a39a7910f7b7ba0474240f72cedd5c49062c';
const EXPECTED_BASELINE_B_SHA256 =
  'b575d9830b57bce29c3fc2d13ebb8db7044ee592d3363aae1bf457b0d7e1d47c';

const PROBLEM_SERIES_SEED = 'fixture-b';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_ID = 'r12m_series_b';
const MODULE_PARTY_MEND = SERIES_B_PARTY_MEND_HEAL_ATK_SCALE_TARGET.moduleId;
const SLOT_CLERIC = 3;
const PRODUCTION_ATK_SCALE =
  SERIES_B_PARTY_MEND_HEAL_ATK_SCALE_TARGET.productionAtkScale;

const WAVE1_INDEX = 0;
const MODULE_SINGLE_MEND = 'sp_cleric_mod_single_mend';

const ATK_SCALE_POINTS = [0.55, 0.7, 0.85, 1.0, 1.25] as const;
/** base cleric ATK 10 での floor(ATK*scale)。実戦適用量は overheal / passive で変わり得る。 */
const EXPECTED_BASE_HEAL_BY_SCALE: Readonly<Record<number, number>> = {
  0.55: 5,
  0.7: 7,
  0.85: 8,
  1.0: 10,
  1.25: 12,
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

interface LethalSignatureEntry {
  readonly order: number;
  readonly actorClassId: string;
  readonly actorIsEnemy: boolean;
  readonly targetClassId: string;
  readonly targetIsEnemy: boolean;
  readonly skillId: string;
}

interface QualitativeSignature {
  readonly waveAliveAllyClassByWave: Readonly<
    Record<string, { readonly start: readonly string[]; readonly end: readonly string[] }>
  >;
  readonly lethalsByWave: Readonly<Record<string, readonly LethalSignatureEntry[]>>;
  readonly outcome: ProblemSeriesSimResult['outcome'];
  readonly finalWaveIndex: number;
  readonly finalSurvivingAllyClassSet: readonly string[];
}

type ExpectedObsCase = {
  readonly outcome: ProblemSeriesSimResult['outcome'];
  readonly finalWaveIndex: number;
  readonly survivingAllies: number;
  readonly totalRemainingAllyHp: number;
  readonly partyMendActionCount: number;
  readonly partyMendHealEventCount: number;
  readonly clericHealEventCount: number;
  readonly healByTarget: Readonly<Record<string, ClassAgg>>;
  readonly belowBaseHealEventCount: number;
  readonly qualitativeSig: QualitativeSignature;
  readonly finalHp?: readonly AllyHpObs[];
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

const EXPECTED_OBS_BY_SCALE = {"1":{"signals":{"wipe":[],"stalemate":[],"ineffective":[],"single":[]},"cases":{"no-spend-control::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":491,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"no-spend-control::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":491,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"no-spend-control::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":491,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"single-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":519,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"single-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":509,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"single-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":499,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"party-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":533,"partyMendActionCount":9,"partyMendHealEventCount":16,"clericHealEventCount":19,"healByTarget":{"df_guardian":{"count":9,"total":96},"at_swordsman":{"count":7,"total":81}},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalHp":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":43,"maxHp":155},{"classId":"df_guardian","hp":310,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}]},"party-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":523,"partyMendActionCount":9,"partyMendHealEventCount":16,"clericHealEventCount":19,"healByTarget":{"df_guardian":{"count":9,"total":96},"at_swordsman":{"count":7,"total":81}},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalHp":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":43,"maxHp":155},{"classId":"df_guardian","hp":300,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}]},"party-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":513,"partyMendActionCount":9,"partyMendHealEventCount":16,"clericHealEventCount":19,"healByTarget":{"df_guardian":{"count":9,"total":96},"at_swordsman":{"count":7,"total":81}},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalHp":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":43,"maxHp":155},{"classId":"df_guardian","hp":290,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}]}}},"0.55":{"signals":{"wipe":[],"stalemate":[],"ineffective":[],"single":[]},"cases":{"no-spend-control::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":491,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"no-spend-control::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":491,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"no-spend-control::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":491,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"single-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":519,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"single-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":509,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"single-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":499,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"party-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":3,"totalRemainingAllyHp":464,"partyMendActionCount":11,"partyMendHealEventCount":16,"clericHealEventCount":19,"healByTarget":{"df_guardian":{"count":11,"total":55},"at_swordsman":{"count":5,"total":26}},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"targetClassId":"at_swordsman","targetIsEnemy":false,"skillId":"at_sorcerer_mod_chain"},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":4,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"finalHp":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":284,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}]},"party-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":3,"totalRemainingAllyHp":454,"partyMendActionCount":11,"partyMendHealEventCount":16,"clericHealEventCount":19,"healByTarget":{"df_guardian":{"count":11,"total":55},"at_swordsman":{"count":5,"total":26}},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"targetClassId":"at_swordsman","targetIsEnemy":false,"skillId":"at_sorcerer_mod_chain"},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":4,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"finalHp":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":274,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}]},"party-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":3,"totalRemainingAllyHp":444,"partyMendActionCount":11,"partyMendHealEventCount":16,"clericHealEventCount":19,"healByTarget":{"df_guardian":{"count":11,"total":55},"at_swordsman":{"count":5,"total":26}},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":true,"targetClassId":"at_swordsman","targetIsEnemy":false,"skillId":"at_sorcerer_mod_chain"},{"order":3,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":4,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","df_guardian","sp_cleric"]},"finalHp":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"df_guardian","hp":264,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}]}}},"0.7":{"signals":{"wipe":[],"stalemate":[],"ineffective":[],"single":[]},"cases":{"no-spend-control::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":491,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"no-spend-control::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":491,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"no-spend-control::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":491,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"single-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":519,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"single-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":509,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"single-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":499,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"party-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":489,"partyMendActionCount":9,"partyMendHealEventCount":16,"clericHealEventCount":19,"healByTarget":{"df_guardian":{"count":9,"total":63},"at_swordsman":{"count":7,"total":55}},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalHp":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":23,"maxHp":155},{"classId":"df_guardian","hp":286,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}]},"party-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":479,"partyMendActionCount":9,"partyMendHealEventCount":16,"clericHealEventCount":19,"healByTarget":{"df_guardian":{"count":9,"total":63},"at_swordsman":{"count":7,"total":55}},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalHp":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":23,"maxHp":155},{"classId":"df_guardian","hp":276,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}]},"party-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":469,"partyMendActionCount":9,"partyMendHealEventCount":16,"clericHealEventCount":19,"healByTarget":{"df_guardian":{"count":9,"total":63},"at_swordsman":{"count":7,"total":55}},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalHp":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":23,"maxHp":155},{"classId":"df_guardian","hp":266,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}]}}},"0.85":{"signals":{"wipe":[],"stalemate":[],"ineffective":[],"single":[]},"cases":{"no-spend-control::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":491,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"no-spend-control::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":491,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"no-spend-control::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":491,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"single-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":519,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"single-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":509,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"single-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":499,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"party-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":503,"partyMendActionCount":9,"partyMendHealEventCount":16,"clericHealEventCount":19,"healByTarget":{"df_guardian":{"count":9,"total":72},"at_swordsman":{"count":7,"total":65}},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalHp":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":31,"maxHp":155},{"classId":"df_guardian","hp":292,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}]},"party-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":493,"partyMendActionCount":9,"partyMendHealEventCount":16,"clericHealEventCount":19,"healByTarget":{"df_guardian":{"count":9,"total":72},"at_swordsman":{"count":7,"total":65}},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalHp":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":31,"maxHp":155},{"classId":"df_guardian","hp":282,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}]},"party-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":483,"partyMendActionCount":9,"partyMendHealEventCount":16,"clericHealEventCount":19,"healByTarget":{"df_guardian":{"count":9,"total":72},"at_swordsman":{"count":7,"total":65}},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalHp":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":31,"maxHp":155},{"classId":"df_guardian","hp":272,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}]}}},"1.25":{"signals":{"wipe":[],"stalemate":[],"ineffective":[],"single":[]},"cases":{"no-spend-control::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":491,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"no-spend-control::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":491,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"no-spend-control::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":491,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"single-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":519,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"single-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":509,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"single-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":499,"partyMendActionCount":0,"partyMendHealEventCount":0,"clericHealEventCount":14,"healByTarget":{},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"party-mend-24::r12n-1d-b-01":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":558,"partyMendActionCount":9,"partyMendHealEventCount":16,"clericHealEventCount":19,"healByTarget":{"df_guardian":{"count":9,"total":114},"at_swordsman":{"count":7,"total":98}},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalHp":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":56,"maxHp":155},{"classId":"df_guardian","hp":322,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}]},"party-mend-24::r12n-1d-b-02":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":548,"partyMendActionCount":9,"partyMendHealEventCount":16,"clericHealEventCount":19,"healByTarget":{"df_guardian":{"count":9,"total":114},"at_swordsman":{"count":7,"total":98}},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalHp":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":56,"maxHp":155},{"classId":"df_guardian","hp":312,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}]},"party-mend-24::r12n-1d-b-03":{"outcome":"victory","finalWaveIndex":2,"survivingAllies":4,"totalRemainingAllyHp":538,"partyMendActionCount":9,"partyMendHealEventCount":16,"clericHealEventCount":19,"healByTarget":{"df_guardian":{"count":9,"total":114},"at_swordsman":{"count":7,"total":98}},"belowBaseHealEventCount":0,"qualitativeSig":{"waveAliveAllyClassByWave":{"0":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"1":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"2":{"start":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"],"end":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]}},"lethalsByWave":{"0":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"1":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}],"2":[{"order":0,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"},{"order":1,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_swordsman","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":2,"actorClassId":"at_sorcerer","actorIsEnemy":false,"targetClassId":"at_sorcerer","targetIsEnemy":true,"skillId":"at_sorcerer_mod_focus"},{"order":3,"actorClassId":"at_swordsman","actorIsEnemy":false,"targetClassId":"sp_cleric","targetIsEnemy":true,"skillId":"at_swordsman_mod_single_slash"}]},"outcome":"victory","finalWaveIndex":2,"finalSurvivingAllyClassSet":["at_sorcerer","at_swordsman","df_guardian","sp_cleric"]},"finalHp":[{"classId":"at_sorcerer","hp":55,"maxHp":55},{"classId":"at_swordsman","hp":56,"maxHp":155},{"classId":"df_guardian","hp":302,"maxHp":420},{"classId":"sp_cleric","hp":125,"maxHp":125}]}}}} as unknown as Readonly<
  Record<AtkScale, ExpectedObsPack>
>;

const EXPECTED_FIRST_QUALITATIVE_TRANSITION_SCALE =
  {"no-spend-control::r12n-1d-b-01":null,"no-spend-control::r12n-1d-b-02":null,"no-spend-control::r12n-1d-b-03":null,"single-mend-24::r12n-1d-b-01":null,"single-mend-24::r12n-1d-b-02":null,"single-mend-24::r12n-1d-b-03":null,"party-mend-24::r12n-1d-b-01":0.7,"party-mend-24::r12n-1d-b-02":0.7,"party-mend-24::r12n-1d-b-03":0.7} as Readonly<Record<string, AtkScale | null>>;

interface DiagnosticBundle {
  readonly result: ProblemSeriesSimResult;
  readonly damageEvents: readonly ProblemSeriesSimCombatFlowDamageEvent[];
  readonly healEvents: readonly ProblemSeriesSimCombatFlowHealEvent[];
  readonly actionEvents: readonly ProblemSeriesSimCombatActionDiagnostic[];
  readonly tickStates: readonly ProblemSeriesSimTickStateDiagnostic[];
}

/** test-only。production 参照用 Wave 1 全 field slice（可変配列・object 非共有）。 */
interface Wave1ProductionRefSlice {
  readonly waveTimeline: ProblemSeriesSimResult['waves'][number];
  readonly resourceLedgerWave1: ProblemSeriesSimResult['resourceLedger'][number];
  readonly damageEvents: readonly ProblemSeriesSimCombatFlowDamageEvent[];
  readonly healEvents: readonly ProblemSeriesSimCombatFlowHealEvent[];
  readonly actionEvents: readonly ProblemSeriesSimCombatActionDiagnostic[];
  readonly tickStates: readonly ProblemSeriesSimTickStateDiagnostic[];
  readonly initialCombatModuleIdBySlot: readonly string[];
  readonly partyMendActionCountInWave1: number;
}

interface SensitivityCaseRow {
  readonly atkScale: AtkScale;
  readonly buildId: BuildId;
  readonly battleRngSeed: BattleRngSeed;
  readonly outcome: ProblemSeriesSimResult['outcome'];
  readonly finalWaveIndex: number;
  readonly survivingAllies: number;
  readonly totalRemainingAllyHp: number;
  readonly partyMendActionCount: number;
  readonly partyMendHealEventCount: number;
  readonly clericHealEventCount: number;
  readonly healByTarget: Readonly<Record<string, ClassAgg>>;
  readonly belowBaseHealEventCount: number;
  readonly qualitativeSig: QualitativeSignature;
  readonly finalHp: readonly AllyHpObs[];
  readonly appliedCombatModuleIdBySlot: readonly string[];
  readonly acquiredPassivesBySlot: readonly (readonly string[])[];
  readonly resourceLedger: ProblemSeriesSimResult['resourceLedger'];
  readonly enemyWaveInputs: ProblemSeriesSimResult['enemyWaveInputs'];
  readonly normalizedResult: string;
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
  expect(parsed.maxTicks).toBe(90000);
  return parsed;
}

function caseKey(buildId: BuildId, battleRngSeed: BattleRngSeed): string {
  return `${buildId}::${battleRngSeed}`;
}

function classSet(units: readonly { classId: string }[]): string[] {
  return [...new Set(units.map((u) => u.classId))].sort();
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

/**
 * party-mend heal 帰属: action 診断の skillId + actor id + wave/time。
 * actor=cleric だけでは断定しない。
 */
function collectPartyMendHealObs(
  bundle: DiagnosticBundle,
  baseHeal: number,
): {
  partyMendActionCount: number;
  partyMendHealEventCount: number;
  clericHealEventCount: number;
  healByTarget: Record<string, ClassAgg>;
  belowBaseHealEventCount: number;
} {
  const partyMendActions = bundle.actionEvents.filter(
    (a) =>
      !a.actor.isEnemy &&
      a.actor.classId === 'sp_cleric' &&
      a.skillId === MODULE_PARTY_MEND,
  );
  const clericHeals = bundle.healEvents.filter(
    (h) => !h.actor.isEnemy && h.actor.classId === 'sp_cleric',
  );
  const partyMendHeals = clericHeals.filter((h) =>
    partyMendActions.some(
      (a) =>
        a.actor.id === h.actor.id &&
        a.waveIndex === h.waveIndex &&
        a.battleTimeSec <= h.battleTimeSec + 1e-9,
    ),
  );
  const map = new Map<string, { count: number; total: number }>();
  let below = 0;
  for (const h of partyMendHeals) {
    const prev = map.get(h.target.classId) ?? { count: 0, total: 0 };
    map.set(h.target.classId, {
      count: prev.count + 1,
      total: prev.total + h.amount,
    });
    if (h.amount < baseHeal) below += 1;
  }
  return {
    partyMendActionCount: partyMendActions.length,
    partyMendHealEventCount: partyMendHeals.length,
    clericHealEventCount: clericHeals.length,
    healByTarget: freezeAggMap(map),
    belowBaseHealEventCount: below,
  };
}

function buildQualitativeSignature(
  bundle: DiagnosticBundle,
): QualitativeSignature {
  const { result, damageEvents, tickStates } = bundle;
  expect(tickStates.length).toBeGreaterThan(0);
  const waveAliveAllyClassByWave: Record<
    string,
    { start: string[]; end: string[] }
  > = {};
  for (let wi = 0; wi <= result.finalWaveIndex; wi++) {
    const ticks = tickStates.filter((t) => t.waveIndex === wi);
    expect(ticks.length).toBeGreaterThan(0);
    const first = ticks[0]!;
    const last = ticks[ticks.length - 1]!;
    waveAliveAllyClassByWave[String(wi)] = {
      start: classSet(first.allies),
      end: classSet(last.allies),
    };
  }
  const lethalsByWave: Record<string, LethalSignatureEntry[]> = {};
  const lethalOrderByWave = new Map<number, number>();
  for (const d of damageEvents) {
    if (!d.lethal) continue;
    const order = lethalOrderByWave.get(d.waveIndex) ?? 0;
    lethalOrderByWave.set(d.waveIndex, order + 1);
    const key = String(d.waveIndex);
    const arr = lethalsByWave[key] ?? [];
    arr.push({
      order,
      actorClassId: d.actor.classId,
      actorIsEnemy: d.actor.isEnemy,
      targetClassId: d.target.classId,
      targetIsEnemy: d.target.isEnemy,
      skillId: d.skillId,
    });
    lethalsByWave[key] = arr;
  }
  const finalTick = tickStates[tickStates.length - 1]!;
  return {
    waveAliveAllyClassByWave,
    lethalsByWave,
    outcome: result.outcome,
    finalWaveIndex: result.finalWaveIndex,
    finalSurvivingAllyClassSet: classSet(finalTick.allies),
  };
}

function copyCombatFlowUnitDiagnostic(
  unit: ProblemSeriesSimCombatFlowUnitDiagnostic,
): ProblemSeriesSimCombatFlowUnitDiagnostic {
  const base: ProblemSeriesSimCombatFlowUnitDiagnostic = {
    id: unit.id,
    classId: unit.classId,
    isEnemy: unit.isEnemy,
  };
  if (typeof unit.partySlotIndex === 'number') {
    return { ...base, partySlotIndex: unit.partySlotIndex };
  }
  return base;
}

function copyDamageEventForWave1Ref(
  event: ProblemSeriesSimCombatFlowDamageEvent,
): ProblemSeriesSimCombatFlowDamageEvent {
  return {
    waveIndex: event.waveIndex,
    battleTimeSec: event.battleTimeSec,
    actor: copyCombatFlowUnitDiagnostic(event.actor),
    target: copyCombatFlowUnitDiagnostic(event.target),
    amount: event.amount,
    hpDamage: event.hpDamage,
    barrierDamage: event.barrierDamage,
    lethal: event.lethal,
    sourceKind: event.sourceKind,
    skillId: event.skillId,
    slotKind: event.slotKind,
  };
}

function copyHealEventForWave1Ref(
  event: ProblemSeriesSimCombatFlowHealEvent,
): ProblemSeriesSimCombatFlowHealEvent {
  return {
    waveIndex: event.waveIndex,
    battleTimeSec: event.battleTimeSec,
    actor: copyCombatFlowUnitDiagnostic(event.actor),
    target: copyCombatFlowUnitDiagnostic(event.target),
    amount: event.amount,
  };
}

function copyActionEventForWave1Ref(
  event: ProblemSeriesSimCombatActionDiagnostic,
): ProblemSeriesSimCombatActionDiagnostic {
  const actorBase: ProblemSeriesSimCombatActionDiagnostic['actor'] = {
    id: event.actor.id,
    classId: event.actor.classId,
    isEnemy: event.actor.isEnemy,
    hp: event.actor.hp,
    battleX: event.actor.battleX,
  };
  const actor =
    typeof event.actor.partySlotIndex === 'number'
      ? { ...actorBase, partySlotIndex: event.actor.partySlotIndex }
      : actorBase;
  return {
    waveIndex: event.waveIndex,
    battleTimeSec: event.battleTimeSec,
    actor,
    slotKind: event.slotKind,
    skillId: event.skillId,
  };
}

function copyTickAliveUnitForWave1Ref(
  unit: ProblemSeriesSimTickAliveUnitDiagnostic,
): ProblemSeriesSimTickAliveUnitDiagnostic {
  let copied: ProblemSeriesSimTickAliveUnitDiagnostic = {
    id: unit.id,
    classId: unit.classId,
    hp: unit.hp,
    maxHp: unit.maxHp,
    barrierHp: unit.barrierHp,
    atk: unit.atk,
    battleX: unit.battleX,
    effectiveRangePx: unit.effectiveRangePx,
    bodyAnimMarching: unit.bodyAnimMarching,
    basicSkillId: unit.basicSkillId,
  };
  if (typeof unit.partySlotIndex === 'number') {
    copied = { ...copied, partySlotIndex: unit.partySlotIndex };
  }
  if (typeof unit.useLocked === 'boolean') {
    copied = { ...copied, useLocked: unit.useLocked };
  }
  return copied;
}

function copyTickStateForWave1Ref(
  state: ProblemSeriesSimTickStateDiagnostic,
): ProblemSeriesSimTickStateDiagnostic {
  return {
    waveIndex: state.waveIndex,
    battleTimeSec: state.battleTimeSec,
    phase: state.phase,
    runtimePhase: state.runtimePhase,
    engaged: state.engaged,
    allies: state.allies.map(copyTickAliveUnitForWave1Ref),
    enemies: state.enemies.map(copyTickAliveUnitForWave1Ref),
    acquiredPassivesBySlot: state.acquiredPassivesBySlot.map((slot) => [...slot]),
  };
}

function copyWaveTimelineForWave1Ref(
  wave: ProblemSeriesSimResult['waves'][number],
): ProblemSeriesSimResult['waves'][number] {
  return {
    waveIndex: wave.waveIndex,
    startTick: wave.startTick,
    endTick: wave.endTick,
    startSec: wave.startSec,
    endSec: wave.endSec,
    result: wave.result,
  };
}

function copyResourceLedgerWave1ForRef(
  entry: ProblemSeriesSimResult['resourceLedger'][number],
): ProblemSeriesSimResult['resourceLedger'][number] {
  return {
    waveIndex: entry.waveIndex,
    grantAmount: entry.grantAmount,
    spentAmount: entry.spentAmount,
    remainingResource: entry.remainingResource,
  };
}

function copyInitialCombatModuleIdBySlotFromInput(
  input: ProblemSeriesSimInput,
): readonly string[] {
  const slots = input.slots;
  if (!Array.isArray(slots) || slots.length !== PARTY_SLOT_COUNT) {
    throw new Error(
      `Wave 1 production ref requires exactly ${PARTY_SLOT_COUNT} input slots, got ${
        Array.isArray(slots) ? slots.length : String(slots)
      }`,
    );
  }
  const copied: string[] = [];
  for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
    const slotPresent = Object.prototype.hasOwnProperty.call(slots, slotIndex);
    const slot = slotPresent ? slots[slotIndex] : undefined;
    if (!slotPresent || slot === undefined) {
      throw new Error(
        `Wave 1 production ref missing input slot at index ${slotIndex}`,
      );
    }
    if (typeof slot.initialCombatModuleId !== 'string') {
      throw new Error(
        `Wave 1 production ref slot ${slotIndex} initialCombatModuleId must be a string`,
      );
    }
    copied.push(slot.initialCombatModuleId);
  }
  return copied;
}

/**
 * test-only。既存診断から Wave 1 slice を lossless コピー。
 * timeline / ledger / tick / event 欠落は正規化せず fail-closed。
 */
function buildProductionWave1Slice(
  bundle: DiagnosticBundle,
  baselineInput: ProblemSeriesSimInput,
): Wave1ProductionRefSlice {
  const { result } = bundle;
  const wavePresent = Object.prototype.hasOwnProperty.call(result.waves, WAVE1_INDEX);
  const wave = wavePresent ? result.waves[WAVE1_INDEX] : undefined;
  if (!wavePresent || wave === undefined) {
    throw new Error('Wave 1 production ref missing waves[0] timeline');
  }
  if (wave.waveIndex !== WAVE1_INDEX) {
    throw new Error(
      `Wave 1 production ref missing wave timeline: found waveIndex ${String(wave.waveIndex)}`,
    );
  }

  const ledgerPresent = Object.prototype.hasOwnProperty.call(
    result.resourceLedger,
    WAVE1_INDEX,
  );
  const ledger = ledgerPresent ? result.resourceLedger[WAVE1_INDEX] : undefined;
  if (!ledgerPresent || ledger === undefined) {
    throw new Error('Wave 1 production ref missing resourceLedger[0]');
  }
  if (ledger.waveIndex !== WAVE1_INDEX) {
    throw new Error(
      `Wave 1 production ref missing ledger wave 0: found waveIndex ${String(ledger.waveIndex)}`,
    );
  }

  const damageEvents = bundle.damageEvents
    .filter((e) => e.waveIndex === WAVE1_INDEX)
    .map(copyDamageEventForWave1Ref);
  const healEvents = bundle.healEvents
    .filter((e) => e.waveIndex === WAVE1_INDEX)
    .map(copyHealEventForWave1Ref);
  const actionEvents = bundle.actionEvents
    .filter((e) => e.waveIndex === WAVE1_INDEX)
    .map(copyActionEventForWave1Ref);
  const tickStates = bundle.tickStates
    .filter((t) => t.waveIndex === WAVE1_INDEX)
    .map(copyTickStateForWave1Ref);

  if (tickStates.length === 0) {
    throw new Error('Wave 1 production ref requires at least 1 tick state');
  }
  if (damageEvents.length + healEvents.length + actionEvents.length === 0) {
    throw new Error('Wave 1 production ref requires at least 1 Wave 1 event');
  }

  const partyMendActionCountInWave1 = actionEvents.filter(
    (a) =>
      !a.actor.isEnemy &&
      a.actor.classId === 'sp_cleric' &&
      a.skillId === MODULE_PARTY_MEND,
  ).length;
  if (partyMendActionCountInWave1 !== 0) {
    throw new Error(
      `Wave 1 production ref expected 0 party-mend actions, got ${partyMendActionCountInWave1}`,
    );
  }

  const initialCombatModuleIdBySlot =
    copyInitialCombatModuleIdBySlotFromInput(baselineInput);
  expect(initialCombatModuleIdBySlot).toHaveLength(PARTY_SLOT_COUNT);
  expect(initialCombatModuleIdBySlot[SLOT_CLERIC]).toBe(MODULE_SINGLE_MEND);

  return {
    waveTimeline: copyWaveTimelineForWave1Ref(wave),
    resourceLedgerWave1: copyResourceLedgerWave1ForRef(ledger),
    damageEvents,
    healEvents,
    actionEvents,
    tickStates,
    initialCombatModuleIdBySlot,
    partyMendActionCountInWave1,
  };
}

function storeProductionWave1Ref(
  map: Map<string, Wave1ProductionRefSlice>,
  key: string,
  bundle: DiagnosticBundle,
  baselineInput: ProblemSeriesSimInput,
): void {
  if (map.has(key)) {
    throw new Error(`duplicate production Wave 1 ref key: ${key}`);
  }
  map.set(key, buildProductionWave1Slice(bundle, baselineInput));
}

function requireProductionWave1Ref(
  map: ReadonlyMap<string, Wave1ProductionRefSlice>,
  key: string,
): Wave1ProductionRefSlice {
  if (!map.has(key)) {
    throw new Error(`missing production Wave 1 ref key: ${key}`);
  }
  return map.get(key)!;
}

function assertExactNineProductionWave1Keys(
  map: ReadonlyMap<string, Wave1ProductionRefSlice>,
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
    const ref = requireProductionWave1Ref(map, key);
    expect(ref.tickStates.length).toBeGreaterThan(0);
    expect(
      ref.damageEvents.length + ref.healEvents.length + ref.actionEvents.length,
    ).toBeGreaterThan(0);
    expect(ref.partyMendActionCountInWave1).toBe(0);
    expect(ref.initialCombatModuleIdBySlot[SLOT_CLERIC]).toBe(MODULE_SINGLE_MEND);
  }
  for (const key of map.keys()) {
    expect(expectedKeys.has(key)).toBe(true);
  }
}

function runInstrumentedCase(
  baselineCase: SeriesBBaselineCase,
  transform: ProblemSeriesSimGameDataTransform | undefined,
): DiagnosticBundle {
  const damageEvents: ProblemSeriesSimCombatFlowDamageEvent[] = [];
  const healEvents: ProblemSeriesSimCombatFlowHealEvent[] = [];
  const actionEvents: ProblemSeriesSimCombatActionDiagnostic[] = [];
  const tickStates: ProblemSeriesSimTickStateDiagnostic[] = [];
  const result = runProblemSeriesSim({
    ...baselineCase.input,
    ...(transform !== undefined ? { transformGameData: transform } : {}),
    onCombatFlowDamage: (e) => damageEvents.push(e),
    onCombatFlowHeal: (e) => healEvents.push(e),
    onCombatActionDiagnostic: (e) => actionEvents.push(e),
    onTickStateDiagnostic: (e) => tickStates.push(e),
  });
  expect(damageEvents.length + healEvents.length + actionEvents.length).toBeGreaterThan(
    0,
  );
  expect(tickStates.length).toBeGreaterThan(0);
  return { result, damageEvents, healEvents, actionEvents, tickStates };
}

function readPartyMendAtkScale(gameData: GameData): number {
  const mod = gameData.combatModuleRegistry[MODULE_PARTY_MEND];
  expect(mod).toBeDefined();
  const effect = mod!.action.effect[0];
  expect(effect?.type).toBe('heal');
  expect(effect && 'amount' in effect ? effect.amount?.kind : undefined).toBe(
    'atkBased',
  );
  const scale =
    effect && 'amount' in effect ? effect.amount?.atkScale : undefined;
  expect(typeof scale).toBe('number');
  return scale as number;
}

function assertOwnedFieldDiffOnly(
  before: GameData,
  after: GameData,
  atkScale: number,
): void {
  const beforeClone = structuredClone(before) as GameData;
  const afterClone = structuredClone(after) as GameData;
  const beforeMod = beforeClone.combatModuleRegistry[MODULE_PARTY_MEND]!;
  const afterMod = afterClone.combatModuleRegistry[MODULE_PARTY_MEND]!;
  const beforeActive = beforeClone.skillRegistry.actives[MODULE_PARTY_MEND]!;
  const afterActive = afterClone.skillRegistry.actives[MODULE_PARTY_MEND]!;

  expect(
    (beforeMod.action.effect[0] as { amount?: { atkScale?: number } }).amount
      ?.atkScale,
  ).toBe(PRODUCTION_ATK_SCALE);
  expect(
    (afterMod.action.effect[0] as { amount?: { atkScale?: number } }).amount
      ?.atkScale,
  ).toBe(atkScale);
  expect(
    (beforeActive.effect[0] as { amount?: { atkScale?: number } }).amount
      ?.atkScale,
  ).toBe(PRODUCTION_ATK_SCALE);
  expect(
    (afterActive.effect[0] as { amount?: { atkScale?: number } }).amount
      ?.atkScale,
  ).toBe(atkScale);

  (
    beforeMod.action.effect[0] as { amount: { atkScale: number } }
  ).amount.atkScale = atkScale;
  (
    beforeActive.effect[0] as { amount: { atkScale: number } }
  ).amount.atkScale = atkScale;
  expect(beforeClone).toEqual(afterClone);
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
  expect(byKey.size).toBe(9);
  for (const key of expectedKeys) {
    expect(byKey.has(key)).toBe(true);
  }
  for (const key of byKey.keys()) {
    expect(expectedKeys.has(key)).toBe(true);
  }
  return byKey;
}

async function runSensitivityForAtkScale(
  atkScale: AtkScale,
  baseline: SeriesBBaselineFile,
  productionRefByKey: ReadonlyMap<
    string,
    {
      normalized: string;
      result: ProblemSeriesSimResult;
      enemyWaveInputs: ProblemSeriesSimResult['enemyWaveInputs'];
    }
  >,
  wave1RefByKey: ReadonlyMap<string, Wave1ProductionRefSlice>,
): Promise<{
  readonly rows: SensitivityCaseRow[];
  readonly report: ProblemSeriesBalanceSignalReport;
}> {
  const transform = createPartyMendHealAtkScaleTransform(atkScale);
  const productionGameData = loadGameData();
  const transformedGameData = transform(productionGameData);
  assertOwnedFieldDiffOnly(productionGameData, transformedGameData, atkScale);
  expect(readPartyMendAtkScale(productionGameData)).toBe(PRODUCTION_ATK_SCALE);

  const signalCases: ProblemSeriesBalanceSignalCase[] = [];
  const pairKeys = new Set<string>();
  const rows: SensitivityCaseRow[] = [];
  const baseHeal = EXPECTED_BASE_HEAL_BY_SCALE[atkScale];
  expect(baseHeal).toBeDefined();

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
    expect(result.seriesId).toBe(SERIES_ID);
    expect(result.battleRngSeed).toBe(battleRngSeed);
    expect(result.resourceLedger.length).toBe(result.finalWaveIndex + 1);
    expect(result.appliedCombatModuleIdBySlot).toHaveLength(PARTY_SLOT_COUNT);
    expect(result.acquiredPassivesBySlot).toHaveLength(PARTY_SLOT_COUNT);

    const productionRef = productionRefByKey.get(key);
    expect(productionRef).toBeDefined();
    const normalized = normalizeProblemSeriesSimResultForCompare(result);

    if (buildId !== 'party-mend-24' || atkScale === PRODUCTION_ATK_SCALE) {
      expect(normalized).toBe(productionRef!.normalized);
      expect(normalized).toBe(
        normalizeProblemSeriesSimResultForCompare(baselineCase.result),
      );
    }

    expect(result.enemyWaveInputs).toEqual(productionRef!.enemyWaveInputs);
    expect(result.appliedCombatModuleIdBySlot).toEqual(
      productionRef!.result.appliedCombatModuleIdBySlot,
    );
    expect(result.acquiredPassivesBySlot).toEqual(
      productionRef!.result.acquiredPassivesBySlot,
    );
    expect(result.resourceLedger).toEqual(productionRef!.result.resourceLedger);

    if (buildId !== 'party-mend-24') {
      expect(result.outcome).toBe(productionRef!.result.outcome);
      expect(result.finalWaveIndex).toBe(productionRef!.result.finalWaveIndex);
      expect(result.waves).toEqual(productionRef!.result.waves);
      expect(result.tickCount).toBe(productionRef!.result.tickCount);
      expect(result.survivingAllies).toBe(productionRef!.result.survivingAllies);
      expect(result.totalRemainingAllyHp).toBe(
        productionRef!.result.totalRemainingAllyHp,
      );
      expect(result.slotStats).toEqual(productionRef!.result.slotStats);
    }

    // 1Q-R1: 全 build×seed×scale で Wave 1 を production 参照へ直接 deep compare（要約比較ではない）。
    // party-mend-24 の 0.70 / 0.85 / 1.00 / 1.25 も除外しない。
    const wave1Slice = buildProductionWave1Slice(bundle, baselineCase.input);
    const wave1Ref = requireProductionWave1Ref(wave1RefByKey, key);
    expect(wave1Slice).toEqual(wave1Ref);
    expect(wave1Slice.partyMendActionCountInWave1).toBe(0);
    expect(wave1Slice.initialCombatModuleIdBySlot[SLOT_CLERIC]).toBe(
      MODULE_SINGLE_MEND,
    );

    const healObs = collectPartyMendHealObs(bundle, baseHeal);
    if (buildId !== 'party-mend-24') {
      expect(healObs.partyMendActionCount).toBe(0);
      expect(healObs.partyMendHealEventCount).toBe(0);
    } else {
      expect(healObs.partyMendActionCount).toBeGreaterThan(0);
      expect(healObs.partyMendHealEventCount).toBeGreaterThan(0);
      expect(result.appliedCombatModuleIdBySlot[SLOT_CLERIC]).toBe(
        MODULE_PARTY_MEND,
      );
    }

    const qualitativeSig = buildQualitativeSignature(bundle);
    const finalTick = bundle.tickStates[bundle.tickStates.length - 1]!;

    signalCases.push({
      buildId,
      battleRngSeed,
      input: {
        ...baselineCase.input,
        transformGameData: transform,
      },
      result,
    });

    rows.push({
      atkScale,
      buildId,
      battleRngSeed,
      outcome: result.outcome,
      finalWaveIndex: result.finalWaveIndex,
      survivingAllies: result.survivingAllies,
      totalRemainingAllyHp: result.totalRemainingAllyHp,
      partyMendActionCount: healObs.partyMendActionCount,
      partyMendHealEventCount: healObs.partyMendHealEventCount,
      clericHealEventCount: healObs.clericHealEventCount,
      healByTarget: healObs.healByTarget,
      belowBaseHealEventCount: healObs.belowBaseHealEventCount,
      qualitativeSig,
      finalHp: allyHpSnapshot(finalTick.allies),
      appliedCombatModuleIdBySlot: result.appliedCombatModuleIdBySlot,
      acquiredPassivesBySlot: result.acquiredPassivesBySlot,
      resourceLedger: result.resourceLedger,
      enemyWaveInputs: result.enemyWaveInputs,
      normalizedResult: normalized,
    });
  }

  expect(pairKeys.size).toBe(9);
  expect(rows).toHaveLength(9);
  expect(signalCases).toHaveLength(9);
  const report = detectProblemSeriesBalanceSignals(signalCases);
  expect(report.evaluatedCaseCount).toBe(9);
  expect(report.evaluatedBuildCount).toBe(3);
  expect(report.evaluatedSeedCount).toBe(3);
  return { rows, report };
}

function assertObservedAtkScalePack(
  atkScale: AtkScale,
  rows: readonly SensitivityCaseRow[],
  report: ProblemSeriesBalanceSignalReport,
): void {
  const expectedPack = EXPECTED_OBS_BY_SCALE[atkScale];
  expect(expectedPack).toBeDefined();
  const byKey = indexRowsByBuildSeed(rows);
  expect(report.immediatePartyWipeCandidates).toEqual(expectedPack.signals.wipe);
  expect(report.stalemateCandidates).toEqual(expectedPack.signals.stalemate);
  expect(report.ineffectiveChoiceCandidatePairs).toEqual(
    expectedPack.signals.ineffective,
  );
  expect(report.singleSolutionCandidateBuildIds).toEqual(
    expectedPack.signals.single,
  );

  for (const buildId of BUILD_IDS) {
    for (const seed of BATTLE_RNG_SEEDS) {
      const key = caseKey(buildId, seed);
      const row = byKey.get(key);
      expect(row).toBeDefined();
      const expected = expectedPack.cases[key];
      expect(expected).toBeDefined();
      expect(row!.outcome).toBe(expected.outcome);
      expect(row!.finalWaveIndex).toBe(expected.finalWaveIndex);
      expect(row!.survivingAllies).toBe(expected.survivingAllies);
      expect(row!.totalRemainingAllyHp).toBe(expected.totalRemainingAllyHp);
      expect(row!.partyMendActionCount).toBe(expected.partyMendActionCount);
      expect(row!.partyMendHealEventCount).toBe(expected.partyMendHealEventCount);
      expect(row!.clericHealEventCount).toBe(expected.clericHealEventCount);
      expect(row!.healByTarget).toEqual(expected.healByTarget);
      expect(row!.belowBaseHealEventCount).toBe(expected.belowBaseHealEventCount);
      expect(row!.qualitativeSig).toEqual(expected.qualitativeSig);
      if (buildId === 'party-mend-24') {
        expect(expected.finalHp).toBeDefined();
        expect(row!.finalHp).toEqual(expected.finalHp);
      }
    }
  }
}

describe('R12n 1Q party-mend heal atkScale transform helper boundaries (test-only)', () => {
  it('rejects missing module / class mismatch / effect shape / bad scales', () => {
    const base = loadGameData();
    expect(() => createPartyMendHealAtkScaleTransform(0)).toThrow(/finite number > 0/);
    expect(() => createPartyMendHealAtkScaleTransform(-1)).toThrow(/finite number > 0/);
    expect(() => createPartyMendHealAtkScaleTransform(Number.NaN)).toThrow(
      /finite number > 0/,
    );
    expect(() => createPartyMendHealAtkScaleTransform(Number.POSITIVE_INFINITY)).toThrow(
      /finite number > 0/,
    );

    const missing = structuredClone(base) as GameData;
    delete missing.combatModuleRegistry[MODULE_PARTY_MEND];
    expect(() => createPartyMendHealAtkScaleTransform(0.7)(missing)).toThrow(
      /missing/,
    );

    const wrongClass = structuredClone(base) as GameData;
    wrongClass.combatModuleRegistry[MODULE_PARTY_MEND] = {
      ...wrongClass.combatModuleRegistry[MODULE_PARTY_MEND]!,
      classId: 'at_sorcerer',
    };
    expect(() => createPartyMendHealAtkScaleTransform(0.7)(wrongClass)).toThrow(
      /classId/,
    );

    const wrongEffectCount = structuredClone(base) as GameData;
    const mod = wrongEffectCount.combatModuleRegistry[MODULE_PARTY_MEND]!;
    wrongEffectCount.combatModuleRegistry[MODULE_PARTY_MEND] = {
      ...mod,
      action: {
        ...mod.action,
        effect: [...mod.action.effect, ...mod.action.effect],
      },
    };
    expect(() =>
      createPartyMendHealAtkScaleTransform(0.7)(wrongEffectCount),
    ).toThrow(/exactly 1 effect/);

    const wrongType = structuredClone(base) as GameData;
    const mod2 = wrongType.combatModuleRegistry[MODULE_PARTY_MEND]!;
    wrongType.combatModuleRegistry[MODULE_PARTY_MEND] = {
      ...mod2,
      action: {
        ...mod2.action,
        effect: [{ ...(mod2.action.effect[0] as object), type: 'damage' } as never],
      },
    };
    expect(() => createPartyMendHealAtkScaleTransform(0.7)(wrongType)).toThrow(
      /single heal effect/,
    );

    const wrongAmount = structuredClone(base) as GameData;
    const mod3 = wrongAmount.combatModuleRegistry[MODULE_PARTY_MEND]!;
    const healEffect = { ...(mod3.action.effect[0] as object) } as {
      type: string;
      amount: { kind: string; atkScale: number };
    };
    healEffect.amount = { kind: 'flat', atkScale: 0.55 };
    wrongAmount.combatModuleRegistry[MODULE_PARTY_MEND] = {
      ...mod3,
      action: { ...mod3.action, effect: [healEffect as never] },
    };
    expect(() => createPartyMendHealAtkScaleTransform(0.7)(wrongAmount)).toThrow(
      /amount\.kind/,
    );

    const wrongShape = structuredClone(base) as GameData;
    const mod4 = wrongShape.combatModuleRegistry[MODULE_PARTY_MEND]!;
    wrongShape.combatModuleRegistry[MODULE_PARTY_MEND] = {
      ...mod4,
      action: { ...mod4.action, targetShape: 'single', hitCount: 1 },
    };
    expect(() => createPartyMendHealAtkScaleTransform(0.7)(wrongShape)).toThrow(
      /targetShape|hitCount|effectRange/,
    );
  });

  it('changes only owned atkScale (+ synthesized active mirror), lossless at 0.55, no input mutation', () => {
    const base = loadGameData();
    const snapshot = structuredClone(base);
    const productionScale = readPartyMendAtkScale(base);
    expect(productionScale).toBe(PRODUCTION_ATK_SCALE);

    const t055 = createPartyMendHealAtkScaleTransform(0.55)(base);
    expect(base).toEqual(snapshot);
    expect(readPartyMendAtkScale(t055)).toBe(0.55);
    assertOwnedFieldDiffOnly(base, t055, 0.55);
    expect(t055.combatModuleRegistry[MODULE_PARTY_MEND]).not.toBe(
      base.combatModuleRegistry[MODULE_PARTY_MEND],
    );
    expect(t055.combatModuleRegistry).not.toBe(base.combatModuleRegistry);
    expect(t055.skillRegistry.actives).not.toBe(base.skillRegistry.actives);
    expect(t055.skillRegistry.actives[MODULE_PARTY_MEND]).not.toBe(
      base.skillRegistry.actives[MODULE_PARTY_MEND],
    );
    expect(
      t055.combatModuleRegistry[MODULE_PARTY_MEND]!.action.effect,
    ).not.toBe(base.combatModuleRegistry[MODULE_PARTY_MEND]!.action.effect);
    expect(t055.combatModuleRegistry[MODULE_PARTY_MEND]!.action).not.toBe(
      base.combatModuleRegistry[MODULE_PARTY_MEND]!.action,
    );

    const t125 = createPartyMendHealAtkScaleTransform(1.25)(base);
    expect(base).toEqual(snapshot);
    assertOwnedFieldDiffOnly(base, t125, 1.25);
    expect(
      synthesizeCombatModuleSkill(
        t125.combatModuleRegistry[MODULE_PARTY_MEND] as CombatModuleDef,
      ).effect[0],
    ).toEqual(t125.skillRegistry.actives[MODULE_PARTY_MEND]!.effect[0]);
  });
});


describe('R12n 1Q-R1 Wave 1 production ref fail-closed (test-only)', () => {
  const sampleSlots: ProblemSeriesSimInput['slots'] = [
    { classId: 'df_guardian', initialCombatModuleId: 'df_guardian_mod_a' },
    { classId: 'at_swordsman', initialCombatModuleId: 'at_swordsman_mod_a' },
    { classId: 'at_sorcerer', initialCombatModuleId: 'at_sorcerer_mod_a' },
    { classId: 'sp_cleric', initialCombatModuleId: MODULE_SINGLE_MEND },
  ];

  const sampleWaveTimeline: ProblemSeriesSimResult['waves'][number] = {
    waveIndex: 0,
    startTick: 0,
    endTick: 10,
    startSec: 0,
    endSec: 1,
    result: 'cleared',
  };

  const sampleLedger: ProblemSeriesSimResult['resourceLedger'][number] = {
    waveIndex: 0,
    grantAmount: 0,
    spentAmount: 0,
    remainingResource: 0,
  };

  const sampleDamage: ProblemSeriesSimCombatFlowDamageEvent = {
    waveIndex: 0,
    battleTimeSec: 0.1,
    actor: { id: 'a1', classId: 'at_swordsman', isEnemy: false, partySlotIndex: 1 },
    target: { id: 'e1', classId: 'at_swordsman', isEnemy: true },
    amount: 10,
    hpDamage: 10,
    barrierDamage: 0,
    lethal: false,
    sourceKind: 'skill',
    skillId: 'at_swordsman_mod_single_slash',
    slotKind: 'basic',
  };

  const sampleTick: ProblemSeriesSimTickStateDiagnostic = {
    waveIndex: 0,
    battleTimeSec: 0,
    phase: 'combat',
    runtimePhase: 'engaged',
    engaged: true,
    allies: [
      {
        id: 'a1',
        classId: 'at_swordsman',
        hp: 100,
        maxHp: 155,
        barrierHp: 0,
        atk: 20,
        battleX: 100,
        effectiveRangePx: 40,
        bodyAnimMarching: false,
        basicSkillId: 'at_swordsman_mod_single_slash',
        partySlotIndex: 1,
      },
    ],
    enemies: [
      {
        id: 'e1',
        classId: 'at_swordsman',
        hp: 50,
        maxHp: 80,
        barrierHp: 0,
        atk: 15,
        battleX: 200,
        effectiveRangePx: 40,
        bodyAnimMarching: false,
        basicSkillId: 'enemy_slash',
      },
    ],
    acquiredPassivesBySlot: [[], [], [], []],
  };

  function sampleBundle(overrides?: {
    waves?: ProblemSeriesSimResult['waves'];
    resourceLedger?: ProblemSeriesSimResult['resourceLedger'];
    damageEvents?: readonly ProblemSeriesSimCombatFlowDamageEvent[];
    healEvents?: readonly ProblemSeriesSimCombatFlowHealEvent[];
    actionEvents?: readonly ProblemSeriesSimCombatActionDiagnostic[];
    tickStates?: readonly ProblemSeriesSimTickStateDiagnostic[];
  }): DiagnosticBundle {
    const result = {
      waves: overrides?.waves ?? [sampleWaveTimeline],
      resourceLedger: overrides?.resourceLedger ?? [sampleLedger],
    } as ProblemSeriesSimResult;
    return {
      result,
      damageEvents: overrides?.damageEvents ?? [sampleDamage],
      healEvents: overrides?.healEvents ?? [],
      actionEvents: overrides?.actionEvents ?? [],
      tickStates: overrides?.tickStates ?? [sampleTick],
    };
  }

  function sampleInput(
    slots: ProblemSeriesSimInput['slots'] = sampleSlots,
  ): ProblemSeriesSimInput {
    return {
      problemSeriesSeed: PROBLEM_SERIES_SEED,
      battleRngSeed: 'r12n-1d-b-01',
      slots,
    } as ProblemSeriesSimInput;
  }

  it('rejects fewer than 9 keys and duplicate keys', () => {
    const map = new Map<string, Wave1ProductionRefSlice>();
    expect(() => assertExactNineProductionWave1Keys(map)).toThrow();
    storeProductionWave1Ref(
      map,
      'no-spend-control::r12n-1d-b-01',
      sampleBundle(),
      sampleInput(),
    );
    expect(() => assertExactNineProductionWave1Keys(map)).toThrow();
    expect(() =>
      storeProductionWave1Ref(
        map,
        'no-spend-control::r12n-1d-b-01',
        sampleBundle(),
        sampleInput(),
      ),
    ).toThrow(/duplicate production Wave 1 ref key/);
    expect(() =>
      requireProductionWave1Ref(map, 'party-mend-24::r12n-1d-b-01'),
    ).toThrow(/missing production Wave 1 ref key/);
  });

  it('rejects missing Wave 1 timeline', () => {
    expect(() =>
      buildProductionWave1Slice(
        sampleBundle({ waves: [] }),
        sampleInput(),
      ),
    ).toThrow(/missing waves\[0\] timeline/);

    expect(() =>
      buildProductionWave1Slice(
        sampleBundle({
          waves: [
            {
              ...sampleWaveTimeline,
              waveIndex: 1,
            },
          ],
        }),
        sampleInput(),
      ),
    ).toThrow(/missing wave timeline/);
  });

  it('rejects zero Wave 1 ticks', () => {
    expect(() =>
      buildProductionWave1Slice(
        sampleBundle({ tickStates: [] }),
        sampleInput(),
      ),
    ).toThrow(/at least 1 tick state/);

    expect(() =>
      buildProductionWave1Slice(
        sampleBundle({
          tickStates: [{ ...sampleTick, waveIndex: 1 }],
        }),
        sampleInput(),
      ),
    ).toThrow(/at least 1 tick state/);
  });

  it('rejects zero Wave 1 events', () => {
    expect(() =>
      buildProductionWave1Slice(
        sampleBundle({
          damageEvents: [],
          healEvents: [],
          actionEvents: [],
        }),
        sampleInput(),
      ),
    ).toThrow(/at least 1 Wave 1 event/);

    expect(() =>
      buildProductionWave1Slice(
        sampleBundle({
          damageEvents: [{ ...sampleDamage, waveIndex: 1 }],
          healEvents: [],
          actionEvents: [],
        }),
        sampleInput(),
      ),
    ).toThrow(/at least 1 Wave 1 event/);
  });

  it('rejects missing Wave 1 ledger', () => {
    expect(() =>
      buildProductionWave1Slice(
        sampleBundle({ resourceLedger: [] }),
        sampleInput(),
      ),
    ).toThrow(/missing resourceLedger\[0\]/);

    expect(() =>
      buildProductionWave1Slice(
        sampleBundle({
          resourceLedger: [{ ...sampleLedger, waveIndex: 1 }],
        }),
        sampleInput(),
      ),
    ).toThrow(/missing ledger wave 0/);
  });

  it('lossless-copies all Wave 1 fields without sharing mutable refs', () => {
    const damageEvents = [sampleDamage];
    const tickStates = [sampleTick];
    const waves = [sampleWaveTimeline];
    const ledger = [sampleLedger];
    const slots = sampleSlots!.map((s) => ({ ...s }));
    const bundle = sampleBundle({
      waves,
      resourceLedger: ledger,
      damageEvents,
      tickStates,
    });
    const input = sampleInput(slots);

    const map = new Map<string, Wave1ProductionRefSlice>();
    storeProductionWave1Ref(map, 'party-mend-24::r12n-1d-b-01', bundle, input);
    const ref = requireProductionWave1Ref(map, 'party-mend-24::r12n-1d-b-01');

    expect(ref.waveTimeline).toEqual(sampleWaveTimeline);
    expect(ref.resourceLedgerWave1).toEqual(sampleLedger);
    expect(ref.damageEvents).toEqual([sampleDamage]);
    expect(ref.healEvents).toEqual([]);
    expect(ref.actionEvents).toEqual([]);
    expect(ref.tickStates).toEqual([sampleTick]);
    expect(ref.initialCombatModuleIdBySlot).toEqual([
      'df_guardian_mod_a',
      'at_swordsman_mod_a',
      'at_sorcerer_mod_a',
      MODULE_SINGLE_MEND,
    ]);
    expect(ref.partyMendActionCountInWave1).toBe(0);

    expect(ref.waveTimeline).not.toBe(waves[0]);
    expect(ref.resourceLedgerWave1).not.toBe(ledger[0]);
    expect(ref.damageEvents).not.toBe(damageEvents);
    expect(ref.damageEvents[0]).not.toBe(damageEvents[0]);
    expect(ref.damageEvents[0]!.actor).not.toBe(damageEvents[0]!.actor);
    expect(ref.damageEvents[0]!.target).not.toBe(damageEvents[0]!.target);
    expect(ref.tickStates).not.toBe(tickStates);
    expect(ref.tickStates[0]).not.toBe(tickStates[0]);
    expect(ref.tickStates[0]!.allies).not.toBe(tickStates[0]!.allies);
    expect(ref.tickStates[0]!.enemies).not.toBe(tickStates[0]!.enemies);
    expect(ref.tickStates[0]!.acquiredPassivesBySlot).not.toBe(
      tickStates[0]!.acquiredPassivesBySlot,
    );
    expect(ref.initialCombatModuleIdBySlot).not.toBe(
      slots.map((s) => s.initialCombatModuleId),
    );

    waves[0] = { ...sampleWaveTimeline, endTick: 999 };
    ledger[0] = { ...sampleLedger, spentAmount: 999 };
    (damageEvents[0] as { amount: number }).amount = 999;
    (tickStates[0]!.allies[0] as { hp: number }).hp = 1;
    slots[SLOT_CLERIC] = {
      ...slots[SLOT_CLERIC]!,
      initialCombatModuleId: MODULE_PARTY_MEND,
    };

    expect(ref.waveTimeline.endTick).toBe(10);
    expect(ref.resourceLedgerWave1.spentAmount).toBe(0);
    expect(ref.damageEvents[0]!.amount).toBe(10);
    expect(ref.tickStates[0]!.allies[0]!.hp).toBe(100);
    expect(ref.initialCombatModuleIdBySlot[SLOT_CLERIC]).toBe(MODULE_SINGLE_MEND);
  });
});

describe('R12n 1Q series B party-mend heal atkScale sensitivity (test-only)', () => {
  let baselineCache: SeriesBBaselineFile | null = null;
  const productionRefByKey = new Map<
    string,
    {
      normalized: string;
      result: ProblemSeriesSimResult;
      enemyWaveInputs: ProblemSeriesSimResult['enemyWaveInputs'];
    }
  >();
  const wave1RefByKey = new Map<string, Wave1ProductionRefSlice>();
  const observationByScale = new Map<
    number,
    { rows: SensitivityCaseRow[]; report: ProblemSeriesBalanceSignalReport }
  >();

  it('loads production / baseline anchors (9 keys, lossless, no shared mutables)', async () => {
    assertBaselineShaUnchanged();
    baselineCache = loadBaselineB();
    const seen = new Set<string>();
    for (const baselineCase of baselineCache.cases) {
      await new Promise<void>((r) => setImmediate(r));
      const key = `${baselineCase.buildId}::${baselineCase.battleRngSeed}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      const production = runInstrumentedCase(baselineCase, undefined);
      const normalized = normalizeProblemSeriesSimResultForCompare(
        production.result,
      );
      expect(normalized).toBe(
        normalizeProblemSeriesSimResultForCompare(baselineCase.result),
      );
      productionRefByKey.set(key, {
        normalized,
        result: structuredClone(production.result),
        enemyWaveInputs: structuredClone(production.result.enemyWaveInputs),
      });
      storeProductionWave1Ref(
        wave1RefByKey,
        key,
        production,
        baselineCase.input,
      );
      const storedWave1 = requireProductionWave1Ref(wave1RefByKey, key);
      expect(storedWave1.damageEvents).not.toBe(production.damageEvents);
      expect(storedWave1.healEvents).not.toBe(production.healEvents);
      expect(storedWave1.actionEvents).not.toBe(production.actionEvents);
      expect(storedWave1.tickStates).not.toBe(production.tickStates);
      expect(storedWave1.waveTimeline).not.toBe(production.result.waves[0]);
      expect(storedWave1.resourceLedgerWave1).not.toBe(
        production.result.resourceLedger[0],
      );
      const scale055 = runInstrumentedCase(
        baselineCase,
        createPartyMendHealAtkScaleTransform(0.55),
      );
      expect(normalizeProblemSeriesSimResultForCompare(scale055.result)).toBe(
        normalized,
      );
      expect(buildProductionWave1Slice(scale055, baselineCase.input)).toEqual(
        storedWave1,
      );
    }
    expect(seen.size).toBe(9);
    expect(productionRefByKey.size).toBe(9);
    assertExactNineProductionWave1Keys(wave1RefByKey);
    assertBaselineShaUnchanged();
  }, 300_000);

  for (const atkScale of ATK_SCALE_POINTS) {
    it(
      `atkScale=${atkScale}: 9 cases, heal reflection, signals, qualitative sig, Wave1 non-propagation`,
      async () => {
        expect(baselineCache).not.toBeNull();
        expect(productionRefByKey.size).toBe(9);
        assertExactNineProductionWave1Keys(wave1RefByKey);
        const { rows, report } = await runSensitivityForAtkScale(
          atkScale,
          baselineCache!,
          productionRefByKey,
          wave1RefByKey,
        );
        assertObservedAtkScalePack(atkScale, rows, report);
        observationByScale.set(atkScale, { rows, report });
      },
      300_000,
    );
  }

  it('locks first qualitative transitions and heal scale reflection without declaring production-ready', () => {
    expect(observationByScale.size).toBe(5);
    for (const buildId of BUILD_IDS) {
      for (const seed of BATTLE_RNG_SEEDS) {
        const key = caseKey(buildId, seed);
        const expectedFirst = EXPECTED_FIRST_QUALITATIVE_TRANSITION_SCALE[key];
        expect(
          Object.prototype.hasOwnProperty.call(
            EXPECTED_FIRST_QUALITATIVE_TRANSITION_SCALE,
            key,
          ),
        ).toBe(true);
        const baseSig = JSON.stringify(
          observationByScale.get(0.55)!.rows.find(
            (r) => caseKey(r.buildId, r.battleRngSeed) === key,
          )!.qualitativeSig,
        );
        let observedFirst: AtkScale | null = null;
        for (const scale of ATK_SCALE_POINTS) {
          const row = observationByScale
            .get(scale)!
            .rows.find((r) => caseKey(r.buildId, r.battleRngSeed) === key)!;
          if (JSON.stringify(row.qualitativeSig) !== baseSig) {
            observedFirst = scale;
            break;
          }
        }
        expect(observedFirst).toBe(expectedFirst);
      }
    }

    const partyKeys = BATTLE_RNG_SEEDS.map((s) => caseKey('party-mend-24', s));
    const healTotalsByScale = ATK_SCALE_POINTS.map((scale) => {
      const rows = observationByScale.get(scale)!.rows.filter((r) =>
        partyKeys.includes(caseKey(r.buildId, r.battleRngSeed)),
      );
      expect(rows).toHaveLength(3);
      return rows.map((r) =>
        Object.values(r.healByTarget).reduce((a, b) => a + b.total, 0),
      );
    });
    for (let i = 0; i < 3; i++) {
      expect(healTotalsByScale[1]![i]!).toBeGreaterThan(healTotalsByScale[0]![i]!);
      expect(healTotalsByScale[4]![i]!).toBeGreaterThan(healTotalsByScale[1]![i]!);
    }
    assertBaselineShaUnchanged();
  });

  it('observes exactly 5×9 rectangle without declaring Backend/Player/Phase complete', () => {
    const executed = new Set<string>();
    for (const scale of ATK_SCALE_POINTS) {
      const pack = observationByScale.get(scale);
      expect(pack).toBeDefined();
      expect(pack!.rows).toHaveLength(9);
      for (const row of pack!.rows) {
        const key = `${row.atkScale}::${caseKey(row.buildId, row.battleRngSeed)}`;
        expect(executed.has(key)).toBe(false);
        executed.add(key);
      }
    }
    const expected = new Set<string>();
    for (const scale of ATK_SCALE_POINTS) {
      for (const buildId of BUILD_IDS) {
        for (const seed of BATTLE_RNG_SEEDS) {
          expected.add(`${scale}::${caseKey(buildId, seed)}`);
        }
      }
    }
    expect(executed.size).toBe(45);
    expect(expected.size).toBe(45);
    for (const key of expected) expect(executed.has(key)).toBe(true);
    for (const key of executed) expect(expected.has(key)).toBe(true);
  });
});
