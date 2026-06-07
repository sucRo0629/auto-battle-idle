import type { BattlePhase } from "../battle/types.ts";

const FADE_IN_MS = 600;
const FADE_OUT_MS = 500;
const BASE_FONT_SIZE = 48;
const TEXT = "Victory";

type OverlayPhase = "idle" | "visible" | "fadingOut" | "done";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export class VictoryOverlay {
  private phase: OverlayPhase = "idle";
  private elapsedMs = 0;

  syncPhase(phase: BattlePhase, alliesOffScreen: boolean): void {
    if (phase !== "victory") {
      this.phase = "idle";
      this.elapsedMs = 0;
      return;
    }

    if (this.phase === "idle") {
      this.phase = "visible";
      this.elapsedMs = 0;
    }

    if (this.phase === "visible" && alliesOffScreen) {
      this.phase = "fadingOut";
      this.elapsedMs = 0;
    }
  }

  tick(deltaMs: number): void {
    if (this.phase === "idle" || this.phase === "done") return;

    this.elapsedMs += deltaMs;

    if (this.phase === "fadingOut" && this.elapsedMs >= FADE_OUT_MS) {
      this.phase = "done";
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    fontFamily: string,
  ): void {
    if (this.phase === "idle" || this.phase === "done") return;

    let alpha = 0;
    let scale = 1.05;

    if (this.phase === "visible") {
      const fadeIn = clamp01(this.elapsedMs / FADE_IN_MS);
      const eased = easeOutCubic(fadeIn);
      alpha = eased;
      scale = 0.45 + 0.6 * eased;
    } else {
      const fadeOut = clamp01(this.elapsedMs / FADE_OUT_MS);
      alpha = 1 - easeOutCubic(fadeOut);
      scale = 1.05 + 0.25 * easeOutCubic(fadeOut);
    }

    if (alpha <= 0) return;

    const centerX = width / 2;
    const centerY = height * 0.38;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.font = `bold ${BASE_FONT_SIZE}px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
    ctx.strokeText(TEXT, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(TEXT, 0, 0);
    ctx.restore();
  }
}
