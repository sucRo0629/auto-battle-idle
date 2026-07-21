/**
 * @vitest-environment happy-dom
 *
 * R12m Player 作業単位2H1: GameSession.discardPreparedProblemSeriesSnapshot の
 * 未開始 prepared snapshot 破棄 production API（fixture-a 破棄成功、active 作戦中拒否）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import * as operationStartSnapshotModule from '../battle/problemSeries/operationStartSnapshot.ts';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { GameSession } from './GameSession.ts';

const FIXTURE_SEED_A = 'fixture-a';
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

describe('GameSession.discardPreparedProblemSeriesSnapshot (R12m Player unit2H1)', () => {
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

  it('2H1: discards unprepared snapshot; second discard false; screen/save unchanged', () => {
    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    session = createSession();
    const saveBefore = structuredClone(session.getSaveState());
    const screenBefore = session.getCurrentScreen();

    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);

    expect(prepared).not.toBeNull();
    expect(prepared.seriesId).toBe('r12m_series_a');
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(session.getOperationState()).toBeNull();
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);

    resolveSpy.mockClear();
    createSpy.mockClear();

    const firstDiscard = session.discardPreparedProblemSeriesSnapshot();

    expect(firstDiscard).toBe(true);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(session.getCurrentScreen()).toBe(screenBefore);
    expect(session.getSaveState()).toEqual(saveBefore);
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();

    const secondDiscard = session.discardPreparedProblemSeriesSnapshot();

    expect(secondDiscard).toBe(false);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(session.getCurrentScreen()).toBe(screenBefore);
    expect(session.getSaveState()).toEqual(saveBefore);
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('2H1: rejects discard while active problemSeries; snapshot/state/checkpoint/save/screen unchanged', () => {
    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    session = createSession();
    const saveBefore = structuredClone(session.getSaveState());
    const screenBefore = session.getCurrentScreen();

    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);

    expect(prepared).not.toBeNull();
    expect(prepared.seriesId).toBe('r12m_series_a');
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);

    resolveSpy.mockClear();
    createSpy.mockClear();

    const began = session.beginPreparedProblemSeriesOperation();

    expect(began).toBe(prepared);
    expect(session.getOperationState()?.source).toEqual(PROBLEM_SERIES_SOURCE);
    expect(session.hasActiveOperation()).toBe(true);

    const operationState = session.getOperationState();
    const checkpoint = session.getOperationCheckpoint();
    expect(operationState).not.toBeNull();
    expect(checkpoint).not.toBeNull();

    const discardResult = session.discardPreparedProblemSeriesSnapshot();

    expect(discardResult).toBe(false);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(session.getOperationState()).toEqual(operationState);
    expect(session.getOperationCheckpoint()).toEqual(checkpoint);
    expect(session.getCurrentScreen()).toBe(screenBefore);
    expect(session.getSaveState()).toEqual(saveBefore);
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });
});
