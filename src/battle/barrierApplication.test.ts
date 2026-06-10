import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { createAlliesFromPartyState, createEnemiesForStage } from './entities.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';

describe('barrier application', () => {
  it('guardian can gain barrier during battle', () => {
    const gameData = loadGameData();
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const save = createDefaultSave(gameData, 'demo');
    const allies = createAlliesFromPartyState(
      gameData,
      save.party,
      levelCurves,
    );
    const guardian = allies[0];
    expect(guardian?.classId).toBe('df_guardian');

    const enemies = createEnemiesForStage(gameData, '1', 0);
    const barrierCd = guardian!.cooldowns.find(
      (cd) => cd.skillId === 'df_guardian_active_1',
    );
    expect(barrierCd).toBeDefined();
    barrierCd!.remaining = 0;

    const runner = new SkillSequenceRunner();
    let barrierEvent = false;
    const executor = new SkillExecutor(
      gameData,
      (event) => {
        if (event.type === 'skill' && event.effect === 'barrier') {
          barrierEvent = true;
        }
      },
      {
        getBattleTimeSec: () => 0,
        enqueuePendingHits: () => {},
        getAllCombatants: () => [...allies, ...enemies],
        getSequenceRunner: () => runner,
      },
    );

    executor.tryExecute(guardian!, barrierCd!, allies, enemies);

    expect(barrierEvent).toBe(true);
    expect(guardian!.barrierHp).toBeGreaterThan(0);
  });
});
