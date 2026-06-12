import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { createStage1Engine, TICK_DT } from './test/battleFieldSpec.harness.ts';

function createTestStageEngine(): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = 'test';
  return new BattleEngine(
    gameData,
    loadLevelCurves(levelCurvesJson),
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
}

describe('BattleEngine training fast start', () => {
  it('test stage skips wave announcement and deploy', () => {
    const engine = createTestStageEngine();
    const snap = engine.getSnapshot();
    expect(snap.waveAnnouncementActive).toBe(false);
    expect(snap.partyDeployActive).toBe(false);
    expect(snap.engaged).toBe(false);
    expect(snap.enemies.length).toBe(3);
  });

  it('stage 1 still uses wave announcement flow', () => {
    const engine = createStage1Engine();
    const snap = engine.getSnapshot();
    expect(snap.waveAnnouncementActive).toBe(true);
    expect(snap.engaged).toBe(false);
  });

  it('test stage engages on first tick after startBattle without deploy wait', () => {
    const engine = createTestStageEngine();
    engine.startBattle();
    expect(engine.getSnapshot().engaged).toBe(true);
    engine.tick(TICK_DT);
    expect(engine.getSnapshot().engaged).toBe(true);
    expect(engine.getSnapshot().partyDeployActive).toBe(false);
  });
});
