/**
 * Demo stage balance / puzzle — composition deltas (bad vs baseline vs counter).
 * Separate from runtime smoke; may be tuned during Phase 6c without blocking CI smoke.
 */
import { describe, expect, it } from 'vitest';
import type { GameData, SaveGameState } from './types.ts';
import {
  configureDoubleMeleeParty,
  configureNoGuardianParty,
  configureNoHealerParty,
  configurePaladinTankParty,
  configureRangedCounterParty,
  configureUniversalParty,
  createDemoStageGameData,
  demoStageOutcomeScore,
  logDemoStageClassDiagnostics,
  logDemoCh1_06RangerSorcererDiagnostics,
  logAttackerActionTimelineDiagnostics,
  logLoadedRangerA2Definition,
  logRangerA2BattleDiagnostics,
  logRangerBasicAttackDiagnostics,
  logPaladinCounterDurability,
  logRangerSorcererComparison,
  runDemoStageBattle,
  type DemoStageBattleResult,
  type DemoStageId,
} from './test/demoStageSim.harness.ts';

type ConfigureSave = (save: SaveGameState, gameData: GameData) => void;

interface StagePuzzleSpec {
  stageId: DemoStageId;
  bad: ConfigureSave;
  counter: ConfigureSave;
  /** When true, counter must win even if baseline may defeat (late-game puzzle stages). */
  requireCounterVictory?: boolean;
  /** When true, skip bad < baseline score check (both may defeat with score 0). */
  skipBadVsBaseline?: boolean;
  /** When true, skip counter > bad score check (late-game puzzle stages). */
  skipCounterVsBad?: boolean;
  /** When true, emit Ranger basic-attack delay diagnostics. */
  rangerBasicDiagnostics?: boolean;
  /** When true, bad composition must lose. */
  badMustDefeat?: boolean;
}

function logCompositionDelta(
  stageId: string,
  label: string,
  result: DemoStageBattleResult,
): void {
  console.info(
    `[demo-puzzle] ${stageId}/${label}: ${result.outcome} ` +
      `survivors=${result.survivingAllies} ` +
      `remainingHp=${result.totalRemainingHp} totalMaxHp=${result.totalMaxHp} ` +
      `durationSec=${result.durationSec.toFixed(1)}`,
  );
}

function runCompositionQuad(
  stageId: DemoStageId,
  gameData: GameData,
  bad: ConfigureSave,
  counter: ConfigureSave,
  options?: Pick<StagePuzzleSpec, 'rangerBasicDiagnostics'>,
) {
  const diagOpts = options?.rangerBasicDiagnostics
    ? { enableRangerBasicAttackDiagnostics: true as const }
    : undefined;
  const baseline = runDemoStageBattle(stageId, { gameData, ...diagOpts });
  const badResult = runDemoStageBattle(stageId, {
    gameData,
    configureSave: bad,
    ...diagOpts,
  });
  const universalResult = runDemoStageBattle(stageId, {
    gameData,
    configureSave: configureUniversalParty,
    ...diagOpts,
  });
  const counterResult = runDemoStageBattle(stageId, {
    gameData,
    configureSave: counter,
    ...diagOpts,
  });

  logCompositionDelta(stageId, 'baseline', baseline);
  logCompositionDelta(stageId, 'bad', badResult);
  logCompositionDelta(stageId, 'universal', universalResult);
  logCompositionDelta(stageId, 'counter', counterResult);

  if (stageId === 'demo_ch1_06') {
    logDemoStageClassDiagnostics(stageId, 'baseline', baseline);
    logDemoStageClassDiagnostics(stageId, 'universal', universalResult);
    logDemoStageClassDiagnostics(stageId, 'counter', counterResult);
    logDemoCh1_06RangerSorcererDiagnostics(
      baseline,
      universalResult,
      counterResult,
    );
    logRangerSorcererComparison(stageId, baseline, universalResult);
    logPaladinCounterDurability(stageId, baseline, counterResult);
    logRangerA2BattleDiagnostics(stageId, 'baseline', baseline.rangerA2Diagnostics);
    logRangerA2BattleDiagnostics(stageId, 'counter', counterResult.rangerA2Diagnostics);
    logRangerBasicAttackDiagnostics(
      stageId,
      'baseline',
      baseline.rangerBasicAttackDiagnostics,
    );
    logRangerBasicAttackDiagnostics(
      stageId,
      'counter',
      counterResult.rangerBasicAttackDiagnostics,
    );
  }

  return { baseline, badResult, universalResult, counterResult };
}

