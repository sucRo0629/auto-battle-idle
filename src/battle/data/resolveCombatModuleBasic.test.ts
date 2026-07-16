import { describe, expect, it } from 'vitest';
import { loadGameData } from './loadGameData.ts';
import {
  resolveBasicAttackSkillId,
  resolveSelectedCombatModuleId,
} from './resolveCombatModuleBasic.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from '../types.ts';

describe('resolveCombatModuleBasic (R5d fallback)', () => {
  const gameData = loadGameData();

  it('falls back to combatModuleIds[0] when selectedCombatModuleId is undefined', () => {
    const preset = gameData.classRegistry.df_guardian!;
    expect(
      resolveSelectedCombatModuleId(
        preset,
        gameData.combatModuleRegistry,
        undefined,
      ),
    ).toBe('df_guardian_mod_nearest_strike');
  });

  it('falls back to combatModuleIds[0] when selectedCombatModuleId is empty', () => {
    const preset = gameData.classRegistry.at_swordsman!;
    expect(
      resolveSelectedCombatModuleId(preset, gameData.combatModuleRegistry, ''),
    ).toBe('at_swordsman_mod_single_slash');
  });

  it('falls back to combatModuleIds[0] when selected ID is not in class candidates', () => {
    const preset = gameData.classRegistry.df_guardian!;
    expect(
      resolveSelectedCombatModuleId(
        preset,
        gameData.combatModuleRegistry,
        'at_swordsman_mod_pierce_slash',
      ),
    ).toBe('df_guardian_mod_nearest_strike');
  });

  it('falls back to combatModuleIds[0] when selected ID belongs to another class', () => {
    const preset = gameData.classRegistry.sp_cleric!;
    expect(
      resolveSelectedCombatModuleId(
        preset,
        gameData.combatModuleRegistry,
        'at_sorcerer_mod_twin_bolt',
      ),
    ).toBe('sp_cleric_mod_single_mend');
  });

  it('falls back to combatModuleIds[0] for unknown module ID', () => {
    const preset = gameData.classRegistry.at_sorcerer!;
    expect(
      resolveSelectedCombatModuleId(
        preset,
        gameData.combatModuleRegistry,
        'missing_module_id',
      ),
    ).toBe('at_sorcerer_mod_single_bolt');
  });

  it('uses valid selectedCombatModuleId when it matches class candidates', () => {
    const preset = gameData.classRegistry.df_guardian!;
    expect(
      resolveSelectedCombatModuleId(
        preset,
        gameData.combatModuleRegistry,
        'df_guardian_mod_guard_focus',
      ),
    ).toBe('df_guardian_mod_guard_focus');
  });

  it('returns undefined for legacy class without combatModuleIds', () => {
    const preset = gameData.classRegistry.df_duelist!;
    expect(preset.combatModuleIds).toBeUndefined();
    expect(
      resolveSelectedCombatModuleId(
        preset,
        gameData.combatModuleRegistry,
        'df_guardian_mod_nearest_strike',
      ),
    ).toBeUndefined();
    expect(
      resolveBasicAttackSkillId(
        preset,
        gameData.combatModuleRegistry,
        'df_guardian_mod_nearest_strike',
      ),
    ).toBe(preset.basicAttackSkillId);
  });

  it('resolves paladin modules after R12g-d2 combatModuleIds', () => {
    const preset = gameData.classRegistry.df_paladin!;
    expect(preset.combatModuleIds).toEqual([
      'df_paladin_mod_frontline_ward',
      'df_paladin_mod_danger_guard',
    ]);
    expect(
      resolveSelectedCombatModuleId(
        preset,
        gameData.combatModuleRegistry,
        undefined,
      ),
    ).toBe('df_paladin_mod_frontline_ward');
    expect(
      resolveSelectedCombatModuleId(
        preset,
        gameData.combatModuleRegistry,
        'df_paladin_mod_danger_guard',
      ),
    ).toBe('df_paladin_mod_danger_guard');
  });

  it('resolves module B for all R5 target classes when explicitly selected', () => {
    const moduleBByClass: Record<string, string> = {
      df_guardian: 'df_guardian_mod_guard_focus',
      at_swordsman: 'at_swordsman_mod_pierce_slash',
      at_sorcerer: 'at_sorcerer_mod_twin_bolt',
      sp_cleric: 'sp_cleric_mod_party_mend',
    };

    for (const classId of R5_COMBAT_MODULE_CLASS_IDS) {
      const preset = gameData.classRegistry[classId]!;
      const moduleB = moduleBByClass[classId];
      expect(
        resolveSelectedCombatModuleId(
          preset,
          gameData.combatModuleRegistry,
          moduleB,
        ),
      ).toBe(moduleB);
      expect(
        resolveBasicAttackSkillId(
          preset,
          gameData.combatModuleRegistry,
          moduleB,
        ),
      ).toBe(moduleB);
    }
  });
});
