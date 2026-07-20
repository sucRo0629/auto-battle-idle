/**
 * @vitest-environment happy-dom
 *
 * R12m 1C 作業単位14C1: GameSession.beginProblemSeriesOperation の
 * 正式な問題系列開始 production API。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import * as operationStartSnapshotModule from '../battle/problemSeries/operationStartSnapshot.ts';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import { toProblemSeriesBattleWaves } from '../battle/problemSeries/toBattleWaves.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { GameSession } from './GameSession.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';
const GENERATOR_VERSION = 'r12m-v1';
const PROBLEM_SERIES_SOURCE = { kind: 'problemSeries' } as const;
const FIXED_STAGE_ID = '1';

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

function sortieToStage(session: GameSession, stageId: string): void {
  const host = (
    session as unknown as {
      handleStageSortie: (id: string) => void;
    }
  ).handleStageSortie.bind(session);
  host(stageId);
}

function assertOperationStateLacksSeriesIdentity(
  session: GameSession,
): void {
  const op = session.getOperationState();
  expect(op).not.toBeNull();
  expect(op!.source).toEqual(PROBLEM_SERIES_SOURCE);
  expect(Object.keys(op!.source)).toEqual(['kind']);
  expect(Object.keys(op!)).not.toContain('seed');
  expect(Object.keys(op!)).not.toContain('generatorVersion');
  expect(Object.keys(op!)).not.toContain('seriesId');
  expect(Object.keys(op!)).not.toContain('waves');
  expect(Object.keys(op!)).not.toContain('stageId');
}

function assertCheckpointLacksSeriesIdentity(session: GameSession): void {
  const checkpoint = session.getOperationCheckpoint();
  expect(checkpoint).not.toBeNull();
  expect(checkpoint!.source).toEqual(PROBLEM_SERIES_SOURCE);
  expect(Object.keys(checkpoint!.source)).toEqual(['kind']);
  expect(Object.keys(checkpoint!)).not.toContain('seed');
  expect(Object.keys(checkpoint!)).not.toContain('generatorVersion');
  expect(Object.keys(checkpoint!)).not.toContain('seriesId');
  expect(Object.keys(checkpoint!)).not.toContain('waves');
  expect(Object.keys(checkpoint!)).not.toContain('stageId');
}

describe('GameSession.beginProblemSeriesOperation (R12m 1C unit14C1)', () => {
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

  it('series A: formal begin via production API starts operation and checkpoint at wave 0', () => {
    session = createSession();
    const catalog = tryLoadGameData();
    if (!catalog.ok) throw new Error(catalog.error);
    const expectedResolved = seedResolveModule.resolveProblemSeriesFromSeed(
      catalog.data.problemSeriesCatalog,
      FIXTURE_SEED_A,
    );
    expect(expectedResolved.series.seriesId).toBe('r12m_series_a');

    const returned = session.beginProblemSeriesOperation(FIXTURE_SEED_A);

    expect(returned).not.toBeNull();
    expect(returned!.seed).toBe(FIXTURE_SEED_A);
    expect(returned!.generatorVersion).toBe(GENERATOR_VERSION);
    expect(returned!.seriesId).toBe('r12m_series_a');
    expect(returned!.waves).toHaveLength(3);
    expect(returned!.waves).toEqual(
      toProblemSeriesBattleWaves(expectedResolved.series),
    );
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(returned);

    assertOperationStateLacksSeriesIdentity(session);
    assertCheckpointLacksSeriesIdentity(session);
    expect(session.getOperationWaveIndex()).toBe(0);
    expect(session.getOperationCheckpoint()?.currentWaveIndex).toBe(0);
    expect(session.hasActiveOperation()).toBe(true);
    expect(session.hasOperationCheckpoint()).toBe(true);
  });

  it('series B: formal begin selects series B through the same production API', () => {
    session = createSession();
    const catalog = tryLoadGameData();
    if (!catalog.ok) throw new Error(catalog.error);
    const expectedResolved = seedResolveModule.resolveProblemSeriesFromSeed(
      catalog.data.problemSeriesCatalog,
      FIXTURE_SEED_B,
    );
    expect(expectedResolved.series.seriesId).toBe('r12m_series_b');

    const returned = session.beginProblemSeriesOperation(FIXTURE_SEED_B);

    expect(returned).not.toBeNull();
    expect(returned!.seed).toBe(FIXTURE_SEED_B);
    expect(returned!.seriesId).toBe('r12m_series_b');
    expect(returned!.generatorVersion).toBe(GENERATOR_VERSION);
    expect(returned!.waves).toHaveLength(3);
    expect(returned!.waves).toEqual(
      toProblemSeriesBattleWaves(expectedResolved.series),
    );
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(returned);

    assertOperationStateLacksSeriesIdentity(session);
    assertCheckpointLacksSeriesIdentity(session);
    expect(session.getOperationWaveIndex()).toBe(0);
    expect(session.getOperationCheckpoint()?.currentWaveIndex).toBe(0);
  });

  it('rejects new seed while active problem series operation keeps series A state', () => {
    session = createSession();
    const first = session.beginProblemSeriesOperation(FIXTURE_SEED_A);
    expect(first).not.toBeNull();
    expect(first!.seriesId).toBe('r12m_series_a');

    const opBefore = session.getOperationState();
    const checkpointBefore = session.getOperationCheckpoint();
    expect(opBefore).not.toBeNull();
    expect(checkpointBefore).not.toBeNull();

    const resolveSpy = vi.spyOn(seedResolveModule, 'resolveProblemSeriesFromSeed');
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    const second = session.beginProblemSeriesOperation(FIXTURE_SEED_B);

    expect(second).toBeNull();
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(first);
    expect(session.getProblemSeriesOperationStartSnapshot()?.seriesId).toBe(
      'r12m_series_a',
    );
    expect(session.getOperationState()).toEqual(opBefore);
    expect(session.getOperationWaveIndex()).toBe(0);
    expect(session.getOperationCheckpoint()).toEqual(checkpointBefore);
    expect(session.getOperationState()?.source).toEqual(PROBLEM_SERIES_SOURCE);
  });

  it('rejects begin while active fixed stage operation and does not create snapshot', () => {
    session = createSession();
    sortieToStage(session, FIXED_STAGE_ID);

    expect(session.getOperationState()?.source).toEqual({
      kind: 'fixedStage',
      stageId: FIXED_STAGE_ID,
    });
    expect(session.hasActiveOperation()).toBe(true);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();

    const opBefore = session.getOperationState();
    const checkpointBefore = session.getOperationCheckpoint();

    const resolveSpy = vi.spyOn(seedResolveModule, 'resolveProblemSeriesFromSeed');
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    const result = session.beginProblemSeriesOperation(FIXTURE_SEED_A);

    expect(result).toBeNull();
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toEqual(opBefore);
    expect(session.getOperationState()?.source).toEqual({
      kind: 'fixedStage',
      stageId: FIXED_STAGE_ID,
    });
    expect(session.getOperationCheckpoint()).toEqual(checkpointBefore);
  });
});
