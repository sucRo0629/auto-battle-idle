import type { CharacterBuild, CombatModuleDef, PartyMemberState } from '../battle/types.ts';
import type { GameData } from '../battle/types.ts';
import { isCombatModuleBasicSkillId } from '../battle/data/resolveCombatModuleBasic.ts';
import {
  MAX_ACTIVE_SLOTS,
  getUnlockedActiveSlotCount,
  normalizeActiveSlots,
} from './skillBuild.ts';

/** 戦闘参加アクティブ ID（習得即参加。セット UI はテスト用のみ） */
export function resolveBattleActiveSkillIds(
  build: CharacterBuild,
  unlockedSlotCount: number,
  options?: { useEquippedOverride?: boolean },
): string[] {
  const cap = Math.min(Math.max(0, unlockedSlotCount), MAX_ACTIVE_SLOTS);
  if (options?.useEquippedOverride) {
    return normalizeActiveSlots(build)
      .equippedActiveSlots.filter(Boolean)
      .slice(0, cap);
  }
  return build.learnedActiveIds.slice(0, cap);
}

export function resolveBattleActiveSkillIdsForMember(
  member: PartyMemberState,
  gameData: GameData,
  options?: { useEquippedOverride?: boolean },
): string[] {
  const unlocked = getUnlockedActiveSlotCount(member, gameData);
  return resolveBattleActiveSkillIds(member.build, unlocked, options);
}

/** R9.5a: CombatModule 通常行動が解決済みの Combatant では legacy active を runtime に載せない。 */
export function resolveRuntimeActiveSkillIds(
  build: CharacterBuild,
  unlockedSlotCount: number,
  basicSkillId: string,
  combatModuleRegistry: Record<string, CombatModuleDef>,
  options?: { useEquippedOverride?: boolean },
): string[] {
  if (isCombatModuleBasicSkillId(basicSkillId, combatModuleRegistry)) {
    return [];
  }
  return resolveBattleActiveSkillIds(build, unlockedSlotCount, options);
}

export function resolveRuntimeActiveSkillIdsForMember(
  member: PartyMemberState,
  gameData: GameData,
  basicSkillId: string,
  options?: { useEquippedOverride?: boolean },
): string[] {
  const unlocked = getUnlockedActiveSlotCount(member, gameData);
  return resolveRuntimeActiveSkillIds(
    member.build,
    unlocked,
    basicSkillId,
    gameData.combatModuleRegistry,
    options,
  );
}
