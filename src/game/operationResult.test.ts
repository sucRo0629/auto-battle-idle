/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import {
  asBattleEngineInternals,
  killAllEnemies,
  reachAwaitingNextWave,
  TICK_DT,
  waitForEngaged,
} from '../battle/test/battleFieldSpec.harness.ts';
import { setDebugLoopStageId, setDebugLoopWaveIndex } from '../dev/debugLoopStage.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { GameSession } from './GameSession.ts';

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

function triggerVictory(session: GameSession, survivingIndices: number[] = [0, 1, 2, 3]): void {
  getEngine(session).applyVictoryTransition(survivingIndices);
}

function triggerDefeat(session: GameSession, survivingIndices: number[] = []): void {
  getEngine(session).applyDefeatTransition(survivingIndices);
}

function sortieToStage(session: GameSession, stageId: string): void {
  const host = (session as unknown as {
    handleStageSortie: (id: string) => void;
  }).handleStageSortie.bind(session);
  host(stageId);
}

function bootVerifyStage1(session: GameSession): void {
  session.start();
}

describe('GameSession operationResult (R6h)', () => {
  let session: GameSession | null = null;

  beforeEach(() => {
    localStorage.clear();
    mockCanvas2d();
    setVerifyModeEnabled(true);
    setDebugLoopStageId('1');
    setDebugLoopWaveIndex(null);
  });

  afterEach(() => {
    session?.destroy();
    session = null;
    document.body.replaceChildren();
  });

  it('1. intermediate wave clear does not finalize operationResult', () => {
    session = createSession();
    bootVerifyStage1(session);
    reachAwaitingNextWave(getEngine(session));
    expect(session.getOperationResult()).toBeNull();
  });

  it('2. final wave victory finalizes victory result', () => {
    session = createSession();
    bootVerifyStage1(session);
    waitForEngaged(getEngine(session));
    killAllEnemies(getEngine(session));
    for (let i = 0; i < 90_000; i++) {
      getEngine(session).tick(TICK_DT);
      if (getEngine(session).getSnapshot().phase === 'victory') break;
    }
    triggerVictory(session);
    expect(session.getOperationResult()).toEqual({
      stageId: '1',
      outcome: 'victory',
      reachedWaveIndex: 1,
    });
  });

  it('3. defeat finalizes defeat result', () => {
    session = createSession();
    bootVerifyStage1(session);
    triggerDefeat(session);
    expect(session.getOperationResult()).toEqual({
      stageId: '1',
      outcome: 'defeat',
      reachedWaveIndex: 0,
    });
  });

  it('4. keeps stageId and reachedWaveIndex on defeat at later wave', () => {
    setDebugLoopWaveIndex(1);
    session = createSession();
    bootVerifyStage1(session);
    expect(session.getOperationWaveIndex()).toBe(1);
    triggerDefeat(session);
    expect(session.getOperationResult()).toEqual({
      stageId: '1',
      outcome: 'defeat',
      reachedWaveIndex: 1,
    });
  });

  it('5. duplicate battleEnd notification does not double-update result', () => {
    session = createSession();
    bootVerifyStage1(session);
    triggerDefeat(session);
    const first = session.getOperationResult();
    triggerDefeat(session);
    expect(session.getOperationResult()).toEqual(first);
    triggerVictory(session);
    expect(session.getOperationResult()).toEqual(first);
  });

  it('6. new operation start clears previous operationResult', () => {
    setVerifyModeEnabled(false);
    session = createSession();
    sortieToStage(session, '1');
    session.start();
    triggerDefeat(session);
    expect(session.getOperationResult()?.outcome).toBe('defeat');

    sortieToStage(session, '2');
    expect(session.getOperationResult()).toBeNull();
    expect(session.getOperationState()?.stageId).toBe('2');
  });

  it('returns defensive clone from getter', () => {
    session = createSession();
    bootVerifyStage1(session);
    triggerDefeat(session);
    const first = session.getOperationResult();
    const second = session.getOperationResult();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    if (first) {
      (first as { reachedWaveIndex: number }).reachedWaveIndex = 99;
    }
    expect(session.getOperationResult()?.reachedWaveIndex).toBe(0);
  });

  it('does not persist operationResult in save', () => {
    setVerifyModeEnabled(false);
    session = createSession();
    sortieToStage(session, '1');
    triggerDefeat(session);
    const raw = JSON.stringify(session.getSaveState());
    expect(raw).not.toContain('operationResult');
  });

  it('preserves checkpoint and OperationState on defeat after result finalize', () => {
    session = createSession();
    bootVerifyStage1(session);
    triggerDefeat(session);
    expect(session.getOperationResult()?.outcome).toBe('defeat');
    expect(session.hasActiveOperation()).toBe(false);
    expect(session.hasOperationCheckpoint()).toBe(true);
    expect(session.getOperationState()?.isDefeated).toBe(true);
  });

  it('clears OperationState but keeps operationResult on final victory', () => {
    session = createSession();
    bootVerifyStage1(session);
    waitForEngaged(getEngine(session));
    killAllEnemies(getEngine(session));
    triggerVictory(session);
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationResult()?.outcome).toBe('victory');
    expect(asBattleEngineInternals(getEngine(session)).players.length).toBeGreaterThan(0);
  });
});
