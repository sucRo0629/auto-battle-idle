import type { CombatantLayout } from "./IBattleRenderer.ts";
import type { BattleHudTheme } from "./battleHudTheme.ts";
import { resolveCombatantSpriteBounds } from "./battleCanvasHitTest.ts";
import { SPRITE_LAYOUT_SIZE } from "./spriteLayout.ts";

function parseCssColor(color: string): { r: number; g: number; b: number; a: number } {
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

export function drawHoverHighlightForLayout(
  ctx: CanvasRenderingContext2D,
  layout: CombatantLayout,
  scale: number,
  theme: BattleHudTheme,
): void {
  const bounds = resolveCombatantSpriteBounds(layout, scale);
  const pad = 2;
  const outline = parseCssColor(theme.hoverHighlightOutline);
  const glow = parseCssColor(theme.hoverHighlightGlow);

  ctx.save();
  ctx.strokeStyle = `rgba(${outline.r}, ${outline.g}, ${outline.b}, ${outline.a})`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 2]);
  ctx.strokeRect(
    bounds.left - pad,
    bounds.top - pad,
    bounds.width + pad * 2,
    bounds.height + pad * 2,
  );

  ctx.shadowColor = `rgba(${glow.r}, ${glow.g}, ${glow.b}, ${glow.a})`;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = `rgba(${glow.r}, ${glow.g}, ${glow.b}, ${Math.min(1, glow.a + 0.15)})`;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeRect(
    bounds.left - 1,
    bounds.top - 1,
    bounds.width + 2,
    bounds.height + 2,
  );
  ctx.restore();
}

export function drawTargetIndicatorForLayout(
  ctx: CanvasRenderingContext2D,
  layout: CombatantLayout,
  scale: number,
  theme: BattleHudTheme,
): void {
  const size = SPRITE_LAYOUT_SIZE * scale;
  const bounds = resolveCombatantSpriteBounds(layout, scale);
  const centerX = bounds.left + size / 2;
  const footY = bounds.top + size;
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
  ctx.ellipse(centerX, footY + 2, ringWidth / 2 - 2, Math.max(4, ringHeight / 2 - 1), 0, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${highlight.r}, ${highlight.g}, ${highlight.b}, ${theme.attackOrbHighlightAlpha})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  const markerSize = 5;
  ctx.strokeStyle = `rgba(${highlight.r}, ${highlight.g}, ${highlight.b}, ${Math.min(1, theme.attackOrbHighlightAlpha + 0.2)})`;
  ctx.lineWidth = 1.5;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const cornerX = centerX + dx * (ringWidth / 2 + 2);
    const cornerY = bounds.top + bounds.height / 2 + dy * (bounds.height / 2 - markerSize);
    ctx.beginPath();
    ctx.moveTo(cornerX, cornerY);
    ctx.lineTo(cornerX + dx * markerSize, cornerY);
    ctx.moveTo(cornerX, cornerY);
    ctx.lineTo(cornerX, cornerY + dy * markerSize);
    ctx.stroke();
  }

  ctx.restore();
}
