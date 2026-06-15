import entityAnimLayoutJson from "../../data/entityAnimLayout.json";

export type EntityBodyAnim = "idle" | "move" | "death";

export interface EntityAnimSpriteDef {
  frames: number;
  fps: number;
  loop: boolean;
}

export interface EntityAnimLayoutEntry {
  row: number;
  frames: number;
  loop: boolean;
}

export interface EntityAnimLayout {
  cellWidth: number;
  cellHeight: number;
  fps: number;
  rows: Record<EntityBodyAnim, EntityAnimLayoutEntry>;
}

export interface EntityFrameRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  clampedFrame: number;
}

const layout = entityAnimLayoutJson as EntityAnimLayout;

const bodyModules = import.meta.glob<string>(
  "../assets/sprites/sheets/bodies/*.png",
  { eager: true, import: "default" },
);

const bodyUrls = new Map<string, string>();
const bodyImages = new Map<string, HTMLImageElement>();

for (const [path, url] of Object.entries(bodyModules)) {
  const match = path.match(/\/bodies\/([^/]+)\.png$/);
  if (match) {
    bodyUrls.set(match[1], url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load entity body atlas: ${url}`));
    img.src = url;
  });
}

let preloadPromise: Promise<void> | null = null;

export function getEntityAnimLayout(): EntityAnimLayout {
  return layout;
}

export function getEntityAnimSpriteDef(anim: EntityBodyAnim): EntityAnimSpriteDef {
  const entry = layout.rows[anim];
  return {
    frames: entry.frames,
    fps: layout.fps,
    loop: entry.loop,
  };
}

export function getEntityFrameRect(
  _spriteKey: string,
  anim: EntityBodyAnim,
  frame: number,
): EntityFrameRect {
  const entry = layout.rows[anim];
  const clampedFrame = Math.min(Math.max(0, frame), entry.frames - 1);
  return {
    sx: clampedFrame * layout.cellWidth,
    sy: entry.row * layout.cellHeight,
    sw: layout.cellWidth,
    sh: layout.cellHeight,
    clampedFrame,
  };
}

export function hasEntityBodyAtlas(spriteKey: string): boolean {
  return bodyUrls.has(spriteKey) || bodyImages.has(spriteKey);
}

export function getEntityBodyImage(
  spriteKey: string,
): HTMLImageElement | undefined {
  return bodyImages.get(spriteKey);
}

export function preloadEntityBodies(): Promise<void> {
  if (!preloadPromise) {
    const loads = [...bodyUrls.entries()].map(([spriteKey, url]) =>
      loadImage(url).then((img) => {
        bodyImages.set(spriteKey, img);
      }),
    );
    preloadPromise = Promise.all(loads).then(() => {});
  }
  return preloadPromise;
}

/** テスト用: glob なしで body atlas を登録 */
export function __registerEntityBodyForTest(
  spriteKey: string,
  image: HTMLImageElement,
): void {
  bodyUrls.set(spriteKey, "test://");
  bodyImages.set(spriteKey, image);
  preloadPromise = null;
}

export function __resetEntityAtlasForTest(): void {
  bodyUrls.clear();
  bodyImages.clear();
  preloadPromise = null;
}
