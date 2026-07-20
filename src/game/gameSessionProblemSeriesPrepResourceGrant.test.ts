/**
 * @vitest-environment happy-dom
 *
 * R12m 1C 作業単位14D3: GameSession の prepResourceGrant 解決が
 * active OperationSource を正本とし、fixedStage と problemSeries を分離する境界。
 * Wave 数・victory/defeat・retry/abort・Player は対象外。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import * as operationStartSnapshotModule from '../battle/problemSeries/operationStartSnapshot.ts';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { GameSession } from './GameSession.ts';

const FIXTURE_SEED_A = 'fixture-a';
const SERIES_A_WAVE_COUNT = 3;
const FIXED_STAGE_ID = 'r12_prototype';
const PROBLEM_SERIES_SOURCE = { kind: 'problemSeries' } as const;
/** 系列 A の [0, 12, 12] と意図的に異なる技術的 fixture（production JSON 非変更） */
const FIXED_STAGE_DIVERGENT_GRANTS = [101, 202, 303] as const;

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

function createSessionWithFixedStageGrants(
  stageId: string,
  prepResourceGrants: readonly (number | undefined)[],
): GameSession {
  const loaded = tryLoadGameData();
  if (!loaded.ok) {
    throw new Error(loaded.error);
  }
  const stages = loaded.data.stages.map((stage) =>
    stage.id !== stageId
      ? stage
      : {
          ...stage,
          waves: stage.waves.map((wave, waveIndex) => {
            const next = { ...wave };
            const prepResourceGrant = prepResourceGrants[waveIndex];
            if (prepResourceGrant === undefined) {
              delete next.prepResourceGrant;
            } else {
              next.prepResourceGrant = prepResourceGrant;
            }
            return next;
          }),
        },
  );
  const container = document.createElement('div');
  document.body.appendChild(container);
  return new GameSession({ ...loaded.data, stages }, container);
}

function resolveActiveGrantForTest(
  session: GameSession,
  waveIndex: number,
): number {
  return (
    session as unknown as {
      resolveWavePrepResourceGrantForActiveOperation: (
        waveIndex: number,
      ) => number;
    }
  ).resolveWavePrepResourceGrantForActiveOperation(waveIndex);
}

function resolveFixedStageGrantForTest(
  session: GameSession,
  stageId: string,
  waveIndex: number,
): number {
  return (
    session as unknown as {
      resolveWavePrepResourceGrant: (
        stageId: string,
        waveIndex: number,
      ) => number;
    }
  ).resolveWavePrepResourceGrant(stageId, waveIndex);
}

function sortieToStage(session: GameSession, stageId: string): void {
  (
    session as unknown as {
      handleStageSortie: (id: string) => void;
    }
  ).handleStageSortie(stageId);
}

function clearHeldSnapshotOnly(session: GameSession): void {
  (
    session as unknown as {
      problemSeriesOperationStartSnapshot: null;
    }
  ).problemSeriesOperationStartSnapshot = null;
}

