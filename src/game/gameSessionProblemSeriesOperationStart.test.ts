/**
 * @vitest-environment happy-dom
 *
 * R12m 1C 作業単位4: GameSession が問題系列開始スナップショットを
 * production catalog から選出・生成してメモリ保持する境界。
 * OperationState / Save への接続は対象外。
 *
 * R12m 1C 作業単位8 / 14D1: 保持済み waves を BattleEngine の
 * getResolvedWavesCombatInput provider へ production 接続する。
 * 14D1: active OperationState.source による source gate。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { expandEnemyGroupsList } from '../battle/enemyGroupSpawn.ts';
import * as operationStartSnapshotModule from '../battle/problemSeries/operationStartSnapshot.ts';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import { toProblemSeriesBattleWaves } from '../battle/problemSeries/toBattleWaves.ts';
import type { ResolvedWavesCombatInput } from '../battle/resolvedWaveCombatInput.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { GameSession } from './GameSession.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_A_WAVE_COUNT = 3;
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

function sortieToStage(session: GameSession, stageId: string): void {
  const host = (
    session as unknown as {
      handleStageSortie: (id: string) => void;
    }
  ).handleStageSortie.bind(session);
  host(stageId);
}

function clearHeldSnapshotOnly(session: GameSession): void {
  (
    session as unknown as {
      problemSeriesOperationStartSnapshot: null;
    }
  ).problemSeriesOperationStartSnapshot = null;
}

function livingEnemyClassIds(engine: BattleEngine): string[] {
  return engine
    .getSnapshot()
    .enemies.filter((e) => e.hp > 0)
    .map((e) => e.classId)
    .filter((id): id is string => id !== undefined);
}

function livingEnemyBasicSkillIds(engine: BattleEngine): string[] {
  return engine
    .getSnapshot()
    .enemies.filter((e) => e.hp > 0)
    .map((e) => {
      expect(e.basicSkillId).toBeDefined();
      return e.basicSkillId!;
    });
}

function expandWave0Expectations(
  waves: ResolvedWavesCombatInput,
): { classIds: string[]; moduleIds: string[] } {
  const specs = expandEnemyGroupsList([...waves[0]!.enemyGroups]);
  expect(specs.length).toBeGreaterThan(0);
  return {
    classIds: specs.map((s) => s.classId),
    moduleIds: specs.map((s) => {
      expect(s.selectedCombatModuleId).toBeDefined();
      return s.selectedCombatModuleId!;
    }),
  };
}

describe('GameSession prepareProblemSeriesOperationStart (R12m 1C unit4)', () => {
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

  it('constructor does not auto-prepare; getter is null until prepare', () => {
    const resolveSpy = vi.spyOn(seedResolveModule, 'resolveProblemSeriesFromSeed');
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    session = createSession();

    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('fixture-a via production GameSession method holds series A seed/version/seriesId/3 waves', () => {
    session = createSession();
    const catalog = tryLoadGameData();
    if (!catalog.ok) throw new Error(catalog.error);
    const expectedResolved = seedResolveModule.resolveProblemSeriesFromSeed(
      catalog.data.problemSeriesCatalog,
      FIXTURE_SEED_A,
    );
    expect(expectedResolved.series.seriesId).toBe('r12m_series_a');

    const returned = session.prepareProblemSeriesOperationStart(
      FIXTURE_SEED_A,
    );
    const held = session.getProblemSeriesOperationStartSnapshot();

    expect(held).not.toBeNull();
    expect(held).toBe(returned);
    expect(returned.seed).toBe(FIXTURE_SEED_A);
    expect(returned.generatorVersion).toBe(GENERATOR_VERSION);
    expect(returned.generatorVersion).toBe(
      catalog.data.problemSeriesCatalog.generatorVersion,
    );
    expect(returned.seriesId).toBe('r12m_series_a');
    expect(returned.waves).toHaveLength(3);
    expect(returned.waves).toEqual(
      toProblemSeriesBattleWaves(expectedResolved.series),
    );
  });

  it('getter returns the same snapshot reference and does not re-resolve', () => {
    session = createSession();
    const resolveSpy = vi.spyOn(seedResolveModule, 'resolveProblemSeriesFromSeed');
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    const prepared = session.prepareProblemSeriesOperationStart(
      FIXTURE_SEED_A,
    );
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
    resolveSpy.mockClear();
    createSpy.mockClear();

    const first = session.getProblemSeriesOperationStartSnapshot();
    const second = session.getProblemSeriesOperationStartSnapshot();

    expect(first).toBe(prepared);
    expect(second).toBe(prepared);
    expect(first).toBe(second);
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('trim seed is stored as normalized seed from resolver', () => {
    session = createSession();
    const snapshot = session.prepareProblemSeriesOperationStart('  fixture-a  ');

    expect(snapshot.seed).toBe('fixture-a');
    expect(snapshot.seriesId).toBe('r12m_series_a');
    expect(session.getProblemSeriesOperationStartSnapshot()?.seed).toBe(
      'fixture-a',
    );
  });

  it('fixture-b re-prepare replaces with series B without mutating the old snapshot', () => {
    session = createSession();
    const snapshotA = session.prepareProblemSeriesOperationStart(
      FIXTURE_SEED_A,
    );
    const snapshotABefore = structuredClone(snapshotA);
    expect(snapshotA.seriesId).toBe('r12m_series_a');

    const snapshotB = session.prepareProblemSeriesOperationStart(
      FIXTURE_SEED_B,
    );
    const held = session.getProblemSeriesOperationStartSnapshot();

    expect(snapshotB).not.toBe(snapshotA);
    expect(held).toBe(snapshotB);
    expect(snapshotB.seed).toBe(FIXTURE_SEED_B);
    expect(snapshotB.seriesId).toBe('r12m_series_b');
    expect(snapshotB.waves).toHaveLength(3);
    expect(snapshotB.generatorVersion).toBe(GENERATOR_VERSION);

    expect(snapshotA).toEqual(snapshotABefore);
    expect(snapshotA.seriesId).toBe('r12m_series_a');
    expect(snapshotA.seed).toBe(FIXTURE_SEED_A);
  });

  it('prepare alone does not start OperationState or drive BattleEngine / Save', () => {
    session = createSession();
    const engine = getEngine(session);
    const stageIdBefore = session.getSaveState().stageProgress.currentStageId;
    const saveBefore = structuredClone(session.getSaveState());
    const snapshotBefore = engine.getSnapshot();

    const restartSpy = vi.spyOn(engine, 'restartBattle');
    const restartAtWaveSpy = vi.spyOn(engine, 'restartBattleAtWave');
    const startSpy = vi.spyOn(engine, 'startBattle');
    const startNextWaveSpy = vi.spyOn(engine, 'startNextWave');

    expect(session.getOperationState()).toBeNull();
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();

    session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);

    const provider = getEngineProvider(getEngine(session));
    expect(provider).toBeTypeOf('function');
    expect(provider!()).toBeNull();

    expect(session.getOperationState()).toBeNull();
    expect(session.hasActiveOperation()).toBe(false);
    expect(restartSpy).not.toHaveBeenCalled();
    expect(restartAtWaveSpy).not.toHaveBeenCalled();
    expect(startSpy).not.toHaveBeenCalled();
    expect(startNextWaveSpy).not.toHaveBeenCalled();

    const snapshotAfter = engine.getSnapshot();
    expect(snapshotAfter.phase).toBe(snapshotBefore.phase);
    expect(snapshotAfter.waveIndex).toBe(snapshotBefore.waveIndex);
    expect(snapshotAfter.awaitingNextWave).toBe(snapshotBefore.awaitingNextWave);

    expect(session.getSaveState().stageProgress.currentStageId).toBe(
      stageIdBefore,
    );
    expect(session.getSaveState()).toEqual(saveBefore);
    expect(JSON.stringify(session.getSaveState())).not.toContain('fixture-a');
    expect(JSON.stringify(session.getSaveState())).not.toContain(
      'r12m_series_a',
    );
  });
});

describe('GameSession → BattleEngine resolved waves provider (R12m 1C unit8 / 14D1)', () => {
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

  it('wires production provider: null before formal begin; same waves ref after beginProblemSeriesOperation; reload uses series A', () => {
    session = createSession();
    const engine = getEngine(session);
    const provider = getEngineProvider(engine);
    expect(provider).toBeTypeOf('function');

    const stageId = session.getSaveState().stageProgress.currentStageId;
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const fixedStage = loaded.data.stages.find((s) => s.id === stageId);
    expect(fixedStage).toBeDefined();
    const fixedWaveCount = fixedStage!.waves.length;
    expect(fixedWaveCount).not.toBe(SERIES_A_WAVE_COUNT);

    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(provider!()).toBeNull();

    engine.restartBattleAtWave(0);
    const fixedSnap = engine.getSnapshot();
    expect(fixedSnap.waveCount).toBe(fixedWaveCount);
    expect(fixedSnap.waveCount).not.toBe(SERIES_A_WAVE_COUNT);
    const fixedClasses = livingEnemyClassIds(engine);
    expect(fixedClasses.length).toBeGreaterThan(0);

    const resolveSpy = vi.spyOn(
      seedResolveModule,
      'resolveProblemSeriesFromSeed',
    );
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    const returned = session.beginProblemSeriesOperation(FIXTURE_SEED_A);
    expect(returned).not.toBeNull();
    expect(returned!.seriesId).toBe('r12m_series_a');
    expect(returned!.waves).toHaveLength(SERIES_A_WAVE_COUNT);
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);

    expect(session.getOperationState()?.source).toEqual(PROBLEM_SERIES_SOURCE);
    expect(Object.keys(session.getOperationState()!.source)).toEqual(['kind']);
    expect(session.hasActiveOperation()).toBe(true);

    const held = session.getProblemSeriesOperationStartSnapshot();
    expect(held).toBe(returned);
    expect(provider!()).toBe(returned!.waves);
    expect(provider!()).toBe(held!.waves);
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);

    engine.getSnapshot();
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);

    engine.restartBattleAtWave(0);
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);

    const seriesSnap = engine.getSnapshot();
    expect(seriesSnap.waveCount).toBe(SERIES_A_WAVE_COUNT);
    expect(seriesSnap.waveCount).not.toBe(fixedWaveCount);
    expect(seriesSnap.waveIndex).toBe(0);

    const living = seriesSnap.enemies.filter((e) => e.hp > 0);
    expect(living.length).toBeGreaterThan(0);

    const expected = expandWave0Expectations(held!.waves);
    expect(livingEnemyClassIds(engine)).toEqual(expected.classIds);
    expect(livingEnemyBasicSkillIds(engine)).toEqual(expected.moduleIds);
    expect(livingEnemyClassIds(engine)).not.toEqual(fixedClasses);
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);

    expect(provider!()).toBe(
      session.getProblemSeriesOperationStartSnapshot()!.waves,
    );
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('fixedStage source with retained snapshot: provider null and reload uses fixed stage enemies', () => {
    session = createSession();
    const engine = getEngine(session);
    const provider = getEngineProvider(engine)!;

    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);
    expect(prepared.seriesId).toBe('r12m_series_a');
    expect(session.getProblemSeriesOperationStartSnapshot()).not.toBeNull();
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(provider()).toBeNull();

    sortieToStage(session, FIXED_STAGE_ID);

    expect(session.getOperationState()?.source).toEqual({
      kind: 'fixedStage',
      stageId: FIXED_STAGE_ID,
    });
    expect(session.hasActiveOperation()).toBe(true);
    expect(session.getProblemSeriesOperationStartSnapshot()).not.toBeNull();
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(provider()).toBeNull();

    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const fixedStage = loaded.data.stages.find((s) => s.id === FIXED_STAGE_ID);
    expect(fixedStage).toBeDefined();
    const fixedWaveCount = fixedStage!.waves.length;
    expect(fixedWaveCount).not.toBe(SERIES_A_WAVE_COUNT);

    engine.restartBattleAtWave(0);
    const fixedSnap = engine.getSnapshot();
    expect(fixedSnap.waveCount).toBe(fixedWaveCount);
    expect(fixedSnap.waveCount).not.toBe(SERIES_A_WAVE_COUNT);
    expect(fixedSnap.waveIndex).toBe(0);

    const fixedClasses = livingEnemyClassIds(engine);
    expect(fixedClasses.length).toBeGreaterThan(0);

    const seriesWave0 = expandWave0Expectations(prepared.waves);
    expect(fixedClasses).not.toEqual(seriesWave0.classIds);
  });

  it('problemSeries source with missing snapshot: provider throws instead of fixed-stage fallback', () => {
    session = createSession();
    const engine = getEngine(session);
    const provider = getEngineProvider(engine)!;

    const returned = session.beginProblemSeriesOperation(FIXTURE_SEED_A);
    expect(returned).not.toBeNull();
    expect(session.getOperationState()?.source).toEqual(PROBLEM_SERIES_SOURCE);
    expect(session.getProblemSeriesOperationStartSnapshot()).not.toBeNull();

    clearHeldSnapshotOnly(session);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()?.source).toEqual(PROBLEM_SERIES_SOURCE);

    expect(() => provider()).toThrow(/problemSeries/i);
    expect(() => provider()).toThrow(/snapshot/i);

    const stageId = session.getSaveState().stageProgress.currentStageId;
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const fixedStage = loaded.data.stages.find((s) => s.id === stageId);
    expect(fixedStage).toBeDefined();

    let threwOnReload = false;
    try {
      engine.restartBattleAtWave(0);
    } catch (error) {
      threwOnReload = true;
      expect(String(error)).toMatch(/problemSeries/i);
      expect(String(error)).toMatch(/snapshot/i);
    }
    expect(threwOnReload).toBe(true);
  });
});
