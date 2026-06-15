import {
  ANIM_DEFS,
  getSpriteImage,
  type AnimState,
} from "./SpriteRegistry.ts";
import {
  getEntityBodyImage,
  getEntityFrameRect,
  hasEntityBodyAtlas,
  type EntityBodyAnim,
} from "./entityAtlas.ts";
import {
  getSkillAnimImage,
} from "./skillAnimRegistry.ts";
import {
  getSpriteSheetImage,
  hasSpriteSheetAnimation,
} from "./spriteSheetRegistry.ts";
import {
  getSheetCellHeight,
  getSheetCellWidth,
  SKILL_ANIM_CELL_HEIGHT,
  SKILL_ANIM_CELL_WIDTH,
} from "./spriteLayout.ts";

/** body atlas または旧 `sheets/{id}/{anim}.png` が idle/move/death 用にあるか */
export function hasEntityAnimSheet(
  spriteKey: string,
  anim: AnimState,
  attackSheetKey = "attack",
): boolean {
  if (anim === "idle" || anim === "move" || anim === "death") {
    if (hasEntityBodyAtlas(spriteKey)) return true;
  }
  return hasSpriteSheetAnimation(spriteKey, anim, attackSheetKey);
}

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

  if (anim !== "attack" && hasEntityBodyAtlas(spriteKey)) {
    const sheet = getEntityBodyImage(spriteKey);
    if (sheet) {
      const rect = getEntityFrameRect(spriteKey, anim as EntityBodyAnim, frame);
      const drawW = rect.sw * scale;
      const drawH = rect.sh * scale;
      ctx.drawImage(
        sheet,
        rect.sx,
        rect.sy,
        rect.sw,
        rect.sh,
        footX - drawW / 2,
        footY - drawH,
        drawW,
        drawH,
      );
      return;
    }
  }

  if (hasSpriteSheetAnimation(spriteKey, anim, attackSheetKey)) {
    const sheet = getSpriteSheetImage(spriteKey, entitySheetKey);
    if (sheet) {
      const cellW = getSheetCellWidth(spriteKey, anim);
      const cellH = getSheetCellHeight(spriteKey);
      const def = ANIM_DEFS[anim];
      const clampedFrame = Math.min(Math.max(0, frame), def.frames - 1);
      const srcX = clampedFrame * cellW;
      const drawW = cellW * scale;
      const drawH = cellH * scale;
      ctx.drawImage(
        sheet,
        srcX,
        0,
        cellW,
        cellH,
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

  const cellW = SKILL_ANIM_CELL_WIDTH;
  const cellH = SKILL_ANIM_CELL_HEIGHT;
  const frameCount = Math.max(1, Math.floor(sheet.width / cellW));
  const clampedFrame = Math.min(Math.max(0, frame), frameCount - 1);
  const srcX = clampedFrame * cellW;
  const drawW = cellW * scale;
  const drawH = cellH * scale;

  ctx.drawImage(
    sheet,
    srcX,
    0,
    cellW,
    cellH,
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
