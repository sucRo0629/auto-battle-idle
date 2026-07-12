import { sortClassIdsByListOrder } from '../battle/data/classListOrder.ts';
import type {
  ClassId,
  GameData,
  PartyMemberState,
  PartySlotState,
} from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import { migrateLegacyClassId } from '../save/saveClassMigration.ts';
import { reconcileMemberBuildFromGameData } from './skillBuild.ts';

/** UI / API が参照する重複拒否メッセージ（i18n 本実装は後続） */
export const PARTY_DUPLICATE_CLASS_MESSAGE = '同じ兵科は編成できません';

export type PartyClassDuplicateReason = 'duplicateClass';

export interface PartyClassAssignmentResult {
  ok: boolean;
  reason?: PartyClassDuplicateReason;
  conflictingSlotIndex?: number;
  conflictingClassId?: ClassId;
}

export interface PartyValidationResult {
  ok: boolean;
  reason?: PartyClassDuplicateReason;
  duplicateClassId?: ClassId;
  conflictingSlotIndices?: number[];
}

/** 編成判定の正本: legacy alias を現行 classId へ正規化 */
export function normalizePartyClassId(classId: ClassId): ClassId {
  return migrateLegacyClassId(classId);
}

export const DEFAULT_ROSTER_EXTRAS: Record<string, ClassId[]> = {
  demo: [
    'df_paladin',
    'at_assassin',
    'at_sorcerer',
    'sp_wardweaver',
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

/** 他 slot で使用中の classId → slot index（excludeSlot は編集中 slot） */
export function collectUsedPartyClassIds(
  party: PartySlotState[],
  excludeSlotIndex?: number,
): Map<ClassId, number> {
  const used = new Map<ClassId, number>();
  party.forEach((member, index) => {
    if (index === excludeSlotIndex || !member) return;
    used.set(normalizePartyClassId(member.classId), index);
  });
  return used;
}

/** 2 slot 以上に出現する classId とその slot 一覧 */
export function findDuplicatePartyClassIds(
  party: PartySlotState[],
): Map<ClassId, number[]> {
  const slotsByClassId = new Map<ClassId, number[]>();
  party.forEach((member, index) => {
    if (!member) return;
    const classId = normalizePartyClassId(member.classId);
    const indices = slotsByClassId.get(classId) ?? [];
    indices.push(index);
    slotsByClassId.set(classId, indices);
  });

  const duplicates = new Map<ClassId, number[]>();
  for (const [classId, indices] of slotsByClassId) {
    if (indices.length > 1) {
      duplicates.set(classId, indices);
    }
  }
  return duplicates;
}

export function validatePartyClassIds(
  party: PartySlotState[],
): PartyValidationResult {
  const duplicates = findDuplicatePartyClassIds(party);
  if (duplicates.size === 0) {
    return { ok: true };
  }
  const firstDuplicate = [...duplicates.entries()][0]!;
  return {
    ok: false,
    reason: 'duplicateClass',
    duplicateClassId: firstDuplicate[0],
    conflictingSlotIndices: firstDuplicate[1],
  };
}

/** 指定 slot へ class を配置可能か（空 slot / 同一 slot 再選択は許可） */
export function validatePartyClassAssignment(
  party: PartySlotState[],
  slotIndex: number,
  classId: ClassId | null,
): PartyClassAssignmentResult {
  if (classId === null) {
    return { ok: true };
  }
  const normalized = normalizePartyClassId(classId);
  const current = party[slotIndex];
  if (
    current &&
    normalizePartyClassId(current.classId) === normalized
  ) {
    return { ok: true };
  }

  const conflictingSlotIndex = collectUsedPartyClassIds(
    party,
    slotIndex,
  ).get(normalized);
  if (conflictingSlotIndex !== undefined) {
    return {
      ok: false,
      reason: 'duplicateClass',
      conflictingSlotIndex,
      conflictingClassId: normalized,
    };
  }
  return { ok: true };
}

export function isClassAssignableToPartySlot(
  party: PartySlotState[],
  slotIndex: number,
  classId: ClassId,
): boolean {
  return validatePartyClassAssignment(party, slotIndex, classId).ok;
}

export function getAssignableClassIds(
  party: PartySlotState[],
  unlockedClassIds: ClassId[],
  slotIndex: number,
  classOrder: readonly ClassId[],
): ClassId[] {
  const usedElsewhere = collectUsedPartyClassIds(party, slotIndex);
  const currentClassId = party[slotIndex]
    ? normalizePartyClassId(party[slotIndex]!.classId)
    : null;
  const assignable = unlockedClassIds.filter((id) => {
    const normalized = normalizePartyClassId(id);
    if (currentClassId === normalized) return true;
    return !usedElsewhere.has(normalized);
  });
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
