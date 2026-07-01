import { clampCombatDisplayX } from "../battle/combatSafeArea.ts";
import type { CombatantLayout } from "./IBattleRenderer.ts";
import type { BattleHudTheme } from "./battleHudTheme.ts";
import {
  BATTLE_POPUP_DURATION_MS,
  computeBattlePopupAlpha,
  computeBattlePopupScale,
} from "./battlePopupMotion.ts";
import { getPlaceholderSpriteYOffset } from "./placeholderSpriteAnim.ts";
import { spriteDrawY } from "./spriteVisualDepth.ts";

export const COMBAT_REACTION_POPUP_DURATION_MS = BATTLE_POPUP_DURATION_MS;
const HEAD_LABEL_OFFSET_Y = -4;

export type CombatReactionKind =
  | "evade"
  | "block"
  | "counter"
  | "invulnerable"
  | "lastStandRecovery"
  | "lastStandGuts"
  | "enemyReelIn"
  | "knockback"
  | "lowHpCover";

const REACTION_TEXT: Record<CombatReactionKind, string> = {
  evade: "回避！",
  block: "ブロック！",
  counter: "反撃！",
  invulnerable: "無敵！",
  lastStandRecovery: "再起！",
  lastStandGuts: "不屈！",
  enemyReelIn: "引き寄せ！",
  knockback: "ノックバック！",
  lowHpCover: "肩代わり！",
};

export function getCombatReactionText(kind: CombatReactionKind): string {
  return REACTION_TEXT[kind];
}

interface ReactionEntry {
  targetId: string;
  kind: CombatReactionKind;
  elapsedMs: number;
}

export class CombatReactionPopupManager {
  private popups: ReactionEntry[] = [];

  spawn(targetId: string, kind: CombatReactionKind): void {
    const hasActive = this.popups.some(
      (popup) => popup.targetId === targetId && popup.kind === kind,
    );
    if (hasActive) return;

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
    this.popups = this.popups.filter(
      (p) => p.elapsedMs < BATTLE_POPUP_DURATION_MS,
    );
  }

  draw(
    ctx: CanvasRenderingContext2D,
    layouts: CombatantLayout[],
    spriteSize: number,
    scale: number,
    theme: BattleHudTheme,
  ): void {
    if (this.popups.length === 0) return;

    ctx.font = `${theme.popupFontSize}px ${theme.popupFontFamily}`;

    for (const popup of this.popups) {
      const layout = layouts.find((l) => l.id === popup.targetId);
      if (!layout) continue;

      const progress = popup.elapsedMs / BATTLE_POPUP_DURATION_MS;
      const alpha = computeBattlePopupAlpha(progress);
      const popupScaleValue = computeBattlePopupScale(progress);
      const bob = getPlaceholderSpriteYOffset(layout, scale);
      const text = getCombatReactionText(popup.kind);
      const rawCenterX = layout.x + spriteSize / 2;
      const rawAnchorY = spriteDrawY(layout) + bob + HEAD_LABEL_OFFSET_Y;

      ctx.save();
      const centerX = clampCombatDisplayX(
        rawCenterX,
        (ctx.measureText(text).width * popupScaleValue) / 2,
      );
      const anchorY = rawAnchorY;
      ctx.translate(centerX, anchorY);
      ctx.scale(popupScaleValue, popupScaleValue);
      ctx.globalAlpha = alpha;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = theme.popupDamageStroke;
      ctx.lineWidth = theme.popupOutlineWidth;
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = theme.popupDamageFill;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }
}
