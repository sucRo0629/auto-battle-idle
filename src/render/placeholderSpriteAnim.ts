import { ANIM_DEFS } from "./SpriteRegistry.ts";
import type { CombatantLayout } from "./IBattleRenderer.ts";

const IDLE_BOB_AMPLITUDE = 2;
const ATTACK_BOUNCE_HEIGHT = 8;

type AnimLayout = Pick<CombatantLayout, "anim" | "animFrame">;

/** スプライトシートアニメーションが定義されているか（未設定時はプレースホルダを使う） */
export function hasSpriteSheetAnimation(_spriteKey: string): boolean {
  return false;
}

/**
 * スプライトシート未設定時の縦方向オフセット（待機の揺れ・攻撃の跳ね）。
 * attack の跳ねは確認用プレースホルダー。将来スプライトアニメに置き換える。
 */
export function getPlaceholderSpriteYOffset(
  layout: AnimLayout,
  scale: number
): number {
  if (layout.anim === "idle") {
    return Math.sin(layout.animFrame * 0.8) * IDLE_BOB_AMPLITUDE;
  }

  if (layout.anim === "attack") {
    const def = ANIM_DEFS.attack;
    const progress = (layout.animFrame + 0.5) / def.frames;
    return -Math.sin(progress * Math.PI) * ATTACK_BOUNCE_HEIGHT * scale;
  }

  return 0;
}
