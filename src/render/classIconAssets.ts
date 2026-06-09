import { isPlaceholderSpriteKey } from '../battle/classVisuals.ts';

const classIconModules = import.meta.glob<string>(
  '../assets/class-icons/*.png',
  { eager: true, import: 'default' },
);

export const CLASS_ICON_URLS = new Map<string, string>();
for (const [path, url] of Object.entries(classIconModules)) {
  const match = path.match(/\/class-icons\/([^/]+)\.png$/);
  if (match) {
    CLASS_ICON_URLS.set(match[1], url);
  }
}

export function hasClassIconAsset(classId: string): boolean {
  return CLASS_ICON_URLS.has(classId) && !isPlaceholderSpriteKey(classId);
}
