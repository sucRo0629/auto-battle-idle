import { describe, expect, it, beforeEach } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import {
  createEnemiesForStage,
  resetEntityIdCounter,
} from './entities.ts';
import { expandEnemyGroups } from './enemyGroupSpawn.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);
const buildFlavor = process.env.BUILD_FLAVOR ?? 'full';

describe(`initial battle spawn smoke (BUILD_FLAVOR=${buildFlavor})`, () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  if (buildFlavor === 'demo') {
    it('spawns demo_ch1_01 enemies from default save initial stage', () => {
      const gameData = loadGameData();
      const save = createDefaultSave(gameData, 'demo');

      expect(gameData.stages[0]?.id).toBe('demo_ch1_01');
      expect(save.stageProgress.currentStageId).toBe('demo_ch1_01');

      const stage = gameData.stages.find((s) => s.id === 'demo_ch1_01');
      expect(stage).toMatchObject({
        id: 'demo_ch1_01',
        recommendedLevel: 1,
        waves: [{ enemies: [] }],
      });
      expect(stage!.enemyGroups).toEqual([
        expect.objectContaining({ classId: 'df_guardian', count: 1 }),
        expect.objectContaining({ classId: 'at_swordsman', count: 3 }),
      ]);
      expect(stage!.waves[0]?.enemies).toHaveLength(0);

      const enemies = createEnemiesForStage(
        gameData,
        save.stageProgress.currentStageId,
        0,
        levelCurves,
      );

      expect(enemies).toHaveLength(4);
      expect(enemies.every((e) => e.isEnemy)).toBe(true);
      expect(enemies.filter((e) => e.classId === 'df_guardian')).toHaveLength(1);
      expect(enemies.filter((e) => e.classId === 'at_swordsman')).toHaveLength(3);

      const specs = expandEnemyGroups(stage!);
      expect(specs).toHaveLength(4);
      expect(specs.every((s) => s.level === 1)).toBe(true);

      const rushStage = gameData.stages.find((s) => s.id === 'demo_ch1_03');
      const rushEnemies = createEnemiesForStage(
        gameData,
        rushStage!.id,
        0,
        levelCurves,
      );
      expect(rushEnemies).toHaveLength(7);
      expect(expandEnemyGroups(rushStage!).every((s) => s.level >= 1)).toBe(
        true,
      );
    });
  } else {
    it('still spawns eg_smoke via enemyGroups from full game data', () => {
      const gameData = loadGameData();

      expect(gameData.stages[0]?.id).toBe('test');
      expect(gameData.stages.some((s) => s.id.startsWith('demo_ch1_'))).toBe(
        false,
      );

      const enemies = createEnemiesForStage(
        gameData,
        'eg_smoke',
        0,
        levelCurves,
      );

      expect(enemies).toHaveLength(2);
      expect(enemies.every((e) => e.isEnemy)).toBe(true);
    });
  }
});
