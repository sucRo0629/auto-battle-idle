import type { SkillVfxDef } from "../../battle/types.ts";
import type { SkillVfxContext } from "./types.ts";

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
