import type { GameData, PartySlotState } from '../battle/types.ts';
import { reconcileMemberBuildFromGameData } from '../progression/skillBuild.ts';

function applyDebugMemberLevel(
  member: NonNullable<PartySlotState>,
  level: number,
  gameData: GameData,
): void {
  const clamped = Math.max(1, Math.floor(level));
  member.progress.level = clamped;
  member.progress.exp = 0;
  reconcileMemberBuildFromGameData(member, gameData);
}

export function applyDebugPlayerLevel(
  party: readonly PartySlotState[],
  level: number,
  gameData: GameData,
): void {
  for (const member of party) {
    if (!member) continue;
    applyDebugMemberLevel(member, level, gameData);
  }
}
