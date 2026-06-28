import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../battle/BattleEngine.ts';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import {
  buildPartyHudEntries,
  buildPartyHudMetaBySlot,
} from './partyHudTypes.ts';

describe('buildPartyHudEntries unlocked active slot counts', () => {
  it('demo Lv1 party shows 2 unlocked recast slots per member', () => {
    const gameData = loadGameData();
    const levelCurves = loadLevelCurves(levelCurvesJson);
    const save = createDefaultSave(gameData, 'demo');
    const engine = new BattleEngine(
      gameData,
      levelCurves,
      () => save.party,
      () => save.stageProgress.currentStageId,
    );
    engine.startBattle();
    const entries = buildPartyHudEntries(
      engine.getSnapshot(),
      buildPartyHudMetaBySlot(save.party, gameData.classRegistry),
    );

    for (const entry of entries) {
      if (!entry) continue;
      expect(entry.unlockedActiveSlotCount).toBe(2);
    }
  });
});
