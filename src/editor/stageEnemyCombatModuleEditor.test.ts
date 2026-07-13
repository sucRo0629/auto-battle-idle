import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import type { StageEnemyGroup } from '../battle/types.ts';
import {
  listStageEnemyCombatModuleOptions,
  normalizeStageEnemyGroupCombatModuleForClass,
  resolveStageEnemyCombatModuleDescription,
  setStageEnemyGroupCombatModuleId,
  STAGE_ENEMY_COMBAT_MODULE_UNSPECIFIED,
} from './stageEnemyCombatModuleEditor.ts';

function editorContext() {
  const gameData = loadGameData();
  return {
    classRegistry: gameData.classRegistry,
    combatModuleRegistry: gameData.combatModuleRegistry,
  };
}

describe('stageEnemyCombatModuleEditor', () => {
  it('lists only combat modules for the enemy class', () => {
    const context = editorContext();
    const guardianOptions = listStageEnemyCombatModuleOptions('df_guardian', context);
    const swordsmanOptions = listStageEnemyCombatModuleOptions('at_swordsman', context);

    expect(guardianOptions.length).toBeGreaterThanOrEqual(2);
    expect(guardianOptions.every((option) => option.moduleId.startsWith('df_guardian_mod_'))).toBe(
      true,
    );
    expect(
      guardianOptions.some((option) => option.moduleId === 'at_swordsman_mod_pierce_slash'),
    ).toBe(false);
    expect(swordsmanOptions.every((option) => option.moduleId.startsWith('at_swordsman_mod_'))).toBe(
      true,
    );
  });

  it('does not list legacy classes without combatModuleIds', () => {
    const context = editorContext();
    expect(listStageEnemyCombatModuleOptions('df_paladin', context)).toEqual([]);
    expect(listStageEnemyCombatModuleOptions('at_hunter', context)).toEqual([]);
  });

  it('uses registry display names and descriptions', () => {
    const context = editorContext();
    const [option] = listStageEnemyCombatModuleOptions('df_guardian', context);
    const module = context.combatModuleRegistry[option!.moduleId];

    expect(option!.displayName).toBe(module!.displayName);
    expect(option!.description).toBe(module!.description);
    expect(option!.displayName).not.toBe(option!.moduleId);
  });

  it('clears invalid selectedCombatModuleId when class changes to another branch', () => {
    const context = editorContext();
    const group: StageEnemyGroup = {
      classId: 'df_guardian',
      count: 1,
      selectedCombatModuleId: 'df_guardian_mod_nearest_strike',
    };

    group.classId = 'at_swordsman';
    normalizeStageEnemyGroupCombatModuleForClass(group, context);

    expect(group.selectedCombatModuleId).toBeUndefined();
  });

  it('keeps valid selectedCombatModuleId within the same class branch', () => {
    const context = editorContext();
    const moduleId = 'df_guardian_mod_nearest_strike';
    const group: StageEnemyGroup = {
      classId: 'df_guardian',
      count: 1,
      selectedCombatModuleId: moduleId,
    };

    normalizeStageEnemyGroupCombatModuleForClass(group, context);

    expect(group.selectedCombatModuleId).toBe(moduleId);
  });

  it('sets and clears selectedCombatModuleId without empty strings', () => {
    const group: StageEnemyGroup = { classId: 'df_guardian', count: 1 };

    setStageEnemyGroupCombatModuleId(group, 'df_guardian_mod_guard_focus');
    expect(group.selectedCombatModuleId).toBe('df_guardian_mod_guard_focus');

    setStageEnemyGroupCombatModuleId(group, STAGE_ENEMY_COMBAT_MODULE_UNSPECIFIED);
    expect(group.selectedCombatModuleId).toBeUndefined();
  });

  it('shows default module description when selectedCombatModuleId is omitted', () => {
    const context = editorContext();
    const group: StageEnemyGroup = { classId: 'df_guardian', count: 1 };
    const defaultModuleId = context.classRegistry.df_guardian!.combatModuleIds![0]!;
    const defaultDescription =
      context.combatModuleRegistry[defaultModuleId]!.description;

    expect(resolveStageEnemyCombatModuleDescription(group, context)).toBe(defaultDescription);
  });
});
