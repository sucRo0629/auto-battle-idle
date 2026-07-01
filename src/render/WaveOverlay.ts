import type { BattleHudTheme } from "./battleHudTheme.ts";
import {
  ANNOUNCEMENT_FADE_IN_MS,
  ANNOUNCEMENT_FADE_OUT_MS,
  ANNOUNCEMENT_HOLD_MS,
  ANNOUNCEMENT_TOTAL_MS,
} from "./announcementOverlayTiming.ts";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function isWaveAnnouncementShowing(elapsedMs: number): boolean {
  return elapsedMs > 0 && elapsedMs < ANNOUNCEMENT_TOTAL_MS;
}

export class WaveOverlay {
  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    theme: BattleHudTheme,
    waveIndex: number,
    elapsedMs: number,
  ): void {
    if (!isWaveAnnouncementShowing(elapsedMs)) return;

    let alpha = 0;
    let scale = 1.05;

    if (elapsedMs <= ANNOUNCEMENT_FADE_IN_MS + ANNOUNCEMENT_HOLD_MS) {
      const fadeIn = clamp01(elapsedMs / ANNOUNCEMENT_FADE_IN_MS);
      const eased = easeOutCubic(fadeIn);
      alpha = eased;
      scale = 0.45 + 0.6 * eased;
    } else {
      const fadeOutElapsed = elapsedMs - ANNOUNCEMENT_FADE_IN_MS - ANNOUNCEMENT_HOLD_MS;
      const fadeOut = clamp01(fadeOutElapsed / ANNOUNCEMENT_FADE_OUT_MS);
      alpha = 1 - easeOutCubic(fadeOut);
      scale = 1.05 + 0.25 * easeOutCubic(fadeOut);
    }

    if (alpha <= 0) return;

    const text = `Wave ${waveIndex + 1}`;
    const centerX = width / 2;
    const centerY = height * 0.38;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.font = `bold ${theme.victoryFontSize}px ${theme.overlayFontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = theme.victoryOutlineWidth;
    ctx.strokeStyle = theme.victoryStroke;
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = theme.victoryFill;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
}
