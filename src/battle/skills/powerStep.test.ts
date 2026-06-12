import { describe, expect, it } from 'vitest';
import { applyPowerStep } from './powerStep.ts';

describe('applyPowerStep', () => {
  it('multiplies per hit index', () => {
    expect(applyPowerStep(1, 2, { stepMultiplier: 0.5, stepMode: 'multiply' })).toBe(
      0.25,
    );
  });
});
