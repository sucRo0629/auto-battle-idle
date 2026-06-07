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

export const MAX_ACTIVE_SLOTS = 2;

export function cloneBuild(build: CharacterBuild): CharacterBuild {
  return structuredClone(build);
}

/** Phase 7 まで常に 1。解放条件と UI / 戦闘側チェックは Phase 7 で追加。 */
export function getUnlockedActiveSlotCount(
  _member: PartyMemberState,
  _gameData: GameData,
): number {
  return 1;
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
 * 現在レベルに応じて習得スキルを同期し、未習得のセット枠を外す。
 * セーブロード・LvUP・クラス差し替え時に呼ぶ。
 */
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
