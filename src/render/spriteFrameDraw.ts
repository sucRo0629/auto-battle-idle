import {
  ANIM_DEFS,
  getSpriteImage,
  type AnimState,
} from "./SpriteRegistry.ts";
import {
  getSpriteSheetImage,
  hasSpriteSheetAnimation,
} from "./spriteSheetRegistry.ts";
import { getSheetCellSize } from "./spriteLayout.ts";

/**
 * 足元中央 (footX, footY) を基準にスプライトを描画。
 * シートコマは layout より大きくてよい（上・左右にはみ出す）。
 */
export function drawSpriteFrameAtFootAnchor(
  ctx: CanvasRenderingContext2D,
  spriteKey: string,
  anim: AnimState,
  frame: number,
  footX: number,
  footY: number,
  layoutW: number,
  layoutH: number,
  scale: number,
  placeholderColor?: string,
): void {
  if (hasSpriteSheetAnimation(spriteKey, anim)) {
    const sheet = getSpriteSheetImage(spriteKey, anim);
    if (sheet) {
      const cellSize = getSheetCellSize(spriteKey);
      const def = ANIM_DEFS[anim];
      const clampedFrame = Math.min(Math.max(0, frame), def.frames - 1);
      const srcX = clampedFrame * cellSize;
      const drawW = cellSize * scale;
      const drawH = cellSize * scale;
      ctx.drawImage(
        sheet,
        srcX,
        0,
        cellSize,
        cellSize,
        footX - drawW / 2,
        footY - drawH,
        drawW,
        drawH,
      );
      return;
    }
  }

  const image = getSpriteImage(spriteKey);
  if (image) {
    ctx.drawImage(
      image,
      footX - layoutW / 2,
      footY - layoutH,
      layoutW,
      layoutH,
    );
    return;
  }

  if (placeholderColor) {
    ctx.fillStyle = placeholderColor;
    ctx.fillRect(footX - layoutW / 2, footY - layoutH, layoutW, layoutH);
  }
}

/**
 * バッファ内の足元中央 (bufferSize/2, bufferSize) を
 * layout 足元 (layoutSize/2, layoutSize) に合わせてそのままのサイズで貼る。
 */
export function blitSpriteBufferAtLayoutFoot(
  targetCtx: CanvasRenderingContext2D,
  buffer: HTMLCanvasElement,
  bufferSize: number,
  layoutSize: number,
): void {
  const pixelSize = Math.ceil(bufferSize);
  const destX = layoutSize / 2 - pixelSize / 2;
  const destY = layoutSize - pixelSize;
  targetCtx.drawImage(
    buffer,
    0,
    0,
    pixelSize,
    pixelSize,
    destX,
    destY,
    pixelSize,
    pixelSize,
  );
}
