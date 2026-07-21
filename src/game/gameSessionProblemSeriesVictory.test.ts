/**
 * @vitest-environment happy-dom
 *
 * R12m 1C 作業単位13 / 14D4: 問題系列の最終 Wave 勝利時に作戦を終了し、
 * snapshot と作戦内状態を破棄する production 経路のテスト。
 * 14D4: handleVictory の active OperationState.source gate。
 * 正式な結果画面・Player 入口は対象外（fixedStage 回帰除く）。
 *
 * R12m Player 作業単位2O2: 同 seed 再準備 GameSession API。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { expandEnemyGroupsList } from '../battle/enemyGroupSpawn.ts';
import * as operationStartSnapshotModule from '../battle/problemSeries/operationStartSnapshot.ts';
import type { ProblemSeriesOperationStartSnapshot } from '../battle/problemSeries/operationStartSnapshot.ts';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import * as victoryResultModule from '../battle/problemSeries/victoryResult.ts';
import type { ResolvedWavesCombatInput } from '../battle/resolvedWaveCombatInput.ts';
import {
  killAllEnemies,
  TICK_DT,
  waitForEngaged,
} from '../battle/test/battleFieldSpec.harness.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import * as stageProgressionModule from '../progression/stageProgression.ts';
import * as victoryRewardsModule from '../progression/victoryRewards.ts';
import {
  expectVictoryOverlayVisuallyHidden,
  expectVictoryOverlayVisuallyVisible,
} from '../ui/battleResultOverlayTestUtils.ts';
import type { GameScreen } from './gameScreen.ts';
import type { SaveGameState } from '../battle/types.ts';
import { GameSession } from './GameSession.ts';
import { StageSelectionScreenHost } from './StageSelectionScreenHost.ts';

const FIXTURE_SEED_A = 'fixture-a';
const GENERATOR_VERSION = 'r12m-v1';
const SERIES_A_WAVE_COUNT = 3;
const FIXED_STAGE_ID = '1';
const GUARDIAN_SLOT = 0;
const OPERATION_PASSIVE_ID = 'df_guardian_op_block_rate_up';
const PROBLEM_SERIES_SOURCE = { kind: 'problemSeries' } as const;
const FIXED_STAGE_SOURCE = { kind: 'fixedStage', stageId: FIXED_STAGE_ID } as const;

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

function clearHeldSnapshotOnly(session: GameSession): void {
  (
    session as unknown as {
      problemSeriesOperationStartSnapshot: null;
    }
  ).problemSeriesOperationStartSnapshot = null;
}

function invokeHandleVictory(
  session: GameSession,
  survivingPartyIndices: number[] = [0, 1, 2, 3],
): void {
  (
    session as unknown as {
      handleVictory: (survivingPartyIndices: number[]) => void;
    }
  ).handleVictory(survivingPartyIndices);
}

function getFixedStageFinalWaveIndex(stageId: string): number {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const stage = loaded.data.stages.find((entry) => entry.id === stageId);
  expect(stage).toBeDefined();
  const waveCount = stage!.waves.length;
  expect(waveCount).not.toBe(SERIES_A_WAVE_COUNT);
  return Math.max(0, waveCount - 1);
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

function reachFixedStageVictoryThroughEngine(
  session: GameSession,
  engine: BattleEngine,
): void {
  waitForEngaged(engine);
  for (let attempt = 0; attempt < 8; attempt++) {
    killAllEnemies(engine);
    for (let i = 0; i < 90_000; i++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (snap.phase === 'victory') return;
      if (snap.phase === 'defeat') {
        throw new Error('battle ended in defeat instead of victory');
      }
      if (snap.awaitingNextWave) break;
    }
    if (engine.getSnapshot().phase === 'victory') return;
    if (session.getCurrentScreen() === 'wavePrep') {
      expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
      expect(session.getCurrentScreen()).toBe('battle');
      continue;
    }
    throw new Error('fixed-stage victory not reached after wave clear');
  }
  throw new Error('fixed-stage victory loop exhausted');
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

function getGameAppContainer(): HTMLElement {
  const container = document.body.querySelector('.game-app');
  if (!container) {
    throw new Error('game-app container not found');
  }
  return container as HTMLElement;
}

function reachProblemSeriesFinalVictory(): {
  session: GameSession;
  oldSnapshot: ProblemSeriesOperationStartSnapshot;
  engine: BattleEngine;
  resolveSpy: ReturnType<typeof vi.spyOn>;
  createSpy: ReturnType<typeof vi.spyOn>;
} {
  const booted = bootProblemSeriesOperation();
  const { session, prepared, resolveSpy, createSpy } = booted;
  const engine = getEngine(session);

  advanceThroughWavePrep(session, engine, prepared, 0);

  reachAwaitingNextWaveAfterKill(engine);
  expect(session.confirmWavePrepAndStartNextWave()).toBe(true);

  reachVictoryAfterKill(engine);

  expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
  expect(session.getOperationState()).toBeNull();
  expect(session.getOperationCheckpoint()).toBeNull();
  expect(session.getProblemSeriesVictoryResult()).not.toBeNull();
  expect(session.shouldShowProblemSeriesVictoryResult()).toBe(true);
  expect(session.getCurrentScreen()).toBe('battle');

  resolveSpy.mockClear();
  createSpy.mockClear();

  return {
    session,
    oldSnapshot: prepared,
    engine,
    resolveSpy,
    createSpy,
  };
}

interface ProblemSeriesOperationContext {
  session: GameSession;
  prepared: ProblemSeriesOperationStartSnapshot;
  resolveSpy: ReturnType<typeof vi.spyOn>;
  createSpy: ReturnType<typeof vi.spyOn>;
}

function getStageSelectionHost(session: GameSession): StageSelectionScreenHost {
  return (session as unknown as { stageSelectionHost: StageSelectionScreenHost })
    .stageSelectionHost;
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

describe('GameSession problem series final victory teardown (R12m 1C unit13 / 14D4)', () => {
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
    const victoryResultSpy = vi.spyOn(
      victoryResultModule,
      'createProblemSeriesVictoryResult',
    );

    expect(prepared.seriesId).toBe('r12m_series_a');
    expect(prepared.waves).toHaveLength(SERIES_A_WAVE_COUNT);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(session.getOperationState()?.isActive).toBe(true);
    expect(session.hasOperationCheckpoint()).toBe(true);
    expect(getEngineProvider(engine)!()).toBe(prepared.waves);
    expect(session.getProblemSeriesVictoryResult()).toBeNull();
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(false);
    expect(session.getProblemSeriesVictoryResultForDisplay()).toBeNull();
    expect(session.returnToStageSelectAfterProblemSeriesVictory()).toBe(false);
    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(session.getOperationState()?.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(session.getOperationCheckpoint()?.source).toStrictEqual(PROBLEM_SERIES_SOURCE);

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

    expect(session.getOperationState()?.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(session.getOperationState()?.source).not.toHaveProperty('stageId');
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(engine.getSnapshot().waveIndex).toBe(2);
    assertLivingEnemies(engine);

    reachVictoryAfterKill(engine);

    expect(engine.getSnapshot().phase).toBe('victory');
    expect(engine.getSnapshot().waveIndex).toBe(2);

    const resultFirst = session.getProblemSeriesVictoryResult();
    const resultSecond = session.getProblemSeriesVictoryResult();
    const displayFirst = session.getProblemSeriesVictoryResultForDisplay();
    const displaySecond = session.getProblemSeriesVictoryResultForDisplay();
    expect(resultFirst).not.toBeNull();
    expect(resultSecond).not.toBeNull();
    expect(displayFirst).not.toBeNull();
    expect(displaySecond).not.toBeNull();
    expect(resultFirst).toEqual(resultSecond);
    expect(resultFirst).not.toBe(resultSecond);
    expect(displayFirst).toEqual(displaySecond);
    expect(displayFirst).not.toBe(displaySecond);
    expect(resultFirst).toEqual({
      outcome: 'victory',
      seed: prepared.seed,
      generatorVersion: prepared.generatorVersion,
      seriesId: prepared.seriesId,
      reachedWaveIndex: 2,
    });
    expect(displayFirst).toEqual({
      outcome: 'victory',
      seed: prepared.seed,
      generatorVersion: prepared.generatorVersion,
      seriesId: prepared.seriesId,
      reachedWaveIndex: 2,
    });
    expect(displayFirst).not.toHaveProperty('stageId');
    (resultFirst as Record<string, unknown>).seed = 'tampered-seed';
    (displayFirst as Record<string, unknown>).seriesId = 'tampered-series';
    const resultAfterTamper = session.getProblemSeriesVictoryResult();
    const displayAfterTamper = session.getProblemSeriesVictoryResultForDisplay();
    expect(resultAfterTamper).not.toBeNull();
    expect(displayAfterTamper).not.toBeNull();
    expect(resultAfterTamper).toEqual({
      outcome: 'victory',
      seed: prepared.seed,
      generatorVersion: prepared.generatorVersion,
      seriesId: prepared.seriesId,
      reachedWaveIndex: 2,
    });
    expect(displayAfterTamper).toEqual({
      outcome: 'victory',
      seed: prepared.seed,
      generatorVersion: prepared.generatorVersion,
      seriesId: prepared.seriesId,
      reachedWaveIndex: 2,
    });

    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(getEngineProvider(engine)!()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(session.getOperationAcquiredPassiveIds(GUARDIAN_SLOT)).toEqual([]);
    expect(session.getOperationUnspentResource()).toBe(0);
    expect(session.getOperationPassiveCandidates(GUARDIAN_SLOT)).toEqual([]);

    expect(session.getOperationResult()).toBeNull();
    expect(session.shouldShowVictoryResult()).toBe(false);
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(true);

    expect(session.getSaveState()).toEqual(saveBeforeVictory);
    assertSaveDoesNotEmbedProblemSeries(session.getSaveState());

    expect(victoryResultSpy).toHaveBeenCalledTimes(1);
    expect(computeExpSpy).not.toHaveBeenCalled();
    expect(applyRewardsSpy).not.toHaveBeenCalled();
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();

    victoryResultSpy.mockClear();
    const saveBeforeReturn = structuredClone(session.getSaveState());
    expect(session.returnToStageSelectAfterProblemSeriesVictory()).toBe(true);
    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(session.getProblemSeriesVictoryResult()).toBeNull();
    expect(session.getProblemSeriesVictoryResultForDisplay()).toBeNull();
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(false);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(session.getSaveState()).toEqual(saveBeforeReturn);
    assertSaveDoesNotEmbedProblemSeries(session.getSaveState());
    expect(victoryResultSpy).not.toHaveBeenCalled();
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(session.returnToStageSelectAfterProblemSeriesVictory()).toBe(false);
  });

  it('fixedStage source with retained snapshot uses fixed-stage victory path and OperationResult', () => {
    const fixedStageFinalWaveIndex = getFixedStageFinalWaveIndex(FIXED_STAGE_ID);
    expect(fixedStageFinalWaveIndex).not.toBe(SERIES_A_WAVE_COUNT - 1);

    const session = createSession();
    const engine = getEngine(session);

    const computeExpSpy = vi.spyOn(stageProgressionModule, 'computeStageExpReward');
    const applyRewardsSpy = vi.spyOn(victoryRewardsModule, 'applyVictoryRewards');
    const resolveSpy = vi.spyOn(seedResolveModule, 'resolveProblemSeriesFromSeed');
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);
    expect(prepared).not.toBeNull();
    expect(prepared!.waves).toHaveLength(SERIES_A_WAVE_COUNT);
    expect(session.getProblemSeriesOperationStartSnapshot()).not.toBeNull();
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);

    resolveSpy.mockClear();
    createSpy.mockClear();

    sortieToStage(session, FIXED_STAGE_ID);

    expect(session.getOperationState()?.source).toStrictEqual(FIXED_STAGE_SOURCE);
    expect(session.getOperationState()?.source).not.toEqual(PROBLEM_SERIES_SOURCE);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(session.hasActiveOperation()).toBe(true);

    session.start();
    engine.restartBattleAtWave(0);
    setGameScreen(session, 'battle');

    expect(engine.getSnapshot().waveCount).not.toBe(SERIES_A_WAVE_COUNT);
    assertLivingEnemies(engine);

    reachFixedStageVictoryThroughEngine(session, engine);

    expect(engine.getSnapshot().phase).toBe('victory');
    expect(engine.getSnapshot().waveIndex).toBe(fixedStageFinalWaveIndex);
    expect(engine.getSnapshot().waveIndex).not.toBe(SERIES_A_WAVE_COUNT - 1);

    expect(session.getProblemSeriesVictoryResult()).toBeNull();
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(false);
    expect(session.getProblemSeriesVictoryResultForDisplay()).toBeNull();
    expect(session.returnToStageSelectAfterProblemSeriesVictory()).toBe(false);
    expect(session.getOperationResult()).toEqual({
      stageId: FIXED_STAGE_ID,
      outcome: 'victory',
      reachedWaveIndex: fixedStageFinalWaveIndex,
    });
    expect(session.getOperationResult()?.reachedWaveIndex).not.toBe(SERIES_A_WAVE_COUNT - 1);
    expect(session.shouldShowVictoryResult()).toBe(true);

    expect(computeExpSpy).toHaveBeenCalled();
    expect(applyRewardsSpy).toHaveBeenCalled();
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();

    session.destroy();
  });

  it('verify mode keeps problem series result hidden even when a victory result is held', () => {
    context = bootProblemSeriesOperation();
    const { session, prepared } = context;
    const engine = getEngine(session);

    advanceThroughWavePrep(session, engine, prepared, 0);
    reachAwaitingNextWaveAfterKill(engine);
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
    expect(session.getCurrentScreen()).toBe('battle');

    reachVictoryAfterKill(engine);

    expect(session.getProblemSeriesVictoryResult()).toEqual({
      outcome: 'victory',
      seed: prepared.seed,
      generatorVersion: prepared.generatorVersion,
      seriesId: prepared.seriesId,
      reachedWaveIndex: 2,
    });
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(true);

    session.setVerifyMode(true);

    expect(session.isVerifyMode()).toBe(true);
    expect(session.getProblemSeriesVictoryResult()).toEqual({
      outcome: 'victory',
      seed: prepared.seed,
      generatorVersion: prepared.generatorVersion,
      seriesId: prepared.seriesId,
      reachedWaveIndex: 2,
    });
    expect(session.getProblemSeriesVictoryResultForDisplay()).toEqual({
      outcome: 'victory',
      seed: prepared.seed,
      generatorVersion: prepared.generatorVersion,
      seriesId: prepared.seriesId,
      reachedWaveIndex: 2,
    });
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(false);
    expect(session.returnToStageSelectAfterProblemSeriesVictory()).toBe(false);
  });

  it('problemSeries source with missing snapshot throws on handleVictory without fixed-stage fallback', () => {
    const session = createSession();

    const computeExpSpy = vi.spyOn(stageProgressionModule, 'computeStageExpReward');
    const applyRewardsSpy = vi.spyOn(victoryRewardsModule, 'applyVictoryRewards');

    const prepared = session.beginProblemSeriesOperation(FIXTURE_SEED_A);
    expect(prepared).not.toBeNull();
    expect(session.getOperationState()?.source).toStrictEqual(PROBLEM_SERIES_SOURCE);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);

    clearHeldSnapshotOnly(session);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()?.source).toStrictEqual(PROBLEM_SERIES_SOURCE);

    expect(() => invokeHandleVictory(session)).toThrow(/problemSeries/i);
    expect(() => invokeHandleVictory(session)).toThrow(/snapshot/i);
    expect(() => invokeHandleVictory(session)).toThrow(/欠落/);

    expect(session.getProblemSeriesVictoryResult()).toBeNull();
    expect(session.getOperationResult()).toBeNull();
    expect(computeExpSpy).not.toHaveBeenCalled();
    expect(applyRewardsSpy).not.toHaveBeenCalled();

    session.destroy();
  });

  it('OperationState absent with retained snapshot uses fixed-stage victory path, not problem series', () => {
    const session = createSession();
    const computeExpSpy = vi.spyOn(stageProgressionModule, 'computeStageExpReward');
    const applyRewardsSpy = vi.spyOn(victoryRewardsModule, 'applyVictoryRewards');

    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);
    expect(prepared).not.toBeNull();
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(session.getOperationState()).toBeNull();

    session.start();
    invokeHandleVictory(session);

    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(session.getOperationResult()).toBeNull();
    expect(session.shouldShowVictoryResult()).toBe(false);
    expect(computeExpSpy).toHaveBeenCalled();
    expect(applyRewardsSpy).toHaveBeenCalled();

    session.destroy();
  });
});

describe('GameSession prepareSameSeedProblemSeriesFromVictory (R12m Player unit2O2)', () => {
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

  it('production final victory → same-seed re-prepare shows 3-wave overview without operation state', () => {
    const victoryResultSpy = vi.spyOn(
      victoryResultModule,
      'createProblemSeriesVictoryResult',
    );

    const reached = reachProblemSeriesFinalVictory();
    session = reached.session;
    const { oldSnapshot, engine, resolveSpy, createSpy } = reached;

    const restartSpy = vi.spyOn(engine, 'restartBattle');
    const restartAtWaveSpy = vi.spyOn(engine, 'restartBattleAtWave');
    const spawnWaveEnemiesSpy = vi.spyOn(
      engine as unknown as { spawnWaveEnemies: () => void },
      'spawnWaveEnemies',
    );

    const waveIndexBefore = engine.getSnapshot().waveIndex;
    const waveCountBefore = engine.getSnapshot().waveCount;
    const saveBefore = structuredClone(session.getSaveState());
    const appContainer = getGameAppContainer();

    expectVictoryOverlayVisuallyVisible(appContainer);
    expect(session.view.isBattlePaused()).toBe(true);

    const victoryFactoryCallsBefore = victoryResultSpy.mock.calls.length;

    const prepared = session.prepareSameSeedProblemSeriesFromVictory();

    expect(prepared).toBe(true);
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(victoryResultSpy.mock.calls.length).toBe(victoryFactoryCallsBefore);

    const newSnapshot = session.getProblemSeriesOperationStartSnapshot();
    expect(newSnapshot).not.toBeNull();
    expect(newSnapshot).not.toBe(oldSnapshot);
    expect(newSnapshot!.seed).toBe(oldSnapshot.seed);
    expect(newSnapshot!.generatorVersion).toBe(oldSnapshot.generatorVersion);
    expect(newSnapshot!.seriesId).toBe(oldSnapshot.seriesId);
    expect(newSnapshot!.waves).toHaveLength(3);
    expect(newSnapshot!.waves).toEqual(oldSnapshot.waves);

    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(session.hasActiveOperation()).toBe(false);
    expect(session.getOperationUnspentResource()).toBe(0);
    expect(session.getOperationAcquiredPassiveIds(GUARDIAN_SLOT)).toEqual([]);

    expect(engine.getSnapshot().waveIndex).toBe(waveIndexBefore);
    expect(engine.getSnapshot().waveCount).toBe(waveCountBefore);
    expect(restartSpy).not.toHaveBeenCalled();
    expect(restartAtWaveSpy).not.toHaveBeenCalled();
    expect(spawnWaveEnemiesSpy).not.toHaveBeenCalled();

    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(session.getProblemSeriesVictoryResult()).toBeNull();
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(false);
    expectVictoryOverlayVisuallyHidden(appContainer);

    expect(appContainer.querySelector('.game-shell__formation')?.hidden).toBe(true);
    expect(appContainer.querySelectorAll('.problem-series-overview-panel')).toHaveLength(1);
    expect(appContainer.querySelectorAll('.problem-series-overview-wave')).toHaveLength(3);

    const seedEl = appContainer.querySelector('.problem-series-overview-seed');
    expect(seedEl).not.toBeNull();
    expect(seedEl?.textContent).toContain(oldSnapshot.seed);

    expect(session.getSaveState()).toEqual(saveBefore);
    assertSaveDoesNotEmbedProblemSeries(session.getSaveState());
  });

  it('overview display alone does not create OperationState, checkpoint, or Wave 0 spawn', () => {
    const reached = reachProblemSeriesFinalVictory();
    session = reached.session;
    const { engine } = reached;

    const spawnWaveEnemiesSpy = vi.spyOn(
      engine as unknown as { spawnWaveEnemies: () => void },
      'spawnWaveEnemies',
    );

    expect(session.prepareSameSeedProblemSeriesFromVictory()).toBe(true);

    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(session.hasActiveOperation()).toBe(false);
    expect(spawnWaveEnemiesSpy).not.toHaveBeenCalled();
    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(session.getProblemSeriesOperationStartSnapshot()).not.toBeNull();
  });

  it('returns false without mutation when problem series victory result is absent', () => {
    session = createSession();
    const resolveSpy = vi.spyOn(seedResolveModule, 'resolveProblemSeriesFromSeed');
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );
    const saveBefore = structuredClone(session.getSaveState());

    expect(session.getProblemSeriesVictoryResult()).toBeNull();
    expect(session.prepareSameSeedProblemSeriesFromVictory()).toBe(false);

    expect(session.getProblemSeriesVictoryResult()).toBeNull();
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(session.getSaveState()).toEqual(saveBefore);
  });

  it('returns false and keeps fixed-stage victory result when only fixed Stage result exists', () => {
    const fixedStageFinalWaveIndex = getFixedStageFinalWaveIndex(FIXED_STAGE_ID);
    session = createSession();
    const engine = getEngine(session);

    const resolveSpy = vi.spyOn(seedResolveModule, 'resolveProblemSeriesFromSeed');
    const createSpy = vi.spyOn(
      operationStartSnapshotModule,
      'createProblemSeriesOperationStartSnapshot',
    );

    sortieToStage(session, FIXED_STAGE_ID);
    session.start();
    engine.restartBattleAtWave(0);
    setGameScreen(session, 'battle');

    reachFixedStageVictoryThroughEngine(session, engine);

    const operationResultBefore = session.getOperationResult();
    expect(operationResultBefore).not.toBeNull();
    expect(session.getProblemSeriesVictoryResult()).toBeNull();
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(false);

    const saveBefore = structuredClone(session.getSaveState());

    expect(session.prepareSameSeedProblemSeriesFromVictory()).toBe(false);

    expect(session.getOperationResult()).toEqual(operationResultBefore);
    expect(session.getProblemSeriesVictoryResult()).toBeNull();
    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getCurrentScreen()).toBe('battle');
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(session.getSaveState()).toEqual(saveBefore);

    session.destroy();
    session = null;
  });

  it('rolls back when showPreparedMainOperationOverview fails', () => {
    const reached = reachProblemSeriesFinalVictory();
    session = reached.session;
    const { oldSnapshot, engine, resolveSpy, createSpy } = reached;

    const restartSpy = vi.spyOn(engine, 'restartBattle');
    const restartAtWaveSpy = vi.spyOn(engine, 'restartBattleAtWave');
    const saveBefore = structuredClone(session.getSaveState());
    const appContainer = getGameAppContainer();
    const victoryResultBefore = session.getProblemSeriesVictoryResult();

    vi.spyOn(
      getStageSelectionHost(session),
      'showPreparedMainOperationOverview',
    ).mockReturnValue(false);

    expect(session.prepareSameSeedProblemSeriesFromVictory()).toBe(false);

    expect(session.getProblemSeriesOperationStartSnapshot()).toBeNull();
    expect(session.getProblemSeriesVictoryResult()).toEqual(victoryResultBefore);
    expect(session.shouldShowProblemSeriesVictoryResult()).toBe(true);
    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.view.isBattlePaused()).toBe(true);
    expectVictoryOverlayVisuallyVisible(appContainer);
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(restartSpy).not.toHaveBeenCalled();
    expect(restartAtWaveSpy).not.toHaveBeenCalled();
    expect(session.getSaveState()).toEqual(saveBefore);
    expect(oldSnapshot.seed).toBe(FIXTURE_SEED_A);
  });
});
