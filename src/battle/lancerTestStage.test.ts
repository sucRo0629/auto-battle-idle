import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import {
  asBattleEngineInternals,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';

function createLancerTestStageEngine(): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = 'test';
  save.party[0] = createMemberFromClass('at_lancer', gameData);
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

describe('lancer on test stage', () => {
  it('engages and damages stationary dummies with self-origin pierce', () => {
    const engine = createLancerTestStageEngine();
    engine.startBattle();
    const internal = asBattleEngineInternals(engine);
    expect(engine.getSnapshot().engaged).toBe(true);

    const lancer = internal.players.find((p) => p.classId === 'at_lancer');
    expect(lancer).toBeDefined();
    expect(lancer!.spriteKey).toBe('placeholder_at_melee');

    let dealtDamage = false;
    engine.onEvent((event) => {
      if (
        event.type === 'skill' &&
        event.effect === 'damage' &&
        event.amount !== undefined &&
        event.amount > 0
      ) {
        dealtDamage = true;
      }
    });

    for (let t = 0; t < 3600; t++) {
      engine.tick(TICK_DT);
      if (dealtDamage) break;
    }

    const finalSnap = engine.getSnapshot();
    const finalLancer = finalSnap.allies.find((a) => a.partySlotIndex === 0);
    expect(finalLancer).toBeDefined();
    expect(finalLancer!.hp).toBeGreaterThan(0);
    expect(Number.isFinite(finalLancer!.battleX)).toBe(true);
    expect(dealtDamage).toBe(true);
  });
});
