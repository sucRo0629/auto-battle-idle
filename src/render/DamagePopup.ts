import type { CombatantLayout } from "./IBattleRenderer.ts";
import { battleCanvasHeight } from "./formationLayout.ts";
import { getPlaceholderSpriteYOffset } from "./placeholderSpriteAnim.ts";

const POPUP_DURATION_MS = 800;
const BATTLE_CANVAS_HEIGHT = battleCanvasHeight(1);
const RISE_HEIGHT_RATIO = 25 / BATTLE_CANVAS_HEIGHT;
const FONT_SIZE = 18;
const POPUP_TOP_MARGIN = 2;
const OUTLINE_WIDTH = 1;

const POPUP_COLORS = {
  damage: { fill: "#fff", stroke: "#000" },
  heal: { fill: "#2ecc71", stroke: "#1a3d24" },
} as const;

type PopupKind = keyof typeof POPUP_COLORS;

function computeRisePx(startBottomY: number, canvasHeight: number): number {
  const risePx = canvasHeight * RISE_HEIGHT_RATIO;
  const maxRise = Math.max(0, startBottomY - FONT_SIZE - POPUP_TOP_MARGIN);
  return Math.min(risePx, maxRise);
}

interface PopupEntry {
  targetId: string;
  amount: number;
  kind: PopupKind;
  elapsedMs: number;
  offsetX: number;
}

export class DamagePopupManager {
  private popups: PopupEntry[] = [];

  spawn(targetId: string, amount: number, kind: PopupKind = "damage"): void {
    this.popups.push({
      targetId,
      amount,
      kind,
      elapsedMs: 0,
      offsetX: (Math.random() - 0.5) * 30,
    });
  }

  tick(deltaMs: number): void {
    for (const popup of this.popups) {
      popup.elapsedMs += deltaMs;
    }
    this.popups = this.popups.filter((p) => p.elapsedMs < POPUP_DURATION_MS);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    layouts: CombatantLayout[],
    spriteSize: number,
    scale: number
  ): void {
    const canvasHeight = battleCanvasHeight(scale);
    for (const popup of this.popups) {
      const layout = layouts.find((l) => l.id === popup.targetId);
      if (!layout) continue;

      const progress = popup.elapsedMs / POPUP_DURATION_MS;
      const alpha = 1 - progress * progress;
      const bob = getPlaceholderSpriteYOffset(layout, scale);
      const startBottomY = layout.y + bob + 16;
      const risePx = computeRisePx(startBottomY, canvasHeight);
      const rise = progress * risePx;
      const x = layout.x + spriteSize / 2 + popup.offsetX;
      const y = startBottomY - rise;

      const text =
        popup.kind === "heal" ? `${popup.amount}` : String(popup.amount);
      const colors = POPUP_COLORS[popup.kind];
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `${FONT_SIZE}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = OUTLINE_WIDTH;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = colors.fill;
      ctx.fillText(text, x, y);
      ctx.restore();
    }
  }
}
