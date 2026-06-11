import type { CombatantLayout } from "./IBattleRenderer.ts";
import type { BattleHudTheme } from "./battleHudTheme.ts";
import { getPlaceholderSpriteYOffset } from "./placeholderSpriteAnim.ts";

const POPUP_DURATION_MS = 800;
const FADE_IN_END = 0.15;
const ZOOM_IN_END = 0.2;
/** 拡大フェーズの 5 倍の長さで縮小する */
const ZOOM_OUT_END = ZOOM_IN_END * 5;
const START_SCALE = 0.3;
const END_SCALE = 1;
const ORIGIN_JITTER_X = 20;
const ORIGIN_JITTER_Y = 20;
const DOT_FALL_DELAY_MIN_MS = 80;
const DOT_FALL_DELAY_MAX_MS = 240;
const DOT_FALL_DISTANCE = 52;

type PopupKind = "damage" | "dot" | "heal";

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInQuad(t: number): number {
  return t * t;
}

function popupAlpha(progress: number): number {
  if (progress < FADE_IN_END) {
    return progress / FADE_IN_END;
  }
  if (progress >= ZOOM_IN_END) {
    const t = Math.min(1, (progress - ZOOM_IN_END) / ZOOM_OUT_END);
    return 1 - easeInQuad(t);
  }
  return 1;
}

function popupScale(progress: number): number {
  if (progress < ZOOM_IN_END) {
    const t = easeOutCubic(progress / ZOOM_IN_END);
    return START_SCALE + t * (END_SCALE - START_SCALE);
  }
  const zoomOutEnd = ZOOM_IN_END + ZOOM_OUT_END;
  if (progress < zoomOutEnd) {
    const t = easeOutCubic((progress - ZOOM_IN_END) / ZOOM_OUT_END);
    return END_SCALE + t * (START_SCALE - END_SCALE);
  }
  return START_SCALE;
}

function dotFallOffsetY(
  elapsedMs: number,
  delayMs: number,
  speedFactor: number
): number {
  const fallElapsed = elapsedMs - delayMs;
  if (fallElapsed <= 0) return 0;
  const fallDuration = Math.max(1, POPUP_DURATION_MS - delayMs);
  const progress = Math.min(1, fallElapsed / fallDuration);
  return easeInQuad(progress) * DOT_FALL_DISTANCE * speedFactor;
}

interface PopupEntry {
  targetId: string;
  amount: number;
  kind: PopupKind;
  elapsedMs: number;
  offsetX: number;
  offsetY: number;
  dotFallDelayMs: number;
  dotFallSpeed: number;
}

export class DamagePopupManager {
  private popups: PopupEntry[] = [];

  spawn(targetId: string, amount: number, kind: PopupKind = "damage"): void {
    this.popups.push({
      targetId,
      amount,
      kind,
      elapsedMs: 0,
      offsetX: (Math.random() - 0.5) * ORIGIN_JITTER_X,
      offsetY: (Math.random() - 0.5) * ORIGIN_JITTER_Y,
      dotFallDelayMs:
        kind === "dot"
          ? DOT_FALL_DELAY_MIN_MS +
            Math.random() * (DOT_FALL_DELAY_MAX_MS - DOT_FALL_DELAY_MIN_MS)
          : 0,
      dotFallSpeed: kind === "dot" ? 0.75 + Math.random() * 0.5 : 1,
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
    theme: BattleHudTheme
  ): void {
    for (const popup of this.popups) {
      const layout = layouts.find((l) => l.id === popup.targetId);
      if (!layout) continue;

      const progress = popup.elapsedMs / POPUP_DURATION_MS;
      const alpha = popupAlpha(progress);
      const popupScaleValue = popupScale(progress);
      const bob = getPlaceholderSpriteYOffset(layout, scale);
      const fallY =
        popup.kind === "dot"
          ? dotFallOffsetY(
              popup.elapsedMs,
              popup.dotFallDelayMs,
              popup.dotFallSpeed
            )
          : 0;
      const centerX = layout.x + spriteSize / 2 + popup.offsetX;
      const centerY = layout.y + bob + spriteSize / 2 + popup.offsetY + fallY;

      const text =
        popup.kind === "heal" ? `${popup.amount}` : String(popup.amount);
      const fill =
        popup.kind === "heal"
          ? theme.popupHealFill
          : popup.kind === "dot"
          ? theme.popupDotFill
          : theme.popupDamageFill;
      const stroke =
        popup.kind === "heal"
          ? theme.popupHealStroke
          : popup.kind === "dot"
          ? theme.popupDotStroke
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
