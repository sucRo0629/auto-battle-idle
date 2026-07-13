import type { EntityTraits, NormalizedEntityTraits } from '../types.ts';

export function normalizeEntityTraits(
  raw: EntityTraits | undefined,
): NormalizedEntityTraits {
  const rangePx = raw?.rangePx ?? 0;
  const damageType = raw?.damageType ?? 'physical';
  return {
    rangePx,
    damageType,
    basicAttackVfx: raw?.basicAttackVfx,
    stationary: raw?.stationary ?? false,
  };
}

export function copyNormalizedTraits(
  traits: NormalizedEntityTraits,
): NormalizedEntityTraits {
  return {
    rangePx: traits.rangePx,
    damageType: traits.damageType,
    basicAttackVfx: traits.basicAttackVfx ? { ...traits.basicAttackVfx } : undefined,
    stationary: traits.stationary,
  };
}

export function isStationaryUnit(unit: { traits: NormalizedEntityTraits }): boolean {
  return unit.traits.stationary === true;
}
