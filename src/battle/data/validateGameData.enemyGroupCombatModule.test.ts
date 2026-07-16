import { describe, expect, it } from 'vitest';
import classesJson from '../../../data/classes.json';
import enemiesJson from '../../../data/enemies.json';
import partiesJson from '../../../data/parties.json';
import stagesDemoJson from '../../../data/stages-demo.json';
import type { ActiveSkillDef, CombatModuleDef, PassiveSkillDef } from '../types.ts';
import { parseAndValidateGameDataJson } from './validateGameData.ts';

const passiveModules = import.meta.glob<PassiveSkillDef[]>(
  '../../../data/skills/passives/*.json',
  { eager: true, import: 'default' },
);

const activeModules = import.meta.glob<ActiveSkillDef[]>(
  '../../../data/skills/actives/*.json',
  { eager: true, import: 'default' },
);

const combatModuleFiles = import.meta.glob<CombatModuleDef[]>(
  '../../../data/combat-modules/*.json',
  { eager: true, import: 'default' },
);

function loadMergedSkillsForValidateTest(): {
  passives: PassiveSkillDef[];
  actives: ActiveSkillDef[];
} {
  return {
    passives: Object.values(passiveModules).flat(),
    actives: Object.values(activeModules).flat(),
  };
}

function loadMergedCombatModulesForTest(): CombatModuleDef[] {
  return Object.values(combatModuleFiles).flat();
}

function loadRealBundle() {
  const skills = loadMergedSkillsForValidateTest();
  return {
    classes: classesJson,
    skills,
    combatModules: loadMergedCombatModulesForTest(),
    enemies: enemiesJson,
    stages: stagesDemoJson,
    parties: partiesJson,
  };
}

function stageWithEnemyGroup(
  enemyGroups: Array<Record<string, unknown>>,
  recommendedLevel = 10,
) {
  return [
    {
      id: 'module_group_test',
      displayName: 'Module Group Test',
      recommendedLevel,
      enemyGroups,
      waves: [{ enemies: [] }],
    },
  ];
}

describe('StageEnemyGroup selectedCombatModuleId validate (R5e)', () => {
  it('1. omits selectedCombatModuleId on group — valid', () => {
    const bundle = loadRealBundle();
    expect(() =>
      parseAndValidateGameDataJson({
        ...bundle,
        stages: stageWithEnemyGroup([{ classId: 'df_guardian', count: 1 }]),
      }),
    ).not.toThrow();
  });

  it('2. module A on own class — valid', () => {
    const bundle = loadRealBundle();
    expect(() =>
      parseAndValidateGameDataJson({
        ...bundle,
        stages: stageWithEnemyGroup([
          {
            classId: 'df_guardian',
            count: 1,
            selectedCombatModuleId: 'df_guardian_mod_nearest_strike',
          },
        ]),
      }),
    ).not.toThrow();
  });

  it('3. module B on own class — valid', () => {
    const bundle = loadRealBundle();
    expect(() =>
      parseAndValidateGameDataJson({
        ...bundle,
        stages: stageWithEnemyGroup([
          {
            classId: 'at_sorcerer',
            count: 2,
            selectedCombatModuleId: 'at_sorcerer_mod_twin_bolt',
          },
        ]),
      }),
    ).not.toThrow();
  });

  it('4. unknown module ID — error', () => {
    const bundle = loadRealBundle();
    expect(() =>
      parseAndValidateGameDataJson({
        ...bundle,
        stages: stageWithEnemyGroup([
          {
            classId: 'df_guardian',
            count: 1,
            selectedCombatModuleId: 'missing_module_id',
          },
        ]),
      }),
    ).toThrow(/Unknown selectedCombatModuleId "missing_module_id"/);
  });

  it('5. other class module ID — error', () => {
    const bundle = loadRealBundle();
    expect(() =>
      parseAndValidateGameDataJson({
        ...bundle,
        stages: stageWithEnemyGroup([
          {
            classId: 'df_guardian',
            count: 1,
            selectedCombatModuleId: 'at_sorcerer_mod_twin_bolt',
          },
        ]),
      }),
    ).toThrow(
      /selectedCombatModuleId "at_sorcerer_mod_twin_bolt" belongs to class "at_sorcerer", not "df_guardian"/,
    );
  });

  it('6. module not listed in class combatModuleIds — error', () => {
    const bundle = loadRealBundle();
    const combatModules = structuredClone(bundle.combatModules);
    combatModules.push({
      id: 'df_guardian_mod_orphan_test',
      classId: 'df_guardian',
      displayName: 'orphan',
      description: 'test orphan module',
      attackIntervalSec: 2,
      action: {
        effect: [
          {
            target: { kind: 'self' },
            type: 'buff',
            buffSubKind: 'stat',
            buffStat: 'def',
            buffMultiplier: 1.1,
            buffDurationSec: 1,
          },
        ],
      },
    });

    expect(() =>
      parseAndValidateGameDataJson({
        ...bundle,
        combatModules,
        stages: stageWithEnemyGroup([
          {
            classId: 'df_guardian',
            count: 1,
            selectedCombatModuleId: 'df_guardian_mod_orphan_test',
          },
        ]),
      }),
    ).toThrow(
      /selectedCombatModuleId "df_guardian_mod_orphan_test" is not listed in combatModuleIds for class "df_guardian"/,
    );
  });

  it('7. legacy class with selectedCombatModuleId — error', () => {
    const bundle = loadRealBundle();
    expect(() =>
      parseAndValidateGameDataJson({
        ...bundle,
        stages: stageWithEnemyGroup([
          {
            classId: 'at_lancer',
            count: 1,
            selectedCombatModuleId: 'df_guardian_mod_nearest_strike',
          },
        ]),
      }),
    ).toThrow(
      /selectedCombatModuleId is not allowed for legacy class "at_lancer"/,
    );
  });
});
