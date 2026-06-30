import { describe, expect, it } from 'vitest';
import {
  formatSignedUiDistanceValue,
  formatUiDistanceValue,
} from './formatUiDistance.ts';

describe('formatUiDistanceValue', () => {
  it('converts internal px to unitless display value', () => {
    expect(formatUiDistanceValue(50)).toBe('5');
    expect(formatUiDistanceValue(128)).toBe('12.8');
    expect(formatUiDistanceValue(8)).toBe('0.8');
    expect(formatUiDistanceValue(0)).toBe('0');
  });

  it('formats signed deltas', () => {
    expect(formatSignedUiDistanceValue(30)).toBe('+3');
    expect(formatSignedUiDistanceValue(-30)).toBe('-3');
    expect(formatSignedUiDistanceValue(0)).toBe('0');
  });
});
