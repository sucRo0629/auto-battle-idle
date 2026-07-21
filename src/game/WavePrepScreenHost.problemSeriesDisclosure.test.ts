/**
 * @vitest-environment happy-dom
 *
 * R12m Player 作業単位2U6A: WavePrepScreenHost への開示 panel 受入口
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PartyCombatModuleSelection } from '../battle/partyCombatModuleSelection.ts';
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
import type { GameData } from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import type { ProblemSeriesWavePrepDisclosureDisplay } from '../ui/problemSeriesWavePrepDisclosureViewModel.ts';
import { createProblemSeriesWavePrepDisclosureDisplay } from '../ui/problemSeriesWavePrepDisclosureViewModel.ts';
import { OperationState, type OperationStateReadonlyView } from './OperationState.ts';
import {
  WavePrepScreenHost,
  type WavePrepScreenHostCallbacks,
} from './WavePrepScreenHost.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';
const SERIES_A_ID = 'r12m_series_a';
const SERIES_B_ID = 'r12m_series_b';

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

function createWavePrepOperationView(
  gameData: GameData,
  currentWaveIndex: number,
  source: OperationStateReadonlyView['source'],
): OperationStateReadonlyView {
  const save = createDefaultSave(gameData, 'demo');
  const op = OperationState.begin({
    source,
    party: save.party,
    moduleSelection: new PartyCombatModuleSelection(),
    initialWaveIndex: currentWaveIndex,
  });
  if (!op) {
    throw new Error('Failed to begin operation state');
  }
  op.beginWavePrepEditing();
  const view = op.toReadonlyView();
  expect(view.party).toHaveLength(PARTY_SLOT_COUNT);
  expect(view.party.filter((slot) => slot !== null)).toHaveLength(PARTY_SLOT_COUNT);
  return view;
}

function createWavePrepCallbacks(
  gameData: GameData,
  overrides: Partial<WavePrepScreenHostCallbacks> = {},
): WavePrepScreenHostCallbacks {
  const unlockedClassIds = createDefaultSave(gameData, 'demo').unlockedClassIds;

  return {
    getOperationView: () => null,
    getUnlockedClassIds: () => [...unlockedClassIds],
    getSelectedModuleId: () => undefined,
    onPartySlotChanged: () => ({ ok: true }),
    onModuleChanged: () => true,
    getUnspentOperationResource: () => 0,
    getAcquiredOperationPassiveIds: () => [],
    getOperationPassiveCandidates: () => [],
    getPassiveAcquireCost: () => 0,
    getPassiveDisplayName: (passiveId) => passiveId,
    getPassiveDescription: () => '',
    onAcquireOperationPassive: () => true,
    onConfirmNextWave: () => true,
    shouldShowRetryActions: () => false,
    onRetryCurrentWave: () => true,
    onReturnToFormationPrep: () => true,
    onRestartOperationFromWaveZero: () => true,
    onReturnToStageSelect: () => true,
    ...overrides,
  };
}

function queryDisclosureHosts(root: ParentNode): NodeListOf<Element> {
  const hosts = root.querySelectorAll(
    '.wave-prep-screen__problem-series-disclosure',
  );
  expect(hosts).not.toHaveLength(0);
  return hosts;
}

function queryPanelRoots(root: ParentNode): NodeListOf<Element> {
  return root.querySelectorAll('.problem-series-wave-prep-disclosure');
}

function querySlotRows(root: ParentNode): NodeListOf<Element> {
  const slots = root.querySelectorAll('.wave-prep-screen__slot');
  expect(slots).not.toHaveLength(0);
  return slots;
}

function assertDisclosureHostPlacement(root: HTMLElement): HTMLElement {
  const wavePrepRoot = root.querySelector('.wave-prep-screen');
  expect(wavePrepRoot).not.toBeNull();
  expect(wavePrepRoot).toBeInstanceOf(HTMLElement);

  const children = [...wavePrepRoot!.children];
  const stickyHeaderIndex = children.findIndex((child) =>
    child.classList.contains('wave-prep-screen__sticky-header'),
  );
  const disclosureHostIndex = children.findIndex((child) =>
    child.classList.contains('wave-prep-screen__problem-series-disclosure'),
  );
  const slotsIndex = children.findIndex((child) =>
    child.classList.contains('wave-prep-screen__slots'),
  );
  const stickyFooterIndex = children.findIndex((child) =>
    child.classList.contains('wave-prep-screen__sticky-footer'),
  );

  expect(stickyHeaderIndex).toBeGreaterThanOrEqual(0);
  expect(disclosureHostIndex).toBeGreaterThan(stickyHeaderIndex);
  expect(slotsIndex).toBeGreaterThan(disclosureHostIndex);
  expect(stickyFooterIndex).toBeGreaterThan(slotsIndex);

  const disclosureHost = children[disclosureHostIndex] as HTMLElement;
  return disclosureHost;
}

describe('WavePrepScreenHost problem series disclosure (R12m Player unit2U6A)', () => {
  const loaded = tryLoadGameData();
  if (!loaded.ok) {
    throw new Error(loaded.error);
  }
  const gameData = loaded.data;

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('1. renders disclosure panel between sticky header and slots with Wave 2 info', () => {
    const pathA = runWavePrepDisclosureProductionPath(
      FIXTURE_SEED_A,
      1,
      SERIES_A_ID,
    );
    expect(pathA.seriesId).toBe(SERIES_A_ID);
    expect(pathA.display.nextWave.waveNumber).toBe(2);
    expect(pathA.display.enemyChanges).toHaveLength(3);

    const operationView = createWavePrepOperationView(
      gameData,
      0,
      { kind: 'problemSeries' },
    );

    const getProblemSeriesDisclosureDisplay = vi.fn(() => pathA.display);
    const hostEl = document.createElement('div');
    document.body.appendChild(hostEl);

    const screenHost = new WavePrepScreenHost(
      hostEl,
      gameData,
      createWavePrepCallbacks(gameData, {
        getOperationView: () => operationView,
        getProblemSeriesDisclosureDisplay,
      }),
    );

    screenHost.show();

    expect(getProblemSeriesDisclosureDisplay).toHaveBeenCalledTimes(1);

    const disclosureHosts = queryDisclosureHosts(hostEl);
    expect(disclosureHosts).toHaveLength(1);

    const panelRoots = queryPanelRoots(hostEl);
    expect(panelRoots).toHaveLength(1);

    const disclosureHost = assertDisclosureHostPlacement(hostEl);
    expect(disclosureHost).toBe(disclosureHosts[0]);

    const nextWaveSection = panelRoots[0]!.querySelector(
      '.problem-series-wave-prep-disclosure__next-wave',
    );
    expect(nextWaveSection).not.toBeNull();
    expect(nextWaveSection?.querySelector('h3')?.textContent).toBe('Wave 2');

    const changesSection = panelRoots[0]!.querySelector(
      '.problem-series-wave-prep-disclosure__changes',
    );
    expect(changesSection).not.toBeNull();
    for (const change of pathA.display.enemyChanges) {
      expect(changesSection?.textContent).toContain(change.classDisplayName);
    }

    const slotRows = querySlotRows(hostEl);
    expect(slotRows).toHaveLength(PARTY_SLOT_COUNT);

    const statusEl = hostEl.querySelector('.wave-prep-screen__status');
    expect(statusEl?.textContent).toContain('Wave 1 クリア');
    expect(statusEl?.textContent).toContain('Wave 2');

    screenHost.destroy();
  });

  it('2. prevents duplicate panel roots across repeated refresh', () => {
    const pathA = runWavePrepDisclosureProductionPath(
      FIXTURE_SEED_A,
      1,
      SERIES_A_ID,
    );
    expect(pathA.display.nextWave.waveNumber).toBe(2);

    const operationView = createWavePrepOperationView(
      gameData,
      0,
      { kind: 'problemSeries' },
    );

    const getProblemSeriesDisclosureDisplay = vi.fn(() => pathA.display);
    const hostEl = document.createElement('div');
    document.body.appendChild(hostEl);

    const screenHost = new WavePrepScreenHost(
      hostEl,
      gameData,
      createWavePrepCallbacks(gameData, {
        getOperationView: () => operationView,
        getProblemSeriesDisclosureDisplay,
      }),
    );

    screenHost.show();
    const firstPanelRoot = queryPanelRoots(hostEl)[0]!;

    screenHost.refresh();
    screenHost.refresh();

    expect(getProblemSeriesDisclosureDisplay).toHaveBeenCalledTimes(3);

    const disclosureHosts = queryDisclosureHosts(hostEl);
    expect(disclosureHosts).toHaveLength(1);

    const panelRoots = queryPanelRoots(hostEl);
    expect(panelRoots).toHaveLength(1);
    expect(panelRoots[0]).not.toBe(firstPanelRoot);

    const nextWaveHeadings = panelRoots[0]!.querySelectorAll('h3');
    const wave2Headings = [...nextWaveHeadings].filter(
      (heading) => heading.textContent === 'Wave 2',
    );
    expect(wave2Headings).toHaveLength(1);

    screenHost.destroy();
  });

  it('3. replaces panel when disclosure display changes from series A Wave 2 to series B Wave 3', () => {
    const pathA = runWavePrepDisclosureProductionPath(
      FIXTURE_SEED_A,
      1,
      SERIES_A_ID,
    );
    expect(pathA.display.nextWave.waveNumber).toBe(2);

    const pathB = runWavePrepDisclosureProductionPath(
      FIXTURE_SEED_B,
      2,
      SERIES_B_ID,
    );
    expect(pathB.seriesId).toBe(SERIES_B_ID);
    expect(pathB.display.nextWave.waveNumber).toBe(3);

    const operationView = createWavePrepOperationView(
      gameData,
      1,
      { kind: 'problemSeries' },
    );

    let currentDisplay: ProblemSeriesWavePrepDisclosureDisplay | null = pathA.display;
    const getProblemSeriesDisclosureDisplay = vi.fn(
      () => currentDisplay,
    );

    const hostEl = document.createElement('div');
    document.body.appendChild(hostEl);

    const screenHost = new WavePrepScreenHost(
      hostEl,
      gameData,
      createWavePrepCallbacks(gameData, {
        getOperationView: () => operationView,
        getProblemSeriesDisclosureDisplay,
      }),
    );

    screenHost.show();
    const firstPanelRoot = queryPanelRoots(hostEl)[0]!;
    expect(firstPanelRoot.textContent).toContain('Wave 2');
    expect(firstPanelRoot.textContent).toContain('Wave 3');

    currentDisplay = pathB.display;
    screenHost.refresh();

    const panelRoots = queryPanelRoots(hostEl);
    expect(panelRoots).toHaveLength(1);
    expect(panelRoots[0]).not.toBe(firstPanelRoot);
    expect(document.body.contains(firstPanelRoot)).toBe(false);

    const nextWaveSection = panelRoots[0]!.querySelector(
      '.problem-series-wave-prep-disclosure__next-wave',
    );
    expect(nextWaveSection?.querySelector('h3')?.textContent).toBe('Wave 3');
    expect(panelRoots[0]!.textContent).not.toContain('Wave 2');

    const remainingSection = panelRoots[0]!.querySelector(
      '.problem-series-wave-prep-disclosure__remaining',
    );
    expect(remainingSection?.textContent).toContain('次Wave以降のWaveなし');

    screenHost.destroy();
  });

  it('4. clears panel root when disclosure callback returns null', () => {
    const pathA = runWavePrepDisclosureProductionPath(
      FIXTURE_SEED_A,
      1,
      SERIES_A_ID,
    );

    const operationView = createWavePrepOperationView(
      gameData,
      0,
      { kind: 'problemSeries' },
    );

    let currentDisplay: ProblemSeriesWavePrepDisclosureDisplay | null = pathA.display;
    const getProblemSeriesDisclosureDisplay = vi.fn(
      () => currentDisplay,
    );

    const hostEl = document.createElement('div');
    document.body.appendChild(hostEl);

    const screenHost = new WavePrepScreenHost(
      hostEl,
      gameData,
      createWavePrepCallbacks(gameData, {
        getOperationView: () => operationView,
        getProblemSeriesDisclosureDisplay,
      }),
    );

    screenHost.show();
    expect(queryPanelRoots(hostEl)).toHaveLength(1);

    currentDisplay = null;
    screenHost.refresh();

    const disclosureHosts = queryDisclosureHosts(hostEl);
    expect(disclosureHosts).toHaveLength(1);
    expect(queryPanelRoots(hostEl)).toHaveLength(0);
    expect(querySlotRows(hostEl)).toHaveLength(PARTY_SLOT_COUNT);

    screenHost.destroy();
  });

  it('5. destroys panel when operation view becomes null', () => {
    const pathA = runWavePrepDisclosureProductionPath(
      FIXTURE_SEED_A,
      1,
      SERIES_A_ID,
    );

    const operationView = createWavePrepOperationView(
      gameData,
      0,
      { kind: 'problemSeries' },
    );

    let currentOperationView: OperationStateReadonlyView | null = operationView;
    const hostEl = document.createElement('div');
    document.body.appendChild(hostEl);

    const screenHost = new WavePrepScreenHost(
      hostEl,
      gameData,
      createWavePrepCallbacks(gameData, {
        getOperationView: () => currentOperationView,
        getProblemSeriesDisclosureDisplay: () => pathA.display,
      }),
    );

    screenHost.show();
    expect(queryPanelRoots(hostEl)).toHaveLength(1);

    currentOperationView = null;
    screenHost.refresh();

    const disclosureHosts = queryDisclosureHosts(hostEl);
    expect(disclosureHosts).toHaveLength(1);
    expect(disclosureHosts[0]!.childElementCount).toBe(0);
    expect(queryPanelRoots(hostEl)).toHaveLength(0);

    const statusEl = hostEl.querySelector('.wave-prep-screen__status');
    expect(statusEl?.textContent).toBe('作戦データなし');
    expect(hostEl.querySelectorAll('.wave-prep-screen__slot')).toHaveLength(0);

    screenHost.destroy();
  });

  it('6. tolerates missing disclosure callback for fixedStage operation view', () => {
    const operationView = createWavePrepOperationView(
      gameData,
      0,
      { kind: 'fixedStage', stageId: '1' },
    );

    const hostEl = document.createElement('div');
    document.body.appendChild(hostEl);

    const screenHost = new WavePrepScreenHost(
      hostEl,
      gameData,
      createWavePrepCallbacks(gameData, {
        getOperationView: () => operationView,
      }),
    );

    expect(() => {
      screenHost.show();
      screenHost.refresh();
    }).not.toThrow();

    const disclosureHosts = queryDisclosureHosts(hostEl);
    expect(disclosureHosts).toHaveLength(1);
    expect(queryPanelRoots(hostEl)).toHaveLength(0);
    expect(querySlotRows(hostEl)).toHaveLength(PARTY_SLOT_COUNT);

    const statusEl = hostEl.querySelector('.wave-prep-screen__status');
    expect(statusEl?.textContent).toContain('Wave 1 クリア');
    expect(statusEl?.textContent).toContain('Wave 2');

    screenHost.destroy();
  });

  it('7. destroy removes wave prep root and panel while preserving sentinel', () => {
    const pathA = runWavePrepDisclosureProductionPath(
      FIXTURE_SEED_A,
      1,
      SERIES_A_ID,
    );

    const operationView = createWavePrepOperationView(
      gameData,
      0,
      { kind: 'problemSeries' },
    );

    const hostEl = document.createElement('div');
    document.body.appendChild(hostEl);
    const sentinel = document.createElement('p');
    sentinel.textContent = 'sentinel-host-child';
    document.body.appendChild(sentinel);

    const screenHost = new WavePrepScreenHost(
      hostEl,
      gameData,
      createWavePrepCallbacks(gameData, {
        getOperationView: () => operationView,
        getProblemSeriesDisclosureDisplay: () => pathA.display,
      }),
    );

    screenHost.show();
    expect(hostEl.querySelector('.wave-prep-screen')).not.toBeNull();
    expect(queryPanelRoots(hostEl)).toHaveLength(1);

    screenHost.destroy();

    expect(hostEl.querySelector('.wave-prep-screen')).toBeNull();
    expect(queryPanelRoots(hostEl)).toHaveLength(0);
    expect(document.body.contains(sentinel)).toBe(true);
    expect(sentinel.textContent).toBe('sentinel-host-child');

    expect(() => {
      screenHost.destroy();
    }).not.toThrow();
  });
});
