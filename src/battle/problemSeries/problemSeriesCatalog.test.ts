import { describe, expect, it } from 'vitest';
import problemSeriesCatalogJson from '../../../data/problem-series-catalog.json';
import { loadGameData } from '../data/loadGameData.ts';
import {
  normalizeProblemSeriesCatalogForSave,
  parseProblemSeriesCatalog,
  serializeProblemSeriesCatalog,
  validateProblemSeriesCatalogRefs,
} from '../data/problemSeriesCatalog.ts';
import type {
  ClassPreset,
  CombatModuleDef,
  ProblemSeriesCatalogDef,
  ProblemSeriesDef,
} from '../types.ts';
import {
  buildProblemSeriesSelectionMessage,
  hashProblemSeriesFnv1a32,
  listProblemSeriesInStableOrder,
  normalizeProblemSeriesSeed,
  resolveProblemSeriesFromSeed,
} from './seedResolve.ts';

/** Fixed hash / selection vectors for generatorVersion r12m-v1 */
export const PROBLEM_SERIES_FIXTURE_SEED_A = 'fixture-a';
export const PROBLEM_SERIES_FIXTURE_SEED_B = 'fixture-b';
export const PROBLEM_SERIES_GENERATOR_VERSION = 'r12m-v1';

const SERIES_A_EXPECTED_MODULES: string[][] = [
  [
    'df_guardian_mod_nearest_strike',
    'sp_cleric_mod_single_mend',
    'at_sorcerer_mod_focus',
  ],
  [
    'df_guardian_mod_nearest_strike',
    'df_guardian_mod_guard_focus',
    'sp_cleric_mod_party_mend',
    'at_sorcerer_mod_chain',
  ],
  [
    'df_guardian_mod_guard_focus',
    'at_swordsman_mod_pierce_slash',
    'sp_cleric_mod_party_mend',
    'at_sorcerer_mod_chain',
  ],
];

const SERIES_B_EXPECTED_MODULES: string[][] = [
  ['at_swordsman_mod_single_slash', 'at_sorcerer_mod_focus'],
  ['at_swordsman_mod_pierce_slash', 'at_sorcerer_mod_chain'],
  [
    'at_swordsman_mod_single_slash',
    'at_swordsman_mod_pierce_slash',
    'at_sorcerer_mod_chain',
    'sp_cleric_mod_single_mend',
  ],
];

function expectSeriesModules(series: ProblemSeriesDef, expected: string[][]): void {
  expect(series.waves).toHaveLength(3);
  expect(expected).toHaveLength(3);
  for (let waveIndex = 0; waveIndex < 3; waveIndex++) {
    const wave = series.waves[waveIndex]!;
    expect(wave.enemyGroups.length).toBeGreaterThan(0);
    expect(wave.enemyGroups.map((g) => g.selectedCombatModuleId)).toEqual(
      expected[waveIndex],
    );
    for (const group of wave.enemyGroups) {
      expect(group.count).toBe(1);
    }
  }
}

function cloneCatalog(): ProblemSeriesCatalogDef {
  return structuredClone(
    parseProblemSeriesCatalog(problemSeriesCatalogJson),
  );
}

describe('R12m problem series catalog production load', () => {
  it('loadGameData parses and validates A/B series (no empty fallback)', () => {
    const gameData = loadGameData();
    const catalog = gameData.problemSeriesCatalog;
    expect(catalog.generatorVersion).toBe(PROBLEM_SERIES_GENERATOR_VERSION);
    expect(catalog.series).toHaveLength(2);

    const ids = catalog.series.map((s) => s.seriesId).sort();
    expect(ids).toEqual(['r12m_series_a', 'r12m_series_b']);

    const seriesA = catalog.series.find((s) => s.seriesId === 'r12m_series_a');
    const seriesB = catalog.series.find((s) => s.seriesId === 'r12m_series_b');
    expect(seriesA).toBeDefined();
    expect(seriesB).toBeDefined();
    expectSeriesModules(seriesA!, SERIES_A_EXPECTED_MODULES);
    expectSeriesModules(seriesB!, SERIES_B_EXPECTED_MODULES);

    for (const series of catalog.series) {
      expect(series.waves).toHaveLength(3);
      for (const wave of series.waves) {
        expect(wave.enemyGroups.length).toBeGreaterThan(0);
      }
    }
  });

  it('fixed stages still load alongside problem series catalog', () => {
    const gameData = loadGameData();
    expect(gameData.stages.some((stage) => stage.id === 'r12_prototype')).toBe(
      true,
    );
    expect(gameData.stages.some((stage) => stage.id === 'r12m_series_a')).toBe(
      false,
    );
    expect(gameData.problemSeriesCatalog.series).toHaveLength(2);
  });
});

