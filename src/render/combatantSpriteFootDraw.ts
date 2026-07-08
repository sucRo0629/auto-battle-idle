import type { CombatantLayout } from "./IBattleRenderer.ts";
import {
  resolveSpritePlaceholderColor,
  type BattleHudTheme,
} from "./battleHudTheme.ts";
import {
  getDeathPlaceholderTransform,
  getPlaceholderSpriteYOffset,
} from "./placeholderSpriteAnim.ts";
import {
  drawSkillAnimAtFootAnchor,
  drawSpriteFrameAtFootAnchor,
  hasEntityAnimSheet,
} from "./spriteFrameDraw.ts";
import { getSheetCellSize, SPRITE_LAYOUT_SIZE } from "./spriteLayout.ts";

export interface CombatantSpriteDrawMetrics {
  layoutSize: number;
  bufferSize: number;
  offsetY: number;
}

export function resolveCombatantSpriteDrawMetrics(
  layout: CombatantLayout,
  scale: number,
): CombatantSpriteDrawMetrics {
  const layoutSize = SPRITE_LAYOUT_SIZE * scale;
  const showingSkillAnim = layout.skillAnimKey !== null;
  const offsetY =
    showingSkillAnim ||
    hasEntityAnimSheet(
      layout.spriteKey,
      layout.anim,
      layout.attackSheetKey,
    )
      ? 0
      : getPlaceholderSpriteYOffset(layout, scale);
  const bufferSize = Math.ceil(
    Math.max(layoutSize, getSheetCellSize(layout.spriteKey, layout.anim) * scale),
  );

  return { layoutSize, bufferSize, offsetY };
}

export interface CombatantSpriteFootDrawOptions {
  deathAlpha?: number | null;
}

/**
 * Draw a combatant sprite with the same foot-anchor transforms as BattleCanvas.
 */
export function drawCombatantSpriteAtFootAnchor(
  ctx: CanvasRenderingContext2D,
  layout: CombatantLayout,
  scale: number,
  theme: BattleHudTheme,
  destLeft: number,
  destTop: number,
  options?: CombatantSpriteFootDrawOptions,
): void {
  const { layoutSize, offsetY } = resolveCombatantSpriteDrawMetrics(layout, scale);
  const flipSpriteHorizontal = layout.isEnemy
    ? layout.facingSign === undefined || layout.facingSign < 0
    : layout.facingSign !== undefined && layout.facingSign < 0;
  const deathTransform =
    layout.anim === "death" &&
    !hasEntityAnimSheet(layout.spriteKey, "death")
      ? getDeathPlaceholderTransform(layout.id, layout)
      : null;

  ctx.save();

  if (deathTransform) {
    const pivotX = destLeft + layoutSize / 2;
    const pivotY = destTop + offsetY + layoutSize;
    ctx.translate(pivotX, pivotY);
    ctx.rotate(deathTransform.rotationRad);
    ctx.translate(-layoutSize / 2, -layoutSize);
    if (flipSpriteHorizontal) {
      ctx.translate(layoutSize, 0);
      ctx.scale(-1, 1);
    }
    if (options?.deathAlpha != null) {
      ctx.globalAlpha = options.deathAlpha;
    }
  } else {
    ctx.translate(destLeft + (flipSpriteHorizontal ? layoutSize : 0), destTop + offsetY);
    if (flipSpriteHorizontal) {
      ctx.scale(-1, 1);
    }
    if (!layout.isAlive) {
      ctx.globalAlpha = theme.deadAlpha;
    }
  }

  const footX = layoutSize / 2;
  const footY = layoutSize;
  const placeholderColor = resolveSpritePlaceholderColor(
    layout.spriteKey,
    theme,
  );

  if (layout.skillAnimKey) {
    drawSkillAnimAtFootAnchor(
      ctx,
      layout.skillAnimKey,
      layout.skillAnimFrame,
      footX,
      footY,
      scale,
    );
  } else {
    drawSpriteFrameAtFootAnchor(
      ctx,
      layout.spriteKey,
      layout.anim,
      layout.animFrame,
      footX,
      footY,
      layoutSize,
      layoutSize,
      scale,
      placeholderColor,
      layout.attackSheetKey,
    );
  }

  ctx.restore();
}
