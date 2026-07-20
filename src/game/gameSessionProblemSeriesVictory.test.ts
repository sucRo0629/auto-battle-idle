/**
 * @vitest-environment happy-dom
 *
 * R12m 1C 作業単位13: 問題系列の最終 Wave 勝利時に作戦を終了し、
 * snapshot と作戦内状態を破棄する production 経路のテスト。
 * 正式な結果画面・Player 入口・固定 Stage 報酬は対象外。
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
import * as stageProgressionModule from '../progression/stageProgression.ts';
import * as victoryRewardsModule from '../progression/victoryRewards.ts';
import type { GameScreen } from './gameScreen.ts';
import type { SaveGameState } from '../battle/types.ts';
import { GameSession } from './GameSession.ts';

const FIXTURE_SEED_A = 'fixture-a';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_A_WAVE_COUNT = 3;
const GUARDIAN_SLOT = 0;
const OPERATION_PASSIVE_ID = 'df_guardian_op_block_rate_up';
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

function livingEnemyCount(engine: BattleEngine): number {
  return engine.getSnapshot().enemies.filter((enemy) => enemy.hp > 0).length;
}

function assertLivingEnemies(engine: BattleEngine): void {
  expect(livingEnemyCount(engine)).toBeGreaterThan(0);
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

function reachVictoryAfterKill(engine: BattleEngine): void {
  waitForEngaged(engine);
  killAllEnemies(engine);
  for (let i = 0; i < 90_000; i++) {
    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    if (snap.phase === 'victory') return;
    if (snap.phase === 'defeat') {
      throw new Error('battle ended in defeat instead of victory');
    }
  }
  throw new Error('victory phase not reached');
}

function expandWaveExpectations(
  waves: ProblemSeriesOperationStartSnapshot['waves'],
  waveIndex: number,
): { classIds: string[]; moduleIds: string[] } {
  const specs = expandEnemyGroupsList([...waves[waveIndex]!.enemyGroups]);
  expect(specs.length).toBeGreaterThan(0);
  return {
    classIds: specs.map((spec) => spec.classId),
    moduleIds: specs.map((spec) => {
      expect(spec.selectedCombatModuleId).toBeDefined();
      return spec.selectedCombatModuleId!;
    }),
  };
}

function livingEnemyClassIds(engine: BattleEngine): string[] {
  return engine
    .getSnapshot()
    .enemies.filter((enemy) => enemy.hp > 0)
    .map((enemy) => enemy.classId)
    .filter((id): id is string => id !== undefined);
}

function livingEnemyBasicSkillIds(engine: BattleEngine): string[] {
  return engine
    .getSnapshot()
    .enemies.filter((enemy) => enemy.hp > 0)
    .map((enemy) => {
      expect(enemy.basicSkillId).toBeDefined();
      return enemy.basicSkillId!;
    });
}

function assertSaveDoesNotEmbedProblemSeries(save: SaveGameState): void {
  const serialized = JSON.stringify(save);
  expect(serialized).not.toContain(FIXTURE_SEED_A);
  expect(serialized).not.toContain('r12m_series_a');
  expect(serialized).not.toContain(GENERATOR_VERSION);
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

function advanceThroughWavePrep(
  session: GameSession,
  engine: BattleEngine,
  prepared: ProblemSeriesOperationStartSnapshot,
  completedWaveIndex: number,
): void {
  reachAwaitingNextWaveAfterKill(engine);
  expect(session.getCurrentScreen()).toBe('wavePrep');
  expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
  expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
  expect(session.getCurrentScreen()).toBe('battle');

  const nextWaveIndex = completedWaveIndex + 1;
  expect(engine.getSnapshot().waveIndex).toBe(nextWaveIndex);
  assertLivingEnemies(engine);

  const expected = expandWaveExpectations(prepared.waves, nextWaveIndex);
  expect(livingEnemyClassIds(engine)).toEqual(expected.classIds);
  expect(livingEnemyBasicSkillIds(engine)).toEqual(expected.moduleIds);
}

describe('GameSession problem series final victory teardown (R12m 1C unit13)', () => {
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

  it('final wave victory via BattleEngine clears snapshot and operation state without fixed-stage rewards', () => {
    context = bootProblemSeriesOperation();
    const { session, prepared, resolveSpy, createSpy } = context;
    const engine = getEngine(session);

    const computeExpSpy = vi.spyOn(stageProgressionModule, 'computeStageExpReward');
    const applyRewardsSpy = vi.spyOn(victoryRewardsModule, 'applyVictoryRewards');

    expect(prepared.seriesId).toBe('r12m_series_a');
    expect(prepared.waves).toHaveLength(SERIES_A_WAVE_COUNT);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(session.getOperationState()?.isActive).toBe(true);
    expect(session.hasOperationCheckpoint()).toBe(true);
    expect(getEngineProvider(engine)!()).toBe(prepared.waves);

    assertLivingEnemies(engine);
    const wave0Expected = expandWaveExpectations(prepared.waves, 0);
    expect(livingEnemyClassIds(engine)).toEqual(wave0Expected.classIds);
    expect(engine.getSnapshot().waveIndex).toBe(0);

    advanceThroughWavePrep(session, engine, prepared, 0);

    reachAwaitingNextWaveAfterKill(engine);
    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(session.tryAcquireOperationPassive(GUARDIAN_SLOT, OPERATION_PASSIVE_ID)).toBe(
      true,
    );
    expect(session.getOperationAcquiredPassiveIds(GUARDIAN_SLOT)).toEqual([
      OPERATION_PASSIVE_ID,
    ]);
    expect(session.getOperationUnspentResource()).toBeGreaterThan(0);
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
    expect(session.getCurrentScreen()).toBe('battle');

    expect(engine.getSnapshot().waveIndex).toBe(2);
    assertLivingEnemies(engine);
    const wave2Expected = expandWaveExpectations(prepared.waves, 2);
    expect(livingEnemyClassIds(engine)).toEqual(wave2Expected.classIds);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);

    const saveBeforeVictory = structuredClone(session.getSaveState());
    expect(saveBeforeVictory).toEqual(structuredClone(saveBeforeVictory));

    reachVictoryAfterKill(engine);

    expect(engine.getSnapshot().phase).toBe('victory');
    expect(engine.getSnapshot().waveIndex).toBe(2);

    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(getEngineProvider(engine)!()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(session.getOperationAcquiredPassiveIds(GUARDIAN_SLOT)).toEqual([]);
    expect(session.getOperationUnspentResource()).toBe(0);
    expect(session.getOperationPassiveCandidates(GUARDIAN_SLOT)).toEqual([]);

    expect(session.getOperationResult()).toBeNull();
    expect(session.shouldShowVictoryResult()).toBe(false);

    expect(session.getSaveState()).toEqual(saveBeforeVictory);
    assertSaveDoesNotEmbedProblemSeries(session.getSaveState());

    expect(computeExpSpy).not.toHaveBeenCalled();
    expect(applyRewardsSpy).not.toHaveBeenCalled();
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });
});
