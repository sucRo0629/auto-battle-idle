/**
 * @vitest-environment happy-dom
 *
 * R12m Player 作業単位2L1: GameSession が StageSelectionScreenHost の
 * Prepare / snapshot getter / 概要戻る callback を production DOM 経路で接続する。
 *
 * R12m Player 作業単位2L2: 概要確定から prepared 作戦開始・初期編成準備へ接続する。
 *
 * R12m Player 作業単位2M1: formation 確定から problemSeries Wave 0 戦闘へ接続する。
 *
 * R12m Player 作業単位2M2: 系列A Wave 0 クリアから Wave 1 準備（WavePrep）への production 回帰。
 *
 * R12m Player 作業単位2M3: WavePrep 確定から系列A Wave 1 戦闘への production 回帰。
 *
 * R12m Player 作業単位2M4: Wave 1 準備 UI でパッシブ1件取得し Wave 1 checkpoint に反映。
 *
 * R12m Player 作業単位2M5: Wave 1 クリアから Wave 2 準備への production 回帰（パッシブ維持・grant加算）。
 *
 * R12m Player 作業単位2M6: Wave 2 準備確定から系列A Wave 2 戦闘への production 回帰。
 *
 * R12m Player 作業単位2P3: 問題系列最終勝利結果から新 seed 入力→異系列 3 Wave 概要への production 接続。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import {
  killAllEnemies,
  TICK_DT,
} from '../battle/test/battleFieldSpec.harness.ts';
import { expandEnemyGroupsList } from '../battle/enemyGroupSpawn.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { expectVictoryOverlayVisuallyHidden, expectVictoryOverlayVisuallyVisible } from '../ui/battleResultOverlayTestUtils.ts';
import type { ResolvedWavesCombatInput } from '../battle/resolvedWaveCombatInput.ts';
import * as operationStartSnapshotModule from '../battle/problemSeries/operationStartSnapshot.ts';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import * as victoryResultModule from '../battle/problemSeries/victoryResult.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import * as stageProgressionModule from '../progression/stageProgression.ts';
import * as victoryRewardsModule from '../progression/victoryRewards.ts';
import { GameSession } from './GameSession.ts';

const PROBLEM_SERIES_SOURCE = { kind: 'problemSeries' } as const;
const SERIES_A_ID = 'r12m_series_a';
const SERIES_B_ID = 'r12m_series_b';

const RAW_FIXTURE_SEED = '  fixture-a  ';
const NORMALIZED_FIXTURE_SEED = 'fixture-a';
const RAW_FIXTURE_SEED_B = '  fixture-b  ';
const NORMALIZED_FIXTURE_SEED_B = 'fixture-b';

const FORBIDDEN_OVERVIEW_DOM_SUBSTRINGS = [
  'internalProblemClass',
  'expectedFailureModes',
  'problemClassification',
  'concentrated_pressure',
  'scattered_pressure',
  'concentrated_scattered_simultaneous_pressure',
] as const;

const INITIAL_DUMMY_ENEMY_CLASS_IDS = [
  'test_dummy',
  'test_dummy',
  'test_dummy',
  'test_dummy',
  'test_dummy',
] as const;

const TICK_MS = 1000 / 60;
const MAX_ENGAGE_TICKS = 5000;
const MAX_WAVE_PREP_TICKS = 90_000;

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
    strokeText: vi.fn(),
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

function livingEnemyCount(engine: BattleEngine): number {
  return engine.getSnapshot().enemies.filter((enemy) => enemy.hp > 0).length;
}

function getEngineProvider(
  engine: BattleEngine,
): (() => ResolvedWavesCombatInput | null) | undefined {
  return (
    engine as unknown as {
      getResolvedWavesCombatInput?: () => ResolvedWavesCombatInput | null;
    }
  ).getResolvedWavesCombatInput;
}

function expandWaveExpectedClassIds(
  snapshot: NonNullable<ReturnType<GameSession['getProblemSeriesOperationStartSnapshot']>>,
  waveIndex: number,
): string[] {
  const wave = snapshot.waves[waveIndex];
  if (wave === undefined) {
    throw new Error(`prepared snapshot has no Wave ${waveIndex}`);
  }
  expect(wave.enemyGroups.length).toBeGreaterThan(0);
  const specs = expandEnemyGroupsList([...wave.enemyGroups]);
  expect(specs.length).toBeGreaterThan(0);
  return specs.map((spec) => spec.classId);
}

function expandWave0ExpectedClassIds(
  snapshot: NonNullable<ReturnType<GameSession['getProblemSeriesOperationStartSnapshot']>>,
): string[] {
  return expandWaveExpectedClassIds(snapshot, 0);
}

function tickSession(session: GameSession, frames = 1): void {
  for (let i = 0; i < frames; i++) {
    session.tick(TICK_DT, TICK_MS);
  }
}

function waitForEngagedViaSession(
  session: GameSession,
  engine: BattleEngine,
  maxTicks = MAX_ENGAGE_TICKS,
): void {
  for (let i = 0; i < maxTicks; i++) {
    tickSession(session, 1);
    if (engine.getSnapshot().engaged) return;
  }
  throw new Error('engagement did not start via production tick');
}

function advanceSessionToWavePrepAfterKill(
  session: GameSession,
  engine: BattleEngine,
  spawnWaveEnemiesSpy: { mock: { calls: unknown[] } },
  maxTicks = MAX_WAVE_PREP_TICKS,
): void {
  const spawnCallsBeforeAdvance = spawnWaveEnemiesSpy.mock.calls.length;
  killAllEnemies(engine);
  for (let i = 0; i < maxTicks; i++) {
    tickSession(session, 1);
    if (session.getCurrentScreen() === 'wavePrep') {
      expect(spawnWaveEnemiesSpy.mock.calls.length).toBe(spawnCallsBeforeAdvance);
      return;
    }
    const snap = engine.getSnapshot();
    if (snap.phase === 'victory' || snap.phase === 'defeat') {
      throw new Error(
        [
          `battle ended (${snap.phase}) before wave prep`,
          `engine phase=${snap.phase}`,
          `screen=${session.getCurrentScreen()}`,
          `waveIndex=${snap.waveIndex}`,
          `awaitingNextWave=${snap.awaitingNextWave}`,
          `currentWaveIndex=${session.getOperationWaveIndex()}`,
          `clearedWaveCount=${session.getClearedWaveCount()}`,
          `spawnCalls=${spawnWaveEnemiesSpy.mock.calls.length}`,
          `unspentResource=${session.getOperationUnspentResource()}`,
        ].join('; '),
      );
    }
  }
  const snap = engine.getSnapshot();
  throw new Error(
    [
      'wave prep not reached within tick limit',
      `engine phase=${snap.phase}`,
      `screen=${session.getCurrentScreen()}`,
      `waveIndex=${snap.waveIndex}`,
      `awaitingNextWave=${snap.awaitingNextWave}`,
      `currentWaveIndex=${session.getOperationWaveIndex()}`,
      `clearedWaveCount=${session.getClearedWaveCount()}`,
      `spawnCalls=${spawnWaveEnemiesSpy.mock.calls.length}`,
      `unspentResource=${session.getOperationUnspentResource()}`,
    ].join('; '),
  );
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

function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
  label: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`${label} not found: ${selector}`);
  }
  return element;
}

function listVisibleVictoryResultButtons(root: ParentNode): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('.battle-victory-result-button')].filter(
    (button) => !button.hidden,
  );
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

  it('2M1: stageSelect DOM → prepare → overview confirm → formation confirm → problemSeries Wave 0 battle', () => {
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
    const engine = getEngine(session);
    const provider = getEngineProvider(engine);
    if (provider === undefined) {
      throw new Error('BattleEngine resolved waves provider is missing');
    }
    const engineInternals = engine as unknown as {
      spawnWaveEnemies: () => void;
    };
    const spawnWaveEnemiesSpy = vi.spyOn(engineInternals, 'spawnWaveEnemies');
    const restartSpy = vi.spyOn(engine, 'restartBattle');
    const restartAtWaveSpy = vi.spyOn(engine, 'restartBattleAtWave');
    const startSpy = vi.spyOn(engine, 'startBattle');
    const startNextWaveSpy = vi.spyOn(engine, 'startNextWave');

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

    const resolveCallsAfterPrepare = resolveSpy.mock.calls.length;
    const factoryCallsAfterPrepare = snapshotFactorySpy.mock.calls.length;
    expect(resolveCallsAfterPrepare).toBe(1);
    expect(factoryCallsAfterPrepare).toBe(1);

    const confirmButton = requireButton(
      container,
      '.problem-series-overview-confirm',
      'overview confirm button',
    );
    confirmButton.click();

    const appContainer = getGameAppContainer();

    // formation 確定前 (1–13)
    expect(session.getProblemSeriesOperationStartSnapshot()).not.toBeNull();
    expect(snapshot.seed).toBe(NORMALIZED_FIXTURE_SEED);
    expect(snapshot.seriesId).toBe(SERIES_A_ID);
    expect(snapshot.waves).toHaveLength(3);

    const wave0 = snapshot.waves[0];
    if (wave0 === undefined) {
      throw new Error('prepared snapshot has no Wave 0');
    }
    expect(wave0.enemyGroups.length).toBeGreaterThan(0);
    expect(wave0.prepResourceGrant).toBe(0);

    const operation = session.getOperationState();
    if (operation === null) {
      throw new Error('operation state is null before formation confirm');
    }
    expect(operation.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(operation.source)).toEqual(['kind']);

    const checkpointBeforeConfirm = session.getOperationCheckpoint();
    if (checkpointBeforeConfirm === null) {
      throw new Error('operation checkpoint is null before formation confirm');
    }
    expect(checkpointBeforeConfirm.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(checkpointBeforeConfirm.source)).toEqual(['kind']);

    expect(session.getCurrentScreen()).toBe('formation');

    const returnButton = requireButton(
      appContainer,
      '.skill-menu-return-to-battle-button',
      'formation confirm button',
    );
    expect(returnButton.disabled).toBe(false);

    const enemiesBeforeConfirm = livingEnemyClassIds(engine);
    expect(enemiesBeforeConfirm).toEqual([...INITIAL_DUMMY_ENEMY_CLASS_IDS]);

    const expectedWave0ClassIds = expandWave0ExpectedClassIds(snapshot);
    expect(expectedWave0ClassIds.length).toBeGreaterThan(0);
    expect(expectedWave0ClassIds).not.toEqual([...INITIAL_DUMMY_ENEMY_CLASS_IDS]);

    expect(provider()).toBe(snapshot.waves);

    expect(spawnWaveEnemiesSpy).not.toHaveBeenCalled();
    expect(restartSpy).not.toHaveBeenCalled();
    expect(restartAtWaveSpy).not.toHaveBeenCalled();
    expect(startSpy).not.toHaveBeenCalled();
    expect(startNextWaveSpy).not.toHaveBeenCalled();
    expect(sortieSpy).not.toHaveBeenCalled();

    // formation 確定操作 (14–19)
    returnButton.click();

    expect(restartAtWaveSpy).toHaveBeenCalledTimes(1);
    expect(restartAtWaveSpy).toHaveBeenCalledWith(0);
    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(1);
    expect(resolveSpy.mock.calls.length).toBe(resolveCallsAfterPrepare);
    expect(snapshotFactorySpy.mock.calls.length).toBe(factoryCallsAfterPrepare);

    // formation 確定後 (20–33)
    expect(session.getCurrentScreen()).toBe('battle');

    const battleHost = appContainer.querySelector('.game-shell__battle');
    if (battleHost === null) {
      throw new Error('battle host not found');
    }
    expect(battleHost.hidden).toBe(false);
    expect(appContainer.querySelector('.game-shell__formation')?.hidden).toBe(true);
    expect(appContainer.querySelector('.game-shell__stage-select')?.hidden).toBe(true);
    expect(appContainer.querySelector('.game-shell__wave-prep')?.hidden).toBe(true);

    const livingAfterConfirm = livingEnemyClassIds(engine);
    expect(livingAfterConfirm.length).toBeGreaterThan(0);
    expect(livingAfterConfirm).toEqual(expectedWave0ClassIds);
    expect(livingAfterConfirm).not.toEqual([...INITIAL_DUMMY_ENEMY_CLASS_IDS]);

    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(snapshot);
    expect(session.getOperationState()?.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(session.getOperationState()!.source)).toEqual(['kind']);
    expect(session.getOperationCheckpoint()?.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(session.getOperationCheckpoint()!.source)).toEqual(['kind']);
    expect(session.getOperationCheckpoint()?.source).not.toHaveProperty('stageId');
    expect(session.getOperationState()?.source).not.toHaveProperty('stageId');

    const saveAfter = session.getSaveState();
    expect(saveAfter.stageProgress.currentStageId).toBe(currentStageIdBefore);
    expect([...(saveAfter.stageProgress.clearedStageIds ?? [])]).toEqual(
      clearedStageIdsBefore,
    );

    expect(sortieSpy).not.toHaveBeenCalled();
    expect(restartSpy).not.toHaveBeenCalled();
    expect(startSpy).not.toHaveBeenCalled();
    expect(startNextWaveSpy).not.toHaveBeenCalled();
    expect(provider()).toBe(snapshot.waves);
  });

  it('2M2: stageSelect DOM → formation confirm → Wave 0 battle → Wave 0 clear → Wave 1 prep (WavePrep)', () => {
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
    const engine = getEngine(session);
    const provider = getEngineProvider(engine);
    if (provider === undefined) {
      throw new Error('BattleEngine resolved waves provider is missing');
    }
    const engineInternals = engine as unknown as {
      spawnWaveEnemies: () => void;
    };
    const spawnWaveEnemiesSpy = vi.spyOn(engineInternals, 'spawnWaveEnemies');
    const restartSpy = vi.spyOn(engine, 'restartBattle');
    const restartAtWaveSpy = vi.spyOn(engine, 'restartBattleAtWave');
    const startSpy = vi.spyOn(engine, 'startBattle');
    const startNextWaveSpy = vi.spyOn(engine, 'startNextWave');

    session.start();

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

    const resolveCallsAfterPrepare = resolveSpy.mock.calls.length;
    const factoryCallsAfterPrepare = snapshotFactorySpy.mock.calls.length;
    expect(resolveCallsAfterPrepare).toBe(1);
    expect(factoryCallsAfterPrepare).toBe(1);

    const confirmButton = requireButton(
      container,
      '.problem-series-overview-confirm',
      'overview confirm button',
    );
    confirmButton.click();

    const appContainer = getGameAppContainer();
    const returnButton = requireButton(
      appContainer,
      '.skill-menu-return-to-battle-button',
      'formation confirm button',
    );
    returnButton.click();

    expect(restartAtWaveSpy).toHaveBeenCalledTimes(1);
    expect(restartAtWaveSpy).toHaveBeenCalledWith(0);
    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(1);

    const wave0 = snapshot.waves[0];
    const wave1 = snapshot.waves[1];
    if (wave0 === undefined || wave1 === undefined) {
      throw new Error('prepared snapshot missing Wave 0 or Wave 1');
    }

    const expectedWave0ClassIds = expandWave0ExpectedClassIds(snapshot);
    const expectedWave1ClassIds = expandWaveExpectedClassIds(snapshot, 1);
    const wave1PrepResourceGrant = wave1.prepResourceGrant;

    // Wave 0 戦闘中 (1–10)
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(snapshot);
    expect(snapshot.waves).toHaveLength(3);
    expect(wave0.prepResourceGrant).toBe(0);
    expect(wave1PrepResourceGrant).toBeGreaterThan(0);
    expect(session.getCurrentScreen()).toBe('battle');
    expect(engine.getSnapshot().waveIndex).toBe(0);

    waitForEngagedViaSession(session, engine);
    const livingDuringWave0 = livingEnemyClassIds(engine);
    expect(livingDuringWave0.length).toBeGreaterThan(0);
    expect(livingDuringWave0).toEqual(expectedWave0ClassIds);

    const operationDuringWave0 = session.getOperationState();
    if (operationDuringWave0 === null) {
      throw new Error('operation state is null during Wave 0 battle');
    }
    expect(operationDuringWave0.isActive).toBe(true);
    expect(operationDuringWave0.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(operationDuringWave0.source)).toEqual(['kind']);
    expect(operationDuringWave0.currentWaveIndex).toBe(0);
    expect(operationDuringWave0.clearedWaveCount).toBe(0);
    expect(session.getOperationUnspentResource()).toBe(0);

    // Wave 0 全滅後 (11–31)
    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);

    expect(engine.getSnapshot().awaitingNextWave).toBe(true);
    expect(session.isAwaitingNextWave()).toBe(true);
    expect(session.getCurrentScreen()).toBe('wavePrep');

    const wavePrepScreens = appContainer.querySelectorAll('.wave-prep-screen');
    expect(wavePrepScreens).toHaveLength(1);

    const wavePrepHost = appContainer.querySelector('.game-shell__wave-prep');
    if (wavePrepHost === null) {
      throw new Error('wave prep host not found');
    }
    expect(wavePrepHost.hidden).toBe(false);
    expect(appContainer.querySelector('.game-shell__battle')?.hidden).toBe(true);
    expect(appContainer.querySelector('.game-shell__formation')?.hidden).toBe(true);
    expect(appContainer.querySelector('.game-shell__stage-select')?.hidden).toBe(true);

    expect(appContainer.querySelectorAll('.wave-prep-screen__slot')).toHaveLength(4);
    expect(appContainer.querySelector('.wave-prep-screen__resource')).not.toBeNull();
    expect(appContainer.querySelector('.wave-prep-screen__confirm')).not.toBeNull();

    const operationAfterClear = session.getOperationState();
    if (operationAfterClear === null) {
      throw new Error('operation state is null after Wave 0 clear');
    }
    expect(operationAfterClear.isActive).toBe(true);
    expect(operationAfterClear.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(operationAfterClear.source)).toEqual(['kind']);
    expect(operationAfterClear.currentWaveIndex).toBe(0);
    expect(operationAfterClear.clearedWaveCount).toBe(1);
    expect(operationAfterClear.isWavePrepEditable).toBe(true);
    expect(session.getOperationUnspentResource()).toBe(wave1PrepResourceGrant);
    expect(wave1PrepResourceGrant).toBeGreaterThan(0);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(snapshot);

    const checkpointAfterClear = session.getOperationCheckpoint();
    if (checkpointAfterClear === null) {
      throw new Error('operation checkpoint is null after Wave 0 clear');
    }
    expect(checkpointAfterClear.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(checkpointAfterClear.source)).toEqual(['kind']);

    expect(livingEnemyClassIds(engine)).toHaveLength(0);
    expect(livingEnemyClassIds(engine)).not.toEqual(expectedWave1ClassIds);
    expect(engine.getSnapshot().waveIndex).toBe(0);

    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().awaitingNextWave).toBe(true);
    expect(engine.getSnapshot().phase).not.toBe('victory');
    expect(session.getOperationResult()).toBeNull();
    expect(session.hasActiveOperation()).toBe(true);
    expect(session.getProblemSeriesOperationStartSnapshot()).not.toBeNull();

    const saveAfter = session.getSaveState();
    expect(saveAfter.stageProgress.currentStageId).toBe(currentStageIdBefore);
    expect([...(saveAfter.stageProgress.clearedStageIds ?? [])]).toEqual(
      clearedStageIdsBefore,
    );

    expect(resolveSpy.mock.calls.length).toBe(resolveCallsAfterPrepare);
    expect(snapshotFactorySpy.mock.calls.length).toBe(factoryCallsAfterPrepare);

    expect(sortieSpy).not.toHaveBeenCalled();
    expect(restartSpy).not.toHaveBeenCalled();
    expect(startSpy).toHaveBeenCalled();
    expect(startNextWaveSpy).not.toHaveBeenCalled();
    expect(provider()).toBe(snapshot.waves);
  });

  it('2M3: stageSelect DOM → formation confirm → Wave 0 clear → WavePrep confirm → Wave 1 battle', () => {
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
    const engine = getEngine(session);
    const provider = getEngineProvider(engine);
    if (provider === undefined) {
      throw new Error('BattleEngine resolved waves provider is missing');
    }
    const engineInternals = engine as unknown as {
      spawnWaveEnemies: () => void;
    };
    const spawnWaveEnemiesSpy = vi.spyOn(engineInternals, 'spawnWaveEnemies');
    const restartSpy = vi.spyOn(engine, 'restartBattle');
    const restartAtWaveSpy = vi.spyOn(engine, 'restartBattleAtWave');
    const startSpy = vi.spyOn(engine, 'startBattle');
    const startNextWaveSpy = vi.spyOn(engine, 'startNextWave');

    session.start();

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

    const resolveCallsAfterPrepare = resolveSpy.mock.calls.length;
    const factoryCallsAfterPrepare = snapshotFactorySpy.mock.calls.length;
    expect(resolveCallsAfterPrepare).toBe(1);
    expect(factoryCallsAfterPrepare).toBe(1);

    const confirmButton = requireButton(
      container,
      '.problem-series-overview-confirm',
      'overview confirm button',
    );
    confirmButton.click();

    const appContainer = getGameAppContainer();
    const returnButton = requireButton(
      appContainer,
      '.skill-menu-return-to-battle-button',
      'formation confirm button',
    );
    returnButton.click();

    expect(restartAtWaveSpy).toHaveBeenCalledTimes(1);
    expect(restartAtWaveSpy).toHaveBeenCalledWith(0);
    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(1);

    const wave1 = snapshot.waves[1];
    if (wave1 === undefined) {
      throw new Error('prepared snapshot missing Wave 1');
    }

    const expectedWave0ClassIds = expandWave0ExpectedClassIds(snapshot);
    const expectedWave1ClassIds = expandWaveExpectedClassIds(snapshot, 1);
    const expectedWave2ClassIds = expandWaveExpectedClassIds(snapshot, 2);
    const wave1PrepResourceGrant = wave1.prepResourceGrant;

    waitForEngagedViaSession(session, engine);
    killAllEnemies(engine);
    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);

    // WavePrep 確定前 (1–13)
    expect(session.getProblemSeriesOperationStartSnapshot()).not.toBeNull();
    expect(snapshot.waves).toHaveLength(3);
    expect(expectedWave1ClassIds.length).toBeGreaterThan(0);
    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(engine.getSnapshot().awaitingNextWave).toBe(true);
    expect(engine.getSnapshot().waveIndex).toBe(0);

    const operationBeforeConfirm = session.getOperationState();
    if (operationBeforeConfirm === null) {
      throw new Error('operation state is null before WavePrep confirm');
    }
    expect(operationBeforeConfirm.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(operationBeforeConfirm.source)).toEqual(['kind']);
    expect(operationBeforeConfirm.currentWaveIndex).toBe(0);
    expect(operationBeforeConfirm.clearedWaveCount).toBe(1);
    expect(operationBeforeConfirm.isWavePrepEditable).toBe(true);
    expect(wave1PrepResourceGrant).toBeGreaterThan(0);
    expect(session.getOperationUnspentResource()).toBe(wave1PrepResourceGrant);

    const wavePrepConfirmButton = requireButton(
      appContainer,
      '.wave-prep-screen__confirm',
      'wave prep confirm button',
    );
    expect(wavePrepConfirmButton.disabled).toBe(false);

    expect(livingEnemyClassIds(engine)).toHaveLength(0);
    expect(livingEnemyClassIds(engine)).not.toEqual(expectedWave1ClassIds);

    // WavePrep 確定操作 (14–18)
    wavePrepConfirmButton.click();

    expect(startNextWaveSpy).toHaveBeenCalledTimes(1);
    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(2);
    expect(restartAtWaveSpy).toHaveBeenCalledTimes(1);
    expect(resolveSpy.mock.calls.length).toBe(resolveCallsAfterPrepare);
    expect(snapshotFactorySpy.mock.calls.length).toBe(factoryCallsAfterPrepare);

    // Wave 1 開始後 (19–38)
    expect(session.getCurrentScreen()).toBe('battle');

    const battleHost = appContainer.querySelector('.game-shell__battle');
    if (battleHost === null) {
      throw new Error('battle host not found');
    }
    expect(battleHost.hidden).toBe(false);
    expect(appContainer.querySelector('.game-shell__wave-prep')?.hidden).toBe(true);
    expect(appContainer.querySelector('.game-shell__formation')?.hidden).toBe(true);
    expect(appContainer.querySelector('.game-shell__stage-select')?.hidden).toBe(true);

    expect(engine.getSnapshot().waveIndex).toBe(1);
    expect(engine.getSnapshot().awaitingNextWave).toBe(false);

    const livingAfterWave1Start = livingEnemyClassIds(engine);
    expect(livingAfterWave1Start.length).toBeGreaterThan(0);
    expect(livingAfterWave1Start).toEqual(expectedWave1ClassIds);
    expect(livingAfterWave1Start).not.toEqual(expectedWave0ClassIds);

    const operationAfterWave1Start = session.getOperationState();
    if (operationAfterWave1Start === null) {
      throw new Error('operation state is null after Wave 1 start');
    }
    expect(operationAfterWave1Start.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(operationAfterWave1Start.source)).toEqual(['kind']);
    expect(operationAfterWave1Start.currentWaveIndex).toBe(1);
    expect(operationAfterWave1Start.clearedWaveCount).toBe(1);
    expect(operationAfterWave1Start.isWavePrepEditable).toBe(false);

    const checkpointAfterWave1Start = session.getOperationCheckpoint();
    if (checkpointAfterWave1Start === null) {
      throw new Error('operation checkpoint is null after Wave 1 start');
    }
    expect(checkpointAfterWave1Start.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(checkpointAfterWave1Start.source)).toEqual(['kind']);
    expect(checkpointAfterWave1Start.currentWaveIndex).toBe(1);

    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(snapshot);
    expect(session.getOperationUnspentResource()).toBe(wave1PrepResourceGrant);

    expect(livingAfterWave1Start).not.toEqual(expectedWave2ClassIds);

    const saveAfter = session.getSaveState();
    expect(saveAfter.stageProgress.currentStageId).toBe(currentStageIdBefore);
    expect([...(saveAfter.stageProgress.clearedStageIds ?? [])]).toEqual(
      clearedStageIdsBefore,
    );

    expect(sortieSpy).not.toHaveBeenCalled();
    expect(restartSpy).not.toHaveBeenCalled();
    expect(startSpy).toHaveBeenCalled();
    expect(session.getOperationResult()).toBeNull();
    expect(engine.getSnapshot().phase).not.toBe('victory');
    expect(session.hasActiveOperation()).toBe(true);
    expect(provider()).toBe(snapshot.waves);
  });

  it('2M4: Wave 1 prep UI acquires one operation passive and commits it at Wave 1 checkpoint', () => {
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
    const acquireSpy = vi.spyOn(session, 'tryAcquireOperationPassive');
    const engine = getEngine(session);
    const provider = getEngineProvider(engine);
    if (provider === undefined) {
      throw new Error('BattleEngine resolved waves provider is missing');
    }
    const engineInternals = engine as unknown as {
      spawnWaveEnemies: () => void;
    };
    const spawnWaveEnemiesSpy = vi.spyOn(engineInternals, 'spawnWaveEnemies');
    const restartSpy = vi.spyOn(engine, 'restartBattle');
    const restartAtWaveSpy = vi.spyOn(engine, 'restartBattleAtWave');
    const startSpy = vi.spyOn(engine, 'startBattle');
    const startNextWaveSpy = vi.spyOn(engine, 'startNextWave');

    session.start();

    const saveBefore = structuredClone(session.getSaveState());

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

    const resolveCallsAfterPrepare = resolveSpy.mock.calls.length;
    const factoryCallsAfterPrepare = snapshotFactorySpy.mock.calls.length;
    expect(resolveCallsAfterPrepare).toBe(1);
    expect(factoryCallsAfterPrepare).toBe(1);

    const confirmButton = requireButton(
      container,
      '.problem-series-overview-confirm',
      'overview confirm button',
    );
    confirmButton.click();

    const appContainer = getGameAppContainer();
    const returnButton = requireButton(
      appContainer,
      '.skill-menu-return-to-battle-button',
      'formation confirm button',
    );
    returnButton.click();

    expect(restartAtWaveSpy).toHaveBeenCalledTimes(1);
    expect(restartAtWaveSpy).toHaveBeenCalledWith(0);
    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(1);

    const wave1 = snapshot.waves[1];
    if (wave1 === undefined) {
      throw new Error('prepared snapshot missing Wave 1');
    }

    const expectedWave1ClassIds = expandWaveExpectedClassIds(snapshot, 1);
    const expectedWave2ClassIds = expandWaveExpectedClassIds(snapshot, 2);
    const wave1PrepResourceGrant = wave1.prepResourceGrant;

    waitForEngagedViaSession(session, engine);
    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);

    const operationBeforeAcquire = session.getOperationState();
    if (operationBeforeAcquire === null) {
      throw new Error('operation state is null before passive acquire');
    }

    const unspentBeforeAcquire = session.getOperationUnspentResource();
    const slot0Candidates = [...session.getOperationPassiveCandidates(0)];
    const selectedPassiveId = slot0Candidates.find((passiveId) => {
      const cost = session!.resolveOperationPassiveAcquireCostForSlot(0, passiveId);
      return Number.isInteger(cost) && cost > 0 && cost <= unspentBeforeAcquire;
    });
    if (!selectedPassiveId) {
      throw new Error(
        'Slot 0 has no affordable operation passive candidate for current resource',
      );
    }
    const selectedPassiveCost = session.resolveOperationPassiveAcquireCostForSlot(
      0,
      selectedPassiveId,
    );

    // 取得前
    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(operationBeforeAcquire.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(operationBeforeAcquire.source)).toEqual(['kind']);
    expect(wave1PrepResourceGrant).toBeGreaterThan(0);
    expect(unspentBeforeAcquire).toBe(wave1PrepResourceGrant);
    expect(slot0Candidates.length).toBeGreaterThan(0);
    expect(slot0Candidates).toContain(selectedPassiveId);
    expect(Number.isInteger(selectedPassiveCost)).toBe(true);
    expect(selectedPassiveCost).toBeGreaterThan(0);
    expect(selectedPassiveCost).toBeLessThanOrEqual(unspentBeforeAcquire);

    const slotRowsBeforeAcquire = appContainer.querySelectorAll('.wave-prep-screen__slot');
    expect(slotRowsBeforeAcquire).toHaveLength(4);
    const slot0RowBeforeAcquire = slotRowsBeforeAcquire[0];
    if (!slot0RowBeforeAcquire) {
      throw new Error('wave prep slot 0 row not found');
    }
    const selectedCardSelector = `.operation-passive-prep__candidate[data-passive-id="${selectedPassiveId}"]`;
    const selectedCardsBeforeAcquire =
      slot0RowBeforeAcquire.querySelectorAll(selectedCardSelector);
    expect(selectedCardsBeforeAcquire).toHaveLength(1);
    const selectedCardBeforeAcquire =
      selectedCardsBeforeAcquire[0] as HTMLElement | undefined;
    if (!selectedCardBeforeAcquire) {
      throw new Error('selected passive card not found before acquire');
    }
    const selectedAcquireButton = selectedCardBeforeAcquire.querySelector<HTMLButtonElement>(
      '.operation-passive-prep__acquire',
    );
    if (!selectedAcquireButton) {
      throw new Error('selected passive acquire button not found');
    }
    expect(selectedAcquireButton.disabled).toBe(false);
    expect(session.getOperationAcquiredPassiveIds(0)).toEqual([]);
    for (let slotIndex = 1; slotIndex < 4; slotIndex += 1) {
      expect(session.getOperationAcquiredPassiveIds(slotIndex)).toEqual([]);
    }

    // UI取得操作
    expect(acquireSpy).not.toHaveBeenCalled();
    selectedAcquireButton.click();

    expect(acquireSpy).toHaveBeenCalledTimes(1);
    expect(acquireSpy).toHaveBeenCalledWith(0, selectedPassiveId);
    expect(session.getOperationAcquiredPassiveIds(0)).toEqual([selectedPassiveId]);
    expect(session.getOperationUnspentResource()).toBe(
      unspentBeforeAcquire - selectedPassiveCost,
    );

    const slotRowsAfterAcquire = appContainer.querySelectorAll('.wave-prep-screen__slot');
    const slot0RowAfterAcquire = slotRowsAfterAcquire[0];
    if (!slot0RowAfterAcquire) {
      throw new Error('wave prep slot 0 row not found after acquire');
    }
    const acquiredCard = slot0RowAfterAcquire.querySelector<HTMLElement>(
      `${selectedCardSelector}[data-acquired="true"]`,
    );
    expect(acquiredCard).not.toBeNull();
    expect(
      slot0RowAfterAcquire.querySelector(
        `.operation-passive-prep__candidates ${selectedCardSelector}`,
      ),
    ).toBeNull();
    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(engine.getSnapshot().awaitingNextWave).toBe(true);
    expect(livingEnemyClassIds(engine)).toHaveLength(0);
    expect(resolveSpy.mock.calls.length).toBe(resolveCallsAfterPrepare);
    expect(snapshotFactorySpy.mock.calls.length).toBe(factoryCallsAfterPrepare);

    // WavePrep確定後
    const wavePrepConfirmButton = requireButton(
      appContainer,
      '.wave-prep-screen__confirm',
      'wave prep confirm button',
    );
    expect(wavePrepConfirmButton.disabled).toBe(false);
    wavePrepConfirmButton.click();

    expect(startNextWaveSpy).toHaveBeenCalledTimes(1);
    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(2);
    expect(resolveSpy.mock.calls.length).toBe(resolveCallsAfterPrepare);
    expect(snapshotFactorySpy.mock.calls.length).toBe(factoryCallsAfterPrepare);

    expect(session.getCurrentScreen()).toBe('battle');
    expect(engine.getSnapshot().waveIndex).toBe(1);
    expect(livingEnemyClassIds(engine)).toEqual(expectedWave1ClassIds);
    expect(livingEnemyClassIds(engine)).not.toEqual(expectedWave2ClassIds);
    expect(session.getOperationAcquiredPassiveIds(0)).toEqual([selectedPassiveId]);
    expect(session.getOperationUnspentResource()).toBe(
      unspentBeforeAcquire - selectedPassiveCost,
    );

    const checkpointAfterConfirm = session.getOperationCheckpoint();
    if (checkpointAfterConfirm === null) {
      throw new Error('operation checkpoint is null after WavePrep confirm');
    }
    expect(checkpointAfterConfirm.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(checkpointAfterConfirm.source)).toEqual(['kind']);
    expect(checkpointAfterConfirm.currentWaveIndex).toBe(1);
    expect(checkpointAfterConfirm.acquiredOperationPassives).toEqual([
      { slotIndex: 0, passiveIds: [selectedPassiveId] },
    ]);
    expect(checkpointAfterConfirm.unspentResource).toBe(
      unspentBeforeAcquire - selectedPassiveCost,
    );
    expect(checkpointAfterConfirm.lastResourceGrantClearedWaveCount).toBe(1);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(snapshot);
    for (let slotIndex = 1; slotIndex < 4; slotIndex += 1) {
      expect(session.getOperationAcquiredPassiveIds(slotIndex)).toEqual([]);
    }
    expect(session.getSaveState()).toEqual(saveBefore);
    expect(sortieSpy).not.toHaveBeenCalled();
    expect(session.getOperationResult()).toBeNull();
    expect(session.shouldShowVictoryResult()).toBe(false);
    expect(restartSpy).not.toHaveBeenCalled();
    expect(startSpy).toHaveBeenCalled();
    expect(session.hasActiveOperation()).toBe(true);
    expect(provider()).toBe(snapshot.waves);
  });

  it('2M5: Wave 1 clear from acquired passive → Wave 2 prep with maintained passive and grant', () => {
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
    const engine = getEngine(session);
    const provider = getEngineProvider(engine);
    if (provider === undefined) {
      throw new Error('BattleEngine resolved waves provider is missing');
    }
    const engineInternals = engine as unknown as {
      spawnWaveEnemies: () => void;
    };
    const spawnWaveEnemiesSpy = vi.spyOn(engineInternals, 'spawnWaveEnemies');
    const restartSpy = vi.spyOn(engine, 'restartBattle');
    const restartAtWaveSpy = vi.spyOn(engine, 'restartBattleAtWave');
    const startSpy = vi.spyOn(engine, 'startBattle');
    const startNextWaveSpy = vi.spyOn(engine, 'startNextWave');

    session.start();

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

    const resolveCallsAfterPrepare = resolveSpy.mock.calls.length;
    const factoryCallsAfterPrepare = snapshotFactorySpy.mock.calls.length;
    expect(resolveCallsAfterPrepare).toBe(1);
    expect(factoryCallsAfterPrepare).toBe(1);

    const confirmButton = requireButton(
      container,
      '.problem-series-overview-confirm',
      'overview confirm button',
    );
    confirmButton.click();

    const appContainer = getGameAppContainer();
    const returnButton = requireButton(
      appContainer,
      '.skill-menu-return-to-battle-button',
      'formation confirm button',
    );
    returnButton.click();

    expect(restartAtWaveSpy).toHaveBeenCalledTimes(1);
    expect(restartAtWaveSpy).toHaveBeenCalledWith(0);
    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(1);

    const wave1 = snapshot.waves[1];
    const wave2 = snapshot.waves[2];
    if (wave1 === undefined || wave2 === undefined) {
      throw new Error('prepared snapshot missing Wave 1 or Wave 2');
    }

    const expectedWave1ClassIds = expandWaveExpectedClassIds(snapshot, 1);
    const wave1PrepResourceGrant = wave1.prepResourceGrant;
    const wave2PrepResourceGrant = wave2.prepResourceGrant;

    // Wave 0 engage → clear → Wave 1 prep
    waitForEngagedViaSession(session, engine);
    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);

    // Acquire one passive on Slot 0
    const unspentBeforeAcquire = session.getOperationUnspentResource();
    const slot0Candidates = [...session.getOperationPassiveCandidates(0)];
    const selectedPassiveId = slot0Candidates.find((passiveId) => {
      const cost = session!.resolveOperationPassiveAcquireCostForSlot(0, passiveId);
      return Number.isInteger(cost) && cost > 0 && cost <= unspentBeforeAcquire;
    });
    if (!selectedPassiveId) {
      throw new Error(
        'Slot 0 has no affordable operation passive candidate for current resource',
      );
    }
    const selectedPassiveCost = session.resolveOperationPassiveAcquireCostForSlot(
      0,
      selectedPassiveId,
    );

    const slot0RowBeforeAcquire = appContainer.querySelectorAll('.wave-prep-screen__slot')[0];
    if (!slot0RowBeforeAcquire) {
      throw new Error('wave prep slot 0 row not found');
    }
    const selectedCardSelector = `.operation-passive-prep__candidate[data-passive-id="${selectedPassiveId}"]`;
    const selectedAcquireButton = slot0RowBeforeAcquire.querySelector<HTMLButtonElement>(
      `${selectedCardSelector} .operation-passive-prep__acquire`,
    );
    if (!selectedAcquireButton) {
      throw new Error('selected passive acquire button not found');
    }
    selectedAcquireButton.click();

    expect(session.getOperationAcquiredPassiveIds(0)).toEqual([selectedPassiveId]);
    const unspentAfterAcquire = unspentBeforeAcquire - selectedPassiveCost;
    expect(session.getOperationUnspentResource()).toBe(unspentAfterAcquire);

    // WavePrep confirm → Wave 1 battle
    const wavePrepConfirmButton = requireButton(
      appContainer,
      '.wave-prep-screen__confirm',
      'wave prep confirm button',
    );
    wavePrepConfirmButton.click();

    expect(startNextWaveSpy).toHaveBeenCalledTimes(1);
    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(2);
    expect(session.getCurrentScreen()).toBe('battle');
    expect(engine.getSnapshot().waveIndex).toBe(1);
    expect(livingEnemyClassIds(engine)).toEqual(expectedWave1ClassIds);

    // === Wave 1 戦闘中 assertions (1–11) ===
    // 1. screen battle
    expect(session.getCurrentScreen()).toBe('battle');
    // 2. engine waveIndex 1
    expect(engine.getSnapshot().waveIndex).toBe(1);
    // 3. 生存敵 snapshot Wave 1 期待値一致
    expect(livingEnemyClassIds(engine)).toEqual(expectedWave1ClassIds);
    // 4. source problemSeries
    const opDuringWave1 = session.getOperationState();
    if (opDuringWave1 === null) {
      throw new Error('operation state is null during Wave 1 battle');
    }
    expect(opDuringWave1.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    // 5. currentWaveIndex = 1
    expect(opDuringWave1.currentWaveIndex).toBe(1);
    // 6. clearedWaveCount = 1
    expect(opDuringWave1.clearedWaveCount).toBe(1);
    // 7. Slot 0 acquired
    expect(session.getOperationAcquiredPassiveIds(0)).toEqual([selectedPassiveId]);
    // 8. other slots empty
    for (let slotIndex = 1; slotIndex < 4; slotIndex += 1) {
      expect(session.getOperationAcquiredPassiveIds(slotIndex)).toEqual([]);
    }
    // 9. 残ポイント = wave1 grant - cost
    expect(session.getOperationUnspentResource()).toBe(unspentAfterAcquire);
    // 10. checkpoint
    const checkpointDuringWave1 = session.getOperationCheckpoint();
    if (checkpointDuringWave1 === null) {
      throw new Error('checkpoint is null during Wave 1');
    }
    expect(checkpointDuringWave1.acquiredOperationPassives).toEqual([
      { slotIndex: 0, passiveIds: [selectedPassiveId] },
    ]);
    expect(checkpointDuringWave1.unspentResource).toBe(unspentAfterAcquire);
    // 11. Wave 2 grant > 0
    expect(wave2PrepResourceGrant).toBeGreaterThan(0);

    // === Wave 1 engage then kill ===
    waitForEngagedViaSession(session, engine);
    expect(engine.getSnapshot().engaged).toBe(true);

    const spawnCallsBeforeWave1Kill = spawnWaveEnemiesSpy.mock.calls.length;

    // 12. production tick → waveCleared
    killAllEnemies(engine);
    let reachedWavePrep = false;
    for (let i = 0; i < MAX_WAVE_PREP_TICKS; i++) {
      tickSession(session, 1);
      if (session.getCurrentScreen() === 'wavePrep') {
        reachedWavePrep = true;
        break;
      }
      const snap = engine.getSnapshot();
      if (snap.phase === 'victory' || snap.phase === 'defeat') {
        throw new Error(
          `battle ended (${snap.phase}) before Wave 2 prep; waveIndex=${snap.waveIndex}; awaitingNextWave=${snap.awaitingNextWave}`,
        );
      }
    }
    if (!reachedWavePrep) {
      throw new Error('Wave 2 prep not reached within tick limit');
    }

    // === Wave 1 クリア後 assertions (13–34) ===
    // 13. screen wavePrep
    expect(session.getCurrentScreen()).toBe('wavePrep');
    // 14. engine awaitingNextWave
    expect(engine.getSnapshot().awaitingNextWave).toBe(true);
    // 15. engine waveIndex 1
    expect(engine.getSnapshot().waveIndex).toBe(1);
    // 16. OperationState active
    const opAfterWave1Clear = session.getOperationState();
    if (opAfterWave1Clear === null) {
      throw new Error('operation state is null after Wave 1 clear');
    }
    expect(opAfterWave1Clear.isActive).toBe(true);
    // 17. source problemSeries
    expect(opAfterWave1Clear.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    // 18. currentWaveIndex = 1
    expect(opAfterWave1Clear.currentWaveIndex).toBe(1);
    // 19. clearedWaveCount = 2
    expect(opAfterWave1Clear.clearedWaveCount).toBe(2);
    // 20. isWavePrepEditable = true
    expect(opAfterWave1Clear.isWavePrepEditable).toBe(true);
    // 21. Slot 0 maintained
    expect(session.getOperationAcquiredPassiveIds(0)).toEqual([selectedPassiveId]);
    // 22. other slots still empty
    for (let slotIndex = 1; slotIndex < 4; slotIndex += 1) {
      expect(session.getOperationAcquiredPassiveIds(slotIndex)).toEqual([]);
    }
    // 23. 残ポイント = Wave 1 開始時残 + Wave 2 grant
    const expectedUnspentAfterWave2Grant = unspentAfterAcquire + wave2PrepResourceGrant;
    expect(session.getOperationUnspentResource()).toBe(expectedUnspentAfterWave2Grant);
    // 24. Wave 2 grant !== 0
    expect(wave2PrepResourceGrant).not.toBe(0);
    // 25. grant added exactly once (resource = previous + one grant)
    expect(session.getOperationUnspentResource()).toBe(
      unspentAfterAcquire + wave2PrepResourceGrant,
    );
    // 26. prepared snapshot same reference
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(snapshot);
    // 27. Wave 2 enemies not spawned yet
    expect(livingEnemyClassIds(engine)).toHaveLength(0);
    // 28. no additional spawnWaveEnemies call
    expect(spawnWaveEnemiesSpy.mock.calls.length).toBe(spawnCallsBeforeWave1Kill);
    // 29. living enemies 0
    expect(livingEnemyClassIds(engine)).toHaveLength(0);
    // 30. not final victory
    expect(engine.getSnapshot().phase).not.toBe('victory');
    // 31. OperationResult null
    expect(session.getOperationResult()).toBeNull();
    // 32. resolver/snapshot factory not re-run
    expect(resolveSpy.mock.calls.length).toBe(resolveCallsAfterPrepare);
    expect(snapshotFactorySpy.mock.calls.length).toBe(factoryCallsAfterPrepare);
    // 33. currentStageId / clearedStageIds unchanged
    const saveAfter = session.getSaveState();
    expect(saveAfter.stageProgress.currentStageId).toBe(currentStageIdBefore);
    expect([...(saveAfter.stageProgress.clearedStageIds ?? [])]).toEqual(
      clearedStageIdsBefore,
    );
    // 34. fixed stage sortie not reached
    expect(sortieSpy).not.toHaveBeenCalled();

    // === WavePrep UI assertions (35–40) ===
    // 35. .wave-prep-screen 1個
    expect(appContainer.querySelectorAll('.wave-prep-screen')).toHaveLength(1);
    // 36. .wave-prep-screen__slot 4件
    expect(appContainer.querySelectorAll('.wave-prep-screen__slot')).toHaveLength(4);
    // 37. .wave-prep-screen__confirm exists
    expect(appContainer.querySelector('.wave-prep-screen__confirm')).not.toBeNull();
    // 38. Slot 0 acquired card
    const slot0Row = appContainer.querySelectorAll('.wave-prep-screen__slot')[0];
    if (!slot0Row) {
      throw new Error('wave prep slot 0 row not found after Wave 1 clear');
    }
    const acquiredCardAfter = slot0Row.querySelector<HTMLElement>(
      `${selectedCardSelector}[data-acquired="true"]`,
    );
    expect(acquiredCardAfter).not.toBeNull();
    // 39. resource display contains current unspent
    const resourceEl = appContainer.querySelector('.wave-prep-screen__resource');
    expect(resourceEl).not.toBeNull();
    expect(resourceEl!.textContent).toContain(String(expectedUnspentAfterWave2Grant));
    // 40. WavePrep confirm NOT clicked (no Wave 2 start)
    expect(startNextWaveSpy).toHaveBeenCalledTimes(1);
    expect(restartSpy).not.toHaveBeenCalled();
    expect(session.hasActiveOperation()).toBe(true);
    expect(provider()).toBe(snapshot.waves);
  });

  it('2M6: Wave 2 prep confirm from acquired passive → Wave 2 battle with maintained passive', () => {
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
    const engine = getEngine(session);
    const provider = getEngineProvider(engine);
    if (provider === undefined) {
      throw new Error('BattleEngine resolved waves provider is missing');
    }
    const engineInternals = engine as unknown as {
      spawnWaveEnemies: () => void;
    };
    const spawnWaveEnemiesSpy = vi.spyOn(engineInternals, 'spawnWaveEnemies');
    const restartSpy = vi.spyOn(engine, 'restartBattle');
    const restartAtWaveSpy = vi.spyOn(engine, 'restartBattleAtWave');
    const startSpy = vi.spyOn(engine, 'startBattle');
    const startNextWaveSpy = vi.spyOn(engine, 'startNextWave');

    session.start();

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

    const resolveCallsAfterPrepare = resolveSpy.mock.calls.length;
    const factoryCallsAfterPrepare = snapshotFactorySpy.mock.calls.length;
    expect(resolveCallsAfterPrepare).toBe(1);
    expect(factoryCallsAfterPrepare).toBe(1);

    const overviewConfirmButton = requireButton(
      container,
      '.problem-series-overview-confirm',
      'overview confirm button',
    );
    overviewConfirmButton.click();

    const appContainer = getGameAppContainer();
    const returnButton = requireButton(
      appContainer,
      '.skill-menu-return-to-battle-button',
      'formation confirm button',
    );
    returnButton.click();

    expect(restartAtWaveSpy).toHaveBeenCalledTimes(1);
    expect(restartAtWaveSpy).toHaveBeenCalledWith(0);
    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(1);

    const wave1 = snapshot.waves[1];
    const wave2 = snapshot.waves[2];
    if (wave1 === undefined || wave2 === undefined) {
      throw new Error('prepared snapshot missing Wave 1 or Wave 2');
    }

    const expectedWave1ClassIds = expandWaveExpectedClassIds(snapshot, 1);
    const expectedWave2ClassIds = expandWaveExpectedClassIds(snapshot, 2);
    const wave1PrepResourceGrant = wave1.prepResourceGrant;
    const wave2PrepResourceGrant = wave2.prepResourceGrant;

    // Wave 0 engage → clear → Wave 1 prep
    waitForEngagedViaSession(session, engine);
    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);

    // Acquire one passive on Slot 0
    const unspentBeforeAcquire = session.getOperationUnspentResource();
    const slot0Candidates = [...session.getOperationPassiveCandidates(0)];
    const selectedPassiveId = slot0Candidates.find((passiveId) => {
      const cost = session!.resolveOperationPassiveAcquireCostForSlot(0, passiveId);
      return Number.isInteger(cost) && cost > 0 && cost <= unspentBeforeAcquire;
    });
    if (!selectedPassiveId) {
      throw new Error(
        'Slot 0 has no affordable operation passive candidate for current resource',
      );
    }
    const selectedPassiveCost = session.resolveOperationPassiveAcquireCostForSlot(
      0,
      selectedPassiveId,
    );

    const slot0RowW1 = appContainer.querySelectorAll('.wave-prep-screen__slot')[0];
    if (!slot0RowW1) {
      throw new Error('wave prep slot 0 row not found');
    }
    const selectedCardSelector = `.operation-passive-prep__candidate[data-passive-id="${selectedPassiveId}"]`;
    const selectedAcquireButton = slot0RowW1.querySelector<HTMLButtonElement>(
      `${selectedCardSelector} .operation-passive-prep__acquire`,
    );
    if (!selectedAcquireButton) {
      throw new Error('selected passive acquire button not found');
    }
    selectedAcquireButton.click();

    expect(session.getOperationAcquiredPassiveIds(0)).toEqual([selectedPassiveId]);
    const unspentAfterAcquire = unspentBeforeAcquire - selectedPassiveCost;
    expect(session.getOperationUnspentResource()).toBe(unspentAfterAcquire);

    // WavePrep confirm → Wave 1 battle
    const wavePrepConfirmW1 = requireButton(
      appContainer,
      '.wave-prep-screen__confirm',
      'wave prep confirm button (Wave 1)',
    );
    wavePrepConfirmW1.click();

    expect(startNextWaveSpy).toHaveBeenCalledTimes(1);
    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(2);
    expect(session.getCurrentScreen()).toBe('battle');
    expect(engine.getSnapshot().waveIndex).toBe(1);
    expect(livingEnemyClassIds(engine)).toEqual(expectedWave1ClassIds);

    // Wave 1 engage → kill → Wave 2 prep
    waitForEngagedViaSession(session, engine);
    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);

    // === Wave 2 準備中 assertions (1–15) ===
    // 1. prepared snapshot non-null, 3 waves
    expect(session.getProblemSeriesOperationStartSnapshot()).not.toBeNull();
    expect(snapshot.waves).toHaveLength(3);
    // 2. Wave 2 expected enemy classIds from snapshot
    expect(expectedWave2ClassIds.length).toBeGreaterThan(0);
    // 3. expected enemy count > 0
    expect(expectedWave2ClassIds.length).not.toBe(0);
    // 4. screen wavePrep
    expect(session.getCurrentScreen()).toBe('wavePrep');
    // 5. engine waveIndex 1
    expect(engine.getSnapshot().waveIndex).toBe(1);
    // 6. engine awaitingNextWave
    expect(engine.getSnapshot().awaitingNextWave).toBe(true);
    // 7. OperationState source problemSeries
    const opWave2Prep = session.getOperationState();
    if (opWave2Prep === null) {
      throw new Error('operation state is null during Wave 2 prep');
    }
    expect(opWave2Prep.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(opWave2Prep.source)).toEqual(['kind']);
    // 8. currentWaveIndex = 1
    expect(opWave2Prep.currentWaveIndex).toBe(1);
    // 9. clearedWaveCount = 2
    expect(opWave2Prep.clearedWaveCount).toBe(2);
    // 10. isWavePrepEditable = true
    expect(opWave2Prep.isWavePrepEditable).toBe(true);
    // 11. Slot 0 maintains acquired passive
    expect(session.getOperationAcquiredPassiveIds(0)).toEqual([selectedPassiveId]);
    // 12. other 3 slots empty
    for (let slotIndex = 1; slotIndex < 4; slotIndex += 1) {
      expect(session.getOperationAcquiredPassiveIds(slotIndex)).toEqual([]);
    }
    // 13. remaining points = Wave 1 grant - cost + Wave 2 grant
    const expectedUnspentAtWave2Prep = unspentAfterAcquire + wave2PrepResourceGrant;
    expect(session.getOperationUnspentResource()).toBe(expectedUnspentAtWave2Prep);
    // 14. Wave 2 enemies not yet spawned
    expect(livingEnemyClassIds(engine)).toHaveLength(0);
    // 15. WavePrep confirm button exists and not disabled
    const wavePrepConfirmW2 = requireButton(
      appContainer,
      '.wave-prep-screen__confirm',
      'wave prep confirm button (Wave 2)',
    );
    expect(wavePrepConfirmW2.disabled).toBe(false);

    // === Wave 2 準備確定 (16–20) ===
    // 16. click confirm button
    wavePrepConfirmW2.click();
    // 17. startNextWave cumulative 2 calls
    expect(startNextWaveSpy).toHaveBeenCalledTimes(2);
    // 18. spawnWaveEnemies cumulative 3 calls
    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(3);
    // 19. restartBattleAtWave stays at 1 (Wave 0 start only)
    expect(restartAtWaveSpy).toHaveBeenCalledTimes(1);
    // 20. resolver / snapshot factory not re-run
    expect(resolveSpy.mock.calls.length).toBe(resolveCallsAfterPrepare);
    expect(snapshotFactorySpy.mock.calls.length).toBe(factoryCallsAfterPrepare);

    // === Wave 2 開始後 assertions (21–46) ===
    // 21. screen battle
    expect(session.getCurrentScreen()).toBe('battle');
    // 22. battle host visible
    const battleHost = appContainer.querySelector('.game-shell__battle');
    if (battleHost === null) {
      throw new Error('battle host not found');
    }
    expect(battleHost.hidden).toBe(false);
    // 23. WavePrep / formation / stageSelect hidden
    expect(appContainer.querySelector('.game-shell__wave-prep')?.hidden).toBe(true);
    expect(appContainer.querySelector('.game-shell__formation')?.hidden).toBe(true);
    expect(appContainer.querySelector('.game-shell__stage-select')?.hidden).toBe(true);
    // 24. engine waveIndex 2
    expect(engine.getSnapshot().waveIndex).toBe(2);
    // 25. engine waveCount 3
    expect(engine.getSnapshot().waveCount).toBe(3);
    // 26. awaitingNextWave false
    expect(engine.getSnapshot().awaitingNextWave).toBe(false);
    // 27. living enemy classIds match snapshot Wave 2
    const livingAfterWave2Start = livingEnemyClassIds(engine);
    expect(livingAfterWave2Start).toEqual(expectedWave2ClassIds);
    // 28. living enemy count > 0
    expect(livingAfterWave2Start.length).toBeGreaterThan(0);
    // 29. different from Wave 1 expected
    expect(livingAfterWave2Start).not.toEqual(expectedWave1ClassIds);
    // 30. OperationState active
    const opAfterWave2Start = session.getOperationState();
    if (opAfterWave2Start === null) {
      throw new Error('operation state is null after Wave 2 start');
    }
    expect(opAfterWave2Start.isActive).toBe(true);
    // 31. source problemSeries
    expect(opAfterWave2Start.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(opAfterWave2Start.source)).toEqual(['kind']);
    // 32. currentWaveIndex = 2
    expect(opAfterWave2Start.currentWaveIndex).toBe(2);
    // 33. clearedWaveCount = 2
    expect(opAfterWave2Start.clearedWaveCount).toBe(2);
    // 34. isWavePrepEditable = false
    expect(opAfterWave2Start.isWavePrepEditable).toBe(false);
    // 35. Slot 0 acquired passive maintained
    expect(session.getOperationAcquiredPassiveIds(0)).toEqual([selectedPassiveId]);
    // 36. other slots not contaminated
    for (let slotIndex = 1; slotIndex < 4; slotIndex += 1) {
      expect(session.getOperationAcquiredPassiveIds(slotIndex)).toEqual([]);
    }
    // 37. remaining points maintained
    expect(session.getOperationUnspentResource()).toBe(expectedUnspentAtWave2Prep);
    // 38. checkpoint source problemSeries
    const checkpointAfterWave2Start = session.getOperationCheckpoint();
    if (checkpointAfterWave2Start === null) {
      throw new Error('operation checkpoint is null after Wave 2 start');
    }
    expect(checkpointAfterWave2Start.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(checkpointAfterWave2Start.source)).toEqual(['kind']);
    // 39. checkpoint currentWaveIndex = 2
    expect(checkpointAfterWave2Start.currentWaveIndex).toBe(2);
    // 40. checkpoint has acquired passive and remaining points
    expect(checkpointAfterWave2Start.acquiredOperationPassives).toEqual([
      { slotIndex: 0, passiveIds: [selectedPassiveId] },
    ]);
    expect(checkpointAfterWave2Start.unspentResource).toBe(expectedUnspentAtWave2Prep);
    // 41. prepared snapshot same reference
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(snapshot);
    // 42. currentStageId / clearedStageIds unchanged
    const saveAfter = session.getSaveState();
    expect(saveAfter.stageProgress.currentStageId).toBe(currentStageIdBefore);
    expect([...(saveAfter.stageProgress.clearedStageIds ?? [])]).toEqual(
      clearedStageIdsBefore,
    );
    // 43. fixed Stage sortie not reached
    expect(sortieSpy).not.toHaveBeenCalled();
    // 44. OperationResult null
    expect(session.getOperationResult()).toBeNull();
    // 45. victory / result UI not reached
    expect(session.shouldShowVictoryResult()).toBe(false);
    expect(engine.getSnapshot().phase).not.toBe('victory');
    // 46. Wave 2 enemies not killed
    expect(livingEnemyClassIds(engine).length).toBeGreaterThan(0);

    expect(restartSpy).not.toHaveBeenCalled();
    expect(startSpy).toHaveBeenCalled();
    expect(session.hasActiveOperation()).toBe(true);
    expect(provider()).toBe(snapshot.waves);
  });

  it('2N5: final Wave victory shows problem-series result overlay and only returns to stageSelect via 作戦選択へ', () => {
    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const snapshotFactorySpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );
    const victoryResultFactorySpy = vi.spyOn(
      victoryResultModule,
      'createProblemSeriesVictoryResult',
    );
    const computeExpSpy = vi.spyOn(stageProgressionModule, 'computeStageExpReward');
    const applyRewardsSpy = vi.spyOn(victoryRewardsModule, 'applyVictoryRewards');

    session = createSession();

    const returnToStageSelectSpy = vi.spyOn(
      session,
      'returnToStageSelectAfterProblemSeriesVictory',
    );
    const engine = getEngine(session);
    const provider = getEngineProvider(engine);
    if (provider === undefined) {
      throw new Error('BattleEngine resolved waves provider is missing');
    }
    const engineInternals = engine as unknown as {
      spawnWaveEnemies: () => void;
    };
    const spawnWaveEnemiesSpy = vi.spyOn(engineInternals, 'spawnWaveEnemies');
    const startNextWaveSpy = vi.spyOn(engine, 'startNextWave');

    session.start();

    const saveBefore = structuredClone(session.getSaveState());

    const container = getStageSelectContainer(session);
    requireButton(
      container,
      '.stage-selection-main-operation',
      'main operation button',
    ).click();

    const seedInput = requireInput(
      container,
      '.problem-series-entry-seed-input',
      'seed input',
    );
    requireButton(
      container,
      '.problem-series-entry-prepare',
      'prepare button',
    );
    seedInput.value = RAW_FIXTURE_SEED;
    seedInput.dispatchEvent(new Event('input', { bubbles: true }));
    requireButton(
      container,
      '.problem-series-entry-prepare',
      'prepare button',
    ).click();

    const snapshot = session.getProblemSeriesOperationStartSnapshot();
    if (snapshot === null) {
      throw new Error('prepared snapshot is null after Prepare');
    }

    const resolveCallsAfterPrepare = resolveSpy.mock.calls.length;
    const factoryCallsAfterPrepare = snapshotFactorySpy.mock.calls.length;
    expect(resolveCallsAfterPrepare).toBe(1);
    expect(factoryCallsAfterPrepare).toBe(1);
    expect(victoryResultFactorySpy).not.toHaveBeenCalled();
    expect(computeExpSpy).toHaveBeenCalledTimes(0);
    expect(applyRewardsSpy).toHaveBeenCalledTimes(0);

    requireButton(
      container,
      '.problem-series-overview-confirm',
      'overview confirm button',
    ).click();

    const appContainer = getGameAppContainer();
    requireButton(
      appContainer,
      '.skill-menu-return-to-battle-button',
      'formation confirm button',
    ).click();

    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(1);
    expect(session.getCurrentScreen()).toBe('battle');

    waitForEngagedViaSession(session, engine);
    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);
    requireButton(
      appContainer,
      '.wave-prep-screen__confirm',
      'Wave 1 prep confirm button',
    ).click();

    expect(startNextWaveSpy).toHaveBeenCalledTimes(1);
    waitForEngagedViaSession(session, engine);
    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);
    requireButton(
      appContainer,
      '.wave-prep-screen__confirm',
      'Wave 2 prep confirm button',
    ).click();

    expect(startNextWaveSpy).toHaveBeenCalledTimes(2);
    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(3);
    expect(session.getCurrentScreen()).toBe('battle');
    expect(engine.getSnapshot().waveIndex).toBe(2);
    expect(engine.getSnapshot().phase).not.toBe('victory');
    expect(engine.getSnapshot().awaitingNextWave).toBe(false);
    expect(livingEnemyCount(engine)).toBeGreaterThan(0);
    expectVictoryOverlayVisuallyHidden(appContainer);
    expect(computeExpSpy).toHaveBeenCalledTimes(0);
    expect(applyRewardsSpy).toHaveBeenCalledTimes(0);

    const overlayBeforeVictory = requireElement<HTMLElement>(
      appContainer,
      '.battle-victory-result-overlay',
      'victory result overlay',
    );
    expect(overlayBeforeVictory.getAttribute('aria-hidden')).toBe('true');

    const battleHostBeforeVictory = requireElement<HTMLElement>(
      appContainer,
      '.game-shell__battle',
      'battle host',
    );
    expect(battleHostBeforeVictory.hidden).toBe(false);

    killAllEnemies(engine);
    for (let i = 0; i < MAX_WAVE_PREP_TICKS; i++) {
      tickSession(session, 1);
      if (engine.getSnapshot().phase === 'victory') {
        break;
      }
      if (engine.getSnapshot().phase === 'defeat') {
        throw new Error('battle ended in defeat instead of final victory');
      }
    }

    expect(engine.getSnapshot().phase).toBe('victory');
    expect(engine.getSnapshot().waveIndex).toBe(2);
    expect(livingEnemyCount(engine)).toBe(0);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();

    const problemSeriesResult = session.getProblemSeriesVictoryResult();
    if (problemSeriesResult === null) {
      throw new Error('problem series victory result is null after final victory');
    }
    expect(problemSeriesResult).toEqual({
      outcome: 'victory',
      seed: NORMALIZED_FIXTURE_SEED,
      generatorVersion: snapshot.generatorVersion,
      seriesId: snapshot.seriesId,
      reachedWaveIndex: 2,
    });
    expect(session.getOperationResult()).toBeNull();
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(true);
    expect(session.shouldShowVictoryResult()).toBe(false);
    expect(provider()).toBeNull();
    expect(victoryResultFactorySpy).toHaveBeenCalledTimes(1);

    const saveAfterVictory = structuredClone(session.getSaveState());
    expect(saveAfterVictory).toEqual(saveBefore);
    expect(computeExpSpy).toHaveBeenCalledTimes(0);
    expect(applyRewardsSpy).toHaveBeenCalledTimes(0);

    expectVictoryOverlayVisuallyVisible(appContainer);
    const overlayAfterVictory = requireElement<HTMLElement>(
      appContainer,
      '.battle-victory-result-overlay',
      'victory result overlay',
    );
    expect(overlayAfterVictory.getAttribute('aria-hidden')).toBe('false');

    const summary = requireElement<HTMLElement>(
      appContainer,
      '.battle-victory-result-summary',
      'victory result summary',
    );
    expect(summary.textContent).toContain('outcome: victory');
    expect(summary.textContent).toContain(`seed: ${NORMALIZED_FIXTURE_SEED}`);
    expect(summary.textContent).toContain(
      `generatorVersion: ${snapshot.generatorVersion}`,
    );
    expect(summary.textContent).toContain(`seriesId: ${snapshot.seriesId}`);
    expect(summary.textContent).toContain('reachedWaveIndex: 2');
    expect(summary.textContent).not.toContain('stageId:');

    const visibleButtons = listVisibleVictoryResultButtons(appContainer);
    expect(visibleButtons).toHaveLength(3);
    expect(visibleButtons.map((button) => button.textContent)).toEqual([
      '同じseedで再開始',
      '新しいseedで開始',
      '作戦選択へ',
    ]);
    expect(
      [...appContainer.querySelectorAll<HTMLButtonElement>('.battle-victory-result-button')]
        .some((button) => button.textContent === '同じステージで再戦' && !button.hidden),
    ).toBe(false);
    expect(
      [...appContainer.querySelectorAll<HTMLButtonElement>('.battle-victory-result-button')]
        .some((button) => button.textContent === 'ステージ選択へ' && !button.hidden),
    ).toBe(false);

    const returnButton = visibleButtons.find(
      (button) => button.textContent === '作戦選択へ',
    );
    if (!returnButton) {
      throw new Error('visible 作戦選択へ button missing');
    }

    const resolveCallsBeforeReturn = resolveSpy.mock.calls.length;
    const snapshotFactoryCallsBeforeReturn = snapshotFactorySpy.mock.calls.length;
    const victoryFactoryCallsBeforeReturn = victoryResultFactorySpy.mock.calls.length;

    returnButton.click();

    expect(returnToStageSelectSpy).toHaveBeenCalledTimes(1);
    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(session.getProblemSeriesVictoryResult()).toBeNull();
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(false);
    expect(session.shouldShowVictoryResult()).toBe(false);
    expectVictoryOverlayVisuallyHidden(appContainer);
    expect(overlayAfterVictory.getAttribute('aria-hidden')).toBe('true');
    expect(
      appContainer.querySelectorAll('.stage-selection-panel').length,
    ).toBe(1);
    expect(requireElement<HTMLElement>(
      appContainer,
      '.game-shell__stage-select',
      'stage select host',
    ).hidden).toBe(false);
    expect(requireElement<HTMLElement>(
      appContainer,
      '.game-shell__battle',
      'battle host',
    ).hidden).toBe(true);

    const saveAfterReturn = structuredClone(session.getSaveState());
    expect(saveAfterReturn).toEqual(saveBefore);
    expect(resolveSpy.mock.calls.length).toBe(resolveCallsBeforeReturn);
    expect(snapshotFactorySpy.mock.calls.length).toBe(
      snapshotFactoryCallsBeforeReturn,
    );
    expect(victoryResultFactorySpy.mock.calls.length).toBe(
      victoryFactoryCallsBeforeReturn,
    );
    expect(computeExpSpy).toHaveBeenCalledTimes(0);
    expect(applyRewardsSpy).toHaveBeenCalledTimes(0);
  });

  it('2O3: final Wave victory same-seed restart returns to 3-wave overview via production click', () => {
    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const snapshotFactorySpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );
    const victoryResultFactorySpy = vi.spyOn(
      victoryResultModule,
      'createProblemSeriesVictoryResult',
    );
    const computeExpSpy = vi.spyOn(stageProgressionModule, 'computeStageExpReward');
    const applyRewardsSpy = vi.spyOn(victoryRewardsModule, 'applyVictoryRewards');

    session = createSession();

    const prepareSameSeedSpy = vi.spyOn(
      session,
      'prepareSameSeedProblemSeriesFromVictory',
    );
    const engine = getEngine(session);
    const provider = getEngineProvider(engine);
    if (provider === undefined) {
      throw new Error('BattleEngine resolved waves provider is missing');
    }
    const engineInternals = engine as unknown as {
      spawnWaveEnemies: () => void;
    };
    const spawnWaveEnemiesSpy = vi.spyOn(engineInternals, 'spawnWaveEnemies');
    const restartSpy = vi.spyOn(engine, 'restartBattle');
    const restartAtWaveSpy = vi.spyOn(engine, 'restartBattleAtWave');
    const startNextWaveSpy = vi.spyOn(engine, 'startNextWave');

    session.start();

    const saveBefore = structuredClone(session.getSaveState());

    const container = getStageSelectContainer(session);
    requireButton(
      container,
      '.stage-selection-main-operation',
      'main operation button',
    ).click();

    const seedInput = requireInput(
      container,
      '.problem-series-entry-seed-input',
      'seed input',
    );
    requireButton(
      container,
      '.problem-series-entry-prepare',
      'prepare button',
    );
    seedInput.value = RAW_FIXTURE_SEED;
    seedInput.dispatchEvent(new Event('input', { bubbles: true }));
    requireButton(
      container,
      '.problem-series-entry-prepare',
      'prepare button',
    ).click();

    const oldSnapshot = session.getProblemSeriesOperationStartSnapshot();
    if (oldSnapshot === null) {
      throw new Error('prepared snapshot is null after Prepare');
    }

    const resolveCallsAfterPrepare = resolveSpy.mock.calls.length;
    const factoryCallsAfterPrepare = snapshotFactorySpy.mock.calls.length;
    expect(resolveCallsAfterPrepare).toBe(1);
    expect(factoryCallsAfterPrepare).toBe(1);
    expect(victoryResultFactorySpy).not.toHaveBeenCalled();
    expect(computeExpSpy).toHaveBeenCalledTimes(0);
    expect(applyRewardsSpy).toHaveBeenCalledTimes(0);

    requireButton(
      container,
      '.problem-series-overview-confirm',
      'overview confirm button',
    ).click();

    const appContainer = getGameAppContainer();
    requireButton(
      appContainer,
      '.skill-menu-return-to-battle-button',
      'formation confirm button',
    ).click();

    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(1);
    expect(session.getCurrentScreen()).toBe('battle');

    waitForEngagedViaSession(session, engine);
    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);
    requireButton(
      appContainer,
      '.wave-prep-screen__confirm',
      'Wave 1 prep confirm button',
    ).click();

    expect(startNextWaveSpy).toHaveBeenCalledTimes(1);
    waitForEngagedViaSession(session, engine);
    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);
    requireButton(
      appContainer,
      '.wave-prep-screen__confirm',
      'Wave 2 prep confirm button',
    ).click();

    expect(startNextWaveSpy).toHaveBeenCalledTimes(2);
    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(3);
    expect(session.getCurrentScreen()).toBe('battle');
    expect(engine.getSnapshot().waveIndex).toBe(2);
    expect(engine.getSnapshot().phase).not.toBe('victory');
    expect(engine.getSnapshot().awaitingNextWave).toBe(false);
    expect(livingEnemyCount(engine)).toBeGreaterThan(0);
    expectVictoryOverlayVisuallyHidden(appContainer);
    expect(computeExpSpy).toHaveBeenCalledTimes(0);
    expect(applyRewardsSpy).toHaveBeenCalledTimes(0);

    killAllEnemies(engine);
    for (let i = 0; i < MAX_WAVE_PREP_TICKS; i++) {
      tickSession(session, 1);
      if (engine.getSnapshot().phase === 'victory') {
        break;
      }
      if (engine.getSnapshot().phase === 'defeat') {
        throw new Error('battle ended in defeat instead of final victory');
      }
    }

    expect(engine.getSnapshot().phase).toBe('victory');
    expect(engine.getSnapshot().waveIndex).toBe(2);
    expect(livingEnemyCount(engine)).toBe(0);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();

    const problemSeriesResult = session.getProblemSeriesVictoryResult();
    if (problemSeriesResult === null) {
      throw new Error('problem series victory result is null after final victory');
    }
    expect(problemSeriesResult).toEqual({
      outcome: 'victory',
      seed: NORMALIZED_FIXTURE_SEED,
      generatorVersion: oldSnapshot.generatorVersion,
      seriesId: oldSnapshot.seriesId,
      reachedWaveIndex: 2,
    });
    expect(session.getOperationResult()).toBeNull();
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(true);
    expect(session.shouldShowVictoryResult()).toBe(false);
    expect(provider()).toBeNull();
    expect(victoryResultFactorySpy).toHaveBeenCalledTimes(1);

    const saveAfterVictory = structuredClone(session.getSaveState());
    expect(saveAfterVictory).toEqual(saveBefore);
    expect(computeExpSpy).toHaveBeenCalledTimes(0);
    expect(applyRewardsSpy).toHaveBeenCalledTimes(0);

    expectVictoryOverlayVisuallyVisible(appContainer);
    const overlayAfterVictory = requireElement<HTMLElement>(
      appContainer,
      '.battle-victory-result-overlay',
      'victory result overlay',
    );
    expect(overlayAfterVictory.getAttribute('aria-hidden')).toBe('false');

    const visibleButtons = listVisibleVictoryResultButtons(appContainer);
    expect(visibleButtons).toHaveLength(3);
    const sameSeedButton = visibleButtons.find(
      (button) => button.textContent === '同じseedで再開始',
    );
    if (!sameSeedButton) {
      throw new Error('visible 同じseedで再開始 button missing');
    }
    const newSeedButton = visibleButtons.find(
      (button) => button.textContent === '新しいseedで開始',
    );
    if (!newSeedButton) {
      throw new Error('visible 新しいseedで開始 button missing');
    }
    expect(visibleButtons.some((button) => button.textContent === '作戦選択へ')).toBe(
      true,
    );
    expect(
      [...appContainer.querySelectorAll<HTMLButtonElement>('.battle-victory-result-button')]
        .some((button) => button.textContent === '同じステージで再戦' && !button.hidden),
    ).toBe(false);

    const resolveCallsBeforeSameSeed = resolveSpy.mock.calls.length;
    const snapshotFactoryCallsBeforeSameSeed = snapshotFactorySpy.mock.calls.length;
    const victoryFactoryCallsBeforeSameSeed = victoryResultFactorySpy.mock.calls.length;
    const restartCallsBeforeSameSeed = restartSpy.mock.calls.length;
    const restartAtWaveCallsBeforeSameSeed = restartAtWaveSpy.mock.calls.length;
    const spawnCallsBeforeSameSeed = spawnWaveEnemiesSpy.mock.calls.length;
    const waveIndexBefore = engine.getSnapshot().waveIndex;
    const waveCountBefore = engine.getSnapshot().waveCount;

    sameSeedButton.click();

    expect(prepareSameSeedSpy).toHaveBeenCalledTimes(1);
    expect(resolveSpy.mock.calls.length).toBe(resolveCallsBeforeSameSeed + 1);
    expect(snapshotFactorySpy.mock.calls.length).toBe(
      snapshotFactoryCallsBeforeSameSeed + 1,
    );
    expect(victoryResultFactorySpy.mock.calls.length).toBe(
      victoryFactoryCallsBeforeSameSeed,
    );

    const newSnapshot = session.getProblemSeriesOperationStartSnapshot();
    if (newSnapshot === null) {
      throw new Error('prepared snapshot is null after same-seed restart');
    }
    expect(newSnapshot).not.toBe(oldSnapshot);
    expect(newSnapshot.seed).toBe(oldSnapshot.seed);
    expect(newSnapshot.generatorVersion).toBe(oldSnapshot.generatorVersion);
    expect(newSnapshot.seriesId).toBe(oldSnapshot.seriesId);
    expect(newSnapshot.waves).toEqual(oldSnapshot.waves);

    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(session.getProblemSeriesVictoryResult()).toBeNull();
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(false);
    expect(session.shouldShowVictoryResult()).toBe(false);
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(session.hasActiveOperation()).toBe(false);

    expectVictoryOverlayVisuallyHidden(appContainer);
    expect(overlayAfterVictory.getAttribute('aria-hidden')).toBe('true');
    expect(
      appContainer.querySelectorAll('.stage-selection-panel').length,
    ).toBe(0);
    expect(appContainer.querySelectorAll('.problem-series-overview-panel')).toHaveLength(1);
    expect(appContainer.querySelectorAll('.problem-series-overview-wave')).toHaveLength(3);

    const seedEl = appContainer.querySelector('.problem-series-overview-seed');
    expect(seedEl).not.toBeNull();
    expect(seedEl?.textContent).toContain(oldSnapshot.seed);

    expect(
      requireElement<HTMLElement>(
        appContainer,
        '.problem-series-overview-confirm',
        'overview confirm button',
      ),
    ).not.toBeNull();

    expect(requireElement<HTMLElement>(
      appContainer,
      '.game-shell__stage-select',
      'stage select host',
    ).hidden).toBe(false);
    expect(requireElement<HTMLElement>(
      appContainer,
      '.game-shell__battle',
      'battle host',
    ).hidden).toBe(true);
    expect(appContainer.querySelector('.game-shell__formation')?.hidden).toBe(true);

    expect(engine.getSnapshot().waveIndex).toBe(waveIndexBefore);
    expect(engine.getSnapshot().waveCount).toBe(waveCountBefore);
    expect(restartSpy.mock.calls.length).toBe(restartCallsBeforeSameSeed);
    expect(restartAtWaveSpy.mock.calls.length).toBe(restartAtWaveCallsBeforeSameSeed);
    expect(spawnWaveEnemiesSpy.mock.calls.length).toBe(spawnCallsBeforeSameSeed);

    const saveAfterSameSeed = structuredClone(session.getSaveState());
    expect(saveAfterSameSeed).toEqual(saveBefore);
    expect(computeExpSpy).toHaveBeenCalledTimes(0);
    expect(applyRewardsSpy).toHaveBeenCalledTimes(0);
  });

  it('2P3: final Wave victory new-seed restart opens empty entry then fixture-b 3-wave overview via production click', () => {
    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const snapshotFactorySpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );
    const victoryResultFactorySpy = vi.spyOn(
      victoryResultModule,
      'createProblemSeriesVictoryResult',
    );
    const computeExpSpy = vi.spyOn(stageProgressionModule, 'computeStageExpReward');
    const applyRewardsSpy = vi.spyOn(victoryRewardsModule, 'applyVictoryRewards');

    session = createSession();
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    const catalogGeneratorVersion = loaded.data.problemSeriesCatalog.generatorVersion;

    const openNewSeedSpy = vi.spyOn(
      session,
      'openNewSeedProblemSeriesEntryFromVictory',
    );
    const engine = getEngine(session);
    const provider = getEngineProvider(engine);
    if (provider === undefined) {
      throw new Error('BattleEngine resolved waves provider is missing');
    }
    const engineInternals = engine as unknown as {
      spawnWaveEnemies: () => void;
    };
    const spawnWaveEnemiesSpy = vi.spyOn(engineInternals, 'spawnWaveEnemies');
    const restartSpy = vi.spyOn(engine, 'restartBattle');
    const restartAtWaveSpy = vi.spyOn(engine, 'restartBattleAtWave');
    const startNextWaveSpy = vi.spyOn(engine, 'startNextWave');

    session.start();

    const saveBefore = structuredClone(session.getSaveState());

    const container = getStageSelectContainer(session);
    requireButton(
      container,
      '.stage-selection-main-operation',
      'main operation button',
    ).click();

    const seedInput = requireInput(
      container,
      '.problem-series-entry-seed-input',
      'seed input',
    );
    requireButton(
      container,
      '.problem-series-entry-prepare',
      'prepare button',
    );
    seedInput.value = RAW_FIXTURE_SEED;
    seedInput.dispatchEvent(new Event('input', { bubbles: true }));
    requireButton(
      container,
      '.problem-series-entry-prepare',
      'prepare button',
    ).click();

    const oldSnapshot = session.getProblemSeriesOperationStartSnapshot();
    if (oldSnapshot === null) {
      throw new Error('prepared snapshot is null after Prepare');
    }
    expect(oldSnapshot.seriesId).toBe(SERIES_A_ID);

    requireButton(
      container,
      '.problem-series-overview-confirm',
      'overview confirm button',
    ).click();

    const appContainer = getGameAppContainer();
    requireButton(
      appContainer,
      '.skill-menu-return-to-battle-button',
      'formation confirm button',
    ).click();

    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(1);
    expect(session.getCurrentScreen()).toBe('battle');

    waitForEngagedViaSession(session, engine);
    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);
    requireButton(
      appContainer,
      '.wave-prep-screen__confirm',
      'Wave 1 prep confirm button',
    ).click();

    expect(startNextWaveSpy).toHaveBeenCalledTimes(1);
    waitForEngagedViaSession(session, engine);
    advanceSessionToWavePrepAfterKill(session, engine, spawnWaveEnemiesSpy);
    requireButton(
      appContainer,
      '.wave-prep-screen__confirm',
      'Wave 2 prep confirm button',
    ).click();

    expect(startNextWaveSpy).toHaveBeenCalledTimes(2);
    expect(spawnWaveEnemiesSpy).toHaveBeenCalledTimes(3);
    expect(session.getCurrentScreen()).toBe('battle');
    expect(engine.getSnapshot().waveIndex).toBe(2);
    expect(engine.getSnapshot().phase).not.toBe('victory');
    expect(engine.getSnapshot().awaitingNextWave).toBe(false);
    expect(livingEnemyCount(engine)).toBeGreaterThan(0);

    killAllEnemies(engine);
    for (let i = 0; i < MAX_WAVE_PREP_TICKS; i++) {
      tickSession(session, 1);
      if (engine.getSnapshot().phase === 'victory') {
        break;
      }
      if (engine.getSnapshot().phase === 'defeat') {
        throw new Error('battle ended in defeat instead of final victory');
      }
    }

    expect(engine.getSnapshot().phase).toBe('victory');
    expect(engine.getSnapshot().waveIndex).toBe(2);
    expect(livingEnemyCount(engine)).toBe(0);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();

    const problemSeriesResult = session.getProblemSeriesVictoryResult();
    if (problemSeriesResult === null) {
      throw new Error('problem series victory result is null after final victory');
    }
    expect(problemSeriesResult).toEqual({
      outcome: 'victory',
      seed: NORMALIZED_FIXTURE_SEED,
      generatorVersion: oldSnapshot.generatorVersion,
      seriesId: oldSnapshot.seriesId,
      reachedWaveIndex: 2,
    });
    expect(problemSeriesResult.seriesId).toBe(SERIES_A_ID);
    expect(session.getOperationResult()).toBeNull();
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(true);
    expect(session.shouldShowVictoryResult()).toBe(false);
    expect(provider()).toBeNull();
    expect(victoryResultFactorySpy).toHaveBeenCalledTimes(1);

    expectVictoryOverlayVisuallyVisible(appContainer);
    const overlayAfterVictory = requireElement<HTMLElement>(
      appContainer,
      '.battle-victory-result-overlay',
      'victory result overlay',
    );
    expect(overlayAfterVictory.getAttribute('aria-hidden')).toBe('false');

    const visibleButtons = listVisibleVictoryResultButtons(appContainer);
    expect(visibleButtons).toHaveLength(3);
    expect(visibleButtons.map((button) => button.textContent)).toEqual([
      '同じseedで再開始',
      '新しいseedで開始',
      '作戦選択へ',
    ]);
    const newSeedButton = visibleButtons.find(
      (button) => button.textContent === '新しいseedで開始',
    );
    if (!newSeedButton) {
      throw new Error('visible 新しいseedで開始 button missing');
    }
    expect(
      [...appContainer.querySelectorAll<HTMLButtonElement>('.battle-victory-result-button')]
        .some((button) => button.textContent === '同じステージで再戦' && !button.hidden),
    ).toBe(false);
    expect(
      [...appContainer.querySelectorAll<HTMLButtonElement>('.battle-victory-result-button')]
        .some((button) => button.textContent === 'ステージ選択へ' && !button.hidden),
    ).toBe(false);

    const resolveCallsBeforeNewSeed = resolveSpy.mock.calls.length;
    const snapshotFactoryCallsBeforeNewSeed = snapshotFactorySpy.mock.calls.length;
    const victoryFactoryCallsBeforeNewSeed = victoryResultFactorySpy.mock.calls.length;
    const restartCallsBeforeNewSeed = restartSpy.mock.calls.length;
    const restartAtWaveCallsBeforeNewSeed = restartAtWaveSpy.mock.calls.length;
    const spawnCallsBeforeNewSeed = spawnWaveEnemiesSpy.mock.calls.length;

    newSeedButton.click();

    expect(openNewSeedSpy).toHaveBeenCalledTimes(1);
    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(session.getProblemSeriesVictoryResult()).toBeNull();
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(session.hasActiveOperation()).toBe(false);
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(false);
    expect(session.shouldShowVictoryResult()).toBe(false);
    expectVictoryOverlayVisuallyHidden(appContainer);
    expect(overlayAfterVictory.getAttribute('aria-hidden')).toBe('true');
    expect(appContainer.querySelectorAll('.problem-series-entry-panel')).toHaveLength(1);
    expect(appContainer.querySelectorAll('.problem-series-overview-panel')).toHaveLength(0);
    expect(appContainer.querySelectorAll('.stage-selection-panel')).toHaveLength(0);

    const seedInputAfterNewSeed = requireInput(
      appContainer,
      '.problem-series-entry-seed-input',
      'seed input after new seed restart',
    );
    const prepareButtonAfterNewSeed = requireButton(
      appContainer,
      '.problem-series-entry-prepare',
      'prepare button after new seed restart',
    );
    expect(seedInputAfterNewSeed.value).toBe('');
    expect(seedInputAfterNewSeed.value).not.toContain(NORMALIZED_FIXTURE_SEED);
    expect(prepareButtonAfterNewSeed.disabled).toBe(true);

    expect(resolveSpy.mock.calls.length).toBe(resolveCallsBeforeNewSeed);
    expect(snapshotFactorySpy.mock.calls.length).toBe(snapshotFactoryCallsBeforeNewSeed);
    expect(victoryResultFactorySpy.mock.calls.length).toBe(victoryFactoryCallsBeforeNewSeed);
    expect(restartSpy.mock.calls.length).toBe(restartCallsBeforeNewSeed);
    expect(restartAtWaveSpy.mock.calls.length).toBe(restartAtWaveCallsBeforeNewSeed);
    expect(spawnWaveEnemiesSpy.mock.calls.length).toBe(spawnCallsBeforeNewSeed);

    const saveAfterNewSeed = structuredClone(session.getSaveState());
    expect(saveAfterNewSeed).toEqual(saveBefore);
    expect(computeExpSpy).toHaveBeenCalledTimes(0);
    expect(applyRewardsSpy).toHaveBeenCalledTimes(0);

    seedInputAfterNewSeed.value = RAW_FIXTURE_SEED_B;
    seedInputAfterNewSeed.dispatchEvent(new Event('input', { bubbles: true }));
    expect(prepareButtonAfterNewSeed.disabled).toBe(false);
    expect(prepareButtonAfterNewSeed.textContent).toBe('新しい作戦');

    const resolveCallsBeforePrepareB = resolveSpy.mock.calls.length;
    const snapshotFactoryCallsBeforePrepareB = snapshotFactorySpy.mock.calls.length;
    const victoryFactoryCallsBeforePrepareB = victoryResultFactorySpy.mock.calls.length;
    const restartCallsBeforePrepareB = restartSpy.mock.calls.length;
    const spawnCallsBeforePrepareB = spawnWaveEnemiesSpy.mock.calls.length;

    prepareButtonAfterNewSeed.click();

    expect(resolveSpy.mock.calls.length).toBe(resolveCallsBeforePrepareB + 1);
    expect(snapshotFactorySpy.mock.calls.length).toBe(
      snapshotFactoryCallsBeforePrepareB + 1,
    );
    expect(victoryResultFactorySpy.mock.calls.length).toBe(
      victoryFactoryCallsBeforePrepareB,
    );

    const newSnapshot = session.getProblemSeriesOperationStartSnapshot();
    if (newSnapshot === null) {
      throw new Error('prepared snapshot is null after fixture-b prepare');
    }
    expect(newSnapshot).not.toBe(oldSnapshot);
    expect(newSnapshot.seed).toBe(NORMALIZED_FIXTURE_SEED_B);
    expect(newSnapshot.seriesId).toBe(SERIES_B_ID);
    expect(newSnapshot.seriesId).not.toBe(oldSnapshot.seriesId);
    expect(newSnapshot.generatorVersion).toBe(catalogGeneratorVersion);
    expect(newSnapshot.waves).toHaveLength(3);

    expect(appContainer.querySelectorAll('.problem-series-overview-panel')).toHaveLength(1);
    expect(appContainer.querySelectorAll('.problem-series-overview-wave')).toHaveLength(3);
    expect(appContainer.querySelectorAll('.problem-series-entry-panel')).toHaveLength(0);
    expect(appContainer.querySelectorAll('.stage-selection-panel')).toHaveLength(0);

    const overviewSeedEl = appContainer.querySelector('.problem-series-overview-seed');
    if (overviewSeedEl === null) {
      throw new Error('overview seed element missing after fixture-b prepare');
    }
    expect(overviewSeedEl.textContent).toContain(NORMALIZED_FIXTURE_SEED_B);

    const overviewPanel = requireElement<HTMLElement>(
      appContainer,
      '.problem-series-overview-panel',
      'overview panel after fixture-b prepare',
    );
    const overviewText = overviewPanel.textContent ?? '';
    for (const forbidden of FORBIDDEN_OVERVIEW_DOM_SUBSTRINGS) {
      expect(overviewText).not.toContain(forbidden);
    }

    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(session.hasActiveOperation()).toBe(false);
    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(appContainer.querySelector('.game-shell__formation')?.hidden).toBe(true);
    expect(appContainer.querySelector('.game-shell__battle')?.hidden).toBe(true);

    expect(restartSpy.mock.calls.length).toBe(restartCallsBeforePrepareB);
    expect(spawnWaveEnemiesSpy.mock.calls.length).toBe(spawnCallsBeforePrepareB);

    const saveAfterPrepareB = structuredClone(session.getSaveState());
    expect(saveAfterPrepareB).toEqual(saveBefore);
    expect(computeExpSpy).toHaveBeenCalledTimes(0);
    expect(applyRewardsSpy).toHaveBeenCalledTimes(0);
  });
});
