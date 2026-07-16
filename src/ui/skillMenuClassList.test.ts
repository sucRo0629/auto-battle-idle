import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import type { ClassPreset, GameData } from '../battle/types.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from '../battle/types.ts';
import { getClassSelectionVisibleClassIds } from './SkillMenuPanel.ts';

const REPORTED_MISSING_CLASS_IDS = [
  'df_paladin',
  'at_swordsman',
  'at_assassin',
  'at_sigilist',
] as const;

describe('game class selection list', () => {
  it('shows every runtime class regardless of unlockedClassIds', () => {
    const gameData = loadGameData();
    const visible = getClassSelectionVisibleClassIds(gameData);

    expect(visible).toEqual(gameData.classOrder);
    expect(visible).toHaveLength(Object.keys(gameData.classRegistry).length);
  });

  it('shows all four classes reported missing', () => {
    const visible = getClassSelectionVisibleClassIds(loadGameData());

    for (const classId of REPORTED_MISSING_CLASS_IDS) {
      expect(visible).toContain(classId);
    }
  });

  it('shows R5 module classes and module-unaware legacy classes together', () => {
    const gameData = loadGameData();
    const visible = getClassSelectionVisibleClassIds(gameData);

    for (const classId of R5_COMBAT_MODULE_CLASS_IDS) {
      expect(visible).toContain(classId);
    }
    // Survival Module data 済み（R12g-d2 / d4）
    expect(gameData.classRegistry.df_paladin?.combatModuleIds).toEqual([
      'df_paladin_mod_frontline_ward',
      'df_paladin_mod_danger_guard',
    ]);
    expect(gameData.classRegistry.sp_wardweaver?.combatModuleIds).toEqual([
      'sp_wardweaver_mod_focus_barrier',
      'sp_wardweaver_mod_spread_barrier',
    ]);
    expect(gameData.classRegistry.at_assassin?.combatModuleIds).toEqual([
      'at_assassin_mod_rear_intrude',
      'at_assassin_mod_frontline_finish',
    ]);
    // 未入力の legacy
    expect(gameData.classRegistry.at_sigilist?.combatModuleIds).toBeUndefined();
  });

  it('retains a registry class omitted from classOrder at the end', () => {
    const gameData = structuredClone(loadGameData());
    const extra = structuredClone(gameData.classRegistry.df_paladin) as ClassPreset;
    extra.id = 'test_unordered_class';
    const withUnorderedClass: GameData = {
      ...gameData,
      classRegistry: {
        ...gameData.classRegistry,
        [extra.id]: extra,
      },
    };

    const visible = getClassSelectionVisibleClassIds(withUnorderedClass);
    expect(visible.at(-1)).toBe('test_unordered_class');
  });

  it('does not remove classes already selected in a party', () => {
    const gameData = loadGameData();
    const selectedClassIds = [
      'df_paladin',
      'at_swordsman',
      'at_assassin',
    ];
    const visible = getClassSelectionVisibleClassIds(gameData);

    for (const classId of selectedClassIds) {
      expect(visible).toContain(classId);
    }
  });
});
