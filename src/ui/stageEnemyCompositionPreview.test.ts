import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import {
  formatEnemyGroupScaleSummary,
  resolveStageEnemyCompositionPreview,
} from './stageEnemyCompositionPreview.ts';
import type { StageDef } from '../battle/types.ts';

function makeStage(overrides: Partial<StageDef> = {}): StageDef {
  return {
    id: 'test_stage',
    displayName: 'Test',
    waves: [{ enemies: [{ templateId: 'legacy_a', spawnX: 100 }] }],
    ...overrides,
  };
}

describe('resolveStageEnemyCompositionPreview', () => {
  it('summarizes enemyGroups with recommendedLevel and total count', () => {
    const preview = resolveStageEnemyCompositionPreview(
      makeStage({
        recommendedLevel: 12,
        enemyGroups: [
          { classId: 'df_paladin', count: 2 },
          { classId: 'at_hunter', count: 1, atkScale: 1.5 },
        ],
        waves: [{ enemies: [] }],
      }),
    );

    expect(preview).toMatchObject({
      recommendedLevel: 12,
      usesEnemyGroups: true,
      usesWaveEnemyGroups: false,
      totalEnemyCount: 3,
      showLargePartyWarning: false,
      legacyWaveLines: [],
    });
    expect(preview.enemyGroupLines).toHaveLength(2);
    expect(preview.enemyGroupLines[1]?.atkScale).toBe(1.5);
    expect(preview.enemyGroupLines[0]?.waveIndex).toBeNull();
  });

  it('flags five or more enemies', () => {
    const preview = resolveStageEnemyCompositionPreview(
      makeStage({
        recommendedLevel: 10,
        enemyGroups: [{ classId: 'df_paladin', count: 5 }],
        waves: [{ enemies: [] }],
      }),
    );

    expect(preview.totalEnemyCount).toBe(5);
    expect(preview.showLargePartyWarning).toBe(true);
  });

  it('lists legacy templateIds per wave when enemyGroups is absent', () => {
    const preview = resolveStageEnemyCompositionPreview(
      makeStage({
        waves: [
          { enemies: [{ templateId: 'legacy_a', spawnX: 80 }] },
          {
            enemies: [
              { templateId: 'legacy_b', spawnX: 120 },
              { templateId: 'legacy_c', spawnX: 160 },
            ],
          },
        ],
      }),
    );

    expect(preview.usesEnemyGroups).toBe(false);
    expect(preview.totalEnemyCount).toBe(3);
    expect(preview.legacyWaveLines).toEqual([
      { waveIndex: 0, templateIds: ['legacy_a'] },
      { waveIndex: 1, templateIds: ['legacy_b', 'legacy_c'] },
    ]);
  });

  it('filters legacy templateIds to the selected wave', () => {
    const preview = resolveStageEnemyCompositionPreview(
      makeStage({
        waves: [
          { enemies: [{ templateId: 'legacy_a', spawnX: 80 }] },
          { enemies: [{ templateId: 'legacy_b', spawnX: 120 }] },
        ],
      }),
      1,
    );

    expect(preview.legacyWaveLines).toEqual([
      { waveIndex: 1, templateIds: ['legacy_b'] },
    ]);
    expect(preview.totalEnemyCount).toBe(1);
  });

  it('marks legacy stages without enemyGroups', () => {
    const preview = resolveStageEnemyCompositionPreview(
      makeStage({
        waves: [{ enemies: [{ templateId: 'legacy_a', spawnX: 100 }] }],
      }),
    );

    expect(preview.usesEnemyGroups).toBe(false);
    expect(preview.recommendedLevel).toBeNull();
    expect(preview.enemyGroupLines).toEqual([]);
  });

  it('resolves eg_smoke pilot stage from loaded game data', () => {
    const stage = loadGameData().stages.find((entry) => entry.id === 'eg_smoke');
    expect(stage).toBeDefined();

    const preview = resolveStageEnemyCompositionPreview(stage!);

    expect(preview).toMatchObject({
      recommendedLevel: 10,
      usesEnemyGroups: true,
      usesWaveEnemyGroups: false,
      totalEnemyCount: 2,
      showLargePartyWarning: false,
      legacyWaveLines: [],
    });
    expect(preview.enemyGroupLines.map((line) => line.classId).sort()).toEqual([
      'at_hunter',
      'df_guardian',
    ]);
  });

  it('summarizes waves[].enemyGroups per wave for R10-style stages', () => {
    const preview = resolveStageEnemyCompositionPreview(
      makeStage({
        recommendedLevel: 10,
        waves: [
          {
            enemies: [],
            enemyGroups: [
              { classId: 'at_swordsman', count: 2 },
              { classId: 'df_guardian', count: 1 },
            ],
          },
          {
            enemies: [],
            enemyGroups: [{ classId: 'at_sorcerer', count: 2 }],
          },
        ],
      }),
    );

    expect(preview).toMatchObject({
      recommendedLevel: 10,
      usesEnemyGroups: true,
      usesWaveEnemyGroups: true,
      totalEnemyCount: 5,
      showLargePartyWarning: true,
      legacyWaveLines: [],
    });
    expect(preview.enemyGroupLines.map((line) => line.waveIndex)).toEqual([0, 0, 1]);
  });

  it('filters waves[].enemyGroups to the selected wave', () => {
    const preview = resolveStageEnemyCompositionPreview(
      makeStage({
        recommendedLevel: 10,
        waves: [
          {
            enemies: [],
            enemyGroups: [{ classId: 'at_swordsman', count: 2 }],
          },
          {
            enemies: [],
            enemyGroups: [{ classId: 'at_sorcerer', count: 3 }],
          },
        ],
      }),
      1,
    );

    expect(preview.totalEnemyCount).toBe(3);
    expect(preview.enemyGroupLines).toEqual([
      expect.objectContaining({
        classId: 'at_sorcerer',
        count: 3,
        waveIndex: 1,
      }),
    ]);
  });

  it('resolves r10_prototype stage from loaded game data', () => {
    const stage = loadGameData().stages.find((entry) => entry.id === 'r10_prototype');
    expect(stage).toBeDefined();

    const preview = resolveStageEnemyCompositionPreview(stage!);
    expect(preview).toMatchObject({
      recommendedLevel: 10,
      usesEnemyGroups: true,
      usesWaveEnemyGroups: true,
      totalEnemyCount: 6,
      showLargePartyWarning: true,
      legacyWaveLines: [],
    });
    expect(preview.enemyGroupLines.map((line) => line.waveIndex)).toEqual([0, 0, 1, 1]);
  });

  it('resolves ranged_test stage from loaded game data', () => {
    const stage = loadGameData().stages.find((entry) => entry.id === 'ranged_test');
    expect(stage).toBeDefined();

    const preview = resolveStageEnemyCompositionPreview(stage!);

    expect(preview).toMatchObject({
      recommendedLevel: 10,
      usesEnemyGroups: true,
      usesWaveEnemyGroups: false,
      totalEnemyCount: 3,
      showLargePartyWarning: false,
      legacyWaveLines: [],
    });
    expect(preview.enemyGroupLines).toEqual([
      expect.objectContaining({ classId: 'df_guardian', count: 1, waveIndex: null }),
      expect.objectContaining({ classId: 'at_hunter', count: 2, waveIndex: null }),
    ]);
  });
});

describe('formatEnemyGroupScaleSummary', () => {
  it('omits default scales and lists non-default values', () => {
    const summary = formatEnemyGroupScaleSummary({
      classId: 'df_paladin',
      count: 1,
      hpScale: 1,
      atkScale: 1.2,
      defScale: 1,
      resScale: 0.8,
    });

    expect(summary).toBe(' (atk×1.2 res×0.8)');
  });
});
