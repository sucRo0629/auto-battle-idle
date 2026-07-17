/**
 * R12g-g — validation / authoring 統合。
 * 全正式 CombatModule（8 兵科 × M1/M2）の authoring 経路を横断保証する。
 */
import { describe, expect, it } from 'vitest';
import classesJson from '../../data/classes.json';
import enemiesJson from '../../data/enemies.json';
import partiesJson from '../../data/parties.json';
import operationPassiveCatalogJson from '../../data/operation-passive-catalog.json';
import stagesJson from '@game-data/stages';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { readSkillsRoot } from '../battle/data/skillsJsonFs.ts';
import { parseAndValidateGameDataJson } from '../battle/data/validateGameData.ts';
import type { CombatModuleDef } from '../battle/types.ts';
import { listCombatModuleAuthoringClassIds } from './combatModuleEditor.ts';
import {
  combatModuleFilesFromDraft,
  combatModulesDraftFromModules,
  normalizeCombatModulesDraftForSave,
  validateCombatModulesDraftForSave,
} from './editorApi.ts';

const gameData = loadGameData();

function deriveOfficialAuthoringContext() {
  const registryModules = Object.values(gameData.combatModuleRegistry);
  const classIds = listCombatModuleAuthoringClassIds(registryModules);

  const modulesFromClassRefs = classIds.flatMap((classId) => {
    const cls = gameData.classRegistry[classId];
    expect(cls?.combatModuleIds).toHaveLength(2);
    return cls!.combatModuleIds!.map((moduleId) => {
      const module = gameData.combatModuleRegistry[moduleId];
      expect(module).toBeDefined();
      expect(module!.classId).toBe(classId);
      return module!;
    });
  });

  return {
    classIds,
    registryModules,
    modulesFromClassRefs,
  };
}

function roundTripCombatModules(
  sourceModules: readonly CombatModuleDef[],
): CombatModuleDef[] {
  let draft = combatModulesDraftFromModules([...sourceModules]);
  expect(validateCombatModulesDraftForSave(draft)).toBeNull();

  draft = normalizeCombatModulesDraftForSave(draft);
  expect(validateCombatModulesDraftForSave(draft)).toBeNull();

  const files = combatModuleFilesFromDraft(draft);
  const reloaded = files.flatMap((file) => file.modules);
  expect(reloaded).toHaveLength(sourceModules.length);

  return normalizeCombatModulesDraftForSave(
    combatModulesDraftFromModules(reloaded),
  );
}

function gameDataBundle(combatModules: CombatModuleDef[]) {
  return {
    classes: classesJson,
    enemies: enemiesJson,
    parties: partiesJson,
    stages: stagesJson,
    skills: readSkillsRoot(),
    combatModules,
    operationPassiveCatalog: operationPassiveCatalogJson,
  };
}

function findModuleByRuntimeKind(
  modules: readonly CombatModuleDef[],
  kind: NonNullable<CombatModuleDef['runtimeEffect']>['kind'],
): CombatModuleDef | undefined {
  return modules.find((module) => module.runtimeEffect?.kind === kind);
}

function findModuleWithDangerTarget(
  modules: readonly CombatModuleDef[],
): CombatModuleDef | undefined {
  return modules.find((module) =>
    module.action.effect.some(
      (effect) => 'target' in effect && effect.target?.kind === 'danger',
    ),
  );
}

function findModuleWithRequireBelow(
  modules: readonly CombatModuleDef[],
): CombatModuleDef | undefined {
  return modules.find((module) => {
    const effect = module.action.effect[0];
    const target = effect && 'target' in effect ? effect.target : undefined;
    return (
      target &&
      'requireBelow' in target &&
      target.requireBelow !== undefined
    );
  });
}

function primaryEffectTarget(module: CombatModuleDef | undefined) {
  const effect = module?.action.effect[0];
  return effect && 'target' in effect ? effect.target : undefined;
}

