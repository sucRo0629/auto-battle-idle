/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PartyCombatModuleSelection } from '../battle/partyCombatModuleSelection.ts';
import { StageDamageStatsTracker } from '../battle/stageDamageStats.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { setDebugLoopStageId, setDebugLoopWaveIndex } from '../dev/debugLoopStage.ts';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import type { GameData, PartySlotState } from '../battle/types.ts';
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
import { resolveSkillTrigger } from '../battle/skillTrigger.ts';

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

function bootVerifySession(): GameSession {
  setVerifyModeEnabled(true);
  setDebugLoopStageId('1');
  setDebugLoopWaveIndex(null);
  const session = createSession();
  session.start();
  return session;
}

function sortieToStage(session: GameSession, stageId: string): void {
  const host = (session as unknown as {
    handleStageSortie: (id: string) => void;
  }).handleStageSortie.bind(session);
  host(stageId);
}

function clickWavePrepRetryButton(container: ParentNode, label: string): void {
  const buttons = container.querySelectorAll<HTMLButtonElement>(
    '.wave-prep-screen__retry-button',
  );
  const button = [...buttons].find((entry) => entry.textContent === label);
  if (!button) throw new Error(`Wave prep retry button not found: ${label}`);
  button.click();
}

describe('Wave prep screen (R6e)', () => {
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

  it('1. opens wave prep screen after intermediate wave clear', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    expect(session.isAwaitingNextWave()).toBe(true);
    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(session.isWavePrepOpen()).toBe(true);
    expect(session.getOperationState()?.isWavePrepEditable).toBe(true);
  });

  it('2. does not open wave prep on final wave victory', () => {
    setVerifyModeEnabled(true);
    setDebugLoopStageId('1');
    setDebugLoopWaveIndex(1);
    session = createSession();
    session.start();
    const engine = getEngine(session);
    waitForEngaged(engine);
    killAllEnemies(engine);
    for (let i = 0; i < 90_000; i++) {
      engine.tick(TICK_DT);
      if (engine.getSnapshot().phase === 'victory') break;
    }
    expect(engine.getSnapshot().phase).toBe('victory');
    expect(session.getCurrentScreen()).not.toBe('wavePrep');
  });

  it('3. allows party change during wave prep', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const targetClass = 'at_sorcerer';
    const member = createMemberFromClass(targetClass, gameData);
    const result = session.tryUpdateOperationPartySlot(0, member);
    expect(result.ok).toBe(true);
    expect(session.getOperationParty()?.[0]?.classId).toBe(targetClass);
  });

  it('4. rejects duplicate class without changing party', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const before = structuredClone(session.getOperationParty());
    const duplicateClass = before[1]?.classId;
    if (!duplicateClass) throw new Error('missing class');
    const member = createMemberFromClass(duplicateClass, gameData);
    const result = session.tryUpdateOperationPartySlot(0, member);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('duplicateClass');
    expect(session.getOperationParty()).toEqual(before);
  });

  it('5. allows module change during wave prep', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const moduleId = 'df_guardian_mod_guard_focus';
    expect(session.trySetOperationSlotCombatModule(0, moduleId)).toBe(true);
    expect(session.getPartySlotCombatModule(0)).toBe(moduleId);
  });

  it('6. normalizes module to new class default on class change', () => {
    session = bootVerifySession();
    session.setPartySlotCombatModule(0, 'df_guardian_mod_guard_focus');
    reachAwaitingNextWave(getEngine(session));
    const member = createMemberFromClass('at_sorcerer', gameData);
    expect(session.tryUpdateOperationPartySlot(0, member).ok).toBe(true);
    expect(session.getPartySlotCombatModule(0)).toBeUndefined();
    const preset = gameData.classRegistry.at_sorcerer;
    expect(
      session.getOperationParty()?.[0]?.classId,
    ).toBe('at_sorcerer');
    expect(preset?.combatModuleIds?.[0]).toBeDefined();
  });

  it('7. rejects party/module edits outside wave prep and during combat', () => {
    session = bootVerifySession();
    const member = createMemberFromClass('at_sorcerer', gameData);
    expect(session.tryUpdateOperationPartySlot(0, member).ok).toBe(false);
    expect(session.trySetOperationSlotCombatModule(0, 'at_sorcerer_mod_twin_bolt')).toBe(
      false,
    );

    waitForEngaged(getEngine(session));
    expect(session.tryUpdateOperationPartySlot(0, member).ok).toBe(false);
    expect(session.trySetOperationSlotCombatModule(0, 'at_sorcerer_mod_twin_bolt')).toBe(
      false,
    );
  });

  it('8. does not mutate save party or unlocked state during wave prep edits', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const beforeSave = structuredClone(session.getSaveState());
    const member = createMemberFromClass('at_sorcerer', gameData);
    session.tryUpdateOperationPartySlot(0, member);
    session.trySetOperationSlotCombatModule(1, 'at_swordsman_mod_pierce_slash');
    expect(session.getSaveState()).toEqual(beforeSave);
  });

  it('9. regenerates allies from confirmed party/module on next wave', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const moduleId = 'df_guardian_mod_nearest_strike';
    session.trySetOperationSlotCombatModule(0, moduleId);
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
    expect(session.getCurrentScreen()).toBe('battle');
    const { players } = asBattleEngineInternals(getEngine(session));
    const ally = players.find((p) => p.partySlotIndex === 0);
    const basicCd = ally?.cooldowns.find((c) => c.slotKind === 'basic');
    expect(basicCd?.skillId).toBe(moduleId);
  });

  it('10. keeps wave prep and OperationState when next wave start fails', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const engine = getEngine(session);
    const beforeOp = session.getOperationState();
    const startSpy = vi.spyOn(engine, 'startNextWave').mockReturnValue(false);
    expect(session.confirmWavePrepAndStartNextWave()).toBe(false);
    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(session.getOperationState()).toEqual(beforeOp);
    expect(session.isAwaitingNextWave()).toBe(true);
    startSpy.mockRestore();
  });

  it('11. keeps wave index, cleared count, stage stats, and battle time across confirm', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const engine = getEngine(session);
    const tracker = (
      session as unknown as { stageDamageStats: StageDamageStatsTracker }
    ).stageDamageStats;
    const { players } = asBattleEngineInternals(engine);
    tracker.recordHeal(players[0], 100);
    const statsBefore = tracker.getDisplayRows(
      session.getSaveState().party,
      gameData.classRegistry,
    );
    const clearedBefore = session.getClearedWaveCount();
    const battleTimeBefore = engine.getBattleTimeSec();

    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);

    expect(session.getClearedWaveCount()).toBe(clearedBefore);
    expect(session.getOperationWaveIndex()).toBe(1);
    expect(
      tracker.getDisplayRows(
        session.getSaveState().party,
        gameData.classRegistry,
      ),
    ).toEqual(statsBefore);
    expect(engine.getBattleTimeSec()).toBe(battleTimeBefore);
  });

  it('12. preserves R6d ally reset after wave prep confirm', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const engine = getEngine(session);
    const beforePlayers = asBattleEngineInternals(engine).players;
    const ally = beforePlayers[0];
    ally.hp = 1;
    ally.statusEffects.push({
      id: 'test',
      kind: 'debuff',
      stat: 'atk',
      multiplier: 0.5,
      remainingSec: 5,
    });
    const cd = ally.cooldowns.find((c) => c.slotKind === 'basic');
    if (cd) cd.remaining = 99;

    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
    const afterPlayers = asBattleEngineInternals(engine).players;
    expect(afterPlayers).not.toBe(beforePlayers);
    expect(afterPlayers[0].hp).toBe(afterPlayers[0].maxHp);
    expect(afterPlayers[0].statusEffects).toEqual([]);
    const afterCd = afterPlayers[0].cooldowns.find((c) => c.slotKind === 'basic');
    expect(afterCd?.remaining).toBe(
      resolveSkillTrigger(gameData.skillRegistry.actives[afterCd!.skillId]!)
        .value,
    );
  });

  it('13. regression: defeat, final victory, and stage interrupt unchanged', () => {
    setVerifyModeEnabled(false);
    session = createSession();
    sortieToStage(session, '1');
    session.start();
    getEngine(session).applyDefeatTransition([]);
    expect(session.getOperationState()?.isDefeated).toBe(true);
    expect(session.getCurrentScreen()).toBe('formation');

    session.destroy();
    session = createSession();
    sortieToStage(session, '1');
    session.start();
    getEngine(session).applyVictoryTransition([0, 1, 2, 3]);
    expect(session.getOperationState()).toBeNull();
    expect(session.getCurrentScreen()).toBe('stageSelect');

    session.destroy();
    session = createSession();
    sortieToStage(session, '1');
    sortieToStage(session, '2');
    expect(session.getOperationState()?.stageId).toBe('2');
  });
});

