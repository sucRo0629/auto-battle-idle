import type {
  AttackRange,
  Role,
  SkillEffectKind,
  SkillSlotKind,
} from "../../battle/types.ts";

/** resolveSkillVfx に渡す実行時コンテキスト（BattleEvent + スナップショット由来） */
export interface SkillVfxContext {
  role?: Role;
  attackRange: AttackRange;
  slotKind?: SkillSlotKind;
  effectKind: SkillEffectKind;
}
