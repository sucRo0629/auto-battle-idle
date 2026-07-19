import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import partiesJson from '../../data/parties.json';
import problemSeriesCatalogJson from '../../data/problem-series-catalog.json';
import stagesJson from '@game-data/stages';
import type { CombatModuleDef } from '../battle/types.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from '../battle/types.ts';
import { loadGameData, tryLoadGameData } from '../battle/data/loadGameData.ts';
import { readSkillsRoot } from '../battle/data/skillsJsonFs.ts';
import { parseAndValidateGameDataJson } from '../battle/data/validateGameData.ts';
import type { ClassPresetBeforeEnrich } from '../progression/skillUnlocks.ts';
import {
  buildClassPresetFromDraft,
  classDraftFromPreset,
  initClassSkillEntriesFromPreset,
  validateClassDraftForSave,
} from './editorApi.ts';

const combatModuleFiles = import.meta.glob<CombatModuleDef[]>(
  '../../data/combat-modules/*.json',
  { eager: true, import: 'default' },
);

function loadCombatModules(): CombatModuleDef[] {
  return Object.values(combatModuleFiles).flat();
}

const TARGET_CLASS_IDS = [
  'df_paladin',
  'at_swordsman',
  'at_assassin',
  'at_sigilist',
] as const;

const ALL_CLASS_IDS = (classesJson as ClassPresetBeforeEnrich[]).map((cls) => cls.id);

function buildEditorClassPickerItems(
  classes: ClassPresetBeforeEnrich[],
  selectedClassId = '',
): { id: string; label: string }[] {
  const items = classes.map((cls) => ({
    id: cls.id,
    label: `${cls.displayName} (${cls.id})`,
  }));
  const selectedId = selectedClassId.trim();
  if (selectedId && !items.some((item) => item.id === selectedId)) {
    items.push({ id: selectedId, label: selectedId });
  }
  return items;
}

function upsertClassById(
  list: ClassPresetBeforeEnrich[],
  item: ClassPresetBeforeEnrich,
): ClassPresetBeforeEnrich[] {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index < 0) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
}

