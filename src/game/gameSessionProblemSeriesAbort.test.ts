/**
 * @vitest-environment happy-dom
 *
 * R12m 1C 作業単位12: 未完了問題系列作戦を中断してステージ選択へ戻るとき、
 * 保持中 snapshot を破棄する production 経路のテスト。
 * 最終勝利・新 seed・Player メイン入口は対象外。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import * as operationStartSnapshotModule from '../battle/problemSeries/operationStartSnapshot.ts';
import type { ProblemSeriesOperationStartSnapshot } from '../battle/problemSeries/operationStartSnapshot.ts';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import type { ResolvedWavesCombatInput } from '../battle/resolvedWaveCombatInput.ts';
import {
  killAllEnemies,
  TICK_DT,
  waitForEngaged,
} from '../battle/test/battleFieldSpec.harness.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import type { GameScreen } from './gameScreen.ts';
import type { SaveGameState } from '../battle/types.ts';
import { GameSession } from './GameSession.ts';

const FIXTURE_SEED_A = 'fixture-a';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_A_WAVE_COUNT = 3;
const PROBLEM_SERIES_SOURCE = { kind: 'problemSeries' } as const;

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

function getEngine(session: GameSession): BattleEngine {
  return (session as unknown as { engine: BattleEngine }).engine;
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

function setGameScreen(session: GameSession, screen: GameScreen): void {
  (
    session as unknown as { setGameScreen: (screen: GameScreen) => void }
  ).setGameScreen(screen);
}

function triggerDefeat(session: GameSession, survivingIndices: number[] = []): void {
  (
    getEngine(session) as unknown as {
      applyDefeatTransition: (survivingIndices: number[]) => void;
    }
  ).applyDefeatTransition(survivingIndices);
}

function reachAwaitingNextWaveAfterKill(engine: BattleEngine): void {
  waitForEngaged(engine);
  killAllEnemies(engine);
  for (let i = 0; i < 90_000; i++) {
    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    if (snap.awaitingNextWave) return;
    if (snap.phase === 'victory' || snap.phase === 'defeat') {
      throw new Error(
        `battle ended (${snap.phase}) instead of awaiting next wave`,
      );
    }
  }
  throw new Error('awaiting next wave state not reached');
}

function assertSaveDoesNotEmbedProblemSeries(save: SaveGameState): void {
  const serialized = JSON.stringify(save);
  expect(serialized).not.toContain(FIXTURE_SEED_A);
  expect(serialized).not.toContain('r12m_series_a');
  expect(serialized).not.toContain(GENERATOR_VERSION);
}

interface ProblemSeriesOperationContext {
  session: GameSession;
  prepared: ProblemSeriesOperationStartSnapshot;
  resolveSpy: ReturnType<typeof vi.spyOn>;
  createSpy: ReturnType<typeof vi.spyOn>;
}

function bootProblemSeriesOperation(): ProblemSeriesOperationContext {
  const session = createSession();
  const resolveSpy = vi.spyOn(seedResolveModule, 'resolveProblemSeriesFromSeed');
  const createSpy = vi.spyOn(
    operationStartSnapshotModule,
    'createProblemSeriesOperationStartSnapshot',
  );

  const prepared = session.beginProblemSeriesOperation(FIXTURE_SEED_A);
  expect(prepared).not.toBeNull();
  expect(prepared!.seriesId).toBe('r12m_series_a');
  expect(prepared!.waves).toHaveLength(SERIES_A_WAVE_COUNT);
  expect(resolveSpy).toHaveBeenCalledTimes(1);
  expect(createSpy).toHaveBeenCalledTimes(1);

  const operationState = session.getOperationState();
  expect(operationState).not.toBeNull();
  expect(operationState!.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
  expect(operationState!.source).not.toHaveProperty('stageId');
  expect(operationState!.currentWaveIndex).toBe(0);

  const checkpoint = session.getOperationCheckpoint();
  expect(checkpoint).not.toBeNull();
  expect(checkpoint!.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
  expect(checkpoint!.source).not.toHaveProperty('stageId');
  expect(checkpoint!.currentWaveIndex).toBe(0);

  resolveSpy.mockClear();
  createSpy.mockClear();

  getEngine(session).restartBattleAtWave(0);
  setGameScreen(session, 'battle');

  return { session, prepared: prepared!, resolveSpy, createSpy };
}

function assertPreAbortSnapshotHolds(
  session: GameSession,
  prepared: ProblemSeriesOperationStartSnapshot,
): void {
  expect(prepared.seriesId).toBe('r12m_series_a');
  expect(prepared.waves).toHaveLength(SERIES_A_WAVE_COUNT);
  expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
  expect(session.getOperationState()).not.toBeNull();
  expect(session.hasOperationCheckpoint()).toBe(true);
  expect(getEngineProvider(getEngine(session))!()).toBe(prepared.waves);
}

function assertPostAbortSnapshotDiscarded(
  session: GameSession,
  resolveSpy: ReturnType<typeof vi.spyOn>,
  createSpy: ReturnType<typeof vi.spyOn>,
  engine: BattleEngine,
): void {
  expect(session.getCurrentScreen()).toBe('stageSelect');
  expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
  expect(getEngineProvider(engine)!()).toBeNull();
  expect(session.getOperationState()).toBeNull();
  expect(session.getOperationCheckpoint()).toBeNull();
  expect(resolveSpy).not.toHaveBeenCalled();
  expect(createSpy).not.toHaveBeenCalled();
  assertSaveDoesNotEmbedProblemSeries(session.getSaveState());
}

function spyBattleRestartApis(engine: BattleEngine): {
  restartSpy: ReturnType<typeof vi.spyOn>;
  restartAtWaveSpy: ReturnType<typeof vi.spyOn>;
  startSpy: ReturnType<typeof vi.spyOn>;
  startNextWaveSpy: ReturnType<typeof vi.spyOn>;
} {
  return {
    restartSpy: vi.spyOn(engine, 'restartBattle'),
    restartAtWaveSpy: vi.spyOn(engine, 'restartBattleAtWave'),
    startSpy: vi.spyOn(engine, 'startBattle'),
    startNextWaveSpy: vi.spyOn(engine, 'startNextWave'),
  };
}

function assertBattleRestartApisNotCalled(spies: {
  restartSpy: ReturnType<typeof vi.spyOn>;
  restartAtWaveSpy: ReturnType<typeof vi.spyOn>;
  startSpy: ReturnType<typeof vi.spyOn>;
  startNextWaveSpy: ReturnType<typeof vi.spyOn>;
}): void {
  expect(spies.restartSpy).not.toHaveBeenCalled();
  expect(spies.restartAtWaveSpy).not.toHaveBeenCalled();
  expect(spies.startSpy).not.toHaveBeenCalled();
  expect(spies.startNextWaveSpy).not.toHaveBeenCalled();
}

describe('GameSession abort discards problem series snapshot (R12m 1C unit12)', () => {
  let context: ProblemSeriesOperationContext | null = null;

  beforeEach(() => {
    localStorage.clear();
    mockCanvas2d();
    setVerifyModeEnabled(false);
  });

  afterEach(() => {
    context?.session.destroy();
    context = null;
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('returnToStageSelectFromPause discards snapshot via abortIncompleteOperationToStageSelect', () => {
    context = bootProblemSeriesOperation();
    const { session, prepared, resolveSpy, createSpy } = context;
    const engine = getEngine(session);
    const battleSpies = spyBattleRestartApis(engine);

    assertPreAbortSnapshotHolds(session, prepared);
    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.shouldShowDefeatRetry()).toBe(false);
    expect(session.shouldShowVictoryResult()).toBe(false);
    expect(session.getOperationState()?.isActive).toBe(true);
    expect(session.canReturnToStageSelectFromPause()).toBe(true);
    session.view.setBattlePaused(true);

    expect(session.returnToStageSelectFromPause()).toBe(true);
    assertPostAbortSnapshotDiscarded(session, resolveSpy, createSpy, engine);
    assertBattleRestartApisNotCalled(battleSpies);
  });

  it('returnToStageSelectFromDefeatRetry discards snapshot via abortIncompleteOperationToStageSelect', () => {
    context = bootProblemSeriesOperation();
    const { session, prepared, resolveSpy, createSpy } = context;
    const engine = getEngine(session);
    const battleSpies = spyBattleRestartApis(engine);

    assertPreAbortSnapshotHolds(session, prepared);
    waitForEngaged(engine);
    triggerDefeat(session);

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.shouldShowDefeatRetry()).toBe(true);
    expect(session.getOperationState()).not.toBeNull();
    expect(session.getOperationState()?.isDefeated).toBe(true);
    expect(session.hasOperationCheckpoint()).toBe(true);

    expect(session.returnToStageSelectFromDefeatRetry()).toBe(true);
    assertPostAbortSnapshotDiscarded(session, resolveSpy, createSpy, engine);
    assertBattleRestartApisNotCalled(battleSpies);
  });

  it('returnToStageSelectFromWavePrep discards snapshot via abortIncompleteOperationToStageSelect', () => {
    context = bootProblemSeriesOperation();
    const { session, prepared, resolveSpy, createSpy } = context;
    const engine = getEngine(session);
    const battleSpies = spyBattleRestartApis(engine);

    assertPreAbortSnapshotHolds(session, prepared);
    reachAwaitingNextWaveAfterKill(engine);

    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(session.isAwaitingNextWave()).toBe(true);
    expect(session.getOperationState()?.isActive).toBe(true);
    expect(session.canReturnToStageSelectFromWavePrep()).toBe(true);

    expect(session.returnToStageSelectFromWavePrep()).toBe(true);
    assertPostAbortSnapshotDiscarded(session, resolveSpy, createSpy, engine);
    assertBattleRestartApisNotCalled(battleSpies);
  });
});