describe('R12m problem series seed resolver', () => {
  it('normalizes seed by trim only and rejects empty', () => {
    expect(normalizeProblemSeriesSeed('  fixture-a  ')).toBe('fixture-a');
    expect(() => normalizeProblemSeriesSeed('   ')).toThrow(/non-empty/);
  });

  it('fixes FNV-1a hash vectors for seed+version', () => {
    const messageA = buildProblemSeriesSelectionMessage(
      PROBLEM_SERIES_GENERATOR_VERSION,
      PROBLEM_SERIES_FIXTURE_SEED_A,
    );
    const messageB = buildProblemSeriesSelectionMessage(
      PROBLEM_SERIES_GENERATOR_VERSION,
      PROBLEM_SERIES_FIXTURE_SEED_B,
    );
    expect(hashProblemSeriesFnv1a32(messageA)).toBe(852028286);
    expect(hashProblemSeriesFnv1a32(messageB)).toBe(835250667);
  });

  it('resolves same seed+version repeatedly to deep-equal series', () => {
    const catalog = cloneCatalog();
    const first = resolveProblemSeriesFromSeed(
      catalog,
      PROBLEM_SERIES_FIXTURE_SEED_A,
    );
    const second = resolveProblemSeriesFromSeed(
      catalog,
      PROBLEM_SERIES_FIXTURE_SEED_A,
    );
    expect(first.series.seriesId).toBe('r12m_series_a');
    expect(second).toEqual(first);
  });

  it('fixture-a and fixture-b select different seriesIds', () => {
    const catalog = cloneCatalog();
    const a = resolveProblemSeriesFromSeed(catalog, PROBLEM_SERIES_FIXTURE_SEED_A);
    const b = resolveProblemSeriesFromSeed(catalog, PROBLEM_SERIES_FIXTURE_SEED_B);
    expect(a.series.seriesId).toBe('r12m_series_a');
    expect(b.series.seriesId).toBe('r12m_series_b');
    expect(a.series.seriesId).not.toBe(b.series.seriesId);
  });

  it('catalog array reverse does not change selection for same seed', () => {
    const catalog = cloneCatalog();
    const reversed: ProblemSeriesCatalogDef = {
      generatorVersion: catalog.generatorVersion,
      series: [...catalog.series].reverse(),
    };
    expect(reversed.series.map((s) => s.seriesId)).toEqual([
      'r12m_series_b',
      'r12m_series_a',
    ]);
    const forward = resolveProblemSeriesFromSeed(
      catalog,
      PROBLEM_SERIES_FIXTURE_SEED_A,
    );
    const fromReversed = resolveProblemSeriesFromSeed(
      reversed,
      PROBLEM_SERIES_FIXTURE_SEED_A,
    );
    expect(fromReversed.series.seriesId).toBe(forward.series.seriesId);
    expect(fromReversed.selectionIndex).toBe(forward.selectionIndex);
    expect(listProblemSeriesInStableOrder(reversed).map((s) => s.seriesId)).toEqual(
      listProblemSeriesInStableOrder(catalog).map((s) => s.seriesId),
    );
  });

  it('rejects explicit generatorVersion that does not match catalog', () => {
    const catalog = cloneCatalog();
    expect(catalog.generatorVersion).toBe(PROBLEM_SERIES_GENERATOR_VERSION);
    expect(() =>
      resolveProblemSeriesFromSeed(
        catalog,
        PROBLEM_SERIES_FIXTURE_SEED_A,
        'r12m-v2',
      ),
    ).toThrow(
      /generatorVersion mismatch: requested "r12m-v2" does not match catalog generatorVersion "r12m-v1"/,
    );
  });

  it('explicit matching generatorVersion equals omitted version selection', () => {
    const catalog = cloneCatalog();
    const omittedA = resolveProblemSeriesFromSeed(
      catalog,
      PROBLEM_SERIES_FIXTURE_SEED_A,
    );
    const explicitA = resolveProblemSeriesFromSeed(
      catalog,
      PROBLEM_SERIES_FIXTURE_SEED_A,
      PROBLEM_SERIES_GENERATOR_VERSION,
    );
    const omittedB = resolveProblemSeriesFromSeed(
      catalog,
      PROBLEM_SERIES_FIXTURE_SEED_B,
    );
    const explicitB = resolveProblemSeriesFromSeed(
      catalog,
      PROBLEM_SERIES_FIXTURE_SEED_B,
      PROBLEM_SERIES_GENERATOR_VERSION,
    );
    expect(omittedA.series.seriesId).toBe('r12m_series_a');
    expect(omittedB.series.seriesId).toBe('r12m_series_b');
    expect(explicitA).toEqual(omittedA);
    expect(explicitB).toEqual(omittedB);
  });

  it('catalog reverse with matching explicit version keeps same seed selection', () => {
    const catalog = cloneCatalog();
    const reversed: ProblemSeriesCatalogDef = {
      generatorVersion: catalog.generatorVersion,
      series: [...catalog.series].reverse(),
    };
    const forward = resolveProblemSeriesFromSeed(
      catalog,
      PROBLEM_SERIES_FIXTURE_SEED_A,
      PROBLEM_SERIES_GENERATOR_VERSION,
    );
    const fromReversed = resolveProblemSeriesFromSeed(
      reversed,
      PROBLEM_SERIES_FIXTURE_SEED_A,
      PROBLEM_SERIES_GENERATOR_VERSION,
    );
    expect(fromReversed).toEqual(forward);
  });
});

