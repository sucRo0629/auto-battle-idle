import type { GameData, PartyMemberState } from '../battle/types.ts';
import { reconcileMemberBuildFromGameData } from '../progression/skillBuild.ts';

export function applyDebugMemberLevel(
  member: PartyMemberState,
  level: number,
  gameData: GameData,
): void {
  const clamped = Math.max(1, Math.floor(level));
  member.progress.level = clamped;
  member.progress.exp = 0;
  reconcileMemberBuildFromGameData(member, gameData);
}