function assertSignatureFieldsPreserved(
  source: CombatModuleDef[],
  roundTripped: CombatModuleDef[],
): void {
  const byId = (modules: CombatModuleDef[]) =>
    new Map(modules.map((module) => [module.id, module]));

  const sourceById = byId(source);
  const tripById = byId(roundTripped);

  for (const [id, original] of sourceById) {
    expect(tripById.get(id)).toEqual(original);
  }

  const physicalDrSource = findModuleByRuntimeKind(
    source,
    'physicalDamageTakenReduction',
  );
  const physicalDr = findModuleByRuntimeKind(
    roundTripped,
    'physicalDamageTakenReduction',
  );
  expect(physicalDr?.runtimeEffect?.kind).toBe('physicalDamageTakenReduction');
  expect(physicalDr?.runtimeEffect).toEqual(physicalDrSource?.runtimeEffect);
  expect(physicalDr?.runtimeEffect).toHaveProperty('takenMultiplier');

  const healOnHitSource = findModuleByRuntimeKind(
    source,
    'healOnEnemyAttackHpHit',
  );
  const healOnHit = findModuleByRuntimeKind(
    roundTripped,
    'healOnEnemyAttackHpHit',
  );
  expect(healOnHit?.runtimeEffect?.kind).toBe('healOnEnemyAttackHpHit');
  expect(healOnHit?.runtimeEffect).toEqual(healOnHitSource?.runtimeEffect);
  expect(healOnHit?.runtimeEffect).toHaveProperty('flatAmount');

  const protectFrontlineSource = findModuleByRuntimeKind(
    source,
    'protectFrontlineAllies',
  );
  const protectFrontline = findModuleByRuntimeKind(
    roundTripped,
    'protectFrontlineAllies',
  );
  expect(protectFrontline?.runtimeEffect?.kind).toBe('protectFrontlineAllies');
  expect(protectFrontline?.runtimeEffect).toEqual(
    protectFrontlineSource?.runtimeEffect,
  );
  expect(protectFrontline?.runtimeEffect).toHaveProperty('maxTargets');

  const protectDangerSource = findModuleByRuntimeKind(
    source,
    'protectDangerTarget',
  );
  const protectDanger = findModuleByRuntimeKind(
    roundTripped,
    'protectDangerTarget',
  );
  expect(protectDanger?.runtimeEffect?.kind).toBe('protectDangerTarget');
  expect(protectDanger?.runtimeEffect).toEqual(protectDangerSource?.runtimeEffect);
  expect(protectDanger?.runtimeEffect).toHaveProperty('windowSec');

  const dangerTargetModuleSource = findModuleWithDangerTarget(source);
  const dangerTargetModule = findModuleWithDangerTarget(roundTripped);
  expect(primaryEffectTarget(dangerTargetModule)).toMatchObject({
    kind: 'danger',
    side: 'ally',
  });
  expect(primaryEffectTarget(dangerTargetModule)).toEqual(
    primaryEffectTarget(dangerTargetModuleSource),
  );

  const requireBelowModuleSource = findModuleWithRequireBelow(source);
  const requireBelowModule = findModuleWithRequireBelow(roundTripped);
  expect(primaryEffectTarget(requireBelowModule)).toMatchObject({
    kind: 'stat',
    requireBelow: { kind: 'flat' },
  });
  expect(primaryEffectTarget(requireBelowModule)).toEqual(
    primaryEffectTarget(requireBelowModuleSource),
  );

  const chainModuleSource = source.find(
    (module) => module.action.targetShape === 'chain',
  );
  const chainModule = roundTripped.find(
    (module) => module.action.targetShape === 'chain',
  );
  expect(chainModule?.action.targetShape).toBe('chain');
  expect(typeof chainModule?.action.chainCount).toBe('number');
  expect(chainModule?.action.chainCount).toEqual(chainModuleSource?.action.chainCount);

  const refillFalseModuleSource = source.find(
    (module) =>
      module.action.effectRange?.refillSameTargetOnShortfall === false,
  );
  const refillFalseModule = roundTripped.find(
    (module) =>
      module.action.effectRange?.refillSameTargetOnShortfall === false,
  );
  expect(refillFalseModule?.action.effectRange?.refillSameTargetOnShortfall).toBe(
    false,
  );
  expect(refillFalseModule?.action.effectRange).toEqual(
    refillFalseModuleSource?.action.effectRange,
  );
}

