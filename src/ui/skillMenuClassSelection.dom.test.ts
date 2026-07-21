/**
 * Class Select toggle — party-formation-ui.md §7.1:
 * focused + re-click deselects; not-focused selected click focuses only.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { loadGameData, tryLoadGameData } from '../battle/data/loadGameData.ts';
import type { ClassId, GameData, PartySlotState } from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { GameSession } from '../game/GameSession.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { SkillMenuPanel } from './SkillMenuPanel.ts';

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

function sortieToStage(session: GameSession, stageId: string): void {
  const host = (session as unknown as {
    handleStageSortie: (id: string) => void;
  }).handleStageSortie.bind(session);
  host(stageId);
}

function countFilledPartySlots(session: GameSession): number {
  return session
    .getSaveState()
    .party.filter((member) => member !== null).length;
}

function activatePickerItem(item: HTMLButtonElement): void {
  item.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
  );
  item.click();
}

function findPickerItem(classId: string): HTMLButtonElement {
  const item = document.querySelector<HTMLButtonElement>(
    `.skill-menu-picker-list-item[data-picker-class-id="${classId}"]`,
  );
  if (!item) {
    throw new Error(`picker item not found: ${classId}`);
  }
  return item;
}

describe('SkillMenuPanel class selection toggle', () => {
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
    setVerifyModeEnabled(false);
  });

  it('keeps a selected class in the party when focusing it from Class Select', () => {
    session = createSession();
    session.start();
    sortieToStage(session, '1');

    const initialCount = countFilledPartySlots(session);
    expect(initialCount).toBeGreaterThan(0);

    const classIds = getPartyClassIds(session);
    expect(classIds.length).toBeGreaterThanOrEqual(2);
    const [focusedClassId, otherClassId] = classIds;

    const pickerItem = findPickerItem(otherClassId);
    activatePickerItem(pickerItem);

    expect(countFilledPartySlots(session)).toBe(initialCount);
    expect(pickerItem.classList.contains('skill-menu-picker-list-item--active')).toBe(
      true,
    );
    expect(pickerItem.classList.contains('skill-menu-picker-list-item--focused')).toBe(
      true,
    );
    expect(session.getSaveState().party.some((m) => m?.classId === focusedClassId)).toBe(
      true,
    );
  });

  it('removes a selected class from the party on focused re-click', () => {
    session = createSession();
    session.start();
    sortieToStage(session, '1');

    const initialCount = countFilledPartySlots(session);
    const selectedClassId = session.getSaveState().party.find(
      (member) => member !== null,
    )!.classId;

    const pickerItem = findPickerItem(selectedClassId);
    activatePickerItem(pickerItem);

    expect(countFilledPartySlots(session)).toBe(initialCount - 1);
    expect(
      findPickerItem(selectedClassId).classList.contains(
        'skill-menu-picker-list-item--active',
      ),
    ).toBe(false);
  });

  it('keeps another selected class when focusing it from a different roster card', () => {
    session = createSession();
    session.start();
    sortieToStage(session, '1');

    const classIds = session
      .getSaveState()
      .party.filter((member) => member !== null)
      .map((member) => member!.classId);
    expect(classIds.length).toBeGreaterThanOrEqual(2);

    const [firstClassId, secondClassId] = classIds;
    const rosterCard = document.querySelector<HTMLButtonElement>(
      `.skill-menu-roster-card[data-summary-class-id="${firstClassId}"]`,
    );
    rosterCard?.click();

    const secondPicker = findPickerItem(secondClassId);
    activatePickerItem(secondPicker);

    expect(countFilledPartySlots(session)).toBe(4);
    expect(getPartyClassIds(session).sort()).toEqual(classIds.sort());
    expect(secondPicker.classList.contains('skill-menu-picker-list-item--active')).toBe(
      true,
    );
    expect(secondPicker.classList.contains('skill-menu-picker-list-item--focused')).toBe(
      true,
    );
  });
});

function getPartyClassIds(session: GameSession): string[] {
  return session
    .getSaveState()
    .party.filter((member) => member !== null)
    .map((member) => member!.classId);
}

const OUT_OF_SCOPE_CLASS_ID = 'at_ranger';

function getProblemSeriesAllowedClassIds(gameData: GameData): readonly ClassId[] {
  expect(gameData.problemSeriesCatalog.series.length).toBeGreaterThan(0);
  const allowedClassIds = gameData.problemSeriesCatalog.series[0]!.allowedClassIds;
  expect(allowedClassIds).toHaveLength(PARTY_SLOT_COUNT);
  return allowedClassIds;
}

function buildSourcePartyWithOutOfScopeMember(
  gameData: GameData,
  allowedClassIds: readonly ClassId[],
  outOfScopeClassId: ClassId,
): PartySlotState[] {
  expect(allowedClassIds).not.toContain(outOfScopeClassId);
  expect(gameData.classRegistry[outOfScopeClassId]).toBeDefined();

  const party: PartySlotState[] = [
    createMemberFromClass(allowedClassIds[0]!, gameData),
    createMemberFromClass(allowedClassIds[1]!, gameData),
    createMemberFromClass(allowedClassIds[2]!, gameData),
    createMemberFromClass(outOfScopeClassId, gameData),
  ];
  expect(party.some((member) => member?.classId === outOfScopeClassId)).toBe(
    true,
  );
  return party;
}

function getPickerClassIdsFromDom(): ClassId[] {
  return [
    ...document.querySelectorAll<HTMLButtonElement>(
      '.skill-menu-picker-list-item[data-picker-class-id]',
    ),
  ].map((item) => item.dataset.pickerClassId!);
}

function getRosterSummaryClassIdsFromDom(): ClassId[] {
  return [
    ...document.querySelectorAll<HTMLButtonElement>(
      '.skill-menu-roster-card[data-summary-class-id]',
    ),
  ].map((card) => card.dataset.summaryClassId!);
}

function createSkillMenuPanelWithAllowedFilter(
  gameData: GameData,
  sourceParty: PartySlotState[],
  allowedClassIds: readonly ClassId[],
  callbacks: {
    onPartySlotChanged: (slotIndex: number, member: PartySlotState) => void;
  },
): SkillMenuPanel {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const levelCurves = loadLevelCurves(levelCurvesJson);
  return new SkillMenuPanel(
    container,
    gameData,
    levelCurves,
    sourceParty,
    [],
    {
      onBuildChanged: () => {},
      onPartySlotChanged: callbacks.onPartySlotChanged,
    },
    { allowedClassIds },
  );
}

describe('SkillMenuPanel allowed class filter', () => {
  let panel: SkillMenuPanel | null = null;

  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    panel?.destroy();
    panel = null;
    document.body.replaceChildren();
  });

  it('limits Class Select, roster, and callbacks to allowed classes from problem series catalog', () => {
    const gameData = loadGameData();
    const allowedClassIds = getProblemSeriesAllowedClassIds(gameData);
    const sourceParty = buildSourcePartyWithOutOfScopeMember(
      gameData,
      allowedClassIds,
      OUT_OF_SCOPE_CLASS_ID,
    );

    const party: PartySlotState[] = [...sourceParty];
    panel = createSkillMenuPanelWithAllowedFilter(
      gameData,
      sourceParty,
      allowedClassIds,
      {
        onPartySlotChanged: (slotIndex, member) => {
          party[slotIndex] = member;
        },
      },
    );

    const pickerClassIds = getPickerClassIdsFromDom();
    expect(pickerClassIds).toHaveLength(4);
    for (const classId of allowedClassIds) {
      expect(pickerClassIds).toContain(classId);
    }
    expect(pickerClassIds).not.toContain(OUT_OF_SCOPE_CLASS_ID);
    expect(
      document.querySelector(
        `.skill-menu-picker-list-item[data-picker-class-id="${OUT_OF_SCOPE_CLASS_ID}"]`,
      ),
    ).toBeNull();

    const rosterClassIds = getRosterSummaryClassIdsFromDom();
    expect(rosterClassIds).toHaveLength(3);
    expect(rosterClassIds).not.toContain(OUT_OF_SCOPE_CLASS_ID);
    for (const classId of rosterClassIds) {
      expect(allowedClassIds).toContain(classId);
    }

    const missingAllowedClassId = allowedClassIds.find(
      (classId) => !rosterClassIds.includes(classId),
    );
    expect(missingAllowedClassId).toBeDefined();
    activatePickerItem(findPickerItem(missingAllowedClassId!));

    const callbackClassIds = party
      .filter((member) => member !== null)
      .map((member) => member!.classId);
    expect(callbackClassIds).not.toContain(OUT_OF_SCOPE_CLASS_ID);
    expect(party.filter((member) => member !== null)).toHaveLength(PARTY_SLOT_COUNT);
    expect(getRosterSummaryClassIdsFromDom()).toHaveLength(PARTY_SLOT_COUNT);
    expect(panel.canReturnToBattle()).toBe(true);
  });

  it('does not react when source allowedClassIds array is mutated after panel creation', () => {
    const gameData = loadGameData();
    const allowedClassIds = [...getProblemSeriesAllowedClassIds(gameData)];
    const sourceParty = buildSourcePartyWithOutOfScopeMember(
      gameData,
      allowedClassIds,
      OUT_OF_SCOPE_CLASS_ID,
    );

    panel = createSkillMenuPanelWithAllowedFilter(
      gameData,
      sourceParty,
      allowedClassIds,
      { onPartySlotChanged: () => {} },
    );

    const pickerBeforeMutation = getPickerClassIdsFromDom();
    expect(pickerBeforeMutation).toHaveLength(4);

    allowedClassIds.length = 0;
    allowedClassIds.push('mutated_class');

    expect(getPickerClassIdsFromDom()).toEqual(pickerBeforeMutation);
  });

  it('shows zero Class Select candidates for empty allowedClassIds', () => {
    const gameData = loadGameData();
    const allowedClassIds = getProblemSeriesAllowedClassIds(gameData);
    const sourceParty = buildSourcePartyWithOutOfScopeMember(
      gameData,
      allowedClassIds,
      OUT_OF_SCOPE_CLASS_ID,
    );
    const allRuntimeCount = Object.keys(gameData.classRegistry).length;
    expect(allRuntimeCount).toBeGreaterThan(0);

    panel = createSkillMenuPanelWithAllowedFilter(
      gameData,
      sourceParty,
      [],
      { onPartySlotChanged: () => {} },
    );

    expect(getPickerClassIdsFromDom()).toEqual([]);
    expect(getRosterSummaryClassIdsFromDom()).toEqual([]);
  });
});
