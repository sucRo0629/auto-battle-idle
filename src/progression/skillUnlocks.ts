import { normalizeEntityTraits } from '../battle/data/entityTraits.ts';
import type {
  ClassPreset,
  ClassSkillUnlock,
  EntityTraits,
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
  const learnedPassiveIds = [
    ...(classPreset.passiveIds ?? classPreset.starterPassiveIds),
  ];
  const learnedActiveIds: string[] = [];
  for (const entry of classPreset.skills) {
    if (entry.level <= characterLevel) {
      for (const skillId of entry.skillIds) {
        if (registry.actives[skillId]) {
          learnedActiveIds.push(skillId);
        }
      }
    }
  }
  return { learnedPassiveIds, learnedActiveIds };
}

export type ClassPresetBeforeEnrich = Omit<
  ClassPreset,
  'starterPassiveIds' | 'starterActiveIds' | 'classSkillIds' | 'traits'
> & {
  traits: EntityTraits;
};

export function enrichClassPreset(
  cls: ClassPresetBeforeEnrich,
  registry: SkillRegistry,
  options?: { lenient?: boolean },
): ClassPreset {
  const classify = options?.lenient ? classifySkillIdsLenient : classifySkillIds;
  const passiveIds = (cls.passiveIds ?? []).map((id) => id.trim()).filter(Boolean);
  const starterIds = getStarterSkillIds(cls.skills);
  const { learnedActiveIds } = classify(starterIds, registry);

  return {
    ...cls,
    traits: normalizeEntityTraits(cls.traits),
    passiveIds,
    starterPassiveIds: passiveIds,
    starterActiveIds: learnedActiveIds,
    classSkillIds: [...new Set([...passiveIds, ...getClassSkillIds(cls.skills)])],
  };
}
