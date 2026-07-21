import { describe, expect, it } from 'vitest';
import { tryLoadGameData } from '../data/loadGameData.ts';
import { createProblemSeriesOperationStartSnapshot } from './operationStartSnapshot.ts';
import { resolveProblemSeriesFromSeed } from './seedResolve.ts';
import {
  createProblemSeriesWavePrepDisclosureContext,
  type ProblemSeriesWavePrepDisclosureContext,
} from './wavePrepDisclosure.ts';
import {
  createProblemSeriesWavePrepEnemyChanges,
  type ProblemSeriesWavePrepEnemyChange,
} from './wavePrepEnemyChanges.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';
const SERIES_A_ID = 'r12m_series_a';
const SERIES_B_ID = 'r12m_series_b';
const GENERATOR_VERSION = 'r12m-v1';

const SERIES_A_INTERNAL_CLASS_STRINGS = [
  'single_protection',
  'multi_protection',
  'protection_scatter_pressure_composite',
] as const;

const SERIES_B_INTERNAL_CLASS_STRINGS = [
  'concentrated_pressure',
  'scattered_pressure',
  'concentrated_scattered_simultaneous_pressure',
] as const;

const FORBIDDEN_CHANGE_KEYS = [
  'seed',
  'generatorVersion',
  'seriesId',
  'operationConditions',
  'allowedClassIds',
  'internalProblemClass',
  'expectedFailureModes',
  'connection',
  'waveLinks',
  'waveRelationSummary',
  'finalWaveCompositeOf',
  'stageDef',
  'stageId',
  'party',
  'combatant',
  'combatants',
  'checkpoint',
  'save',
  'saveData',
  'waves',
  'previousWave',
  'nextWave',
  'remainingWaves',
  'recommendedFormation',
  'recommendedOrder',
  'killOrder',
  'winRate',
  'explanation',
  'operationPassives',
  'passives',
  'remainingPoints',
  'operationPoints',
  'prepResourceRemaining',
  'currentWaveIndex',
  'waveIndex',
  'selectionIndex',
  'selectionHash',
  'unlockClassIdsOnClear',
] as const;

type DeepMutable<T> =
  T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;

function loadProductionContext(
  seed: string,
  targetWaveIndex: number,
  expectedSeriesId: string,
): ProblemSeriesWavePrepDisclosureContext {
  const loaded = tryLoadGameData();
  if (!loaded.ok) {
    throw new Error(loaded.error);
  }
  expect(loaded.data.problemSeriesCatalog.series.length).toBeGreaterThan(0);

  const gameData = loaded.data;
  const catalog = gameData.problemSeriesCatalog;
  const result = resolveProblemSeriesFromSeed(catalog, seed);
  expect(result.series.seriesId).toBe(expectedSeriesId);

  const snapshot = createProblemSeriesOperationStartSnapshot(result);
  expect(snapshot.waves).toHaveLength(3);

  return createProblemSeriesWavePrepDisclosureContext(
    snapshot,
    targetWaveIndex,
    gameData,
  );
}

function expectChangeShapeOnly(change: ProblemSeriesWavePrepEnemyChange): void {
  expect(Object.keys(change).sort()).toEqual(
    ['classDisplayName', 'classId', 'nextGroups', 'previousGroups'].sort(),
  );
  for (const forbidden of FORBIDDEN_CHANGE_KEYS) {
    expect(change).not.toHaveProperty(forbidden);
  }

  for (const groups of [change.previousGroups, change.nextGroups]) {
    for (const group of groups) {
      expect(Object.keys(group).sort()).toEqual(
        [
          'classDisplayName',
          'classId',
          'combatModuleDisplayName',
          'count',
          'scale',
          'selectedCombatModuleId',
        ].sort(),
      );
      expect(Object.keys(group.scale).sort()).toEqual(
        ['atkScale', 'defScale', 'hasDifference', 'hpScale', 'resScale'].sort(),
      );
      for (const forbidden of FORBIDDEN_CHANGE_KEYS) {
        expect(group).not.toHaveProperty(forbidden);
      }
    }
  }
}

function findChange(
  changes: readonly ProblemSeriesWavePrepEnemyChange[],
  classId: string,
): ProblemSeriesWavePrepEnemyChange {
  const change = changes.find((entry) => entry.classId === classId);
  expect(change).toBeDefined();
  return change!;
}

