import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { resolveKnownStageId } from './stageProgression.ts';
import { createDefaultSave } from './victoryRewards.ts';

const buildFlavor = process.env.BUILD_FLAVOR ?? 'full';

describe(`demo stage id fallback (BUILD_FLAVOR=${buildFlavor})`, () => {
  if (buildFlavor === 'demo') {
    it('createDefaultSave uses the first demo stage (demo_ch1_01)', () => {
      const gameData = loadGameData();
      const save = createDefaultSave(gameData, 'demo');

      expect(save.stageProgress.currentStageId).toBe('demo_ch1_01');
      expect(gameData.stages[0]?.id).toBe('demo_ch1_01');
    });

    it('resolveKnownStageId falls back unknown full-stage ids to demo_ch1_01', () => {
      const stages = loadGameData().stages;

      expect(resolveKnownStageId(stages, 'test')).toBe('demo_ch1_01');
      expect(resolveKnownStageId(stages, 'eg_smoke')).toBe('demo_ch1_01');
    });

    it('resolveKnownStageId keeps known demo stage ids', () => {
      const stages = loadGameData().stages;

      expect(resolveKnownStageId(stages, 'demo_ch1_02')).toBe('demo_ch1_02');
    });
  } else {
    it('createDefaultSave uses the first full stage (test)', () => {
      const gameData = loadGameData();
      const save = createDefaultSave(gameData, 'demo');

      expect(save.stageProgress.currentStageId).toBe('test');
      expect(gameData.stages[0]?.id).toBe('test');
    });

    it('resolveKnownStageId falls back unknown stage ids to test', () => {
      const stages = loadGameData().stages;

      expect(resolveKnownStageId(stages, 'demo_ch1_01')).toBe('test');
      expect(resolveKnownStageId(stages, 'unknown_stage')).toBe('test');
    });

    it('resolveKnownStageId keeps known full stage ids', () => {
      const stages = loadGameData().stages;

      expect(resolveKnownStageId(stages, 'eg_smoke')).toBe('eg_smoke');
    });
  }
});
