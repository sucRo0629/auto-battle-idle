import { isRangedAttack } from './data/entityTraits.ts';
import type { ClassPreset, Role } from './types.ts';

export const PLACEHOLDER_SPRITE_KEYS = {
  defender: 'defender_placeholder',
  attackerMelee: 'attacker_melee_placeholder',
  attackerRanged: 'attacker_ranged_placeholder',
  supporter: 'supporter_placeholder',
} as const;

export type PlaceholderSpriteKey =
  (typeof PLACEHOLDER_SPRITE_KEYS)[keyof typeof PLACEHOLDER_SPRITE_KEYS];

const PLACEHOLDER_SPRITE_KEY_SET = new Set<string>(
  Object.values(PLACEHOLDER_SPRITE_KEYS),
);

export function resolvePlaceholderSpriteKey(
  role: Role,
  rangePx: number,
): PlaceholderSpriteKey {
  if (role === 'defender') return PLACEHOLDER_SPRITE_KEYS.defender;
  if (role === 'supporter') return PLACEHOLDER_SPRITE_KEYS.supporter;
  return isRangedAttack(rangePx)
    ? PLACEHOLDER_SPRITE_KEYS.attackerRanged
    : PLACEHOLDER_SPRITE_KEYS.attackerMelee;
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
