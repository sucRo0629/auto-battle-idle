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
});
