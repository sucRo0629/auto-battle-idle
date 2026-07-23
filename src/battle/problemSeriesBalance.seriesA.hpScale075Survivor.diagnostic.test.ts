/**
 * R12n 1G / 1G-R1 — 系列A hpScale 0.75 survivor 診断と観測回帰固定（test-only）。
 *
 * 1G: 最終敵診断で識別証拠を取る。
 * 1G-R1: 敗北時後衛2体満HP等の現行観測を直接 assert（console だけに依存しない）。
 * production 値の採用・数値変更・baseline 改変はしない。
 * 次の単一所有者は未確定のまま（推測で選ばない）。
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
  type ProblemSeriesSimFinalEnemyDiagnostic,
  type ProblemSeriesSimInput,
  type ProblemSeriesSimResult,
  type ProblemSeriesSimSurvivingEnemyDiagnostic,
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

interface DiagnosticCaseRow {
  readonly buildId: BuildId;
  readonly battleRngSeed: BattleRngSeed;
  readonly outcome: ProblemSeriesSimResult['outcome'];
  readonly finalWaveIndex: number;
  readonly phase: string;
  readonly survivingEnemyCount: number;
  readonly survivors: readonly ProblemSeriesSimSurvivingEnemyDiagnostic[];
  readonly finalWaveEnemyGroupClassIds: readonly string[];
  readonly totalRemainingEnemyHp: number;
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

/** 1G-R1 固定観測: 敗北時に満HPで残る後衛2体（順序非依存）。 */
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

const EXPECTED_DEFEAT_SURVIVOR_CLASS_IDS = Object.keys(
  EXPECTED_DEFEAT_SURVIVOR_BY_CLASS,
).sort();

const EXPECTED_DEFEAT_SURVIVOR_HP_SUM = 180;

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

function assertSurvivorMatchesFinalWaveGroups(
  survivor: ProblemSeriesSimSurvivingEnemyDiagnostic,
  diagnostic: ProblemSeriesSimFinalEnemyDiagnostic,
): void {
  const matchingGroups = diagnostic.finalWaveEnemyInputs.enemyGroups.filter(
    (group) => group.classId === survivor.classId,
  );
  expect(
    matchingGroups.length,
    `survivor classId "${survivor.classId}" must map to finalWave enemyGroups`,
  ).toBeGreaterThan(0);
}

function assertDefeatSurvivors(
  result: ProblemSeriesSimResult,
  diagnostic: ProblemSeriesSimFinalEnemyDiagnostic,
): void {
  expect(diagnostic.survivingEnemies.length).toBeGreaterThan(0);
  expect(diagnostic.survivingEnemies.length).toBe(result.survivingEnemies);
  const hpSum = diagnostic.survivingEnemies.reduce(
    (sum, enemy) => sum + enemy.hp,
    0,
  );
  expect(hpSum).toBe(result.totalRemainingEnemyHp);
  for (const survivor of diagnostic.survivingEnemies) {
    expect(Number.isFinite(survivor.hp)).toBe(true);
    expect(Number.isFinite(survivor.maxHp)).toBe(true);
    expect(Number.isFinite(survivor.baseMaxHp)).toBe(true);
    expect(Number.isFinite(survivor.barrierHp)).toBe(true);
    expect(Number.isFinite(survivor.atk)).toBe(true);
    expect(Number.isFinite(survivor.def)).toBe(true);
    expect(Number.isFinite(survivor.res)).toBe(true);
    expect(survivor.classId.length).toBeGreaterThan(0);
    expect(survivor.basicSkillId.length).toBeGreaterThan(0);
    expect(survivor.id.length).toBeGreaterThan(0);
    expect(survivor.name.length).toBeGreaterThan(0);
    assertSurvivorMatchesFinalWaveGroups(survivor, diagnostic);
  }
}

/**
 * 1G-R1: 敗北 case の後衛2体満HP観測を classId 索引で直接固定。
 * 配列順に依存せず、重複 classId / 余分な3体目 / guardian 生存は失敗する。
 */
