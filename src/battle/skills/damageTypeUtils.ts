import type { CombatantState, SkillEffectDef } from '../types.ts';

export function resolveSkillDamageType(
  actor: CombatantState,
  effect: Pick<SkillEffectDef, 'type'> & { damageType?: 'physical' | 'magic' },
): 'physical' | 'magic' {
  return effect.damageType ?? actor.traits.damageType;
}
