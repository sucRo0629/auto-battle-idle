/**
 * R7b: GameSession simulation speed (1 / 2 / 4x) via tick gate.
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
  reachAwaitingNextWave,
  TICK_DT,
  waitForEngaged,
} from '../battle/test/battleFieldSpec.harness.ts';

const TICK_MS = 1000 / 60;

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

function bootVerifySession(): GameSession {
  setVerifyModeEnabled(true);
  setDebugLoopStageId('1');
  setDebugLoopWaveIndex(null);
  const session = createSession();
  session.start();
  return session;
}

function triggerDefeat(session: GameSession, survivingIndices: number[] = []): void {
  getEngine(session).applyDefeatTransition(survivingIndices);
}

describe('GameSession simulation speed (R7b)', () => {
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

  it('1. new session defaults to 1x speed', () => {
    session = bootVerifySession();
    expect(session.getSimulationSpeed()).toBe(1);
  });

  it('2. 2x speed passes doubled delta to engine', () => {
    session = bootVerifySession();
    const engine = getEngine(session);
    waitForEngaged(engine);

    expect(session.trySetSimulationSpeed(2)).toBe(true);
    const before = engine.getBattleTimeSec();
    session.tick(TICK_DT, TICK_MS);
    expect(engine.getBattleTimeSec() - before).toBeCloseTo(TICK_DT * 2, 8);
  });

  it('3. 4x speed passes quadrupled delta to engine', () => {
    session = bootVerifySession();
    const engine = getEngine(session);
    waitForEngaged(engine);

    expect(session.trySetSimulationSpeed(4)).toBe(true);
    const before = engine.getBattleTimeSec();
    session.tick(TICK_DT, TICK_MS);
    expect(engine.getBattleTimeSec() - before).toBeCloseTo(TICK_DT * 4, 8);
  });

  it('4. speed can return to 1x', () => {
    session = bootVerifySession();
    const engine = getEngine(session);
    waitForEngaged(engine);

    expect(session.trySetSimulationSpeed(4)).toBe(true);
    session.tick(TICK_DT, TICK_MS);
    const after4x = engine.getBattleTimeSec();

    expect(session.trySetSimulationSpeed(1)).toBe(true);
    expect(session.getSimulationSpeed()).toBe(1);
    session.tick(TICK_DT, TICK_MS);
    expect(engine.getBattleTimeSec() - after4x).toBeCloseTo(TICK_DT, 8);
  });

  it('5. pause blocks simulation regardless of speed', () => {
    session = bootVerifySession();
    const engine = getEngine(session);
    const view = getView(session);
    waitForEngaged(engine);

    expect(session.trySetSimulationSpeed(4)).toBe(true);
    const before = engine.getBattleTimeSec();
    view.setBattlePaused(true);
    for (let i = 0; i < 120; i++) {
      session.tick(TICK_DT, TICK_MS);
    }
    expect(engine.getBattleTimeSec()).toBe(before);
  });

  it('6. rejects invalid simulation speeds', () => {
    session = bootVerifySession();
    expect(session.getSimulationSpeed()).toBe(1);

    expect(session.trySetSimulationSpeed(3)).toBe(false);
    expect(session.trySetSimulationSpeed(0)).toBe(false);
    expect(session.trySetSimulationSpeed(8)).toBe(false);
    expect(session.getSimulationSpeed()).toBe(1);
  });

  it('7. cycleSimulationSpeed rotates 1 → 2 → 4 → 1', () => {
    session = bootVerifySession();
    expect(session.getSimulationSpeed()).toBe(1);

    expect(session.cycleSimulationSpeed()).toBe(2);
    expect(session.getSimulationSpeed()).toBe(2);

    expect(session.cycleSimulationSpeed()).toBe(4);
    expect(session.getSimulationSpeed()).toBe(4);

    expect(session.cycleSimulationSpeed()).toBe(1);
    expect(session.getSimulationSpeed()).toBe(1);
  });

  it('8. speed persists across wave switch and retry', () => {
    session = bootVerifySession();
    const engine = getEngine(session);
    expect(session.trySetSimulationSpeed(4)).toBe(true);

    reachAwaitingNextWave(engine);
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
    expect(session.getSimulationSpeed()).toBe(4);

    const beforeWave1 = engine.getBattleTimeSec();
    session.tick(TICK_DT, TICK_MS);
    expect(engine.getBattleTimeSec() - beforeWave1).toBeCloseTo(TICK_DT * 4, 8);

    triggerDefeat(session);
    expect(session.retryCurrentWaveFromCheckpoint()).toBe(true);
    expect(session.getSimulationSpeed()).toBe(4);

    waitForEngaged(engine);
    const beforeRetry = engine.getBattleTimeSec();
    session.tick(TICK_DT, TICK_MS);
    expect(engine.getBattleTimeSec() - beforeRetry).toBeCloseTo(TICK_DT * 4, 8);
  });
});
