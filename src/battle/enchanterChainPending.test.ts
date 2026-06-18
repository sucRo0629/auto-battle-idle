import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import type { BattleEvent } from './events.ts';
import { TICK_DT } from './test/battleFieldSpec.harness.ts';

type EngineWithPending = BattleEngine & {
  pendingHitQueue: Array<{ hitIndex?: number; applyAtBattleSec: number }>;
};

function createEnchanterTestEngine(): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = 'test';
  save.party[0] = createMemberFromClass('at_enchanter', gameData);
  save.party[1] = null;
  save.party[2] = null;
  save.party[3] = null;
  return new BattleEngine(
    gameData,
    loadLevelCurves(levelCurvesJson),
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
}

describe('enchanter staged chain pending hits', () => {
  it('applies all chain hops on test stage', () => {
    const engine = createEnchanterTestEngine();
    engine.startBattle();

    const chainDamageHits: number[] = [];
    engine.onEvent((event: BattleEvent) => {
      if (event.type === 'skill' && event.effect === 'damage') {
        if (event.hitIndex !== undefined) {
          chainDamageHits.push(event.hitIndex);
        }
      }
    });

    const eng = engine as EngineWithPending;
    let maxPending = 0;

    for (let t = 0; t < 6000; t++) {
      engine.tick(TICK_DT);
      maxPending = Math.max(maxPending, eng.pendingHitQueue?.length ?? 0);
      if (chainDamageHits.filter((h) => h === 2).length > 0) break;
    }

    expect(chainDamageHits.sort()).toEqual([0, 1, 2]);
    expect(maxPending).toBeGreaterThanOrEqual(2);
    expect(eng.pendingHitQueue?.length ?? 0).toBe(0);
  });
});
