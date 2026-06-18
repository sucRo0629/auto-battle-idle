import type { SkillVfxDef } from "../battle/types.ts";
import type { CombatantLayout } from "./IBattleRenderer.ts";
import type { BattleHudTheme } from "./battleHudTheme.ts";
import { spriteDrawY } from "./spriteVisualDepth.ts";
import {
  CHAIN_LIGHTNING_FADE_OUT_MS,
  chainSegmentFadeAlpha,
} from "./chainFade.ts";
import { getPlaceholderSpriteYOffset } from "./placeholderSpriteAnim.ts";
import { PRESET_DURATION_MS } from "./skillVfx/presetDurations.ts";

const HEAL_RISE_LINE_COUNT = 6;
const CHAIN_LIGHTNING_TAIL_COUNT = 5;

export { CHAIN_LIGHTNING_FADE_OUT_MS } from "./chainFade.ts";

interface EffectEntry {
  sourceId: string;
  targetId: string;
  spec: SkillVfxDef;
  elapsedMs: number;
  durationMs: number;
  /** 同一連鎖攻撃のセグメントを 1 本ずつ表示するためのグループ ID */
  chainGroupId?: string;
  /** 次セグメントで置き換えられた後のフェードアウト経過 ms */
  fadeOutElapsedMs?: number;
  /** 連鎖 1 体目 segment: 先端に符を描く */
  showTalisman?: boolean;
  /** 連鎖 segment: 命中と同時に完結形を表示（トラベルアニメなし） */
  chainInstantHit?: boolean;
  /** staged chain: 飛行フェーズの ms */
  travelDurationMs?: number;
}

export interface AttackEffectSpawnOptions {
  chainGroupId?: string;
  showTalisman?: boolean;
  chainInstantHit?: boolean;
  travelDurationMs?: number;
  segmentDurationMs?: number;
}

function durationForSpec(spec: SkillVfxDef): number {
  if (spec.durationMs !== undefined) return spec.durationMs;
  if (spec.preset !== undefined) return PRESET_DURATION_MS[spec.preset];
  return 0;
}

function getCombatantCenter(
  layout: CombatantLayout,
  spriteSize: number,
  scale: number
): { x: number; y: number } {
  const bob = getPlaceholderSpriteYOffset(layout, scale);
  return {
    x: layout.x + spriteSize / 2,
    y: spriteDrawY(layout) + bob + spriteSize / 2,
  };
}

function getCombatantBaseCenterY(
  layout: CombatantLayout,
  spriteSize: number
): number {
  return spriteDrawY(layout) + spriteSize / 2;
}

function getCombatantFoot(
  layout: CombatantLayout,
  spriteSize: number,
  scale: number
): { x: number; y: number } {
  const bob = getPlaceholderSpriteYOffset(layout, scale);
  return {
    x: layout.x + spriteSize / 2,
    y: spriteDrawY(layout) + bob + spriteSize,
  };
}

export class AttackEffectManager {
  private effects: EffectEntry[] = [];

  spawn(
    sourceId: string,
    targetId: string,
    spec: SkillVfxDef,
    options?: AttackEffectSpawnOptions,
  ): void {
    const chainGroupId = options?.chainGroupId;
    if (spec.preset === "chainLightning" && chainGroupId) {
      for (const effect of this.effects) {
        if (
          effect.spec.preset === "chainLightning" &&
          effect.chainGroupId === chainGroupId &&
          effect.fadeOutElapsedMs === undefined
        ) {
          effect.fadeOutElapsedMs = 0;
        }
      }
    }
    const segmentDurationMs =
      options?.segmentDurationMs ?? durationForSpec(spec);
    const travelDurationMs =
      options?.travelDurationMs ?? segmentDurationMs;
    this.effects.push({
      sourceId,
      targetId,
      spec,
      elapsedMs: 0,
      durationMs: segmentDurationMs,
      travelDurationMs,
      ...(chainGroupId ? { chainGroupId } : {}),
      ...(options?.showTalisman ? { showTalisman: true } : {}),
      ...(options?.chainInstantHit ? { chainInstantHit: true } : {}),
    });
  }

  fadeLatestChainSegment(chainGroupId: string): void {
    const segments = this.effects.filter(
      (effect) =>
        effect.spec.preset === "chainLightning" &&
        effect.chainGroupId === chainGroupId &&
        effect.fadeOutElapsedMs === undefined,
    );
    const latest = segments[segments.length - 1];
    if (latest) {
      latest.fadeOutElapsedMs = 0;
    }
  }

