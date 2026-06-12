import { describe, expect, it } from 'vitest';
import {
  deriveBasicAttackVfxFromTraits,
  normalizeEntityTraits,
} from './entityTraits.ts';

describe('normalizeEntityTraits', () => {
  it('fills defaults when omitted', () => {
    expect(normalizeEntityTraits(undefined)).toEqual({
      rangePx: 0,
      damageType: 'physical',
      basicAttackVfx: { preset: 'slash' },
      stationary: false,
    });
  });

  it('derives slash for physical below ranged band', () => {
    expect(
      normalizeEntityTraits({ rangePx: 99 }).basicAttackVfx,
    ).toEqual({ preset: 'slash' });
  });

  it('derives arrow for physical ranged band', () => {
    expect(
      normalizeEntityTraits({ rangePx: 100 }).basicAttackVfx,
    ).toEqual({ preset: 'arrow', arc: true });
  });

  it('derives orb for magic', () => {
    expect(
      deriveBasicAttackVfxFromTraits({ rangePx: 50, damageType: 'magic' }),
    ).toEqual({ preset: 'orb' });
  });
});
