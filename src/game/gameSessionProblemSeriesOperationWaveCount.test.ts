/**
 * @vitest-environment happy-dom
 *
 * R12m 1C 作業単位14D2: GameSession.resolveOperationWaveCount(source) が
 * snapshot 有無ではなく OperationSource を正本に Wave 数を解決する境界。
 * checkpoint 形状・再試行・Player・resolveOperationStartWaveIndex は対象外。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import * as operationStartSnapshotModule from '../battle/problemSeries/operationStartSnapshot.ts';
import type { ProblemSeriesOperationStartSnapshot } from '../battle/problemSeries/operationStartSnapshot.ts';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { GameSession } from './GameSession.ts';
import type { OperationSource } from './operationSource.ts';

const FIXTURE_SEED_A = 'fixture-a';
const SERIES_A_WAVE_COUNT = 3;
const FIXED_STAGE_ID = 'r12_prototype';
/** 系列 A の 3 Wave と意図的に異なる技術的 fixture（production JSON 非変更） */
const FIXED_STAGE_DIVERGENT_WAVE_COUNT = 1;
const UNKNOWN_STAGE_ID = 'unknown-stage-id-for-wave-count';

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

function createSessionWithFixedStageWaveCount(
  stageId: string,
  waveCount: number,
): GameSession {
  const loaded = tryLoadGameData();
  if (!loaded.ok) {
    throw new Error(loaded.error);
  }
  const stages = loaded.data.stages.map((stage) => {
    if (stage.id !== stageId) return stage;
    const templateWave = stage.waves[0] ?? { enemies: [] };
    return {
      ...stage,
      waves: Array.from({ length: waveCount }, () => ({
        ...templateWave,
        enemies: [...templateWave.enemies],
      })),
    };
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  return new GameSession({ ...loaded.data, stages }, container);
}

function resolveOperationWaveCountForTest(
  session: GameSession,
  source: OperationSource,
): number {
  return (
    session as unknown as {
      resolveOperationWaveCount: (source: OperationSource) => number;
    }
  ).resolveOperationWaveCount(source);
}

function replaceHeldSnapshotWaves(
  session: GameSession,
  waves: ProblemSeriesOperationStartSnapshot['waves'],
): void {
  const held = session.getProblemSeriesOperationStartSnapshot();
  expect(held).not.toBeNull();
  (
    session as unknown as {
      problemSeriesOperationStartSnapshot: ProblemSeriesOperationStartSnapshot | null;
    }
  ).problemSeriesOperationStartSnapshot = {
    ...held!,
    waves,
  };
}

function clearHeldSnapshotForTest(session: GameSession): void {
  (
    session as unknown as {
      problemSeriesOperationStartSnapshot: ProblemSeriesOperationStartSnapshot | null;
    }
  ).problemSeriesOperationStartSnapshot = null;
}

describe('GameSession resolveOperationWaveCount(source) (R12m 1C unit14D2)', () => {
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

  it('1: fixedStage without snapshot returns stage waves; unknown stageId is 0', () => {
    session = createSessionWithFixedStageWaveCount(
      FIXED_STAGE_ID,
      FIXED_STAGE_DIVERGENT_WAVE_COUNT,
    );
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();

    expect(
      resolveOperationWaveCountForTest(session, {
        kind: 'fixedStage',
        stageId: FIXED_STAGE_ID,
      }),
    ).toBe(FIXED_STAGE_DIVERGENT_WAVE_COUNT);
    expect(
      resolveOperationWaveCountForTest(session, {
        kind: 'fixedStage',
        stageId: UNKNOWN_STAGE_ID,
      }),
    ).toBe(0);
  });

  it('2: fixedStage ignores snapshot residue and keeps stage wave count', () => {
    session = createSessionWithFixedStageWaveCount(
      FIXED_STAGE_ID,
      FIXED_STAGE_DIVERGENT_WAVE_COUNT,
    );
    expect(FIXED_STAGE_DIVERGENT_WAVE_COUNT).not.toBe(SERIES_A_WAVE_COUNT);

    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);
    expect(prepared.seriesId).toBe('r12m_series_a');
    expect(prepared.waves).toHaveLength(SERIES_A_WAVE_COUNT);
    expect(session.getProblemSeriesOperationStartSnapshot()).not.toBeNull();

    const resolved = resolveOperationWaveCountForTest(session, {
      kind: 'fixedStage',
      stageId: FIXED_STAGE_ID,
    });
    expect(resolved).toBe(FIXED_STAGE_DIVERGENT_WAVE_COUNT);
    expect(resolved).not.toBe(SERIES_A_WAVE_COUNT);
  });

  it('3: beginProblemSeriesOperation keeps source as problemSeries and resolves snapshot wave count', () => {
    session = createSessionWithFixedStageWaveCount(
      FIXED_STAGE_ID,
      FIXED_STAGE_DIVERGENT_WAVE_COUNT,
    );
    const started = session.beginProblemSeriesOperation(FIXTURE_SEED_A);
    expect(started).not.toBeNull();
    expect(session.getOperationState()?.source).toStrictEqual({
      kind: 'problemSeries',
    });
    const snapshot = session.getProblemSeriesOperationStartSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.waves).toHaveLength(SERIES_A_WAVE_COUNT);

    const resolved = resolveOperationWaveCountForTest(session, {
      kind: 'problemSeries',
    });
    expect(resolved).toBe(SERIES_A_WAVE_COUNT);
    expect(resolved).not.toBe(FIXED_STAGE_DIVERGENT_WAVE_COUNT);
  });

  it('4: repeated resolves after formal begin do not re-call resolver/factory', () => {
    session = createSession();
    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    const prepared = session.beginProblemSeriesOperation(FIXTURE_SEED_A);
    expect(prepared).not.toBeNull();
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(session.getOperationState()?.source).toStrictEqual({
      kind: 'problemSeries',
    });

    expect(
      resolveOperationWaveCountForTest(session, { kind: 'problemSeries' }),
    ).toBe(SERIES_A_WAVE_COUNT);
    expect(
      resolveOperationWaveCountForTest(session, { kind: 'problemSeries' }),
    ).toBe(SERIES_A_WAVE_COUNT);
    expect(
      resolveOperationWaveCountForTest(session, { kind: 'problemSeries' }),
    ).toBe(SERIES_A_WAVE_COUNT);

    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('5: problemSeries throws explicit error when snapshot is missing', () => {
    session = createSessionWithFixedStageWaveCount(
      FIXED_STAGE_ID,
      FIXED_STAGE_DIVERGENT_WAVE_COUNT,
    );
    const started = session.beginProblemSeriesOperation(FIXTURE_SEED_A);
    expect(started).not.toBeNull();
    expect(session.getOperationState()?.source).toStrictEqual({
      kind: 'problemSeries',
    });
    clearHeldSnapshotForTest(session);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();

    expect(() =>
      resolveOperationWaveCountForTest(session!, { kind: 'problemSeries' }),
    ).toThrowError(/problemSeries.*snapshot.*missing/i);
    expect(
      resolveOperationWaveCountForTest(session, {
        kind: 'fixedStage',
        stageId: FIXED_STAGE_ID,
      }),
    ).toBe(FIXED_STAGE_DIVERGENT_WAVE_COUNT);
  });

  it('6: problemSeries empty snapshot waves return 0 without fixedStage fallback', () => {
    session = createSessionWithFixedStageWaveCount(
      FIXED_STAGE_ID,
      FIXED_STAGE_DIVERGENT_WAVE_COUNT,
    );
    const started = session.beginProblemSeriesOperation(FIXTURE_SEED_A);
    expect(started).not.toBeNull();
    replaceHeldSnapshotWaves(session, []);
    expect(session.getProblemSeriesOperationStartSnapshot()?.waves).toHaveLength(0);

    expect(
      resolveOperationWaveCountForTest(session, { kind: 'problemSeries' }),
    ).toBe(0);
    expect(
      resolveOperationWaveCountForTest(session, { kind: 'problemSeries' }),
    ).not.toBe(FIXED_STAGE_DIVERGENT_WAVE_COUNT);
    expect(
      resolveOperationWaveCountForTest(session, {
        kind: 'fixedStage',
        stageId: FIXED_STAGE_ID,
      }),
    ).toBe(
      FIXED_STAGE_DIVERGENT_WAVE_COUNT,
    );
  });
});
