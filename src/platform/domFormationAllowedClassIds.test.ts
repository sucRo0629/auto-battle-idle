/**
 * DomFormationScreenHost → MetaMenuOverlay → SkillMenuPanel allowedClassIds wiring.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { loadGameData } from '../battle/data/loadGameData.ts';
import type { ClassId, GameData, PartySlotState } from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { DomFormationScreenHost } from './DomFormationScreenHost.ts';
import type { MenuHostContext } from './menuHost.ts';

const OUT_OF_SCOPE_CLASS_ID: ClassId = 'at_ranger';

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

function assertFormationScreenOpen(host: DomFormationScreenHost): void {
  expect(host.isOpen()).toBe(true);
  expect(
    document.querySelector('.meta-menu-overlay--formation-screen'),
  ).not.toBeNull();
}

interface HostFixture {
  host: DomFormationScreenHost;
  formationHost: HTMLElement;
  party: PartySlotState[];
}

function createDomFormationHost(
  gameData: GameData,
  sourceParty: PartySlotState[],
  overrides: Partial<MenuHostContext> = {},
): HostFixture {
  const formationHost = document.createElement('div');
  document.body.appendChild(formationHost);
  const party = [...sourceParty];
  const levelCurves = loadLevelCurves(levelCurvesJson);

  const context: MenuHostContext = {
    gameData,
    levelCurves,
    formationHost,
    getParty: () => party,
    getUnlockedClassIds: () => [],
    isVerifyMode: () => false,
    onBuildChanged: () => {},
    onPartySlotChanged: (slotIndex, member) => {
      party[slotIndex] = member;
    },
    onScreenChange: () => {},
    ...overrides,
  };

  return {
    host: new DomFormationScreenHost(context),
    formationHost,
    party,
  };
}

describe('DomFormationScreenHost allowed class IDs wiring', () => {
  let fixture: HostFixture | null = null;

  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    fixture?.host.dismiss();
    fixture = null;
    document.body.replaceChildren();
  });

  it('passes problem series allowedClassIds to Class Select via production host path', () => {
    const gameData = loadGameData();
    const allowedClassIds = getProblemSeriesAllowedClassIds(gameData);
    const sourceParty = buildSourcePartyWithOutOfScopeMember(
      gameData,
      allowedClassIds,
      OUT_OF_SCOPE_CLASS_ID,
    );
    const getFormationAllowedClassIds = vi.fn(() => allowedClassIds);

    fixture = createDomFormationHost(gameData, sourceParty, {
      getFormationAllowedClassIds,
    });
    fixture.host.open('party');
    assertFormationScreenOpen(fixture.host);

    expect(getFormationAllowedClassIds).toHaveBeenCalled();

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
    expect(rosterClassIds).not.toContain(OUT_OF_SCOPE_CLASS_ID);
    for (const classId of rosterClassIds) {
      expect(allowedClassIds).toContain(classId);
    }
  });

  it('shows all runtime classes when getFormationAllowedClassIds is omitted', () => {
    const gameData = loadGameData();
    const allowedClassIds = getProblemSeriesAllowedClassIds(gameData);
    const sourceParty = buildSourcePartyWithOutOfScopeMember(
      gameData,
      allowedClassIds,
      OUT_OF_SCOPE_CLASS_ID,
    );
    const allRuntimeCount = Object.keys(gameData.classRegistry).length;
    expect(allRuntimeCount).toBeGreaterThan(PARTY_SLOT_COUNT);

    fixture = createDomFormationHost(gameData, sourceParty);
    fixture.host.open('party');
    assertFormationScreenOpen(fixture.host);

    const pickerClassIds = getPickerClassIdsFromDom();
    expect(pickerClassIds).toHaveLength(allRuntimeCount);
    expect(pickerClassIds).toContain(OUT_OF_SCOPE_CLASS_ID);
  });

  it('shows zero Class Select candidates when callback returns empty array', () => {
    const gameData = loadGameData();
    const allowedClassIds = getProblemSeriesAllowedClassIds(gameData);
    const sourceParty = buildSourcePartyWithOutOfScopeMember(
      gameData,
      allowedClassIds,
      OUT_OF_SCOPE_CLASS_ID,
    );
    const allRuntimeCount = Object.keys(gameData.classRegistry).length;
    expect(allRuntimeCount).toBeGreaterThan(0);
    const getFormationAllowedClassIds = vi.fn(() => [] as readonly ClassId[]);

    fixture = createDomFormationHost(gameData, sourceParty, {
      getFormationAllowedClassIds,
    });
    fixture.host.open('party');
    assertFormationScreenOpen(fixture.host);

    expect(getFormationAllowedClassIds).toHaveBeenCalled();
    expect(getPickerClassIdsFromDom()).toEqual([]);
    expect(getRosterSummaryClassIdsFromDom()).toEqual([]);
  });

  it('does not react when callback source array is mutated after host open', () => {
    const gameData = loadGameData();
    const allowedClassIds = [...getProblemSeriesAllowedClassIds(gameData)];
    const sourceParty = buildSourcePartyWithOutOfScopeMember(
      gameData,
      allowedClassIds,
      OUT_OF_SCOPE_CLASS_ID,
    );
    const getFormationAllowedClassIds = vi.fn(() => allowedClassIds);

    fixture = createDomFormationHost(gameData, sourceParty, {
      getFormationAllowedClassIds,
    });
    fixture.host.open('party');
    assertFormationScreenOpen(fixture.host);

    const pickerBeforeMutation = getPickerClassIdsFromDom();
    expect(pickerBeforeMutation).toHaveLength(4);

    allowedClassIds.length = 0;
    allowedClassIds.push('mutated_class');

    expect(getPickerClassIdsFromDom()).toEqual(pickerBeforeMutation);
  });
});
