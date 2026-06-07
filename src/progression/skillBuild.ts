import type {
  CharacterBuild,
  ClassId,
  GameData,
  PartyMemberState,
} from '../battle/types.ts';

export const MAX_ACTIVE_SLOTS = 2;

export function cloneBuild(build: CharacterBuild): CharacterBuild {
  return structuredClone(build);
}

export function getUnlockedActiveSlotCount(
  _member: PartyMemberState,
  _gameData: GameData,
): number {
  return 1;
}

export function normalizeEquippedSlots(build: CharacterBuild): CharacterBuild {
  const next = cloneBuild(build);
  while (next.equippedActiveSlots.length < MAX_ACTIVE_SLOTS) {
    next.equippedActiveSlots.push('');
  }
  if (next.equippedActiveSlots.length > MAX_ACTIVE_SLOTS) {
    next.equippedActiveSlots = next.equippedActiveSlots.slice(0, MAX_ACTIVE_SLOTS);
  }
  return next;
}

export function canEquipActive(
  build: CharacterBuild,
  skillId: string,
  gameData: GameData,
  classId: ClassId,
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

  return true;
}

export function equipActiveSlot(
  build: CharacterBuild,
  skillId: string,
  slotIndex = 0,
): CharacterBuild {
  const next = normalizeEquippedSlots(build);
  next.equippedActiveSlots[slotIndex] = skillId;
  return next;
}

export function hasBuildChanges(a: CharacterBuild, b: CharacterBuild): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
