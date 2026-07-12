import type { ClassPreset, CombatModuleDef, GameData } from '../types.ts';

/**
 * R5c: class の combatModuleIds[0] を明示選択（registry / glob 順に依存しない）。
 * 未指定 class は undefined（legacy basicAttackSkillId へフォールバック）。
 */
export function resolveSelectedCombatModuleId(
  classPreset: ClassPreset,
  combatModuleRegistry: Record<string, CombatModuleDef>,
): string | undefined {
  const moduleIds = classPreset.combatModuleIds;
  if (!moduleIds || moduleIds.length === 0) return undefined;

  const selectedId = moduleIds[0];
  const module = combatModuleRegistry[selectedId];
  if (!module) {
    throw new Error(
      `Combat module not found: ${selectedId} (class ${classPreset.id})`,
    );
  }
  if (module.classId !== classPreset.id) {
    throw new Error(
      `Combat module "${selectedId}" belongs to class "${module.classId}", not "${classPreset.id}"`,
    );
  }
  return selectedId;
}

export function resolveBasicAttackSkillId(
  classPreset: ClassPreset,
  combatModuleRegistry: Record<string, CombatModuleDef>,
): string {
  return (
    resolveSelectedCombatModuleId(classPreset, combatModuleRegistry) ??
    classPreset.basicAttackSkillId
  );
}

export function resolveBasicAttackSkillIdFromGameData(
  classPreset: ClassPreset,
  gameData: Pick<GameData, 'combatModuleRegistry'>,
): string {
  return resolveBasicAttackSkillId(classPreset, gameData.combatModuleRegistry);
}

export function isCombatModuleBasicSkillId(
  skillId: string,
  combatModuleRegistry: Record<string, CombatModuleDef>,
): boolean {
  return combatModuleRegistry[skillId] !== undefined;
}
