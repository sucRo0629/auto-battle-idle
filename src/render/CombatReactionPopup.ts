import type { CombatantLayout } from "./IBattleRenderer.ts";
import type { BattleHudTheme } from "./battleHudTheme.ts";
import { getPlaceholderSpriteYOffset } from "./placeholderSpriteAnim.ts";

const POPUP_DURATION_MS = 800;
const FADE_IN_END = 0.15;
const FADE_OUT_START = 0.5;
const ZOOM_IN_END = 0.35;
const START_SCALE = 0.4;
const END_SCALE = 1;
const HEAD_LABEL_OFFSET_Y = -4;

export type CombatReactionKind = "evade" | "block";

const REACTION_TEXT: Record<CombatReactionKind, string> = {
  evade: "回避！",
  block: "ブロック！",
};

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

interface ReactionEntry {
  targetId: string;
  kind: CombatReactionKind;
  elapsedMs: number;
}

export class CombatReactionPopupManager {
  private popups: ReactionEntry[] = [];

  spawn(targetId: string, kind: CombatReactionKind): void {
    this.popups.push({
      targetId,
      kind,
      elapsedMs: 0,
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
    const fontSize = Math.max(8, Math.round(theme.headerFontSize)) + 4;

    for (const popup of this.popups) {
      const layout = layouts.find((l) => l.id === popup.targetId);
      if (!layout) continue;

      const progress = popup.elapsedMs / POPUP_DURATION_MS;
      const alpha = popupAlpha(progress);
      const popupScaleValue = popupScale(progress);
      const bob = getPlaceholderSpriteYOffset(layout, scale);
      const centerX = layout.x + spriteSize / 2;
      const centerY = layout.y + bob + HEAD_LABEL_OFFSET_Y;

      const text = REACTION_TEXT[popup.kind];

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(popupScaleValue, popupScaleValue);
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${fontSize}px ${theme.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = theme.nameColor;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }
}
