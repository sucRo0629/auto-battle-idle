import type {
  ActiveSkillDef,
  CombatantState,
  SkillEffectDef,
  SkillSlotKind,
} from '../types.ts';
import { resolveEffectPresentation } from '../../render/skillVfx/resolveEffectPresentation.ts';
import type { SkillVfxContext } from '../../render/skillVfx/types.ts';

function buildBattleVfxContext(
  skill: ActiveSkillDef,
  effectDef: SkillEffectDef,
  actor: CombatantState,
  slotKind: SkillSlotKind,
  effectIndex: number,
): SkillVfxContext {
  return {
    role: actor.role,
    rangePx: actor.traits.rangePx,
    damageType: actor.traits.damageType,
    basicAttackVfx: actor.traits.basicAttackVfx,
    slotKind,
    effectKind: effectDef.type === 'move' ? 'move' : effectDef.type,
    targetShape: effectDef.targetShape,
    effectVfxOnly: true,
    skillId: skill.id,
    effectIndex,
  };
}

/** 戦闘ロジック用: effect に再生可能な VFX があるか */
export function resolveEffectHasVfx(
  skill: ActiveSkillDef,
  effectDef: SkillEffectDef,
  actor: CombatantState,
  slotKind: SkillSlotKind,
  effectIndex: number,
): boolean {
  const { vfx, hitVfx } = resolveEffectPresentation(
    effectDef,
    skill,
    buildBattleVfxContext(skill, effectDef, actor, slotKind, effectIndex),
  );
  return vfx !== null || hitVfx !== null;
}

export function usesStagedChainVfx(
  skill: ActiveSkillDef,
  effectDef: SkillEffectDef,
  actor: CombatantState,
  slotKind: SkillSlotKind,
  effectIndex: number,
): boolean {
  if (effectDef.targetShape !== 'chain') return false;
  if (effectDef.type !== 'damage' && effectDef.type !== 'dot') return false;
  return resolveEffectHasVfx(
    skill,
    effectDef,
    actor,
    slotKind,
    effectIndex,
  );
}
