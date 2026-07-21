/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { createProblemSeriesOperationStartSnapshot } from '../battle/problemSeries/operationStartSnapshot.ts';
import { resolveProblemSeriesFromSeed } from '../battle/problemSeries/seedResolve.ts';
import {
  createProblemSeriesWavePrepDisclosureContext,
  type ProblemSeriesWavePrepDisclosureContext,
} from '../battle/problemSeries/wavePrepDisclosure.ts';
import {
  createProblemSeriesWavePrepEnemyChanges,
  type ProblemSeriesWavePrepEnemyChange,
} from '../battle/problemSeries/wavePrepEnemyChanges.ts';
import { ProblemSeriesWavePrepDisclosurePanel } from './ProblemSeriesWavePrepDisclosurePanel.ts';
import type { ProblemSeriesOverviewWaveDisplay } from './problemSeriesOverviewViewModel.ts';
import {
  createProblemSeriesWavePrepDisclosureDisplay,
  type ProblemSeriesWavePrepDisclosureDisplay,
} from './problemSeriesWavePrepDisclosureViewModel.ts';

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

const FORBIDDEN_DOM_SUBSTRINGS = [
  'fixture-a',
  'fixture-b',
  SERIES_A_ID,
  SERIES_B_ID,
  GENERATOR_VERSION,
  'internalProblemClass',
  'expectedFailureModes',
  'connection',
  'waveRelationSummary',
  'finalWaveCompositeOf',
  'stageId',
  '推奨編成',
  '推奨撃破順',
  '撃破順',
  '勝率',
  '正解',
  'df_guardian_mod_nearest_strike',
  'at_swordsman_mod_single_slash',
  'at_sorcerer_mod_chain',
  'sp_cleric_mod_party_mend',
] as const;

type DeepMutable<T> =
  T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;

type WavePrepDisclosureProductionPath = {
  seriesId: string;
  context: ProblemSeriesWavePrepDisclosureContext;
  enemyChanges: readonly ProblemSeriesWavePrepEnemyChange[];
  display: ProblemSeriesWavePrepDisclosureDisplay;
};

function runWavePrepDisclosureProductionPath(
  seed: string,
  targetWaveIndex: number,
  expectedSeriesId: string,
): WavePrepDisclosureProductionPath {
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

  const context = createProblemSeriesWavePrepDisclosureContext(
    snapshot,
    targetWaveIndex,
    gameData,
  );
  const enemyChanges = createProblemSeriesWavePrepEnemyChanges(context);
  const display = createProblemSeriesWavePrepDisclosureDisplay(
    context,
    enemyChanges,
  );

  return {
    seriesId: result.series.seriesId,
    context,
    enemyChanges,
    display,
  };
}

function renderPanel(
  display: ProblemSeriesWavePrepDisclosureDisplay,
): { host: HTMLElement; panel: ProblemSeriesWavePrepDisclosurePanel; root: HTMLElement } {
  const host = document.createElement('div');
  const panel = new ProblemSeriesWavePrepDisclosurePanel(host, display);
  const roots = host.querySelectorAll('.problem-series-wave-prep-disclosure');
  expect(roots).toHaveLength(1);
  return { host, panel, root: roots[0]! };
}

function getSection(
  root: HTMLElement,
  className: string,
): HTMLElement {
  const section = root.querySelector(`.${className}`);
  expect(section).not.toBeNull();
  expect(section).toBeInstanceOf(HTMLElement);
  return section as HTMLElement;
}

function assertAllGroupsRendered(
  container: HTMLElement,
  wave: ProblemSeriesOverviewWaveDisplay,
): void {
  expect(wave.enemyGroups.length).toBeGreaterThan(0);
  const groupEls = container.querySelectorAll(
    '.problem-series-wave-prep-disclosure__enemy-group',
  );
  expect(groupEls.length).toBeGreaterThanOrEqual(wave.enemyGroups.length);

  for (const group of wave.enemyGroups) {
    expect(container.textContent).toContain(group.classDisplayName);
    expect(container.textContent).toContain(`×${group.count}`);
    expect(container.textContent).toContain(
      `CombatModule: ${group.combatModuleDisplayName}`,
    );
    expect(container.textContent).not.toContain(group.classId);
    expect(container.textContent).not.toContain(group.selectedCombatModuleId);
  }
}

