import type { AttackRange, Role } from "../battle/types.ts";
import type { CombatantLayout } from "./IBattleRenderer.ts";
import { getPlaceholderSpriteYOffset } from "./placeholderSpriteAnim.ts";

export type AttackEffectKind = "slash" | "orb" | "arrow";

const SLASH_DURATION_MS = 320;
const ORB_DURATION_MS = 380;
const ARROW_DURATION_MS = 420;
const HEAL_RISE_DURATION_MS = 520;

const HEAL_RISE_LINE_COUNT = 6;

interface EffectEntry {
  actorId: string;
  targetId: string;
  kind: AttackEffectKind;
  isHeal: boolean;
  elapsedMs: number;
  durationMs: number;
}

export function resolveAttackEffectKind(
  role: Role | undefined,
  range: AttackRange | undefined
): AttackEffectKind {
  if (role === "supporter") return "orb";
  if (range === "melee") return "slash";
  return "arrow";
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

function durationForKind(kind: AttackEffectKind, isHeal: boolean): number {
  if (isHeal) return HEAL_RISE_DURATION_MS;
  switch (kind) {
    case "slash":
      return SLASH_DURATION_MS;
    case "orb":
      return ORB_DURATION_MS;
    case "arrow":
      return ARROW_DURATION_MS;
  }
}

export class AttackEffectManager {
  private effects: EffectEntry[] = [];

  spawn(
    actorId: string,
    targetId: string,
    kind: AttackEffectKind,
    isHeal = false
  ): void {
    this.effects.push({
      actorId,
      targetId,
      kind,
      isHeal,
      elapsedMs: 0,
      durationMs: durationForKind(kind, isHeal),
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
    scale: number
  ): void {
    for (const effect of this.effects) {
      const actor = layouts.find((l) => l.id === effect.actorId);
      const target = layouts.find((l) => l.id === effect.targetId);
      if (!actor || !target) continue;

      const progress = Math.min(1, effect.elapsedMs / effect.durationMs);
      const start = getCombatantCenter(actor, spriteSize, scale);
      const end = getCombatantCenter(target, spriteSize, scale);

      if (effect.isHeal) {
        const foot = getCombatantFoot(target, spriteSize, scale);
        this.drawHealRise(ctx, foot, progress, spriteSize);
        continue;
      }

      switch (effect.kind) {
        case "slash":
          this.drawSlash(ctx, start, end, progress);
          break;
        case "orb":
          this.drawOrb(
            ctx,
            start.x,
            end.x,
            getCombatantBaseCenterY(target, spriteSize),
            progress
          );
          break;
        case "arrow":
          this.drawArrow(ctx, start, end, progress, scale);
          break;
      }
    }
  }

  /** 前衛：ターゲット位置で斬撃ラインを描画 */
  private drawSlash(
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    progress: number
  ): void {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const alpha = 1 - progress * progress;
    const slashLength = 18 + progress * 14;

    ctx.save();
    ctx.translate(end.x, end.y);
    ctx.rotate(angle + Math.PI / 4);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-slashLength * (1 - progress * 0.6), 0);
    ctx.lineTo(slashLength * progress, 0);
    ctx.stroke();

    ctx.strokeStyle = "#8ecfff";
    ctx.lineWidth = 2;
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
    spriteSize: number
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
      const alpha = (1 - localProgress * localProgress) * 0.95;
      const baseY = foot.y + 2;

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = i % 2 === 0 ? "#2ecc71" : "#7bed9f";
      ctx.lineWidth = i % 3 === 0 ? 2.5 : 2;
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, baseY - rise - lineLen * localProgress);
      ctx.stroke();
    }

    ctx.restore();
  }

  /** ヒーラー：直線飛翔の丸（通常攻撃・Y軸固定） */
  private drawOrb(
    ctx: CanvasRenderingContext2D,
    startX: number,
    endX: number,
    flyY: number,
    progress: number
  ): void {
    const x = startX + (endX - startX) * progress;
    const y = flyY;
    const radius = 5;

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#74b9ff";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.45;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x - 1.5, y - 1.5, radius * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** レンジド：放物線を描く矢状直方体 */
  private drawArrow(
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    progress: number,
    scale: number
  ): void {
    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    const arcHeight = Math.min(10 * scale, dist * 0.2);

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
    ctx.fillStyle = "#c8a165";
    ctx.fillRect(-arrowLen / 2, -arrowW / 2, arrowLen, arrowW);

    ctx.fillStyle = "#8b6914";
    ctx.fillRect(arrowLen / 2 - 2 * scale, -arrowW / 2, 2 * scale, arrowW);
    ctx.restore();
  }
}
