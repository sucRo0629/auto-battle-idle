import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import type { BattleEvent } from './events.ts';
import { TICK_DT } from './test/battleFieldSpec.harness.ts';

function createSigilistTestEngine(): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = 'test';
  const member = createMemberFromClass('at_sigilist', gameData);
  member.build.learnedActiveIds = [
    'at_sigilist_active_1',
    'at_sigilist_active_2',
  ];
  save.party[0] = member;
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

describe('sigilist conditionalEffect on test stage', () => {
  it('fires active_1 damage on crowded test stage when actives are learned', () => {
    const engine = createSigilistTestEngine();
    engine.startBattle();

    let active1DamageEvents = 0;
    engine.onEvent((event: BattleEvent) => {
      if (
        event.type === 'skill' &&
        event.skillId === 'at_sigilist_active_1' &&
        event.effect === 'damage'
      ) {
        active1DamageEvents += 1;
      }
    });

    for (let t = 0; t < 12000; t++) {
      engine.tick(TICK_DT);
      if (active1DamageEvents > 0) break;
    }

    expect(active1DamageEvents).toBeGreaterThan(0);
  });
});
