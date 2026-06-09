import defenderPlaceholderUrl from '../assets/sprites/defender_placeholder.png';
import attackerMeleePlaceholderUrl from '../assets/sprites/attacker_melee_placeholder.png';
import attackerRangedPlaceholderUrl from '../assets/sprites/attacker_ranged_placeholder.png';
import supporterPlaceholderUrl from '../assets/sprites/supporter_placeholder.png';
import slimeUrl from '../assets/sprites/slime.png';
import enemyDefaultUrl from '../assets/sprites/enemy_default.png';
import { PLACEHOLDER_SPRITE_KEYS } from '../battle/classVisuals.ts';
import { hasSpriteSheetKey } from './spriteSheetRegistry.ts';

export const ENEMY_DEFAULT_SPRITE_KEY = 'enemy_default';

const LEGACY_SPRITE_KEYS = new Set<string>([
  ...Object.values(PLACEHOLDER_SPRITE_KEYS),
  'defender_placeholder',
  'attacker_melee_placeholder',
  'attacker_ranged_placeholder',
  'supporter_placeholder',
  'slime',
  ENEMY_DEFAULT_SPRITE_KEY,
]);

export const SPRITE_URLS: Record<string, string> = {
  [PLACEHOLDER_SPRITE_KEYS.defender]: defenderPlaceholderUrl,
  [PLACEHOLDER_SPRITE_KEYS.supporter]: supporterPlaceholderUrl,
  [PLACEHOLDER_SPRITE_KEYS.attackerGeneral]: attackerMeleePlaceholderUrl,
  [PLACEHOLDER_SPRITE_KEYS.attackerMelee]: attackerMeleePlaceholderUrl,
  [PLACEHOLDER_SPRITE_KEYS.attackerRangedPhysical]: attackerRangedPlaceholderUrl,
  [PLACEHOLDER_SPRITE_KEYS.attackerRangedMagic]: attackerRangedPlaceholderUrl,
  defender_placeholder: defenderPlaceholderUrl,
  attacker_melee_placeholder: attackerMeleePlaceholderUrl,
  attacker_ranged_placeholder: attackerRangedPlaceholderUrl,
  supporter_placeholder: supporterPlaceholderUrl,
  slime: slimeUrl,
  [ENEMY_DEFAULT_SPRITE_KEY]: enemyDefaultUrl,
};

const entitySpriteModules = import.meta.glob<string>(
  '../assets/sprites/*.png',
  { eager: true, import: 'default' },
);

for (const [path, url] of Object.entries(entitySpriteModules)) {
  const match = path.match(/\/sprites\/([^/]+)\.png$/);
  if (match) {
    SPRITE_URLS[match[1]] = url;
  }
}

/** `{entityId}.png` または `sheets/{entityId}/` が登録済みか（レガシー共有キーは除く） */
export function hasEntitySpriteAsset(entityId: string): boolean {
  if (hasSpriteSheetKey(entityId)) return true;
  return entityId in SPRITE_URLS && !LEGACY_SPRITE_KEYS.has(entityId);
}
