import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import {
  reachWave1Engage,
  SCREEN_MIN_X,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';

function createDefenderMeleeFrontRowEngine(
  defenderClassId: string,
  attackerClassId: string,
): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = '1';
  save.party[0] = createMemberFromClass(defenderClassId, gameData);
  save.party[1] = createMemberFromClass(attackerClassId, gameData);
  save.party[2] = null;
  save.party[3] = null;
  const engine = new BattleEngine(
    gameData,
    loadLevelCurves(levelCurvesJson),
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
  engine.startBattle();
  return engine;
}

describe('paladin approach (2-unit front row)', () => {
  it('does not slide left off screen with swordsman', () => {
    const engine = createDefenderMeleeFrontRowEngine('df_paladin', 'at_swordsman');
    reachWave1Engage(engine);

    let minAllyX = Infinity;
    for (let t = 0; t < 900; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;
      for (const ally of snap.allies.filter((a) => a.hp > 0)) {
        minAllyX = Math.min(minAllyX, ally.battleX);
      }
    }

    expect(minAllyX).toBeGreaterThan(SCREEN_MIN_X);
  });
});
