/**
 * @vitest-environment happy-dom
 *
 * R12m 1C 作業単位11: 同 seed 再試行操作が問題系列 snapshot を
 * 同一参照のまま維持する production 経路の回帰テスト。
 * 中断・最終勝利時の破棄・Player 入口は対象外。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
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
import type { SaveGameState } from '../battle/types.ts';
import { GameSession } from './GameSession.ts';

const FIXTURE_SEED_A = 'fixture-a';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_A_WAVE_COUNT = 3;
const MODULE_ID = 'df_guardian_mod_guard_focus';

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

function beginOperation(
  session: GameSession,
  stageId: string,
  initialWaveIndex = 0,
): boolean {
  return (
    session as unknown as {
      beginOperation: (stageId: string, initialWaveIndex?: number) => boolean;
    }
  ).beginOperation(stageId, initialWaveIndex);
}

function setGameScreen(session: GameSession, screen: GameScreen): void {
  (
    session as unknown as { setGameScreen: (screen: GameScreen) => void }
  ).setGameScreen(screen);
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

  const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);
  expect(resolveSpy).toHaveBeenCalledTimes(1);
  expect(createSpy).toHaveBeenCalledTimes(1);
  resolveSpy.mockClear();
  createSpy.mockClear();

  const stageId = session.getSaveState().stageProgress.currentStageId;
  expect(beginOperation(session, stageId, 0)).toBe(true);
  getEngine(session).restartBattleAtWave(0);
  setGameScreen(session, 'battle');

  return { session, prepared, resolveSpy, createSpy };
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
