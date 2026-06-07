import classesJson from '../../../data/classes.json';
import skillsJson from '../../../data/skills.json';
import enemiesJson from '../../../data/enemies.json';
import stagesJson from '../../../data/stages.json';
import partiesJson from '../../../data/parties.json';
import type {
  ActiveSkillDef,
  ClassPreset,
  EnemyTemplate,
  GameData,
  PartyDef,
  PassiveSkillDef,
  StageDef,
} from '../types.ts';

const VALID_REG = new Set([0, 5, 10, 15, 20]);

function indexById<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

function validateReg(value: number, context: string): void {
  if (!VALID_REG.has(value)) {
    throw new Error(`Invalid reg ${value} for ${context}`);
  }
}

export function loadGameData(): GameData {
  const classes = classesJson as ClassPreset[];
  for (const cls of classes) {
    validateReg(cls.reg, cls.id);
  }

  const enemies = enemiesJson as EnemyTemplate[];
  for (const enemy of enemies) {
    validateReg(enemy.reg, enemy.id);
  }

  const passives = indexById(skillsJson.passives as PassiveSkillDef[]);
  const actives = indexById(skillsJson.actives as ActiveSkillDef[]);

  return {
    classRegistry: indexById(classes),
    skillRegistry: { passives, actives },
    enemyRegistry: indexById(enemies),
    stages: stagesJson as StageDef[],
    parties: partiesJson as Record<string, PartyDef>,
  };
}