function cloneDisclosureContext(
  context: ProblemSeriesWavePrepDisclosureContext,
): DeepMutable<ProblemSeriesWavePrepDisclosureContext> {
  const copyGroup = (
    group: ProblemSeriesWavePrepDisclosureContext['previousWave']['enemyGroups'][number],
  ) => ({
    classId: group.classId,
    classDisplayName: group.classDisplayName,
    count: group.count,
    selectedCombatModuleId: group.selectedCombatModuleId,
    combatModuleDisplayName: group.combatModuleDisplayName,
    scale: { ...group.scale },
  });

  const copyWave = (
    wave: ProblemSeriesWavePrepDisclosureContext['previousWave'],
  ) => ({
    waveNumber: wave.waveNumber,
    prepResourceGrant: wave.prepResourceGrant,
    enemyGroups: wave.enemyGroups.map((group) => copyGroup(group)),
  });

  return {
    operationConditions: [...context.operationConditions],
    previousWave: copyWave(context.previousWave),
    nextWave: copyWave(context.nextWave),
    remainingWaves: context.remainingWaves.map((wave) => copyWave(wave)),
  };
}

describe('R12m createProblemSeriesWavePrepEnemyChanges (fixture-a Wave 1→2)', () => {
  it('production path: changed classes df_guardian, sp_cleric, at_sorcerer', () => {
    const context = loadProductionContext(FIXTURE_SEED_A, 1, SERIES_A_ID);
    const changes = createProblemSeriesWavePrepEnemyChanges(context);

    expect(changes.map((change) => change.classId)).toEqual([
      'df_guardian',
      'sp_cleric',
      'at_sorcerer',
    ]);
    expect(changes).toHaveLength(3);

    for (const change of changes) {
      expectChangeShapeOnly(change);
      expect(change.classDisplayName.length).toBeGreaterThan(0);
    }

    const guardian = findChange(changes, 'df_guardian');
    expect(guardian.previousGroups).toHaveLength(1);
    expect(guardian.nextGroups).toHaveLength(2);
    expect(guardian.previousGroups[0]!.selectedCombatModuleId).toBe(
      'df_guardian_mod_nearest_strike',
    );
    expect(
      guardian.nextGroups.map((group) => group.selectedCombatModuleId).sort(),
    ).toEqual(
      ['df_guardian_mod_guard_focus', 'df_guardian_mod_nearest_strike'].sort(),
    );

    const cleric = findChange(changes, 'sp_cleric');
    expect(cleric.previousGroups).toHaveLength(1);
    expect(cleric.nextGroups).toHaveLength(1);
    expect(cleric.previousGroups[0]!.selectedCombatModuleId).toBe(
      'sp_cleric_mod_single_mend',
    );
    expect(cleric.nextGroups[0]!.selectedCombatModuleId).toBe(
      'sp_cleric_mod_party_mend',
    );

    const sorcerer = findChange(changes, 'at_sorcerer');
    expect(sorcerer.previousGroups).toHaveLength(1);
    expect(sorcerer.nextGroups).toHaveLength(1);
    expect(sorcerer.previousGroups[0]!.selectedCombatModuleId).toBe(
      'at_sorcerer_mod_focus',
    );
    expect(sorcerer.nextGroups[0]!.selectedCombatModuleId).toBe(
      'at_sorcerer_mod_chain',
    );

    const json = JSON.stringify(changes);
    expect(json).not.toContain(SERIES_A_ID);
    expect(json).not.toContain(GENERATOR_VERSION);
    for (const internalClass of SERIES_A_INTERNAL_CLASS_STRINGS) {
      expect(json).not.toContain(internalClass);
    }
  });
});

describe('R12m createProblemSeriesWavePrepEnemyChanges (fixture-a Wave 2→3)', () => {
  it('production path: df_guardian changed, at_swordsman added; sp_cleric and at_sorcerer unchanged', () => {
    const context = loadProductionContext(FIXTURE_SEED_A, 2, SERIES_A_ID);
    const changes = createProblemSeriesWavePrepEnemyChanges(context);

    expect(changes.map((change) => change.classId)).toEqual([
      'df_guardian',
      'at_swordsman',
    ]);
    expect(changes).toHaveLength(2);

    for (const change of changes) {
      expectChangeShapeOnly(change);
    }

    const guardian = findChange(changes, 'df_guardian');
    expect(guardian.previousGroups).toHaveLength(2);
    expect(guardian.nextGroups).toHaveLength(1);
    expect(
      guardian.previousGroups.map((group) => group.selectedCombatModuleId).sort(),
    ).toEqual(
      ['df_guardian_mod_guard_focus', 'df_guardian_mod_nearest_strike'].sort(),
    );
    expect(guardian.nextGroups[0]!.selectedCombatModuleId).toBe(
      'df_guardian_mod_guard_focus',
    );

    const swordsman = findChange(changes, 'at_swordsman');
    expect(swordsman.previousGroups).toHaveLength(0);
    expect(swordsman.nextGroups).toHaveLength(1);
    expect(swordsman.nextGroups[0]!.selectedCombatModuleId).toBe(
      'at_swordsman_mod_pierce_slash',
    );

    expect(changes.some((change) => change.classId === 'sp_cleric')).toBe(false);
    expect(changes.some((change) => change.classId === 'at_sorcerer')).toBe(
      false,
    );
  });
});

