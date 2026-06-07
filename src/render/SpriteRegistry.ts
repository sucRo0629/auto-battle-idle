import defenderPlaceholderUrl from '../assets/sprites/defender_placeholder.png';
import attackerMeleePlaceholderUrl from '../assets/sprites/attacker_melee_placeholder.png';
import attackerRangedPlaceholderUrl from '../assets/sprites/attacker_ranged_placeholder.png';
import supporterPlaceholderUrl from '../assets/sprites/supporter_placeholder.png';
import slimeUrl from '../assets/sprites/slime.png';
import enemyDefaultUrl from '../assets/sprites/enemy_default.png';
import {
  PLACEHOLDER_SPRITE_KEYS,
  type PlaceholderSpriteKey,
} from '../battle/classVisuals.ts';

export type AnimState = 'idle' | 'attack' | 'heal' | 'hurt' | 'death';

export interface SpriteAnimDef {
  frames: number;
  fps: number;
  loop: boolean;
}

export const ENEMY_DEFAULT_SPRITE_KEY = 'enemy_default';

const SPRITE_URLS: Record<string, string> = {
  [PLACEHOLDER_SPRITE_KEYS.defender]: defenderPlaceholderUrl,
  [PLACEHOLDER_SPRITE_KEYS.attackerMelee]: attackerMeleePlaceholderUrl,
  [PLACEHOLDER_SPRITE_KEYS.supporter]: supporterPlaceholderUrl,
  [PLACEHOLDER_SPRITE_KEYS.attackerRanged]: attackerRangedPlaceholderUrl,
  slime: slimeUrl,
  [ENEMY_DEFAULT_SPRITE_KEY]: enemyDefaultUrl,
};

export const ANIM_DEFS: Record<AnimState, SpriteAnimDef> = {
  idle: { frames: 4, fps: 6, loop: true },
  attack: { frames: 4, fps: 12, loop: false },
  heal: { frames: 3, fps: 10, loop: false },
  hurt: { frames: 2, fps: 10, loop: false },
  death: { frames: 3, fps: 8, loop: false },
};

const spriteImages = new Map<string, HTMLImageElement>();
let preloadPromise: Promise<void> | null = null;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load sprite: ${url}`));
    img.src = url;
  });
}

export function preloadSprites(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = Promise.all(
      Object.entries(SPRITE_URLS).map(async ([key, url]) => {
        spriteImages.set(key, await loadImage(url));
      }),
    ).then(() => {});
  }
  return preloadPromise;
}

export function getSpriteUrl(spriteKey: string): string {
  return (
    SPRITE_URLS[spriteKey] ??
    SPRITE_URLS[ENEMY_DEFAULT_SPRITE_KEY]
  );
}

export function getSpriteImage(spriteKey: string): HTMLImageElement | undefined {
  return (
    spriteImages.get(spriteKey) ??
    spriteImages.get(ENEMY_DEFAULT_SPRITE_KEY)
  );
}

export function getPlaceholderSpriteImage(
  key: PlaceholderSpriteKey,
): HTMLImageElement | undefined {
  return spriteImages.get(key);
}

void preloadSprites();
