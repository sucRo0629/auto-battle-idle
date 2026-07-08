import type { CombatantLayout } from "./IBattleRenderer.ts";
import type { BattleHudTheme } from "./battleHudTheme.ts";
import {
  drawCombatantSpriteAtFootAnchor,
  resolveCombatantSpriteDrawMetrics,
} from "./combatantSpriteFootDraw.ts";
import {
  computeSpriteDrawHeight,
  computeSpriteHeadTopY,
} from "./damagePopupLayout.ts";
import {
  drawHoverSilhouetteOutlineGlow,
  parseCssColor,
} from "./hoverHighlightOutlineGlow.ts";
import { SPRITE_LAYOUT_SIZE } from "./spriteLayout.ts";
import { spriteDrawY } from "./spriteVisualDepth.ts";

export { parseCssColor };

export function drawHoverHighlightForLayout(
  ctx: CanvasRenderingContext2D,
  layout: CombatantLayout,
  scale: number,
  theme: BattleHudTheme,
  destLeft: number,
  destTop: number,
  elapsedMs: number,
): void {
  const { layoutSize, bufferSize } = resolveCombatantSpriteDrawMetrics(
    layout,
    scale,
  );
  const outline = parseCssColor(theme.hoverHighlightOutline);
  const glow = parseCssColor(theme.hoverHighlightGlow);

  drawHoverSilhouetteOutlineGlow({
    targetCtx: ctx,
    bufferSize,
    layoutSize,
    destLeft,
    destTop,
    elapsedMs,
    outlineColor: outline,
    glowColor: glow,
    drawSpriteToBuffer: (bufferCtx, footX, footY) => {
      const { layoutSize, offsetY } = resolveCombatantSpriteDrawMetrics(
        layout,
        scale,
      );
      drawCombatantSpriteAtFootAnchor(
        bufferCtx,
        layout,
        scale,
        theme,
        footX - layoutSize / 2,
        footY - layoutSize - offsetY,
      );
    },
  });
}

/** Vertical bob offset for the target arrow (px). */
export function resolveTargetIndicatorBobOffsetY(
  elapsedMs: number,
  amplitude: number,
  periodMs: number,
): number {
  if (periodMs <= 0 || amplitude === 0) return 0;
  const phase = (elapsedMs / periodMs) * Math.PI * 2;
  return Math.sin(phase) * amplitude;
}

export function drawTargetIndicatorForLayout(
  ctx: CanvasRenderingContext2D,
  layout: CombatantLayout,
  scale: number,
  theme: BattleHudTheme,
  elapsedMs: number,
): void {
  const size = SPRITE_LAYOUT_SIZE * scale;
  const { offsetY } = resolveCombatantSpriteDrawMetrics(layout, scale);
  const destTop = spriteDrawY(layout) + offsetY;
  const drawH = computeSpriteDrawHeight(layout, scale);
  const headTopY = computeSpriteHeadTopY(spriteDrawY(layout), offsetY, size, drawH);
  const centerX = layout.x + size / 2;
  const footY = destTop + size;
  const ringWidth = size * 0.72;
  const ringHeight = Math.max(6, size * 0.16);
  const orb = parseCssColor(theme.attackOrbFill);
  const highlight = parseCssColor(theme.attackOrbHighlight);

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(centerX, footY + 2, ringWidth / 2, ringHeight / 2, 0, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${orb.r}, ${orb.g}, ${orb.b}, ${theme.attackOrbAlpha})`;
  ctx.lineWidth = theme.targetIndicatorRingWidth;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(
    centerX,
    footY + 2,
    ringWidth / 2 - 2,
    Math.max(4, ringHeight / 2 - 1),
    0,
    0,
    Math.PI * 2,
  );
  ctx.strokeStyle = `rgba(${highlight.r}, ${highlight.g}, ${highlight.b}, ${theme.attackOrbHighlightAlpha})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  const arrowWidth = theme.targetIndicatorArrowWidth * scale;
  const arrowHeight = theme.targetIndicatorArrowHeight * scale;
  const gap = theme.targetIndicatorArrowGap * scale;
  const bobY = resolveTargetIndicatorBobOffsetY(
    elapsedMs,
    theme.targetIndicatorBobAmplitude * scale,
    theme.targetIndicatorBobPeriodMs,
  );
  const tipY =
    Math.round(
      headTopY - gap + bobY + theme.targetIndicatorArrowOffsetY,
    ) + 0.5;
  const halfWidth = arrowWidth / 2;
  const baseY = tipY - arrowHeight;
  const fill = parseCssColor(theme.targetIndicatorArrowFill);

  ctx.fillStyle = `rgba(${fill.r}, ${fill.g}, ${fill.b}, ${fill.a})`;
  ctx.beginPath();
  ctx.moveTo(Math.round(centerX) + 0.5, tipY);
  ctx.lineTo(Math.round(centerX - halfWidth) + 0.5, baseY);
  ctx.lineTo(Math.round(centerX + halfWidth) + 0.5, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