function assertNonDisclosure(root: HTMLElement): void {
  const textContent = root.textContent ?? '';
  const outerHTML = root.outerHTML;
  for (const forbidden of FORBIDDEN_DOM_SUBSTRINGS) {
    expect(textContent).not.toContain(forbidden);
    expect(outerHTML).not.toContain(forbidden);
  }
  for (const internalClass of SERIES_A_INTERNAL_CLASS_STRINGS) {
    expect(textContent).not.toContain(internalClass);
    expect(outerHTML).not.toContain(internalClass);
  }
  for (const internalClass of SERIES_B_INTERNAL_CLASS_STRINGS) {
    expect(textContent).not.toContain(internalClass);
    expect(outerHTML).not.toContain(internalClass);
  }
}

function cloneDisclosureDisplay(
  display: ProblemSeriesWavePrepDisclosureDisplay,
): DeepMutable<ProblemSeriesWavePrepDisclosureDisplay> {
  const copyGroup = (
    group: ProblemSeriesWavePrepDisclosureDisplay['nextWave']['enemyGroups'][number],
  ) => ({
    classId: group.classId,
    classDisplayName: group.classDisplayName,
    count: group.count,
    selectedCombatModuleId: group.selectedCombatModuleId,
    combatModuleDisplayName: group.combatModuleDisplayName,
    scaleSummary: group.scaleSummary,
  });

  const copyWave = (
    wave: ProblemSeriesWavePrepDisclosureDisplay['nextWave'],
  ) => ({
    waveNumber: wave.waveNumber,
    prepResourceGrant: wave.prepResourceGrant,
    enemyGroups: wave.enemyGroups.map((group) => copyGroup(group)),
  });

  const copyChange = (
    change: ProblemSeriesWavePrepDisclosureDisplay['enemyChanges'][number],
  ) => ({
    classId: change.classId,
    classDisplayName: change.classDisplayName,
    previousGroups: change.previousGroups.map((group) => copyGroup(group)),
    nextGroups: change.nextGroups.map((group) => copyGroup(group)),
  });

  return {
    operationConditions: [...display.operationConditions],
    nextWave: copyWave(display.nextWave),
    enemyChanges: display.enemyChanges.map((change) => copyChange(change)),
    remainingWaves: display.remainingWaves.map((wave) => copyWave(wave)),
  };
}

describe('ProblemSeriesWavePrepDisclosurePanel (fixture-a Wave 2 prep production DOM)', () => {
  it('renders all sections, nextWave Wave 2, enemy changes, remaining Wave 3 only', () => {
    const path = runWavePrepDisclosureProductionPath(
      FIXTURE_SEED_A,
      1,
      SERIES_A_ID,
    );
    expect(path.seriesId).toBe(SERIES_A_ID);

    const displayBefore = structuredClone(path.display);
    const { panel, root } = renderPanel(path.display);

    const conditionsSection = getSection(
      root,
      'problem-series-wave-prep-disclosure__conditions',
    );
    const nextWaveSection = getSection(
      root,
      'problem-series-wave-prep-disclosure__next-wave',
    );
    const changesSection = getSection(
      root,
      'problem-series-wave-prep-disclosure__changes',
    );
    const remainingSection = getSection(
      root,
      'problem-series-wave-prep-disclosure__remaining',
    );

    expect(conditionsSection.querySelector('h2')?.textContent).toBe('作戦固有条件');
    expect(conditionsSection.textContent).toContain('なし');

    expect(nextWaveSection.querySelector('h2')?.textContent).toBe('次Waveの完全情報');
    const nextWaveEl = nextWaveSection.querySelector(
      '.problem-series-wave-prep-disclosure__wave',
    );
    expect(nextWaveEl).not.toBeNull();
    expect(nextWaveEl?.querySelector('h3')?.textContent).toBe('Wave 2');
    assertAllGroupsRendered(nextWaveSection, path.display.nextWave);

    expect(changesSection.querySelector('h2')?.textContent).toBe('前Waveからの変化');
    const expectedChangeClassIds = ['df_guardian', 'sp_cleric', 'at_sorcerer'];
    expect(path.display.enemyChanges.map((change) => change.classId)).toEqual(
      expectedChangeClassIds,
    );
    for (const change of path.display.enemyChanges) {
      expect(changesSection.textContent).toContain(change.classDisplayName);
    }

    expect(remainingSection.querySelector('h2')?.textContent).toBe('残りWave概要');
    const remainingWaveEls = remainingSection.querySelectorAll(
      '.problem-series-wave-prep-disclosure__wave',
    );
    expect(remainingWaveEls).toHaveLength(1);
    expect(remainingWaveEls[0]?.querySelector('h3')?.textContent).toBe('Wave 3');
    expect(remainingSection.textContent).not.toContain('Wave 2');
    expect(remainingSection.textContent).not.toContain('次Wave以降のWaveなし');

    const subsequentWave = path.display.remainingWaves[1]!;
    assertAllGroupsRendered(remainingSection, subsequentWave);

    assertNonDisclosure(root);
    expect(path.display).toEqual(displayBefore);

    panel.destroy();
  });
});

