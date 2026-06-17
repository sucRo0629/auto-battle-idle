import type {
  ActiveSkillDef,
  CombatantState,
  SkillEffectDef,
  SkillSlotKind,
  SkillVfxDef,
  SkillVfxPresetId,
} from '../types.ts';

function resolveVfxDef(
  skill: ActiveSkillDef,
  effectDef: SkillEffectDef,
  actor: CombatantState,
  slotKind: SkillSlotKind,
): SkillVfxDef | null {
  if (slotKind === 'basic') {
    return actor.traits.basicAttackVfx?.preset ? actor.traits.basicAttackVfx : null;
  }
  return effectDef.vfx?.preset ? effectDef.vfx : skill.vfx?.preset ? skill.vfx : null;
}

/** 戦闘ロジック用: effect の VFX preset を解決（render 層へ依存しない） */
export function resolveEffectVfxPreset(
  skill: ActiveSkillDef,
  effectDef: SkillEffectDef,
  actor: CombatantState,
  slotKind: SkillSlotKind,
): SkillVfxPresetId | null {
  return resolveVfxDef(skill, effectDef, actor, slotKind)?.preset ?? null;
}

export function usesStagedChainVfx(
  skill: ActiveSkillDef,
  effectDef: SkillEffectDef,
  actor: CombatantState,
  slotKind: SkillSlotKind,
): boolean {
  if (effectDef.targetShape !== 'chain') return false;
  if (effectDef.type !== 'damage' && effectDef.type !== 'dot') return false;
  return resolveEffectVfxPreset(skill, effectDef, actor, slotKind) === 'chainLightning';
}