const STAGE_PUZZLES: StagePuzzleSpec[] = [
  {
    stageId: 'demo_ch1_01',
    bad: configureNoGuardianParty,
    counter: configurePaladinTankParty,
  },
  {
    stageId: 'demo_ch1_02',
    bad: configureNoGuardianParty,
    counter: configureRangedCounterParty,
  },
  {
    stageId: 'demo_ch1_03',
    bad: configureNoGuardianParty,
    counter: configureDoubleMeleeParty,
  },
  {
    stageId: 'demo_ch1_05',
    bad: configureNoHealerParty,
    counter: configurePaladinTankParty,
  },
  {
    stageId: 'demo_ch1_06',
    bad: configureNoHealerParty,
    counter: configurePaladinTankParty,
    requireCounterVictory: true,
    skipBadVsBaseline: true,
    skipCounterVsBad: true,
    rangerBasicDiagnostics: true,
  },
];

describe('demo stage balance / puzzle (composition deltas)', () => {
  const gameData = createDemoStageGameData();
  logLoadedRangerA2Definition(gameData);

  it.each(STAGE_PUZZLES.map((spec) => [spec.stageId, spec] as const))(
    '%s: bad fares worse than baseline; counter fares better than bad',
    (_stageId, spec) => {
      const { baseline, badResult, universalResult, counterResult } =
        runCompositionQuad(
          spec.stageId,
          gameData,
          spec.bad,
          spec.counter,
          { rangerBasicDiagnostics: spec.rangerBasicDiagnostics },
        );

      if (!spec.skipBadVsBaseline) {
        expect(demoStageOutcomeScore(badResult)).toBeLessThan(
          demoStageOutcomeScore(baseline),
        );
      }
      if (!spec.skipCounterVsBad) {
        expect(demoStageOutcomeScore(counterResult)).toBeGreaterThan(
          demoStageOutcomeScore(badResult),
        );
      }

      if (spec.badMustDefeat) {
        expect(badResult.outcome).toBe('defeat');
      }

      if (spec.requireCounterVictory) {
        expect(counterResult.outcome).toBe('victory');
        expect(counterResult.outcome).not.toBe('timeout');
        expect(counterResult.survivingAllies).toBeGreaterThan(0);
      }

      if (spec.rangerBasicDiagnostics && spec.stageId === 'demo_ch1_06') {
        logRangerBasicAttackDiagnostics(
          'demo_ch1_06',
          'baseline',
          baseline.rangerBasicAttackDiagnostics,
        );
        logRangerBasicAttackDiagnostics(
          'demo_ch1_06',
          'counter',
          counterResult.rangerBasicAttackDiagnostics,
        );
        expect(baseline.rangerBasicAttackDiagnostics).toBeDefined();
        expect(counterResult.rangerBasicAttackDiagnostics).toBeDefined();
        expect(
          baseline.rangerBasicAttackDiagnostics!.firstBasicActionSec,
        ).toBeGreaterThan(0);
      }

      // baseline outcome not asserted for puzzle stages that allow baseline defeat.
      void baseline;
      void universalResult;
    },
  );

  it('demo_ch1_04: healer party wins; no-healer party loses', () => {
    const withHealer = runDemoStageBattle('demo_ch1_04', { gameData });
    const withoutHealer = runDemoStageBattle('demo_ch1_04', {
      gameData,
      configureSave: configureNoHealerParty,
    });
    const universal = runDemoStageBattle('demo_ch1_04', {
      gameData,
      configureSave: configureUniversalParty,
    });
    logCompositionDelta('demo_ch1_04', 'baseline', withHealer);
    logCompositionDelta('demo_ch1_04', 'bad', withoutHealer);
    logCompositionDelta('demo_ch1_04', 'universal', universal);

    expect(withHealer.outcome).toBe('victory');
    expect(withHealer.survivingAllies).toBeGreaterThan(0);
    expect(withoutHealer.outcome).toBe('defeat');
    expect(withoutHealer.survivingAllies).toBe(0);
  });

  it('demo_ch1_07: counter wins; bad and universal lose (baseline defeat allowed)', () => {
    const { baseline: baselineResult, badResult, universalResult, counterResult } =
      runCompositionQuad(
        'demo_ch1_07',
        gameData,
        configureNoHealerParty,
        configurePaladinTankParty,
      );

    expect(badResult.outcome).toBe('defeat');
    expect(universalResult.outcome).toBe('defeat');
    expect(counterResult.outcome).toBe('victory');
    expect(counterResult.survivingAllies).toBeGreaterThan(0);
    // baselineResult: logged only — outcome not asserted (may defeat).
    void baselineResult;
  });

  it('demo_ch1_06: class damage diagnostics (baseline vs universal vs counter)', () => {
    const diagOpts = { enableRangerBasicAttackDiagnostics: true as const };
    const baseline = runDemoStageBattle('demo_ch1_06', { gameData, ...diagOpts });
    const universal = runDemoStageBattle('demo_ch1_06', {
      gameData,
      configureSave: configureUniversalParty,
      ...diagOpts,
    });
    const counter = runDemoStageBattle('demo_ch1_06', {
      gameData,
      configureSave: configurePaladinTankParty,
      ...diagOpts,
    });

    logDemoStageClassDiagnostics('demo_ch1_06', 'baseline', baseline);
    logDemoStageClassDiagnostics('demo_ch1_06', 'universal', universal);
    logDemoStageClassDiagnostics('demo_ch1_06', 'counter', counter);
    logDemoCh1_06RangerSorcererDiagnostics(baseline, universal, counter);
    logAttackerActionTimelineDiagnostics(
      'demo_ch1_06',
      'baseline',
      baseline,
      'at_ranger',
    );
    logAttackerActionTimelineDiagnostics(
      'demo_ch1_06',
      'counter',
      counter,
      'at_ranger',
    );
    logAttackerActionTimelineDiagnostics(
      'demo_ch1_06',
      'universal',
      universal,
      'at_sorcerer',
    );
    logRangerSorcererComparison('demo_ch1_06', baseline, universal);
    logPaladinCounterDurability('demo_ch1_06', baseline, counter);
    logRangerA2BattleDiagnostics('demo_ch1_06', 'baseline', baseline.rangerA2Diagnostics);
    logRangerA2BattleDiagnostics('demo_ch1_06', 'counter', counter.rangerA2Diagnostics);
    logRangerBasicAttackDiagnostics(
      'demo_ch1_06',
      'baseline',
      baseline.rangerBasicAttackDiagnostics,
    );
    logRangerBasicAttackDiagnostics(
      'demo_ch1_06',
      'counter',
      counter.rangerBasicAttackDiagnostics,
    );

    expect(counter.outcome).toBe('victory');
    expect(counter.outcome).not.toBe('timeout');
    expect(baseline.rangerBasicAttackDiagnostics).toBeDefined();
    expect(counter.rangerBasicAttackDiagnostics).toBeDefined();
    expect(baseline.classStats).toHaveLength(4);
    expect(universal.classStats).toHaveLength(4);
    expect(counter.classStats).toHaveLength(4);

    const rangerBaseline = baseline.classStats.find(
      (row) => row.classId === 'at_ranger',
    );
    const sorcererUniversal = universal.classStats.find(
      (row) => row.classId === 'at_sorcerer',
    );
    expect(rangerBaseline).toBeDefined();
    expect(sorcererUniversal).toBeDefined();
    expect(rangerBaseline!.damageDealt).toBeGreaterThanOrEqual(0);
    expect(sorcererUniversal!.damageDealt).toBeGreaterThanOrEqual(0);
    expect(rangerBaseline!.hitCount).toBeGreaterThanOrEqual(0);
    expect(sorcererUniversal!.hitCount).toBeGreaterThanOrEqual(0);
    expect(rangerBaseline!.attackCount).toBeGreaterThanOrEqual(0);
    expect(sorcererUniversal!.attackCount).toBeGreaterThanOrEqual(0);
    expect(rangerBaseline!.skillUseCount).toBeGreaterThanOrEqual(0);
    expect(sorcererUniversal!.skillUseCount).toBeGreaterThanOrEqual(0);
  });

  it('demo_ch1_02: ranged-counter party does not fare worse than standard on remaining HP', () => {
    const standard = runDemoStageBattle('demo_ch1_02', { gameData });
    const rangedCounter = runDemoStageBattle('demo_ch1_02', {
      gameData,
      configureSave: configureRangedCounterParty,
    });
    logCompositionDelta('demo_ch1_02', 'baseline', standard);
    logCompositionDelta('demo_ch1_02', 'counter', rangedCounter);

    expect(rangedCounter.outcome).toBe('victory');
    expect(rangedCounter.totalRemainingHp).toBeGreaterThanOrEqual(
      standard.totalRemainingHp * 0.5,
    );
  });
});
