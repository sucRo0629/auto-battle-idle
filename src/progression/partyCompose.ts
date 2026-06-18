import { sortClassIdsByListOrder } from '../battle/data/classListOrder.ts';
import type {
  ClassId,
  GameData,
  PartyMemberState,
  PartySlotState,
} from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import { reconcileMemberBuildFromGameData } from './skillBuild.ts';

export const DEFAULT_ROSTER_EXTRAS: Record<string, ClassId[]> = {
  demo: [
    'df_paladin',
    'df_duelist',
    'at_assassin',
    'at_lancer',
    'at_ballista',
    'at_hunter',
    'at_sorcerer',
    'at_enchanter',
    'at_geomancer',
    'sp_abjurer',
    'sp_alchemist',
  ],
};

export function normalizePartySlots(party: PartySlotState[]): PartySlotState[] {
  const result: PartySlotState[] = [];
  for (let i = 0; i < PARTY_SLOT_COUNT; i++) {
    result.push(party[i] ?? null);
  }
  return result;
}

export function createMemberFromClass(
  classId: ClassId,
  gameData: GameData,
): PartyMemberState {
  const preset = gameData.classRegistry[classId];
  if (!preset) {
    throw new Error(`Class not found: ${classId}`);
  }
  const member: PartyMemberState = {
    classId,
    progress: { level: 1, exp: 0 },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
  };
  reconcileMemberBuildFromGameData(member, gameData);
  return member;
}

export function getAssignableClassIds(
  party: PartySlotState[],
  unlockedClassIds: ClassId[],
  slotIndex: number,
  classOrder: readonly ClassId[],
): ClassId[] {
  const usedElsewhere = new Set<ClassId>();
  party.forEach((member, index) => {
    if (index !== slotIndex && member) {
      usedElsewhere.add(member.classId);
    }
  });
  const assignable = unlockedClassIds.filter((id) => !usedElsewhere.has(id));
  return sortClassIdsByListOrder(assignable, classOrder);
}

export function buildDefaultUnlockedClassIds(
  party: PartySlotState[],
  partyId: string,
): ClassId[] {
  const ids = new Set<ClassId>();
  for (const member of party) {
    if (member) ids.add(member.classId);
  }
  for (const classId of DEFAULT_ROSTER_EXTRAS[partyId] ?? []) {
    ids.add(classId);
  }
  return [...ids];
}

export function mergeMigrationUnlockedClassIds(
  party: PartySlotState[],
): ClassId[] {
  const ids = new Set<ClassId>();
  for (const member of party) {
    if (member) ids.add(member.classId);
  }
  for (const extras of Object.values(DEFAULT_ROSTER_EXTRAS)) {
    for (const classId of extras) {
      ids.add(classId);
    }
  }
  return [...ids];
}
