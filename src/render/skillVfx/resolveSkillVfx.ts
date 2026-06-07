import type { SkillVfxDef } from "../../battle/types.ts";
import { resolveDefaultSkillVfx } from "./defaultPresets.ts";
import { SKILL_VFX_OVERRIDES } from "./registry.ts";
import type { SkillVfxContext } from "./types.ts";

/**
 * スキル演出を解決する。優先順:
 * 1. skills.json / ActiveSkillDef.vfx（Phase 3b で本番データ化）
 * 2. SKILL_VFX_OVERRIDES（Phase 3b まで空）
 * 3. resolveDefaultSkillVfx（Phase 1 プレースホルダー）
 */
export function resolveSkillVfx(
  skillId: string,
  ctx: SkillVfxContext,
  skillVfx?: SkillVfxDef,
): SkillVfxDef {
  if (skillVfx !== undefined) return skillVfx;
  const codeOverride = SKILL_VFX_OVERRIDES[skillId];
  if (codeOverride !== undefined) return codeOverride;
  return resolveDefaultSkillVfx(ctx);
}
