import defenderPlaceholderIconUrl from '../assets/class-icons/defender_placeholder.png';
import attackerMeleePlaceholderIconUrl from '../assets/class-icons/attacker_melee_placeholder.png';
import attackerRangedPlaceholderIconUrl from '../assets/class-icons/attacker_ranged_placeholder.png';
import supporterPlaceholderIconUrl from '../assets/class-icons/supporter_placeholder.png';
import { PLACEHOLDER_SPRITE_KEYS } from '../battle/classVisuals.ts';

export const ICON_COLORS: Record<string, string> = {
  [PLACEHOLDER_SPRITE_KEYS.defender]: '#2c5f9e',
  [PLACEHOLDER_SPRITE_KEYS.attackerMelee]: '#c0392b',
  [PLACEHOLDER_SPRITE_KEYS.supporter]: '#1e8449',
  [PLACEHOLDER_SPRITE_KEYS.attackerRanged]: '#922b21',
};

const ICON_URLS: Record<string, string> = {
  [PLACEHOLDER_SPRITE_KEYS.defender]: defenderPlaceholderIconUrl,
  [PLACEHOLDER_SPRITE_KEYS.attackerMelee]: attackerMeleePlaceholderIconUrl,
  [PLACEHOLDER_SPRITE_KEYS.supporter]: supporterPlaceholderIconUrl,
  [PLACEHOLDER_SPRITE_KEYS.attackerRanged]: attackerRangedPlaceholderIconUrl,
};

const iconImages = new Map<string, HTMLImageElement>();
let preloadPromise: Promise<void> | null = null;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load class icon: ${url}`));
    img.src = url;
  });
}

export function preloadClassIcons(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = Promise.all(
      Object.entries(ICON_URLS).map(async ([key, url]) => {
        iconImages.set(key, await loadImage(url));
      }),
    ).then(() => {});
  }
  return preloadPromise;
}

export function getClassIconColor(iconKey: string): string {
  return ICON_COLORS[iconKey] ?? '#888888';
}

export function getClassIconImage(iconKey: string): HTMLImageElement | undefined {
  return (
    iconImages.get(iconKey) ??
    iconImages.get(PLACEHOLDER_SPRITE_KEYS.defender)
  );
}

void preloadClassIcons();
