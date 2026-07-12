/**
 * R6j: Full operation loop integration — legacy 2-wave stage `1`,
 * wave prep module selection, pause/resume, checkpoint, operationResult.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { setDebugLoopStageId, setDebugLoopWaveIndex } from '../dev/debugLoopStage.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import type { BattleView } from '../ui/BattleView.ts';
import { GameSession } from './GameSession.ts';
import {
  asBattleEngineInternals,
  killAllEnemies,
  reachAwaitingNextWave,
  TICK_DT,
  waitForEngaged,
} from '../battle/test/battleFieldSpec.harness.ts';

const TICK_MS = 1000 / 60;
const WAVE1_ONLY_ENEMY_CLASS = 'enemy_at_hunter';
const WAVE_PREP_MODULE_ID = 'df_guardian_mod_guard_focus';

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
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    })),
    putImageData: vi.fn(),
    canvas: { width: 800, height: 600 },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
}

function createSession(): GameSession {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const container = document.createElement('div');
  document.body.appendChild(container);
  return new GameSession(loaded.data, container);
}

function getEngine(session: GameSession): BattleEngine {
  return (session as unknown as { engine: BattleEngine }).engine;
}

function getView(session: GameSession): BattleView {
  return (session as unknown as { view: BattleView }).view;
}

function tickSession(session: GameSession, frames = 1): void {
  for (let i = 0; i < frames; i++) {
    session.tick(TICK_DT, TICK_MS);
  }
}

function livingEnemyClassIds(engine: BattleEngine): string[] {
  return engine
    .getSnapshot()
    .enemies.filter((enemy) => enemy.hp > 0)
    .map((enemy) => enemy.classId)
    .filter((classId): classId is string => classId !== undefined);
}

function bootVerifyStage1Session(): GameSession {
  setVerifyModeEnabled(true);
  setDebugLoopStageId('1');
  setDebugLoopWaveIndex(null);
  const session = createSession();
  session.start();
  return session;
}

function triggerVictory(session: GameSession, survivingIndices: number[] = [0, 1, 2, 3]): void {
  getEngine(session).applyVictoryTransition(survivingIndices);
}

function captureOperationSnapshot(session: GameSession) {
  return {
    waveIndex: session.getOperationWaveIndex(),
    clearedWaveCount: session.getClearedWaveCount(),
    moduleId: session.getPartySlotCombatModule(0),
    checkpoint: session.getOperationCheckpoint(),
    operationState: session.getOperationState(),
    screen: session.getCurrentScreen(),
    operationResult: session.getOperationResult(),
  };
}

describe('Operation integration (R6j)', () => {
  let session: GameSession | null = null;

  beforeEach(() => {
    localStorage.clear();
    mockCanvas2d();
  });

  afterEach(() => {
    session?.destroy();
    session = null;
    document.body.replaceChildren();
    setVerifyModeEnabled(false);
    setDebugLoopStageId(null);
    setDebugLoopWaveIndex(null);
  });

  it('runs stage 1 from operation start through final victory with wave prep, checkpoint, pause/resume', () => {
    session = bootVerifyStage1Session();
    const engine = getEngine(session);
    const view = getView(session);

    // 1. Operation start + Wave 0 battle
    expect(session.hasOperationCheckpoint()).toBe(true);
    expect(session.getOperationWaveIndex()).toBe(0);
    expect(session.getClearedWaveCount()).toBe(0);
    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.getOperationResult()).toBeNull();

    waitForEngaged(engine);
    const wave0Engaged = engine.getSnapshot();
    expect(wave0Engaged.waveIndex).toBe(0);
    expect(wave0Engaged.engaged).toBe(true);
    expect(livingEnemyClassIds(engine).length).toBeGreaterThan(0);
    expect(livingEnemyClassIds(engine)).not.toContain(WAVE1_ONLY_ENEMY_CLASS);

    // 8. stop / resume during Wave 0 — state must not roll back
    const wave0Paused = captureOperationSnapshot(session);
    const wave0EngineWave = engine.getSnapshot().waveIndex;
    const wave0BattleTime = engine.getBattleTimeSec();
    view.setBattlePaused(true);
    tickSession(session, 600);
    expect(engine.getSnapshot().waveIndex).toBe(wave0EngineWave);
    expect(engine.getBattleTimeSec()).toBe(wave0BattleTime);
    expect(captureOperationSnapshot(session)).toEqual(wave0Paused);
    view.setBattlePaused(false);

    // 2–3. Wave 0 clear → awaitingNextWave (wave prep)
    const awaitingSnap = reachAwaitingNextWave(engine);
    expect(awaitingSnap.awaitingNextWave).toBe(true);
    expect(awaitingSnap.waveIndex).toBe(0);
    expect(session.isAwaitingNextWave()).toBe(true);
    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(session.canEditOperationFormation()).toBe(true);
    expect(session.getClearedWaveCount()).toBe(1);
    expect(session.getOperationResult()).toBeNull();

    const checkpointBeforePrep = session.getOperationCheckpoint()!;
    expect(checkpointBeforePrep.currentWaveIndex).toBe(0);
    expect(checkpointBeforePrep.clearedWaveCount).toBe(0);

    // 7. Wave 1 enemies must not spawn before next wave starts
    expect(livingEnemyClassIds(engine)).not.toContain(WAVE1_ONLY_ENEMY_CLASS);
    expect(engine.getSnapshot().enemies.some((e) => e.classId === WAVE1_ONLY_ENEMY_CLASS)).toBe(
      false,
    );

    // 4–5. Wave prep module selection + confirm updates checkpoint
    expect(session.trySetOperationSlotCombatModule(0, WAVE_PREP_MODULE_ID)).toBe(true);
    expect(session.getPartySlotCombatModule(0)).toBe(WAVE_PREP_MODULE_ID);

    const prepPaused = captureOperationSnapshot(session);
    view.setBattlePaused(true);
    tickSession(session, 120);
    expect(captureOperationSnapshot(session)).toEqual(prepPaused);
    view.setBattlePaused(false);

    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
    expect(session.getCurrentScreen()).toBe('battle');

    const checkpointAfterPrep = session.getOperationCheckpoint()!;
    expect(checkpointAfterPrep.currentWaveIndex).toBe(1);
    expect(checkpointAfterPrep.clearedWaveCount).toBe(1);
    expect(checkpointAfterPrep.combatModuleSelection).toEqual([
      { slotIndex: 0, moduleId: WAVE_PREP_MODULE_ID },
    ]);
    expect(session.getOperationWaveIndex()).toBe(1);
    expect(session.getClearedWaveCount()).toBe(1);

    // 6–7. Wave 1 starts and spawns wave-1 enemies (pause before ticks to avoid auto-clear)
    view.setBattlePaused(true);
    const wave1Start = engine.getSnapshot();
    expect(wave1Start.waveIndex).toBe(1);
    expect(wave1Start.engaged).toBe(false);
    expect(livingEnemyClassIds(engine)).toContain(WAVE1_ONLY_ENEMY_CLASS);

    const guardian = asBattleEngineInternals(engine).players.find(
      (player) => player.partySlotIndex === 0,
    );
    expect(guardian?.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId).toBe(
      WAVE_PREP_MODULE_ID,
    );

    // 8. stop / resume during Wave 1 — wave index, OperationState, selection preserved
    const wave1Paused = captureOperationSnapshot(session);
    const wave1EngineWave = engine.getSnapshot().waveIndex;
    const wave1BattleTime = engine.getBattleTimeSec();
    view.setBattlePaused(true);
    tickSession(session, 600);
    expect(engine.getSnapshot().waveIndex).toBe(wave1EngineWave);
    expect(engine.getBattleTimeSec()).toBe(wave1BattleTime);
    expect(captureOperationSnapshot(session)).toEqual(wave1Paused);
    view.setBattlePaused(false);

    // 9–10. Final wave victory → operationResult at final wave index
    killAllEnemies(engine);
    for (let i = 0; i < 90_000; i++) {
      session.tick(TICK_DT, TICK_MS);
      if (engine.getSnapshot().phase === 'victory') break;
    }
    expect(engine.getSnapshot().phase).toBe('victory');
    expect(engine.getSnapshot().waveIndex).toBe(1);

    triggerVictory(session);
    expect(session.getOperationResult()).toEqual({
      stageId: '1',
      outcome: 'victory',
      reachedWaveIndex: 1,
    });
    expect(session.getOperationState()).toBeNull();
    expect(session.hasActiveOperation()).toBe(false);
  });
});
