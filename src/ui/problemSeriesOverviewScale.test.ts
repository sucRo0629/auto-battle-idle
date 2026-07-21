import { describe, expect, it } from 'vitest';
import { createProblemSeriesOverviewScale } from '../battle/problemSeries/overviewScale.ts';
import { formatEnemyGroupScaleSummary } from './stageEnemyCompositionPreview.ts';

describe('R12m createProblemSeriesOverviewScale → formatEnemyGroupScaleSummary', () => {
  it('standard scale from createProblemSeriesOverviewScale yields empty summary', () => {
    const scale = createProblemSeriesOverviewScale({});

    expect(scale).toEqual({
      hpScale: 1,
      atkScale: 1,
      defScale: 1,
      resScale: 1,
      hasDifference: false,
    });
    expect(formatEnemyGroupScaleSummary(scale)).toBe('');
  });

  it('non-standard hp/atk from createProblemSeriesOverviewScale yields scale summary', () => {
    const scale = createProblemSeriesOverviewScale({
      hpScale: 1.5,
      atkScale: 2,
    });

    expect(scale).toEqual({
      hpScale: 1.5,
      atkScale: 2,
      defScale: 1,
      resScale: 1,
      hasDifference: true,
    });
    expect(formatEnemyGroupScaleSummary(scale)).toBe(' (hp×1.5 atk×2)');
  });
});
