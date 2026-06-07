import defenderBulwarkUrl from '../assets/sprites/defender_bulwark.png';
import attackerBerserkerUrl from '../assets/sprites/attacker_berserker.png';
import supporterClericUrl from '../assets/sprites/supporter_cleric.png';
import attackerHawkeyeUrl from '../assets/sprites/attacker_hawkeye.png';
import slimeUrl from '../assets/sprites/slime.png';
import defaultSpriteUrl from '../assets/sprites/default.png';

export type AnimState = 'idle' | 'attack' | 'heal' | 'hurt' | 'death';

export interface SpriteAnimDef {
  frames: number;
  fps: number;
  loop: boolean;
}

export const SPRITE_COLORS: Record<string, string> = {
  defender_bulwark: '#4a90d9',
  attacker_berserker: '#e67e22',
  supporter_cleric: '#2ecc71',
  attacker_hawkeye: '#e74c3c',
  slime: '#9b59b6',
};

const SPRITE_URLS: Record<string, string> = {
  defender_bulwark: defenderBulwarkUrl,
  attacker_berserker: attackerBerserkerUrl,
  supporter_cleric: supporterClericUrl,
  attacker_hawkeye: attackerHawkeyeUrl,
  slime: slimeUrl,
  default: defaultSpriteUrl,
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

export function getSpriteColor(spriteKey: string): string {
  return SPRITE_COLORS[spriteKey] ?? '#888888';
}

export function getSpriteImage(spriteKey: string): HTMLImageElement | undefined {
  return spriteImages.get(spriteKey) ?? spriteImages.get('default');
}

void preloadSprites();
