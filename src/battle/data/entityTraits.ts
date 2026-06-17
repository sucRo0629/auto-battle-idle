import type { DamageType, EntityTraits, NormalizedEntityTraits } from '../types.ts';
import { RANGED_ATTACK_MIN_PX } from '../types.ts';

export function isRangedAttack(rangePx: number): boolean {
  return rangePx >= RANGED_ATTACK_MIN_PX;
}

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
