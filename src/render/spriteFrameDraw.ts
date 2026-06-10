import {
  ANIM_DEFS,
  getSpriteImage,
  type AnimState,
} from "./SpriteRegistry.ts";
import {
  getSkillAnimImage,
} from "./skillAnimRegistry.ts";
import {
  getSpriteSheetImage,
  hasSpriteSheetAnimation,
} from "./spriteSheetRegistry.ts";
import { getSheetCellSize, SPRITE_SHEET_CELL_SIZE } from "./spriteLayout.ts";

/**
 * 足元中央 (footX, footY) を基準に entity スプライトを描画。
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
  attackSheetKey = "attack",
): void {
  const entitySheetKey = anim === "attack" ? attackSheetKey : anim;

  if (hasSpriteSheetAnimation(spriteKey, anim, attackSheetKey)) {
    const sheet = getSpriteSheetImage(spriteKey, entitySheetKey);
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

export function drawSkillAnimAtFootAnchor(
  ctx: CanvasRenderingContext2D,
  skillAnimKey: string,
  frame: number,
  footX: number,
  footY: number,
  scale: number,
): void {
  const sheet = getSkillAnimImage(skillAnimKey);
  if (!sheet) return;

  const cellSize = SPRITE_SHEET_CELL_SIZE;
  const frameCount = Math.max(1, Math.floor(sheet.width / cellSize));
  const clampedFrame = Math.min(Math.max(0, frame), frameCount - 1);
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
