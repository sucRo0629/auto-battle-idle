import type { SkillVfxDef } from "../../battle/types.ts";

/**
 * コード側のスキル ID → VFX 上書き（Phase 3b まで未使用）。
 * 本番は skills.json の `vfx` を ActiveSkillDef.vfx として読み込む。
 */
export const SKILL_VFX_OVERRIDES: Readonly<Record<string, SkillVfxDef>> = {};
