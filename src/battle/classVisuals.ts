import type { ClassPreset, Role } from './types.ts';

export const PLACEHOLDER_SPRITE_KEYS = {
  defender: 'placeholder_df',
  supporter: 'placeholder_sp',
  /** 再分類まで全アタッカー共通 */
  attackerGeneral: 'placeholder_at_general',
  /** 将来: 近接アタッカー */
  attackerMelee: 'placeholder_at_melee',
  /** 将来: 物理遠距離アタッカー */
  attackerRangedPhysical: 'placeholder_at_rng_physical',
  /** 将来: 魔法遠距離アタッカー */
  attackerRangedMagic: 'placeholder_at_rng_magic',
} as const;

export type PlaceholderSpriteKey =
  (typeof PLACEHOLDER_SPRITE_KEYS)[keyof typeof PLACEHOLDER_SPRITE_KEYS];

const PLACEHOLDER_SPRITE_KEY_SET = new Set<string>(
  Object.values(PLACEHOLDER_SPRITE_KEYS),
);

export function resolvePlaceholderSpriteKey(
  role: Role,
  _rangePx: number,
): PlaceholderSpriteKey {
  if (role === 'defender') return PLACEHOLDER_SPRITE_KEYS.defender;
  if (role === 'supporter') return PLACEHOLDER_SPRITE_KEYS.supporter;
  // TODO: melee / ranged physical / ranged magic に再分類
  return PLACEHOLDER_SPRITE_KEYS.attackerGeneral;
}

export function resolvePlaceholderIconKey(
  role: Role,
  rangePx: number,
): PlaceholderSpriteKey {
  return resolvePlaceholderSpriteKey(role, rangePx);
}

export function resolveClassSpriteKey(
  preset: Pick<ClassPreset, 'role' | 'traits' | 'spriteKey'>,
): string {
  if (preset.spriteKey) return preset.spriteKey;
  return resolvePlaceholderSpriteKey(preset.role, preset.traits.rangePx);
}

export function resolveClassIconKey(
  preset: Pick<ClassPreset, 'role' | 'traits' | 'iconKey'>,
): string {
  if (preset.iconKey) return preset.iconKey;
  return resolvePlaceholderIconKey(preset.role, preset.traits.rangePx);
}

export function isPlaceholderSpriteKey(spriteKey: string): boolean {
  return PLACEHOLDER_SPRITE_KEY_SET.has(spriteKey);
}
