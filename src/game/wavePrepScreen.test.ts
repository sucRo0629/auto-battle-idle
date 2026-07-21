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
import type { GameData, PartySlotState, ClassId } from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
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

function createSessionWithPrepGrants(
  stageId: string,
  prepResourceGrants: readonly (number | undefined)[],
): GameSession {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const stages = loaded.data.stages.map((stage) =>
    stage.id !== stageId
      ? stage
      : {
          ...stage,
          waves: stage.waves.map((wave, waveIndex) => {
            const prepResourceGrant = prepResourceGrants[waveIndex];
            const next = { ...wave };
            if (prepResourceGrant === undefined) {
              delete next.prepResourceGrant;
            } else {
              next.prepResourceGrant = prepResourceGrant;
            }
            return next;
          }),
        },
  );
  const container = document.createElement('div');
  document.body.appendChild(container);
  return new GameSession({ ...loaded.data, stages }, container);
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
    expect(session.trySetOperationSlotCombatModule(0, 'at_sorcerer_mod_chain')).toBe(
      false,
    );

    waitForEngaged(getEngine(session));
    expect(session.tryUpdateOperationPartySlot(0, member).ok).toBe(false);
    expect(session.trySetOperationSlotCombatModule(0, 'at_sorcerer_mod_chain')).toBe(
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
    expect(afterPlayers[0].statusEffects.some((effect) => effect.id === 'test')).toBe(
      false,
    );
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

    session.destroy();
    session = createSession();
    sortieToStage(session, '1');
    sortieToStage(session, '2');
    expect(session.getOperationState()?.source).toEqual({
      kind: 'fixedStage',
      stageId: '2',
    });
  });
});

describe('Wave preparation resource grants (R12h)', () => {
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

  it('opens Wave 1 prep and grants once when Wave 1 grant is positive', () => {
    session = createSessionWithPrepGrants('1', [5, 0]);
    sortieToStage(session, '1');
    const resolveFormationCloseScreen = (
      session as unknown as { resolveFormationCloseScreen: () => string }
    ).resolveFormationCloseScreen.bind(session);

    expect(resolveFormationCloseScreen()).toBe('wavePrep');
    expect(session.getOperationUnspentResource()).toBe(5);
    expect(session.getOperationCheckpoint()?.initialResourceGrantApplied).toBe(true);
    expect(resolveFormationCloseScreen()).toBe('wavePrep');
    expect(session.getOperationUnspentResource()).toBe(5);
  });

  it('skips Wave 1 prep when Wave 1 grant is explicit zero', () => {
    session = createSessionWithPrepGrants('1', [0, 0]);
    sortieToStage(session, '1');
    const resolveFormationCloseScreen = (
      session as unknown as { resolveFormationCloseScreen: () => string }
    ).resolveFormationCloseScreen.bind(session);

    expect(resolveFormationCloseScreen()).toBe('battle');
    expect(session.getOperationUnspentResource()).toBe(0);
  });

  it('opens later Wave prep without catalog fallback for explicit zero', () => {
    setVerifyModeEnabled(true);
    setDebugLoopStageId('1');
    setDebugLoopWaveIndex(null);
    session = createSessionWithPrepGrants('1', [0, 0]);
    session.start();

    reachAwaitingNextWave(getEngine(session));

    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(session.getOperationUnspentResource()).toBe(0);
  });

  it('uses catalog fallback for an omitted later Wave grant', () => {
    setVerifyModeEnabled(true);
    setDebugLoopStageId('1');
    setDebugLoopWaveIndex(null);
    session = createSessionWithPrepGrants('1', [0, undefined]);
    session.start();

    reachAwaitingNextWave(getEngine(session));

    expect(session.getOperationUnspentResource()).toBe(12);
  });
});

