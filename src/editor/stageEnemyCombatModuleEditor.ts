import { isValidSelectedCombatModuleId } from '../battle/data/resolveCombatModuleBasic.ts';
import type {
  ClassId,
  ClassPreset,
  CombatModuleDef,
  StageEnemyGroup,
} from '../battle/types.ts';

/** editor select: 未指定 = runtime 既定（combatModuleIds[0]） */
export const STAGE_ENEMY_COMBAT_MODULE_UNSPECIFIED = '';

export interface StageEnemyCombatModuleOption {
  moduleId: string;
  displayName: string;
  description: string;
}

export interface StageEnemyCombatModuleEditorContext {
  classRegistry: Record<ClassId, ClassPreset>;
  combatModuleRegistry: Record<string, CombatModuleDef>;
}

export function listStageEnemyCombatModuleOptions(
  classId: ClassId,
  context: StageEnemyCombatModuleEditorContext,
): StageEnemyCombatModuleOption[] {
  const preset = context.classRegistry[classId];
  const moduleIds = preset?.combatModuleIds;
  if (!moduleIds || moduleIds.length === 0) return [];

  return moduleIds.map((moduleId) => {
    const module = context.combatModuleRegistry[moduleId];
    return {
      moduleId,
      displayName: module?.displayName ?? moduleId,
      description: module?.description ?? '',
    };
  });
}

export function resolveStageEnemyCombatModuleDescription(
  group: StageEnemyGroup,
  context: StageEnemyCombatModuleEditorContext,
): string {
  const displayed = resolveStageEnemyCombatModuleForDisplay(group, context);
  return displayed?.description ?? '';
}

export function resolveStageEnemyCombatModuleForDisplay(
  group: StageEnemyGroup,
  context: StageEnemyCombatModuleEditorContext,
): CombatModuleDef | undefined {
  const preset = context.classRegistry[group.classId];
  if (!preset?.combatModuleIds?.length) return undefined;

  const moduleId =
    group.selectedCombatModuleId && group.selectedCombatModuleId.length > 0
      ? group.selectedCombatModuleId
      : preset.combatModuleIds[0];
  if (!moduleId) return undefined;
  return context.combatModuleRegistry[moduleId];
}

export function normalizeStageEnemyGroupCombatModuleForClass(
  group: StageEnemyGroup,
  context: StageEnemyCombatModuleEditorContext,
): void {
  const selected = group.selectedCombatModuleId;
  if (!selected) return;

  const preset = context.classRegistry[group.classId];
  if (
    !preset ||
    !isValidSelectedCombatModuleId(preset, context.combatModuleRegistry, selected)
  ) {
    delete group.selectedCombatModuleId;
  }
}

export function setStageEnemyGroupCombatModuleId(
  group: StageEnemyGroup,
  moduleId: string,
): void {
  if (moduleId === STAGE_ENEMY_COMBAT_MODULE_UNSPECIFIED) {
    delete group.selectedCombatModuleId;
    return;
  }
  group.selectedCombatModuleId = moduleId;
}
