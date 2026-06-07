import type { AnimState } from "./SpriteRegistry.ts";

const VALID_ANIMS = new Set<AnimState>([
  "idle",
  "attack",
  "heal",
  "hurt",
  "death",
]);

const sheetModules = import.meta.glob<string>(
  "../assets/sprites/sheets/*/*.png",
  { eager: true, import: "default" },
);

const sheetUrls = new Map<string, Partial<Record<AnimState, string>>>();
const sheetImages = new Map<string, HTMLImageElement>();

function sheetCacheKey(spriteKey: string, anim: AnimState): string {
  return `${spriteKey}:${anim}`;
}

function parseSheetPath(
  path: string,
): { spriteKey: string; anim: AnimState } | null {
  const match = path.match(/\/sheets\/([^/]+)\/([^/]+)\.png$/);
  if (!match) return null;

  const spriteKey = match[1];
  const anim = match[2] as AnimState;
  if (!VALID_ANIMS.has(anim)) return null;

  return { spriteKey, anim };
}

for (const [path, url] of Object.entries(sheetModules)) {
  const parsed = parseSheetPath(path);
  if (!parsed) continue;

  const entry = sheetUrls.get(parsed.spriteKey) ?? {};
  entry[parsed.anim] = url;
  sheetUrls.set(parsed.spriteKey, entry);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load sprite sheet: ${url}`));
    img.src = url;
  });
}

let preloadPromise: Promise<void> | null = null;

/** `assets/sprites/sheets/{spriteKey}/{anim}.png` をプリロード */
export function preloadSpriteSheets(): Promise<void> {
  if (!preloadPromise) {
    const loads: Promise<void>[] = [];
    for (const [spriteKey, anims] of sheetUrls) {
      for (const [anim, url] of Object.entries(anims) as [AnimState, string][]) {
        loads.push(
          loadImage(url).then((img) => {
            sheetImages.set(sheetCacheKey(spriteKey, anim), img);
          }),
        );
      }
    }
    preloadPromise = Promise.all(loads).then(() => {});
  }
  return preloadPromise;
}

export function hasSpriteSheetAnimation(
  spriteKey: string,
  anim: AnimState,
): boolean {
  return sheetUrls.get(spriteKey)?.[anim] !== undefined;
}

export function getSpriteSheetImage(
  spriteKey: string,
  anim: AnimState,
): HTMLImageElement | undefined {
  return sheetImages.get(sheetCacheKey(spriteKey, anim));
}

/** 登録済みシート一覧（デバッグ・UI 向け） */
export function listSpriteSheetKeys(): ReadonlyMap<
  string,
  readonly AnimState[]
> {
  const result = new Map<string, readonly AnimState[]>();
  for (const [spriteKey, anims] of sheetUrls) {
    result.set(spriteKey, Object.keys(anims) as AnimState[]);
  }
  return result;
}
