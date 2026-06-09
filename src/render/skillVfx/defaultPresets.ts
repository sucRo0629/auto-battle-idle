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
  if (isRangedAttack(ctx.rangePx)) {
    return { preset: "arrow", arc: ctx.slotKind === "active" };
  }
  return { preset: "slash" };
}
