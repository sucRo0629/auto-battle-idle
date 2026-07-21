/**
 * @vitest-environment happy-dom
 *
 * R12m Player 作業単位2T3: problemSeries 開始時に snapshot 由来の fresh 4 兵科 party を
 * OperationState / checkpoint へ注入する production 境界。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import * as initialPartyModule from '../battle/problemSeries/initialParty.ts';
import type { ClassId, PartyMemberState, PartySlotState } from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { OperationState } from './OperationState.ts';
import { GameSession } from './GameSession.ts';

const FIXTURE_SEED_A = 'fixture-a';
const FIXTURE_SEED_B = 'fixture-b';
const PROBLEM_SERIES_SOURCE = { kind: 'problemSeries' } as const;
const FIXED_STAGE_ID = '1';
const OUT_OF_SCOPE_CLASS_ID = 'at_ranger';
const PRE_OPERATION_MODULE_ID = 'df_guardian_mod_guard_focus';
const LEGACY_LEVEL = 7;
const LEGACY_EXP = 999;

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
    canvas: { width: 800, height: 600 },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
}

function createSession(): GameSession {
  const loaded = tryLoadGameData();
  if (!loaded.ok) {
    throw new Error(loaded.error);
  }
  expect(loaded.data.problemSeriesCatalog.series.length).toBeGreaterThan(0);
  const container = document.createElement('div');
  document.body.appendChild(container);
  return new GameSession(loaded.data, container);
}

function sortieToStage(session: GameSession, stageId: string): void {
  const host = (
    session as unknown as {
      handleStageSortie: (id: string) => void;
    }
  ).handleStageSortie.bind(session);
  host(stageId);
}

function expectAllSlotsNonNull(
  party: readonly (PartyMemberState | null)[],
): PartyMemberState[] {
  expect(party).toHaveLength(PARTY_SLOT_COUNT);
  const members: PartyMemberState[] = [];
  for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
    const member = party[slotIndex];
    expect(member).not.toBeNull();
    if (member === null) {
      throw new Error(`Expected slot ${slotIndex} to be non-null`);
    }
    members.push(member);
  }
  return members;
}

function expectFreshMemberState(member: PartyMemberState): void {
  expect(member.progress.level).toBe(1);
  expect(member.progress.exp).toBe(0);
}

function polluteSavePartyForIsolation(
  session: GameSession,
  allowedClassIds: readonly ClassId[],
): {
  outOfScopeSlotIndex: number;
  legacySlotIndex: number;
} {
  const saveParty = session.getSaveState().party;
  const outOfScopeSlotIndex = saveParty.findIndex(
    (slot) => slot !== null && slot.classId === OUT_OF_SCOPE_CLASS_ID,
  );
  expect(outOfScopeSlotIndex).toBeGreaterThanOrEqual(0);
  expect(allowedClassIds).not.toContain(OUT_OF_SCOPE_CLASS_ID);

  const legacySlotIndex = saveParty.findIndex(
    (slot, index) =>
      slot !== null &&
      index !== outOfScopeSlotIndex &&
      allowedClassIds.includes(slot.classId),
  );
  expect(legacySlotIndex).toBeGreaterThanOrEqual(0);
  saveParty[legacySlotIndex]!.progress.level = LEGACY_LEVEL;
  saveParty[legacySlotIndex]!.progress.exp = LEGACY_EXP;

  return { outOfScopeSlotIndex, legacySlotIndex };
}

function assertProblemSeriesOperationParty(
  session: GameSession,
  allowedClassIds: readonly ClassId[],
): void {
  const operationState = session.getOperationState();
  expect(operationState).not.toBeNull();
  expect(operationState!.source).toEqual(PROBLEM_SERIES_SOURCE);

  const operationMembers = expectAllSlotsNonNull(operationState!.party);
  const operationClassIds = operationMembers.map((member) => member.classId);
  expect(operationClassIds).toEqual([...allowedClassIds]);
  expect(new Set(operationClassIds).size).toBe(PARTY_SLOT_COUNT);
  for (const member of operationMembers) {
    expectFreshMemberState(member);
    expect(member.classId).not.toBe(OUT_OF_SCOPE_CLASS_ID);
  }

  const checkpoint = session.getOperationCheckpoint();
  if (checkpoint === null) {
    throw new Error('Expected operation checkpoint to be non-null');
  }
  expect(checkpoint.source).toEqual(PROBLEM_SERIES_SOURCE);
  const checkpointMembers = expectAllSlotsNonNull(checkpoint.party);
  expect(checkpointMembers.map((member) => member.classId)).toEqual([
    ...allowedClassIds,
  ]);
  for (const member of checkpointMembers) {
    expectFreshMemberState(member);
    expect(member.classId).not.toBe(OUT_OF_SCOPE_CLASS_ID);
  }
}

describe('GameSession problemSeries initial party injection (R12m Player unit2T3)', () => {
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
    vi.restoreAllMocks();
  });

  it.each([
    ['fixture-a', FIXTURE_SEED_A, 'r12m_series_a'] as const,
    ['fixture-b', FIXTURE_SEED_B, 'r12m_series_b'] as const,
  ])(
    '%s: prepare → beginPrepared injects snapshot fresh party into OperationState/checkpoint',
    (_label, seed, expectedSeriesId) => {
      const factorySpy = vi.spyOn(
        initialPartyModule,
        'createProblemSeriesInitialParty',
      );
      const beginSpy = vi.spyOn(OperationState, 'begin');

      session = createSession();
      session.setPartySlotCombatModule(0, PRE_OPERATION_MODULE_ID);

      const prepared = session.prepareProblemSeriesOperationStart(seed);
      expect(prepared.seriesId).toBe(expectedSeriesId);
      expect(prepared.allowedClassIds).toHaveLength(PARTY_SLOT_COUNT);

      const loaded = tryLoadGameData();
      if (!loaded.ok) {
        throw new Error(loaded.error);
      }

      factorySpy.mockClear();
      beginSpy.mockClear();

      const returned = session.beginPreparedProblemSeriesOperation();

      expect(returned).toBe(prepared);
      expect(session.hasActiveOperation()).toBe(true);
      expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);

      expect(factorySpy).toHaveBeenCalledTimes(1);
      expect(factorySpy).toHaveBeenCalledWith(
        prepared.allowedClassIds,
        loaded.data,
      );
      expect(beginSpy).toHaveBeenCalledTimes(1);

      assertProblemSeriesOperationParty(session, prepared.allowedClassIds);

      expect(session.getPartySlotCombatModule(0)).toBeUndefined();
      expect(session.getOperationCheckpoint()?.combatModuleSelection).toEqual(
        [],
      );

      for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
        expect(
          session.getOperationCheckpoint()?.combatModuleSelection.some(
            (entry) => entry.slotIndex === slotIndex,
          ),
        ).toBe(false);
      }
    },
  );

  it('save contamination does not enter problemSeries OperationState; Save unchanged', () => {
    session = createSession();
    session.setPartySlotCombatModule(0, PRE_OPERATION_MODULE_ID);

    const prepared = session.prepareProblemSeriesOperationStart(FIXTURE_SEED_A);
    const snapshotRefBefore = session.getProblemSeriesOperationStartSnapshot();
    expect(snapshotRefBefore).toBe(prepared);

    const { outOfScopeSlotIndex, legacySlotIndex } = polluteSavePartyForIsolation(
      session,
      prepared.allowedClassIds,
    );

    const saveBefore = structuredClone(session.getSaveState());
    expect(saveBefore.party[outOfScopeSlotIndex]?.classId).toBe(
      OUT_OF_SCOPE_CLASS_ID,
    );
    expect(saveBefore.party[legacySlotIndex]?.progress.level).toBe(LEGACY_LEVEL);
    expect(saveBefore.party[legacySlotIndex]?.progress.exp).toBe(LEGACY_EXP);

    const returned = session.beginPreparedProblemSeriesOperation();
    expect(returned).toBe(prepared);

    assertProblemSeriesOperationParty(session, prepared.allowedClassIds);

    expect(session.getSaveState()).toEqual(saveBefore);
    expect(session.getSaveState().unlockedClassIds).toEqual(
      saveBefore.unlockedClassIds,
    );
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(prepared);
    expect(session.getProblemSeriesOperationStartSnapshot()).toBe(
      snapshotRefBefore,
    );

    const savePartyAfter = session.getSaveState().party;
    expect(savePartyAfter[outOfScopeSlotIndex]?.classId).toBe(
      OUT_OF_SCOPE_CLASS_ID,
    );
    expect(savePartyAfter[legacySlotIndex]?.progress.level).toBe(LEGACY_LEVEL);
    expect(savePartyAfter[legacySlotIndex]?.progress.exp).toBe(LEGACY_EXP);
  });

  it('fixedStage sortie keeps Save party and pre-operation module selection', () => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    const fixedStage = loaded.data.stages.find((stage) => stage.id === FIXED_STAGE_ID);
    if (fixedStage === undefined) {
      throw new Error(`Expected fixed stage ${FIXED_STAGE_ID} to exist`);
    }

    const factorySpy = vi.spyOn(
      initialPartyModule,
      'createProblemSeriesInitialParty',
    );

    session = createSession();
    session.setPartySlotCombatModule(0, PRE_OPERATION_MODULE_ID);

    const saveBefore = structuredClone(session.getSaveState());
    const savePartySnapshot: PartySlotState[] = structuredClone(saveBefore.party);
    expectAllSlotsNonNull(savePartySnapshot);

    sortieToStage(session, FIXED_STAGE_ID);

    expect(factorySpy).not.toHaveBeenCalled();
    expect(session.getOperationState()?.source).toEqual({
      kind: 'fixedStage',
      stageId: FIXED_STAGE_ID,
    });

    const operationParty = session.getOperationState()!.party;
    expectAllSlotsNonNull(operationParty);
    for (let slotIndex = 0; slotIndex < PARTY_SLOT_COUNT; slotIndex++) {
      expect(operationParty[slotIndex]?.classId).toBe(
        savePartySnapshot[slotIndex]?.classId,
      );
      expect(operationParty[slotIndex]?.progress.level).toBe(
        savePartySnapshot[slotIndex]?.progress.level,
      );
      expect(operationParty[slotIndex]?.progress.exp).toBe(
        savePartySnapshot[slotIndex]?.progress.exp,
      );
    }

    expect(session.getPartySlotCombatModule(0)).toBe(PRE_OPERATION_MODULE_ID);
    expect(session.getOperationCheckpoint()?.combatModuleSelection).toEqual([
      { slotIndex: 0, moduleId: PRE_OPERATION_MODULE_ID },
    ]);

    const checkpointParty = session.getOperationCheckpoint()?.party;
    if (checkpointParty === undefined) {
      throw new Error('Expected operation checkpoint party to be defined');
    }
    expectAllSlotsNonNull(checkpointParty);
    expect(checkpointParty.map((member) => member.classId)).toEqual(
      savePartySnapshot.map((member) => member!.classId),
    );

    expect(session.getSaveState().party).toEqual(saveBefore.party);
    expect(session.getSaveState().unlockedClassIds).toEqual(
      saveBefore.unlockedClassIds,
    );
  });
});