describe('class editor class list (regression)', () => {
  it('classes.json contains all expected class ids including regression targets', () => {
    expect(ALL_CLASS_IDS).toHaveLength(15);
    for (const classId of TARGET_CLASS_IDS) {
      expect(ALL_CLASS_IDS).toContain(classId);
    }
  });

  it('runtime registry includes every classes.json entry', () => {
    const loaded = tryLoadGameData();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    for (const classId of ALL_CLASS_IDS) {
      expect(loaded.data.classRegistry[classId]).toBeDefined();
    }
    expect(loaded.data.classOrder).toEqual(ALL_CLASS_IDS);
  });

  it('R5 module classes and legacy classes coexist in runtime registry', () => {
    const gameData = loadGameData();
    for (const classId of R5_COMBAT_MODULE_CLASS_IDS) {
      expect(gameData.classRegistry[classId]?.combatModuleIds).toHaveLength(2);
    }
    for (const classId of TARGET_CLASS_IDS) {
      expect(gameData.classRegistry[classId]).toBeDefined();
    }
    expect(gameData.classRegistry.df_paladin?.combatModuleIds).toEqual([
      'df_paladin_mod_frontline_ward',
      'df_paladin_mod_danger_guard',
    ]);
    expect(gameData.classRegistry.at_assassin?.combatModuleIds).toEqual([
      'at_assassin_mod_rear_intrude',
      'at_assassin_mod_frontline_finish',
    ]);
    expect(gameData.classRegistry.at_sigilist?.combatModuleIds).toBeUndefined();
  });

  it('editor API payload shape includes every class (simulated readJsonFile)', () => {
    const fromDisk = JSON.parse(
      fs.readFileSync('data/classes.json', 'utf8'),
    ) as ClassPresetBeforeEnrich[];
    expect(fromDisk.map((cls) => cls.id)).toEqual(ALL_CLASS_IDS);
  });

  it('class editor picker lists every class without combatModuleIds filtering', () => {
    const pickerIds = buildEditorClassPickerItems(
      classesJson as ClassPresetBeforeEnrich[],
    ).map((item) => item.id);
    expect(pickerIds).toHaveLength(15);
    for (const classId of TARGET_CLASS_IDS) {
      expect(pickerIds).toContain(classId);
    }
  });

  it('class editor picker keeps session-selected unknown class id', () => {
    const pickerIds = buildEditorClassPickerItems([], 'df_paladin').map(
      (item) => item.id,
    );
    expect(pickerIds).toEqual(['df_paladin']);
  });

  it('role/category differences do not exclude classes from picker', () => {
    const classes = classesJson as ClassPresetBeforeEnrich[];
    const roles = new Set(classes.map((cls) => cls.role));
    expect(roles.has('defender')).toBe(true);
    expect(roles.has('attacker')).toBe(true);
    const pickerIds = buildEditorClassPickerItems(classes).map((item) => item.id);
    for (const classId of TARGET_CLASS_IDS) {
      expect(pickerIds).toContain(classId);
    }
  });

  it('classOrder-unlisted ids still appear at end when sorting picker', () => {
    const partialOrder = ['df_guardian', 'sp_cleric'];
    const pickerIds = buildEditorClassPickerItems(
      classesJson as ClassPresetBeforeEnrich[],
    ).map((item) => item.id);
    const unlisted = pickerIds.filter((id) => !partialOrder.includes(id));
    expect(unlisted).toContain('df_paladin');
    expect(unlisted).toContain('at_swordsman');
    expect(unlisted).toContain('at_assassin');
    expect(unlisted).toContain('at_sigilist');
  });

  it('class bundle upsert preserves every other class including regression targets', () => {
    const classes = classesJson as ClassPresetBeforeEnrich[];
    const guardian = classes.find((cls) => cls.id === 'df_guardian');
    expect(guardian).toBeDefined();
    const nextClasses = upsertClassById(classes, {
      ...guardian!,
      displayName: '鉄衛士（保存テスト）',
    });
    expect(nextClasses).toHaveLength(15);
    for (const classId of TARGET_CLASS_IDS) {
      expect(nextClasses.some((cls) => cls.id === classId)).toBe(true);
    }
  });

  it('editor validation requires combatModules when R5 refs are present', () => {
    const payload = {
      classes: classesJson,
      skills: readSkillsRoot(),
      enemies: enemiesJson,
      stages: stagesJson,
      parties: partiesJson,
      problemSeriesCatalog: problemSeriesCatalogJson,
    };
    expect(() => parseAndValidateGameDataJson(payload, { mode: 'editor' })).toThrow(
      /combatModuleId/,
    );
    expect(() =>
      parseAndValidateGameDataJson(
        { ...payload, combatModules: loadCombatModules() },
        { mode: 'editor' },
      ),
    ).not.toThrow();
  });

  it('legacy classes without combatModuleIds are not excluded by validate', () => {
    const bundle = {
      classes: classesJson,
      skills: readSkillsRoot(),
      combatModules: loadCombatModules(),
      enemies: enemiesJson,
      stages: stagesJson,
      parties: partiesJson,
      problemSeriesCatalog: problemSeriesCatalogJson,
    };
    const parsed = parseAndValidateGameDataJson(bundle, { mode: 'editor' });
    for (const classId of TARGET_CLASS_IDS) {
      expect(parsed.classes.some((cls) => cls.id === classId)).toBe(true);
    }
  });

  it('R5 class combatModuleIds swap passes client validate and editor parse', () => {
    const gameData = loadGameData();
    const classes = classesJson as ClassPresetBeforeEnrich[];
    const guardian = classes.find((cls) => cls.id === 'df_guardian');
    expect(guardian).toBeDefined();

    const draft = classDraftFromPreset(guardian!);
    const original = draft.class.combatModuleIds!;
    draft.class.combatModuleIds = [original[1], original[0]];

    validateClassDraftForSave(draft, {
      combatModuleRegistry: gameData.combatModuleRegistry,
    });

    const skills = readSkillsRoot();
    const entries = initClassSkillEntriesFromPreset(draft.class, skills);
    const savedClass = buildClassPresetFromDraft(draft, entries);
    const nextClasses = upsertClassById(classes, savedClass);

    expect(() =>
      parseAndValidateGameDataJson(
        {
          classes: nextClasses,
          skills,
          combatModules: loadCombatModules(),
          enemies: enemiesJson,
          stages: stagesJson,
          parties: partiesJson,
          problemSeriesCatalog: problemSeriesCatalogJson,
        },
        { mode: 'editor' },
      ),
    ).not.toThrow();
    expect(
      nextClasses.find((cls) => cls.id === 'df_guardian')?.combatModuleIds,
    ).toEqual([original[1], original[0]]);
  });

  it('client validate rejects unknown combatModuleId in R5 class pool', () => {
    const gameData = loadGameData();
    const classes = classesJson as ClassPresetBeforeEnrich[];
    const guardian = classes.find((cls) => cls.id === 'df_guardian');
    expect(guardian).toBeDefined();

    const draft = classDraftFromPreset(guardian!);
    draft.class.combatModuleIds = [
      'df_guardian_mod_nearest_strike',
      'df_guardian_mod_unknown_test',
    ];

    expect(() =>
      validateClassDraftForSave(draft, {
        combatModuleRegistry: gameData.combatModuleRegistry,
      }),
    ).toThrow(/未知の combatModuleId/);
  });
});
