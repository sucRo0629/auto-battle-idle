/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { setDebugLoopStageId, setDebugLoopWaveIndex } from '../dev/debugLoopStage.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { OperationState } from './OperationState.ts';
import { GameSession } from './GameSession.ts';
import {
  asBattleEngineInternals,
  reachAwaitingNextWave,
  waitForEngaged,
} from '../battle/test/battleFieldSpec.harness.ts';

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

function sortieToStage(session: GameSession, stageId: string): void {
  const host = (session as unknown as {
    handleStageSortie: (id: string) => void;
  }).handleStageSortie.bind(session);
  host(stageId);
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

function getOperation(session: GameSession): OperationState {
  return (session as unknown as { operationState: OperationState }).operationState;
}

function advanceToWaveTwoCheckpoint(
  session: GameSession,
  moduleId = 'df_guardian_mod_guard_focus',
): ReturnType<GameSession['getOperationCheckpoint']> {
  reachAwaitingNextWave(getEngine(session));
  session.trySetOperationSlotCombatModule(0, moduleId);
  expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
  return session.getOperationCheckpoint();
}

describe('Operation retry (R6i)', () => {
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

  it('1. retry current wave restores checkpoint wave index, party, and modules', () => {
    session = bootVerifySession();
    const moduleId = 'df_guardian_mod_guard_focus';
    const checkpoint = advanceToWaveTwoCheckpoint(session, moduleId)!;
    triggerDefeat(session);

    expect(session.retryCurrentWaveFromCheckpoint()).toBe(true);
    expect(session.getOperationWaveIndex()).toBe(checkpoint.currentWaveIndex);
    expect(session.getClearedWaveCount()).toBe(checkpoint.clearedWaveCount);
    expect(session.getOperationParty()?.[0]?.classId).toBe(
      checkpoint.party[0]?.classId,
    );
    expect(session.getPartySlotCombatModule(0)).toBe(moduleId);
  });

  it('2. retry current wave regenerates battle combatants', () => {
    session = bootVerifySession();
    waitForEngaged(getEngine(session));
    const playersBefore = asBattleEngineInternals(getEngine(session)).players;
    playersBefore[0].hp = 1;

    advanceToWaveTwoCheckpoint(session);
    triggerDefeat(session);

    expect(session.retryCurrentWaveFromCheckpoint()).toBe(true);
    const playersAfter = asBattleEngineInternals(getEngine(session)).players;
    expect(playersAfter).not.toBe(playersBefore);
    expect(playersAfter[0].hp).toBe(playersAfter[0].maxHp);
    expect(getEngine(session).getSnapshot().waveIndex).toBe(1);
  });

  it('3. return to formation prep does not start battle', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const restartSpy = vi.spyOn(getEngine(session), 'restartBattle');
    const restartAtWaveSpy = vi.spyOn(getEngine(session), 'restartBattleAtWave');

    expect(session.returnToFormationPrep()).toBe(true);
    expect(restartSpy).not.toHaveBeenCalled();
    expect(restartAtWaveSpy).not.toHaveBeenCalled();
    expect(session.getCurrentScreen()).toBe('formation');
  });

  it('4. restart operation from wave zero resets to wave 0', () => {
    session = bootVerifySession();
    advanceToWaveTwoCheckpoint(session);
    triggerDefeat(session);

    expect(session.restartOperationFromWaveZero()).toBe(true);
    expect(session.getOperationWaveIndex()).toBe(0);
    expect(session.getClearedWaveCount()).toBe(0);
    expect(session.getOperationState()?.isActive).toBe(true);
    expect(session.getOperationState()?.isDefeated).toBe(false);
    expect(session.getCurrentScreen()).toBe('formation');

    document.body
      .querySelector<HTMLButtonElement>('.skill-menu-return-to-battle-button')
      ?.click();
    expect(session.getCurrentScreen()).toBe('battle');
    expect(getEngine(session).getSnapshot().waveIndex).toBe(0);
  });

  it('5. all three retry operations clear operationResult', () => {
    session = bootVerifySession();
    advanceToWaveTwoCheckpoint(session);
    triggerDefeat(session);
    expect(session.getOperationResult()?.outcome).toBe('defeat');
    expect(session.retryCurrentWaveFromCheckpoint()).toBe(true);
    expect(session.getOperationResult()).toBeNull();
    session.destroy();

    session = bootVerifySession();
    advanceToWaveTwoCheckpoint(session);
    triggerDefeat(session);
    expect(session.getOperationResult()?.outcome).toBe('defeat');
    expect(session.returnToFormationPrep()).toBe(true);
    expect(session.getOperationResult()).toBeNull();
    session.destroy();

    session = bootVerifySession();
    advanceToWaveTwoCheckpoint(session);
    triggerDefeat(session);
    expect(session.getOperationResult()?.outcome).toBe('defeat');
    expect(session.restartOperationFromWaveZero()).toBe(true);
    expect(session.getOperationResult()).toBeNull();
  });

  it('6. retry current wave fails safely without checkpoint', () => {
    session = createSession();
    sortieToStage(session, '1');
    session.start();
    triggerDefeat(session);
    const before = session.getOperationState();

    session.clearOperationCheckpoint();
    expect(session.retryCurrentWaveFromCheckpoint()).toBe(false);
    expect(session.getOperationState()).toEqual(before);
  });

  it('7. duplicate retry execution does not corrupt state', () => {
    session = bootVerifySession();
    const checkpoint = advanceToWaveTwoCheckpoint(session)!;
    triggerDefeat(session);

    expect(session.retryCurrentWaveFromCheckpoint()).toBe(true);
    expect(session.retryCurrentWaveFromCheckpoint()).toBe(true);

    expect(session.getOperationWaveIndex()).toBe(checkpoint.currentWaveIndex);
    expect(session.getClearedWaveCount()).toBe(checkpoint.clearedWaveCount);
    expect(session.getOperationState()?.isActive).toBe(true);
    expect(session.getOperationState()?.isDefeated).toBe(false);
    expect(session.hasOperationCheckpoint()).toBe(true);
  });

  it('R8b retry current wave restores checkpoint passives and resource', () => {
    session = bootVerifySession();
    const op = getOperation(session);
    op.tryAddAcquiredOperationPassiveId(0, 'op_passive_a');
    op.tryAddUnspentResource(5);
    const checkpoint = advanceToWaveTwoCheckpoint(session)!;
    op.tryAddAcquiredOperationPassiveId(1, 'op_passive_lost');
    op.trySpendUnspentResource(2);
    triggerDefeat(session);

    expect(session.retryCurrentWaveFromCheckpoint()).toBe(true);
    expect(op.getAcquiredOperationPassiveIds(0)).toEqual(['op_passive_a']);
    expect(op.getAcquiredOperationPassiveIds(1)).toEqual([]);
    // 5 manual + waveClearResourceGrant (12)
    expect(op.getUnspentResource()).toBe(17);
    expect(session.getOperationCheckpoint()).toEqual(checkpoint);
  });

  it('R8b restart operation from wave zero resets passives and resource', () => {
    session = bootVerifySession();
    const op = getOperation(session);
    op.tryAddAcquiredOperationPassiveId(0, 'op_passive_a');
    op.tryAddUnspentResource(5);
    advanceToWaveTwoCheckpoint(session);
    triggerDefeat(session);

    expect(session.restartOperationFromWaveZero()).toBe(true);
    const opAfter = getOperation(session);
    for (let slot = 0; slot < 4; slot += 1) {
      expect(opAfter.getAcquiredOperationPassiveIds(slot)).toEqual([]);
    }
    expect(opAfter.getUnspentResource()).toBe(0);
  });

  it('R8b formation and wave prep round-trip keeps passives and resource', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const op = getOperation(session);
    op.tryAddAcquiredOperationPassiveId(0, 'op_passive_a');
    op.tryAddUnspentResource(4);

    expect(session.returnToFormationPrep()).toBe(true);
    expect(op.getAcquiredOperationPassiveIds(0)).toEqual(['op_passive_a']);
    // waveClearResourceGrant (12) + 4
    expect(op.getUnspentResource()).toBe(16);
    expect(session.isWavePrepSuspendedForFormation()).toBe(true);

    expect(session.returnToWavePrepFromFormation()).toBe(true);
    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(op.getAcquiredOperationPassiveIds(0)).toEqual(['op_passive_a']);
    expect(op.getUnspentResource()).toBe(16);
  });

  it('R8c retry restores checkpoint acquired via public API', () => {
    const passiveId = 'df_guardian_op_block_rate_up';
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    expect(session.tryAcquireOperationPassive(0, passiveId)).toBe(true);
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
    const checkpoint = session.getOperationCheckpoint();
    expect(checkpoint?.acquiredOperationPassives).toEqual([
      { slotIndex: 0, passiveIds: [passiveId] },
    ]);

    triggerDefeat(session);

    expect(session.retryCurrentWaveFromCheckpoint()).toBe(true);
    expect(session.getOperationAcquiredPassiveIds(0)).toEqual([passiveId]);
    expect(session.getOperationUnspentResource()).toBe(11);
  });
});
