import type { CombatantLayout } from "./IBattleRenderer.ts";
import type { DotFlavor } from "../battle/types.ts";
import type { BattleHudTheme } from "./battleHudTheme.ts";
import {
  computeDamagePopupBaseAnchorY,
  computeDamagePopupTops,
  type DamagePopupLayoutInput,
} from "./damagePopupLayout.ts";

const POPUP_DURATION_MS = 800;
const FADE_IN_END = 0.15;
const ZOOM_IN_END = 0.2;
/** 拡大フェーズの 5 倍の長さで縮小する */
const ZOOM_OUT_END = ZOOM_IN_END * 3;
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
  dotFlavor?: DotFlavor;
  elapsedMs: number;
  offsetX: number;
  offsetY: number;
  dotFallDelayMs: number;
  dotFallSpeed: number;
}

export class DamagePopupManager {
  private popups: PopupEntry[] = [];

  spawn(
    targetId: string,
    amount: number,
    kind: PopupKind = "damage",
    dotFlavor?: DotFlavor,
  ): void {
    this.popups.push({
      targetId,
      amount,
      kind,
      dotFlavor,
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
    const drawable: {
      popup: PopupEntry;
      layout: CombatantLayout;
      index: number;
      fallY: number;
    }[] = [];

    for (let index = 0; index < this.popups.length; index++) {
      const popup = this.popups[index]!;
      const layout = layouts.find((l) => l.id === popup.targetId);
      if (!layout) continue;
      const fallY =
        popup.kind === "dot"
          ? dotFallOffsetY(
              popup.elapsedMs,
              popup.dotFallDelayMs,
              popup.dotFallSpeed
            )
          : 0;
      drawable.push({ popup, layout, index, fallY });
    }

    if (drawable.length === 0) return;

    ctx.font = `${theme.popupFontSize}px ${theme.popupFontFamily}`;
    const textHeight = theme.popupFontSize;

    const baseAnchorYById = new Map<number, number>();
    const layoutInputs: DamagePopupLayoutInput[] = [];

    for (const { popup, layout, index, fallY } of drawable) {
      const centerX = layout.x + spriteSize / 2 + popup.offsetX;
      const text =
        popup.kind === "heal" ? `${popup.amount}` : String(popup.amount);
      const textWidth = ctx.measureText(text).width;
      const baseAnchorY = computeDamagePopupBaseAnchorY(
        layout,
        spriteSize,
        scale,
        popup.offsetY,
        fallY
      );

      baseAnchorYById.set(index, baseAnchorY);
      layoutInputs.push({
        id: index,
        layoutX: layout.x,
        elapsedMs: popup.elapsedMs,
        centerX,
        textWidth,
        textHeight,
      });
    }

    const anchorYById = computeDamagePopupTops(layoutInputs, baseAnchorYById);

    for (const { popup, layout, index } of drawable) {
      const progress = popup.elapsedMs / POPUP_DURATION_MS;
      const alpha = popupAlpha(progress);
      const popupScaleValue = popupScale(progress);
      const centerX = layout.x + spriteSize / 2 + popup.offsetX;
      const anchorY = anchorYById.get(index)!;

      const text =
        popup.kind === "heal" ? `${popup.amount}` : String(popup.amount);
      const fill =
        popup.kind === "heal"
          ? theme.popupHealFill
          : popup.kind === "dot"
          ? popup.dotFlavor === "poison"
            ? theme.popupPoisonDotFill
            : theme.popupDotFill
          : theme.popupDamageFill;
      const stroke =
        popup.kind === "heal"
          ? theme.popupHealStroke
          : popup.kind === "dot"
          ? popup.dotFlavor === "poison"
            ? theme.popupPoisonDotStroke
            : theme.popupDotStroke
          : theme.popupDamageStroke;
      ctx.save();
      ctx.translate(centerX, anchorY);
      ctx.scale(popupScaleValue, popupScaleValue);
      ctx.globalAlpha = alpha;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
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
