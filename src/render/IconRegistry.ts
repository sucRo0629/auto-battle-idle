import defenderPlaceholderIconUrl from '../assets/class-icons/placeholder_df.png';
import supporterPlaceholderIconUrl from '../assets/class-icons/placeholder_sp.png';
import attackerGeneralPlaceholderIconUrl from '../assets/class-icons/placeholder_at_general.png';
import {
  resolveSkillIconKey,
  type SkillIconContext,
} from '../battle/skillVisuals.ts';
import { PLACEHOLDER_SPRITE_KEYS } from '../battle/classVisuals.ts';
import type {
  ActiveSkillDef,
  PassiveSkillDef,
} from '../battle/types.ts';

const CLASS_ICON_URLS: Record<string, string> = {
  [PLACEHOLDER_SPRITE_KEYS.defender]: defenderPlaceholderIconUrl,
  [PLACEHOLDER_SPRITE_KEYS.supporter]: supporterPlaceholderIconUrl,
  [PLACEHOLDER_SPRITE_KEYS.attackerGeneral]: attackerGeneralPlaceholderIconUrl,
  // 再分類用キー — PNG 追加までは general にフォールバック
  [PLACEHOLDER_SPRITE_KEYS.attackerMelee]: attackerGeneralPlaceholderIconUrl,
  [PLACEHOLDER_SPRITE_KEYS.attackerRangedPhysical]:
    attackerGeneralPlaceholderIconUrl,
  [PLACEHOLDER_SPRITE_KEYS.attackerRangedMagic]:
    attackerGeneralPlaceholderIconUrl,
};

const skillIconModules = import.meta.glob<string>(
  '../assets/skill-icons/*.png',
  { eager: true, import: 'default' },
);

const SKILL_ICON_URLS = new Map<string, string>();
for (const [path, url] of Object.entries(skillIconModules)) {
  const match = path.match(/\/skill-icons\/([^/]+)\.png$/);
  if (match) {
    SKILL_ICON_URLS.set(match[1], url);
  }
}

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

function collectIconUrls(): Map<string, string> {
  const urls = new Map<string, string>(Object.entries(CLASS_ICON_URLS));
  for (const [key, url] of SKILL_ICON_URLS) {
    urls.set(key, url);
  }
  return urls;
}

export function preloadClassIcons(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = Promise.all(
      [...collectIconUrls()].map(async ([key, url]) => {
        iconImages.set(key, await loadImage(url));
      }),
    ).then(() => {});
  }
  return preloadPromise;
}

export function getSkillIconUrl(resolvedKey: string): string {
  return (
    SKILL_ICON_URLS.get(resolvedKey) ??
    CLASS_ICON_URLS[resolvedKey] ??
    CLASS_ICON_URLS[PLACEHOLDER_SPRITE_KEYS.defender]
  );
}

type SkillIconSource = Pick<
  PassiveSkillDef | ActiveSkillDef,
  'id' | 'iconKey'
> & {
  allowedClassIds?: string[];
};

export function getSkillIconUrlForSkill(
  skill: SkillIconSource,
  context?: SkillIconContext,
): string {
  return getSkillIconUrl(resolveSkillIconKey(skill, context));
}

export function getClassIconUrl(iconKey: string): string {
  return getSkillIconUrl(iconKey);
}

export function getClassIconImage(iconKey: string): HTMLImageElement | undefined {
  return (
    iconImages.get(iconKey) ??
    iconImages.get(PLACEHOLDER_SPRITE_KEYS.defender)
  );
}

void preloadClassIcons();
