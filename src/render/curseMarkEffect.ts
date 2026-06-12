import type { CombatantLayout } from "./IBattleRenderer.ts";
import type { BattleHudTheme } from "./battleHudTheme.ts";
import {
  CHAIN_LIGHTNING_FADE_OUT_MS,
  chainLightningFadeAlpha,
} from "./chainFade.ts";
import { getPlaceholderSpriteYOffset } from "./placeholderSpriteAnim.ts";

const CURSE_MARK_DURATION_MS = 620;
const STAGED_FADE_IN_END = 0.12;

const CURSE_MARK_TEXT = "封";

function legacyMarkAlpha(progress: number): number {
  const FADE_IN_END = 0.18;
  const FADE_OUT_START = 0.52;
  if (progress < FADE_IN_END) {
    return progress / FADE_IN_END;
  }
  if (progress > FADE_OUT_START) {
    return 1 - (progress - FADE_OUT_START) / (1 - FADE_OUT_START);
  }
  return 1;
}

function legacyMarkScale(progress: number): number {
  const FADE_IN_END = 0.18;
  const FADE_OUT_START = 0.52;
  if (progress < FADE_IN_END) {
    return 0.55 + (progress / FADE_IN_END) * 0.45;
  }
  if (progress > FADE_OUT_START) {
    const t = (progress - FADE_OUT_START) / (1 - FADE_OUT_START);
    return 1 + t * 0.12;
  }
  return 1;
}

function stagedMarkAlpha(elapsedMs: number, fadeOutElapsedMs?: number): number {
  if (fadeOutElapsedMs !== undefined) {
    return chainLightningFadeAlpha(1, fadeOutElapsedMs);
  }
  const progress = elapsedMs / (STAGED_FADE_IN_END * 1000);
  return Math.min(1, progress);
}

interface CurseMarkEntry {
  targetId: string;
  elapsedMs: number;
  stagedChain?: boolean;
  fadeOutElapsedMs?: number;
}

export interface CurseMarkSpawnOptions {
  staged?: boolean;
}

export class CurseMarkEffectManager {
  private marks: CurseMarkEntry[] = [];

  spawn(targetId: string, options?: CurseMarkSpawnOptions): void {
    this.marks = this.marks.filter((mark) => mark.targetId !== targetId);
    this.marks.push({
      targetId,
      elapsedMs: 0,
      ...(options?.staged ? { stagedChain: true } : {}),
    });
  }

  fadeOut(targetId: string): void {
    const mark = this.marks.find(
      (entry) =>
        entry.targetId === targetId && entry.fadeOutElapsedMs === undefined,
    );
    if (mark) {
      mark.fadeOutElapsedMs = 0;
    }
  }

  tick(deltaMs: number): void {
    for (const mark of this.marks) {
      if (mark.fadeOutElapsedMs !== undefined) {
        mark.fadeOutElapsedMs += deltaMs;
      } else {
        mark.elapsedMs += deltaMs;
      }
    }
    this.marks = this.marks.filter((mark) => {
      if (mark.fadeOutElapsedMs !== undefined) {
        return mark.fadeOutElapsedMs < CHAIN_LIGHTNING_FADE_OUT_MS;
      }
      if (mark.stagedChain) {
        return true;
      }
      return mark.elapsedMs < CURSE_MARK_DURATION_MS;
    });
  }

  draw(
    ctx: CanvasRenderingContext2D,
    layouts: CombatantLayout[],
    spriteSize: number,
    scale: number,
    theme: BattleHudTheme,
  ): void {
    const fontSize = Math.max(10, Math.round(theme.headerFontSize)) + 6;

    for (const mark of this.marks) {
      const layout = layouts.find((l) => l.id === mark.targetId);
      if (!layout) continue;

      const alpha = mark.stagedChain
        ? stagedMarkAlpha(mark.elapsedMs, mark.fadeOutElapsedMs)
        : legacyMarkAlpha(mark.elapsedMs / CURSE_MARK_DURATION_MS);
      const scaleValue = mark.stagedChain
        ? 1
        : legacyMarkScale(mark.elapsedMs / CURSE_MARK_DURATION_MS);
      const bob = getPlaceholderSpriteYOffset(layout, scale);
      const centerX = layout.x + spriteSize / 2;
      const centerY = layout.y + bob + spriteSize / 2;

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(scaleValue, scaleValue);
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${fontSize}px ${theme.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
      ctx.lineWidth = 2;
      ctx.strokeText(CURSE_MARK_TEXT, 0, 0);
      ctx.fillStyle = "#e74c3c";
      ctx.fillText(CURSE_MARK_TEXT, 0, 0);
      ctx.restore();
    }
  }
}
