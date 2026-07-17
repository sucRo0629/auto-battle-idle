/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PartyCombatModuleSelection } from '../battle/partyCombatModuleSelection.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { setDebugLoopStageId, setDebugLoopWaveIndex } from '../dev/debugLoopStage.ts';
import { SaveManager } from '../save/SaveManager.ts';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import type { GameData } from '../battle/types.ts';
import {
  cloneCheckpointSnapshot,
  createCheckpointFromOperationState,
  validateCheckpointSnapshot,
} from './OperationCheckpoint.ts';
import { OperationState } from './OperationState.ts';
import { GameSession } from './GameSession.ts';
import {
  asBattleEngineInternals,
  createStage1Engine,
  killAllEnemies,
  reachAwaitingNextWave,
  TICK_DT,
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

function triggerVictory(session: GameSession, survivingIndices: number[] = [0, 1, 2, 3]): void {
  getEngine(session).applyVictoryTransition(survivingIndices);
}

function triggerDefeat(session: GameSession, survivingIndices: number[] = []): void {
  getEngine(session).applyDefeatTransition(survivingIndices);
}

describe('Operation checkpoint (R6f)', () => {
  let session: GameSession | null = null;
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const gameData = loaded.data;

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

  it('1. creates checkpoint on first sortie confirm', () => {
    session = createSession();
    expect(session.hasOperationCheckpoint()).toBe(false);
    sortieToStage(session, '1');
    expect(session.hasOperationCheckpoint()).toBe(true);
    expect(session.getOperationCheckpoint()).not.toBeNull();
  });

  it('2. checkpoint keeps party, module, and wave progress', () => {
    session = createSession();
    const moduleId = 'df_guardian_mod_guard_focus';
    session.setPartySlotCombatModule(0, moduleId);
    sortieToStage(session, '1');
    const checkpoint = session.getOperationCheckpoint();
    expect(checkpoint?.stageId).toBe('1');
    expect(checkpoint?.currentWaveIndex).toBe(0);
    expect(checkpoint?.clearedWaveCount).toBe(0);
    expect(checkpoint?.party[0]?.classId).toBe(session.getSaveState().party[0]?.classId);
    expect(checkpoint?.combatModuleSelection).toEqual([
      { slotIndex: 0, moduleId },
    ]);
  });

  it('3. mutating returned checkpoint does not change internal checkpoint', () => {
    session = createSession();
    sortieToStage(session, '1');
    const snapshot = session.getOperationCheckpoint()!;
    if (snapshot.party[0]) {
      snapshot.party[0].progress.level = 999;
    }
    const again = session.getOperationCheckpoint()!;
    expect(again.party[0]?.progress.level).not.toBe(999);
    expect(snapshot.party).not.toBe(again.party);
  });

  it('4. checkpoint excludes combatant runtime and battle state', () => {
    session = createSession();
    sortieToStage(session, '1');
    session.start();
    waitForEngaged(getEngine(session));
    const ally = asBattleEngineInternals(getEngine(session)).players[0];
    ally.hp = 1;
    const cd = ally.cooldowns.find((c) => c.slotKind === 'basic');
    if (cd) cd.remaining = 77;

    const serialized = JSON.stringify(session.getOperationCheckpoint());
    expect(serialized).not.toContain('"hp"');
    expect(serialized).not.toContain('"cooldowns"');
    expect(serialized).not.toContain('"statusEffects"');
    expect(serialized).not.toContain('StageDamageStats');
    expect(serialized).not.toContain('battleTimeSec');
  });

  it('5. wave prep edits alone do not update checkpoint', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const before = session.getOperationCheckpoint();
    const member = createMemberFromClass('at_sorcerer', gameData);
    session.tryUpdateOperationPartySlot(0, member);
    session.trySetOperationSlotCombatModule(1, 'at_swordsman_mod_pierce_slash');
    expect(session.getOperationCheckpoint()).toEqual(before);
  });

  it('6. next wave confirm success updates checkpoint with latest party/module', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const moduleId = 'df_guardian_mod_guard_focus';
    session.trySetOperationSlotCombatModule(0, moduleId);
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
    const checkpoint = session.getOperationCheckpoint();
    expect(checkpoint?.currentWaveIndex).toBe(1);
    expect(checkpoint?.clearedWaveCount).toBe(1);
    expect(checkpoint?.combatModuleSelection).toEqual([
      { slotIndex: 0, moduleId },
    ]);
  });

  it('7. next wave start failure keeps previous checkpoint', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    session.trySetOperationSlotCombatModule(0, 'df_guardian_mod_nearest_strike');
    const before = session.getOperationCheckpoint();
    const engine = getEngine(session);
    vi.spyOn(engine, 'startNextWave').mockReturnValue(false);
    expect(session.confirmWavePrepAndStartNextWave()).toBe(false);
    expect(session.getOperationCheckpoint()).toEqual(before);
    expect(session.getCurrentScreen()).toBe('wavePrep');
  });

  it('8. restore returns party, module, and wave progress', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const checkpoint = session.getOperationCheckpoint()!;
    session.trySetOperationSlotCombatModule(0, 'df_guardian_mod_nearest_strike');
    session.tryUpdateOperationPartySlot(0, createMemberFromClass('at_sorcerer', gameData));
    expect(session.tryRestoreOperationFromCheckpoint(checkpoint)).toBe(true);
    expect(session.getOperationParty()?.[0]?.classId).toBe(checkpoint.party[0]?.classId);
    expect(session.getPartySlotCombatModule(0)).toBe(
      checkpoint.combatModuleSelection.find((e) => e.slotIndex === 0)?.moduleId ??
        undefined,
    );
    expect(session.getOperationWaveIndex()).toBe(checkpoint.currentWaveIndex);
    expect(session.getClearedWaveCount()).toBe(checkpoint.clearedWaveCount);
  });

  it('9. restore normalizes active/completed/defeated for retry', () => {
    session = createSession();
    sortieToStage(session, '1');
    session.start();
    triggerDefeat(session);
    const checkpoint = session.getOperationCheckpoint()!;
    expect(session.getOperationState()?.isDefeated).toBe(true);
    expect(session.tryRestoreOperationFromCheckpoint(checkpoint)).toBe(true);
    const view = session.getOperationState();
    expect(view?.isActive).toBe(true);
    expect(view?.isCompleted).toBe(false);
    expect(view?.isDefeated).toBe(false);
  });

  it('10. invalid checkpoint restore leaves operation unchanged', () => {
    session = createSession();
    sortieToStage(session, '1');
    const before = session.getOperationState();
    const invalid = cloneCheckpointSnapshot(session.getOperationCheckpoint()!);
    const tampered = {
      ...invalid,
      stageId: '999',
    };
    expect(session.tryRestoreOperationFromCheckpoint(tampered)).toBe(false);
    expect(session.getOperationState()).toEqual(before);
  });

  it('11. keeps checkpoint after defeat', () => {
    session = createSession();
    sortieToStage(session, '1');
    const checkpoint = session.getOperationCheckpoint();
    session.start();
    triggerDefeat(session);
    expect(session.getOperationState()?.isDefeated).toBe(true);
    expect(session.getOperationCheckpoint()).toEqual(checkpoint);
  });

  it('12. clears checkpoint on final victory', () => {
    session = createSession();
    sortieToStage(session, '1');
    session.start();
    triggerVictory(session);
    expect(session.hasOperationCheckpoint()).toBe(false);
    expect(session.getOperationCheckpoint()).toBeNull();
  });

  it('13. clears checkpoint when returning to stage select', () => {
    session = createSession();
    sortieToStage(session, '1');
    expect(session.hasOperationCheckpoint()).toBe(true);
    session.openStageSelect();
    expect(session.hasOperationCheckpoint()).toBe(false);
  });

  it('14. new sortie on another stage replaces old checkpoint', () => {
    session = createSession();
    sortieToStage(session, '1');
    const first = session.getOperationCheckpoint();
    sortieToStage(session, '2');
    const second = session.getOperationCheckpoint();
    expect(second?.stageId).toBe('2');
    expect(second).not.toEqual(first);
  });

  it('15. does not persist checkpoint in SaveData', () => {
    session = createSession();
    sortieToStage(session, '1');
    const manager = new SaveManager();
    manager.save(session.getSaveState());
    const raw = localStorage.getItem('hensei-only-save') ?? '';
    expect(raw).not.toContain('operationCheckpoint');
    expect(raw).not.toContain('clearedWaveCount');
  });

  it('16. wave prep edit and confirm paths still work', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    expect(session.trySetOperationSlotCombatModule(0, 'df_guardian_mod_nearest_strike')).toBe(
      true,
    );
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.getOperationWaveIndex()).toBe(1);
  });

  it('17. R6d wave reset still works after checkpoint update', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const engine = getEngine(session);
    const beforePlayers = asBattleEngineInternals(engine).players;
    beforePlayers[0].hp = 1;
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
    const afterPlayers = asBattleEngineInternals(engine).players;
    expect(afterPlayers).not.toBe(beforePlayers);
    expect(afterPlayers[0].hp).toBe(afterPlayers[0].maxHp);
  });

  it('18. victory, defeat, and stage change handlers do not double-run', () => {
    setVerifyModeEnabled(false);
    session = createSession();
    sortieToStage(session, '1');
    const victorySpy = vi.spyOn(getEngine(session), 'applyVictoryTransition');
    triggerVictory(session);
    expect(victorySpy).toHaveBeenCalledTimes(1);
    expect(session.getOperationState()).toBeNull();

    session.destroy();
    session = createSession();
    sortieToStage(session, '1');
    session.start();
    const defeatSpy = vi.spyOn(getEngine(session), 'applyDefeatTransition');
    triggerDefeat(session);
    expect(defeatSpy).toHaveBeenCalledTimes(1);
    expect(session.getOperationState()?.isDefeated).toBe(true);

    session.destroy();
    session = createSession();
    sortieToStage(session, '1');
    sortieToStage(session, '2');
    expect(session.getOperationState()?.stageId).toBe('2');
  });

  it('R8b wave prep edits to passives do not update checkpoint until confirm', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const before = session.getOperationCheckpoint();
    const op = (session as unknown as { operationState: OperationState }).operationState;
    op.tryAddAcquiredOperationPassiveId(0, 'op_passive_prep');
    op.tryAddUnspentResource(2);
    const expectedUnspentResource = op.getUnspentResource();
    expect(session.getOperationCheckpoint()).toEqual(before);

    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
    const checkpoint = session.getOperationCheckpoint();
    expect(checkpoint?.acquiredOperationPassives).toEqual([
      { slotIndex: 0, passiveIds: ['op_passive_prep'] },
    ]);
    expect(checkpoint?.unspentResource).toBe(expectedUnspentResource);
  });

  it('R8b invalid checkpoint passive data fails restore', () => {
    session = createSession();
    sortieToStage(session, '1');
    const op = (session as unknown as { operationState: OperationState }).operationState;
    op.tryAddAcquiredOperationPassiveId(0, 'op_passive_a');
    const invalid = cloneCheckpointSnapshot(session.getOperationCheckpoint()!);
    const tampered = {
      ...invalid,
      acquiredOperationPassives: [{ slotIndex: 0, passiveIds: [''] }],
    };
    expect(session.tryRestoreOperationFromCheckpoint(tampered)).toBe(false);
    expect(op.getAcquiredOperationPassiveIds(0)).toEqual(['op_passive_a']);
  });
});

