import skyTileUrl from '../assets/background/sky_tile.png';
import grassTileUrl from '../assets/background/grass_tile.png';
import type { BattleHudTheme } from './battleHudTheme.ts';
import {
  BATTLE_FIELD_SPRITE_SCALE,
  GRASS_BAND_H,
} from './formationLayout.ts';
import { maxVisualDepthRisePx } from './spriteVisualDepth.ts';

const SKY_PARALLAX = 0.35;
/** Pixels sky extends below the sky/ground seam to soften the horizon. */
const SKY_HORIZON_OVERLAP_PX = 3;
/** Height of the post-draw haze gradient straddling the sky/ground seam. */
const HORIZON_BLEND_PX = 8;
/** Horizontal overlap between adjacent tiles to hide 1px seams. */
const TILE_HORIZONTAL_OVERLAP_PX = 1;
/** Vertical overlap between stacked tiles to hide 1px seams. */
const TILE_VERTICAL_OVERLAP_PX = 1;

/**
 * grass_tile.png 上部の空〜地平行。
 * 縦タイルすると空色の境界線になるので、繰り返しには使わない。
 */
export const GRASS_TILE_HORIZON_ROWS = 4;
/**
 * grass_tile.png 下部の濃色帯。縦タイルの継ぎ目で帯が出るので繰り返しから除外。
 */
export const GRASS_TILE_BOTTOM_SHADE_ROWS = 7;

/** フィールド描画スケールでの空／地面境界（群れ最大 Y ずらし + 余白） */
export const FIELD_VISUAL_DEPTH_RISE_PX = maxVisualDepthRisePx(
  BATTLE_FIELD_SPRITE_SCALE,
);

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

/** 水平地面。群れ最大 Y ずらし分だけ草帯を上へ延長する（空／地面境界 = grassTop） */
export function staticGrassBandLayout(
  groundLineY: number,
  depthRise: number = FIELD_VISUAL_DEPTH_RISE_PX,
): { grassTop: number; grassHeight: number } {
  return {
    grassTop: groundLineY - depthRise,
    grassHeight: GRASS_BAND_H + depthRise,
  };
}

/** 縦繰り返し用の草ソース矩形（上空グラデ・下濃色を除外） */
export function grassTileRepeatSource(
  tileW: number,
  tileH: number,
): { srcX: number; srcY: number; srcW: number; srcH: number } | null {
  const srcY = GRASS_TILE_HORIZON_ROWS;
  const srcH = tileH - GRASS_TILE_HORIZON_ROWS - GRASS_TILE_BOTTOM_SHADE_ROWS;
  if (tileW <= 0 || srcH <= 0) return null;
  return { srcX: 0, srcY, srcW: tileW, srcH };
}

interface TiledBandSource {
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
}

function drawTiledBand(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  scrollX: number,
  source?: TiledBandSource,
): void {
  const tileW = image.naturalWidth;
  const tileH = image.naturalHeight;
  if (tileW <= 0 || tileH <= 0) return;

  const src = source ?? { srcX: 0, srcY: 0, srcW: tileW, srcH: tileH };
  if (src.srcW <= 0 || src.srcH <= 0) return;

  const snappedScrollX = Math.floor(scrollX);
  const tileStepX = Math.max(1, src.srcW - TILE_HORIZONTAL_OVERLAP_PX);
  const tileStepY = Math.max(1, src.srcH - TILE_VERTICAL_OVERLAP_PX);
  const startX = Math.floor(x - src.srcW + snappedScrollX);
  const endX = Math.ceil(x + width + src.srcW);
  const endY = y + height;

  for (let drawX = startX; drawX < endX; drawX += tileStepX) {
    const destX = Math.floor(drawX);
    for (let drawY = y; drawY < endY; drawY += tileStepY) {
      const destY = Math.floor(drawY);
      const clipH = Math.min(src.srcH, endY - drawY);
      if (clipH <= 0) continue;
      ctx.drawImage(
        image,
        src.srcX,
        src.srcY,
        src.srcW,
        clipH,
        destX,
        destY,
        src.srcW,
        clipH,
      );
    }
  }
}

function drawHorizonBlend(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  skyGroundSeamY: number,
): void {
  const top = skyGroundSeamY - HORIZON_BLEND_PX / 2;
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
  const { canvasW, groundLineY, worldOffsetX, theme } = options;
  const { grassTop, grassHeight } = staticGrassBandLayout(groundLineY);
  // 空／地面境界 = 群れ最大 Y ずらし位置（grassTop）。足元論理ラインは groundLineY のまま。
  const skyGroundSeamY = grassTop;
  const skyHeight = skyGroundSeamY + SKY_HORIZON_OVERLAP_PX;

  if (skyTile && skyTile.complete && skyTile.naturalWidth > 0) {
    const skyScroll = wrapScrollOffset(
      Math.floor(worldOffsetX * SKY_PARALLAX),
      skyTile.naturalWidth,
    );
    drawTiledBand(ctx, skyTile, 0, 0, canvasW, skyHeight, skyScroll);
  } else {
    ctx.fillStyle = theme.sceneSkyFill;
    ctx.fillRect(0, 0, canvasW, skyHeight);
  }

  // 継ぎ目から空が透けないよう地面色で下塗りしてから草テクスチャを敷く
  ctx.fillStyle = theme.sceneGroundFill;
  ctx.fillRect(0, grassTop, canvasW, grassHeight);

  if (grassTile && grassTile.complete && grassTile.naturalWidth > 0) {
    const grassScroll = wrapScrollOffset(
      Math.floor(worldOffsetX),
      grassTile.naturalWidth,
    );
    const bodySource = grassTileRepeatSource(
      grassTile.naturalWidth,
      grassTile.naturalHeight,
    );
    if (bodySource) {
      drawTiledBand(
        ctx,
        grassTile,
        0,
        grassTop,
        canvasW,
        grassHeight,
        grassScroll,
        bodySource,
      );
    }
  }

  drawHorizonBlend(ctx, canvasW, skyGroundSeamY);
}

void preloadBattleFieldBackground();
