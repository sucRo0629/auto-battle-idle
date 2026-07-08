export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** 8-neighbor offsets for outline spread glow. */
export const EIGHT_DIRECTION_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

export const HOVER_OUTLINE_GLOW_PULSE_MS = 3300;
/** Crisp outline band thickness around sprite silhouette (px, no blur). */
export const HOVER_OUTLINE_THICKNESS_PX = 2;

const OUTLINE_ALPHA_THRESHOLD = 24;
const CORE_ALPHA_FLOOR = 0.55;
const CORE_ALPHA_PEAK_BOOST = 0.35;

let silhouetteBuffer: HTMLCanvasElement | null = null;
let outlineBuffer: HTMLCanvasElement | null = null;

export function parseCssColor(color: string): RgbaColor {
  const trimmed = color.trim();
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b, a: 1 };
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return { r, g, b, a: 1 };
    }
  }

  const rgbaMatch = trimmed.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/,
  );
  if (rgbaMatch) {
    return {
      r: Number(rgbaMatch[1]),
      g: Number(rgbaMatch[2]),
      b: Number(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1,
    };
  }

  return { r: 180, g: 210, b: 255, a: 0.55 };
}

export function resolveHoverGlowPulseIntensity(elapsedMs: number): {
  core: number;
  halo: number;
} {
  const phase =
    ((elapsedMs % HOVER_OUTLINE_GLOW_PULSE_MS) + HOVER_OUTLINE_GLOW_PULSE_MS) %
    HOVER_OUTLINE_GLOW_PULSE_MS /
    HOVER_OUTLINE_GLOW_PULSE_MS;
  const wave = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  return {
    core: 0.72 + 0.28 * wave,
    halo: 0.12 + 0.18 * wave,
  };
}

/** Alpha edge detection: opaque pixel with a transparent 8-neighbor becomes outline. */
export function extractOutlineMask(
  alphaData: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = OUTLINE_ALPHA_THRESHOLD,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const isOpaque = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return alphaData[(y * width + x) * 4 + 3] >= alphaThreshold;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isOpaque(x, y)) continue;
      for (const [dx, dy] of EIGHT_DIRECTION_OFFSETS) {
        if (!isOpaque(x + dx, y + dy)) {
          mask[y * width + x] = 1;
          break;
        }
      }
    }
  }

  return mask;
}

export function extractSilhouetteMask(
  alphaData: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = OUTLINE_ALPHA_THRESHOLD,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    if (alphaData[i * 4 + 3] >= alphaThreshold) {
      mask[i] = 1;
    }
  }
  return mask;
}

/** One step of 8-neighbor morphological dilation. */
export function dilateMask8(
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const next = new Uint8Array(mask);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (const [dx, dy] of EIGHT_DIRECTION_OFFSETS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        next[ny * width + nx] = 1;
      }
    }
  }
  return next;
}

/** Opaque silhouette expanded outward by thicknessPx, minus the original fill. */
export function buildOutlineBandMask(
  silhouette: Uint8Array,
  width: number,
  height: number,
  thicknessPx: number,
): Uint8Array {
  let expanded = silhouette;
  for (let i = 0; i < thicknessPx; i++) {
    expanded = dilateMask8(expanded, width, height);
  }

  const band = new Uint8Array(width * height);
  for (let i = 0; i < band.length; i++) {
    band[i] = expanded[i] && !silhouette[i] ? 1 : 0;
  }
  return band;
}

export function fillOutlinePixelData(
  mask: Uint8Array,
  width: number,
  height: number,
  color: RgbaColor,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  const alphaByte = Math.round(Math.max(0, Math.min(1, color.a)) * 255);

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const offset = i * 4;
    data[offset] = color.r;
    data[offset + 1] = color.g;
    data[offset + 2] = color.b;
    data[offset + 3] = alphaByte;
  }

  return data;
}