describe('R12m problem series validation', () => {
  it('rejects empty catalog, empty waves, and zero-length enemy groups', () => {
    expect(() => parseProblemSeriesCatalog(undefined)).toThrow(/required/);
    expect(() => parseProblemSeriesCatalog(null)).toThrow(/required/);
    expect(() =>
      parseProblemSeriesCatalog({
        generatorVersion: 'r12m-v1',
        series: [],
      }),
    ).toThrow(/non-empty/);

    const catalog = cloneCatalog();
    catalog.series[0]!.waves = [];
    expect(() =>
      parseProblemSeriesCatalog({
        generatorVersion: catalog.generatorVersion,
        series: catalog.series,
      }),
    ).toThrow(/exactly 3 waves/);

    const withEmptyGroups = cloneCatalog();
    withEmptyGroups.series[0]!.waves[0]!.enemyGroups = [];
    expect(() =>
      parseProblemSeriesCatalog({
        generatorVersion: withEmptyGroups.generatorVersion,
        series: withEmptyGroups.series,
      }),
    ).toThrow(/enemyGroups must be a non-empty array/);
  });

  it('rejects 2-wave or 4-wave series', () => {
    const two = cloneCatalog();
    two.series[0]!.waves = two.series[0]!.waves.slice(0, 2);
    expect(() =>
      parseProblemSeriesCatalog({
        generatorVersion: two.generatorVersion,
        series: two.series,
      }),
    ).toThrow(/exactly 3 waves/);

    const four = cloneCatalog();
    four.series[0]!.waves = [
      ...four.series[0]!.waves,
      structuredClone(four.series[0]!.waves[2]!),
    ];
    expect(() =>
      parseProblemSeriesCatalog({
        generatorVersion: four.generatorVersion,
        series: four.series,
      }),
    ).toThrow(/exactly 3 waves/);
  });
});

