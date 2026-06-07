import type { SkillVfxDef, SkillVfxPresetId } from "../battle/types.ts";
import type { CombatantLayout } from "./IBattleRenderer.ts";
import type { BattleHudTheme } from "./battleHudTheme.ts";
import { getPlaceholderSpriteYOffset } from "./placeholderSpriteAnim.ts";

const PRESET_DURATION_MS: Record<SkillVfxPresetId, number> = {
  slash: 320,
  orb: 380,
  arrow: 420,
  healRise: 520,
};

const HEAL_RISE_LINE_COUNT = 6;

interface EffectEntry {
  actorId: string;
  targetId: string;
  spec: SkillVfxDef;
  elapsedMs: number;
  durationMs: number;
}

function durationForSpec(spec: SkillVfxDef): number {
  return spec.durationMs ?? PRESET_DURATION_MS[spec.preset];
}

function getCombatantCenter(
  layout: CombatantLayout,
  spriteSize: number,
  scale: number
): { x: number; y: number } {
  const bob = getPlaceholderSpriteYOffset(layout, scale);
  return {
    x: layout.x + spriteSize / 2,
    y: layout.y + bob + spriteSize / 2,
  };
}

function getCombatantBaseCenterY(
  layout: CombatantLayout,
  spriteSize: number
): number {
  return layout.y + spriteSize / 2;
}

function getCombatantFoot(
  layout: CombatantLayout,
  spriteSize: number,
  scale: number
): { x: number; y: number } {
  const bob = getPlaceholderSpriteYOffset(layout, scale);
  return {
    x: layout.x + spriteSize / 2,
    y: layout.y + bob + spriteSize,
  };
}

export class AttackEffectManager {
  private effects: EffectEntry[] = [];

  spawn(actorId: string, targetId: string, spec: SkillVfxDef): void {
    this.effects.push({
      actorId,
      targetId,
      spec,
      elapsedMs: 0,
      durationMs: durationForSpec(spec),
    });
  }

  tick(deltaMs: number): void {
    for (const effect of this.effects) {
      effect.elapsedMs += deltaMs;
    }
    this.effects = this.effects.filter((e) => e.elapsedMs < e.durationMs);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    layouts: CombatantLayout[],
    spriteSize: number,
    scale: number,
    theme: BattleHudTheme,
  ): void {
    for (const effect of this.effects) {
      const actor = layouts.find((l) => l.id === effect.actorId);
      const target = layouts.find((l) => l.id === effect.targetId);
      if (!actor || !target) continue;

      const progress = Math.min(1, effect.elapsedMs / effect.durationMs);
      const start = getCombatantCenter(actor, spriteSize, scale);
      const end = getCombatantCenter(target, spriteSize, scale);

      switch (effect.spec.preset) {
        case "healRise": {
          const foot = getCombatantFoot(target, spriteSize, scale);
          this.drawHealRise(ctx, foot, progress, spriteSize, theme);
          break;
        }
        case "slash":
          this.drawSlash(ctx, start, end, progress, theme);
          break;
        case "orb":
          this.drawOrb(
            ctx,
            start.x,
            end.x,
            getCombatantBaseCenterY(target, spriteSize),
            progress,
            theme,
          );
          break;
        case "arrow":
          this.drawArrow(
            ctx,
            start,
            end,
            progress,
            scale,
            theme,
            effect.spec.arc ?? false,
          );
          break;
      }
    }
  }

  /** 前衛：ターゲット位置で斬撃ラインを描画 */
  private drawSlash(
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
}
