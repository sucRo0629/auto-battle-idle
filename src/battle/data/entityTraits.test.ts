import { describe, expect, it } from 'vitest';
import {
  deriveBasicAttackVfxFromTraits,
  isRangedAttack,
  normalizeEntityTraits,
} from './entityTraits.ts';

describe('normalizeEntityTraits', () => {
  it('fills defaults when omitted', () => {
    expect(normalizeEntityTraits(undefined)).toEqual({
      rangePx: 0,
      damageType: 'physical',
      basicAttackVfx: { preset: 'slash' },
    });
  });

  it('derives arrow for physical ranged', () => {
    expect(
      normalizeEntityTraits({ rangePx: 50 }).basicAttackVfx,
    ).toEqual({ preset: 'arrow', arc: true });
  });

  it('derives orb for magic', () => {
    expect(
      deriveBasicAttackVfxFromTraits({ rangePx: 50, damageType: 'magic' }),
    ).toEqual({ preset: 'orb' });
  });
});

describe('isRangedAttack', () => {
  it('uses threshold 25', () => {
    expect(isRangedAttack(24)).toBe(false);
    expect(isRangedAttack(25)).toBe(true);
  });
});
