import { isRangedAttack } from "../../battle/data/entityTraits.ts";
import type { SkillVfxDef } from "../../battle/types.ts";
import type { SkillVfxContext } from "./types.ts";

/** スキル定義に vfx が無いときのフォールバック（アクティブ用） */
export function resolveDefaultSkillVfx(ctx: SkillVfxContext): SkillVfxDef {
  if (ctx.effectKind === "heal") {
    return { preset: "healRise" };
  }
  if (ctx.role === "supporter") {
    return { preset: "orb" };
  }
  if (ctx.targetShape === "pierce") {
    return { preset: "impale" };
  }
  if (ctx.targetShape === "chain") {
    return { preset: "chainLightning" };
  }
  if (isRangedAttack(ctx.rangePx)) {
    return { preset: "arrow", arc: ctx.slotKind === "active" };
  }
  return { preset: "slash" };
}

/** 攻撃 VFX に対応する対象ヒット VFX（近接スイング等） */
export function resolveDefaultHitVfx(
  ctx: SkillVfxContext,
  vfx: SkillVfxDef,
): SkillVfxDef | null {
  if (ctx.effectKind !== "damage" && ctx.effectKind !== "dot") {
    return null;
  }
  if (vfx.preset === "slash") {
    return { preset: "slashHit" };
  }
  return null;
}