describe('GameSession prepResourceGrant source gate (R12m 1C unit14D3)', () => {
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

  it('1: fixedStage without snapshot uses explicit grant; Wave 0 omitted is 0; later omitted uses catalog', () => {
    session = createSessionWithFixedStageGrants(FIXED_STAGE_ID, [
      ...FIXED_STAGE_DIVERGENT_GRANTS,
    ]);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();

    expect(
      resolveFixedStageGrantForTest(session, FIXED_STAGE_ID, 0),
    ).toBe(FIXED_STAGE_DIVERGENT_GRANTS[0]);
    expect(
      resolveFixedStageGrantForTest(session, FIXED_STAGE_ID, 1),
    ).toBe(FIXED_STAGE_DIVERGENT_GRANTS[1]);
    expect(
      resolveFixedStageGrantForTest(session, FIXED_STAGE_ID, 2),
    ).toBe(FIXED_STAGE_DIVERGENT_GRANTS[2]);

    session = createSessionWithFixedStageGrants(FIXED_STAGE_ID, [
      undefined,
      undefined,
      undefined,
    ]);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    const catalogGrant =
      (
        session as unknown as {
          gameData: { operationPassiveCatalog: { waveClearResourceGrant: number } };
        }
      ).gameData.operationPassiveCatalog.waveClearResourceGrant;
    expect(catalogGrant).toBeGreaterThan(0);

    expect(resolveFixedStageGrantForTest(session, FIXED_STAGE_ID, 0)).toBe(0);
    expect(resolveFixedStageGrantForTest(session, FIXED_STAGE_ID, 1)).toBe(
      catalogGrant,
    );
    expect(resolveFixedStageGrantForTest(session, FIXED_STAGE_ID, 2)).toBe(
      catalogGrant,
    );
  });

  it('2: fixedStage with retained snapshot uses fixed-stage grants via active resolver', () => {
    session = createSessionWithFixedStageGrants(FIXED_STAGE_ID, [
      ...FIXED_STAGE_DIVERGENT_GRANTS,
    ]);

    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);
    expect(session.getProblemSeriesOperationStartSnapshot()).not.toBeNull();
    expect(prepared.waves).toHaveLength(SERIES_A_WAVE_COUNT);
    expect(prepared.waves.length).toBeGreaterThan(0);

    const snapshotGrants = prepared.waves.map((w) => w.prepResourceGrant);
    expect(snapshotGrants).not.toEqual([...FIXED_STAGE_DIVERGENT_GRANTS]);

    sortieToStage(session, FIXED_STAGE_ID);

    expect(session.getOperationState()?.source).toEqual({
      kind: 'fixedStage',
      stageId: FIXED_STAGE_ID,
    });
    expect(session.getProblemSeriesOperationStartSnapshot()).not.toBeNull();

    for (let waveIndex = 0; waveIndex < prepared.waves.length; waveIndex++) {
      const activeGrant = resolveActiveGrantForTest(session, waveIndex);
      expect(activeGrant).toBe(FIXED_STAGE_DIVERGENT_GRANTS[waveIndex]);
      expect(activeGrant).not.toBe(prepared.waves[waveIndex]!.prepResourceGrant);
    }
    expect(prepared.waves.length).toBe(SERIES_A_WAVE_COUNT);
  });

  it('3: no OperationState with retained snapshot returns 0 from active resolver', () => {
    session = createSessionWithFixedStageGrants(FIXED_STAGE_ID, [
      ...FIXED_STAGE_DIVERGENT_GRANTS,
    ]);

    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);
    expect(session.getProblemSeriesOperationStartSnapshot()).not.toBeNull();
    expect(prepared.waves).toHaveLength(SERIES_A_WAVE_COUNT);
    expect(session.getOperationState()).toBeNull();

    for (let waveIndex = 0; waveIndex < prepared.waves.length; waveIndex++) {
      expect(resolveActiveGrantForTest(session, waveIndex)).toBe(0);
    }
    expect(prepared.waves[1]!.prepResourceGrant).toBeGreaterThan(0);
    expect(prepared.waves[2]!.prepResourceGrant).toBeGreaterThan(0);
    expect(resolveActiveGrantForTest(session, 1)).not.toBe(
      prepared.waves[1]!.prepResourceGrant,
    );
    expect(resolveActiveGrantForTest(session, 2)).not.toBe(
      prepared.waves[2]!.prepResourceGrant,
    );
    expect(prepared.waves.length).toBe(SERIES_A_WAVE_COUNT);
  });

  it('4: problemSeries formal begin uses snapshot grants for waves 0–2', () => {
    session = createSessionWithFixedStageGrants(FIXED_STAGE_ID, [
      ...FIXED_STAGE_DIVERGENT_GRANTS,
    ]);

    const started = session.beginProblemSeriesOperation(FIXTURE_SEED_A);
    expect(started).not.toBeNull();
    expect(session.getOperationState()?.source).toEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(session.getOperationState()!.source)).toEqual(['kind']);

    const snapshot = session.getProblemSeriesOperationStartSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.waves).toHaveLength(SERIES_A_WAVE_COUNT);
    expect(snapshot!.waves.length).toBeGreaterThan(0);

    const snapshotGrants = snapshot!.waves.map((w) => w.prepResourceGrant);
    expect(snapshotGrants).not.toEqual([...FIXED_STAGE_DIVERGENT_GRANTS]);

    for (let waveIndex = 0; waveIndex < snapshot!.waves.length; waveIndex++) {
      const expected = snapshot!.waves[waveIndex]!.prepResourceGrant;
      const actual = resolveActiveGrantForTest(session, waveIndex);
      expect(actual).toBe(expected);
      expect(actual).not.toBe(FIXED_STAGE_DIVERGENT_GRANTS[waveIndex]);
    }
    expect(snapshot!.waves.length).toBe(SERIES_A_WAVE_COUNT);
  });

  it('5: problemSeries out-of-range waveIndex throws with index and waveCount', () => {
    session = createSession();
    const started = session.beginProblemSeriesOperation(FIXTURE_SEED_A);
    expect(started).not.toBeNull();
    expect(session.getOperationState()?.source).toEqual(PROBLEM_SERIES_SOURCE);

    const snapshot = session.getProblemSeriesOperationStartSnapshot();
    expect(snapshot).not.toBeNull();
    const outOfRange = snapshot!.waves.length;
    expect(outOfRange).toBe(SERIES_A_WAVE_COUNT);

    let thrown: unknown;
    try {
      resolveActiveGrantForTest(session, outOfRange);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain(`index ${outOfRange}`);
    expect(message).toContain(`waveCount=${SERIES_A_WAVE_COUNT}`);
    for (const fixedGrant of FIXED_STAGE_DIVERGENT_GRANTS) {
      expect(message).not.toContain(String(fixedGrant));
    }
    expect(typeof thrown).not.toBe('number');
  });

  it('6: problemSeries with cleared snapshot throws instead of fallback', () => {
    session = createSession();
    const started = session.beginProblemSeriesOperation(FIXTURE_SEED_A);
    expect(started).not.toBeNull();
    expect(session.getOperationState()?.source).toEqual(PROBLEM_SERIES_SOURCE);
    expect(session.getProblemSeriesOperationStartSnapshot()).not.toBeNull();

    clearHeldSnapshotOnly(session);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()?.source).toEqual(PROBLEM_SERIES_SOURCE);

    let thrown: unknown;
    try {
      resolveActiveGrantForTest(session, 0);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toMatch(/problemSeries/i);
    expect(message).toMatch(/snapshot/i);
    expect(message).toMatch(/missing/i);
    expect(message).not.toContain('0');
  });

  it('7: formal begin resolves once; grant reads and out-of-range do not re-call resolver/factory', () => {
    session = createSession();
    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    const started = session.beginProblemSeriesOperation(FIXTURE_SEED_A);
    expect(started).not.toBeNull();
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
    resolveSpy.mockClear();
    createSpy.mockClear();

    const snapshot = session.getProblemSeriesOperationStartSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.waves).toHaveLength(SERIES_A_WAVE_COUNT);

    for (let waveIndex = 0; waveIndex < snapshot!.waves.length; waveIndex++) {
      expect(resolveActiveGrantForTest(session, waveIndex)).toBe(
        snapshot!.waves[waveIndex]!.prepResourceGrant,
      );
    }

    expect(() =>
      resolveActiveGrantForTest(session!, snapshot!.waves.length),
    ).toThrow(/waveCount=3/);

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });
});