describe('OperationState wave prep API (R6e unit)', () => {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const gameData = loaded.data;
  const save = createDefaultSave(gameData, 'demo');

  it('rejects edits when wave prep editing is disabled', () => {
    const op = OperationState.begin({
      source: { kind: 'fixedStage', stageId: '1' },
      party: save.party,
      moduleSelection: new PartyCombatModuleSelection(),
    })!;
    const member = createMemberFromClass('at_sorcerer', gameData);
    expect(op.tryUpdatePartySlot(0, member, gameData).ok).toBe(false);
    expect(op.trySetCombatModuleForSlot(0, 'at_sorcerer_mod_chain', gameData)).toBe(
      false,
    );
  });

  it('no-ops when setting the same effective module', () => {
    const selection = new PartyCombatModuleSelection();
    selection.setSelectedCombatModuleId(0, 'df_guardian_mod_guard_focus');
    const op = OperationState.begin({
      source: { kind: 'fixedStage', stageId: '1' },
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
    expect(
      document.body.querySelector('.wave-prep-screen__return-stage-select')
        ?.textContent,
    ).toBe('ステージ選択に戻る');
  });

  it('1b. return to stage select aborts incomplete operation', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const stageId = session.getSaveState().stageProgress.currentStageId;
    session.trySetOperationSlotCombatModule(0, 'df_guardian_mod_guard_focus');

    expect(session.canReturnToStageSelectFromWavePrep()).toBe(true);
    document.body
      .querySelector<HTMLButtonElement>('.wave-prep-screen__return-stage-select')
      ?.click();

    expect(session.getCurrentScreen()).toBe('stageSelect');
    expect(session.getOperationState()).toBeNull();
    expect(session.getOperationCheckpoint()).toBeNull();
    expect(session.shouldShowWavePrepRetry()).toBe(false);
    expect(session.canReturnToStageSelectFromWavePrep()).toBe(false);
    expect(session.getSaveState().stageProgress.currentStageId).toBe(stageId);
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

const R8C_PASSIVE_ID = 'df_guardian_op_block_rate_up';
const R8C_GUARDIAN_SLOT = 0;
const WAVE_CLEAR_RESOURCE_GRANT = 12;
const R8C_PASSIVE_ACQUIRE_COST = 1;

function selectWavePrepPassive(
  container: ParentNode,
  slotIndex: number,
  passiveId: string,
): void {
  const rows = container.querySelectorAll('.wave-prep-screen__slot');
  const row = rows[slotIndex];
  if (!row) throw new Error(`Wave prep slot row not found: ${slotIndex}`);
  const card = row.querySelector<HTMLElement>(
    `.operation-passive-prep__candidate[data-passive-id="${passiveId}"]`,
  );
  if (!card) throw new Error(`Wave prep passive card not found: ${passiveId}`);
  // Formal UI acquires from the card button; selecting is implicit.
  void card;
}

function clickWavePrepAcquire(container: ParentNode, slotIndex: number): void {
  const rows = container.querySelectorAll('.wave-prep-screen__slot');
  const row = rows[slotIndex];
  if (!row) throw new Error(`Wave prep slot row not found: ${slotIndex}`);
  const button = row.querySelector<HTMLButtonElement>(
    '.operation-passive-prep__acquire:not(:disabled)',
  );
  if (!button) {
    const anyButton = row.querySelector<HTMLButtonElement>(
      '.operation-passive-prep__acquire',
    );
    if (!anyButton) throw new Error('Wave prep acquire button not found');
    anyButton.click();
    return;
  }
  button.click();
}

describe('Wave prep operation passive acquisition (R8c)', () => {
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

  it('1. grants operation resource once after intermediate wave clear', () => {
    session = bootVerifySession();
    expect(session.getOperationUnspentResource()).toBe(0);
    reachAwaitingNextWave(getEngine(session));
    expect(session.getOperationUnspentResource()).toBe(WAVE_CLEAR_RESOURCE_GRANT);
  });

  it('2. does not re-grant resource when returning to the same wave prep', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    expect(session.getOperationUnspentResource()).toBe(WAVE_CLEAR_RESOURCE_GRANT);
    session.tryAcquireOperationPassive(R8C_GUARDIAN_SLOT, R8C_PASSIVE_ID);
    expect(session.getOperationUnspentResource()).toBe(WAVE_CLEAR_RESOURCE_GRANT - R8C_PASSIVE_ACQUIRE_COST);

    expect(session.returnToFormationPrep()).toBe(true);
    expect(session.returnToWavePrepFromFormation()).toBe(true);
    expect(session.getOperationUnspentResource()).toBe(WAVE_CLEAR_RESOURCE_GRANT - R8C_PASSIVE_ACQUIRE_COST);
  });

  it('3. acquires candidate passive for matching slot and spends resource', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    expect(
      session.tryAcquireOperationPassive(R8C_GUARDIAN_SLOT, R8C_PASSIVE_ID),
    ).toBe(true);
    expect(session.getOperationAcquiredPassiveIds(R8C_GUARDIAN_SLOT)).toEqual([
      R8C_PASSIVE_ID,
    ]);
    expect(session.getOperationUnspentResource()).toBe(WAVE_CLEAR_RESOURCE_GRANT - R8C_PASSIVE_ACQUIRE_COST);
  });

  it('4. module selection and passive acquisition coexist', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    const moduleId = 'df_guardian_mod_guard_focus';
    expect(session.trySetOperationSlotCombatModule(R8C_GUARDIAN_SLOT, moduleId)).toBe(
      true,
    );
    expect(
      session.tryAcquireOperationPassive(R8C_GUARDIAN_SLOT, R8C_PASSIVE_ID),
    ).toBe(true);
    expect(session.getPartySlotCombatModule(R8C_GUARDIAN_SLOT)).toBe(moduleId);
    expect(session.getOperationAcquiredPassiveIds(R8C_GUARDIAN_SLOT)).toEqual([
      R8C_PASSIVE_ID,
    ]);
  });

  it('5. duplicate acquire, insufficient balance, and invalid input leave state unchanged', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    expect(
      session.tryAcquireOperationPassive(R8C_GUARDIAN_SLOT, R8C_PASSIVE_ID),
    ).toBe(true);

    const beforeIds = session.getOperationAcquiredPassiveIds(R8C_GUARDIAN_SLOT);
    const beforeResource = session.getOperationUnspentResource();

    expect(
      session.tryAcquireOperationPassive(R8C_GUARDIAN_SLOT, R8C_PASSIVE_ID),
    ).toBe(false);
    expect(session.tryAcquireOperationPassive(R8C_GUARDIAN_SLOT, 'invalid')).toBe(
      false,
    );
    expect(session.tryAcquireOperationPassive(99, R8C_PASSIVE_ID)).toBe(false);
    expect(session.tryAcquireOperationPassive(-1, R8C_PASSIVE_ID)).toBe(false);

    expect(session.getOperationAcquiredPassiveIds(R8C_GUARDIAN_SLOT)).toEqual(
      beforeIds,
    );
    expect(session.getOperationUnspentResource()).toBe(beforeResource);
  });

  it('6. formation roundtrip preserves acquired passives and resource balance', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    expect(
      session.tryAcquireOperationPassive(R8C_GUARDIAN_SLOT, R8C_PASSIVE_ID),
    ).toBe(true);
    expect(session.returnToFormationPrep()).toBe(true);
    expect(session.returnToWavePrepFromFormation()).toBe(true);
    expect(session.getOperationAcquiredPassiveIds(R8C_GUARDIAN_SLOT)).toEqual([
      R8C_PASSIVE_ID,
    ]);
    expect(session.getOperationUnspentResource()).toBe(WAVE_CLEAR_RESOURCE_GRANT - R8C_PASSIVE_ACQUIRE_COST);
  });

  it('7. retry current wave restores checkpoint without uncommitted passive edits', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    expect(
      session.tryAcquireOperationPassive(R8C_GUARDIAN_SLOT, R8C_PASSIVE_ID),
    ).toBe(true);

    expect(session.retryCurrentWaveFromCheckpoint()).toBe(true);

    expect(session.getOperationAcquiredPassiveIds(R8C_GUARDIAN_SLOT)).toEqual([]);
    // Checkpoint is Wave 開始時点（付与前）。未確定取得を巻き戻すとリソースも 0。
    expect(session.getOperationUnspentResource()).toBe(0);
  });

  it('8. restart from wave zero clears acquired passives and resource', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    expect(
      session.tryAcquireOperationPassive(R8C_GUARDIAN_SLOT, R8C_PASSIVE_ID),
    ).toBe(true);

    expect(session.restartOperationFromWaveZero()).toBe(true);

    for (let slot = 0; slot < 4; slot += 1) {
      expect(session.getOperationAcquiredPassiveIds(slot)).toEqual([]);
    }
    expect(session.getOperationUnspentResource()).toBe(0);
  });

  it('9. committed checkpoint includes acquired passives and remaining resource', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    expect(
      session.tryAcquireOperationPassive(R8C_GUARDIAN_SLOT, R8C_PASSIVE_ID),
    ).toBe(true);

    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);

    const checkpoint = session.getOperationCheckpoint();
    expect(checkpoint?.acquiredOperationPassives).toEqual([
      { slotIndex: R8C_GUARDIAN_SLOT, passiveIds: [R8C_PASSIVE_ID] },
    ]);
    expect(checkpoint?.unspentResource).toBe(
      WAVE_CLEAR_RESOURCE_GRANT - R8C_PASSIVE_ACQUIRE_COST,
    );
    expect(checkpoint?.lastResourceGrantClearedWaveCount).toBe(1);
  });

  it('10. acquired passive does not affect battle combatant learnedPassiveIds yet', () => {
    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));
    expect(
      session.tryAcquireOperationPassive(R8C_GUARDIAN_SLOT, R8C_PASSIVE_ID),
    ).toBe(true);
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);

    const players = asBattleEngineInternals(getEngine(session)).players;
    const guardian = players.find((p) => p.partySlotIndex === R8C_GUARDIAN_SLOT);
    expect(guardian?.learnedPassiveIds ?? []).not.toContain(R8C_PASSIVE_ID);
  });

  it('UI exposes resource, acquired passives, and acquire button flow', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    const passive = loaded.data.skillRegistry.passives[R8C_PASSIVE_ID];
    expect(passive).toBeDefined();
    expect(passive!.name).not.toBe('');
    expect(passive!.name).toBe('ブロック率増加');

    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));

    expect(document.body.textContent).toContain(`作戦内リソース: ${WAVE_CLEAR_RESOURCE_GRANT}`);
    expect(document.querySelector('[data-prep-kind="combat-module"]')).not.toBeNull();
    expect(document.querySelector('[data-prep-kind="operation-passive"]')).not
      .toBeNull();
    expect(document.body.textContent).toContain('戦闘方式');
    expect(document.body.textContent).toContain('作戦内パッシブ');

    selectWavePrepPassive(document.body, R8C_GUARDIAN_SLOT, R8C_PASSIVE_ID);
    clickWavePrepAcquire(document.body, R8C_GUARDIAN_SLOT);

    expect(session.getOperationAcquiredPassiveIds(R8C_GUARDIAN_SLOT)).toEqual([
      R8C_PASSIVE_ID,
    ]);
    expect(document.body.textContent).toContain(`作戦内リソース: ${WAVE_CLEAR_RESOURCE_GRANT - R8C_PASSIVE_ACQUIRE_COST}`);
    expect(document.body.textContent).toContain('取得済み');
    expect(document.body.textContent).not.toContain('堅盾の構え');
    const acquiredCard = document.querySelector(
      `[data-passive-id="${R8C_PASSIVE_ID}"][data-acquired="true"]`,
    );
    expect(acquiredCard).not.toBeNull();
    expect(acquiredCard?.textContent).toContain(passive!.name);
    expect(acquiredCard?.textContent).not.toContain('消費');
  });
});