describe('combat module authoring integration (R12g-g)', () => {
  describe('formal data set', () => {
    it('derives 8 authoring classes with M1/M2 aligned to class pool and registry', () => {
      const { classIds, registryModules, modulesFromClassRefs } =
        deriveOfficialAuthoringContext();

      expect(classIds).toHaveLength(8);
      expect(registryModules).toHaveLength(16);
      expect(modulesFromClassRefs).toHaveLength(16);

      for (const classId of classIds) {
        const cls = gameData.classRegistry[classId];
        const poolIds = cls?.combatModuleIds ?? [];
        expect(poolIds).toHaveLength(2);
        for (const moduleId of poolIds) {
          expect(gameData.combatModuleRegistry[moduleId]?.classId).toBe(classId);
        }
        const fromRegistry = registryModules.filter(
          (module) => module.classId === classId,
        );
        expect(fromRegistry.map((module) => module.id).sort()).toEqual(
          [...poolIds].sort(),
        );
      }
    });

    it('groups normalized draft into one file per authoring class', () => {
      const { registryModules } = deriveOfficialAuthoringContext();
      const files = combatModuleFilesFromDraft(registryModules);
      expect(files).toHaveLength(8);
      expect(files.every((file) => file.modules.length === 2)).toBe(true);
      expect(files.map((file) => file.classId).sort()).toEqual(
        listCombatModuleAuthoringClassIds(registryModules).sort(),
      );
    });
  });

  describe('full round-trip', () => {
    it('preserves all 16 official modules through draft → normalize → validate → files → reload', () => {
      const { registryModules } = deriveOfficialAuthoringContext();
      const source = normalizeCombatModulesDraftForSave(registryModules);
      const roundTripped = roundTripCombatModules(source);

      expect(roundTripped).toEqual(source);
      assertSignatureFieldsPreserved(source, roundTripped);
    });
  });

  describe('game-data validation', () => {
    it('accepts round-tripped official modules via parseAndValidateGameDataJson (editor mode)', () => {
      const { registryModules } = deriveOfficialAuthoringContext();
      const roundTripped = roundTripCombatModules(registryModules);

      expect(() =>
        parseAndValidateGameDataJson(gameDataBundle(roundTripped), {
          mode: 'editor',
        }),
      ).not.toThrow();
    });
  });

  describe('save validation boundary', () => {
    /**
     * CombatModuleEditorStep は upsert のみで module 行の全削除 UI はない。
     * R12g 追加兵科は R5_COMBAT_MODULE_CLASS_IDS に含まれないため、draft から
     * 当該 class の module を 2 件とも除去した配列は validateCombatModulesDraftForSave
     * だけでは検出されない。classes.json の combatModuleIds 参照は
     * parseAndValidateGameDataJson が拒否する。
     */
    it('R12g-g: R12g-added class with all modules removed slips past draft save validation but fails game-data validation', () => {
      const { registryModules } = deriveOfficialAuthoringContext();
      const withoutPaladin = registryModules.filter(
        (module) => module.classId !== 'df_paladin',
      );
      expect(withoutPaladin).toHaveLength(14);
      expect(validateCombatModulesDraftForSave(withoutPaladin)).toBeNull();

      expect(() =>
        parseAndValidateGameDataJson(gameDataBundle(withoutPaladin), {
          mode: 'editor',
        }),
      ).toThrow(/Unknown combatModuleId/);
    });

    it('R12g-g: R5 class with all modules removed is rejected by draft save validation', () => {
      const { registryModules } = deriveOfficialAuthoringContext();
      const withoutGuardian = registryModules.filter(
        (module) => module.classId !== 'df_guardian',
      );
      expect(withoutGuardian).toHaveLength(14);
      expect(validateCombatModulesDraftForSave(withoutGuardian)).toMatch(
        /df_guardian.*ちょうど 2/,
      );
    });
  });

  describe('invalid value rejection', () => {
    it('validateCombatModulesDraftForSave rejects non-R5 class with wrong module count', () => {
      const { registryModules } = deriveOfficialAuthoringContext();
      const paladinModules = registryModules.filter(
        (module) => module.classId === 'df_paladin',
      );
      expect(paladinModules).toHaveLength(2);
      const trimmed = [
        ...registryModules.filter((module) => module.classId !== 'df_paladin'),
        paladinModules[0]!,
      ];
      expect(validateCombatModulesDraftForSave(trimmed)).toMatch(
        /df_paladin.*ちょうど 2/,
      );
    });

    it('validateCombatModulesDraftForSave rejects attackIntervalSec <= 0', () => {
      const { registryModules } = deriveOfficialAuthoringContext();
      const invalid = structuredClone(registryModules);
      invalid[0] = { ...invalid[0]!, attackIntervalSec: 0 };
      expect(validateCombatModulesDraftForSave(invalid)).toMatch(
        /attackIntervalSec/,
      );
    });
  });
});
