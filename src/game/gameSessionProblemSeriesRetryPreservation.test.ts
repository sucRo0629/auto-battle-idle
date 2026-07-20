/**
 * @vitest-environment happy-dom
 *
 * R12m 1C 作業単位11: 同 seed 再試行操作が問題系列 snapshot を
 * 同一参照のまま維持する production 経路の回帰テスト。
 * 中断・最終勝利時の破棄・Player 入口は対象外。
 *
 * R12m 1C 作業単位14E3: 残留 snapshot 下の固定 Stage 再試行分離。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { createEnemiesForStage } from '../battle/entities.ts';
import { expandEnemyGroupsList } from '../battle/enemyGroupSpawn.ts';
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
import type { OperationCheckpointSnapshot } from './OperationCheckpoint.ts';
import { OperationState } from './OperationState.ts';
import type { GameData, SaveGameState } from '../battle/types.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { GameSession } from './GameSession.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);

const FIXTURE_SEED_A = 'fixture-a';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_A_WAVE_COUNT = 3;
const MODULE_ID = 'df_guardian_mod_guard_focus';
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

function sortieToStage(session: GameSession, stageId: string): void {
  const host = (
    session as unknown as {
      handleStageSortie: (id: string) => void;
    }
  ).handleStageSortie.bind(session);
  host(stageId);
}

function enemyClassIdsForFixedStageWave(
  gameData: GameData,
  stageId: string,
  waveIndex: number,
): string[] {
  const enemies = createEnemiesForStage(
    gameData,
    stageId,
    waveIndex,
    levelCurves,
  );
  expect(enemies.length).toBeGreaterThan(0);
  return enemies
    .map((enemy) => enemy.classId)
    .filter((id): id is string => id !== undefined);
}

function resolveEligibleFixedStageId(
  gameData: GameData,
  seriesAWave0ClassIds: readonly string[],
): { stageId: string; waveCount: number; wave0ClassIds: string[] } {
  const sortedSeriesClassIds = [...seriesAWave0ClassIds].sort();
  const eligibleStages = gameData.stages.filter((stage) => {
    if (stage.waves.length === SERIES_A_WAVE_COUNT) {
      return false;
    }
    const wave0ClassIds = enemyClassIdsForFixedStageWave(gameData, stage.id, 0);
    if (wave0ClassIds.length === 0) {
      return false;
    }
    return (
      JSON.stringify([...wave0ClassIds].sort()) !==
      JSON.stringify(sortedSeriesClassIds)
    );
  });

  expect(
    eligibleStages.length,
    'no fixed stage satisfies: exists, non-empty wave 0 enemies, waveCount != 3, classIds differ from series A wave 0',
  ).toBeGreaterThan(0);

  const stage = eligibleStages[0]!;
  const wave0ClassIds = enemyClassIdsForFixedStageWave(gameData, stage.id, 0);
  return {
    stageId: stage.id,
    waveCount: stage.waves.length,
    wave0ClassIds,
  };
}

function assertFixedStageSource(
  session: GameSession,
  stageId: string,
): void {
  const fixedSource = { kind: 'fixedStage', stageId } as const;
  const operation = session.getOperationState();
  expect(operation).not.toBeNull();
  expect(operation!.source).toStrictEqual(fixedSource);
  expect(Object.keys(operation!.source)).toEqual(['kind', 'stageId']);
  expect(Object.keys(operation!)).not.toContain('seed');
  expect(Object.keys(operation!)).not.toContain('generatorVersion');
  expect(Object.keys(operation!)).not.toContain('seriesId');
  expect(Object.keys(operation!)).not.toContain('waves');

  const checkpoint = session.getOperationCheckpoint();
  expect(checkpoint).not.toBeNull();
  expect(checkpoint!.source).toStrictEqual(fixedSource);
  expect(Object.keys(checkpoint!.source)).toEqual(['kind', 'stageId']);
  expect(Object.keys(checkpoint!)).not.toContain('seed');
  expect(Object.keys(checkpoint!)).not.toContain('generatorVersion');
  expect(Object.keys(checkpoint!)).not.toContain('seriesId');
  expect(Object.keys(checkpoint!)).not.toContain('waves');

  const checkpointJson = JSON.stringify(checkpoint);
  expect(checkpointJson).not.toContain(FIXTURE_SEED_A);
  expect(checkpointJson).not.toContain('r12m_series_a');
  expect(checkpointJson).not.toContain(GENERATOR_VERSION);
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

function getOperation(session: GameSession): OperationState {
  return (session as unknown as { operationState: OperationState }).operationState;
}

function triggerDefeat(session: GameSession, survivingIndices: number[] = []): void {
  (
    getEngine(session) as unknown as {
      applyDefeatTransition: (survivingIndices: number[]) => void;
    }
  ).applyDefeatTransition(survivingIndices);
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

function expandWaveExpectations(
  waves: ProblemSeriesOperationStartSnapshot['waves'],
  waveIndex: number,
): { classIds: string[]; moduleIds: string[] } {
  const specs = expandEnemyGroupsList([...waves[waveIndex]!.enemyGroups]);
  expect(specs.length).toBeGreaterThan(0);
  return {
    classIds: specs.map((s) => s.classId),
    moduleIds: specs.map((s) => {
      expect(s.selectedCombatModuleId).toBeDefined();
      return s.selectedCombatModuleId!;
    }),
  };
}

function assertSaveDoesNotEmbedProblemSeries(
  save: SaveGameState,
): void {
  const serialized = JSON.stringify(save);
  expect(serialized).not.toContain(FIXTURE_SEED_A);
  expect(serialized).not.toContain('r12m_series_a');
  expect(serialized).not.toContain(GENERATOR_VERSION);
}

function assertCheckpointDoesNotEmbedProblemSeriesSnapshot(
  session: GameSession,
  prepared: ProblemSeriesOperationStartSnapshot,
): void {
  const checkpoint = session.getOperationCheckpoint();
  expect(checkpoint).not.toBeNull();
  expect(checkpoint).not.toBe(prepared as unknown as OperationCheckpointSnapshot);

  const internalCheckpoint = (
    session as unknown as { operationCheckpoint: OperationCheckpointSnapshot | null }
  ).operationCheckpoint;
  expect(internalCheckpoint).not.toBe(prepared);
  expect(internalCheckpoint).not.toBe(
    prepared as unknown as OperationCheckpointSnapshot,
  );

  const checkpointJson = JSON.stringify(checkpoint);
  expect(checkpointJson).not.toContain(FIXTURE_SEED_A);
  expect(checkpointJson).not.toContain('r12m_series_a');
  expect(checkpointJson).not.toContain('generatorVersion');
}

function assertPreRetrySnapshotHolds(
  session: GameSession,
  prepared: ProblemSeriesOperationStartSnapshot,
): void {
  expect(prepared.seriesId).toBe('r12m_series_a');
  expect(prepared.waves).toHaveLength(SERIES_A_WAVE_COUNT);
  expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
  expect(session.getOperationState()?.isActive).toBe(true);
  expect(session.hasOperationCheckpoint()).toBe(true);
  expect(getEngineProvider(getEngine(session))!()).toBe(prepared.waves);
}

function assertPostRetrySnapshotPreserved(
  session: GameSession,
  prepared: ProblemSeriesOperationStartSnapshot,
  resolveSpy: ReturnType<typeof vi.spyOn>,
  createSpy: ReturnType<typeof vi.spyOn>,
): void {
  const held = session.getProblemSeriesOperationStartSnapshot();
  expect(held).toBe(prepared);
  expect(held!.seed).toBe(FIXTURE_SEED_A);
  expect(held!.generatorVersion).toBe(GENERATOR_VERSION);
  expect(held!.seriesId).toBe('r12m_series_a');
  expect(held!.waves).toBe(prepared.waves);

  const provider = getEngineProvider(getEngine(session));
  expect(provider!()).toBe(prepared.waves);

  expect(resolveSpy).not.toHaveBeenCalled();
  expect(createSpy).not.toHaveBeenCalled();
  assertSaveDoesNotEmbedProblemSeries(session.getSaveState());
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

function advanceToWaveTwoCheckpoint(
  session: GameSession,
  moduleId = MODULE_ID,
): OperationCheckpointSnapshot {
  reachAwaitingNextWaveAfterKill(getEngine(session));
  session.trySetOperationSlotCombatModule(0, moduleId);
  expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
  const checkpoint = session.getOperationCheckpoint();
  expect(checkpoint).not.toBeNull();
  return checkpoint!;
}

describe('GameSession same-seed retry preserves problem series snapshot (R12m 1C unit11)', () => {
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

  it('retryCurrentWaveFromCheckpoint keeps the prepared snapshot reference', () => {
    context = bootProblemSeriesOperation();
    const { session, prepared, resolveSpy, createSpy } = context;

    assertPreRetrySnapshotHolds(session, prepared);
    assertCheckpointDoesNotEmbedProblemSeriesSnapshot(session, prepared);

    const checkpoint = advanceToWaveTwoCheckpoint(session);
    expect(checkpoint.currentWaveIndex).toBe(1);
    expect(checkpoint.clearedWaveCount).toBe(1);

    const op = getOperation(session);
    op.tryAddAcquiredOperationPassiveId(1, 'op_passive_lost');
    op.trySpendUnspentResource(2);
    triggerDefeat(session);

    expect(session.retryCurrentWaveFromCheckpoint()).toBe(true);
    assertPostRetrySnapshotPreserved(session, prepared, resolveSpy, createSpy);
    assertCheckpointDoesNotEmbedProblemSeriesSnapshot(session, prepared);

    expect(session.getOperationWaveIndex()).toBe(checkpoint.currentWaveIndex);
    expect(session.getClearedWaveCount()).toBe(checkpoint.clearedWaveCount);
    expect(session.getPartySlotCombatModule(0)).toBe(MODULE_ID);
    expect(session.getOperationAcquiredPassiveIds(1)).toEqual([]);

    const engine = getEngine(session);
    expect(engine.getSnapshot().waveCount).toBe(SERIES_A_WAVE_COUNT);
    expect(engine.getSnapshot().waveIndex).toBe(checkpoint.currentWaveIndex);

    const expected = expandWaveExpectations(prepared.waves, checkpoint.currentWaveIndex);
    expect(livingEnemyClassIds(engine)).toEqual(expected.classIds);
    expect(livingEnemyBasicSkillIds(engine)).toEqual(expected.moduleIds);
  });

  it('returnToFormationPrep keeps the prepared snapshot reference without battle reload', () => {
    context = bootProblemSeriesOperation();
    const { session, prepared, resolveSpy, createSpy } = context;

    assertPreRetrySnapshotHolds(session, prepared);
    assertCheckpointDoesNotEmbedProblemSeriesSnapshot(session, prepared);

    reachAwaitingNextWaveAfterKill(getEngine(session));
    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(session.isAwaitingNextWave()).toBe(true);

    const checkpointBefore = session.getOperationCheckpoint();
    expect(checkpointBefore).not.toBeNull();
    const operationBefore = getOperation(session);
    expect(operationBefore.isActive).toBe(true);

    const engine = getEngine(session);
    const restartSpy = vi.spyOn(engine, 'restartBattle');
    const restartAtWaveSpy = vi.spyOn(engine, 'restartBattleAtWave');

    expect(session.returnToFormationPrep()).toBe(true);
    assertPostRetrySnapshotPreserved(session, prepared, resolveSpy, createSpy);
    assertCheckpointDoesNotEmbedProblemSeriesSnapshot(session, prepared);

    expect(restartSpy).not.toHaveBeenCalled();
    expect(restartAtWaveSpy).not.toHaveBeenCalled();
    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.getOperationState()?.isActive).toBe(true);
    expect(session.hasOperationCheckpoint()).toBe(true);
    expect(session.getOperationCheckpoint()).toEqual(checkpointBefore);
    expect(getOperation(session)).toBe(operationBefore);
  });

  it('restartOperationFromWaveZero keeps the prepared snapshot reference while resetting wave progress', () => {
    context = bootProblemSeriesOperation();
    const { session, prepared, resolveSpy, createSpy } = context;

    assertPreRetrySnapshotHolds(session, prepared);
    assertCheckpointDoesNotEmbedProblemSeriesSnapshot(session, prepared);

    advanceToWaveTwoCheckpoint(session);
    const op = getOperation(session);
    op.tryAddAcquiredOperationPassiveId(0, 'op_passive_a');
    op.tryAddUnspentResource(5);
    triggerDefeat(session);

    expect(session.restartOperationFromWaveZero()).toBe(true);
    assertPostRetrySnapshotPreserved(session, prepared, resolveSpy, createSpy);
    assertCheckpointDoesNotEmbedProblemSeriesSnapshot(session, prepared);

    expect(session.getOperationWaveIndex()).toBe(0);
    expect(session.getClearedWaveCount()).toBe(0);
    expect(session.getOperationState()?.isActive).toBe(true);
    expect(session.getOperationState()?.isDefeated).toBe(false);
    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.hasOperationCheckpoint()).toBe(true);

    const engine = getEngine(session);
    expect(engine.getSnapshot().waveCount).toBe(SERIES_A_WAVE_COUNT);
    expect(getEngineProvider(engine)!()).toBe(prepared.waves);

    for (let slot = 0; slot < 4; slot += 1) {
      expect(session.getOperationAcquiredPassiveIds(slot)).toEqual([]);
    }
    expect(session.getOperationUnspentResource()).toBe(0);
  });
});

describe('GameSession fixed-stage retry with retained problem series snapshot (R12m 1C unit14E3)', () => {
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

  it('retryCurrentWaveFromCheckpoint keeps fixed-stage input when snapshot A remains in memory', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    const gameData = loaded.data;

    session = createSession();
    const resolveSpy = vi.spyOn(seedResolveModule, 'resolveProblemSeriesFromSeed');
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);
    expect(prepared).not.toBeNull();
    expect(prepared.seriesId).toBe('r12m_series_a');
    expect(prepared.waves).toHaveLength(SERIES_A_WAVE_COUNT);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
    resolveSpy.mockClear();
    createSpy.mockClear();

    const seriesAWave0ClassIds = expandWaveExpectations(
      prepared.waves,
      0,
    ).classIds;
    const eligible = resolveEligibleFixedStageId(
      gameData,
      seriesAWave0ClassIds,
    );
    const fixedStageId = eligible.stageId;
    const fixedStageWaveCount = eligible.waveCount;
    const fixedStageWave0ClassIds = eligible.wave0ClassIds;
    expect(fixedStageWaveCount).not.toBe(SERIES_A_WAVE_COUNT);
    expect(fixedStageWave0ClassIds.length).toBeGreaterThan(0);
    expect(fixedStageWave0ClassIds).not.toEqual(seriesAWave0ClassIds);

    sortieToStage(session, fixedStageId);
    assertFixedStageSource(session, fixedStageId);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);

    const engine = getEngine(session);
    expect(getEngineProvider(engine)!()).toBeNull();

    session.start();
    engine.restartBattleAtWave(0);
    setGameScreen(session, 'battle');
    waitForEngaged(engine);

    const enemiesBeforeDefeat = livingEnemyClassIds(engine);
    expect(enemiesBeforeDefeat.length).toBeGreaterThan(0);
    expect(enemiesBeforeDefeat).toEqual(fixedStageWave0ClassIds);
    expect(enemiesBeforeDefeat).not.toEqual(seriesAWave0ClassIds);

    const checkpointBeforeDefeat = session.getOperationCheckpoint();
    expect(checkpointBeforeDefeat).not.toBeNull();
    assertFixedStageSource(session, fixedStageId);

    triggerDefeat(session);
    expect(session.getOperationState()?.isDefeated).toBe(true);
    assertFixedStageSource(session, fixedStageId);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);

    expect(session.retryCurrentWaveFromCheckpoint()).toBe(true);

    assertFixedStageSource(session, fixedStageId);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(getEngineProvider(engine)!()).toBeNull();
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();

    expect(session.getOperationState()?.isDefeated).toBe(false);
    expect(engine.getSnapshot().waveCount).toBe(fixedStageWaveCount);
    expect(engine.getSnapshot().waveCount).not.toBe(SERIES_A_WAVE_COUNT);

    const enemiesAfterRetry = livingEnemyClassIds(engine);
    expect(enemiesAfterRetry.length).toBeGreaterThan(0);
    expect(enemiesAfterRetry).toEqual(fixedStageWave0ClassIds);
    expect(enemiesAfterRetry).not.toEqual(seriesAWave0ClassIds);
  });
});
