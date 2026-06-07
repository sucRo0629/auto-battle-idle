import type { CombatantLayout } from "./IBattleRenderer.ts";

const POPUP_DURATION_MS = 500;
const RISE_PX = 5;
const FONT_SIZE = 20;
const OUTLINE_WIDTH = 1;

interface PopupEntry {
  targetId: string;
  amount: number;
  elapsedMs: number;
  offsetX: number;
}

export class DamagePopupManager {
  private popups: PopupEntry[] = [];

  spawn(targetId: string, amount: number): void {
    this.popups.push({
      targetId,
      amount,
      elapsedMs: 0,
      offsetX: (Math.random() - 0.5) * 20,
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
    spriteSize: number
  ): void {
    for (const popup of this.popups) {
      const layout = layouts.find((l) => l.id === popup.targetId);
      if (!layout) continue;

      const progress = popup.elapsedMs / POPUP_DURATION_MS;
      const alpha = 1 - progress * progress;
      const rise = progress * RISE_PX;
      const bob =
        layout.anim === "idle" ? Math.sin(layout.animFrame * 0.8) * 2 : 0;
      const x = layout.x + spriteSize / 2 + popup.offsetX;
      const y = layout.y + bob - rise + 16;

      const text = String(popup.amount);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `${FONT_SIZE}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = OUTLINE_WIDTH;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, x, y);
      ctx.restore();
    }
  }
}
