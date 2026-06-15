import { SKILL_ANIM_CELL_WIDTH } from "./spriteLayout.ts";

const skillModules = import.meta.glob<string>(
  "../assets/sprites/sheets/skills/*.png",
  { eager: true, import: "default" },
);

const skillUrls = new Map<string, string>();
const skillImages = new Map<string, HTMLImageElement>();

function parseSkillSheetPath(path: string): string | null {
  const match = path.match(/\/sheets\/skills\/([^/]+)\.png$/);
  return match ? match[1] : null;
}

for (const [path, url] of Object.entries(skillModules)) {
  const key = parseSkillSheetPath(path);
  if (key) skillUrls.set(key, url);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load skill anim: ${url}`));
    img.src = url;
  });
}

let preloadPromise: Promise<void> | null = null;

export function preloadSkillAnims(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = Promise.all(
      [...skillUrls.entries()].map(async ([key, url]) => {
        skillImages.set(key, await loadImage(url));
      }),
    ).then(() => {});
  }
  return preloadPromise;
}

export function resolveSkillAnimKey(
  skillId: string,
  effectIndex: number,
): string | null {
  const indexed = `${skillId}_${effectIndex}`;
  if (skillUrls.has(indexed)) return indexed;
  if (skillUrls.has(skillId)) return skillId;
  return null;
}

export function hasSkillAnimKey(key: string): boolean {
  return skillUrls.has(key);
}

export function getSkillAnimImage(key: string): HTMLImageElement | undefined {
  return skillImages.get(key);
}

export function getSkillAnimFrameCount(key: string): number {
  const img = skillImages.get(key);
  if (!img || img.width <= 0) return 1;
  return Math.max(1, Math.floor(img.width / SKILL_ANIM_CELL_WIDTH));
}

export function __registerSkillAnimForTest(
  key: string,
  image: HTMLImageElement,
): void {
  skillUrls.set(key, "test://");
  skillImages.set(key, image);
}

export function __resetSkillAnimsForTest(): void {
  skillUrls.clear();
  skillImages.clear();
  preloadPromise = null;
}
