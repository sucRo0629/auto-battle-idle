import type { ClassId, PartyMemberState, SaveGameState } from '../battle/types.ts';

/** クラス ID リネーム（セーブ互換）。キーは旧 ID。 */
const LEGACY_CLASS_ID_ALIASES: Readonly<Record<string, ClassId>> = {
  at_sniper: 'at_ballista',
  at_enchanter: 'at_sigilist',
};

export function migrateLegacyClassId(classId: string): ClassId {
  return LEGACY_CLASS_ID_ALIASES[classId] ?? classId;
}

export function migrateLegacySkillId(skillId: string): string {
  for (const [legacyPrefix, nextClassId] of Object.entries(
    LEGACY_CLASS_ID_ALIASES,
  )) {
    if (skillId.startsWith(`${legacyPrefix}_`)) {
      return skillId.replace(`${legacyPrefix}_`, `${nextClassId}_`);
    }
  }
  return skillId;
}

function migrateMemberBuild(member: PartyMemberState): PartyMemberState {
  const mapSkillIds = (ids: string[]) => ids.map(migrateLegacySkillId);
  return {
    ...member,
    classId: migrateLegacyClassId(member.classId),
    build: {
      ...member.build,
      learnedPassiveIds: mapSkillIds(member.build.learnedPassiveIds),
      learnedActiveIds: mapSkillIds(member.build.learnedActiveIds),
      equippedActiveSlots: member.build.equippedActiveSlots.map((skillId) =>
        skillId ? migrateLegacySkillId(skillId) : skillId,
      ),
    },
  };
}

function dedupeClassIds(classIds: readonly ClassId[]): ClassId[] {
  const seen = new Set<ClassId>();
  const result: ClassId[] = [];
  for (const classId of classIds) {
    const migrated = migrateLegacyClassId(classId);
    if (seen.has(migrated)) continue;
    seen.add(migrated);
    result.push(migrated);
  }
  return result;
}

/** 旧 classId / スキル ID を現行マスタへ置換する */
export function migrateSaveClassIds(save: SaveGameState): SaveGameState {
  return {
    ...save,
    party: save.party.map((member) =>
      member ? migrateMemberBuild(member) : null,
    ),
    unlockedClassIds: dedupeClassIds(save.unlockedClassIds),
  };
}
