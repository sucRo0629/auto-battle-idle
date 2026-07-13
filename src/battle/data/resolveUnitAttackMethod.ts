import type { ActiveSkillDef, AttackMethod, CombatantState, GameData } from '../types.ts';
import { isCombatModuleBasicSkillId } from './resolveCombatModuleBasic.ts';

export function resolveBasicSlotSkillId(
  unit: CombatantState,
): string | undefined {
  return unit.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId;
}

export function resolveSkillAttackMethod(
  skill: ActiveSkillDef | undefined,
): AttackMethod | undefined {
  if (!skill?.attackMethod) return undefined;
  return skill.attackMethod;
}

/** 解決済み通常攻撃の attackMethod。heal-only basic / buff module は undefined。 */
export function resolveUnitAttackMethod(
  unit: CombatantState,
  gameData: Pick<GameData, 'skillRegistry' | 'combatModuleRegistry'>,
): AttackMethod | undefined {
  const skillId = resolveBasicSlotSkillId(unit);
  if (!skillId) return undefined;

  const skill = gameData.skillRegistry.actives[skillId];
  if (skill) {
    return resolveSkillAttackMethod(skill);
  }

  if (isCombatModuleBasicSkillId(skillId, gameData.combatModuleRegistry)) {
    const module = gameData.combatModuleRegistry[skillId];
    return module?.action.attackMethod;
  }

  return undefined;
}
