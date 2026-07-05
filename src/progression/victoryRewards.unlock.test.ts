import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import stagesDemoJson from '../../data/stages-demo.json';
import levelCurvesJson from '../../data/levelCurves.json';
import type { GameData, StageDef } from '../battle/types.ts';
import { loadLevelCurves } from './levelGrowth.ts';
import {
  applyVictoryRewards,
  createDefaultSave,
  mergeUnlockedClassIds,
} from './victoryRewards.ts';

const M1_INITIAL_UNLOCK = [
  'df_guardian',
  'df_paladin',
  'at_swordsman',
  'at_assassin',
  'at_ranger',
  'at_sorcerer',
  'sp_cleric',
  'sp_wardweaver',
] as const;

const levelCurves = loadLevelCurves(levelCurvesJson);

function createDemoGameData(): GameData {
  const gameData = structuredClone(loadGameData());
  gameData.stages = stagesDemoJson as StageDef[];
  return gameData;
}

describe('demo class unlock rewards', () => {
  it('new demo save does not include at_ballista in unlockedClassIds', () => {
    const gameData = createDemoGameData();
    const save = createDefaultSave(gameData, 'demo');

    expect(save.unlockedClassIds).toHaveLength(M1_INITIAL_UNLOCK.length);
    expect(save.unlockedClassIds.sort()).toEqual([...M1_INITIAL_UNLOCK].sort());
    expect(save.unlockedClassIds).not.toContain('at_ballista');
  });

  it('clears demo_ch1_07 and unlocks at_ballista', () => {
    const gameData = createDemoGameData();
    const save = createDefaultSave(gameData, 'demo');
    save.stageProgress.currentStageId = 'demo_ch1_07';

    const result = applyVictoryRewards(save, gameData, levelCurves, [0, 1, 2, 3]);

    expect(result.newlyUnlockedClassIds).toEqual(['at_ballista']);
    expect(save.unlockedClassIds).toContain('at_ballista');
    expect(save.unlockedClassIds).toHaveLength(M1_INITIAL_UNLOCK.length + 1);
  });

  it('merge is idempotent when clearing demo_ch1_07 twice', () => {
    const gameData = createDemoGameData();
    const save = createDefaultSave(gameData, 'demo');
    save.stageProgress.currentStageId = 'demo_ch1_07';
    const survivors = [0, 1, 2, 3];

    applyVictoryRewards(save, gameData, levelCurves, survivors);
    const afterFirst = [...save.unlockedClassIds];
    save.stageProgress.currentStageId = 'demo_ch1_07';

    const second = applyVictoryRewards(save, gameData, levelCurves, survivors);

    expect(second.newlyUnlockedClassIds).toEqual([]);
    expect(save.unlockedClassIds).toEqual(afterFirst);
    expect(save.unlockedClassIds.filter((id) => id === 'at_ballista')).toHaveLength(
      1,
    );
  });

  it('preserves at_ballista when already unlocked before clear reward', () => {
    const gameData = createDemoGameData();
    const save = createDefaultSave(gameData, 'demo');
    save.unlockedClassIds = mergeUnlockedClassIds(save.unlockedClassIds, [
      'at_ballista',
    ]);
    save.stageProgress.currentStageId = 'demo_ch1_07';

    const result = applyVictoryRewards(save, gameData, levelCurves, [0, 1, 2, 3]);

    expect(result.newlyUnlockedClassIds).toEqual([]);
    expect(save.unlockedClassIds).toContain('at_ballista');
    expect(save.unlockedClassIds.filter((id) => id === 'at_ballista')).toHaveLength(
      1,
    );
  });

  it('mergeUnlockedClassIds handles undefined prior list', () => {
    expect(mergeUnlockedClassIds(undefined, ['at_ballista'])).toEqual([
      'at_ballista',
    ]);
  });
});