function assertExactRearFullHpDefeatSurvivors(
  result: ProblemSeriesSimResult,
  diagnostic: ProblemSeriesSimFinalEnemyDiagnostic,
): void {
  expect(diagnostic.survivingEnemies).toHaveLength(2);
  expect(result.survivingEnemies).toBe(2);

  const byClassId = new Map<string, ProblemSeriesSimSurvivingEnemyDiagnostic>();
  for (const survivor of diagnostic.survivingEnemies) {
    expect(
      byClassId.has(survivor.classId),
      `duplicate survivor classId "${survivor.classId}"`,
    ).toBe(false);
    byClassId.set(survivor.classId, survivor);
  }

  expect([...byClassId.keys()].sort()).toEqual(EXPECTED_DEFEAT_SURVIVOR_CLASS_IDS);
  expect(byClassId.has('df_guardian')).toBe(false);

  for (const classId of EXPECTED_DEFEAT_SURVIVOR_CLASS_IDS) {
    const expected =
      EXPECTED_DEFEAT_SURVIVOR_BY_CLASS[
        classId as keyof typeof EXPECTED_DEFEAT_SURVIVOR_BY_CLASS
      ];
    const survivor = byClassId.get(classId);
    expect(survivor, `missing survivor classId "${classId}"`).toBeDefined();
    expect(survivor!.basicSkillId).toBe(expected.basicSkillId);
    expect(survivor!.hp).toBe(expected.hp);
    expect(survivor!.maxHp).toBe(expected.maxHp);
    expect(survivor!.hp).toBe(survivor!.maxHp);
  }

  const hpSum = diagnostic.survivingEnemies.reduce(
    (sum, enemy) => sum + enemy.hp,
    0,
  );
  expect(hpSum).toBe(EXPECTED_DEFEAT_SURVIVOR_HP_SUM);
  expect(result.totalRemainingEnemyHp).toBe(EXPECTED_DEFEAT_SURVIVOR_HP_SUM);
}

/** 1G-R1: known-attack-24 勝利観測を直接固定。 */
function assertExactVictoryNoSurvivors(
  result: ProblemSeriesSimResult,
  diagnostic: ProblemSeriesSimFinalEnemyDiagnostic,
): void {
  expect(result.outcome).toBe('victory');
  expect(result.finalWaveIndex).toBe(2);
  expect(result.survivingEnemies).toBe(0);
  expect(diagnostic.survivingEnemies).toEqual([]);
  expect(diagnostic.survivingEnemies).toHaveLength(0);
  expect(result.totalRemainingEnemyHp).toBe(0);
}

