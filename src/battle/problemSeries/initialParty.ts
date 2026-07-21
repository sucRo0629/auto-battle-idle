/**
 * R12m 問題系列の初期 party 生成（純粋 factory）。
 *
 * 選出済み snapshot の allowedClassIds のみから fresh party を生成する。
 * Save party / unlock / 既存 member の level・EXP・build は入力にしない。
 * GameSession / OperationState / UI への接続は行わない。
 */

import { createMemberFromClass } from '../../progression/partyCompose.ts';
import type { ClassId, GameData, PartySlotState } from '../types.ts';
import { PARTY_SLOT_COUNT } from '../types.ts';

export function createProblemSeriesInitialParty(
  allowedClassIds: readonly ClassId[],
  gameData: GameData,
): PartySlotState[] {
  if (allowedClassIds.length !== PARTY_SLOT_COUNT) {
    throw new Error(
      `Problem series initial party requires exactly ${PARTY_SLOT_COUNT} allowed class IDs, got ${allowedClassIds.length}`,
    );
  }

  const seen = new Set<ClassId>();
  for (const classId of allowedClassIds) {
    if (seen.has(classId)) {
      throw new Error(`Duplicate class ID in allowedClassIds: ${classId}`);
    }
    seen.add(classId);
    if (!gameData.classRegistry[classId]) {
      throw new Error(`Unknown class ID in allowedClassIds: ${classId}`);
    }
  }

  const party: PartySlotState[] = [];
  for (const classId of allowedClassIds) {
    party.push(createMemberFromClass(classId, gameData));
  }
  return party;
}
