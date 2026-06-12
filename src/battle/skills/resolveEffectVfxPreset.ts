import { isRangedAttack } from '../data/entityTraits.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  SkillEffectDef,
  SkillSlotKind,
  SkillVfxDef,
  SkillVfxPresetId,
} from '../types.ts';

function defaultVfxPreset(
  effectDef: SkillEffectDef,
  actor: CombatantState,
): SkillVfxPresetId {
  if (effectDef.type === 'heal') {
    return 'healRise';
  }
  if (actor.role === 'supporter') {
    return 'orb';
  }
  if (effectDef.targetShape === 'pierce') {
    return 'impale';
  }
  if (effectDef.targetShape === 'chain') {
    return 'chainLightning';
  }
  const rangePx = actor.traits.rangePx;
  if (isRangedAttack(rangePx)) {
    return 'arrow';
  }
  return 'slash';
}

function resolveVfxDef(
  skill: ActiveSkillDef,
  effectDef: SkillEffectDef,
  actor: CombatantState,
  slotKind: SkillSlotKind,
): SkillVfxDef {
  if (slotKind === 'basic') {
    return actor.traits.basicAttackVfx;
  }
  return effectDef.vfx ?? skill.vfx ?? { preset: defaultVfxPreset(effectDef, actor) };
}

/** 戦闘ロジック用: effect の VFX preset を解決（render 層へ依存しない） */
export function resolveEffectVfxPreset(
  skill: ActiveSkillDef,
  effectDef: SkillEffectDef,
  actor: CombatantState,
  slotKind: SkillSlotKind,
): SkillVfxPresetId {
  return resolveVfxDef(skill, effectDef, actor, slotKind).preset;
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
