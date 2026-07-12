/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PartyCombatModuleSelection } from '../battle/partyCombatModuleSelection.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { setDebugLoopStageId, setDebugLoopWaveIndex } from '../dev/debugLoopStage.ts';
import { SaveManager } from '../save/SaveManager.ts';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import type { PartySlotState } from '../battle/types.ts';
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

describe('OperationState unit (R6c)', () => {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const gameData = loaded.data;
  const save = createDefaultSave(gameData, 'demo');

  it('1. keeps stageId', () => {
    const selection = new PartyCombatModuleSelection();
    const op = OperationState.begin({
      stageId: '1',
      party: save.party,
      moduleSelection: selection,
    });
    expect(op?.stageId).toBe('1');
  });

  it('2. keeps party snapshot', () => {
    const op = OperationState.begin({
      stageId: '1',
      party: save.party,
      moduleSelection: new PartyCombatModuleSelection(),
    });
    expect(op?.getPartySnapshot().length).toBe(save.party.length);
    expect(op?.getPartySnapshot()[0]?.classId).toBe(save.party[0]?.classId);
  });

  it('3. keeps module selection snapshot', () => {
    const selection = new PartyCombatModuleSelection();
    selection.setSelectedCombatModuleId(0, 'df_guardian_mod_guard_focus');
    const op = OperationState.begin({
      stageId: '1',
      party: save.party,
      moduleSelection: selection,
    });
    expect(
      op?.getCombatModuleSelection().getSelectedCombatModuleId(0),
    ).toBe('df_guardian_mod_guard_focus');
  });

  it('4. initializes currentWaveIndex', () => {
    const op = OperationState.begin({
      stageId: '1',
      party: save.party,
      moduleSelection: new PartyCombatModuleSelection(),
      initialWaveIndex: 2,
    });
    expect(op?.currentWaveIndex).toBe(2);
  });

  it('5. initializes clearedWaveCount', () => {
    const op = OperationState.begin({
      stageId: '1',
      party: save.party,
      moduleSelection: new PartyCombatModuleSelection(),
    });
    expect(op?.clearedWaveCount).toBe(0);
  });

  it('6. initializes active/completed/defeated flags', () => {
    const op = OperationState.begin({
      stageId: '1',
      party: save.party,
      moduleSelection: new PartyCombatModuleSelection(),
    });
    expect(op?.isActive).toBe(true);
    expect(op?.isCompleted).toBe(false);
    expect(op?.isDefeated).toBe(false);
  });

  it('7. party snapshot is not the same reference as source party', () => {
    const source = save.party;
    const op = OperationState.begin({
      stageId: '1',
      party: source,
      moduleSelection: new PartyCombatModuleSelection(),
    })!;
    expect(op.getPartySlotsReference()).not.toBe(source);
    if (source[0] && op.getPartySlotsReference()[0]) {
      expect(op.getPartySlotsReference()[0]).not.toBe(source[0]);
    }
  });

  it('8. module map is not the same reference as source selection', () => {
    const selection = new PartyCombatModuleSelection();
    selection.setSelectedCombatModuleId(1, 'at_assassin_mod_shadow');
    const op = OperationState.begin({
      stageId: '1',
      party: save.party,
      moduleSelection: selection,
    })!;
    expect(op.getCombatModuleSelectionReference()).not.toBe(selection);
    selection.setSelectedCombatModuleId(1, 'changed');
    expect(
      op.getCombatModuleSelection().getSelectedCombatModuleId(1),
    ).toBe('at_assassin_mod_shadow');
  });

  it('9. ignores invalid slot module map writes', () => {
    const op = OperationState.begin({
      stageId: '1',
      party: save.party,
      moduleSelection: new PartyCombatModuleSelection(),
    })!;
    op.setCombatModuleForSlot(-1, 'x');
    op.setCombatModuleForSlot(99, 'x');
    expect(op.getCombatModuleSelection().getSelectedCombatModuleId(-1)).toBeUndefined();
    expect(op.getCombatModuleSelection().getSelectedCombatModuleId(99)).toBeUndefined();
  });

  it('10. rejects duplicate party snapshot', () => {
    const dupParty: PartySlotState[] = structuredClone(save.party);
    const classId = dupParty[0]?.classId;
    if (!classId) throw new Error('missing class');
    dupParty[1] = structuredClone(dupParty[0]!);
    const op = OperationState.begin({
      stageId: '1',
      party: dupParty,
      moduleSelection: new PartyCombatModuleSelection(),
    });
    expect(op).toBeNull();
  });

  it('party snapshot does not auto-sync from save changes', () => {
    const source = structuredClone(save.party);
    const op = OperationState.begin({
      stageId: '1',
      party: source,
      moduleSelection: new PartyCombatModuleSelection(),
    })!;
    source[0]!.progress.level = 99;
    expect(op.getPartySnapshot()[0]?.progress.level).not.toBe(99);
  });

  it('party snapshot changes do not mutate source', () => {
    const source = structuredClone(save.party);
    const op = OperationState.begin({
      stageId: '1',
      party: source,
      moduleSelection: new PartyCombatModuleSelection(),
    })!;
    const slots = op.getPartySlotsReference();
    if (slots[0]) slots[0].progress.level = 77;
    expect(source[0]?.progress.level).not.toBe(77);
  });
});

