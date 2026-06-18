import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import {
  asBattleEngineInternals,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';

function createTestStageEngine(options?: { started?: boolean }): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = 'test';
  const engine = new BattleEngine(
    gameData,
    loadLevelCurves(levelCurvesJson),
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
  if (options?.started !== false) {
    engine.startBattle();
  }
  return engine;
}

describe('training dummy positions', () => {
  it('skips deploy and engages immediately on startBattle', () => {
    const engine = createTestStageEngine({ started: false });
    const beforeStart = engine.getSnapshot();
    expect(beforeStart.waveAnnouncementActive).toBe(false);
    expect(beforeStart.partyDeployActive).toBe(false);
    expect(beforeStart.engaged).toBe(false);
    for (const ally of beforeStart.allies.filter((a) => a.hp > 0)) {
      expect(ally.battleX).toBeGreaterThan(0);
    }

    engine.startBattle();
    const afterStart = engine.getSnapshot();
    expect(afterStart.engaged).toBe(true);
    expect(afterStart.runtimePhase).toBe('Engaged');
    for (const enemy of afterStart.enemies.filter((e) => e.hp > 0)) {
      expect(enemy.battleX).toBeGreaterThan(50);
    }
  });

  it('keeps engage layout positions after combat starts', () => {
    const engine = createTestStageEngine();
    const internal = asBattleEngineInternals(engine);
    const atEngage = new Map(
      internal.enemies
        .filter((e) => e.isAlive)
        .map((e) => [e.id, e.battleX] as const),
    );
    expect(atEngage.size).toBe(5);

    for (let t = 0; t < 600; t++) {
      engine.tick(TICK_DT);
    }

    for (const enemy of internal.enemies) {
      if (!enemy.isAlive) continue;
      expect(enemy.battleX).toBe(atEngage.get(enemy.id));
    }
  });
});
