import { describe, expect, it, vi } from 'vitest';
import type { ProblemSeriesOverviewNamedEnemyGroup } from '../battle/problemSeries/overviewViewModel.ts';
import { createProblemSeriesOverviewEnemyGroupDisplay } from './problemSeriesOverviewViewModel.ts';
import * as stageEnemyCompositionPreview from './stageEnemyCompositionPreview.ts';

const DISPLAY_OUTPUT_KEYS = [
  'classDisplayName',
  'classId',
  'combatModuleDisplayName',
  'count',
  'scaleSummary',
  'selectedCombatModuleId',
] as const;

const FORBIDDEN_OUTPUT_KEYS = [
  'hasDifference',
  'hpScale',
  'atkScale',
  'defScale',
  'resScale',
  'scale',
  'problemClass',
  'problemClassification',
  'expectedDefeat',
  'connection',
  'connectionTag',
  'recommendation',
  'recommendedJudgment',
] as const;

function createNamedGroup(
  scale: ProblemSeriesOverviewNamedEnemyGroup['scale'],
): ProblemSeriesOverviewNamedEnemyGroup {
  return {
    classId: 'df_guardian',
    classDisplayName: '鉄衛士',
    count: 2,
    selectedCombatModuleId: 'df_guardian_mod_nearest_strike',
    combatModuleDisplayName: '物理堅守',
    scale,
  };
}

function assertDisplayContract(
  group: ProblemSeriesOverviewNamedEnemyGroup,
  display: ReturnType<typeof createProblemSeriesOverviewEnemyGroupDisplay>,
  expectedScaleSummary: string,
): void {
  expect(display).toEqual({
    classId: 'df_guardian',
    classDisplayName: '鉄衛士',
    count: 2,
    selectedCombatModuleId: 'df_guardian_mod_nearest_strike',
    combatModuleDisplayName: '物理堅守',
    scaleSummary: expectedScaleSummary,
  });

  expect(Object.keys(display).sort()).toEqual([...DISPLAY_OUTPUT_KEYS]);
  expect(Object.keys(display)).toHaveLength(6);

  for (const key of FORBIDDEN_OUTPUT_KEYS) {
    expect(Object.prototype.hasOwnProperty.call(display, key)).toBe(false);
  }

  expect(display).not.toBe(group);
  expect(display).not.toBe(group.scale as unknown as typeof display);
}

describe('R12m createProblemSeriesOverviewEnemyGroupDisplay', () => {
  it('standard scale: keeps identity fields and yields empty scaleSummary via production formatter', () => {
    const group = createNamedGroup({
      hpScale: 1,
      atkScale: 1,
      defScale: 1,
      resScale: 1,
      hasDifference: false,
    });
    const groupBefore = structuredClone(group);
    const scaleBefore = structuredClone(group.scale);
    const scaleRef = group.scale;

    const formatSpy = vi.spyOn(
      stageEnemyCompositionPreview,
      'formatEnemyGroupScaleSummary',
    );

    const display = createProblemSeriesOverviewEnemyGroupDisplay(group);

    expect(formatSpy).toHaveBeenCalledTimes(1);
    expect(formatSpy).toHaveBeenCalledWith(group.scale);
    expect(formatSpy.mock.results[0]?.value).toBe('');

    assertDisplayContract(group, display, '');
    expect(group).toEqual(groupBefore);
    expect(group.scale).toBe(scaleRef);
    expect(group.scale).toEqual(scaleBefore);

    formatSpy.mockRestore();
  });

  it('non-standard scale: keeps identity fields and yields scaleSummary via production formatter', () => {
    const group = createNamedGroup({
      hpScale: 1.5,
      atkScale: 2,
      defScale: 1,
      resScale: 1,
      hasDifference: true,
    });
    const groupBefore = structuredClone(group);
    const scaleBefore = structuredClone(group.scale);
    const scaleRef = group.scale;

    const formatSpy = vi.spyOn(
      stageEnemyCompositionPreview,
      'formatEnemyGroupScaleSummary',
    );

    const display = createProblemSeriesOverviewEnemyGroupDisplay(group);

    expect(formatSpy).toHaveBeenCalledTimes(1);
    expect(formatSpy).toHaveBeenCalledWith(group.scale);
    expect(formatSpy.mock.results[0]?.value).toBe(' (hp×1.5 atk×2)');

    assertDisplayContract(group, display, ' (hp×1.5 atk×2)');
    expect(group).toEqual(groupBefore);
    expect(group.scale).toBe(scaleRef);
    expect(group.scale).toEqual(scaleBefore);
    expect(group.scale.hasDifference).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(display, 'hasDifference')).toBe(
      false,
    );

    formatSpy.mockRestore();
  });
});
