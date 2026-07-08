/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { SAVE_VERSION } from '../battle/types.ts';
import { SaveManager, SAVE_STORAGE_KEY } from './SaveManager.ts';

const baseSave = {
  version: SAVE_VERSION,
  stageProgress: {
    currentStageId: 'demo_ch1_01',
    totalClears: 0,
  },
  party: [
    {
      classId: 'df_guardian',
      progress: { level: 1, exp: 0 },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    },
    null,
    null,
    null,
  ],
  unlockedClassIds: ['df_guardian'],
};

describe('SaveManager clearedStageIds', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips clearedStageIds', () => {
    const manager = new SaveManager();
    manager.save({
      ...baseSave,
      stageProgress: {
        ...baseSave.stageProgress,
        clearedStageIds: ['demo_ch1_01', 'demo_ch1_02'],
      },
    });

    const loaded = manager.load(SAVE_STORAGE_KEY);
    expect(loaded?.stageProgress.clearedStageIds).toEqual([
      'demo_ch1_01',
      'demo_ch1_02',
    ]);
  });

  it('omits clearedStageIds when absent in save json', () => {
    const manager = new SaveManager();
    manager.save(baseSave);

    const loaded = manager.load(SAVE_STORAGE_KEY);
    expect(loaded?.stageProgress.clearedStageIds).toBeUndefined();
  });
});
