import type { PlaceholderSpriteKey } from '../battle/classVisuals.ts';
import {
  ENEMY_DEFAULT_SPRITE_KEY,
  hasEntitySpriteAsset,
  SPRITE_URLS,
} from './spriteAssets.ts';
import {
  getEntityAnimSpriteDef,
  preloadEntityBodies,
} from './entityAtlas.ts';
import { preloadSkillAnims } from './skillAnimRegistry.ts';
import { preloadVfxAnims } from './vfxAnimRegistry.ts';
import { preloadSpriteSheets } from './spriteSheetRegistry.ts';

export type AnimState = 'idle' | 'attack' | 'move' | 'death';

/** entity / skill スプライトアニメ共通 fps */
export const SHARED_ANIM_FPS = 8;

export interface SpriteAnimDef {
  frames: number;
  fps: number;
  loop: boolean;
}

export { ENEMY_DEFAULT_SPRITE_KEY, hasEntitySpriteAsset };

export const ANIM_DEFS: Record<AnimState, SpriteAnimDef> = {
  idle: getEntityAnimSpriteDef('idle'),
  attack: { frames: 4, fps: SHARED_ANIM_FPS, loop: false },
  move: getEntityAnimSpriteDef('move'),
  death: getEntityAnimSpriteDef('death'),
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
    preloadPromise = Promise.all([
      ...Object.entries(SPRITE_URLS).map(async ([key, url]) => {
        spriteImages.set(key, await loadImage(url));
      }),
      preloadEntityBodies(),
      preloadSpriteSheets(),
      preloadSkillAnims(),
      preloadVfxAnims(),
    ]).then(() => {});
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
