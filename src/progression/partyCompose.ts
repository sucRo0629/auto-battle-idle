import type {
  ClassId,
  GameData,
  PartyMemberState,
  PartySlotState,
} from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import { resolveLearnedSkills } from './skillUnlocks.ts';

export const DEFAULT_ROSTER_EXTRAS: Record<string, ClassId[]> = {
  demo: ['attacker_arcanist'],
  test: ['test_attacker_arcanist', 'test_defender_paladin'],
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
  const learned = resolveLearnedSkills(preset, 1, gameData.skillRegistry);
  const firstActive = learned.learnedActiveIds[0] ?? '';
  return {
    classId,
    progress: { level: 1, exp: 0 },
    build: {
      learnedPassiveIds: [...learned.learnedPassiveIds],
      learnedActiveIds: [...learned.learnedActiveIds],
      equippedActiveSlots: firstActive ? [firstActive] : [],
    },
  };
}

export function getAssignableClassIds(
  party: PartySlotState[],
  unlockedClassIds: ClassId[],
  slotIndex: number,
): ClassId[] {
  const usedElsewhere = new Set<ClassId>();
  party.forEach((member, index) => {
    if (index !== slotIndex && member) {
      usedElsewhere.add(member.classId);
    }
  });
  return unlockedClassIds.filter((id) => !usedElsewhere.has(id));
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
