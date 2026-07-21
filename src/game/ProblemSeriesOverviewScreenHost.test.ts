/**
 * @vitest-environment happy-dom
 *
 * R12m Player 作業単位2I1: ProblemSeriesOverviewScreenHost
 * prepared snapshot を callback から取得し facade + panel で表示する host 境界。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { createProblemSeriesOperationStartSnapshot } from '../battle/problemSeries/operationStartSnapshot.ts';
import * as operationStartSnapshotModule from '../battle/problemSeries/operationStartSnapshot.ts';
import { resolveProblemSeriesFromSeed } from '../battle/problemSeries/seedResolve.ts';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import { ProblemSeriesOverviewScreenHost } from './ProblemSeriesOverviewScreenHost.ts';

const FIXTURE_SEED_A = 'fixture-a';
const SERIES_A_ID = 'r12m_series_a';
const WAVE_ADJUSTMENT_NOTE_TEXT =
  'Wave間準備では、編成・CombatModule・作戦内パッシブを変更できます。';

function totalEnemyGroupCount(
  waves: readonly { enemyGroups: readonly unknown[] }[],
): number {
  return waves.reduce((sum, wave) => sum + wave.enemyGroups.length, 0);
}

function assertSnapshotReferenceStructureUnchanged(
  snapshot: ReturnType<typeof createProblemSeriesOperationStartSnapshot>,
  snapshotBefore: ReturnType<typeof structuredClone<typeof snapshot>>,
  snapshotWavesRef: typeof snapshot.waves,
  snapshotWaveRefs: readonly (typeof snapshot.waves)[number][],
  snapshotEnemyGroupsRefs: readonly (typeof snapshot.waves)[number]['enemyGroups'][],
  snapshotGroupRefs: readonly unknown[],
): void {
  expect(snapshot).toEqual(snapshotBefore);
  expect(snapshot.waves).toBe(snapshotWavesRef);
  for (let waveIndex = 0; waveIndex < snapshot.waves.length; waveIndex++) {
    expect(snapshot.waves[waveIndex]).toBe(snapshotWaveRefs[waveIndex]);
    expect(snapshot.waves[waveIndex]!.enemyGroups).toBe(
      snapshotEnemyGroupsRefs[waveIndex],
    );
  }
  let flatIndex = 0;
  for (const wave of snapshot.waves) {
    for (const group of wave.enemyGroups) {
      expect(group).toBe(snapshotGroupRefs[flatIndex]);
      flatIndex += 1;
    }
  }
}

describe('ProblemSeriesOverviewScreenHost (R12m Player unit2I1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fixture-a: production snapshot を表示し hide/show/destroy と callback を扱う', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    expect(loaded.data.problemSeriesCatalog.series.length).toBeGreaterThan(0);

    const gameData = loaded.data;
    const catalog = gameData.problemSeriesCatalog;
    const result = resolveProblemSeriesFromSeed(catalog, FIXTURE_SEED_A);
    expect(result.series.seriesId).toBe(SERIES_A_ID);

    const snapshot = createProblemSeriesOperationStartSnapshot(result);
    expect(snapshot.seriesId).toBe(SERIES_A_ID);
    expect(snapshot.waves).toHaveLength(3);
    expect(snapshot.operationConditions).toEqual([]);

    const totalSnapshotGroups = totalEnemyGroupCount(snapshot.waves);
    expect(totalSnapshotGroups).toBeGreaterThan(0);

    const snapshotBefore = structuredClone(snapshot);
    const snapshotWavesRef = snapshot.waves;
    const snapshotWaveRefs = snapshot.waves.map((wave) => wave);
    const snapshotEnemyGroupsRefs = snapshot.waves.map((wave) => wave.enemyGroups);
    const snapshotGroupRefs = snapshot.waves.flatMap((wave) => [...wave.enemyGroups]);

    const resolveSpy = vi.spyOn(seedResolveModule, 'resolveProblemSeriesFromSeed');
    const snapshotFactorySpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );
    resolveSpy.mockClear();
    snapshotFactorySpy.mockClear();

    const host = document.createElement('div');
    host.hidden = true;
    document.body.appendChild(host);

    const getPreparedSnapshot = vi.fn(() => snapshot);
    const onBack = vi.fn();
    const onConfirm = vi.fn();

    const screenHost = new ProblemSeriesOverviewScreenHost(
      host,
      gameData,
      { getPreparedSnapshot, onBack, onConfirm },
    );

    screenHost.show();

    expect(getPreparedSnapshot).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(0);
    expect(onConfirm).toHaveBeenCalledTimes(0);
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(snapshotFactorySpy).not.toHaveBeenCalled();
    expect(host.hidden).toBe(false);

    const panelRoots = host.querySelectorAll('.problem-series-overview-panel');
    expect(panelRoots).toHaveLength(1);
    const panelRoot = panelRoots[0]!;

    const conditionsSections = panelRoot.querySelectorAll(
      '.problem-series-overview-conditions',
    );
    expect(conditionsSections).toHaveLength(1);
    const conditionsSection = conditionsSections[0]!;
    expect(conditionsSection.querySelector('h2')?.textContent).toBe('作戦固有条件');
    expect(
      conditionsSection.querySelectorAll('.problem-series-overview-conditions-empty'),
    ).toHaveLength(1);
    expect(
      conditionsSection.querySelector('.problem-series-overview-conditions-empty')
        ?.textContent,
    ).toBe('なし');
    expect(
      conditionsSection.querySelectorAll('.problem-series-overview-condition'),
    ).toHaveLength(0);

    const waveAdjustmentNotes = panelRoot.querySelectorAll(
      '.problem-series-overview-wave-adjustment-note',
    );
    expect(waveAdjustmentNotes).toHaveLength(1);
    expect(waveAdjustmentNotes[0]?.textContent).toBe(WAVE_ADJUSTMENT_NOTE_TEXT);

    const waveEls = host.querySelectorAll('.problem-series-overview-wave');
    expect(waveEls).toHaveLength(3);

    const groupEls = host.querySelectorAll('.problem-series-overview-enemy-group');
    expect(groupEls).toHaveLength(totalSnapshotGroups);
    expect(groupEls.length).toBeGreaterThan(0);

    const seedEl = host.querySelector('.problem-series-overview-seed');
    expect(seedEl?.textContent).toContain(FIXTURE_SEED_A);

    for (const groupEl of groupEls) {
      const classEl = groupEl.querySelector('.problem-series-overview-enemy-class');
      const moduleEl = groupEl.querySelector('.problem-series-overview-enemy-module');
      expect(classEl?.textContent).not.toBe('');
      expect(moduleEl?.textContent).toMatch(/^CombatModule: .+/);
    }

    expect(host.querySelector('.stage-selection-panel')).toBeNull();

    assertSnapshotReferenceStructureUnchanged(
      snapshot,
      snapshotBefore,
      snapshotWavesRef,
      snapshotWaveRefs,
      snapshotEnemyGroupsRefs,
      snapshotGroupRefs,
    );

    const backButton = host.querySelector<HTMLButtonElement>(
      '.problem-series-overview-back',
    )!;
    backButton.click();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(0);

    const confirmButton = host.querySelector<HTMLButtonElement>(
      '.problem-series-overview-confirm',
    )!;
    confirmButton.click();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    screenHost.hide();
    expect(host.hidden).toBe(true);
    expect(host.querySelectorAll('.problem-series-overview-panel')).toHaveLength(1);

    screenHost.show();
    expect(host.querySelectorAll('.problem-series-overview-panel')).toHaveLength(1);
    expect(getPreparedSnapshot).toHaveBeenCalledTimes(2);

    const onBackBeforeDestroy = onBack.mock.calls.length;
    const onConfirmBeforeDestroy = onConfirm.mock.calls.length;
    screenHost.destroy();
    expect(host.querySelectorAll('.problem-series-overview-panel')).toHaveLength(0);
    expect(onBack.mock.calls.length).toBe(onBackBeforeDestroy);
    expect(onConfirm.mock.calls.length).toBe(onConfirmBeforeDestroy);

    host.remove();
  });

  it('fixture-a production resolver: non-empty operationConditions reach overview DOM', () => {
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
    expect(snapshot.seriesId).toBe(SERIES_A_ID);
    expect(snapshot.operationConditions).toEqual([
      'condition one',
      'condition two',
    ]);
    expect(snapshot.waves).toHaveLength(3);

    const totalSnapshotGroups = totalEnemyGroupCount(snapshot.waves);
    expect(totalSnapshotGroups).toBeGreaterThan(0);

    const snapshotBefore = structuredClone(snapshot);
    const snapshotConditionsRef = snapshot.operationConditions;

    const resolveSpy = vi.spyOn(seedResolveModule, 'resolveProblemSeriesFromSeed');
    const snapshotFactorySpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );
    resolveSpy.mockClear();
    snapshotFactorySpy.mockClear();

    const host = document.createElement('div');
    host.hidden = true;
    document.body.appendChild(host);

    const getPreparedSnapshot = vi.fn(() => snapshot);
    const screenHost = new ProblemSeriesOverviewScreenHost(host, gameData, {
      getPreparedSnapshot,
      onBack: vi.fn(),
      onConfirm: vi.fn(),
    });

    screenHost.show();

    expect(getPreparedSnapshot).toHaveBeenCalledTimes(1);
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(snapshotFactorySpy).not.toHaveBeenCalled();

    const panelRoots = host.querySelectorAll(
      '.problem-series-overview-panel',
    );
    expect(panelRoots).toHaveLength(1);
    const panelRoot = panelRoots[0]!;

    const conditionsSections = panelRoot.querySelectorAll(
      '.problem-series-overview-conditions',
    );
    expect(conditionsSections).toHaveLength(1);
    const conditionsSection = conditionsSections[0]!;
    const conditionEls = conditionsSection.querySelectorAll(
      '.problem-series-overview-condition',
    );
    expect(conditionEls).toHaveLength(2);
    expect(conditionEls[0]?.textContent).toBe('condition one');
    expect(conditionEls[1]?.textContent).toBe('condition two');
    expect(
      conditionsSection.querySelectorAll('.problem-series-overview-conditions-empty'),
    ).toHaveLength(0);
    expect(conditionsSection.textContent).not.toContain('なし');

    const waveAdjustmentNotes = panelRoot.querySelectorAll(
      '.problem-series-overview-wave-adjustment-note',
    );
    expect(waveAdjustmentNotes).toHaveLength(1);
    expect(waveAdjustmentNotes[0]?.textContent).toBe(WAVE_ADJUSTMENT_NOTE_TEXT);

    const waveEls = host.querySelectorAll('.problem-series-overview-wave');
    expect(waveEls).toHaveLength(3);

    const groupEls = host.querySelectorAll('.problem-series-overview-enemy-group');
    expect(groupEls.length).toBeGreaterThan(0);
    expect(groupEls).toHaveLength(totalSnapshotGroups);

    expect(snapshot).toEqual(snapshotBefore);
    expect(snapshot.operationConditions).toBe(snapshotConditionsRef);
    expect(snapshot.operationConditions).toEqual([
      'condition one',
      'condition two',
    ]);

    operationConditions.push('mutated');
    resultWithConditions.series.operationConditions.push('mutated');
    expect(snapshot.operationConditions).toEqual([
      'condition one',
      'condition two',
    ]);

    screenHost.destroy();
    host.remove();
  });

  it('snapshot null を拒否し panel / host 表示 / callback / Stage fallback を行わない', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }

    const resolveSpy = vi.spyOn(seedResolveModule, 'resolveProblemSeriesFromSeed');
    const snapshotFactorySpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    const host = document.createElement('div');
    host.hidden = true;
    document.body.appendChild(host);

    const getPreparedSnapshot = vi.fn(() => null);
    const onBack = vi.fn();
    const onConfirm = vi.fn();

    const screenHost = new ProblemSeriesOverviewScreenHost(
      host,
      loaded.data,
      { getPreparedSnapshot, onBack, onConfirm },
    );

    expect(() => screenHost.show()).toThrow(
      'problem series overview requires prepared snapshot',
    );

    expect(getPreparedSnapshot).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(0);
    expect(onConfirm).toHaveBeenCalledTimes(0);
    expect(host.hidden).toBe(true);
    expect(host.querySelectorAll('.problem-series-overview-panel')).toHaveLength(0);
    expect(host.querySelectorAll('.problem-series-overview-wave')).toHaveLength(0);
    expect(host.querySelector('.stage-selection-panel')).toBeNull();
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(snapshotFactorySpy).not.toHaveBeenCalled();

    host.remove();
  });
});
