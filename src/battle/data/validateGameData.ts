import type {
  ActiveSkillDef,
  AttackRange,
  ClassPreset,
  EnemyTemplate,
  FormationRow,
  PartyDef,
  PassiveEffectKind,
  PassiveSkillDef,
  Role,
  SkillEffectKind,
  StageDef,
  TargetRule,
} from '../types.ts';

const ROLES = new Set<Role>(['defender', 'attacker', 'supporter']);
const FORMATION_ROWS = new Set<FormationRow>(['front', 'middle', 'back']);
const ATTACK_RANGES = new Set<AttackRange>(['melee', 'ranged']);
const SKILL_EFFECTS = new Set<SkillEffectKind>([
  'damage',
  'heal',
  'buff',
  'debuff',
]);
const TARGET_RULES = new Set<TargetRule>([
  'closestAlly',
  'frontEnemy',
  'lowestHpEnemy',
  'mostDamagedAlly',
]);
const PASSIVE_EFFECTS = new Set<PassiveEffectKind>([
  'damageMultiplier',
  'damageTakenMultiplier',
  'healBonus',
  'targetRuleOverride',
  'evasionChance',
  'activeCooldownRate',
]);
const VALID_REG = new Set([0, 5, 10, 15, 20]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function missingField(context: string, field: string): never {
  throw new Error(`Missing required field "${field}": ${context}`);
}

function invalidField(context: string, field: string, detail: string): never {
  throw new Error(`Invalid "${field}" ${detail}: ${context}`);
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected object: ${context}`);
  }
  return value;
}

function requireString(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.length === 0) {
    missingField(context, key);
  }
  return value;
}

function requireNumber(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): number {
  const value = obj[key];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    missingField(context, key);
  }
  return value;
}

function requireStringArray(
  obj: Record<string, unknown>,
  key: string,
  context: string,
  minLength = 0,
): string[] {
  const value = obj[key];
  if (!Array.isArray(value)) {
    missingField(context, key);
  }
  const items = value as unknown[];
  if (items.length < minLength) {
    invalidField(context, key, `must have at least ${minLength} item(s)`);
  }
  for (let i = 0; i < items.length; i++) {
    if (typeof items[i] !== 'string' || (items[i] as string).length === 0) {
      invalidField(context, `${key}[${i}]`, 'must be a non-empty string');
    }
  }
  return items as string[];
}

function requireEnum<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  context: string,
  allowed: Set<T>,
): T {
  const value = requireString(obj, key, context);
  if (!allowed.has(value as T)) {
    invalidField(context, key, `must be one of ${[...allowed].join(', ')}`);
  }
  return value as T;
}

function requireReg(value: number, context: string): void {
  if (!VALID_REG.has(value)) {
    invalidField(context, 'reg', `must be one of ${[...VALID_REG].join(', ')}`);
  }
}

function requirePassiveEffectParams(
  obj: Record<string, unknown>,
  effect: PassiveEffectKind,
  context: string,
): PassiveSkillDef {
  const base = {
    id: requireString(obj, 'id', context),
    name: requireString(obj, 'name', context),
    effect,
  };

  switch (effect) {
    case 'damageMultiplier':
      return {
        ...base,
        damageMultiplier: requireNumber(obj, 'damageMultiplier', context),
      };
    case 'damageTakenMultiplier':
      return {
        ...base,
        damageTakenMultiplier: requireNumber(
          obj,
          'damageTakenMultiplier',
          context,
        ),
      };
    case 'healBonus':
      return { ...base, healBonus: requireNumber(obj, 'healBonus', context) };
    case 'targetRuleOverride':
      return {
        ...base,
        targetRuleOverride: requireEnum(
          obj,
          'targetRuleOverride',
          context,
          TARGET_RULES,
        ),
      };
    case 'evasionChance':
      return {
        ...base,
        evasionChance: requireNumber(obj, 'evasionChance', context),
      };
    case 'activeCooldownRate':
      return {
        ...base,
        activeCooldownRate: requireNumber(obj, 'activeCooldownRate', context),
      };
  }
}

function parseClasses(raw: unknown): ClassPreset[] {
  if (!Array.isArray(raw)) {
    throw new Error('classes.json must be an array');
  }
  return raw.map((entry, index) => {
    const context = `classes[${index}]`;
    const obj = requireRecord(entry, context);
    const id = requireString(obj, 'id', context);
    const role = requireEnum(obj, 'role', context, ROLES);
    const displayName = requireString(obj, 'displayName', context);
    const formationRow = requireEnum(obj, 'formationRow', context, FORMATION_ROWS);
    const traitsObj = requireRecord(obj.traits, `${context}.traits`);
    const attackRange = requireEnum(
      traitsObj,
      'attackRange',
      `${context}.traits`,
      ATTACK_RANGES,
    );
    const rangePx = traitsObj.rangePx;
    if (attackRange === 'ranged') {
      if (typeof rangePx !== 'number' || Number.isNaN(rangePx)) {
        missingField(`${context}.traits`, 'rangePx');
      }
    } else if (rangePx !== undefined && typeof rangePx !== 'number') {
      invalidField(`${context}.traits`, 'rangePx', 'must be a number');
    }
    const maxHp = requireNumber(obj, 'maxHp', context);
    const atk = requireNumber(obj, 'atk', context);
    const def = requireNumber(obj, 'def', context);
    const reg = requireNumber(obj, 'reg', context);
    requireReg(reg, context);
    const basicAttackSkillId = requireString(obj, 'basicAttackSkillId', context);
    const spriteKey =
      obj.spriteKey === undefined
        ? undefined
        : requireString(obj, 'spriteKey', context);
    const iconKey =
      obj.iconKey === undefined
        ? undefined
        : requireString(obj, 'iconKey', context);
    const starterPassiveIds = requireStringArray(
      obj,
      'starterPassiveIds',
      context,
    );
    const starterActiveIds = requireStringArray(
      obj,
      'starterActiveIds',
      context,
    );

    return {
      id,
      role,
      displayName,
      formationRow,
      traits: {
        attackRange,
        ...(typeof rangePx === 'number' ? { rangePx } : {}),
      },
      maxHp,
      atk,
      def,
      reg,
      basicAttackSkillId,
      spriteKey,
      iconKey,
      starterPassiveIds,
      starterActiveIds,
    };
  });
}

function parsePassives(raw: unknown): PassiveSkillDef[] {
  if (!Array.isArray(raw)) {
    throw new Error('skills.json passives must be an array');
  }
  return raw.map((entry, index) => {
    const context = `passives[${index}]`;
    const obj = requireRecord(entry, context);
    const effect = requireEnum(obj, 'effect', context, PASSIVE_EFFECTS);
    return requirePassiveEffectParams(obj, effect, context);
  });
}

function parseActives(raw: unknown): ActiveSkillDef[] {
  if (!Array.isArray(raw)) {
    throw new Error('skills.json actives must be an array');
  }
  return raw.map((entry, index) => {
    const context = `actives[${index}]`;
    const obj = requireRecord(entry, context);
    const id = requireString(obj, 'id', context);
    const name = requireString(obj, 'name', context);
    const interval = requireNumber(obj, 'interval', context);
    const targetRule = requireEnum(obj, 'targetRule', context, TARGET_RULES);
    const effect = requireEnum(obj, 'effect', context, SKILL_EFFECTS);
    const range = requireEnum(obj, 'range', context, ATTACK_RANGES);

    if (effect === 'damage') {
      requireString(obj, 'damageType', context);
      requireNumber(obj, 'powerMultiplier', context);
    } else if (effect === 'heal') {
      requireNumber(obj, 'powerMultiplier', context);
    } else if (effect === 'buff') {
      requireString(obj, 'buffStat', context);
      requireNumber(obj, 'buffMultiplier', context);
      requireNumber(obj, 'buffDurationSec', context);
    } else if (effect === 'debuff') {
      requireString(obj, 'debuffStat', context);
      requireNumber(obj, 'debuffMultiplier', context);
      requireNumber(obj, 'debuffDurationSec', context);
    }

    const allowedRoles = obj.allowedRoles;
    if (allowedRoles !== undefined) {
      if (!Array.isArray(allowedRoles)) {
        invalidField(context, 'allowedRoles', 'must be an array');
      }
      for (let i = 0; i < allowedRoles.length; i++) {
        const role = allowedRoles[i];
        if (typeof role !== 'string' || !ROLES.has(role as Role)) {
          invalidField(context, `allowedRoles[${i}]`, 'must be a valid role');
        }
      }
    }

    const allowedClassIds = obj.allowedClassIds;
    if (allowedClassIds !== undefined) {
      requireStringArray(
        { allowedClassIds },
        'allowedClassIds',
        context,
      );
    }

    return {
      id,
      name,
      interval,
      targetRule,
      effect,
      range,
      ...(typeof obj.damageType === 'string'
        ? { damageType: obj.damageType as ActiveSkillDef['damageType'] }
        : {}),
      ...(typeof obj.powerMultiplier === 'number'
        ? { powerMultiplier: obj.powerMultiplier }
        : {}),
      ...(typeof obj.buffStat === 'string'
        ? { buffStat: obj.buffStat as ActiveSkillDef['buffStat'] }
        : {}),
      ...(typeof obj.buffMultiplier === 'number'
        ? { buffMultiplier: obj.buffMultiplier }
        : {}),
      ...(typeof obj.buffDurationSec === 'number'
        ? { buffDurationSec: obj.buffDurationSec }
        : {}),
      ...(typeof obj.debuffStat === 'string'
        ? { debuffStat: obj.debuffStat as ActiveSkillDef['debuffStat'] }
        : {}),
      ...(typeof obj.debuffMultiplier === 'number'
        ? { debuffMultiplier: obj.debuffMultiplier }
        : {}),
      ...(typeof obj.debuffDurationSec === 'number'
        ? { debuffDurationSec: obj.debuffDurationSec }
        : {}),
      ...(Array.isArray(allowedRoles)
        ? { allowedRoles: allowedRoles as Role[] }
        : {}),
      ...(Array.isArray(allowedClassIds)
        ? { allowedClassIds: allowedClassIds as string[] }
        : {}),
    };
  });
}

function parseEnemies(raw: unknown): EnemyTemplate[] {
  if (!Array.isArray(raw)) {
    throw new Error('enemies.json must be an array');
  }
  return raw.map((entry, index) => {
    const context = `enemies[${index}]`;
    const obj = requireRecord(entry, context);
    const id = requireString(obj, 'id', context);
    const displayName = requireString(obj, 'displayName', context);
    const maxHp = requireNumber(obj, 'maxHp', context);
    const atk = requireNumber(obj, 'atk', context);
    const def = requireNumber(obj, 'def', context);
    const reg = requireNumber(obj, 'reg', context);
    requireReg(reg, context);
    const exp = requireNumber(obj, 'exp', context);
    if (exp < 0) {
      invalidField(context, 'exp', 'must be >= 0');
    }
    const spriteKey = requireString(obj, 'spriteKey', context);
    const activeSkillIds =
      obj.activeSkillIds === undefined
        ? undefined
        : requireStringArray(obj, 'activeSkillIds', context);
    const rangePx = obj.rangePx;
    if (rangePx !== undefined && typeof rangePx !== 'number') {
      invalidField(context, 'rangePx', 'must be a number');
    }

    return {
      id,
      displayName,
      maxHp,
      atk,
      def,
      reg,
      exp,
      spriteKey,
      ...(activeSkillIds !== undefined ? { activeSkillIds } : {}),
      ...(typeof rangePx === 'number' ? { rangePx } : {}),
    };
  });
}

function parseStages(raw: unknown): StageDef[] {
  if (!Array.isArray(raw)) {
    throw new Error('stages.json must be an array');
  }
  return raw.map((entry, index) => {
    const context = `stages[${index}]`;
    const obj = requireRecord(entry, context);
    const id = requireString(obj, 'id', context);
    const displayName = requireString(obj, 'displayName', context);
    const wavesRaw = obj.waves;
    if (!Array.isArray(wavesRaw) || wavesRaw.length === 0) {
      invalidField(context, 'waves', 'must be a non-empty array');
    }

    const waves = (wavesRaw as unknown[]).map((waveEntry, waveIndex) => {
      const waveContext = `${context}.waves[${waveIndex}]`;
      const waveObj = requireRecord(waveEntry, waveContext);
      const enemiesRaw = waveObj.enemies;
      if (!Array.isArray(enemiesRaw) || enemiesRaw.length === 0) {
        invalidField(waveContext, 'enemies', 'must be a non-empty array');
      }

      const enemies = (enemiesRaw as unknown[]).map((enemyEntry, enemyIndex) => {
        const enemyContext = `${waveContext}.enemies[${enemyIndex}]`;
        const enemyObj = requireRecord(enemyEntry, enemyContext);
        return {
          templateId: requireString(enemyObj, 'templateId', enemyContext),
          spawnX: requireNumber(enemyObj, 'spawnX', enemyContext),
        };
      });

      return { enemies };
    });

    return { id, displayName, waves };
  });
}

function parseParties(raw: unknown): Record<string, PartyDef> {
  const root = requireRecord(raw, 'parties.json');
  const parties: Record<string, PartyDef> = {};

  for (const [partyId, partyEntry] of Object.entries(root)) {
    const context = `parties.${partyId}`;
    const obj = requireRecord(partyEntry, context);
    const name = requireString(obj, 'name', context);
    const membersRaw = obj.members;
    if (!Array.isArray(membersRaw) || membersRaw.length === 0) {
      invalidField(context, 'members', 'must be a non-empty array');
    }

    const members = (membersRaw as unknown[]).map((memberEntry, memberIndex) => {
      const memberContext = `${context}.members[${memberIndex}]`;
      const memberObj = requireRecord(memberEntry, memberContext);
      const classId = requireString(memberObj, 'classId', memberContext);
      const buildObj = requireRecord(memberObj.build, `${memberContext}.build`);
      const learnedPassiveIds = requireStringArray(
        buildObj,
        'learnedPassiveIds',
        `${memberContext}.build`,
      );
      const learnedActiveIds = requireStringArray(
        buildObj,
        'learnedActiveIds',
        `${memberContext}.build`,
      );
      const equippedActiveSlots = requireStringArray(
        buildObj,
        'equippedActiveSlots',
        `${memberContext}.build`,
      );

      return {
        classId,
        build: {
          learnedPassiveIds,
          learnedActiveIds,
          equippedActiveSlots,
        },
      };
    });

    parties[partyId] = { name, members };
  }

  if (Object.keys(parties).length === 0) {
    throw new Error('parties.json must contain at least one party');
  }

  return parties;
}

function validateReferences(
  classes: ClassPreset[],
  passives: PassiveSkillDef[],
  actives: ActiveSkillDef[],
  enemies: EnemyTemplate[],
  stages: StageDef[],
  parties: Record<string, PartyDef>,
): void {
  const passiveIds = new Set(passives.map((p) => p.id));
  const activeIds = new Set(actives.map((a) => a.id));
  const classIds = new Set(classes.map((c) => c.id));
  const enemyIds = new Set(enemies.map((e) => e.id));

  for (const cls of classes) {
    if (!activeIds.has(cls.basicAttackSkillId)) {
      throw new Error(
        `Unknown basicAttackSkillId "${cls.basicAttackSkillId}": ${cls.id}`,
      );
    }
    for (const passiveId of cls.starterPassiveIds) {
      if (!passiveIds.has(passiveId)) {
        throw new Error(`Unknown starterPassiveId "${passiveId}": ${cls.id}`);
      }
    }
    for (const activeId of cls.starterActiveIds) {
      if (!activeIds.has(activeId)) {
        throw new Error(`Unknown starterActiveId "${activeId}": ${cls.id}`);
      }
    }
  }

  for (const enemy of enemies) {
    for (const skillId of enemy.activeSkillIds ?? []) {
      if (!activeIds.has(skillId)) {
        throw new Error(`Unknown activeSkillId "${skillId}": ${enemy.id}`);
      }
    }
  }

  for (const stage of stages) {
    stage.waves.forEach((wave, waveIndex) => {
      wave.enemies.forEach((spawn, enemyIndex) => {
        if (!enemyIds.has(spawn.templateId)) {
          throw new Error(
            `Unknown templateId "${spawn.templateId}": ${stage.id} wave[${waveIndex}] enemy[${enemyIndex}]`,
          );
        }
      });
    });
  }

  for (const [partyId, party] of Object.entries(parties)) {
    party.members.forEach((member, memberIndex) => {
      const context = `parties.${partyId}.members[${memberIndex}]`;
      if (!classIds.has(member.classId)) {
        throw new Error(`Unknown classId "${member.classId}": ${context}`);
      }
      for (const passiveId of member.build.learnedPassiveIds) {
        if (!passiveIds.has(passiveId)) {
          throw new Error(`Unknown learnedPassiveId "${passiveId}": ${context}`);
        }
      }
      for (const activeId of member.build.learnedActiveIds) {
        if (!activeIds.has(activeId)) {
          throw new Error(`Unknown learnedActiveId "${activeId}": ${context}`);
        }
      }
      for (const activeId of member.build.equippedActiveSlots) {
        if (activeId.length > 0 && !activeIds.has(activeId)) {
          throw new Error(
            `Unknown equippedActiveSlot "${activeId}": ${context}`,
          );
        }
      }
    });
  }
}

export interface ParsedGameDataJson {
  classes: ClassPreset[];
  passives: PassiveSkillDef[];
  actives: ActiveSkillDef[];
  enemies: EnemyTemplate[];
  stages: StageDef[];
  parties: Record<string, PartyDef>;
}

export function parseAndValidateGameDataJson(raw: {
  classes: unknown;
  skills: unknown;
  enemies: unknown;
  stages: unknown;
  parties: unknown;
}): ParsedGameDataJson {
  const skillsRoot = requireRecord(raw.skills, 'skills.json');
  const passivesRaw = skillsRoot.passives;
  const activesRaw = skillsRoot.actives;
  if (passivesRaw === undefined) {
    missingField('skills.json', 'passives');
  }
  if (activesRaw === undefined) {
    missingField('skills.json', 'actives');
  }

  const classes = parseClasses(raw.classes);
  const passives = parsePassives(passivesRaw);
  const actives = parseActives(activesRaw);
  const enemies = parseEnemies(raw.enemies);
  const stages = parseStages(raw.stages);
  const parties = parseParties(raw.parties);

  validateReferences(classes, passives, actives, enemies, stages, parties);

  return { classes, passives, actives, enemies, stages, parties };
}
