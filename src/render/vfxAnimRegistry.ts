import { VFX_ANIM_CELL_WIDTH } from "./spriteLayout.ts";

const vfxModules = import.meta.glob<string>(
  "../assets/sprites/sheets/vfx/*.png",
  { eager: true, import: "default" },
);

const vfxUrls = new Map<string, string>();
const vfxImages = new Map<string, HTMLImageElement>();

function parseVfxSheetPath(path: string): string | null {
  const match = path.match(/\/sheets\/vfx\/([^/]+)\.png$/);
  return match ? match[1] : null;
}

for (const [path, url] of Object.entries(vfxModules)) {
  const key = parseVfxSheetPath(path);
  if (key) vfxUrls.set(key, url);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load vfx anim: ${url}`));
    img.src = url;
  });
}

let preloadPromise: Promise<void> | null = null;

export function preloadVfxAnims(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = Promise.all(
      [...vfxUrls.entries()].map(async ([key, url]) => {
        vfxImages.set(key, await loadImage(url));
      }),
    ).then(() => {});
  }
  return preloadPromise;
}

function vfxSuffix(kind: "main" | "hit"): string {
  return kind === "hit" ? "_vfx_hit" : "_vfx";
}

export function resolveVfxAnimKey(
  skillId: string,
  effectIndex: number,
  kind: "main" | "hit" = "main",
): string | null {
  const suffix = vfxSuffix(kind);
  const indexed = `${skillId}_${effectIndex}${suffix}`;
  if (vfxUrls.has(indexed)) return indexed;
  const fallback = `${skillId}${suffix}`;
  if (vfxUrls.has(fallback)) return fallback;
  return null;
}

export function hasVfxAnimKey(key: string): boolean {
  return vfxUrls.has(key);
}

export function getVfxAnimImage(key: string): HTMLImageElement | undefined {
  return vfxImages.get(key);
}

export function getVfxAnimFrameCount(key: string): number {
  const img = vfxImages.get(key);
  if (!img || img.width <= 0) return 1;
  return Math.max(1, Math.floor(img.width / VFX_ANIM_CELL_WIDTH));
}

export function __registerVfxAnimForTest(
  key: string,
  image: HTMLImageElement,
): void {
  vfxUrls.set(key, "test://");
  vfxImages.set(key, image);
}

export function __resetVfxAnimsForTest(): void {
  vfxUrls.clear();
  vfxImages.clear();
  preloadPromise = null;
}
