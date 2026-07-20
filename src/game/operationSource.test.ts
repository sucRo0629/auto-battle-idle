import { describe, expect, it } from 'vitest';
import {
  cloneOperationSource,
  isOperationSource,
  operationSourcesEqual,
  type OperationSource,
} from './operationSource.ts';

describe('operationSource (R12m 1C unit14B)', () => {
  it('fixedStage same stageId are equal', () => {
    const a: OperationSource = { kind: 'fixedStage', stageId: '1' };
    const b: OperationSource = { kind: 'fixedStage', stageId: '1' };
    expect(operationSourcesEqual(a, b)).toBe(true);
  });

  it('fixedStage different stageId are not equal', () => {
    const a: OperationSource = { kind: 'fixedStage', stageId: '1' };
    const b: OperationSource = { kind: 'fixedStage', stageId: '2' };
    expect(operationSourcesEqual(a, b)).toBe(false);
  });

  it('fixedStage and problemSeries kind mismatch', () => {
    const fixed: OperationSource = { kind: 'fixedStage', stageId: '1' };
    const series: OperationSource = { kind: 'problemSeries' };
    expect(operationSourcesEqual(fixed, series)).toBe(false);
    expect(operationSourcesEqual(series, fixed)).toBe(false);
  });

  it('problemSeries sources are equal', () => {
    const a: OperationSource = { kind: 'problemSeries' };
    const b: OperationSource = { kind: 'problemSeries' };
    expect(operationSourcesEqual(a, b)).toBe(true);
  });

  it('clone does not share references with source object', () => {
    const source: OperationSource = { kind: 'fixedStage', stageId: '1' };
    const clone = cloneOperationSource(source);
    expect(clone).toEqual(source);
    expect(clone).not.toBe(source);
    if (clone.kind === 'fixedStage' && source.kind === 'fixedStage') {
      expect(clone.stageId).toBe(source.stageId);
    }
  });

  it('rejects malformed source values', () => {
    expect(isOperationSource(null)).toBe(false);
    expect(isOperationSource(undefined)).toBe(false);
    expect(isOperationSource('1')).toBe(false);
    expect(isOperationSource({ kind: 'unknown' })).toBe(false);
    expect(isOperationSource({ kind: 'fixedStage' })).toBe(false);
    expect(isOperationSource({ kind: 'fixedStage', stageId: 1 })).toBe(false);
    expect(
      isOperationSource({ kind: 'fixedStage', stageId: '1', seed: 'x' }),
    ).toBe(false);
    expect(
      isOperationSource({ kind: 'problemSeries', seed: 'x' }),
    ).toBe(false);
    expect(
      isOperationSource({ kind: 'problemSeries', stageId: '1' }),
    ).toBe(false);
    expect(isOperationSource({ kind: 'fixedStage', stageId: '' })).toBe(true);
    expect(isOperationSource({ kind: 'problemSeries' })).toBe(true);
    expect(isOperationSource({ kind: 'fixedStage', stageId: '1' })).toBe(true);
  });
});
