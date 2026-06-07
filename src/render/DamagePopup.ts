import type { CombatantLayout } from "./IBattleRenderer.ts";
import type { BattleHudTheme } from "./battleHudTheme.ts";
import { getPlaceholderSpriteYOffset } from "./placeholderSpriteAnim.ts";

const POPUP_DURATION_MS = 800;
const FADE_IN_END = 0.15;
const FADE_OUT_START = 0.5;
const ZOOM_IN_END = 0.35;
const START_SCALE = 0.4;
const END_SCALE = 1;
const ORIGIN_Y_JITTER = 16;

type PopupKind = "damage" | "heal";

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function popupAlpha(progress: number): number {
  if (progress < FADE_IN_END) {
    return progress / FADE_IN_END;
  }
  if (progress > FADE_OUT_START) {
    return 1 - (progress - FADE_OUT_START) / (1 - FADE_OUT_START);
  }
  return 1;
}

function popupScale(progress: number): number {
  if (progress < ZOOM_IN_END) {
    const t = easeOutCubic(progress / ZOOM_IN_END);
    return START_SCALE + t * (END_SCALE - START_SCALE);
  }
  if (progress > FADE_OUT_START) {
    const t = (progress - FADE_OUT_START) / (1 - FADE_OUT_START);
    return END_SCALE + t * 0.15;
  }
  return END_SCALE;
}

interface PopupEntry {
  targetId: string;
  amount: number;
  kind: PopupKind;
  elapsedMs: number;
  offsetY: number;
}

export class DamagePopupManager {
  private popups: PopupEntry[] = [];

  spawn(targetId: string, amount: number, kind: PopupKind = "damage"): void {
    this.popups.push({
      targetId,
      amount,
      kind,
      elapsedMs: 0,
      offsetY: (Math.random() - 0.5) * ORIGIN_Y_JITTER,
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
    scale: number,
    theme: BattleHudTheme,
  ): void {
    for (const popup of this.popups) {
      const layout = layouts.find((l) => l.id === popup.targetId);
      if (!layout) continue;

      const progress = popup.elapsedMs / POPUP_DURATION_MS;
      const alpha = popupAlpha(progress);
      const popupScaleValue = popupScale(progress);
      const bob = getPlaceholderSpriteYOffset(layout, scale);
      const centerX = layout.x + spriteSize / 2;
      const centerY = layout.y + bob + spriteSize / 2 + popup.offsetY;

      const text =
        popup.kind === "heal" ? `${popup.amount}` : String(popup.amount);
      const fill =
        popup.kind === "heal" ? theme.popupHealFill : theme.popupDamageFill;
      const stroke =
        popup.kind === "heal"
          ? theme.popupHealStroke
          : theme.popupDamageStroke;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(popupScaleValue, popupScaleValue);
      ctx.globalAlpha = alpha;
      ctx.font = `${theme.popupFontSize}px ${theme.popupFontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = theme.popupOutlineWidth;
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = fill;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }
}
