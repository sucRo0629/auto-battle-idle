/**
 * Demo stage runtime smoke — each M1 stage battle resolves without timeout or instant abort.
 * Does NOT assert standard-party victory (see demoStageBalance.puzzle.test.ts for composition deltas).
 */
import { describe, expect, it } from 'vitest';
import { createEnemiesForStage } from './entities.ts';
import { expandEnemyGroups } from './enemyGroupSpawn.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import {
  createDemoStageGameData,
  DEMO_STAGE_IDS,
  MAX_DEMO_BATTLE_TICKS,
  MIN_DEMO_BATTLE_TICKS,
  runDemoStageBattle,
  type DemoStageBattleOutcome,
  type DemoStageBattleResult,
} from './test/demoStageSim.harness.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);

function logResult(result: DemoStageBattleResult): void {
  console.info(
    `[demo-smoke] ${result.stageId}: ${result.outcome} ` +
      `ticks=${result.tickCount} (${result.durationSec.toFixed(1)}s) ` +
      `survivors=${result.survivingAllies} hp=${result.totalRemainingHp}/${result.totalMaxHp}`,
  );
}

function assertBattleCompletes(result: DemoStageBattleResult): void {
  logResult(result);

  expect(result.outcome).not.toBe('timeout');
  expect(['victory', 'defeat'] as DemoStageBattleOutcome[]).toContain(
    result.outcome,
  );
  expect(result.tickCount).toBeGreaterThanOrEqual(MIN_DEMO_BATTLE_TICKS);
  expect(result.tickCount).toBeLessThan(MAX_DEMO_BATTLE_TICKS);
  expect(result.durationSec).toBeGreaterThan(0);
  expect(result.totalMaxHp).toBeGreaterThan(0);
  expect(result.survivingAllies).toBeGreaterThanOrEqual(0);
  expect(result.totalRemainingHp).toBeGreaterThanOrEqual(0);
}

describe('demo stage runtime smoke (standard party)', () => {
  const gameData = createDemoStageGameData();

  it.each(DEMO_STAGE_IDS)(
    '%s: battle resolves (victory or defeat), not instant, within tick budget',
    (stageId) => {
      assertBattleCompletes(runDemoStageBattle(stageId, { gameData }));
    },
  );
});

describe('demo stage data sanity', () => {
  const gameData = createDemoStageGameData();

  it('demo_ch1_03 rush stage spawns 7 enemies', () => {
    const stage = gameData.stages.find((s) => s.id === 'demo_ch1_03');
    expect(stage).toBeDefined();
    expect(expandEnemyGroups(stage!).map((s) => s.classId)).toHaveLength(7);
    expect(
      createEnemiesForStage(gameData, 'demo_ch1_03', 0, levelCurves),
    ).toHaveLength(7);
  });
});
