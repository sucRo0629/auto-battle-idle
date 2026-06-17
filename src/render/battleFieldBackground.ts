import skyTileUrl from '../assets/background/sky_tile.png';
import grassTileUrl from '../assets/background/grass_tile.png';
import type { BattleHudTheme } from './battleHudTheme.ts';
import { GRASS_BAND_H } from './formationLayout.ts';
import { MAX_VISUAL_DEPTH_RISE } from './spriteVisualDepth.ts';

const SKY_PARALLAX = 0.35;
/** Pixels sky extends below the ground line to soften the horizon seam. */
const SKY_HORIZON_OVERLAP_PX = 3;
/** Height of the post-draw haze gradient straddling the ground line. */
const HORIZON_BLEND_PX = 8;
/** Horizontal overlap between adjacent tiles to hide 1px seams. */
const TILE_HORIZONTAL_OVERLAP_PX = 1;

let skyTile: HTMLImageElement | null = null;
let grassTile: HTMLImageElement | null = null;
let preloadPromise: Promise<void> | null = null;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load background tile: ${url}`));
    img.src = url;
  });
}

export function preloadBattleFieldBackground(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = Promise.all([
      loadImage(skyTileUrl).then((img) => {
        skyTile = img;
      }),
      loadImage(grassTileUrl).then((img) => {
        grassTile = img;
      }),
    ]).then(() => {});
  }
  return preloadPromise;
}

export function wrapScrollOffset(offsetPx: number, tileW: number): number {
  if (tileW <= 0) return 0;
  const snapped = Math.floor(offsetPx);
  return (((-snapped) % tileW) + tileW) % tileW;
}

/** 水平地面。奥行き最大分だけ草帯を上へ延長する */
export function staticGrassBandLayout(
  groundLineY: number,
  depthRise: number = MAX_VISUAL_DEPTH_RISE,
): { grassTop: number; grassHeight: number } {
  return {
    grassTop: groundLineY - depthRise,
    grassHeight: GRASS_BAND_H + depthRise,
  };
}

function drawTiledBand(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  scrollX: number,
): void {
  const tileW = image.naturalWidth;
  const tileH = image.naturalHeight;
  if (tileW <= 0 || tileH <= 0) return;

  const snappedScrollX = Math.floor(scrollX);
  const tileStep = Math.max(1, tileW - TILE_HORIZONTAL_OVERLAP_PX);
  const startX = Math.floor(x - tileW + snappedScrollX);
  const endX = Math.ceil(x + width + tileW);
  for (let drawX = startX; drawX < endX; drawX += tileStep) {
    const destX = Math.floor(drawX);
    for (let drawY = y; drawY < y + height; drawY += tileH) {
      const destY = Math.floor(drawY);
      const clipH = Math.min(tileH, y + height - drawY);
      if (clipH === tileH) {
        ctx.drawImage(image, destX, destY);
      } else {
        ctx.drawImage(image, 0, 0, tileW, clipH, destX, destY, tileW, clipH);
      }
    }
  }
}

function drawHorizonBlend(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  groundLineY: number,
): void {
  const top = groundLineY - HORIZON_BLEND_PX / 2;
  const grad = ctx.createLinearGradient(0, top, 0, top + HORIZON_BLEND_PX);
  grad.addColorStop(0, 'rgba(135, 206, 235, 0)');
  grad.addColorStop(0.45, 'rgba(120, 190, 160, 0.28)');
  grad.addColorStop(1, 'rgba(74, 168, 63, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, top, canvasW, HORIZON_BLEND_PX);
}

export interface BattleFieldBackgroundDrawOptions {
  canvasW: number;
  canvasH: number;
  groundLineY: number;
  worldOffsetX: number;
  theme: BattleHudTheme;
}

export function drawBattleFieldBackground(
  ctx: CanvasRenderingContext2D,
  options: BattleFieldBackgroundDrawOptions,
): void {
  const { canvasW, canvasH, groundLineY, worldOffsetX, theme } = options;
  const { grassTop, grassHeight } = staticGrassBandLayout(groundLineY);

  if (skyTile && skyTile.complete && skyTile.naturalWidth > 0) {
    const skyScroll = wrapScrollOffset(
      Math.floor(worldOffsetX * SKY_PARALLAX),
      skyTile.naturalWidth,
    );
    drawTiledBand(
      ctx,
      skyTile,
      0,
      0,
      canvasW,
      groundLineY + SKY_HORIZON_OVERLAP_PX,
      skyScroll,
    );
  } else {
    ctx.fillStyle = theme.sceneSkyFill;
    ctx.fillRect(0, 0, canvasW, groundLineY + SKY_HORIZON_OVERLAP_PX);
  }

  if (grassTile && grassTile.complete && grassTile.naturalWidth > 0) {
    const grassScroll = wrapScrollOffset(
      Math.floor(worldOffsetX),
      grassTile.naturalWidth,
    );
    drawTiledBand(
      ctx,
      grassTile,
      0,
      grassTop,
      canvasW,
      grassHeight,
      grassScroll,
    );
  } else {
    ctx.fillStyle = theme.sceneGroundFill;
    ctx.fillRect(0, grassTop, canvasW, grassHeight);
  }

  drawHorizonBlend(ctx, canvasW, groundLineY);
}

void preloadBattleFieldBackground();
