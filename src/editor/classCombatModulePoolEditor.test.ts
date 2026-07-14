import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import {
  isClassCombatModulePoolEditable,
  listClassCombatModulePoolOptions,
  setClassCombatModulePoolSlot,
  validateClassCombatModulePoolDraft,
} from './classCombatModulePoolEditor.ts';

function editorContext() {
  const gameData = loadGameData();
  return {
    classRegistry: gameData.classRegistry,
    combatModuleRegistry: gameData.combatModuleRegistry,
  };
}

describe('classCombatModulePoolEditor', () => {
  it('marks only R5 classes as pool-editable', () => {
    expect(isClassCombatModulePoolEditable('df_guardian')).toBe(true);
    expect(isClassCombatModulePoolEditable('at_swordsman')).toBe(true);
    expect(isClassCombatModulePoolEditable('df_paladin')).toBe(false);
    expect(isClassCombatModulePoolEditable('at_assassin')).toBe(false);
  });

  it('lists combat modules for the same class only', () => {
    const { combatModuleRegistry } = editorContext();
    const guardianOptions = listClassCombatModulePoolOptions(
      'df_guardian',
      combatModuleRegistry,
    );
    expect(guardianOptions).toHaveLength(2);
    expect(
      guardianOptions.every((option) => option.moduleId.startsWith('df_guardian_mod_')),
    ).toBe(true);
    expect(listClassCombatModulePoolOptions('df_paladin', combatModuleRegistry)).toEqual(
      [],
    );
  });

  it('swaps slots when selecting a duplicate module id', () => {
    const current: [string, string] = [
      'df_guardian_mod_nearest_strike',
      'df_guardian_mod_guard_focus',
    ];
    const fallback = [...current] as [string, string];
    const next = setClassCombatModulePoolSlot(
      current,
      0,
      'df_guardian_mod_guard_focus',
      fallback,
    );
    expect(next).toEqual([
      'df_guardian_mod_guard_focus',
      'df_guardian_mod_nearest_strike',
    ]);
  });

  it('rejects unknown or cross-class module ids', () => {
    const { combatModuleRegistry } = editorContext();
    const valid = validateClassCombatModulePoolDraft(
      'df_guardian',
      ['df_guardian_mod_nearest_strike', 'df_guardian_mod_guard_focus'],
      combatModuleRegistry,
    );
    expect(valid).toBeNull();

    expect(
      validateClassCombatModulePoolDraft(
        'df_guardian',
        ['df_guardian_mod_nearest_strike', 'at_swordsman_mod_single_slash'],
        combatModuleRegistry,
      ),
    ).toMatch(/兵科 "df_guardian"/);

    expect(
      validateClassCombatModulePoolDraft(
        'df_guardian',
        ['df_guardian_mod_nearest_strike', 'df_guardian_mod_nearest_strike'],
        combatModuleRegistry,
      ),
    ).toMatch(/同じ module/);

    expect(
      validateClassCombatModulePoolDraft(
        'df_paladin',
        undefined,
        combatModuleRegistry,
      ),
    ).toBeNull();
  });
});
