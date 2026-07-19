import { describe, expect, it } from 'vitest';
import { parseAndValidateGameDataJson } from '../battle/data/validateGameData.ts';
import {
  loadValidationPayload,
  validateAll,
} from '../../vite-plugin-editor-api.ts';

type CombatModulePayload = { id: string; classId: string } & Record<
  string,
  unknown
>;

type ClassPayload = {
  id: string;
  combatModuleIds?: string[];
} & Record<string, unknown>;

type ProblemSeriesCatalogPayload = {
  series: Array<{
    seriesId: string;
    waves: Array<{
      enemyGroups: Array<{ selectedCombatModuleId: string }>;
    }>;
  }>;
};

function firstReferencedCombatModuleId(
  catalog: ProblemSeriesCatalogPayload,
): string {
  expect(catalog.series.length).toBeGreaterThan(0);
  for (const series of catalog.series) {
    expect(series.waves.length).toBeGreaterThan(0);
    for (const wave of series.waves) {
      expect(wave.enemyGroups.length).toBeGreaterThan(0);
      for (const group of wave.enemyGroups) {
        expect(typeof group.selectedCombatModuleId).toBe('string');
        expect(group.selectedCombatModuleId.length).toBeGreaterThan(0);
        return group.selectedCombatModuleId;
      }
    }
  }
  throw new Error('problem series catalog has no selectedCombatModuleId');
}

/**
 * Remove a catalog-referenced CombatModule from the validation payload while
 * keeping class combatModuleIds resolvable (replacement module), so the failure
 * comes from problem-series cross-refs — not class pool checks.
 */
function payloadWithReferencedCombatModuleRemoved(
  base: ReturnType<typeof loadValidationPayload>,
  moduleIdToRemove: string,
): ReturnType<typeof loadValidationPayload> {
  expect(Array.isArray(base.combatModules)).toBe(true);
  const modules = (base.combatModules as CombatModulePayload[]).slice();
  const removed = modules.find((module) => module.id === moduleIdToRemove);
  expect(removed).toBeDefined();

  const remaining = modules.filter((module) => module.id !== moduleIdToRemove);
  const replacementId = `${moduleIdToRemove}__save_validation_replacement`;
  const replacement: CombatModulePayload = { ...removed!, id: replacementId };

  const classes = structuredClone(base.classes) as ClassPayload[];
  expect(classes.length).toBeGreaterThan(0);
  let rewrittenPool = 0;
  for (const cls of classes) {
    if (!cls.combatModuleIds?.includes(moduleIdToRemove)) continue;
    cls.combatModuleIds = cls.combatModuleIds.map((id) =>
      id === moduleIdToRemove ? replacementId : id,
    );
    rewrittenPool += 1;
  }
  expect(rewrittenPool).toBeGreaterThan(0);

  return {
    ...base,
    combatModules: [...remaining, replacement],
    classes,
  };
}

describe('editor validation payload (R12m 1B Editor save regression)', () => {
  it('loadValidationPayload includes real problem-series-catalog.json', () => {
    const payload = loadValidationPayload();
    const catalog = payload.problemSeriesCatalog;

    expect(catalog).toBeDefined();
    expect(catalog).not.toBeNull();
    expect(typeof catalog).toBe('object');
    expect(Array.isArray((catalog as { series?: unknown }).series)).toBe(true);
    expect((catalog as { series: unknown[] }).series.length).toBeGreaterThan(0);
    expect(typeof (catalog as { generatorVersion?: unknown }).generatorVersion).toBe(
      'string',
    );
    expect(
      ((catalog as { generatorVersion: string }).generatorVersion ?? '').length,
    ).toBeGreaterThan(0);
  });

  it('production validateAll accepts real loadValidationPayload', () => {
    const payload = loadValidationPayload();
    expect(payload.problemSeriesCatalog).toBeDefined();

    expect(() => validateAll(payload)).not.toThrow();
  });

  it('production validateAll rejects payload that deleted a catalog-referenced CombatModule', () => {
    const base = loadValidationPayload();
    const deletedModuleId = firstReferencedCombatModuleId(
      base.problemSeriesCatalog as ProblemSeriesCatalogPayload,
    );
    const broken = payloadWithReferencedCombatModuleRemoved(
      base,
      deletedModuleId,
    );

    expect(() => validateAll(broken)).toThrow(
      new RegExp(
        `unknown selectedCombatModuleId "${deletedModuleId.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&',
        )}"`,
      ),
    );
  });

  it('editor mode without requireProblemSeriesCatalogRefs does not enforce catalog module refs', () => {
    const base = loadValidationPayload();
    const catalog = structuredClone(
      base.problemSeriesCatalog,
    ) as ProblemSeriesCatalogPayload;
    expect(catalog.series.length).toBeGreaterThan(0);
    expect(catalog.series[0]!.waves.length).toBeGreaterThan(0);
    expect(catalog.series[0]!.waves[0]!.enemyGroups.length).toBeGreaterThan(0);

    const missingId = 'r12m_1b_missing_selected_combat_module';
    catalog.series[0]!.waves[0]!.enemyGroups[0]!.selectedCombatModuleId =
      missingId;

    const payload = { ...base, problemSeriesCatalog: catalog };

    expect(() =>
      parseAndValidateGameDataJson(payload, { mode: 'editor' }),
    ).not.toThrow();

    expect(() =>
      parseAndValidateGameDataJson(payload, {
        mode: 'editor',
        requireProblemSeriesCatalogRefs: true,
      }),
    ).toThrow(
      new RegExp(
        `unknown selectedCombatModuleId "${missingId.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&',
        )}"`,
      ),
    );
  });
});