describe('OperationState wave prep API (R6e unit)', () => {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const gameData = loaded.data;
  const save = createDefaultSave(gameData, 'demo');

  it('rejects edits when wave prep editing is disabled', () => {
    const op = OperationState.begin({
      stageId: '1',
      party: save.party,
      moduleSelection: new PartyCombatModuleSelection(),
    })!;
    const member = createMemberFromClass('at_sorcerer', gameData);
    expect(op.tryUpdatePartySlot(0, member, gameData).ok).toBe(false);
    expect(op.trySetCombatModuleForSlot(0, 'at_sorcerer_mod_twin_bolt', gameData)).toBe(
      false,
    );
  });

  it('no-ops when setting the same effective module', () => {
    const selection = new PartyCombatModuleSelection();
    selection.setSelectedCombatModuleId(0, 'df_guardian_mod_guard_focus');
    const op = OperationState.begin({
      stageId: '1',
      party: save.party,
      moduleSelection: selection,
    })!;
    op.beginWavePrepEditing();
    const mapRef = op.getCombatModuleSelectionReference();
    expect(
      op.trySetCombatModuleForSlot(0, 'df_guardian_mod_guard_focus', gameData),
    ).toBe(true);
    expect(op.getCombatModuleSelectionReference()).toBe(mapRef);
  });
});