export function buildOutlineImageData(
  mask: Uint8Array,
  width: number,
  height: number,
  color: RgbaColor,
): ImageData {
  return new ImageData(fillOutlinePixelData(mask, width, height, color), width, height);
}

function getBuffer(
  bufferRef: HTMLCanvasElement | null,
  size: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = bufferRef ?? document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D unavailable");

  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function resolveBufferDest(
  destLeft: number,
  destTop: number,
  layoutSize: number,
  pixelSize: number,
): { x: number; y: number } {
  return {
    x: destLeft + layoutSize / 2 - pixelSize / 2,
    y: destTop + layoutSize - pixelSize,
  };
}

export interface HoverSilhouetteOutlineGlowOptions {
  targetCtx: CanvasRenderingContext2D;
  bufferSize: number;
  layoutSize: number;
  destLeft: number;
  destTop: number;
  elapsedMs: number;
  outlineColor: RgbaColor;
  glowColor: RgbaColor;
  drawSpriteToBuffer: (
    bufferCtx: CanvasRenderingContext2D,
    footX: number,
    footY: number,
  ) => void;
}

/**
 * Draw hover highlight as a crisp outline band around the sprite silhouette.
 * 1) Render sprite to buffer
 * 2) Build a thicknessPx band via 8-neighbor dilation (no blur)
 * 3) Pulse band alpha slowly
 */
export function drawHoverSilhouetteOutlineGlow(
  options: HoverSilhouetteOutlineGlowOptions,
): void {
  const {
    targetCtx,
    bufferSize,
    layoutSize,
    destLeft,
    destTop,
    elapsedMs,
    outlineColor,
    glowColor,
    drawSpriteToBuffer,
  } = options;

  const pixelSize = Math.ceil(bufferSize);
  const silhouette = getBuffer(silhouetteBuffer, pixelSize);
  silhouetteBuffer = silhouette.canvas;

  drawSpriteToBuffer(silhouette.ctx, pixelSize / 2, pixelSize);

  const silhouetteData = silhouette.ctx.getImageData(0, 0, pixelSize, pixelSize);
  const silhouetteMask = extractSilhouetteMask(
    silhouetteData.data,
    pixelSize,
    pixelSize,
  );
  const outlineBandMask = buildOutlineBandMask(
    silhouetteMask,
    pixelSize,
    pixelSize,
    HOVER_OUTLINE_THICKNESS_PX,
  );

  const pulse = resolveHoverGlowPulseIntensity(elapsedMs);
  const pulseAlpha = CORE_ALPHA_FLOOR + CORE_ALPHA_PEAK_BOOST * pulse.core;
  const outline = getBuffer(outlineBuffer, pixelSize);
  outlineBuffer = outline.canvas;

  const opaqueGlow: RgbaColor = { ...glowColor, a: 1 };
  const opaqueOutline: RgbaColor = { ...outlineColor, a: 1 };

  outline.ctx.putImageData(
    buildOutlineImageData(outlineBandMask, pixelSize, pixelSize, opaqueGlow),
    0,
    0,
  );

  const { x: destX, y: destY } = resolveBufferDest(
    destLeft,
    destTop,
    layoutSize,
    pixelSize,
  );

  targetCtx.save();
  targetCtx.imageSmoothingEnabled = false;
  targetCtx.globalAlpha = glowColor.a * pulseAlpha;
  targetCtx.drawImage(outline.canvas, destX, destY);

  const edgeMask = extractOutlineMask(
    silhouetteData.data,
    pixelSize,
    pixelSize,
  );
  outline.ctx.clearRect(0, 0, pixelSize, pixelSize);
  outline.ctx.putImageData(
    buildOutlineImageData(edgeMask, pixelSize, pixelSize, opaqueOutline),
    0,
    0,
  );
  targetCtx.globalAlpha = outlineColor.a * pulseAlpha;
  targetCtx.drawImage(outline.canvas, destX, destY);
  targetCtx.restore();
}