  tick(deltaMs: number): void {
    for (const effect of this.effects) {
      if (effect.fadeOutElapsedMs !== undefined) {
        effect.fadeOutElapsedMs += deltaMs;
      } else {
        effect.elapsedMs += deltaMs;
      }
    }
    this.effects = this.effects.filter((e) => {
      if (e.fadeOutElapsedMs !== undefined) {
        return e.fadeOutElapsedMs < CHAIN_LIGHTNING_FADE_OUT_MS;
      }
      return e.elapsedMs < e.durationMs;
    });
  }

  draw(
    ctx: CanvasRenderingContext2D,
    layouts: CombatantLayout[],
    spriteSize: number,
    scale: number,
    theme: BattleHudTheme,
  ): void {
    for (const effect of this.effects) {
      const source = layouts.find((l) => l.id === effect.sourceId);
      const target = layouts.find((l) => l.id === effect.targetId);
      if (!source || !target) continue;

      const travelDurationMs = effect.travelDurationMs ?? effect.durationMs;
      const travelProgress =
        effect.fadeOutElapsedMs !== undefined ||
        (effect.chainInstantHit && !effect.showTalisman)
          ? 1
          : Math.min(1, effect.elapsedMs / travelDurationMs);
      const start = getCombatantCenter(source, spriteSize, scale);
      const end = getCombatantCenter(target, spriteSize, scale);

      switch (effect.spec.preset) {
        case "healRise": {
          const foot = getCombatantFoot(target, spriteSize, scale);
          this.drawHealRise(ctx, foot, travelProgress, spriteSize, theme);
          break;
        }
        case "slash":
          this.drawSlashSwing(ctx, start, end, travelProgress, theme);
          break;
        case "slashHit":
          this.drawSlashHit(ctx, start, end, travelProgress, theme);
          break;
        case "orb":
          this.drawOrb(
            ctx,
            start.x,
            end.x,
            getCombatantBaseCenterY(target, spriteSize),
            travelProgress,
            theme,
          );
          break;
        case "arrow":
          this.drawArrow(
            ctx,
            start,
            end,
            travelProgress,
            scale,
            theme,
            effect.spec.arc ?? false,
          );
          break;
        case "chainLightning":
          this.drawChainLightning(
            ctx,
            start,
            end,
            travelProgress,
            theme,
            {
              fadeOutElapsedMs: effect.fadeOutElapsedMs,
              showTalisman: effect.showTalisman,
              chainInstantHit: effect.chainInstantHit,
              elapsedMs: effect.elapsedMs,
              durationMs: effect.durationMs,
            },
          );
          break;
        case "impale":
          this.drawImpale(ctx, start, end, travelProgress, scale, theme);
          break;
        default:
          break;
      }
    }
  }

