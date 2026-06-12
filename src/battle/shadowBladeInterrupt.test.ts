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

describe('shadow blade (影の刃) skill motion', () => {
  it('does not let the assassin basic or 引き裂き fire during the sequence', () => {
    const gameData = structuredClone(loadGameData());
    const save = createDefaultSave(gameData, 'demo');
    save.stageProgress.currentStageId = 'test';
    save.party[0] = createMemberFromClass('at_assassin', gameData);
    save.party[1] = null;
    save.party[2] = null;
    save.party[3] = null;
    save.party[0]!.progress.level = 10;

    const engine = new BattleEngine(
      gameData,
      loadLevelCurves(levelCurvesJson),
      () => save.party,
      () => save.stageProgress.currentStageId,
    );
    engine.startBattle();
    reachWave1Engage(engine);
    const internal = asBattleEngineInternals(engine);

    for (let t = 0; t < 600; t++) {
      engine.tick(TICK_DT);
    }

    const assassin = internal.players.find((p) => p.name === '双刃士')!;
    const shadowCd = assassin.cooldowns.find(
      (cd) => cd.skillId === 'at_assassin_active_2',
    )!;
    shadowCd.remaining = 0;

    const ripCd = assassin.cooldowns.find(
      (cd) => cd.skillId === 'at_assassin_active_1',
    )!;
    ripCd.remaining = 0;

    const intruders: string[] = [];
    let shadowStarted = false;

    const unsub = engine.onEvent((event) => {
      if (event.type !== 'skill' || event.actorId !== assassin.id) return;
      if (event.skillId === 'at_assassin_active_2') {
        shadowStarted = true;
        return;
      }
      if (!shadowStarted) return;
      if (event.effect === 'dot') return;

      const runner = internal.skillSequenceRunner;
      const busyDuringShadow =
        runner.isActorInSkillMotion(assassin.id) ||
        runner.isActorUseLocked(assassin.id);
      if (!busyDuringShadow) return;

      if (
        event.slotKind === 'basic' ||
        event.skillId === 'at_assassin_active_1'
      ) {
        intruders.push(
          event.slotKind === 'basic' ? 'basic' : (event.skillName ?? 'rip'),
        );
      }
    });

    for (let t = 0; t < 1200; t++) {
      engine.tick(TICK_DT);
      if (
        shadowStarted &&
        !internal.skillSequenceRunner.isActorInSkillMotion(assassin.id) &&
        !internal.skillSequenceRunner.isActorUseLocked(assassin.id)
      ) {
        break;
      }
    }

    unsub();
    expect(shadowStarted).toBe(true);
    expect(intruders).toEqual([]);
  });
});