describe('R12m problem series reference validation', () => {
  it('rejects non-R5 enemy classId', () => {
    const gameData = loadGameData();
    const catalog = cloneCatalog();
    catalog.series[0]!.waves[0]!.enemyGroups[0]!.classId = 'at_assassin';
    const classById = new Map(
      Object.entries(gameData.classRegistry) as [string, ClassPreset][],
    );
    const moduleById = new Map(
      Object.entries(gameData.combatModuleRegistry) as [string, CombatModuleDef][],
    );
    expect(() =>
      validateProblemSeriesCatalogRefs(catalog, classById, moduleById),
    ).toThrow(/outside R5/);
  });

  it('rejects module belonging to another class', () => {
    const gameData = loadGameData();
    const catalog = cloneCatalog();
    catalog.series[0]!.waves[0]!.enemyGroups[0]!.selectedCombatModuleId =
      'at_swordsman_mod_single_slash';
    const classById = new Map(
      Object.entries(gameData.classRegistry) as [string, ClassPreset][],
    );
    const moduleById = new Map(
      Object.entries(gameData.combatModuleRegistry) as [string, CombatModuleDef][],
    );
    expect(() =>
      validateProblemSeriesCatalogRefs(catalog, classById, moduleById),
    ).toThrow(/belongs to class/);
  });

  it('rejects unknown module id', () => {
    const gameData = loadGameData();
    const catalog = cloneCatalog();
    catalog.series[0]!.waves[0]!.enemyGroups[0]!.selectedCombatModuleId =
      'no_such_module';
    const classById = new Map(
      Object.entries(gameData.classRegistry) as [string, ClassPreset][],
    );
    const moduleById = new Map(
      Object.entries(gameData.combatModuleRegistry) as [string, CombatModuleDef][],
    );
    expect(() =>
      validateProblemSeriesCatalogRefs(catalog, classById, moduleById),
    ).toThrow(/unknown selectedCombatModuleId/i);
  });

  it('rejects selected module that exists and matches classId but is absent from class combatModuleIds', () => {
    const gameData = loadGameData();
    const catalog = cloneCatalog();
    const group = catalog.series[0]!.waves[0]!.enemyGroups[0]!;
    const classId = group.classId;
    const selectedCombatModuleId = group.selectedCombatModuleId;

    const classById = new Map(
      Object.entries(gameData.classRegistry) as [string, ClassPreset][],
    );
    const moduleById = new Map(
      Object.entries(gameData.combatModuleRegistry) as [string, CombatModuleDef][],
    );

    expect(moduleById.has(selectedCombatModuleId)).toBe(true);
    expect(moduleById.get(selectedCombatModuleId)!.classId).toBe(classId);

    const originalClass = classById.get(classId);
    expect(originalClass).toBeDefined();
    expect(originalClass!.combatModuleIds).toBeDefined();
    expect(originalClass!.combatModuleIds!.includes(selectedCombatModuleId)).toBe(
      true,
    );

    const clonedClass: ClassPreset = {
      ...originalClass!,
      combatModuleIds: originalClass!.combatModuleIds!.filter(
        (id) => id !== selectedCombatModuleId,
      ) as ClassPreset['combatModuleIds'],
    };
    expect(clonedClass.combatModuleIds!.includes(selectedCombatModuleId)).toBe(
      false,
    );
    classById.set(classId, clonedClass);

    expect(() =>
      validateProblemSeriesCatalogRefs(catalog, classById, moduleById),
    ).toThrow(/is not listed in combatModuleIds/);
  });

  it('unknown catalog data cannot pass production loadGameData path', () => {
    expect(() =>
      parseProblemSeriesCatalog({
        generatorVersion: 'r12m-v1',
        series: [
          {
            ...cloneCatalog().series[0],
            seriesId: 'bad',
            waves: cloneCatalog().series[0]!.waves.slice(0, 1),
          },
        ],
      }),
    ).toThrow(/exactly 3 waves/);
  });
});

describe('R12m problem series normalize round-trip', () => {
  it('preserves internal metadata and module ids losslessly', () => {
    const parsed = parseProblemSeriesCatalog(problemSeriesCatalogJson);
    const normalized = normalizeProblemSeriesCatalogForSave(parsed);
    const serialized = serializeProblemSeriesCatalog(parsed);
    const reparsed = parseProblemSeriesCatalog(JSON.parse(serialized));

    expect(reparsed.generatorVersion).toBe(parsed.generatorVersion);
    expect(reparsed.series).toHaveLength(2);

    const a = reparsed.series.find((s) => s.seriesId === 'r12m_series_a')!;
    const b = reparsed.series.find((s) => s.seriesId === 'r12m_series_b')!;
    expect(a.waveRelationSummary).toBe(parsed.series.find((s) => s.seriesId === 'r12m_series_a')!.waveRelationSummary);
    expect(a.finalWaveCompositeOf).toEqual([0, 1]);
    expect(a.waves[0]!.internalProblemClass).toBe('single_protection');
    expect(a.waves[0]!.expectedFailureModes.length).toBeGreaterThan(0);
    expect(a.waves[1]!.connection.relationFromPrevious).toBe('pivot');
    expectSeriesModules(a, SERIES_A_EXPECTED_MODULES);
    expectSeriesModules(b, SERIES_B_EXPECTED_MODULES);

    // chain modules remain module ids — not reshaped to another target form
    expect(
      a.waves[1]!.enemyGroups.some(
        (g) => g.selectedCombatModuleId === 'at_sorcerer_mod_chain',
      ),
    ).toBe(true);
    expect(normalized.series.map((s) => s.seriesId)).toEqual([
      'r12m_series_a',
      'r12m_series_b',
    ]);
  });
});
