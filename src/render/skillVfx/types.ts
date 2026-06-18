import type {
  DamageType,
  Role,
  SkillEffectKind,
  SkillSlotKind,
  SkillVfxDef,
  TargetShape,
} from "../../battle/types.ts";

/** VFX 解決に渡す実行時コンテキスト（BattleEvent + スナップショット由来） */
export interface SkillVfxContext {
  role?: Role;
  rangePx: number;
  damageType: DamageType;
  /** 通常攻撃スロット用（traits.basicAttackVfx） */
  basicAttackVfx?: SkillVfxDef;
  slotKind?: SkillSlotKind;
  effectKind: SkillEffectKind;
  targetShape?: TargetShape;
  /** false のときのみ skill.vfx へのフォールバックを許可する */
  effectVfxOnly?: boolean;
}
