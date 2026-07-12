/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEffectiveDef } from './combatMath.ts';
import { tryLoadGameData } from './data/loadGameData.ts';
import { mergeOperationPassivesIntoBuild } from './mergeOperationPassivesIntoBuild.ts';
import {
  battleXToScreenX,
  drawAllyRangePassiveBands,
} from '../render/battleRangePassiveBandDraw.ts';
import type { BattleEngine } from './BattleEngine.ts';
import type { CombatantState, GameData, PartyMemberState, PartySlotState } from './types.ts';
import {
  asBattleEngineInternals,
  reachAwaitingNextWave,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';
import {
  isAllyRangeBuffAuraPassive,
  isBattleXInsideAllyRangePassiveBand,
  resolveAllyRangePassiveBandInterval,
  resolveAllyRangePassiveBands,
} from './allyRangePassiveBands.ts';
import { syncBuffAuras } from './passiveEffects.ts';
import { filterEffectsForHudStatusBadges, isPassiveAlwaysOnStatAuraEffect } from './statusEffectDisplay.ts';
import { setDebugLoopStageId, setDebugLoopWaveIndex } from '../dev/debugLoopStage.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { GameSession } from '../game/GameSession.ts';
import { readBattleHudTheme } from '../render/battleHudTheme.ts';

const R8F_PASSIVE_ID = 'df_guardian_passive_5';
const R8F_SELF_PASSIVE_ID = 'df_guardian_passive_2';
const R8F_GUARDIAN_SLOT = 0;
const R8F_RADIUS = 40;
const R8F_DEF_MULTIPLIER = 1.03;
const PASSIVE_BUFF_AURA_PREFIX = 'passive_buff_aura_';

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

function mockUnit(
  overrides: Partial<CombatantState> & { id: string; battleX: number },
): CombatantState {
  return {
    name: overrides.id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
    def: 100,
    res: 0,
    isAlive: true,
    role: 'defender',
    classId: 'df_guardian',
    formationRow: 'front',
    traits: { rangePx: 40, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: overrides.isEnemy ?? false,
    battleX: overrides.battleX,
    corpseVisible: true,
    partySlotIndex: overrides.partySlotIndex,
    ...overrides,
  };
}

function hasDefAuraFromSource(
  unit: CombatantState,
  sourceId: string,
  passiveId: string,
): boolean {
  return unit.statusEffects.some(
    (effect) =>
      effect.stat === 'def' &&
      effect.id.startsWith(`${PASSIVE_BUFF_AURA_PREFIX}${sourceId}_${passiveId}_`),
  );
}

function countDefAurasFromSource(
  unit: CombatantState,
  sourceId: string,
  passiveId: string,
): number {
  return unit.statusEffects.filter(
    (effect) =>
      effect.stat === 'def' &&
      effect.id.startsWith(`${PASSIVE_BUFF_AURA_PREFIX}${sourceId}_${passiveId}_`),
  ).length;
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

function guardianMemberWithoutRangePassive(gameData: GameData): PartyMemberState {
  const member = createMemberFromClass('df_guardian', gameData);
  member.build.learnedPassiveIds = member.build.learnedPassiveIds.filter(
    (id) => id !== R8F_PASSIVE_ID,
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

function stripGuardianRangePassiveInOperation(
  session: GameSession,
  gameData: GameData,
): void {
  setOperationPartySlot(
    session,
    R8F_GUARDIAN_SLOT,
    guardianMemberWithoutRangePassive(gameData),
  );
  getEngine(session).restartBattle();
  commitOperationCheckpoint(session);
}

function acquireRangePassiveAndStartNextWave(session: GameSession): void {
  reachAwaitingNextWave(getEngine(session));
  expect(session.tryAcquireOperationPassive(R8F_GUARDIAN_SLOT, R8F_PASSIVE_ID)).toBe(
    true,
  );
  expect(session.confirmWavePrepAndStartNextWave()).toBe(true);
}

function getGuardianAlly(engine: BattleEngine): CombatantState {
  const { players } = asBattleEngineInternals(engine);
  const guardian = players.find(
    (ally) =>
      ally.partySlotIndex === R8F_GUARDIAN_SLOT && ally.classId === 'df_guardian',
  );
  if (!guardian) throw new Error('df_guardian ally not found');
  return guardian;
}

describe('allyRangePassiveBands (R8f unit)', () => {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const gameData = loaded.data;
  const passive = gameData.skillRegistry.passives[R8F_PASSIVE_ID];

  it('detects ally range buff aura passive definition', () => {
    expect(passive).toBeDefined();
    expect(isAllyRangeBuffAuraPassive(passive!)).toBe(true);
    expect(passive!.buffAoeRadiusPx).toBe(R8F_RADIUS);
  });

  it('1. without acquisition produces no bands', () => {
    const source = mockUnit({
      id: 'guardian',
      battleX: 200,
      partySlotIndex: 0,
    });
    const bands = resolveAllyRangePassiveBands(
      [source],
      gameData.skillRegistry.passives,
      () => [],
    );
    expect(bands).toEqual([]);
  });

  it('2–5. applies aura inside range and removes outside after movement', () => {
    const source = mockUnit({
      id: 'guardian',
      battleX: 200,
      partySlotIndex: 0,
      build: {
        learnedPassiveIds: [R8F_PASSIVE_ID],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const nearAlly = mockUnit({ id: 'near', battleX: 220, partySlotIndex: 1 });
    const farAlly = mockUnit({ id: 'far', battleX: 300, partySlotIndex: 2 });
    const enemy = mockUnit({
      id: 'enemy',
      battleX: 210,
      isEnemy: true,
      isAlive: true,
    });

    syncBuffAuras(
      [source, nearAlly, farAlly],
      [enemy],
      gameData.skillRegistry.passives,
      gameData,
    );

    expect(hasDefAuraFromSource(source, source.id, R8F_PASSIVE_ID)).toBe(true);
    expect(hasDefAuraFromSource(nearAlly, source.id, R8F_PASSIVE_ID)).toBe(true);
    expect(hasDefAuraFromSource(farAlly, source.id, R8F_PASSIVE_ID)).toBe(false);
    expect(hasDefAuraFromSource(enemy, source.id, R8F_PASSIVE_ID)).toBe(false);

    source.battleX = 280;
    syncBuffAuras(
      [source, nearAlly, farAlly],
      [enemy],
      gameData.skillRegistry.passives,
      gameData,
    );
    expect(hasDefAuraFromSource(nearAlly, source.id, R8F_PASSIVE_ID)).toBe(false);
    expect(hasDefAuraFromSource(farAlly, source.id, R8F_PASSIVE_ID)).toBe(true);

    farAlly.battleX = 250;
    syncBuffAuras(
      [source, nearAlly, farAlly],
      [enemy],
      gameData.skillRegistry.passives,
      gameData,
    );
    expect(hasDefAuraFromSource(farAlly, source.id, R8F_PASSIVE_ID)).toBe(true);
  });

  it('6. includes owner (selfOrigin)', () => {
    const source = mockUnit({
      id: 'guardian',
      battleX: 200,
      partySlotIndex: 0,
      build: {
        learnedPassiveIds: [R8F_PASSIVE_ID],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    syncBuffAuras([source], [], gameData.skillRegistry.passives, gameData);
    expect(hasDefAuraFromSource(source, source.id, R8F_PASSIVE_ID)).toBe(true);
  });

  it('7. does not duplicate stacks on resync', () => {
    const source = mockUnit({
      id: 'guardian',
      battleX: 200,
      partySlotIndex: 0,
      build: {
        learnedPassiveIds: [R8F_PASSIVE_ID],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const nearAlly = mockUnit({ id: 'near', battleX: 220, partySlotIndex: 1 });
    syncBuffAuras([source, nearAlly], [], gameData.skillRegistry.passives, gameData);
    syncBuffAuras([source, nearAlly], [], gameData.skillRegistry.passives, gameData);
    expect(countDefAurasFromSource(source, source.id, R8F_PASSIVE_ID)).toBe(1);
    expect(countDefAurasFromSource(nearAlly, source.id, R8F_PASSIVE_ID)).toBe(1);
  });

  it('8. clears aura and band when owner is defeated', () => {
    const source = mockUnit({
      id: 'guardian',
      battleX: 200,
      partySlotIndex: 0,
      build: {
        learnedPassiveIds: [R8F_PASSIVE_ID],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const nearAlly = mockUnit({ id: 'near', battleX: 220, partySlotIndex: 1 });
    syncBuffAuras([source, nearAlly], [], gameData.skillRegistry.passives, gameData);

    source.isAlive = false;
    source.hp = 0;
    syncBuffAuras([source, nearAlly], [], gameData.skillRegistry.passives, gameData);

    expect(hasDefAuraFromSource(nearAlly, source.id, R8F_PASSIVE_ID)).toBe(false);
    const bands = resolveAllyRangePassiveBands(
      [source, nearAlly],
      gameData.skillRegistry.passives,
      (slotIndex) => (slotIndex === 0 ? [R8F_PASSIVE_ID] : []),
    );
    expect(bands).toEqual([]);
  });

  it('12. world X interval matches screen draw interval', () => {
    const band = { centerBattleX: 200, radiusPx: R8F_RADIUS };
    const interval = resolveAllyRangePassiveBandInterval(band);
    expect(battleXToScreenX(interval.minBattleX)).toBe(160);
    expect(battleXToScreenX(interval.maxBattleX)).toBe(240);
    expect(isBattleXInsideAllyRangePassiveBand(200, band)).toBe(true);
    expect(isBattleXInsideAllyRangePassiveBand(159, band)).toBe(false);
  });
});

describe('operation range passive integration (R8f)', () => {
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

  it('1. without acquisition: no bands and no range DEF boost on allies', () => {
    session = bootVerifySession();
    stripGuardianRangePassiveInOperation(session, gameData);
    const engine = getEngine(session);
    const guardian = getGuardianAlly(engine);
    const snap = engine.getSnapshot();
    expect(snap.allyRangePassiveBands).toEqual([]);
    expect(session.getOperationAcquiredPassiveIds(R8F_GUARDIAN_SLOT)).toEqual([]);
    expect(
      guardian.statusEffects.some((effect) =>
        effect.id.includes(R8F_PASSIVE_ID),
      ),
    ).toBe(false);
  });

  it('9. resyncs bands after next wave with committed acquisition', () => {
    session = bootVerifySession();
    stripGuardianRangePassiveInOperation(session, gameData);
    acquireRangePassiveAndStartNextWave(session);

    const engine = getEngine(session);
    const guardian = getGuardianAlly(engine);
    guardian.battleX = 220;
    const { players } = asBattleEngineInternals(engine);
    const otherAlly = players.find((ally) => ally.id !== guardian.id);
    if (!otherAlly) throw new Error('second ally missing');
    otherAlly.battleX = guardian.battleX + 20;

    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    expect(snap.allyRangePassiveBands).toEqual([
      expect.objectContaining({
        sourceId: guardian.id,
        passiveId: R8F_PASSIVE_ID,
        centerBattleX: guardian.battleX,
        radiusPx: R8F_RADIUS,
      }),
    ]);
    expect(hasDefAuraFromSource(otherAlly, guardian.id, R8F_PASSIVE_ID)).toBe(true);
  });

  it('10. operation restart clears bands and range aura', () => {
    session = bootVerifySession();
    stripGuardianRangePassiveInOperation(session, gameData);
    acquireRangePassiveAndStartNextWave(session);
    expect(getEngine(session).getSnapshot().allyRangePassiveBands.length).toBe(1);

    expect(session.restartOperationFromWaveZero()).toBe(true);
    const snap = getEngine(session).getSnapshot();
    expect(snap.allyRangePassiveBands).toEqual([]);
    expect(session.getOperationAcquiredPassiveIds(R8F_GUARDIAN_SLOT)).toEqual([]);
  });

  it('11. pause keeps aura state unchanged', () => {
    session = bootVerifySession();
    stripGuardianRangePassiveInOperation(session, gameData);
    acquireRangePassiveAndStartNextWave(session);
    const engine = getEngine(session);
    const guardian = getGuardianAlly(engine);
    const { players } = asBattleEngineInternals(engine);
    const ally = players.find((entry) => entry.id !== guardian.id)!;
    ally.battleX = guardian.battleX + 15;
    engine.tick(TICK_DT);

    const beforeEffects = structuredClone(ally.statusEffects);
    const beforeBands = structuredClone(engine.getSnapshot().allyRangePassiveBands);
    const view = (session as unknown as { view: { setBattlePaused: (v: boolean) => void } })
      .view;
    view.setBattlePaused(true);
    for (let i = 0; i < 30; i++) {
      session!.tick(1 / 60, 1000 / 60);
    }
    expect(ally.statusEffects).toEqual(beforeEffects);
    expect(engine.getSnapshot().allyRangePassiveBands).toEqual(beforeBands);
  });

  it('13. preserves self stat passive and hides always-on aura badges', () => {
    session = bootVerifySession();
    stripGuardianRangePassiveInOperation(session, gameData);
    reachAwaitingNextWave(getEngine(session));
    expect(
      session.tryAcquireOperationPassive(R8F_GUARDIAN_SLOT, R8F_SELF_PASSIVE_ID),
    ).toBe(true);
    expect(session.confirmWavePrepAndStartNextWave()).toBe(true);

    const guardian = getGuardianAlly(getEngine(session));
    const baselineDef = guardian.def;
    const boostedDef = getEffectiveDef(guardian);
    expect(boostedDef).toBeGreaterThan(baselineDef);

    const conditional = {
      id: 'test_stun',
      type: 'debuff' as const,
      debuffSubKind: 'stun' as const,
      remainingSec: 2,
      durationSec: 2,
    };
    guardian.statusEffects.push(conditional);
    const badges = filterEffectsForHudStatusBadges(guardian.statusEffects);
    expect(badges.some((effect) => effect.id === 'test_stun')).toBe(true);
    expect(badges.some((effect) => isPassiveAlwaysOnStatAuraEffect(effect))).toBe(
      false,
    );
  });
});

describe('mergeOperationPassivesIntoBuild range passive (R8f)', () => {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const gameData = loaded.data;

  it('merges df_guardian_passive_5 for guardian slot', () => {
    const build = {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    };
    mergeOperationPassivesIntoBuild(
      build,
      'df_guardian',
      [R8F_PASSIVE_ID],
      gameData.skillRegistry.passives,
    );
    expect(build.learnedPassiveIds).toEqual([R8F_PASSIVE_ID]);
  });
});

describe('battleRangePassiveBandDraw (R8f)', () => {
  it('draws one band using battleX coordinates', () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const theme = readBattleHudTheme(host);

    drawAllyRangePassiveBands(
      ctx,
      [
        {
          sourceId: 'guardian',
          passiveId: R8F_PASSIVE_ID,
          centerBattleX: 200,
          radiusPx: R8F_RADIUS,
        },
      ],
      400,
      theme,
    );

    expect(ctx.fillRect).toHaveBeenCalledWith(160, 394, 80, 6);
    expect(ctx.strokeRect).toHaveBeenCalledWith(160.5, 394.5, 79, 5);
    host.remove();
  });
});
