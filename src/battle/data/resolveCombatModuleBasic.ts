import type { ClassPreset, CombatModuleDef, GameData } from '../types.ts';

function resolveDefaultCombatModuleId(
  classPreset: ClassPreset,
  combatModuleRegistry: Record<string, CombatModuleDef>,
): string | undefined {
  const moduleIds = classPreset.combatModuleIds;
  if (!moduleIds || moduleIds.length === 0) return undefined;

  const defaultId = moduleIds[0];
  const module = combatModuleRegistry[defaultId];
  if (!module) {
    throw new Error(
      `Combat module not found: ${defaultId} (class ${classPreset.id})`,
    );
  }
  if (module.classId !== classPreset.id) {
    throw new Error(
      `Combat module "${defaultId}" belongs to class "${module.classId}", not "${classPreset.id}"`,
    );
  }
  return defaultId;
}

export function isValidSelectedCombatModuleId(
  classPreset: ClassPreset,
  combatModuleRegistry: Record<string, CombatModuleDef>,
  selectedId: string,
): boolean {
  const moduleIds = classPreset.combatModuleIds;
  if (!moduleIds || moduleIds.length === 0) return false;
  if (!selectedId) return false;
  if (!moduleIds.includes(selectedId)) return false;

  const module = combatModuleRegistry[selectedId];
  if (!module) return false;
  if (module.classId !== classPreset.id) return false;
  return true;
}

/**
 * R5c/R5d: class の combat module を解決。
 * - 未指定 class → undefined（legacy basicAttackSkillId へフォールバック）
 * - selectedCombatModuleId 未指定 / 空 / 不正 → combatModuleIds[0]
 * - 有効な selectedCombatModuleId → その ID
 */
export function resolveSelectedCombatModuleId(
  classPreset: ClassPreset,
  combatModuleRegistry: Record<string, CombatModuleDef>,
  selectedCombatModuleId?: string | null,
): string | undefined {
  const defaultId = resolveDefaultCombatModuleId(
    classPreset,
    combatModuleRegistry,
  );
  if (defaultId === undefined) return undefined;

  if (!selectedCombatModuleId) return defaultId;
  if (
    isValidSelectedCombatModuleId(
      classPreset,
      combatModuleRegistry,
      selectedCombatModuleId,
    )
  ) {
    return selectedCombatModuleId;
  }
  return defaultId;
}

export function resolveBasicAttackSkillId(
  classPreset: ClassPreset,
  combatModuleRegistry: Record<string, CombatModuleDef>,
  selectedCombatModuleId?: string | null,
): string {
  return (
    resolveSelectedCombatModuleId(
      classPreset,
      combatModuleRegistry,
      selectedCombatModuleId,
    ) ?? classPreset.basicAttackSkillId
  );
}

export function resolveBasicAttackSkillIdFromGameData(
  classPreset: ClassPreset,
  gameData: Pick<GameData, 'combatModuleRegistry'>,
  selectedCombatModuleId?: string | null,
): string {
  return resolveBasicAttackSkillId(
    classPreset,
    gameData.combatModuleRegistry,
    selectedCombatModuleId,
  );
}

export function resolveCombatModuleDef(
  classPreset: ClassPreset,
  combatModuleRegistry: Record<string, CombatModuleDef>,
  selectedCombatModuleId?: string | null,
): CombatModuleDef | undefined {
  const moduleId = resolveSelectedCombatModuleId(
    classPreset,
    combatModuleRegistry,
    selectedCombatModuleId,
  );
  if (moduleId === undefined) return undefined;
  return combatModuleRegistry[moduleId];
}

export function isCombatModuleBasicSkillId(
  skillId: string,
  combatModuleRegistry: Record<string, CombatModuleDef>,
): boolean {
  return combatModuleRegistry[skillId] !== undefined;
}
