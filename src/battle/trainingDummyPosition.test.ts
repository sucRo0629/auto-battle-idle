import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { SPRITE_GAP, resolveEnemySpawnBattleX } from './battleConstants.ts';
import { separateByGap } from './combatPosition.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import {
  asBattleEngineInternals,
  reachWave1Engage,
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

function expectedDeployPositions(
  enemies: Array<{ id: string; spawnX?: number; isAlive: boolean }>,
): Map<string, number> {
  const units = enemies.map((enemy) => ({
    id: enemy.id,
    battleX: resolveEnemySpawnBattleX(enemy.spawnX ?? 0),
    isAlive: enemy.isAlive,
  }));
  return separateByGap(units, SPRITE_GAP);
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
    for (const enemy of beforeStart.enemies) {
      expect(enemy.battleX).toBeGreaterThan(200);
    }

    engine.startBattle();
    const afterStart = engine.getSnapshot();
    expect(afterStart.engaged).toBe(true);
    expect(afterStart.runtimePhase).toBe('Engaged');
  });

  it('keeps spawn spacing after engage', () => {
    const engine = createTestStageEngine();
    reachWave1Engage(engine);
    const internal = asBattleEngineInternals(engine);

    const deployTargets = expectedDeployPositions(internal.enemies);
    const deployXs = [...deployTargets.values()].sort((a, b) => a - b);
    expect(deployXs.length).toBe(3);
    for (let i = 1; i < deployXs.length; i++) {
      expect(deployXs[i]! - deployXs[i - 1]!).toBeGreaterThanOrEqual(SPRITE_GAP);
    }

    for (let t = 0; t < 600; t++) {
      engine.tick(TICK_DT);
    }

    for (const enemy of internal.enemies) {
      if (!enemy.isAlive) continue;
      expect(enemy.battleX).toBe(deployTargets.get(enemy.id));
    }
  });
});