describe('OperationCheckpoint unit (R6f)', () => {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const gameData = loaded.data;
  const save = createDefaultSave(gameData, 'demo');

  it('cloneCheckpointSnapshot is independent from source', () => {
    const selection = new PartyCombatModuleSelection();
    selection.setSelectedCombatModuleId(0, 'df_guardian_mod_guard_focus');
    const op = OperationState.begin({
      stageId: '1',
      party: save.party,
      moduleSelection: selection,
    })!;
    const source = createCheckpointFromOperationState(op);
    const clone = cloneCheckpointSnapshot(source);
    if (clone.party[0]) clone.party[0].progress.level = 42;
    expect(source.party[0]?.progress.level).not.toBe(42);
    expect(clone).not.toBe(source);
  });

  it('validateCheckpointSnapshot rejects inconsistent wave progress', () => {
    const selection = new PartyCombatModuleSelection();
    const op = OperationState.begin({
      stageId: '1',
      party: save.party,
      moduleSelection: selection,
    })!;
    const snapshot = createCheckpointFromOperationState(op);
    const invalid = {
      ...snapshot,
      clearedWaveCount: 99,
    };
    expect(
      validateCheckpointSnapshot(invalid, gameData, {
        expectedStageId: '1',
        waveCount: 2,
      }),
    ).toBe(false);
  });

  it('R8b checkpoint commit and restore round-trips passives and resource', () => {
    const op = OperationState.begin({
      stageId: '1',
      party: save.party,
      moduleSelection: new PartyCombatModuleSelection(),
    })!;
    op.tryAddAcquiredOperationPassiveId(0, 'op_passive_a');
    op.tryAddAcquiredOperationPassiveId(1, 'op_passive_b');
    op.tryAddUnspentResource(7);
    const checkpoint = createCheckpointFromOperationState(op);

    op.tryAddAcquiredOperationPassiveId(2, 'op_passive_c');
    op.trySpendUnspentResource(3);

    expect(op.tryRestoreFromCheckpoint(checkpoint)).toBe(true);
    expect(op.getAcquiredOperationPassiveIds(0)).toEqual(['op_passive_a']);
    expect(op.getAcquiredOperationPassiveIds(1)).toEqual(['op_passive_b']);
    expect(op.getAcquiredOperationPassiveIds(2)).toEqual([]);
    expect(op.getUnspentResource()).toBe(7);
  });

  it('validateCheckpointSnapshot rejects invalid passive and resource fields', () => {
    const op = OperationState.begin({
      stageId: '1',
      party: save.party,
      moduleSelection: new PartyCombatModuleSelection(),
    })!;
    const snapshot = createCheckpointFromOperationState(op);
    expect(
      validateCheckpointSnapshot(
        { ...snapshot, unspentResource: -1 },
        gameData,
        { expectedStageId: '1', waveCount: 2 },
      ),
    ).toBe(false);
    expect(
      validateCheckpointSnapshot(
        {
          ...snapshot,
          acquiredOperationPassives: [{ slotIndex: 0, passiveIds: ['dup', 'dup'] }],
        },
        gameData,
        { expectedStageId: '1', waveCount: 2 },
      ),
    ).toBe(false);
    expect(
      validateCheckpointSnapshot(
        { ...snapshot, lastResourceGrantClearedWaveCount: 99 },
        gameData,
        { expectedStageId: '1', waveCount: 2 },
      ),
    ).toBe(false);
  });
});

describe('Operation checkpoint regression with createStage1Engine', () => {
  it('preserves awaitingNextWave after intermediate clear', () => {
    localStorage.clear();
    mockCanvas2d();
    const engine = createStage1Engine({ reliableWaveClear: true });
    const snap = reachAwaitingNextWave(engine);
    expect(snap.awaitingNextWave).toBe(true);
  });

  it('final wave victory clears operation without wave prep', () => {
    setVerifyModeEnabled(true);
    setDebugLoopStageId('1');
    setDebugLoopWaveIndex(1);
    const session = createSession();
    session.start();
    const engine = getEngine(session);
    waitForEngaged(engine);
    killAllEnemies(engine);
    for (let i = 0; i < 90_000; i++) {
      engine.tick(TICK_DT);
      if (engine.getSnapshot().phase === 'victory') break;
    }
    triggerVictory(session);
    expect(session.hasOperationCheckpoint()).toBe(false);
    session.destroy();
  });
});
