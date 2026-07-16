import { describe, expect, it } from 'vitest';
import classesJson from '../../../data/classes.json';
import enemiesJson from '../../../data/enemies.json';
import partiesJson from '../../../data/parties.json';
import stagesDemoJson from '../../../data/stages-demo.json';
import type { ActiveSkillDef, CombatModuleDef, PassiveSkillDef } from '../types.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from '../types.ts';
import { tryLoadGameData } from './loadGameData.ts';
import { synthesizeCombatModuleSkill } from './synthesizeCombatModuleSkill.ts';
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

const legacyClassShell = {
  id: 'df_paladin',
  role: 'defender',
  displayName: 'Legacy',
  summary: { ja: 'legacy class without combat modules' },
  formationRow: 'front',
  traits: { rangePx: 30 },
  maxHp: 200,
  atk: 10,
  def: 20,
  res: 0,
  jobTier: 1,
  attackSpeedTier: 'normal',
  growthTier: { maxHp: 2, atk: 2, def: 2 },
  basicAttackSkillId: 'df_paladin_basic_attack',
  passiveIds: [],
  skills: [{ level: 0, skillIds: [] }],
};

describe('combat module data (R5b)', () => {
  it('loads combat modules in real game data bundle', () => {
    const loaded = tryLoadGameData();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const registry = loaded.data.combatModuleRegistry;
    expect(Object.keys(registry).length).toBe(10);
    expect(registry.df_guardian_mod_nearest_strike.classId).toBe('df_guardian');
  });

  it('R5 target classes each reference exactly 2 combat modules', () => {
    const parsed = parseAndValidateGameDataJson(loadRealBundle());
    for (const classId of R5_COMBAT_MODULE_CLASS_IDS) {
      const cls = parsed.classes.find((entry) => entry.id === classId);
      expect(cls?.combatModuleIds).toHaveLength(2);
      for (const moduleId of cls?.combatModuleIds ?? []) {
        expect(parsed.combatModules.some((module) => module.id === moduleId)).toBe(
          true,
        );
        expect(parsed.combatModules.find((module) => module.id === moduleId)?.classId).toBe(
          classId,
        );
      }
    }
  });

  it('synthesizes module action into ActiveSkillDef using attackIntervalSec', () => {
    const module = loadMergedCombatModulesForTest()[0];
    const skill = synthesizeCombatModuleSkill(module);
    expect(skill.id).toBe(module.id);
    expect(skill.trigger).toEqual({ kind: 'time', value: module.attackIntervalSec });
    expect(skill.effect.length).toBeGreaterThan(0);
  });

  it('rejects unknown combatModuleId on class', () => {
    const bundle = loadRealBundle();
    const classes = structuredClone(bundle.classes) as typeof classesJson;
    const target = classes.find((cls) => cls.id === 'df_guardian');
    if (!target?.combatModuleIds) throw new Error('missing df_guardian combatModuleIds');
    target.combatModuleIds = ['df_guardian_mod_nearest_strike', 'missing_module'];

    expect(() => parseAndValidateGameDataJson({ ...bundle, classes })).toThrow(
      /Unknown combatModuleId "missing_module"/,
    );
  });

  it('rejects combat module referenced by another class', () => {
    const bundle = loadRealBundle();
    const classes = structuredClone(bundle.classes) as typeof classesJson;
    const target = classes.find((cls) => cls.id === 'at_swordsman');
    if (!target?.combatModuleIds) throw new Error('missing at_swordsman combatModuleIds');
    target.combatModuleIds = [
      'df_guardian_mod_nearest_strike',
      'at_swordsman_mod_single_slash',
    ];

    expect(() => parseAndValidateGameDataJson({ ...bundle, classes })).toThrow(
      /belongs to class "df_guardian", not "at_swordsman"/,
    );
  });

  it('rejects duplicate combatModuleIds on class', () => {
    const bundle = loadRealBundle();
    const classes = structuredClone(bundle.classes) as typeof classesJson;
    const target = classes.find((cls) => cls.id === 'sp_cleric');
    if (!target?.combatModuleIds) throw new Error('missing sp_cleric combatModuleIds');
    target.combatModuleIds = [
      'sp_cleric_mod_single_mend',
      'sp_cleric_mod_single_mend',
    ];

    expect(() => parseAndValidateGameDataJson({ ...bundle, classes })).toThrow(
      /must not contain duplicate module ids/,
    );
  });

  it('rejects attackIntervalSec <= 0', () => {
    const bundle = loadRealBundle();
    const combatModules = structuredClone(bundle.combatModules);
    combatModules[0] = { ...combatModules[0], attackIntervalSec: 0 };

    expect(() =>
      parseAndValidateGameDataJson({ ...bundle, combatModules }),
    ).toThrow(/attackIntervalSec.*positive number/);
  });

  it('allows legacy class without combatModuleIds', () => {
    const skills = loadMergedSkillsForValidateTest();
    expect(() =>
      parseAndValidateGameDataJson({
        classes: [legacyClassShell],
        skills,
        combatModules: [],
        enemies: [],
        stages: [],
        parties: {
          test: {
            name: 'Test',
            members: [
              {
                classId: 'df_paladin',
                build: {
                  learnedPassiveIds: [],
                  learnedActiveIds: [],
                  equippedActiveSlots: [],
                },
              },
            ],
          },
        },
      }),
    ).not.toThrow();
  });

  it('accepts real bundle with existing validate tests baseline', () => {
    expect(() => parseAndValidateGameDataJson(loadRealBundle())).not.toThrow();
  });

  it('R12g-d1: parses iron guardian M1 permanent physical DR and M2 runtimeEffect', () => {
    const parsed = parseAndValidateGameDataJson(loadRealBundle());
    const m1 = parsed.combatModules.find(
      (module) => module.id === 'df_guardian_mod_nearest_strike',
    );
    const m2 = parsed.combatModules.find(
      (module) => module.id === 'df_guardian_mod_guard_focus',
    );
    expect(m1?.runtimeEffect).toEqual({
      kind: 'physicalDamageTakenReduction',
      takenMultiplier: 0.85,
    });
    expect(m2?.runtimeEffect).toEqual({
      kind: 'healOnEnemyAttackHpHit',
      flatAmount: 20,
    });
  });

  it('R12g-d2: parses paladin M1/M2 runtimeEffect from CombatModule data', () => {
    const parsed = parseAndValidateGameDataJson(loadRealBundle());
    const m1 = parsed.combatModules.find(
      (module) => module.id === 'df_paladin_mod_frontline_ward',
    );
    const m2 = parsed.combatModules.find(
      (module) => module.id === 'df_paladin_mod_danger_guard',
    );
    expect(m1?.runtimeEffect).toEqual({
      kind: 'protectFrontlineAllies',
      maxTargets: 4,
      magicDamageTakenMultiplier: 0.85,
      allDamageTakenMultiplier: 0.95,
    });
    expect(m2?.runtimeEffect).toEqual({
      kind: 'protectDangerTarget',
      maxTargets: 1,
      windowSec: 2,
      allDamageTakenMultiplier: 0.85,
      magicDamageTakenMultiplier: 0.85,
      durationSec: 4,
    });
    const cls = parsed.classes.find((entry) => entry.id === 'df_paladin');
    expect(cls?.combatModuleIds).toEqual([
      'df_paladin_mod_frontline_ward',
      'df_paladin_mod_danger_guard',
    ]);
  });

  it('R12g-d3: parses cleric M1/M2 heal CombatModule data', () => {
    const parsed = parseAndValidateGameDataJson(loadRealBundle());
    const m1 = parsed.combatModules.find(
      (module) => module.id === 'sp_cleric_mod_single_mend',
    );
    const m2 = parsed.combatModules.find(
      (module) => module.id === 'sp_cleric_mod_party_mend',
    );
    expect(m1?.action.effect[0]?.type).toBe('heal');
    expect(m1?.action.targetShape ?? 'single').toBe('single');
    expect(m2?.action.targetShape).toBe('multiLock');
    expect(m2?.action.hitCount).toBeGreaterThanOrEqual(2);
    expect(m2?.action.effectRange?.refillSameTargetOnShortfall).toBe(false);
    expect(m1?.runtimeEffect).toBeUndefined();
    expect(m2?.runtimeEffect).toBeUndefined();
    const cls = parsed.classes.find((entry) => entry.id === 'sp_cleric');
    expect(cls?.combatModuleIds).toEqual([
      'sp_cleric_mod_single_mend',
      'sp_cleric_mod_party_mend',
    ]);
  });

  it('rejects protectFrontlineAllies invalid multipliers / maxTargets', () => {
    const bundle = loadRealBundle();
    for (const magicDamageTakenMultiplier of [0, -0.1, 1.1, Number.NaN]) {
      const combatModules = structuredClone(bundle.combatModules);
      const m1 = combatModules.find(
        (module) => module.id === 'df_paladin_mod_frontline_ward',
      )!;
      m1.runtimeEffect = {
        kind: 'protectFrontlineAllies',
        maxTargets: 4,
        magicDamageTakenMultiplier,
      };
      expect(() =>
        parseAndValidateGameDataJson({ ...bundle, combatModules }),
      ).toThrow(/magicDamageTakenMultiplier/);
    }
    const combatModules = structuredClone(bundle.combatModules);
    const m1 = combatModules.find(
      (module) => module.id === 'df_paladin_mod_frontline_ward',
    )!;
    m1.runtimeEffect = {
      kind: 'protectFrontlineAllies',
      maxTargets: 0,
      magicDamageTakenMultiplier: 0.85,
    };
    expect(() =>
      parseAndValidateGameDataJson({ ...bundle, combatModules }),
    ).toThrow(/maxTargets/);
  });

  it('rejects protectDangerTarget invalid window / duration / multipliers', () => {
    const bundle = loadRealBundle();
    const cases: Array<Record<string, unknown>> = [
      { windowSec: -1 },
      { durationSec: 0 },
      { durationSec: -2 },
      { allDamageTakenMultiplier: 0 },
      { magicDamageTakenMultiplier: 1.5 },
      { maxTargets: 0 },
    ];
    for (const patch of cases) {
      const combatModules = structuredClone(bundle.combatModules);
      const m2 = combatModules.find(
        (module) => module.id === 'df_paladin_mod_danger_guard',
      )!;
      m2.runtimeEffect = {
        kind: 'protectDangerTarget',
        maxTargets: 1,
        windowSec: 2,
        allDamageTakenMultiplier: 0.85,
        magicDamageTakenMultiplier: 0.85,
        durationSec: 4,
        ...patch,
      };
      expect(() =>
        parseAndValidateGameDataJson({ ...bundle, combatModules }),
      ).toThrow();
    }
  });

  it('rejects unknown runtimeEffect kind', () => {
    const bundle = loadRealBundle();
    const combatModules = structuredClone(bundle.combatModules);
    const m2 = combatModules.find(
      (module) => module.id === 'df_guardian_mod_guard_focus',
    )!;
    m2.runtimeEffect = {
      kind: 'unknownKind' as 'healOnEnemyAttackHpHit',
      flatAmount: 20,
    };
    expect(() =>
      parseAndValidateGameDataJson({ ...bundle, combatModules }),
    ).toThrow(/unknown runtimeEffect kind/);
  });

  it('rejects runtimeEffect flatAmount <= 0 / NaN', () => {
    const bundle = loadRealBundle();
    for (const flatAmount of [0, -1, Number.NaN]) {
      const combatModules = structuredClone(bundle.combatModules);
      const m2 = combatModules.find(
        (module) => module.id === 'df_guardian_mod_guard_focus',
      )!;
      m2.runtimeEffect = { kind: 'healOnEnemyAttackHpHit', flatAmount };
      expect(() =>
        parseAndValidateGameDataJson({ ...bundle, combatModules }),
      ).toThrow(/flatAmount/);
    }
  });

  it('rejects physicalDamageTakenReduction takenMultiplier out of range', () => {
    const bundle = loadRealBundle();
    for (const takenMultiplier of [0, -0.1, 1.1, Number.NaN]) {
      const combatModules = structuredClone(bundle.combatModules);
      const m1 = combatModules.find(
        (module) => module.id === 'df_guardian_mod_nearest_strike',
      )!;
      m1.runtimeEffect = {
        kind: 'physicalDamageTakenReduction',
        takenMultiplier,
      };
      expect(() =>
        parseAndValidateGameDataJson({ ...bundle, combatModules }),
      ).toThrow(/takenMultiplier/);
    }
  });
});
