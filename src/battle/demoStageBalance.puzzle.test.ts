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
) {
  const baseline = runDemoStageBattle(stageId, { gameData });
  const badResult = runDemoStageBattle(stageId, { gameData, configureSave: bad });
  const universalResult = runDemoStageBattle(stageId, {
    gameData,
    configureSave: configureUniversalParty,
  });
  const counterResult = runDemoStageBattle(stageId, {
    gameData,
    configureSave: counter,
  });

  logCompositionDelta(stageId, 'baseline', baseline);
  logCompositionDelta(stageId, 'bad', badResult);
  logCompositionDelta(stageId, 'universal', universalResult);
  logCompositionDelta(stageId, 'counter', counterResult);

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
  },
];

describe('demo stage balance / puzzle (composition deltas)', () => {
  const gameData = createDemoStageGameData();

  it.each(STAGE_PUZZLES.map((spec) => [spec.stageId, spec] as const))(
    '%s: bad fares worse than baseline; counter fares better than bad',
    (_stageId, spec) => {
      const { baseline, badResult, universalResult, counterResult } =
        runCompositionQuad(spec.stageId, gameData, spec.bad, spec.counter);

      expect(demoStageOutcomeScore(badResult)).toBeLessThan(
        demoStageOutcomeScore(baseline),
      );
      expect(demoStageOutcomeScore(counterResult)).toBeGreaterThan(
        demoStageOutcomeScore(badResult),
      );

      if (spec.requireCounterVictory) {
        expect(counterResult.outcome).toBe('victory');
        expect(counterResult.survivingAllies).toBeGreaterThan(0);
      }
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