describe('ProblemSeriesWavePrepDisclosurePanel (fixture-b Wave 3 prep production DOM)', () => {
  it('renders nextWave Wave 3, production diff classes, and no subsequent waves', () => {
    const path = runWavePrepDisclosureProductionPath(
      FIXTURE_SEED_B,
      2,
      SERIES_B_ID,
    );
    expect(path.seriesId).toBe(SERIES_B_ID);

    const { panel, root } = renderPanel(path.display);

    getSection(root, 'problem-series-wave-prep-disclosure__conditions');
    const nextWaveSection = getSection(
      root,
      'problem-series-wave-prep-disclosure__next-wave',
    );
    const changesSection = getSection(
      root,
      'problem-series-wave-prep-disclosure__changes',
    );
    const remainingSection = getSection(
      root,
      'problem-series-wave-prep-disclosure__remaining',
    );

    expect(nextWaveSection.querySelector('h3')?.textContent).toBe('Wave 3');
    expect(path.display.nextWave.enemyGroups.length).toBeGreaterThan(0);
    assertAllGroupsRendered(nextWaveSection, path.display.nextWave);

    const expectedChangeClassIds = ['at_swordsman', 'sp_cleric'];
    expect(path.display.enemyChanges.map((change) => change.classId)).toEqual(
      expectedChangeClassIds,
    );
    for (const change of path.display.enemyChanges) {
      expect(changesSection.textContent).toContain(change.classDisplayName);
    }

    expect(remainingSection.textContent).toContain('次Wave以降のWaveなし');
    expect(
      remainingSection.querySelectorAll('.problem-series-wave-prep-disclosure__wave'),
    ).toHaveLength(0);

    assertNonDisclosure(root);
    panel.destroy();
  });
});

describe('ProblemSeriesWavePrepDisclosurePanel (focused: non-empty operationConditions)', () => {
  it('renders each condition in order without なし in conditions section', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    expect(loaded.data.problemSeriesCatalog.series.length).toBeGreaterThan(0);

    const gameData = loaded.data;
    const catalog = gameData.problemSeriesCatalog;
    const result = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
    expect(result.series.seriesId).toBe(SERIES_A_ID);

    const operationConditions = ['condition one', 'condition two'];
    const resultWithConditions = {
      ...result,
      series: {
        ...result.series,
        operationConditions,
      },
    };

    const snapshot = createProblemSeriesOperationStartSnapshot(resultWithConditions);
    const context = createProblemSeriesWavePrepDisclosureContext(
      snapshot,
      1,
      gameData,
    );
    const enemyChanges = createProblemSeriesWavePrepEnemyChanges(context);
    const display = createProblemSeriesWavePrepDisclosureDisplay(
      context,
      enemyChanges,
    );

    const { panel, root } = renderPanel(display);
    const conditionsSection = getSection(
      root,
      'problem-series-wave-prep-disclosure__conditions',
    );

    expect(conditionsSection.textContent).toContain('condition one');
    expect(conditionsSection.textContent).toContain('condition two');
    expect(conditionsSection.textContent?.indexOf('condition one')).toBeLessThan(
      conditionsSection.textContent?.indexOf('condition two') ?? -1,
    );
    expect(conditionsSection.textContent).not.toContain('なし');

    panel.destroy();
  });
});

describe('ProblemSeriesWavePrepDisclosurePanel (focused: scale display)', () => {
  it('renders scaleSummary in the matching group only', () => {
    const path = runWavePrepDisclosureProductionPath(
      FIXTURE_SEED_A,
      1,
      SERIES_A_ID,
    );
    const mutableDisplay = cloneDisclosureDisplay(path.display);
    const displayBefore = structuredClone(path.display);

    const targetGroup = mutableDisplay.nextWave.enemyGroups[0]!;
    const distinctiveScale = ' (hp×9.99 atk×8.88)';
    targetGroup.scaleSummary = distinctiveScale;

    const { panel, root } = renderPanel(mutableDisplay);
    const nextWaveSection = getSection(
      root,
      'problem-series-wave-prep-disclosure__next-wave',
    );
    const groupEls = nextWaveSection.querySelectorAll(
      '.problem-series-wave-prep-disclosure__enemy-group',
    );
    expect(groupEls.length).toBeGreaterThan(0);

    const targetGroupEl = groupEls[0]!;
    const scaleEl = targetGroupEl.querySelector(
      '.problem-series-wave-prep-disclosure__scale',
    );
    expect(scaleEl).not.toBeNull();
    expect(scaleEl?.textContent).toBe(distinctiveScale);

    for (let index = 1; index < groupEls.length; index++) {
      const otherGroupEl = groupEls[index]!;
      expect(otherGroupEl.textContent).not.toContain(distinctiveScale);
      expect(
        otherGroupEl.querySelector('.problem-series-wave-prep-disclosure__scale'),
      ).toBeNull();
    }

    expect(path.display).toEqual(displayBefore);
    panel.destroy();
  });
});