function collectWavePrepSelectOptionClassIds(root: ParentNode): ClassId[] {
  const classIds: ClassId[] = [];
  for (const select of root.querySelectorAll<HTMLSelectElement>(
    '.wave-prep-screen__class-select',
  )) {
    for (const option of select.options) {
      classIds.push(option.value as ClassId);
    }
  }
  return classIds;
}

describe('Wave prep allowed class ids (R12m 2T6 fixedStage regression)', () => {
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

  it('fixedStage WavePrep uses unlockedClassIds and exposes out-of-series-A unlocked classes', () => {
    const seriesA = gameData.problemSeriesCatalog.series.find(
      (series) => series.seriesId === 'r12m_series_a',
    );
    if (seriesA === undefined) {
      throw new Error('Expected problem series r12m_series_a');
    }
    const allowedClassIds = seriesA.allowedClassIds;
    expect(allowedClassIds).toHaveLength(PARTY_SLOT_COUNT);

    session = bootVerifySession();
    reachAwaitingNextWave(getEngine(session));

    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(session.getOperationState()?.source).toEqual({
      kind: 'fixedStage',
      stageId: '1',
    });

    const wavePrepScreenHost = (
      session as unknown as {
        wavePrepScreenHost: {
          callbacks: {
            getAllowedClassIds?: () => readonly ClassId[] | undefined;
            getUnlockedClassIds: () => ClassId[];
          };
        };
      }
    ).wavePrepScreenHost;

    expect(wavePrepScreenHost.callbacks.getAllowedClassIds?.()).toBeUndefined();

    const unlockedClassIds = wavePrepScreenHost.callbacks.getUnlockedClassIds();
    const outOfSeriesAUnlockedClassId = unlockedClassIds.find(
      (classId) =>
        !allowedClassIds.includes(classId) &&
        gameData.classRegistry[classId] !== undefined,
    );
    if (outOfSeriesAUnlockedClassId === undefined) {
      throw new Error(
        'No unlocked class found outside r12m_series_a allowedClassIds with registry entry',
      );
    }
    expect(unlockedClassIds).toContain(outOfSeriesAUnlockedClassId);
    for (const allowedClassId of allowedClassIds) {
      expect(unlockedClassIds).toContain(allowedClassId);
    }

    const classSelects = document.body.querySelectorAll<HTMLSelectElement>(
      '.wave-prep-screen__class-select',
    );
    expect(classSelects).toHaveLength(4);
    for (const select of classSelects) {
      expect(select.options.length).toBeGreaterThan(0);
    }

    const optionClassIds = collectWavePrepSelectOptionClassIds(document.body);
    expect(optionClassIds.length).toBeGreaterThan(0);
    expect(optionClassIds).toContain(outOfSeriesAUnlockedClassId);
    for (const optionClassId of optionClassIds) {
      expect(unlockedClassIds).toContain(optionClassId);
    }

    const beforeParty = structuredClone(session.getOperationParty());
    const duplicateClass = beforeParty[1]?.classId;
    if (!duplicateClass) throw new Error('missing duplicate class for regression');
    const duplicateResult = session.tryUpdateOperationPartySlot(
      0,
      createMemberFromClass(duplicateClass, gameData),
    );
    expect(duplicateResult.ok).toBe(false);
    expect(duplicateResult.reason).toBe('duplicateClass');
    expect(session.getOperationParty()).toEqual(beforeParty);
  });
});
