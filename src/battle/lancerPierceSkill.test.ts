import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import {
  asBattleEngineInternals,
  reachWave1Engage,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';

function createGuardianLancerEngine(): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = '1';
  save.party[0] = createMemberFromClass('df_guardian', gameData);
  save.party[1] = createMemberFromClass('at_lancer', gameData);
  save.party[2] = null;
  save.party[3] = null;
  return new BattleEngine(
    gameData,
    loadLevelCurves(levelCurvesJson),
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
}

describe('lancer 貫突', () => {
  it('fires pierce skill after cooldown while engaged', () => {
    const engine = createGuardianLancerEngine();
    engine.startBattle();
    reachWave1Engage(engine);
    const internal = asBattleEngineInternals(engine);

    const enemyHpBefore = internal.enemies
      .filter((e) => e.isAlive)
      .reduce((sum, e) => sum + e.hp, 0);

    let dealtDamage = false;
    for (let t = 0; t < 1200; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;

      const lancer = internal.players.find((p) => p.classId === 'at_lancer');
      const pierceCd = lancer?.cooldowns.find(
        (cd) => cd.skillId === 'at_lancer_active_1',
      );
      if (pierceCd && pierceCd.remaining > 0 && pierceCd.remaining < 9) {
        dealtDamage = true;
        break;
      }

      const enemyHpNow = snap.enemies
        .filter((e) => e.hp > 0)
        .reduce((sum, e) => sum + e.hp, 0);
      if (enemyHpNow < enemyHpBefore) {
        dealtDamage = true;
        break;
      }
    }

    expect(dealtDamage).toBe(true);
  });
});
