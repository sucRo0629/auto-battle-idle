/**
 * @vitest-environment happy-dom
 *
 * R12m 1C 作業単位9: GameSession.resolveWavePrepResourceGrant が
 * 保持済み問題系列 snapshot の prepResourceGrant を正本として読む境界。
 * Wave 数・OperationState・checkpoint・再試行・Player は対象外。
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

function resolveWavePrepResourceGrant(
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

describe('GameSession resolveWavePrepResourceGrant (R12m 1C unit9)', () => {
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

  it('A: without snapshot returns fixed-stage configured grant', () => {
    session = createSessionWithFixedStageGrants(FIXED_STAGE_ID, [
      ...FIXED_STAGE_DIVERGENT_GRANTS,
    ]);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();

    expect(
      resolveWavePrepResourceGrant(session, FIXED_STAGE_ID, 0),
    ).toBe(FIXED_STAGE_DIVERGENT_GRANTS[0]);
    expect(
      resolveWavePrepResourceGrant(session, FIXED_STAGE_ID, 1),
    ).toBe(FIXED_STAGE_DIVERGENT_GRANTS[1]);
    expect(
      resolveWavePrepResourceGrant(session, FIXED_STAGE_ID, 2),
    ).toBe(FIXED_STAGE_DIVERGENT_GRANTS[2]);
  });

  it('A: without snapshot Wave 0 omitted returns 0; later omitted uses catalog', () => {
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

    expect(resolveWavePrepResourceGrant(session, FIXED_STAGE_ID, 0)).toBe(0);
    expect(resolveWavePrepResourceGrant(session, FIXED_STAGE_ID, 1)).toBe(
      catalogGrant,
    );
    expect(resolveWavePrepResourceGrant(session, FIXED_STAGE_ID, 2)).toBe(
      catalogGrant,
    );
  });

  it('B+C: prepare fixture-a then grants match snapshot and differ from fixed stage', () => {
    session = createSessionWithFixedStageGrants(FIXED_STAGE_ID, [
      ...FIXED_STAGE_DIVERGENT_GRANTS,
    ]);

    const before0 = resolveWavePrepResourceGrant(session, FIXED_STAGE_ID, 0);
    const before1 = resolveWavePrepResourceGrant(session, FIXED_STAGE_ID, 1);
    const before2 = resolveWavePrepResourceGrant(session, FIXED_STAGE_ID, 2);
    expect(before0).toBe(FIXED_STAGE_DIVERGENT_GRANTS[0]);
    expect(before1).toBe(FIXED_STAGE_DIVERGENT_GRANTS[1]);
    expect(before2).toBe(FIXED_STAGE_DIVERGENT_GRANTS[2]);

    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);
    expect(prepared.seriesId).toBe('r12m_series_a');
    expect(prepared.waves).toHaveLength(SERIES_A_WAVE_COUNT);
    expect(prepared.waves.length).toBeGreaterThan(0);

    const snapshotGrants = prepared.waves.map((w) => w.prepResourceGrant);
    expect(snapshotGrants).toHaveLength(SERIES_A_WAVE_COUNT);
    expect(snapshotGrants).not.toEqual([...FIXED_STAGE_DIVERGENT_GRANTS]);

    for (let waveIndex = 0; waveIndex < prepared.waves.length; waveIndex++) {
      const expected = prepared.waves[waveIndex]!.prepResourceGrant;
      const actual = resolveWavePrepResourceGrant(
        session,
        FIXED_STAGE_ID,
        waveIndex,
      );
      expect(actual).toBe(expected);
      expect(actual).not.toBe(FIXED_STAGE_DIVERGENT_GRANTS[waveIndex]);
    }
    expect(prepared.waves.length).toBe(SERIES_A_WAVE_COUNT);
  });

  it('D: out-of-range waveIndex throws and does not return fixed-stage grant', () => {
    session = createSessionWithFixedStageGrants(FIXED_STAGE_ID, [
      ...FIXED_STAGE_DIVERGENT_GRANTS,
    ]);
    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);
    const outOfRange = prepared.waves.length;
    expect(outOfRange).toBe(SERIES_A_WAVE_COUNT);

    let thrown: unknown;
    try {
      resolveWavePrepResourceGrant(session, FIXED_STAGE_ID, outOfRange);
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
    // Must throw — never return a number (fixed stage / catalog fallback).
    expect(typeof thrown).not.toBe('number');
  });

  it('E: after prepare, grant reads and out-of-range do not re-call resolver/factory', () => {
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
    for (let waveIndex = 0; waveIndex < prepared.waves.length; waveIndex++) {
      expect(
        resolveWavePrepResourceGrant(session, FIXED_STAGE_ID, waveIndex),
      ).toBe(prepared.waves[waveIndex]!.prepResourceGrant);
    }

    expect(() =>
      resolveWavePrepResourceGrant(
        session!,
        FIXED_STAGE_ID,
        prepared.waves.length,
      ),
    ).toThrow(/waveCount=3/);

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });
});
