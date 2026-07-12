/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEffectiveDef } from '../battle/combatMath.ts';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { createAlliesFromPartyState } from '../battle/entities.ts';
import { mergeOperationPassivesIntoBuild } from '../battle/mergeOperationPassivesIntoBuild.ts';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import type {
  CombatantState,
  GameData,
  PartyMemberState,
  PartySlotState,
} from '../battle/types.ts';
import {
  asBattleEngineInternals,
  reachAwaitingNextWave,
} from '../battle/test/battleFieldSpec.harness.ts';
import { setDebugLoopStageId, setDebugLoopWaveIndex } from '../dev/debugLoopStage.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { GameSession } from './GameSession.ts';

const R8D_PASSIVE_ID = 'df_guardian_passive_2';
const R8D_GUARDIAN_SLOT = 0;
const R8D_DEF_MULTIPLIER = 1.05;

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

function triggerDefeat(session: GameSession, survivingIndices: number[] = []): void {
  getEngine(session).applyDefeatTransition(survivingIndices);
}

function guardianMemberWithoutPassive2(gameData: GameData): PartyMemberState {
  const member = createMemberFromClass('df_guardian', gameData);
  member.build.learnedPassiveIds = member.build.learnedPassiveIds.filter(
    (id) => id !== R8D_PASSIVE_ID,
  );
  return member;
}

function setOperationPartySlot(
  session: GameSession,
  slotIndex: number,
  member: PartyMemberState,
): void {
  const op = (session as unknown as {
    operationState: { partySlots: PartySlotState[] };
  }).operationState;
  op.partySlots[slotIndex] = structuredClone(member);
}

function commitOperationCheckpoint(session: GameSession): void {
  const host = session as unknown as {
    commitCheckpointFromCurrentOperationState: () => boolean;
  };
  expect(host.commitCheckpointFromCurrentOperationState()).toBe(true);
}

function stripGuardianPassive2InOperation(session: GameSession, gameData: GameData): void {
  setOperationPartySlot(
    session,
    R8D_GUARDIAN_SLOT,
    guardianMemberWithoutPassive2(gameData),
  );
  getEngine(session).restartBattle();
  commitOperationCheckpoint(session);
}

function getGuardianAlly(engine: BattleEngine): CombatantState {
  const { players } = asBattleEngineInternals(engine);
  const guardian = players.find(
    (ally) =>
      ally.partySlotIndex === R8D_GUARDIAN_SLOT && ally.classId === 'df_guardian',
  );
  if (!guardian) throw new Error('df_guardian ally not found');
  return guardian;
}

function guardianEffectiveDef(engine: BattleEngine): number {
  return getEffectiveDef(getGuardianAlly(engine));
}

function expectedDefWithPassive2(baseDef: number): number {
  return baseDef * R8D_DEF_MULTIPLIER;
}

function clickWavePrepRetryButton(container: ParentNode, label: string): void {
  const buttons = container.querySelectorAll<HTMLButtonElement>(
    '.wave-prep-screen__retry-button',
  );
  const button = [...buttons].find((entry) => entry.textContent === label);
  if (!button) throw new Error(`Wave prep retry button not found: ${label}`);
  button.click();
}

describe('mergeOperationPassivesIntoBuild (R8d unit)', () => {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const gameData = loaded.data;

  it('ignores invalid IDs, wrong-class passives, and duplicates', () => {
    const build = {
      learnedPassiveIds: ['df_guardian_passive_1'],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    };
    mergeOperationPassivesIntoBuild(
      build,
      'df_guardian',
      [
        '',
        'missing_passive',
        'at_swordsman_passive_1',
        'df_guardian_passive_1',
        R8D_PASSIVE_ID,
      ],
      gameData.skillRegistry.passives,
    );
    expect(build.learnedPassiveIds).toEqual([
      'df_guardian_passive_1',
      R8D_PASSIVE_ID,
    ]);
  });
});

