import classesJson from '../../../data/classes.json';
import testClassesJson from '../../../data/test-classes.json';
import skillsJson from '../../../data/skills.json';
import testSkillsJson from '../../../data/test-skills.json';
import enemiesJson from '../../../data/enemies.json';
import stagesJson from '../../../data/stages.json';
import partiesJson from '../../../data/parties.json';
import testPartiesJson from '../../../data/test-parties.json';
import type {
  ClassPreset,
  ClassTraits,
  EnemyTemplate,
  GameData,
} from '../types.ts';
import { DEFAULT_MELEE_RANGE_PX } from '../types.ts';
import { parseAndValidateGameDataJson } from './validateGameData.ts';

function indexById<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

function mergeSkills(
  base: { passives: unknown[]; actives: unknown[] },
  extra: { passives?: unknown[]; actives?: unknown[] },
): { passives: unknown[]; actives: unknown[] } {
  return {
    passives: [...base.passives, ...(extra.passives ?? [])],
    actives: [...base.actives, ...(extra.actives ?? [])],
  };
}

function normalizeTraits(
  traits: ClassTraits,
  context: string,
): ClassTraits {
  if (traits.rangePx !== undefined) {
    return { ...traits, rangePx: traits.rangePx };
  }
  if (traits.attackRange === 'melee') {
    return { ...traits, rangePx: DEFAULT_MELEE_RANGE_PX };
  }
  throw new Error(`rangePx required for ranged class: ${context}`);
}

function normalizeClass(cls: ClassPreset): ClassPreset {
  return {
    ...cls,
    traits: normalizeTraits(cls.traits, cls.id),
  };
}

function normalizeEnemy(enemy: EnemyTemplate): EnemyTemplate {
  return {
    ...enemy,
    rangePx: enemy.rangePx ?? DEFAULT_MELEE_RANGE_PX,
  };
}

export function loadGameData(): GameData {
  const parsed = parseAndValidateGameDataJson({
    classes: [...classesJson, ...testClassesJson],
    skills: mergeSkills(skillsJson, testSkillsJson),
    enemies: enemiesJson,
    stages: stagesJson,
    parties: { ...partiesJson, ...testPartiesJson },
  });

  const classes = parsed.classes.map(normalizeClass);
  const enemies = parsed.enemies.map(normalizeEnemy);

  return {
    classRegistry: indexById(classes),
    skillRegistry: {
      passives: indexById(parsed.passives),
      actives: indexById(parsed.actives),
    },
    enemyRegistry: indexById(enemies),
    stages: parsed.stages,
    parties: parsed.parties,
  };
}
