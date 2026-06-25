import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { BattleEngine } from './BattleEngine.ts';
import { loadGameData } from './data/loadGameData.ts';
import { PARTY_SLOT_COUNT } from './types.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';

const TICK = 1 / 60;

describe('assassin multi-hit basic attack', () => {
  it('loads spread config and applies multiple basic damage hits per attack', () => {
    const gameData = loadGameData();
    const skill = gameData.skillRegistry.actives.at_assassin_basic_attack;
    const expectedHits = skill?.effect[0]?.hitCount ?? 1;
    expect(expectedHits).toBeGreaterThanOrEqual(2);

    const levelCurves = loadLevelCurves(levelCurvesJson);
    const save = createDefaultSave(gameData, 'demo');
    save.party = Array.from({ length: PARTY_SLOT_COUNT }, (_, index) =>
      index === 0 ? createMemberFromClass('at_assassin', gameData) : null,
    );

    const damages: { hitIndex?: number; amount?: number; t: number }[] = [];
    let t = 0;
    let allyId = '';
    const engine = new BattleEngine(
      gameData,
      levelCurves,
      () => save.party,
      () => save.stageProgress.currentStageId,
    );
    engine.onEvent((event) => {
      if (!allyId) return;
      if (
        event.type === 'skill' &&
        event.effect === 'damage' &&
        event.slotKind === 'basic' &&
        event.actorId === allyId
      ) {
        damages.push({
          t,
          hitIndex: event.hitIndex,
          amount: event.amount,
        });
      }
    });
    engine.startBattle();

    for (let i = 0; i < 1800; i++) {
      engine.tick(TICK);
      t += TICK;
      if (!allyId) {
        allyId =
          engine
            .getSnapshot()
            .allies.find((unit) => unit.partySlotIndex === 0)?.id ?? '';
      }
      if (damages.length >= expectedHits) break;
    }
    expect(allyId).not.toBe('');

    expect(damages.length).toBeGreaterThanOrEqual(expectedHits);
    for (let i = 0; i < Math.min(expectedHits, 2); i += 1) {
      expect(damages[i]?.hitIndex).toBe(i);
    }
    if (damages.length >= 2) {
      expect(damages[1]!.t - damages[0]!.t).toBeGreaterThanOrEqual(0.08);
    }
  });
});
