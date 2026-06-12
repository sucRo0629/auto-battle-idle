import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createAlliesFromPartyState } from './entities.ts';
import { createEnemiesForStage } from './entities.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';

describe('barrier application', () => {
  it('abjurer can grant barrier during battle', () => {
    const gameData = loadGameData();
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const allies = createAlliesFromPartyState(
      gameData,
      [
        {
          classId: 'sp_abjurer',
          progress: { level: 1, exp: 0 },
          build: {
            learnedPassiveIds: [],
            learnedActiveIds: ['sp_abjurer_active_1'],
            equippedActiveSlots: ['sp_abjurer_active_1'],
          },
        },
      ],
      levelCurves,
    );
    const abjurer = allies[0];
    expect(abjurer?.classId).toBe('sp_abjurer');

    const enemies = createEnemiesForStage(gameData, '1', 0);
    const barrierCd = abjurer!.cooldowns.find(
      (cd) => cd.skillId === 'sp_abjurer_active_1',
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

    executor.tryExecute(abjurer!, barrierCd!, allies, enemies);

    expect(barrierEvent).toBe(true);
    expect(abjurer!.barrierHp).toBeGreaterThan(0);
  });

  it('stacks barrier on repeated grants', () => {
    const gameData = loadGameData();
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const allies = createAlliesFromPartyState(
      gameData,
      [
        {
          classId: 'sp_abjurer',
          progress: { level: 1, exp: 0 },
          build: {
            learnedPassiveIds: [],
            learnedActiveIds: ['sp_abjurer_active_1'],
            equippedActiveSlots: ['sp_abjurer_active_1'],
          },
        },
      ],
      levelCurves,
    );
    const abjurer = allies[0]!;
    const enemies = createEnemiesForStage(gameData, '1', 0);
    const barrierCd = abjurer.cooldowns.find(
      (cd) => cd.skillId === 'sp_abjurer_active_1',
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

    executor.tryExecute(abjurer, barrierCd, allies, enemies);
    const firstBarrier = abjurer.barrierHp;
    expect(firstBarrier).toBeGreaterThan(0);

    barrierCd.remaining = 0;
    runner.tickUseLocks(0.31);
    executor.tryExecute(abjurer, barrierCd, allies, enemies);
    expect(abjurer.barrierHp).toBeGreaterThan(firstBarrier);
  });
});
