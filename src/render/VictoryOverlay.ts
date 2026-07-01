import type { BattlePhase } from "../battle/types.ts";
import type { BattleHudTheme } from "./battleHudTheme.ts";

const FADE_IN_MS = 600;
const FADE_OUT_MS = 500;
/** BattleEngine RESTART_DELAY_SEC (3s) − FADE_OUT_MS */
const DEFEAT_HOLD_MS = 2500;

type OverlayPhase = "idle" | "visible" | "fadingOut" | "done";
type ResultPhase = "victory" | "defeat";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export class VictoryOverlay {
  private phase: OverlayPhase = "idle";
  private elapsedMs = 0;
  private resultPhase: ResultPhase | null = null;
  private victoryUseTimerFade = false;

  isIdle(): boolean {
    return this.phase === "idle";
  }

  isShowing(): boolean {
    return this.phase === "visible" || this.phase === "fadingOut";
  }

  syncPhase(
    phase: BattlePhase,
    alliesOffScreen: boolean,
    victoryUseTimerFade = false,
    victoryAwaitExitMarch = false,
  ): void {
    if (phase !== "victory" && phase !== "defeat") {
      this.phase = "idle";
      this.elapsedMs = 0;
      this.resultPhase = null;
      this.victoryUseTimerFade = false;
      return;
    }

    this.resultPhase = phase;
    this.victoryUseTimerFade = victoryUseTimerFade;

    if (this.phase === "idle") {
      const waitForExitMarch =
        phase === "victory" && victoryAwaitExitMarch && !alliesOffScreen;
      if (!waitForExitMarch) {
        this.phase = "visible";
        this.elapsedMs = 0;
      }
    }
  }

  tick(deltaMs: number): void {
    if (this.phase === "idle" || this.phase === "done") return;

    this.elapsedMs += deltaMs;

    if (
      this.phase === "visible" &&
      this.resultPhase === "victory" &&
      this.victoryUseTimerFade &&
      this.elapsedMs >= DEFEAT_HOLD_MS
    ) {
      this.phase = "fadingOut";
      this.elapsedMs = 0;
    }

    if (
      this.phase === "visible" &&
      this.resultPhase === "defeat" &&
      this.elapsedMs >= DEFEAT_HOLD_MS
    ) {
      this.phase = "fadingOut";
      this.elapsedMs = 0;
    }

    if (this.phase === "fadingOut" && this.elapsedMs >= FADE_OUT_MS) {
      this.phase = "done";
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    theme: BattleHudTheme,
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

    if (alpha <= 0 || this.resultPhase === null) return;

    const text = this.resultPhase === "defeat" ? "Defeat" : "Victory";
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
