import { describe, expect, it } from 'vitest';
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
      totalEnemyCount: 3,
      showLargePartyWarning: false,
      legacyWaveLines: [],
    });
    expect(preview.enemyGroupLines).toHaveLength(2);
    expect(preview.enemyGroupLines[1]?.atkScale).toBe(1.5);
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
});

describe('formatEnemyGroupScaleSummary', () => {
  it('omits default scales and lists non-default values', () => {
    const summary = formatEnemyGroupScaleSummary({
      classId: 'df_paladin',
      count: 1,
      hpScale: 1,
      atkScale: 1.2,
      defScale: 1,
      regScale: 0.8,
    });

    expect(summary).toBe(' (atk×1.2 reg×0.8)');
  });
});