describe('Operation passive battle injection (R8d)', () => {
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

  it('1. without acquisition keeps baseline learnedPassiveIds and DEF', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    const engine = getEngine(session);
    const guardian = getGuardianAlly(engine);
    const baselineDef = guardian.def;

    expect(guardian.build.learnedPassiveIds).not.toContain(R8D_PASSIVE_ID);
    expect(guardianEffectiveDef(engine)).toBe(baselineDef);
    expect(session.getOperationAcquiredPassiveIds(R8D_GUARDIAN_SLOT)).toEqual([]);
  });

  it('2. acquired passive merges into matching slot learnedPassiveIds', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    reachAwaitingNextWave(getEngine(session));
    expect(session.tryAcquireOperationPassive(R8D_GUARDIAN_SLOT, R8D_PASSIVE_ID)).toBe(
      true,
    );
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);

    const guardian = getGuardianAlly(getEngine(session));
    expect(guardian.build.learnedPassiveIds).toContain(R8D_PASSIVE_ID);
  });

  it('3. acquired passive raises guardian DEF via existing runtime path', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    const engine = getEngine(session);
    const baselineDef = guardianEffectiveDef(engine);

    reachAwaitingNextWave(engine);
    expect(session.tryAcquireOperationPassive(R8D_GUARDIAN_SLOT, R8D_PASSIVE_ID)).toBe(
      true,
    );
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);

    const boostedDef = guardianEffectiveDef(getEngine(session));
    expect(boostedDef).toBeCloseTo(
      expectedDefWithPassive2(getGuardianAlly(getEngine(session)).def),
      5,
    );
    expect(boostedDef).toBeGreaterThan(baselineDef);
  });

  it('4. does not affect other slots, other classes, or enemies', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    reachAwaitingNextWave(getEngine(session));
    expect(session.tryAcquireOperationPassive(R8D_GUARDIAN_SLOT, R8D_PASSIVE_ID)).toBe(
      true,
    );
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);

    const { players, enemies } = asBattleEngineInternals(getEngine(session));
    for (const ally of players) {
      if (ally.partySlotIndex !== R8D_GUARDIAN_SLOT) {
        expect(ally.build.learnedPassiveIds).not.toContain(R8D_PASSIVE_ID);
      }
    }
    for (const enemy of enemies) {
      expect(enemy.build.learnedPassiveIds).not.toContain(R8D_PASSIVE_ID);
    }
  });

  it('5. does not duplicate fixed class passives when merging', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    reachAwaitingNextWave(getEngine(session));
    expect(session.tryAcquireOperationPassive(R8D_GUARDIAN_SLOT, R8D_PASSIVE_ID)).toBe(
      true,
    );
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);

    const guardian = getGuardianAlly(getEngine(session));
    const passive1Count = guardian.build.learnedPassiveIds.filter(
      (id) => id === 'df_guardian_passive_1',
    ).length;
    const passive2Count = guardian.build.learnedPassiveIds.filter(
      (id) => id === R8D_PASSIVE_ID,
    ).length;
    expect(passive1Count).toBe(1);
    expect(passive2Count).toBe(1);
  });

  it('6. maintains acquired effect after next wave start', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    reachAwaitingNextWave(getEngine(session));
    expect(session.tryAcquireOperationPassive(R8D_GUARDIAN_SLOT, R8D_PASSIVE_ID)).toBe(
      true,
    );
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);

    const guardian = getGuardianAlly(getEngine(session));
    expect(guardian.build.learnedPassiveIds).toContain(R8D_PASSIVE_ID);
    expect(guardianEffectiveDef(getEngine(session))).toBeCloseTo(
      expectedDefWithPassive2(guardian.def),
      5,
    );
    expect(session.getOperationAcquiredPassiveIds(R8D_GUARDIAN_SLOT)).toEqual([
      R8D_PASSIVE_ID,
    ]);
  });

  it('7. retry before checkpoint commit drops uncommitted acquisition from runtime', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    reachAwaitingNextWave(getEngine(session));
    expect(session.tryAcquireOperationPassive(R8D_GUARDIAN_SLOT, R8D_PASSIVE_ID)).toBe(
      true,
    );

    clickWavePrepRetryButton(document.body, '現在Waveを同設定で再戦');

    const guardian = getGuardianAlly(getEngine(session));
    expect(guardian.build.learnedPassiveIds).not.toContain(R8D_PASSIVE_ID);
    expect(guardianEffectiveDef(getEngine(session))).toBe(guardian.def);
    expect(session.getOperationAcquiredPassiveIds(R8D_GUARDIAN_SLOT)).toEqual([]);
  });

  it('8. committed acquisition persists after current-wave retry', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    reachAwaitingNextWave(getEngine(session));
    expect(session.tryAcquireOperationPassive(R8D_GUARDIAN_SLOT, R8D_PASSIVE_ID)).toBe(
      true,
    );
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
    triggerDefeat(session);

    expect(session.retryCurrentWaveFromCheckpoint()).toBe(true);
    const guardian = getGuardianAlly(getEngine(session));
    expect(guardian.build.learnedPassiveIds).toContain(R8D_PASSIVE_ID);
    expect(guardianEffectiveDef(getEngine(session))).toBeCloseTo(
      expectedDefWithPassive2(guardian.def),
      5,
    );
  });

  it('9. restart from wave zero clears operation-acquired state', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    reachAwaitingNextWave(getEngine(session));
    expect(session.tryAcquireOperationPassive(R8D_GUARDIAN_SLOT, R8D_PASSIVE_ID)).toBe(
      true,
    );
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
    expect(session.getOperationAcquiredPassiveIds(R8D_GUARDIAN_SLOT)).toEqual([
      R8D_PASSIVE_ID,
    ]);
    triggerDefeat(session);

    expect(session.restartOperationFromWaveZero()).toBe(true);
    expect(session.getOperationAcquiredPassiveIds(R8D_GUARDIAN_SLOT)).toEqual([]);
    expect(session.getOperationWaveIndex()).toBe(0);
  });

  it('10. does not mutate Save party or Operation party build snapshots', () => {
    session = bootVerifySession();
    const saveBefore = structuredClone(
      (session as unknown as { save: { party: PartySlotState[] } }).save.party,
    );
    stripGuardianPassive2InOperation(session, gameData);
    const operationPartyBefore = structuredClone(session.getOperationParty());

    reachAwaitingNextWave(getEngine(session));
    expect(session.tryAcquireOperationPassive(R8D_GUARDIAN_SLOT, R8D_PASSIVE_ID)).toBe(
      true,
    );
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);

    const saveAfter = (session as unknown as { save: { party: PartySlotState[] } }).save
      .party;
    const operationPartyAfter = session.getOperationParty();

    expect(saveAfter).toEqual(saveBefore);
    expect(operationPartyAfter?.[R8D_GUARDIAN_SLOT]?.build.learnedPassiveIds).toEqual(
      operationPartyBefore?.[R8D_GUARDIAN_SLOT]?.build.learnedPassiveIds,
    );
    expect(
      operationPartyAfter?.[R8D_GUARDIAN_SLOT]?.build.learnedPassiveIds,
    ).not.toContain(R8D_PASSIVE_ID);
  });
});

describe('createAlliesFromPartyState operation passive callback (R8d)', () => {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const levelCurves = loadLevelCurves(levelCurvesJson);

  it('injects only for ally slots with matching callback entries', () => {
    const gameData = loaded.data;
    const party: PartySlotState[] = [
      guardianMemberWithoutPassive2(gameData),
      createMemberFromClass('at_swordsman', gameData),
      null,
      null,
    ];
    const allies = createAlliesFromPartyState(
      gameData,
      party,
      levelCurves,
      undefined,
      (slotIndex) => (slotIndex === 0 ? [R8D_PASSIVE_ID] : []),
    );
    expect(allies[0]?.build.learnedPassiveIds).toContain(R8D_PASSIVE_ID);
    expect(allies[1]?.build.learnedPassiveIds).not.toContain(R8D_PASSIVE_ID);
  });
});
