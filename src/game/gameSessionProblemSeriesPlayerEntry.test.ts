/**
 * @vitest-environment happy-dom
 *
 * R12m Player 作業単位2L1: GameSession が StageSelectionScreenHost の
 * Prepare / snapshot getter / 概要戻る callback を production DOM 経路で接続する。
 *
 * R12m Player 作業単位2L2: 概要確定から prepared 作戦開始・初期編成準備へ接続する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import * as operationStartSnapshotModule from '../battle/problemSeries/operationStartSnapshot.ts';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { GameSession } from './GameSession.ts';

const PROBLEM_SERIES_SOURCE = { kind: 'problemSeries' } as const;

const RAW_FIXTURE_SEED = '  fixture-a  ';
const NORMALIZED_FIXTURE_SEED = 'fixture-a';

function mockCanvas2d(): void {
  const ctx = {
    imageSmoothingEnabled: true,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    canvas: { width: 800, height: 600 },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
}

function createSession(): GameSession {
  const loaded = tryLoadGameData();
  if (!loaded.ok) {
    throw new Error(loaded.error);
  }
  expect(loaded.data.problemSeriesCatalog.series.length).toBeGreaterThan(0);
  const container = document.createElement('div');
  document.body.appendChild(container);
  return new GameSession(loaded.data, container);
}

function countSnapshotEnemyGroups(
  snapshot: NonNullable<ReturnType<GameSession['getProblemSeriesOperationStartSnapshot']>>,
): number {
  return snapshot.waves.reduce(
    (total, wave) => total + wave.enemyGroups.length,
    0,
  );
}

function getEngine(session: GameSession): BattleEngine {
  return (session as unknown as { engine: BattleEngine }).engine;
}

function livingEnemyClassIds(engine: BattleEngine): string[] {
  return engine
    .getSnapshot()
    .enemies.filter((enemy) => enemy.hp > 0)
    .map((enemy) => enemy.classId)
    .filter((classId): classId is string => classId !== undefined);
}

function getGameAppContainer(): HTMLElement {
  const container = document.body.querySelector('.game-app');
  if (!container) {
    throw new Error('game-app container not found');
  }
  return container as HTMLElement;
}

function getStageSelectContainer(session: GameSession): HTMLElement {
  const container = document.body.querySelector('.game-app');
  if (!container) {
    throw new Error('game-app container not found');
  }
  if (session.getCurrentScreen() !== 'stageSelect') {
    throw new Error(
      `expected stageSelect screen, got ${session.getCurrentScreen()}`,
    );
  }
  return container as HTMLElement;
}

function requireButton(
  root: ParentNode,
  selector: string,
  label: string,
): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (!button) {
    throw new Error(`${label} not found: ${selector}`);
  }
  return button;
}

function requireInput(
  root: ParentNode,
  selector: string,
  label: string,
): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) {
    throw new Error(`${label} not found: ${selector}`);
  }
  return input;
}

describe('GameSession problem-series player entry wire (R12m Player unit2L1)', () => {
  let session: GameSession | null = null;

  beforeEach(() => {
    localStorage.clear();
    mockCanvas2d();
    setVerifyModeEnabled(false);
  });

  afterEach(() => {
    session?.destroy();
    session = null;
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('2L1: stageSelect DOM → prepare → overview → back discards prepared snapshot', () => {
    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const snapshotFactorySpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    session = createSession();
    const sortieSpy = vi.spyOn(
      session as unknown as { handleStageSortie: (stageId: string) => void },
      'handleStageSortie',
    );

    // 1. initial prepared snapshot null
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();

    const saveBefore = structuredClone(session.getSaveState());
    const currentStageIdBefore = saveBefore.stageProgress.currentStageId;
    const clearedStageIdsBefore = [...(saveBefore.stageProgress.clearedStageIds ?? [])];

    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(session.getOperationState()).toBeNull();

    const container = getStageSelectContainer(session);

    // 2. fixed stage list visible
    expect(container.querySelectorAll('.stage-selection-panel')).toHaveLength(1);
    expect(container.querySelectorAll('.stage-selection-list-item').length).toBeGreaterThan(
      0,
    );

    // 3. main operation button opens seed entry
    const mainButton = requireButton(
      container,
      '.stage-selection-main-operation',
      'main operation button',
    );
    mainButton.click();

    expect(container.querySelectorAll('.stage-selection-panel')).toHaveLength(0);
    expect(container.querySelectorAll('.problem-series-entry-panel')).toHaveLength(1);

    // 4. raw seed input
    const seedInput = requireInput(
      container,
      '.problem-series-entry-seed-input',
      'seed input',
    );
    const prepareButton = requireButton(
      container,
      '.problem-series-entry-prepare',
      'prepare button',
    );

    seedInput.value = RAW_FIXTURE_SEED;
    seedInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(prepareButton.disabled).toBe(false);

    // 5–8. prepare → GameSession holds snapshot
    prepareButton.click();

    const snapshot = session.getProblemSeriesOperationStartSnapshot();
    if (snapshot === null) {
      throw new Error('prepared snapshot is null after Prepare');
    }

    expect(snapshot.seed).toBe(NORMALIZED_FIXTURE_SEED);
    expect(snapshot.waves).toHaveLength(3);
    expect(countSnapshotEnemyGroups(snapshot)).toBeGreaterThan(0);

    const resolveCallsAfterPrepare = resolveSpy.mock.calls.length;
    const factoryCallsAfterPrepare = snapshotFactorySpy.mock.calls.length;
    expect(resolveCallsAfterPrepare).toBe(1);
    expect(factoryCallsAfterPrepare).toBe(1);

    // 9–10. overview panel with 3 waves
    expect(container.querySelectorAll('.problem-series-overview-panel')).toHaveLength(1);
    expect(container.querySelectorAll('.problem-series-overview-wave')).toHaveLength(3);
    expect(container.querySelectorAll('.problem-series-overview-enemy-group').length).toBeGreaterThan(
      0,
    );

    // 11. overview hides fixed stage + seed entry panels
    expect(container.querySelectorAll('.stage-selection-panel')).toHaveLength(0);
    expect(container.querySelectorAll('.problem-series-entry-panel')).toHaveLength(0);

    // 12–13. no OperationState / no battle formation wavePrep navigation
    expect(session.getOperationState()).toBeNull();
    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(container.querySelector('.game-shell__formation')?.hidden).toBe(true);
    expect(container.querySelector('.game-shell__wave-prep')?.hidden).toBe(true);
    expect(container.querySelector('.game-shell__battle')?.hidden).toBe(true);

    // 14. overview back
    const overviewBackButton = requireButton(
      container,
      '.problem-series-overview-back',
      'overview back button',
    );
    overviewBackButton.click();

    // 15–17. snapshot discarded; seed entry restored; overview/fixed absent
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(container.querySelectorAll('.problem-series-entry-panel')).toHaveLength(1);
    expect(container.querySelectorAll('.problem-series-overview-panel')).toHaveLength(0);
    expect(container.querySelectorAll('.stage-selection-panel')).toHaveLength(0);

    // 18. OperationState still null
    expect(session.getOperationState()).toBeNull();

    // 19. save stage progress unchanged
    const saveAfter = session.getSaveState();
    expect(saveAfter.stageProgress.currentStageId).toBe(currentStageIdBefore);
    expect([...(saveAfter.stageProgress.clearedStageIds ?? [])]).toEqual(
      clearedStageIdsBefore,
    );

    // 20–21. resolver/factory only on prepare; back does not re-run
    expect(resolveSpy.mock.calls.length).toBe(resolveCallsAfterPrepare);
    expect(snapshotFactorySpy.mock.calls.length).toBe(factoryCallsAfterPrepare);

    // 22. fixed stage sortie / BattleEngine start not reached
    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(sortieSpy).not.toHaveBeenCalled();
    expect(container.querySelector('.game-shell__battle')?.hidden).toBe(true);
    expect(container.querySelector('.game-shell__formation')?.hidden).toBe(true);
    expect(container.querySelector('.game-shell__wave-prep')?.hidden).toBe(true);
  });

  it('2L2: stageSelect DOM → prepare → overview confirm → formation without battle start', () => {
    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const snapshotFactorySpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    session = createSession();
    const beginPreparedSpy = vi.spyOn(session, 'beginPreparedProblemSeriesOperation');
    const sortieSpy = vi.spyOn(
      session as unknown as { handleStageSortie: (stageId: string) => void },
      'handleStageSortie',
    );
    const engine = getEngine(session);
    const engineInternals = engine as unknown as {
      spawnWaveEnemies: () => void;
    };
    const spawnWaveEnemiesSpy = vi.spyOn(engineInternals, 'spawnWaveEnemies');
    const restartSpy = vi.spyOn(engine, 'restartBattle');
    const restartAtWaveSpy = vi.spyOn(engine, 'restartBattleAtWave');
    const startSpy = vi.spyOn(engine, 'startBattle');
    const startNextWaveSpy = vi.spyOn(engine, 'startNextWave');

    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(session.getCurrentScreen()).toBe('stageSelect');

    const saveBefore = structuredClone(session.getSaveState());
    const currentStageIdBefore = saveBefore.stageProgress.currentStageId;
    const clearedStageIdsBefore = [...(saveBefore.stageProgress.clearedStageIds ?? [])];

    const container = getStageSelectContainer(session);

    const mainButton = requireButton(
      container,
      '.stage-selection-main-operation',
      'main operation button',
    );
    mainButton.click();

    const seedInput = requireInput(
      container,
      '.problem-series-entry-seed-input',
      'seed input',
    );
    const prepareButton = requireButton(
      container,
      '.problem-series-entry-prepare',
      'prepare button',
    );

    seedInput.value = RAW_FIXTURE_SEED;
    seedInput.dispatchEvent(new Event('input', { bubbles: true }));
    prepareButton.click();

    const snapshot = session.getProblemSeriesOperationStartSnapshot();
    if (snapshot === null) {
      throw new Error('prepared snapshot is null after Prepare');
    }

    expect(snapshot.seed).toBe(NORMALIZED_FIXTURE_SEED);
    expect(snapshot.waves).toHaveLength(3);
    expect(countSnapshotEnemyGroups(snapshot)).toBeGreaterThan(0);

    const resolveCallsAfterPrepare = resolveSpy.mock.calls.length;
    const factoryCallsAfterPrepare = snapshotFactorySpy.mock.calls.length;
    expect(resolveCallsAfterPrepare).toBe(1);
    expect(factoryCallsAfterPrepare).toBe(1);

    expect(container.querySelectorAll('.problem-series-overview-panel')).toHaveLength(1);
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(session.getCurrentScreen()).toBe('stageSelect');

    const enemiesBeforeConfirm = livingEnemyClassIds(engine);
    const enemySnapshotBeforeConfirm = structuredClone(engine.getSnapshot().enemies);

    expect(enemySnapshotBeforeConfirm.length).toBeGreaterThan(0);
    expect(enemiesBeforeConfirm).toEqual([
      'test_dummy',
      'test_dummy',
      'test_dummy',
      'test_dummy',
      'test_dummy',
    ]);

    const confirmButton = requireButton(
      container,
      '.problem-series-overview-confirm',
      'overview confirm button',
    );
    confirmButton.click();

    expect(beginPreparedSpy).toHaveBeenCalledTimes(1);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(snapshot);
    expect(resolveSpy.mock.calls.length).toBe(resolveCallsAfterPrepare);
    expect(snapshotFactorySpy.mock.calls.length).toBe(factoryCallsAfterPrepare);

    expect(session.hasActiveOperation()).toBe(true);
    const operation = session.getOperationState();
    if (operation === null) {
      throw new Error('operation state is null after overview confirm');
    }
    expect(operation.isActive).toBe(true);
    expect(operation.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(operation.source)).toEqual(['kind']);

    const checkpoint = session.getOperationCheckpoint();
    if (checkpoint === null) {
      throw new Error('operation checkpoint is null after overview confirm');
    }
    expect(checkpoint.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(checkpoint.source)).toEqual(['kind']);
    expect(Object.keys(checkpoint)).not.toContain('stageId');
    expect(Object.keys(checkpoint)).not.toContain('seed');
    expect(Object.keys(checkpoint)).not.toContain('seriesId');

    expect(session.getCurrentScreen()).toBe('formation');

    const appContainer = getGameAppContainer();
    const formationHost = appContainer.querySelector('.game-shell__formation');
    if (!formationHost) {
      throw new Error('formation host not found');
    }
    expect(formationHost.hidden).toBe(false);
    expect(formationHost.querySelector('.meta-menu-overlay--formation-screen')).not.toBeNull();
    expect(appContainer.querySelector('.game-shell__stage-select')?.hidden).toBe(true);
    expect(appContainer.querySelector('.game-shell__battle')?.hidden).toBe(true);
    expect(appContainer.querySelector('.game-shell__wave-prep')?.hidden).toBe(true);

    expect(spawnWaveEnemiesSpy).not.toHaveBeenCalled();
    expect(restartSpy).not.toHaveBeenCalled();
    expect(restartAtWaveSpy).not.toHaveBeenCalled();
    expect(startSpy).not.toHaveBeenCalled();
    expect(startNextWaveSpy).not.toHaveBeenCalled();
    expect(engine.getSnapshot().enemies).toStrictEqual(enemySnapshotBeforeConfirm);
    expect(livingEnemyClassIds(engine)).toEqual(enemiesBeforeConfirm);
    expect(engine.getSnapshot().enemies).toHaveLength(5);
    expect(enemySnapshotBeforeConfirm.length).toBeGreaterThan(0);

    const saveAfter = session.getSaveState();
    expect(saveAfter.stageProgress.currentStageId).toBe(currentStageIdBefore);
    expect([...(saveAfter.stageProgress.clearedStageIds ?? [])]).toEqual(
      clearedStageIdsBefore,
    );

    expect(sortieSpy).not.toHaveBeenCalled();
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(snapshot);
    expect(beginPreparedSpy).toHaveBeenCalledTimes(1);
  });
});
