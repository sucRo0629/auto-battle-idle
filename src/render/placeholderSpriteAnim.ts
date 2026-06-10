import { ANIM_DEFS, type AnimState } from "./SpriteRegistry.ts";
import type { CombatantLayout } from "./IBattleRenderer.ts";

const IDLE_BOB_AMPLITUDE = 2;
const ATTACK_BOUNCE_HEIGHT = 8;

type AnimLayout = Pick<CombatantLayout, "anim" | "animFrame">;

const deathFallDirections = new Map<string, -1 | 1>();

/** 死亡プレースホルダー（回転倒れ）の開始。playAnim(death) 時に呼ぶ */
export function beginDeathPlaceholder(combatantId: string): void {
  deathFallDirections.set(combatantId, Math.random() < 0.5 ? -1 : 1);
}

/** リスポーン等で死亡プレースホルダー状態を解除 */
export function clearDeathPlaceholder(combatantId: string): void {
  deathFallDirections.delete(combatantId);
}

export interface DeathPlaceholderTransform {
  rotationRad: number;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 2;
}

/**
 * スプライトシート未設定時の死亡演出（90° 回転倒れ）。
 * SpriteAnimator の death フレーム進行に同期。death シートがある spriteKey では使わない。
 */
export function getDeathPlaceholderTransform(
  combatantId: string,
  layout: AnimLayout & { anim: AnimState },
): DeathPlaceholderTransform | null {
  if (layout.anim !== "death") return null;

  const direction = deathFallDirections.get(combatantId);
  if (direction === undefined) return null;

  const def = ANIM_DEFS.death;
  const frameProgress = Math.min((layout.animFrame + 1) / def.frames, 1);
  const t = easeOut(frameProgress);
  return { rotationRad: direction * t * (Math.PI / 2) };
}

/**
 * スプライトシート未設定時の縦方向オフセット（待機の揺れ・攻撃の跳ね）。
 * attack の跳ねは確認用プレースホルダー。将来スプライトアニメに置き換える。
 */
export function getPlaceholderSpriteYOffset(
  layout: AnimLayout,
  scale: number,
): number {
  if (layout.anim === "idle") {
    return Math.sin(layout.animFrame * 0.8) * IDLE_BOB_AMPLITUDE;
  }

  if (layout.anim === "attack" || layout.anim === "move") {
    const def = ANIM_DEFS[layout.anim];
    const progress = (layout.animFrame + 0.5) / def.frames;
    return -Math.sin(progress * Math.PI) * ATTACK_BOUNCE_HEIGHT * scale;
  }

  return 0;
}
