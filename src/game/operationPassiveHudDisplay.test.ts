/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import type { GameData, PartyMemberState, PartySlotState } from '../battle/types.ts';
import { collectHudStatusEffectBadgeDisplays } from '../battle/statusEffectDisplay.ts';
import {
  asBattleEngineInternals,
  reachAwaitingNextWave,
  waitForEngaged,
} from '../battle/test/battleFieldSpec.harness.ts';
import { setDebugLoopStageId, setDebugLoopWaveIndex } from '../dev/debugLoopStage.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import type { BattleView } from './BattleView.ts';
import { GameSession } from '../game/GameSession.ts';

const R8E_PASSIVE_ID = 'df_guardian_passive_2';
const R8E_PASSIVE_DISPLAY_NAME = '立ちはだかる壁';
const R8E_GUARDIAN_SLOT = 0;
const TICK_DT = 1 / 60;
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

function guardianMemberWithoutPassive2(gameData: GameData): PartyMemberState {
  const member = createMemberFromClass('df_guardian', gameData);
  member.build.learnedPassiveIds = member.build.learnedPassiveIds.filter(
    (id) => id !== R8E_PASSIVE_ID,
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
    R8E_GUARDIAN_SLOT,
    guardianMemberWithoutPassive2(gameData),
  );
  getEngine(session).restartBattle();
  commitOperationCheckpoint(session);
}

function acquireGuardianPassive2(session: GameSession): void {
  reachAwaitingNextWave(getEngine(session));
  expect(session.tryAcquireOperationPassive(R8E_GUARDIAN_SLOT, R8E_PASSIVE_ID)).toBe(
    true,
  );
  expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
  tickSession(session, 5);
}

function refreshBattleHud(session: GameSession): void {
  tickSession(session, 3);
}

function clickWavePrepRetryButton(container: ParentNode, label: string): void {
  const buttons = container.querySelectorAll<HTMLButtonElement>(
    '.wave-prep-screen__retry-button',
  );
  const button = [...buttons].find((entry) => entry.textContent === label);
  if (!button) throw new Error(`Wave prep retry button not found: ${label}`);
  button.click();
}

function triggerDefeat(session: GameSession, survivingIndices: number[] = []): void {
  getEngine(session).applyDefeatTransition(survivingIndices);
}

function queryVisibleOperationPassiveLines(container: ParentNode): HTMLElement[] {
  return [...container.querySelectorAll('.party-hud-operation-passives')].filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && !element.hidden && element.textContent !== '',
  );
}

function tickSession(session: GameSession, frames: number): void {
  for (let i = 0; i < frames; i += 1) {
    session.tick(TICK_DT, TICK_MS);
  }
}

describe('partyHudOperationPassives (R8e unit)', () => {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);

  it('resolves Japanese display names and omits unknown IDs', async () => {
    const { resolveOperationAcquiredPassiveDisplayNames } = await import(
      '../ui/partyHudOperationPassives.ts'
    );
    expect(
      resolveOperationAcquiredPassiveDisplayNames(
        [R8E_PASSIVE_ID, 'missing_passive'],
        loaded.data.skillRegistry.passives,
      ),
    ).toEqual([R8E_PASSIVE_DISPLAY_NAME]);
  });
});

