import { describe, expect, it } from 'vitest';
import { normalizeEntityTraits } from './entityTraits.ts';

describe('normalizeEntityTraits', () => {
  it('fills defaults when omitted', () => {
    expect(normalizeEntityTraits(undefined)).toEqual({
      rangePx: 0,
      damageType: 'physical',
      basicAttackVfx: undefined,
      stationary: false,
    });
  });

  it('keeps explicit basicAttackVfx and leaves it unset otherwise', () => {
    expect(normalizeEntityTraits({ rangePx: 99 }).basicAttackVfx).toBeUndefined();
    expect(
      normalizeEntityTraits({
        rangePx: 100,
        basicAttackVfx: { preset: 'arrow', arc: true },
      }).basicAttackVfx,
    ).toEqual({ preset: 'arrow', arc: true });
  });
});