describe('R12n 1G/1G-R1 series A hpScale=0.75 survivor diagnostic (test-only)', () => {
  it(
    'runs all 9 cases with final-enemy diagnostic callback (fail-closed)',
    async () => {
      assertBaselineShaUnchanged();
      const baseline = loadBaselineA();
      const transform = createSeriesAWave2GuardianHpScaleTransform(HP_SCALE);

      const pairKeys = new Set<string>();
      const rows: DiagnosticCaseRow[] = [];
      let diagnosticCallbackReachCount = 0;

      for (const baselineCase of baseline.cases) {
        await new Promise<void>((resolveTick) => {
          setImmediate(resolveTick);
        });

        expect(
          BUILD_IDS.includes(baselineCase.buildId as BuildId),
        ).toBe(true);
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

        let captured: ProblemSeriesSimFinalEnemyDiagnostic | undefined;
        const input: ProblemSeriesSimInput = {
          ...baselineCase.input,
          transformResolvedBattleWaves: transform,
          onFinalEnemyDiagnostic: (diagnostic) => {
            diagnosticCallbackReachCount += 1;
            captured = diagnostic;
          },
        };

        const result = runProblemSeriesSim(input);
        expect(result.seriesId).toBe(SERIES_ID);
        expect(result.battleRngSeed).toBe(battleRngSeed);
        expectKnownOutcome(buildId, result);

        // 診断 callback 未到達での成功を禁止
        expect(captured).toBeDefined();
        const diagnostic = captured!;
        expect(diagnostic.finalWaveIndex).toBe(result.finalWaveIndex);
        expect(diagnostic.outcome).toBe(result.outcome);
        expect(diagnostic.phase.length).toBeGreaterThan(0);
        expect(diagnostic.finalWaveEnemyInputs.enemyGroups.length).toBeGreaterThan(
          0,
        );

        if (buildId === 'known-attack-24') {
          expect(diagnostic.survivingEnemies).toEqual([]);
          expect(result.survivingEnemies).toBe(0);
          // 1G-R1: 勝利観測の直接固定（console 出力ではない）
          assertExactVictoryNoSurvivors(result, diagnostic);
        } else {
          assertDefeatSurvivors(result, diagnostic);
          // 1G-R1: 敗北後衛2体満HP観測の直接固定（console 出力ではない）
          // no-spend-control / alternate-core-24 共通
          assertExactRearFullHpDefeatSurvivors(result, diagnostic);
        }

        rows.push({
          buildId,
          battleRngSeed,
          outcome: result.outcome,
          finalWaveIndex: result.finalWaveIndex,
          phase: diagnostic.phase,
          survivingEnemyCount: diagnostic.survivingEnemies.length,
          survivors: diagnostic.survivingEnemies,
          finalWaveEnemyGroupClassIds:
            diagnostic.finalWaveEnemyInputs.enemyGroups.map((g) => g.classId),
          totalRemainingEnemyHp: result.totalRemainingEnemyHp,
        });
      }

      expect(pairKeys.size).toBe(9);
      expect(rows).toHaveLength(9);
      expect(diagnosticCallbackReachCount).toBe(9);

      // 矩形 coverage（3×3）欠落禁止
      for (const buildId of BUILD_IDS) {
        for (const seed of BATTLE_RNG_SEEDS) {
          expect(pairKeys.has(`${buildId}::${seed}`)).toBe(true);
        }
      }

      // 補助ログのみ（回帰証拠の正本は上の直接 assert）
      // eslint-disable-next-line no-console
      console.log(
        'buildId | seed | outcome | finalWave | phase | survCount | classId | basicSkillId | hp/maxHp | atk/def/res | waveGroupCandidates',
      );
      for (const row of rows) {
        if (row.survivors.length === 0) {
          // eslint-disable-next-line no-console
          console.log(
            [
              row.buildId,
              row.battleRngSeed,
              row.outcome,
              row.finalWaveIndex,
              row.phase,
              0,
              '(none)',
              '(none)',
              '-',
              '-',
              row.finalWaveEnemyGroupClassIds.join(','),
            ].join(' | '),
          );
          continue;
        }
        for (const survivor of row.survivors) {
          // eslint-disable-next-line no-console
          console.log(
            [
              row.buildId,
              row.battleRngSeed,
              row.outcome,
              row.finalWaveIndex,
              row.phase,
              row.survivingEnemyCount,
              survivor.classId,
              survivor.basicSkillId,
              `${survivor.hp}/${survivor.maxHp}`,
              `${survivor.atk}/${survivor.def}/${survivor.res}`,
              row.finalWaveEnemyGroupClassIds.join(','),
            ].join(' | '),
          );
        }
      }

      assertBaselineShaUnchanged();
    },
    180_000,
  );

  it('omitted onFinalEnemyDiagnostic leaves Result / normalize identical to no-callback path', () => {
    assertBaselineShaUnchanged();
    const baseline = loadBaselineA();
    const sample = baseline.cases[0]!;
    const transform = createSeriesAWave2GuardianHpScaleTransform(HP_SCALE);

    const withoutCallback = runProblemSeriesSim({
      ...sample.input,
      transformResolvedBattleWaves: transform,
    });
    const withNoopCallback = runProblemSeriesSim({
      ...sample.input,
      transformResolvedBattleWaves: transform,
      onFinalEnemyDiagnostic: () => {
        // Result を汚染しないことだけ確認
      },
    });

    expect(normalizeProblemSeriesSimResultForCompare(withoutCallback)).toBe(
      normalizeProblemSeriesSimResultForCompare(withNoopCallback),
    );
    // Result 型に診断フィールドが混入していない
    expect(
      Object.prototype.hasOwnProperty.call(withoutCallback, 'survivingEnemyDiagnostics'),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(withNoopCallback, 'onFinalEnemyDiagnostic'),
    ).toBe(false);
    assertBaselineShaUnchanged();
  });
});