  /** 近接：使用者の前方に半月型スイング弧 */
  private drawSlashSwing(
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    progress: number,
    theme: BattleHudTheme,
  ): void {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const alpha = 1 - progress * progress;
    const radius = (12 + progress * 10) * (0.55 + progress * 0.45);
    const forwardOffset = 14 + progress * 4;
    const cx = start.x + Math.cos(angle) * forwardOffset;
    const cy = start.y + Math.sin(angle) * forwardOffset;
    const arcStart = angle - Math.PI / 2;
    const arcEnd = angle + Math.PI / 2;

    ctx.save();
    ctx.lineCap = "round";

    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = theme.attackSlashSecondary;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, arcStart, arcEnd);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = theme.attackSlashSecondary;
    ctx.lineWidth = theme.attackSlashSecondaryWidth + 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, arcStart, arcEnd);
    ctx.stroke();

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = theme.attackSlashPrimary;
    ctx.lineWidth = theme.attackSlashPrimaryWidth + 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.82, arcStart + 0.12, arcEnd - 0.12);
    ctx.stroke();

    ctx.restore();
  }

  /** 近接：対象位置のヒット斬撃 */
  private drawSlashHit(
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    progress: number,
    theme: BattleHudTheme,
  ): void {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const alpha = 1 - progress * progress;
    const slashLength = 18 + progress * 14;

    ctx.save();
    ctx.translate(end.x, end.y);
    ctx.rotate(angle + Math.PI / 4);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";

    ctx.strokeStyle = theme.attackSlashPrimary;
    ctx.lineWidth = theme.attackSlashPrimaryWidth;
    ctx.beginPath();
    ctx.moveTo(-slashLength * (1 - progress * 0.6), 0);
    ctx.lineTo(slashLength * progress, 0);
    ctx.stroke();

    ctx.strokeStyle = theme.attackSlashSecondary;
    ctx.lineWidth = theme.attackSlashSecondaryWidth;
    ctx.beginPath();
    ctx.moveTo(-slashLength * 0.35, -slashLength * 0.18);
    ctx.lineTo(slashLength * 0.55, slashLength * 0.18);
    ctx.stroke();

    ctx.restore();
  }

  /** 回復：対象の足元から複数の線が昇る */
  private drawHealRise(
    ctx: CanvasRenderingContext2D,
    foot: { x: number; y: number },
    progress: number,
    spriteSize: number,
    theme: BattleHudTheme,
  ): void {
    const spread = spriteSize * 0.55;
    const maxRise = spriteSize * 1.1;

    ctx.save();
    ctx.lineCap = "round";

    for (let i = 0; i < HEAL_RISE_LINE_COUNT; i++) {
      const slot = i / (HEAL_RISE_LINE_COUNT - 1);
      const x = foot.x + (slot - 0.5) * spread;
      const stagger = i * 0.07;
      const localProgress = Math.max(
        0,
        Math.min(1, (progress - stagger) / (1 - stagger * 0.85))
      );
      if (localProgress <= 0) continue;

      const rise = localProgress * maxRise;
      const lineLen = 8 + localProgress * 18;
      const alpha =
        (1 - localProgress * localProgress) * theme.attackHealPeakAlpha;
      const baseY = foot.y + 2;

      ctx.globalAlpha = alpha;
      ctx.strokeStyle =
        i % 2 === 0 ? theme.attackHealPrimary : theme.attackHealSecondary;
      ctx.lineWidth =
        i % 3 === 0
          ? theme.attackHealPrimaryWidth
          : theme.attackHealSecondaryWidth;
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, baseY - rise - lineLen * localProgress);
      ctx.stroke();
    }

    ctx.restore();
  }

  /** ヒーラー：直線飛翔の丸 */
  private drawOrb(
    ctx: CanvasRenderingContext2D,
    startX: number,
    endX: number,
    flyY: number,
    progress: number,
    theme: BattleHudTheme,
  ): void {
    const x = startX + (endX - startX) * progress;
    const y = flyY;
    const radius = 5;

    ctx.save();
    ctx.globalAlpha = theme.attackOrbAlpha;
    ctx.fillStyle = theme.attackOrbFill;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = theme.attackOrbHighlightAlpha;
    ctx.fillStyle = theme.attackOrbHighlight;
    ctx.beginPath();
    ctx.arc(x - 1.5, y - 1.5, radius * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** レンジド：矢状直方体（spec.arc で放物線 ON/OFF） */
  private drawArrow(
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    progress: number,
    scale: number,
    theme: BattleHudTheme,
    arc: boolean,
  ): void {
    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    const arcHeight = arc ? Math.min(10 * scale, dist * 0.2) : 0;

    const sample = (t: number) => {
      const x = start.x + (end.x - start.x) * t;
      const y = start.y + (end.y - start.y) * t - arcHeight * 4 * t * (1 - t);
      return { x, y };
    };

    const pos = sample(progress);
    const prev = sample(Math.max(0, progress - 0.06));
    const angle = Math.atan2(pos.y - prev.y, pos.x - prev.x);

    const arrowLen = 12 * scale;
    const arrowW = 4 * scale;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    ctx.fillStyle = theme.attackArrowShaft;
    ctx.fillRect(-arrowLen / 2, -arrowW / 2, arrowLen, arrowW);

    ctx.fillStyle = theme.attackArrowTip;
    ctx.fillRect(arrowLen / 2 - 2 * scale, -arrowW / 2, 2 * scale, arrowW);
    ctx.restore();
  }

  /** 連鎖：直線雷（玉＋尾）。1 体目は符のみ（使用者→ターゲット）、以降は命中同期の完結 segment */
  private drawChainLightning(
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    progress: number,
    theme: BattleHudTheme,
    opts: {
      fadeOutElapsedMs?: number;
      showTalisman?: boolean;
      chainInstantHit?: boolean;
      elapsedMs: number;
      durationMs: number;
    },
  ): void {
    const beamAngle = Math.atan2(end.y - start.y, end.x - start.x);
    const fade = opts.chainInstantHit
      ? chainLightningFadeAlpha(progress, opts.fadeOutElapsedMs)
      : chainSegmentFadeAlpha(
          opts.elapsedMs,
          opts.durationMs,
          opts.fadeOutElapsedMs,
        );

    if (opts.showTalisman) {
      const headX = start.x + (end.x - start.x) * progress;
      const headY = start.y + (end.y - start.y) * progress;
      this.drawChainTalisman(ctx, headX, headY, beamAngle, fade);
      return;
    }

    const headX = start.x + (end.x - start.x) * progress;
    const headY = start.y + (end.y - start.y) * progress;

    ctx.save();
    ctx.lineCap = "round";

    ctx.globalAlpha = fade * theme.attackChainLightningGlowAlpha;
    ctx.strokeStyle = theme.attackChainLightningGlow;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(headX, headY);
    ctx.stroke();

    ctx.globalAlpha = fade * 0.35;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(headX, headY);
    ctx.stroke();

    ctx.globalAlpha = fade * theme.attackChainLightningCoreAlpha;
    ctx.strokeStyle = theme.attackChainLightningCore;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(headX, headY);
    ctx.stroke();

    const tailSpan = 28;
    for (let i = 0; i < CHAIN_LIGHTNING_TAIL_COUNT; i++) {
      const slot = (i + 1) / (CHAIN_LIGHTNING_TAIL_COUNT + 1);
      const tailT = Math.max(0, progress - slot * 0.12);
      const tx = start.x + (end.x - start.x) * tailT;
      const ty = start.y + (end.y - start.y) * tailT;
      const segLen = tailSpan * (1 - slot) * 0.35;
      const angle = beamAngle;
      const perp = angle + Math.PI / 2;
      const jitter = (i % 2 === 0 ? 1 : -1) * 3;

      ctx.globalAlpha = fade * theme.attackChainLightningTailAlpha * (1 - slot);
      ctx.strokeStyle = theme.attackChainLightningTail;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(
        tx + Math.cos(perp) * jitter,
        ty + Math.sin(perp) * jitter,
      );
      ctx.lineTo(
        tx + Math.cos(angle) * segLen + Math.cos(perp) * jitter * 0.5,
        ty + Math.sin(angle) * segLen + Math.sin(perp) * jitter * 0.5,
      );
      ctx.stroke();
    }

    ctx.globalAlpha = fade * theme.attackChainLightningCoreAlpha;
    ctx.fillStyle = theme.attackChainLightningCore;
    ctx.beginPath();
    ctx.arc(headX, headY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = fade;
    ctx.fillStyle = theme.attackChainLightningGlow;
    ctx.beginPath();
    ctx.arc(headX - 1, headY - 1, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** 連鎖 1 体目: 先端の下に符（紙札）プレースホルダー */
  private drawChainTalisman(
    ctx: CanvasRenderingContext2D,
    headX: number,
    headY: number,
    beamAngle: number,
    fade: number,
  ): void {
    const talismanW = 11;
    const talismanH = 15;

    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(beamAngle);
    ctx.globalAlpha = fade;

    ctx.fillStyle = "#f5e6c8";
    ctx.fillRect(-talismanW / 2, -talismanH / 2, talismanW, talismanH);
    ctx.strokeStyle = "#c0392b";
    ctx.lineWidth = 1;
    ctx.strokeRect(-talismanW / 2, -talismanH / 2, talismanW, talismanH);
    ctx.beginPath();
    ctx.moveTo(0, -talismanH / 2 + 2);
    ctx.lineTo(0, talismanH / 2 - 2);
    ctx.stroke();

    ctx.restore();
  }

  /** 貫通：大型矢状 */
  private drawImpale(
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    progress: number,
    scale: number,
    theme: BattleHudTheme,
  ): void {
    const pos = {
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    };
    const prevT = Math.max(0, progress - 0.05);
    const prev = {
      x: start.x + (end.x - start.x) * prevT,
      y: start.y + (end.y - start.y) * prevT,
    };
    const angle = Math.atan2(pos.y - prev.y, pos.x - prev.x);
    const arrowLen = 24 * scale;
    const arrowW = 12 * scale;
    const tipLen = 10 * scale;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    ctx.fillStyle = theme.attackImpaleShaft;
    ctx.fillRect(-arrowLen / 2, -arrowW / 2, arrowLen - tipLen, arrowW);

    ctx.fillStyle = theme.attackImpaleTip;
    ctx.beginPath();
    ctx.moveTo(arrowLen / 2, 0);
    ctx.lineTo(arrowLen / 2 - tipLen, -arrowW / 2);
    ctx.lineTo(arrowLen / 2 - tipLen, arrowW / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
