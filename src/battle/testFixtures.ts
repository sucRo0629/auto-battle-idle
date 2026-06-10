import type { NormalizedEntityTraits } from './types.ts';

export function mockMeleeTraits(): NormalizedEntityTraits {
  return {
    rangePx: 0,
    damageType: 'physical',
    basicAttackVfx: { preset: 'slash' },
  };
}

export function mockRangedTraits(rangePx = 55): NormalizedEntityTraits {
  return {
    rangePx,
    damageType: 'physical',
    basicAttackVfx: { preset: 'arrow', arc: true },
  };
}