describe('R12m createProblemSeriesWavePrepEnemyChanges (fixture-b Wave 1→2)', () => {
  it('production path: at_swordsman and at_sorcerer Module changes', () => {
    const context = loadProductionContext(FIXTURE_SEED_B, 1, SERIES_B_ID);
    const changes = createProblemSeriesWavePrepEnemyChanges(context);

    expect(changes.map((change) => change.classId)).toEqual([
      'at_swordsman',
      'at_sorcerer',
    ]);
    expect(changes).toHaveLength(2);

    for (const change of changes) {
      expectChangeShapeOnly(change);
    }

    const swordsman = findChange(changes, 'at_swordsman');
    expect(swordsman.previousGroups).toHaveLength(1);
    expect(swordsman.nextGroups).toHaveLength(1);
    expect(swordsman.previousGroups[0]!.selectedCombatModuleId).toBe(
      'at_swordsman_mod_single_slash',
    );
    expect(swordsman.nextGroups[0]!.selectedCombatModuleId).toBe(
      'at_swordsman_mod_pierce_slash',
    );

    const sorcerer = findChange(changes, 'at_sorcerer');
    expect(sorcerer.previousGroups).toHaveLength(1);
    expect(sorcerer.nextGroups).toHaveLength(1);
    expect(sorcerer.previousGroups[0]!.selectedCombatModuleId).toBe(
      'at_sorcerer_mod_focus',
    );
    expect(sorcerer.nextGroups[0]!.selectedCombatModuleId).toBe(
      'at_sorcerer_mod_chain',
    );

    const json = JSON.stringify(changes);
    expect(json).not.toContain(SERIES_B_ID);
    expect(json).not.toContain(GENERATOR_VERSION);
    for (const internalClass of SERIES_B_INTERNAL_CLASS_STRINGS) {
      expect(json).not.toContain(internalClass);
    }
  });
});

describe('R12m createProblemSeriesWavePrepEnemyChanges (focused: order-only change)', () => {
  it('reversed group order within identical waves produces no changes', () => {
    const baseContext = loadProductionContext(FIXTURE_SEED_A, 1, SERIES_A_ID);
    const orderOnlyContext = cloneDisclosureContext(baseContext);

    const identicalGroups = orderOnlyContext.nextWave.enemyGroups.map((group) => ({
      ...group,
      scale: { ...group.scale },
    }));
    expect(identicalGroups.length).toBeGreaterThan(1);

    orderOnlyContext.previousWave = {
      ...orderOnlyContext.previousWave,
      enemyGroups: identicalGroups,
    };
    orderOnlyContext.nextWave = {
      ...orderOnlyContext.nextWave,
      enemyGroups: [...identicalGroups].reverse().map((group) => ({
        ...group,
        scale: { ...group.scale },
      })),
    };

    const changes = createProblemSeriesWavePrepEnemyChanges(orderOnlyContext);
    expect(changes).toEqual([]);
  });
});

