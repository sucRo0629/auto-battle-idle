import type { AnimState } from "./SpriteRegistry.ts";

const ENTITY_ANIMS = new Set<AnimState>(["idle", "move", "death"]);

const ATTACK_VARIANT_PATTERN = /^attack(?:_(\d+))?$/;

const sheetModules = import.meta.glob<string>(
  "../assets/sprites/sheets/*/*.png",
  { eager: true, import: "default" },
);

const entitySheetUrls = new Map<string, Partial<Record<AnimState, string>>>();
const attackVariantUrls = new Map<string, Map<string, string>>();
const sheetImages = new Map<string, HTMLImageElement>();

function sheetCacheKey(spriteKey: string, sheetKey: string): string {
  return `${spriteKey}:${sheetKey}`;
}

function registerAttackVariant(
  spriteKey: string,
  variantKey: string,
  url: string,
): void {
  const variants = attackVariantUrls.get(spriteKey) ?? new Map<string, string>();
  variants.set(variantKey, url);
  attackVariantUrls.set(spriteKey, variants);
}

function parseEntitySheetFilename(
  filename: string,
): { kind: "entityAnim"; anim: AnimState } | { kind: "attackVariant"; key: string } | null {
  if (ENTITY_ANIMS.has(filename as AnimState)) {
    return { kind: "entityAnim", anim: filename as AnimState };
  }

  const attackMatch = filename.match(ATTACK_VARIANT_PATTERN);
  if (attackMatch) {
    const variantKey = attackMatch[1] ? `attack_${attackMatch[1]}` : "attack";
    return { kind: "attackVariant", key: variantKey };
  }

  if (filename === "dash") {
    return { kind: "entityAnim", anim: "move" };
  }

  return null;
}

function parseSheetPath(
  path: string,
): { spriteKey: string; parsed: NonNullable<ReturnType<typeof parseEntitySheetFilename>> } | null {
  const match = path.match(/\/sheets\/([^/]+)\/([^/]+)\.png$/);
  if (!match) return null;

  const spriteKey = match[1];
  if (spriteKey === "skills") return null;

  const parsed = parseEntitySheetFilename(match[2]);
  if (!parsed) return null;

  return { spriteKey, parsed };
}

for (const [path, url] of Object.entries(sheetModules)) {
  const parsedPath = parseSheetPath(path);
  if (!parsedPath) continue;

  const { spriteKey, parsed } = parsedPath;
  if (parsed.kind === "entityAnim") {
    const entry = entitySheetUrls.get(spriteKey) ?? {};
    entry[parsed.anim] = url;
    entitySheetUrls.set(spriteKey, entry);
    continue;
  }

  registerAttackVariant(spriteKey, parsed.key, url);
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

function sortedAttackVariantKeys(spriteKey: string): string[] {
  const variants = attackVariantUrls.get(spriteKey);
  if (!variants || variants.size === 0) return [];

  return [...variants.keys()].sort((a, b) => {
    const num = (key: string) =>
      key === "attack" ? 1 : Number.parseInt(key.slice("attack_".length), 10);
    return num(a) - num(b);
  });
}

/** `assets/sprites/sheets/{spriteKey}/{anim}.png` をプリロード */
export function preloadSpriteSheets(): Promise<void> {
  if (!preloadPromise) {
    const loads: Promise<void>[] = [];

    for (const [spriteKey, anims] of entitySheetUrls) {
      for (const [anim, url] of Object.entries(anims) as [AnimState, string][]) {
        loads.push(
          loadImage(url).then((img) => {
            sheetImages.set(sheetCacheKey(spriteKey, anim), img);
          }),
        );
      }
    }

    for (const [spriteKey, variants] of attackVariantUrls) {
      for (const [variantKey, url] of variants) {
        loads.push(
          loadImage(url).then((img) => {
            sheetImages.set(sheetCacheKey(spriteKey, variantKey), img);
          }),
        );
      }
    }

    preloadPromise = Promise.all(loads).then(() => {});
  }
  return preloadPromise;
}

export function hasSpriteSheetKey(spriteKey: string): boolean {
  return entitySheetUrls.has(spriteKey) || attackVariantUrls.has(spriteKey);
}

export function hasSpriteSheetAnimation(
  spriteKey: string,
  anim: AnimState,
  attackSheetKey?: string,
): boolean {
  if (anim === "attack") {
    const key = attackSheetKey ?? "attack";
    return attackVariantUrls.get(spriteKey)?.has(key) ?? false;
  }
  return entitySheetUrls.get(spriteKey)?.[anim] !== undefined;
}

export function getAttackVariantKeys(spriteKey: string): readonly string[] {
  return sortedAttackVariantKeys(spriteKey);
}

export function pickRandomAttackVariant(spriteKey: string): string {
  const keys = sortedAttackVariantKeys(spriteKey);
  if (keys.length === 0) return "attack";
  if (keys.length === 1) return keys[0];
  return keys[Math.floor(Math.random() * keys.length)];
}

export function getSpriteSheetImage(
  spriteKey: string,
  sheetKey: string,
): HTMLImageElement | undefined {
  return sheetImages.get(sheetCacheKey(spriteKey, sheetKey));
}

/** 登録済みシート一覧（デバッグ・UI 向け） */
export function listSpriteSheetKeys(): ReadonlyMap<
  string,
  readonly AnimState[]
> {
  const result = new Map<string, readonly AnimState[]>();
  for (const [spriteKey, anims] of entitySheetUrls) {
    result.set(spriteKey, Object.keys(anims) as AnimState[]);
  }
  return result;
}

/** テスト用: モジュール glob なしで variant 登録 */
export function __registerAttackVariantForTest(
  spriteKey: string,
  variantKey: string,
  image: HTMLImageElement,
): void {
  registerAttackVariant(spriteKey, variantKey, "test://");
  sheetImages.set(sheetCacheKey(spriteKey, variantKey), image);
}

export function __registerEntityAnimForTest(
  spriteKey: string,
  anim: AnimState,
  image: HTMLImageElement,
): void {
  const entry = entitySheetUrls.get(spriteKey) ?? {};
  entry[anim] = "test://";
  entitySheetUrls.set(spriteKey, entry);
  sheetImages.set(sheetCacheKey(spriteKey, anim), image);
}

export function __resetSpriteSheetsForTest(): void {
  entitySheetUrls.clear();
  attackVariantUrls.clear();
  sheetImages.clear();
  preloadPromise = null;
}
