/**
 * @vitest-environment happy-dom
 *
 * R12m Player 作業単位2B1/2B2/2B3/2B4: GameSession.beginPreparedProblemSeriesOperation の
 * 準備済み snapshot 開始 production API（fixture-a / fixture-b 成功経路、prepared なし拒否、active 二重開始拒否）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import * as operationStartSnapshotModule from '../battle/problemSeries/operationStartSnapshot.ts';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import type { ResolvedWavesCombatInput } from '../battle/resolvedWaveCombatInput.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { GameSession } from './GameSession.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';
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

function totalEnemyGroupCount(
  waves: readonly { enemyGroups: readonly unknown[] }[],
): number {
  return waves.reduce((sum, wave) => sum + wave.enemyGroups.length, 0);
}

describe('GameSession.beginPreparedProblemSeriesOperation (R12m Player unit2B1)', () => {
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

  it('fixture-a: begin from prepared snapshot without re-resolve or re-create', () => {
    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    session = createSession();
    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);

    expect(prepared.seriesId).toBe('r12m_series_a');
    expect(prepared.waves).toHaveLength(3);
    expect(totalEnemyGroupCount(prepared.waves)).toBeGreaterThan(0);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);

    resolveSpy.mockClear();
    createSpy.mockClear();

    const returned = session.beginPreparedProblemSeriesOperation();

    expect(returned).toBe(prepared);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();

    expect(session.hasActiveOperation()).toBe(true);
    expect(session.getOperationState()?.isActive).toBe(true);
    expect(session.getOperationState()?.source).toEqual(PROBLEM_SERIES_SOURCE);
    expect(session.getOperationCheckpoint()?.source).toEqual(
      PROBLEM_SERIES_SOURCE,
    );

    const engine = getEngine(session);
    const provider = getEngineProvider(engine)!;
    expect(provider()).toBe(prepared.waves);
  });

  it('fixture-b: begin from prepared snapshot without re-resolve or re-create', () => {
    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    session = createSession();
    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_B);

    expect(prepared.seriesId).toBe('r12m_series_b');
    expect(prepared.seed).toBe(FIXTURE_SEED_B);
    expect(prepared.waves).toHaveLength(3);
    expect(totalEnemyGroupCount(prepared.waves)).toBeGreaterThan(0);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);

    resolveSpy.mockClear();
    createSpy.mockClear();

    const returned = session.beginPreparedProblemSeriesOperation();

    expect(returned).toBe(prepared);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();

    expect(session.hasActiveOperation()).toBe(true);
    expect(session.getOperationState()?.isActive).toBe(true);
    expect(session.getOperationState()?.source).toEqual(PROBLEM_SERIES_SOURCE);
    expect(session.getOperationCheckpoint()?.source).toEqual(
      PROBLEM_SERIES_SOURCE,
    );

    const engine = getEngine(session);
    const provider = getEngineProvider(engine)!;
    expect(provider()).toBe(prepared.waves);
  });

  it('2B3: rejects begin when no prepared snapshot; resolver/factory 0; state unchanged', () => {
    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    session = createSession();
    const engine = getEngine(session);
    const provider = getEngineProvider(engine)!;
    const battleSnapshotBefore = engine.getSnapshot();

    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(provider()).toBeNull();

    const returned = session.beginPreparedProblemSeriesOperation();

    expect(returned).toBeNull();
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(provider()).toBeNull();
    expect(engine.getSnapshot()).toEqual(battleSnapshotBefore);
  });

  it('2B4: rejects second begin while active problemSeries; resolver/factory 0; state unchanged', () => {
    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    session = createSession();
    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);

    resolveSpy.mockClear();
    createSpy.mockClear();

    const firstReturned = session.beginPreparedProblemSeriesOperation();

    expect(firstReturned).toBe(prepared);
    expect(session.hasActiveOperation()).toBe(true);
    expect(session.getOperationState()?.isActive).toBe(true);
    expect(session.getOperationState()?.source).toEqual(PROBLEM_SERIES_SOURCE);
    expect(session.getOperationCheckpoint()).not.toBeNull();
    expect(session.getOperationCheckpoint()?.source).toEqual(
      PROBLEM_SERIES_SOURCE,
    );

    const engine = getEngine(session);
    const provider = getEngineProvider(engine)!;
    expect(provider()).toBe(prepared.waves);

    const operationStateBeforeSecond = session.getOperationState();
    const checkpointBeforeSecond = session.getOperationCheckpoint();
    const battleSnapshotBeforeSecond = engine.getSnapshot();

    resolveSpy.mockClear();
    createSpy.mockClear();

    const secondReturned = session.beginPreparedProblemSeriesOperation();

    expect(secondReturned).toBeNull();
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(session.getOperationState()).toEqual(operationStateBeforeSecond);
    expect(session.getOperationCheckpoint()).toEqual(checkpointBeforeSecond);
    expect(session.getOperationState()?.source).toEqual(PROBLEM_SERIES_SOURCE);
    expect(provider()).toBe(prepared.waves);
    expect(engine.getSnapshot()).toEqual(battleSnapshotBeforeSecond);
  });
});
