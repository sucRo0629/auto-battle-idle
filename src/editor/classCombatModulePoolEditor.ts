import {
  R5_COMBAT_MODULE_CLASS_IDS,
  type ClassId,
  type CombatModuleDef,
} from '../battle/types.ts';

export interface ClassCombatModulePoolOption {
  moduleId: string;
  displayName: string;
  description: string;
}

export function isClassCombatModulePoolEditable(classId: string): boolean {
  return (R5_COMBAT_MODULE_CLASS_IDS as readonly string[]).includes(classId.trim());
}

export function listClassCombatModulePoolOptions(
  classId: ClassId,
  combatModuleRegistry: Record<string, CombatModuleDef>,
): ClassCombatModulePoolOption[] {
  return Object.values(combatModuleRegistry)
    .filter((module) => module.classId === classId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((module) => ({
      moduleId: module.id,
      displayName: module.displayName,
      description: module.description ?? '',
    }));
}

export function resolveClassCombatModuleIdsDraft(
  classId: string,
  combatModuleIds: [string, string] | undefined,
  combatModuleRegistry: Record<string, CombatModuleDef>,
): [string, string] | undefined {
  if (!isClassCombatModulePoolEditable(classId)) {
    return combatModuleIds;
  }
  if (combatModuleIds?.length === 2) {
    return combatModuleIds;
  }
  const options = listClassCombatModulePoolOptions(classId, combatModuleRegistry);
  if (options.length < 2) return undefined;
  return [options[0]!.moduleId, options[1]!.moduleId];
}

export function setClassCombatModulePoolSlot(
  current: [string, string] | undefined,
  slotIndex: 0 | 1,
  moduleId: string,
  fallback: [string, string],
): [string, string] {
  const next: [string, string] = current?.length === 2 ? [...current] : [...fallback];
  const otherIndex = slotIndex === 0 ? 1 : 0;
  if (moduleId === next[otherIndex]) {
    next[otherIndex] = next[slotIndex]!;
  }
  next[slotIndex] = moduleId;
  return next;
}

export function validateClassCombatModulePoolDraft(
  classId: string,
  combatModuleIds: [string, string] | undefined,
  combatModuleRegistry: Record<string, CombatModuleDef>,
): string | null {
  if (!isClassCombatModulePoolEditable(classId)) {
    return null;
  }
  if (!combatModuleIds || combatModuleIds.length !== 2) {
    return 'R5 兵科は戦闘方式 pool（combatModuleIds）を 2 件設定してください';
  }
  if (new Set(combatModuleIds).size !== 2) {
    return '戦闘方式 pool に同じ module を 2 回選べません';
  }
  for (const moduleId of combatModuleIds) {
    const module = combatModuleRegistry[moduleId];
    if (!module) {
      return `未知の combatModuleId "${moduleId}" です`;
    }
    if (module.classId !== classId) {
      return `combatModuleId "${moduleId}" は兵科 "${classId}" の方式ではありません`;
    }
  }
  return null;
}

export function formatClassCombatModulePoolSummary(
  combatModuleIds: [string, string] | undefined,
  combatModuleRegistry: Record<string, CombatModuleDef>,
): string {
  if (!combatModuleIds?.length) return '未設定';
  return combatModuleIds
    .map((moduleId, index) => {
      const module = combatModuleRegistry[moduleId];
      const label = module?.displayName ?? moduleId;
      return index === 0 ? `A:${label}` : `B:${label}`;
    })
    .join(' · ');
}
