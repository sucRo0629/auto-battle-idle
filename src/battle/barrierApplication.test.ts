import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createAlliesFromPartyState } from './entities.ts';
import { createEnemiesForStage } from './entities.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';

describe('barrier application', () => {
  it('wardweaver can grant barrier during battle', () => {
    const gameData = loadGameData();
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const allies = createAlliesFromPartyState(
      gameData,
      [
        {
          classId: 'sp_wardweaver',
          progress: { level: 1, exp: 0 },
          build: {
            learnedPassiveIds: [],
            learnedActiveIds: ['sp_wardweaver_active_1'],
            equippedActiveSlots: ['sp_wardweaver_active_1'],
          },
        },
      ],
      levelCurves,
    );
    const wardweaver = allies[0];
    expect(wardweaver?.classId).toBe('sp_wardweaver');

    const enemies = createEnemiesForStage(gameData, '1', 0);
    const barrierCd = wardweaver!.cooldowns.find(
      (cd) => cd.skillId === 'sp_wardweaver_active_1',
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

    executor.tryExecute(wardweaver!, barrierCd!, allies, enemies);

    expect(barrierEvent).toBe(true);
    expect(wardweaver!.barrierHp).toBeGreaterThan(0);
  });

  it('max-merges barrier on repeated grants without barrierStack', () => {
    const gameData = loadGameData();
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const allies = createAlliesFromPartyState(
      gameData,
      [
        {
          classId: 'sp_wardweaver',
          progress: { level: 1, exp: 0 },
          build: {
            learnedPassiveIds: [],
            learnedActiveIds: ['sp_wardweaver_active_1'],
            equippedActiveSlots: ['sp_wardweaver_active_1'],
          },
        },
      ],
      levelCurves,
    );
    const wardweaver = allies[0]!;
    const enemies = createEnemiesForStage(gameData, '1', 0);
    const barrierCd = wardweaver.cooldowns.find(
      (cd) => cd.skillId === 'sp_wardweaver_active_1',
    )!;
    barrierCd.remaining = 0;

    const runner = new SkillSequenceRunner();
    const executor = new SkillExecutor(
      gameData,
      () => {},
      {
        getBattleTimeSec: () => 0,
        enqueuePendingHits: () => {},
        getAllCombatants: () => [...allies, ...enemies],
        getSequenceRunner: () => runner,
      },
    );

    executor.tryExecute(wardweaver, barrierCd, allies, enemies);
    const firstBarrier = wardweaver.barrierHp;
    expect(firstBarrier).toBeGreaterThan(0);

    barrierCd.remaining = 0;
    runner.tickUseLocks(0.31);
    executor.tryExecute(wardweaver, barrierCd, allies, enemies);
    expect(wardweaver.barrierHp).toBe(firstBarrier);
  });
});
