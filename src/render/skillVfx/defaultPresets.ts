import type { SkillVfxDef } from "../../battle/types.ts";
import type { SkillVfxContext } from "./types.ts";

/** スキル定義に vfx が無いときの Phase 1 プレースホルダー */
export function resolveDefaultSkillVfx(ctx: SkillVfxContext): SkillVfxDef {
  if (ctx.effectKind === "heal") {
    return { preset: "healRise" };
  }
  if (ctx.role === "supporter") {
    return { preset: "orb" };
  }
  if (ctx.attackRange === "ranged") {
    return { preset: "arrow", arc: ctx.slotKind === "active" };
  }
  return { preset: "slash" };
}
