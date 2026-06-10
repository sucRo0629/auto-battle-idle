import type { DamageType, Role } from './types.ts';
import { isRangedAttack } from './data/entityTraits.ts';

export const PLACEHOLDER_SPRITE_KEYS = {
  defender: 'placeholder_df',
  supporter: 'placeholder_sp',
  /** フォールバック用（再分類キーが解決できない場合） */
  attackerGeneral: 'placeholder_at_general',
  attackerMelee: 'placeholder_at_melee',
  attackerRangedPhysical: 'placeholder_at_rng_physical',
  attackerRangedMagic: 'placeholder_at_rng_magic',
} as const;

export type PlaceholderSpriteKey =
  (typeof PLACEHOLDER_SPRITE_KEYS)[keyof typeof PLACEHOLDER_SPRITE_KEYS];

const PLACEHOLDER_SPRITE_KEY_SET = new Set<string>(
  Object.values(PLACEHOLDER_SPRITE_KEYS),
);

export function resolvePlaceholderSpriteKey(
  role: Role,
  rangePx: number,
  damageType: DamageType = 'physical',
): PlaceholderSpriteKey {
  if (role === 'defender') return PLACEHOLDER_SPRITE_KEYS.defender;
  if (role === 'supporter') return PLACEHOLDER_SPRITE_KEYS.supporter;
  if (isRangedAttack(rangePx)) {
    return damageType === 'magic'
      ? PLACEHOLDER_SPRITE_KEYS.attackerRangedMagic
      : PLACEHOLDER_SPRITE_KEYS.attackerRangedPhysical;
  }
  return PLACEHOLDER_SPRITE_KEYS.attackerMelee;
}

export function resolvePlaceholderIconKey(
  role: Role,
  rangePx: number,
  damageType: DamageType = 'physical',
): PlaceholderSpriteKey {
  return resolvePlaceholderSpriteKey(role, rangePx, damageType);
}

export function isPlaceholderSpriteKey(spriteKey: string): boolean {
  return PLACEHOLDER_SPRITE_KEY_SET.has(spriteKey);
}