describe('ProblemSeriesWavePrepDisclosurePanel (focused: one-sided empty and no changes)', () => {
  it('shows なし on empty previous side for added class', () => {
    const path = runWavePrepDisclosureProductionPath(
      FIXTURE_SEED_A,
      1,
      SERIES_A_ID,
    );
    const mutableDisplay = cloneDisclosureDisplay(path.display);

    mutableDisplay.enemyChanges = [
      {
        classId: 'at_swordsman',
        classDisplayName: '剣術士',
        previousGroups: [],
        nextGroups: [
          {
            classId: 'at_swordsman',
            classDisplayName: '剣術士',
            count: 1,
            selectedCombatModuleId: 'at_swordsman_mod_single_slash',
            combatModuleDisplayName: '正面集中',
            scaleSummary: '',
          },
        ],
      },
    ];

    const { panel, root } = renderPanel(mutableDisplay);
    const changesSection = getSection(
      root,
      'problem-series-wave-prep-disclosure__changes',
    );

    expect(changesSection.textContent).toContain('前Wave');
    expect(changesSection.textContent).toContain('なし');
    expect(changesSection.textContent).toContain('次Wave');
    expect(changesSection.textContent).toContain('剣術士');
    expect(changesSection.textContent).toContain('×1');
    expect(changesSection.textContent).not.toContain('変更なし');

    panel.destroy();
  });

  it('shows なし on empty next side for removed class', () => {
    const path = runWavePrepDisclosureProductionPath(
      FIXTURE_SEED_A,
      1,
      SERIES_A_ID,
    );
    const mutableDisplay = cloneDisclosureDisplay(path.display);

    mutableDisplay.enemyChanges = [
      {
        classId: 'df_guardian',
        classDisplayName: '鉄衛士',
        previousGroups: [
          {
            classId: 'df_guardian',
            classDisplayName: '鉄衛士',
            count: 2,
            selectedCombatModuleId: 'df_guardian_mod_nearest_strike',
            combatModuleDisplayName: '物理堅守',
            scaleSummary: '',
          },
        ],
        nextGroups: [],
      },
    ];

    const { panel, root } = renderPanel(mutableDisplay);
    const changesSection = getSection(
      root,
      'problem-series-wave-prep-disclosure__changes',
    );

    expect(changesSection.textContent).toContain('前Wave');
    expect(changesSection.textContent).toContain('鉄衛士');
    expect(changesSection.textContent).toContain('次Wave');
    expect(changesSection.textContent).toContain('なし');
    expect(changesSection.textContent).not.toContain('変更なし');

    panel.destroy();
  });

  it('shows 変更なし when enemyChanges is empty', () => {
    const path = runWavePrepDisclosureProductionPath(
      FIXTURE_SEED_A,
      1,
      SERIES_A_ID,
    );
    const mutableDisplay = cloneDisclosureDisplay(path.display);
    mutableDisplay.enemyChanges = [];

    const { panel, root } = renderPanel(mutableDisplay);
    const changesSection = getSection(
      root,
      'problem-series-wave-prep-disclosure__changes',
    );

    expect(changesSection.textContent).toContain('変更なし');
    expect(changesSection.querySelector('h2')?.textContent).toBe('前Waveからの変化');

    panel.destroy();
  });
});

describe('ProblemSeriesWavePrepDisclosurePanel (focused: destroy)', () => {
  it('removes only panel root, preserves sentinel, and tolerates repeated destroy', () => {
    const path = runWavePrepDisclosureProductionPath(
      FIXTURE_SEED_A,
      1,
      SERIES_A_ID,
    );
    const host = document.createElement('div');
    const sentinel = document.createElement('p');
    sentinel.textContent = 'sentinel-host-child';
    host.appendChild(sentinel);

    const panel = new ProblemSeriesWavePrepDisclosurePanel(host, path.display);
    expect(host.querySelector('.problem-series-wave-prep-disclosure')).not.toBeNull();

    panel.destroy();

    expect(host.querySelector('.problem-series-wave-prep-disclosure')).toBeNull();
    expect(host.contains(sentinel)).toBe(true);
    expect(sentinel.textContent).toBe('sentinel-host-child');

    expect(() => {
      panel.destroy();
      panel.destroy();
    }).not.toThrow();
  });
});