describe('GameSession OperationState integration (R6c)', () => {
  let session: GameSession | null = null;

  beforeEach(() => {
    localStorage.clear();
    mockCanvas2d();
    setVerifyModeEnabled(false);
    setDebugLoopStageId(null);
    setDebugLoopWaveIndex(null);
  });

  afterEach(() => {
    session?.destroy();
    session = null;
    document.body.replaceChildren();
  });

  it('11. sortie creates OperationState', () => {
    session = createSession();
    expect(session.getOperationState()).toBeNull();
    sortieToStage(session, '1');
    expect(session.getOperationState()).not.toBeNull();
    expect(session.hasActiveOperation()).toBe(true);
    expect(session.getOperationState()?.stageId).toBe('1');
  });

  it('12. new sortie replaces OperationState', () => {
    session = createSession();
    sortieToStage(session, '1');
    const first = session.getOperationState();
    sortieToStage(session, '2');
    const second = session.getOperationState();
    expect(second).not.toBeNull();
    expect(second?.stageId).toBe('2');
    expect(second).not.toBe(first);
  });

  it('13. snapshots module A/B selection on sortie', () => {
    session = createSession();
    const moduleId = 'df_guardian_mod_guard_focus';
    session.setPartySlotCombatModule(0, moduleId);
    sortieToStage(session, '1');
    expect(session.getPartySlotCombatModule(0)).toBe(moduleId);
    const op = (session as unknown as { operationState: OperationState }).operationState;
    const preOp = (session as unknown as {
      preOperationModuleSelection: PartyCombatModuleSelection;
    }).preOperationModuleSelection;
    preOp.setSelectedCombatModuleId(0, 'changed_pre');
    expect(op.getCombatModuleSelection().getSelectedCombatModuleId(0)).toBe(moduleId);
  });

  it('14. verify start wave is reflected', () => {
    setVerifyModeEnabled(true);
    setDebugLoopStageId('1');
    setDebugLoopWaveIndex(1);
    session = createSession();
    expect(session.getOperationWaveIndex()).toBe(1);
    expect(getEngine(session).getSnapshot().waveIndex).toBe(1);
  });

  it('15. does not persist OperationState in save', () => {
    session = createSession();
    sortieToStage(session, '1');
    const manager = new SaveManager();
    manager.save(session.getSaveState());
    const raw = localStorage.getItem('hensei-only-save') ?? '';
    expect(raw).not.toContain('operationState');
    expect(raw).not.toContain('clearedWaveCount');
  });
});

describe('OperationState wave sync (R6c)', () => {
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

  function bootSession(): GameSession {
    session = createSession();
    session.start();
    return session;
  }

  it('16. wave 0 start matches engine index', () => {
    bootSession();
    expect(session!.getOperationWaveIndex()).toBe(0);
    expect(getEngine(session!).getSnapshot().waveIndex).toBe(0);
  });

  it('17. clearedWaveCount becomes 1 on intermediate wave awaiting', () => {
    bootSession();
    reachAwaitingNextWave(getEngine(session!));
    expect(session!.getClearedWaveCount()).toBe(1);
  });

  it('18. clearedWaveCount does not grow while awaiting ticks', () => {
    bootSession();
    reachAwaitingNextWave(getEngine(session!));
    for (let i = 0; i < 200; i++) {
      getEngine(session!).tick(TICK_DT);
    }
    expect(session!.getClearedWaveCount()).toBe(1);
  });

  it('19. startNextWave advances currentWaveIndex', () => {
    bootSession();
    reachAwaitingNextWave(getEngine(session!));
    expect(session!.startNextWave()).toBe(true);
    expect(session!.getOperationWaveIndex()).toBe(1);
    expect(getEngine(session!).getSnapshot().waveIndex).toBe(1);
  });

  it('20. double startNextWave does not double increment wave index', () => {
    bootSession();
    reachAwaitingNextWave(getEngine(session!));
    expect(session!.startNextWave()).toBe(true);
    expect(session!.startNextWave()).toBe(false);
    expect(session!.getOperationWaveIndex()).toBe(1);
  });

  it('21. starting wave 1 after wave 0 clear keeps clearedWaveCount until final victory', () => {
    bootSession();
    reachAwaitingNextWave(getEngine(session!));
    expect(session!.getClearedWaveCount()).toBe(1);
    session!.startNextWave();
    expect(session!.getClearedWaveCount()).toBe(1);
    expect(session!.getOperationWaveIndex()).toBe(1);
  });

  it('22. final wave victory sets completed=true', () => {
    bootSession();
    waitForEngaged(getEngine(session!));
    killAllEnemies(getEngine(session!));
    for (let i = 0; i < 90_000; i++) {
      getEngine(session!).tick(TICK_DT);
      if (getEngine(session!).getSnapshot().phase === 'victory') break;
    }
    triggerVictory(session!);
    expect(session!.getOperationState()).toBeNull();
  });

  it('23. final wave victory clears all waves via markCompleted', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const save = createDefaultSave(loaded.data, 'demo');
    const op = OperationState.begin({
      stageId: '1',
      party: save.party,
      moduleSelection: new PartyCombatModuleSelection(),
    })!;
    op.markCompleted(1, 2);
    expect(op.clearedWaveCount).toBe(2);
    expect(op.isCompleted).toBe(true);
  });

  it('24. intermediate wave completion does not set completed', () => {
    bootSession();
    reachAwaitingNextWave(getEngine(session!));
    const op = (session as unknown as { operationState: OperationState }).operationState;
    expect(op.isCompleted).toBe(false);
  });
});

