/**
 * @vitest-environment happy-dom
 *
 * R12m 1C 作業単位10: GameSession.resolveOperationStageWaveCount が
 * 保持済み問題系列 snapshot の waves.length を正本として読む境界。
 * checkpoint 形状・再試行・Player・resolveOperationStartWaveIndex は対象外。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import * as operationStartSnapshotModule from '../battle/problemSeries/operationStartSnapshot.ts';
import type { ProblemSeriesOperationStartSnapshot } from '../battle/problemSeries/operationStartSnapshot.ts';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { GameSession } from './GameSession.ts';

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

function resolveOperationStageWaveCount(
  session: GameSession,
  stageId: string,
): number {
  return (
    session as unknown as {
      resolveOperationStageWaveCount: (stageId: string) => number;
    }
  ).resolveOperationStageWaveCount(stageId);
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

describe('GameSession resolveOperationStageWaveCount (R12m 1C unit10)', () => {
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

  it('1: without snapshot returns fixed-stage wave count; unknown stageId is 0', () => {
    session = createSessionWithFixedStageWaveCount(
      FIXED_STAGE_ID,
      FIXED_STAGE_DIVERGENT_WAVE_COUNT,
    );
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();

    expect(resolveOperationStageWaveCount(session, FIXED_STAGE_ID)).toBe(
      FIXED_STAGE_DIVERGENT_WAVE_COUNT,
    );
    expect(resolveOperationStageWaveCount(session, UNKNOWN_STAGE_ID)).toBe(0);
  });

  it('2: after prepare fixture-a, series wave count 3 overrides divergent fixed stage', () => {
    session = createSessionWithFixedStageWaveCount(
      FIXED_STAGE_ID,
      FIXED_STAGE_DIVERGENT_WAVE_COUNT,
    );
    expect(FIXED_STAGE_DIVERGENT_WAVE_COUNT).not.toBe(SERIES_A_WAVE_COUNT);

    expect(resolveOperationStageWaveCount(session, FIXED_STAGE_ID)).toBe(
      FIXED_STAGE_DIVERGENT_WAVE_COUNT,
    );

    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);
    expect(prepared.seriesId).toBe('r12m_series_a');
    expect(prepared.waves).toHaveLength(SERIES_A_WAVE_COUNT);

    expect(resolveOperationStageWaveCount(session, FIXED_STAGE_ID)).toBe(
      SERIES_A_WAVE_COUNT,
    );
    expect(resolveOperationStageWaveCount(session, FIXED_STAGE_ID)).not.toBe(
      FIXED_STAGE_DIVERGENT_WAVE_COUNT,
    );
  });

  it('3: after prepare, real and unknown stageId both return snapshot wave count 3', () => {
    session = createSessionWithFixedStageWaveCount(
      FIXED_STAGE_ID,
      FIXED_STAGE_DIVERGENT_WAVE_COUNT,
    );
    session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);

    expect(resolveOperationStageWaveCount(session, FIXED_STAGE_ID)).toBe(
      SERIES_A_WAVE_COUNT,
    );
    expect(resolveOperationStageWaveCount(session, UNKNOWN_STAGE_ID)).toBe(
      SERIES_A_WAVE_COUNT,
    );
  });

  it('4: after prepare, repeated wave-count reads do not re-call resolver/factory', () => {
    session = createSession();
    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
    resolveSpy.mockClear();
    createSpy.mockClear();

    expect(prepared.waves).toHaveLength(SERIES_A_WAVE_COUNT);
    expect(resolveOperationStageWaveCount(session, FIXED_STAGE_ID)).toBe(
      SERIES_A_WAVE_COUNT,
    );
    expect(resolveOperationStageWaveCount(session, UNKNOWN_STAGE_ID)).toBe(
      SERIES_A_WAVE_COUNT,
    );
    expect(resolveOperationStageWaveCount(session, FIXED_STAGE_ID)).toBe(
      SERIES_A_WAVE_COUNT,
    );

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('5: empty snapshot waves return 0 and do not fall back to fixed stage', () => {
    session = createSessionWithFixedStageWaveCount(
      FIXED_STAGE_ID,
      FIXED_STAGE_DIVERGENT_WAVE_COUNT,
    );
    session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);
    replaceHeldSnapshotWaves(session, []);

    expect(resolveOperationStageWaveCount(session, FIXED_STAGE_ID)).toBe(0);
    expect(resolveOperationStageWaveCount(session, FIXED_STAGE_ID)).not.toBe(
      FIXED_STAGE_DIVERGENT_WAVE_COUNT,
    );
    expect(resolveOperationStageWaveCount(session, UNKNOWN_STAGE_ID)).toBe(0);
  });
});