describe('Operation passive ally HUD display (R8e)', () => {
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

  it('1. does not show operation passive names on slots without acquisition', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    waitForEngaged(getEngine(session));

    expect(queryVisibleOperationPassiveLines(document.body)).toEqual([]);
    expect(document.body.textContent).not.toContain(R8E_PASSIVE_ID);
  });

  it('2. shows acquired df_guardian_passive_2 on guardian slot only in Japanese', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    acquireGuardianPassive2(session);

    const lines = queryVisibleOperationPassiveLines(document.body);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toBe(R8E_PASSIVE_DISPLAY_NAME);
    expect(document.body.textContent).not.toContain(R8E_PASSIVE_ID);
  });

  it('3. never renders passive IDs in ally HUD text', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    acquireGuardianPassive2(session);

    const partyHud = document.body.querySelector('.party-hud-panel');
    expect(partyHud?.textContent ?? '').not.toContain(R8E_PASSIVE_ID);
  });

  it('4. does not show operation passive list on enemy HUD', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    acquireGuardianPassive2(session);

    const enemyHud = document.body.querySelector('.enemy-hud-panel');
    expect(enemyHud?.querySelector('.party-hud-operation-passives')).toBeNull();
    expect(queryVisibleOperationPassiveLines(enemyHud ?? document.createElement('div'))).toEqual(
      [],
    );
  });

  it('5. does not add always-on DEF passive aura to HUD status badges', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    acquireGuardianPassive2(session);
    waitForEngaged(getEngine(session));

    const guardian = asBattleEngineInternals(getEngine(session)).players.find(
      (ally) => ally.partySlotIndex === R8E_GUARDIAN_SLOT,
    );
    expect(guardian).toBeDefined();
    const badges = collectHudStatusEffectBadgeDisplays(guardian!.statusEffects, {
      baseMaxHp: guardian!.baseMaxHp,
      atk: guardian!.atk,
      def: guardian!.def,
      res: guardian!.res,
    });
    expect(badges.some((badge) => badge.category === 'def')).toBe(false);
  });

  it('6. keeps operation passive list during wave prep and pause', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    reachAwaitingNextWave(getEngine(session));
    expect(session.getCurrentScreen()).toBe('wavePrep');
    expect(session.tryAcquireOperationPassive(R8E_GUARDIAN_SLOT, R8E_PASSIVE_ID)).toBe(
      true,
    );
    expect(session.getOperationAcquiredPassiveIds(R8E_GUARDIAN_SLOT)).toEqual([
      R8E_PASSIVE_ID,
    ]);
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
    tickSession(session, 5);
    expect(queryVisibleOperationPassiveLines(document.body)).toHaveLength(1);

    const view = getView(session);
    view.setBattlePaused(true);
    tickSession(session, 3);
    expect(queryVisibleOperationPassiveLines(document.body)).toHaveLength(1);
    view.setBattlePaused(false);
  });

  it('7. keeps operation passive list after next wave start', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    acquireGuardianPassive2(session);

    expect(session.getOperationWaveIndex()).toBe(1);
    expect(queryVisibleOperationPassiveLines(document.body)).toHaveLength(1);
    expect(session.getOperationAcquiredPassiveIds(R8E_GUARDIAN_SLOT)).toEqual([
      R8E_PASSIVE_ID,
    ]);
  });

  it('8. checkpoint retry before commit clears uncommitted acquisition display', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    reachAwaitingNextWave(getEngine(session));
    expect(session.tryAcquireOperationPassive(R8E_GUARDIAN_SLOT, R8E_PASSIVE_ID)).toBe(
      true,
    );

    clickWavePrepRetryButton(document.body, '現在Waveを同設定で再戦');
    refreshBattleHud(session);
    expect(queryVisibleOperationPassiveLines(document.body)).toEqual([]);
    expect(session.getOperationAcquiredPassiveIds(R8E_GUARDIAN_SLOT)).toEqual([]);
  });

  it('9. committed acquisition display persists after current-wave retry', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    acquireGuardianPassive2(session);
    triggerDefeat(session);

    expect(session.retryCurrentWaveFromCheckpoint()).toBe(true);
    refreshBattleHud(session);
    expect(queryVisibleOperationPassiveLines(document.body)).toHaveLength(1);
    expect(queryVisibleOperationPassiveLines(document.body)[0]?.textContent).toBe(
      R8E_PASSIVE_DISPLAY_NAME,
    );
  });

  it('10. restart from wave zero clears operation passive display', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    acquireGuardianPassive2(session);
    triggerDefeat(session);

    expect(session.restartOperationFromWaveZero()).toBe(true);
    refreshBattleHud(session);
    expect(queryVisibleOperationPassiveLines(document.body)).toEqual([]);
    expect(session.getOperationAcquiredPassiveIds(R8E_GUARDIAN_SLOT)).toEqual([]);
  });

  it('11. keeps existing conditional status badges visible', () => {
    session = bootVerifySession();
    stripGuardianPassive2InOperation(session, gameData);
    acquireGuardianPassive2(session);
    waitForEngaged(getEngine(session));

    const guardian = asBattleEngineInternals(getEngine(session)).players.find(
      (ally) => ally.partySlotIndex === R8E_GUARDIAN_SLOT,
    );
    expect(guardian).toBeDefined();

    guardian!.statusEffects.push({
      id: 'test_vuln',
      kind: 'debuff',
      stat: 'damageTaken',
      multiplier: 1.5,
      durationSec: 5,
      remainingSec: 5,
    });

    const badges = collectHudStatusEffectBadgeDisplays(guardian!.statusEffects, {
      baseMaxHp: guardian!.baseMaxHp,
      atk: guardian!.atk,
      def: guardian!.def,
      res: guardian!.res,
    });
    expect(badges.some((badge) => badge.category === 'damageIncrease')).toBe(true);
    expect(badges.some((badge) => badge.category === 'def')).toBe(false);
  });
});
