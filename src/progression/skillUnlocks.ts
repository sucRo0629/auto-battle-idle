import type {
  ClassPreset,
  ClassSkillUnlock,
  SkillRegistry,
} from '../battle/types.ts';

export function getClassSkillIds(skills: ClassSkillUnlock[]): string[] {
  const ids = new Set<string>();
  for (const entry of skills) {
    for (const skillId of entry.skillIds) {
      ids.add(skillId);
    }
  }
  return [...ids];
}

export function getStarterSkillIds(skills: ClassSkillUnlock[]): string[] {
  return skills
    .filter((entry) => entry.level === 0)
    .flatMap((entry) => entry.skillIds);
}

export function classifySkillIds(
  skillIds: string[],
  registry: SkillRegistry,
): { learnedPassiveIds: string[]; learnedActiveIds: string[] } {
  const learnedPassiveIds: string[] = [];
  const learnedActiveIds: string[] = [];

  for (const skillId of skillIds) {
    if (registry.passives[skillId]) {
      learnedPassiveIds.push(skillId);
      continue;
    }
    if (registry.actives[skillId]) {
      learnedActiveIds.push(skillId);
      continue;
    }
    throw new Error(`Unknown skill id: ${skillId}`);
  }

  return { learnedPassiveIds, learnedActiveIds };
}

export function classifySkillIdsLenient(
  skillIds: string[],
  registry: SkillRegistry,
): { learnedPassiveIds: string[]; learnedActiveIds: string[] } {
  const learnedPassiveIds: string[] = [];
  const learnedActiveIds: string[] = [];

  for (const skillId of skillIds) {
    if (registry.passives[skillId]) {
      learnedPassiveIds.push(skillId);
      continue;
    }
    if (registry.actives[skillId]) {
      learnedActiveIds.push(skillId);
    }
  }

  return { learnedPassiveIds, learnedActiveIds };
}

export function resolveLearnedSkills(
  classPreset: ClassPreset,
  characterLevel: number,
  registry: SkillRegistry,
): { learnedPassiveIds: string[]; learnedActiveIds: string[] } {
  const unlockedIds: string[] = [];
  for (const entry of classPreset.skills) {
    if (entry.level <= characterLevel) {
      unlockedIds.push(...entry.skillIds);
    }
  }
  return classifySkillIds(unlockedIds, registry);
}

export type ClassPresetBeforeEnrich = Omit<
  ClassPreset,
  'starterPassiveIds' | 'starterActiveIds' | 'classSkillIds'
>;

export function enrichClassPreset(
  cls: ClassPresetBeforeEnrich,
  registry: SkillRegistry,
  options?: { lenient?: boolean },
): ClassPreset {
  const classify = options?.lenient ? classifySkillIdsLenient : classifySkillIds;
  const starterIds = getStarterSkillIds(cls.skills);
  const { learnedPassiveIds, learnedActiveIds } = classify(starterIds, registry);

  return {
    ...cls,
    starterPassiveIds: learnedPassiveIds,
    starterActiveIds: learnedActiveIds,
    classSkillIds: getClassSkillIds(cls.skills),
  };
}