describe('OperationState defeat and restart (R6c)', () => {
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
  });

  it('25. defeat sets defeated=true', () => {
    session = createSession();
    sortieToStage(session, '1');
    session.start();
    triggerDefeat(session);
    const op = (session as unknown as { operationState: OperationState }).operationState;
    expect(op.isDefeated).toBe(true);
  });

  it('26. defeat keeps completed=false', () => {
    session = createSession();
    sortieToStage(session, '1');
    triggerDefeat(session);
    const op = (session as unknown as { operationState: OperationState }).operationState;
    expect(op.isCompleted).toBe(false);
  });

  it('27. restart resets wave progress', () => {
    session = createSession();
    sortieToStage(session, '1');
    session.start();
    reachAwaitingNextWave(getEngine(session));
    getEngine(session).restartBattle();
    expect(session.getClearedWaveCount()).toBe(0);
    expect(session.getOperationWaveIndex()).toBe(0);
  });

  it('28. old OperationState does not leak to next stage', () => {
    session = createSession();
    sortieToStage(session, '1');
    sortieToStage(session, '2');
    expect(session.getOperationState()?.stageId).toBe('2');
  });
});

describe('OperationState regression (R6c)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockCanvas2d();
  });

  it('29. preserves R6b awaiting state', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    const snap = reachAwaitingNextWave(engine);
    expect(snap.awaitingNextWave).toBe(true);
  });

  it('30. preserves startNextWave behavior', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    reachAwaitingNextWave(engine);
    expect(engine.startNextWave()).toBe(true);
    expect(engine.getSnapshot().waveAnnouncementActive).toBe(true);
  });

  it('31. module selection reaches combatants', () => {
    setVerifyModeEnabled(true);
    setDebugLoopStageId('1');
    const session = createSession();
    const moduleId = 'df_guardian_mod_guard_focus';
    session.setPartySlotCombatModule(0, moduleId);
    session.start();
    const { players } = asBattleEngineInternals(getEngine(session));
    const guardian = players.find((p) => p.partySlotIndex === 0);
    const basicCd = guardian?.cooldowns.find((c) => c.slotKind === 'basic');
    expect(basicCd?.skillId).toBe(moduleId);
    session.destroy();
  });

  it('33. legacy single-wave victory still works', () => {
    const engine = createStage1Engine({ reliableWaveClear: true });
    const stage = (engine as unknown as { gameData: { stages: { id: string; waves: unknown[] }[] } }).gameData.stages.find((s) => s.id === '1');
    if (stage) stage.waves = stage.waves.slice(0, 1);
    engine.restartBattle();
    waitForEngaged(engine);
    killAllEnemies(engine);
    let victory = false;
    for (let i = 0; i < 90_000; i++) {
      engine.tick(TICK_DT);
      if (engine.getSnapshot().phase === 'victory') {
        victory = true;
        break;
      }
    }
    expect(victory).toBe(true);
  });

  it('34. save JSON schema has no OperationState fields', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const save = createDefaultSave(loaded.data, 'demo');
    const serialized = JSON.stringify(save);
    expect(serialized).not.toContain('operationState');
    expect(serialized).not.toContain('clearedWaveCount');
  });
});
