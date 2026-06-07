import bulwarkIconUrl from '../assets/class-icons/bulwark.png';
import berserkerIconUrl from '../assets/class-icons/berserker.png';
import clericIconUrl from '../assets/class-icons/cleric.png';
import hawkeyeIconUrl from '../assets/class-icons/hawkeye.png';
import defaultIconUrl from '../assets/class-icons/default.png';

export const ICON_COLORS: Record<string, string> = {
  bulwark: '#2c5f9e',
  berserker: '#c0392b',
  cleric: '#1e8449',
  hawkeye: '#922b21',
};

const ICON_URLS: Record<string, string> = {
  bulwark: bulwarkIconUrl,
  berserker: berserkerIconUrl,
  cleric: clericIconUrl,
  hawkeye: hawkeyeIconUrl,
  default: defaultIconUrl,
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
  return iconImages.get(iconKey) ?? iconImages.get('default');
}

void preloadClassIcons();
