import type { DamageType, EntityTraits, NormalizedEntityTraits, SkillVfxDef } from '../types.ts';
import { RANGED_ATTACK_THRESHOLD_PX } from '../types.ts';

export function isRangedAttack(rangePx: number): boolean {
  return rangePx >= RANGED_ATTACK_THRESHOLD_PX;
}

export function deriveBasicAttackVfxFromTraits(traits: {
  rangePx: number;
  damageType: DamageType;
}): SkillVfxDef {
  if (traits.damageType === 'magic') {
    return { preset: 'orb' };
  }
  if (isRangedAttack(traits.rangePx)) {
    return { preset: 'arrow', arc: true };
  }
  return { preset: 'slash' };
}

export function normalizeEntityTraits(
  raw: EntityTraits | undefined,
): NormalizedEntityTraits {
  const rangePx = raw?.rangePx ?? 0;
  const damageType = raw?.damageType ?? 'physical';
  const basicAttackVfx =
    raw?.basicAttackVfx ?? deriveBasicAttackVfxFromTraits({ rangePx, damageType });
  return { rangePx, damageType, basicAttackVfx };
}

export function copyNormalizedTraits(
  traits: NormalizedEntityTraits,
): NormalizedEntityTraits {
  return {
    rangePx: traits.rangePx,
    damageType: traits.damageType,
    basicAttackVfx: { ...traits.basicAttackVfx },
  };
}
