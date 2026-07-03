import { describe, expect, it } from 'vitest';
import { loadGameData } from './loadGameData.ts';

const DEMO_STAGE_IDS = [
  'demo_ch1_01',
  'demo_ch1_02',
  'demo_ch1_03',
  'demo_ch1_04',
  'demo_ch1_05',
  'demo_ch1_06',
  'demo_ch1_07',
] as const;

const buildFlavor = process.env.BUILD_FLAVOR ?? 'full';

describe(`loadGameData runtime smoke (BUILD_FLAVOR=${buildFlavor})`, () => {
  if (buildFlavor === 'demo') {
    it('loads stages-demo.json via @game-data/stages alias', () => {
      const stageIds = loadGameData().stages.map((stage) => stage.id);

      expect(stageIds).toEqual([...DEMO_STAGE_IDS]);
      expect(stageIds).not.toContain('eg_smoke');
    });
  } else {
    it('loads stages.json via @game-data/stages alias', () => {
      const stageIds = loadGameData().stages.map((stage) => stage.id);

      expect(stageIds).toContain('eg_smoke');
      expect(stageIds.some((id) => id.startsWith('demo_ch1_'))).toBe(false);
    });
  }
});
