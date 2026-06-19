import type {
  CharacterBuild,
  ClassId,
  ClassPreset,
  GameData,
  PartyMemberState,
  PartySlotState,
  SkillRegistry,
} from '../battle/types.ts';
import { resolveLearnedSkills } from './skillUnlocks.ts';

export const MAX_ACTIVE_SLOTS = 4;

export function cloneBuild(build: CharacterBuild): CharacterBuild {
  return structuredClone(build);
}

/** 段階解放: Lv0=2, Lv10=3, Lv20=4 */
export function getUnlockedActiveSlotCount(
  member: PartyMemberState,
  _gameData: GameData,
): number {
  const level = member.progress.level;
  if (level >= 20) return Math.min(4, MAX_ACTIVE_SLOTS);
  if (level >= 10) return Math.min(3, MAX_ACTIVE_SLOTS);
  return Math.min(2, MAX_ACTIVE_SLOTS);
}

/** セット枠配列を最大長に正規化する */
export function normalizeActiveSlots(build: CharacterBuild): CharacterBuild {
  const next = cloneBuild(build);
  while (next.equippedActiveSlots.length < MAX_ACTIVE_SLOTS) {
    next.equippedActiveSlots.push('');
  }
  if (next.equippedActiveSlots.length > MAX_ACTIVE_SLOTS) {
    next.equippedActiveSlots = next.equippedActiveSlots.slice(0, MAX_ACTIVE_SLOTS);
  }
  return next;
}

export function canSetActive(
  build: CharacterBuild,
  skillId: string,
  gameData: GameData,
  classId: ClassId,
  setSlotIndex?: number,
): boolean {
  if (!skillId) return true;
  if (!build.learnedActiveIds.includes(skillId)) return false;

  const active = gameData.skillRegistry.actives[skillId];
  if (!active) return false;

  if (active.allowedClassIds && !active.allowedClassIds.includes(classId)) {
    return false;
  }

  const preset = gameData.classRegistry[classId];
  if (!preset?.classSkillIds.includes(skillId)) return false;

  const slots = normalizeActiveSlots(build).equippedActiveSlots;
  for (let i = 0; i < slots.length; i++) {
    if (i === setSlotIndex) continue;
    if (slots[i] === skillId) return false;
  }

  return true;
}

export function setActiveSlot(
  build: CharacterBuild,
  skillId: string,
  slotIndex = 0,
): CharacterBuild {
  const next = normalizeActiveSlots(build);
  next.equippedActiveSlots[slotIndex] = skillId;
  return next;
}

export function hasBuildChanges(a: CharacterBuild, b: CharacterBuild): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

/**
 * 現在レベルに応じて習得スキルを同期し、互換用セット枠から未習得IDを外す。
 * セーブロード・LvUP・クラス差し替え時に呼ぶ。
 */
/** @deprecated equippedActiveSlots は互換用途のみ。本番戦闘参加には使わない。 */
export function equipStarterActiveSkills(
  build: CharacterBuild,
  classPreset: ClassPreset,
  learnedActiveIds: string[],
): void {
  const learnedSet = new Set(learnedActiveIds);
  const equippedSet = new Set(build.equippedActiveSlots.filter(Boolean));

  for (const skillId of classPreset.starterActiveIds) {
    if (!learnedSet.has(skillId) || equippedSet.has(skillId)) continue;
    const emptyIndex = build.equippedActiveSlots.findIndex((id) => !id);
    if (emptyIndex === -1) break;
    build.equippedActiveSlots[emptyIndex] = skillId;
    equippedSet.add(skillId);
  }
}

export function reconcileMemberBuild(
  member: PartyMemberState,
  classPreset: ClassPreset,
  registry: SkillRegistry,
): void {
  const learned = resolveLearnedSkills(
    classPreset,
    member.progress.level,
    registry,
  );
  member.build.learnedPassiveIds = learned.learnedPassiveIds;
  member.build.learnedActiveIds = learned.learnedActiveIds;

  const learnedActiveSet = new Set(learned.learnedActiveIds);
  member.build = normalizeActiveSlots(member.build);
  for (let i = 0; i < member.build.equippedActiveSlots.length; i++) {
    const skillId = member.build.equippedActiveSlots[i];
    if (skillId && !learnedActiveSet.has(skillId)) {
      member.build.equippedActiveSlots[i] = '';
    }
  }
}

export function reconcileMemberBuildFromGameData(
  member: PartyMemberState,
  gameData: GameData,
): void {
  const preset = gameData.classRegistry[member.classId];
  if (!preset) return;
  reconcileMemberBuild(member, preset, gameData.skillRegistry);
}

export function reconcilePartyBuilds(
  party: PartySlotState[],
  gameData: GameData,
): void {
  for (const member of party) {
    if (member) {
      reconcileMemberBuildFromGameData(member, gameData);
    }
  }
}
