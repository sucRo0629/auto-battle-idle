import type { CharacterBuild, PassiveSkillDef } from './types.ts';
import { isOperationPassiveCandidateForClass } from '../game/operationPassiveCatalog.ts';

function isNonEmptyPassiveId(passiveId: string): boolean {
  return typeof passiveId === 'string' && passiveId.trim().length > 0;
}

/**
 * R8d: 作戦内取得パッシブを Combatant build.learnedPassiveIds へ一時マージする。
 * PartyMemberState / Save の build は変更しない（呼び出し側で clone 済み build に適用すること）。
 */
export function mergeOperationPassivesIntoBuild(
  build: CharacterBuild,
  classId: string,
  acquiredOperationPassiveIds: readonly string[],
  passives: Record<string, PassiveSkillDef>,
): void {
  if (acquiredOperationPassiveIds.length === 0) return;

  const existing = new Set(build.learnedPassiveIds);
  const merged = [...build.learnedPassiveIds];

  for (const passiveId of acquiredOperationPassiveIds) {
    if (!isNonEmptyPassiveId(passiveId)) continue;
    if (!passives[passiveId]) continue;
    if (!isOperationPassiveCandidateForClass(classId, passiveId)) continue;
    if (existing.has(passiveId)) continue;
    merged.push(passiveId);
    existing.add(passiveId);
  }

  build.learnedPassiveIds = merged;
}