describe('R12m createProblemSeriesWavePrepEnemyChanges (focused: count change)', () => {
  it('count-only mutation returns one change for that classId', () => {
    const baseContext = loadProductionContext(FIXTURE_SEED_B, 1, SERIES_B_ID);
    const mutableContext = cloneDisclosureContext(baseContext);

    const identicalGroups = mutableContext.previousWave.enemyGroups.map((group) => ({
      ...group,
      scale: { ...group.scale },
    }));
    mutableContext.previousWave = {
      ...mutableContext.previousWave,
      enemyGroups: identicalGroups,
    };
    mutableContext.nextWave = {
      ...mutableContext.nextWave,
      enemyGroups: identicalGroups.map((group) => ({
        ...group,
        scale: { ...group.scale },
      })),
    };

    const targetClassId = identicalGroups[0]!.classId;
    const nextGroup = mutableContext.nextWave.enemyGroups.find(
      (group) => group.classId === targetClassId,
    )!;
    const previousCount = nextGroup.count;
    nextGroup.count = previousCount + 1;

    const changes = createProblemSeriesWavePrepEnemyChanges(mutableContext);

    expect(changes.map((change) => change.classId)).toEqual([targetClassId]);
    expect(changes).toHaveLength(1);

    const change = findChange(changes, targetClassId);
    expect(change.previousGroups).toHaveLength(1);
    expect(change.nextGroups).toHaveLength(1);
    expect(change.previousGroups[0]!.count).toBe(previousCount);
    expect(change.nextGroups[0]!.count).toBe(previousCount + 1);
  });
});

describe('R12m createProblemSeriesWavePrepEnemyChanges (focused: scale change)', () => {
  it('single scale field mutation returns one change for that classId', () => {
    const baseContext = loadProductionContext(FIXTURE_SEED_B, 1, SERIES_B_ID);
    const mutableContext = cloneDisclosureContext(baseContext);

    const identicalGroups = mutableContext.previousWave.enemyGroups.map((group) => ({
      ...group,
      scale: { ...group.scale },
    }));
    mutableContext.previousWave = {
      ...mutableContext.previousWave,
      enemyGroups: identicalGroups,
    };
    mutableContext.nextWave = {
      ...mutableContext.nextWave,
      enemyGroups: identicalGroups.map((group) => ({
        ...group,
        scale: { ...group.scale },
      })),
    };

    const targetClassId = identicalGroups[1]!.classId;
    const nextGroup = mutableContext.nextWave.enemyGroups.find(
      (group) => group.classId === targetClassId,
    )!;
    const previousHpScale = nextGroup.scale.hpScale;
    nextGroup.scale = {
      ...nextGroup.scale,
      hpScale: previousHpScale + 0.5,
    };

    const changes = createProblemSeriesWavePrepEnemyChanges(mutableContext);

    expect(changes.map((change) => change.classId)).toEqual([targetClassId]);
    expect(changes).toHaveLength(1);

    const change = findChange(changes, targetClassId);
    expect(change.previousGroups).toHaveLength(1);
    expect(change.nextGroups).toHaveLength(1);
    expect(change.previousGroups[0]!.scale.hpScale).toBe(previousHpScale);
    expect(change.nextGroups[0]!.scale.hpScale).toBe(previousHpScale + 0.5);
  });
});

describe('R12m createProblemSeriesWavePrepEnemyChanges (focused: reference isolation)', () => {
  it('output does not share references with input; mutating input copies does not affect output', () => {
    const baseContext = loadProductionContext(FIXTURE_SEED_A, 1, SERIES_A_ID);
    const mutableContext = cloneDisclosureContext(baseContext);

    const changes = createProblemSeriesWavePrepEnemyChanges(mutableContext);
    expect(changes.length).toBeGreaterThan(0);

    expect(changes).not.toBe(mutableContext.previousWave.enemyGroups);
    expect(changes).not.toBe(mutableContext.nextWave.enemyGroups);

    for (const change of changes) {
      expect(change.previousGroups).not.toBe(
        mutableContext.previousWave.enemyGroups,
      );
      expect(change.nextGroups).not.toBe(mutableContext.nextWave.enemyGroups);

      for (const group of [...change.previousGroups, ...change.nextGroups]) {
        const inputGroup = [
          ...mutableContext.previousWave.enemyGroups,
          ...mutableContext.nextWave.enemyGroups,
        ].find(
          (candidate) =>
            candidate.classId === group.classId &&
            candidate.selectedCombatModuleId === group.selectedCombatModuleId,
        );
        expect(inputGroup).toBeDefined();
        expect(group).not.toBe(inputGroup);
        expect(group.scale).not.toBe(inputGroup!.scale);
      }
    }

    const frozenChanges = JSON.parse(JSON.stringify(changes));

    for (const group of [
      ...mutableContext.previousWave.enemyGroups,
      ...mutableContext.nextWave.enemyGroups,
    ]) {
      group.count = group.count + 77;
      group.scale = {
        ...group.scale,
        atkScale: group.scale.atkScale + 77,
      };
    }

    expect(JSON.stringify(changes)).toBe(JSON.stringify(frozenChanges));
  });
});