describe('Wave prep screen regression with createStage1Engine', () => {
  it('preserves awaitingNextWave when wave prep opens via GameSession', () => {
    localStorage.clear();
    mockCanvas2d();
    setVerifyModeEnabled(true);
    setDebugLoopStageId('1');
    const session = createSession();
    session.start();
    const snap = reachAwaitingNextWave(getEngine(session));
    expect(snap.awaitingNextWave).toBe(true);
    expect(session.getCurrentScreen()).toBe('wavePrep');
    session.destroy();
  });
});

describe('Wave prep retry (R7d)', () => {
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

  it('1. shows three retry actions on wave prep screen', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));

    expect(session.shouldShowWavePrepRetry()).toBe(true);
    const buttons = document.body.querySelectorAll('.wave-prep-screen__retry-button');
    expect(buttons).toHaveLength(3);
    expect([...buttons].map((button) => button.textContent)).toEqual([
      '現在Waveを同設定で再戦',
      '準備へ戻る',
      '作戦をWave 0からやり直す',
    ]);
  });

  it('2. retry current wave restores checkpoint wave and discards uncommitted module edit', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const checkpointModule = session.getPartySlotCombatModule(0);
    const editedModule = 'df_guardian_mod_guard_focus';
    expect(session.trySetOperationSlotCombatModule(0, editedModule)).toBe(true);
    expect(session.getPartySlotCombatModule(0)).toBe(editedModule);

    expect(session.retryCurrentWaveFromCheckpoint()).toBe(true);

    expect(session.getCurrentScreen()).toBe('battle');
    expect(session.getOperationWaveIndex()).toBe(
      session.getOperationCheckpoint()?.currentWaveIndex,
    );
    expect(session.getPartySlotCombatModule(0)).toBe(checkpointModule);
    expect(session.getOperationState()?.isWavePrepEditable).toBe(false);
    expect(getEngine(session).getSnapshot().awaitingNextWave).toBe(false);
  });

  it('3. return to formation keeps OperationState, checkpoint, and next wave index', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const checkpoint = session.getOperationCheckpoint();
    const waveIndex = session.getOperationWaveIndex();
    const cleared = session.getClearedWaveCount();
    const editedModule = 'df_guardian_mod_guard_focus';
    session.trySetOperationSlotCombatModule(0, editedModule);

    expect(session.returnToFormationPrep()).toBe(true);

    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.getOperationCheckpoint()).toEqual(checkpoint);
    expect(session.getOperationWaveIndex()).toBe(waveIndex);
    expect(session.getClearedWaveCount()).toBe(cleared);
    expect(session.isWavePrepSuspendedForFormation()).toBe(true);
    expect(session.getOperationState()?.isWavePrepEditable).toBe(true);
    expect(session.getPartySlotCombatModule(0)).toBe(editedModule);
  });

  it('4. returns from formation to wave prep and resumes the same next-wave edit', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const editedModule = 'df_guardian_mod_guard_focus';
    session.trySetOperationSlotCombatModule(0, editedModule);
    expect(session.returnToFormationPrep()).toBe(true);

    expect(session.returnToWavePrepFromFormation()).toBe(true);

    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(session.isWavePrepSuspendedForFormation()).toBe(false);
    expect(session.getOperationState()?.isWavePrepEditable).toBe(true);
    expect(session.getPartySlotCombatModule(0)).toBe(editedModule);
    expect(session.isAwaitingNextWave()).toBe(true);
  });

  it('5. restart from wave zero clears wave prep state and uncommitted edits', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    session.trySetOperationSlotCombatModule(0, 'df_guardian_mod_guard_focus');

    expect(session.restartOperationFromWaveZero()).toBe(true);

    expect(session.getCurrentScreen()).toBe('formation');
    expect(session.getOperationWaveIndex()).toBe(0);
    expect(session.getClearedWaveCount()).toBe(0);
    expect(session.getOperationState()?.isWavePrepEditable).toBe(false);
    expect(session.isAwaitingNextWave()).toBe(false);
    expect(session.shouldShowWavePrepRetry()).toBe(false);
  });

  it('6. does not spawn next-wave enemies during wave prep or formation suspension', () => {
    session = bootVerifySession();
    const engine = getEngine(session);
    reachAwaitingNextWave(engine);
    const waveIndexBefore = engine.getSnapshot().waveIndex;
    const startNextWaveSpy = vi.spyOn(engine, 'startNextWave');

    expect(engine.getSnapshot().awaitingNextWave).toBe(true);
    expect(startNextWaveSpy).not.toHaveBeenCalled();

    expect(session.returnToFormationPrep()).toBe(true);
    expect(engine.getSnapshot().awaitingNextWave).toBe(true);
    expect(engine.getSnapshot().waveIndex).toBe(waveIndexBefore);
    expect(startNextWaveSpy).not.toHaveBeenCalled();

    engine.tick(0.1);
    expect(startNextWaveSpy).not.toHaveBeenCalled();
    expect(engine.getSnapshot().awaitingNextWave).toBe(true);

    startNextWaveSpy.mockRestore();
  });

  it('7. retry API failure keeps wave prep screen and edit state', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const editedModule = 'df_guardian_mod_guard_focus';
    session.trySetOperationSlotCombatModule(0, editedModule);
    session.clearOperationCheckpoint();

    clickWavePrepRetryButton(document.body, '現在Waveを同設定で再戦');

    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(session.getPartySlotCombatModule(0)).toBe(editedModule);
    expect(session.getOperationState()?.isWavePrepEditable).toBe(true);
  });

  it('8. defeat retry and verify ON paths remain unchanged', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    expect(session.shouldShowWavePrepRetry()).toBe(true);
    expect(session.shouldShowDefeatRetry()).toBe(false);

    session.destroy();
    setVerifyModeEnabled(false);
    session = createSession();
    sortieToStage(session, '1');
    session.start();
    document.body
      .querySelector<HTMLButtonElement>('.skill-menu-return-to-battle-button')
      ?.click();
    getEngine(session).applyDefeatTransition([]);
    expect(session.shouldShowDefeatRetry()).toBe(true);
  });
});
