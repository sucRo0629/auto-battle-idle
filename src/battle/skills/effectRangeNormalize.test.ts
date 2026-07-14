import { describe, expect, it } from 'vitest';
import {
  effectRangeFromLegacyTargetShape,
  legacyTargetShapeFromEffectRange,
  normalizeSharedTargetingFields,
} from './effectRangeNormalize.ts';

describe('effectRangeNormalize', () => {
  it('round-trips pierce ↔ forward + progress', () => {
    const fromLegacy = effectRangeFromLegacyTargetShape('pierce', {
      range: 200,
    });
    expect(fromLegacy).toEqual({
      form: 'forward',
      applyMode: 'progress',
      maxTargets: 'all',
      distancePx: 200,
    });

    const back = legacyTargetShapeFromEffectRange(fromLegacy!);
    expect(back).toEqual({
      targetShape: 'pierce',
      range: 200,
    });

    const forwardOnly = legacyTargetShapeFromEffectRange({
      form: 'forward',
      applyMode: 'progress',
      maxTargets: 'all',
    });
    expect(forwardOnly).toEqual({ targetShape: 'pierce' });

    const normalized = normalizeSharedTargetingFields({
      effectRange: {
        form: 'forward',
        applyMode: 'progress',
        maxTargets: 'all',
      },
    });
    expect(normalized.targetShape).toBe('pierce');
    expect(normalized.effectRange?.form).toBe('forward');
  });

  it('round-trips multiLock ↔ single + hitCount 2 + refill', () => {
    const fromLegacy = effectRangeFromLegacyTargetShape('multiLock', {
      hitCount: 2,
    });
    expect(fromLegacy).toEqual({
      form: 'single',
      applyMode: 'instant',
      hitCount: 2,
      refillSameTargetOnShortfall: true,
    });

    const back = legacyTargetShapeFromEffectRange(fromLegacy!);
    expect(back).toEqual({
      targetShape: 'multiLock',
      hitCount: 2,
    });

    const normalizedFromLegacy = normalizeSharedTargetingFields({
      targetShape: 'multiLock',
      hitCount: 2,
    });
    expect(normalizedFromLegacy.effectRange).toEqual({
      form: 'single',
      applyMode: 'instant',
      hitCount: 2,
      refillSameTargetOnShortfall: true,
    });
    expect(normalizedFromLegacy.targetShape).toBe('multiLock');

    const normalizedFromNew = normalizeSharedTargetingFields({
      effectRange: {
        form: 'single',
        applyMode: 'instant',
        hitCount: 2,
        refillSameTargetOnShortfall: true,
      },
    });
    expect(normalizedFromNew.targetShape).toBe('multiLock');
    expect(normalizedFromNew.hitCount).toBe(2);
  });

  it('leaves chain / scatter / poolEach without effectRange', () => {
    expect(effectRangeFromLegacyTargetShape('chain')).toBeUndefined();
    expect(effectRangeFromLegacyTargetShape('scatter')).toBeUndefined();
    expect(effectRangeFromLegacyTargetShape('poolEach')).toBeUndefined();

    const normalized = normalizeSharedTargetingFields({
      targetShape: 'chain',
      chainCount: 3,
      chainMaxDistancePx: 80,
    });
    expect(normalized.effectRange).toBeUndefined();
    expect(normalized.targetShape).toBe('chain');
  });
});
