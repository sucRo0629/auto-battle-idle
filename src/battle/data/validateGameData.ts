import type {
  ActiveSkillDef,
  AttackRange,
  ClassPreset,
  DamageType,
  EnemyTemplate,
  FormationRow,
  PartyDef,
  PassiveEffectKind,
  PassiveSkillDef,
  Role,
  SkillEffectDef,
  SkillEffectKind,
  SkillVfxDef,
  SkillVfxPresetId,
  StageDef,
  StatusEffectStat,
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
  'hot',
  'dot',
]);
const DAMAGE_TYPES = new Set<DamageType>(['physical', 'magic']);
const VFX_PRESETS = new Set<SkillVfxPresetId>([
  'slash',
  'orb',
  'arrow',
  'healRise',
]);
const TARGET_RULES = new Set<TargetRule>([
  'closestAlly',
  'frontEnemy',
  'lowestHpEnemy',
  'mostDamagedAlly',
  'self',
]);
const PASSIVE_EFFECTS = new Set<PassiveEffectKind>([
  'damageMultiplier',
  'damageTakenMultiplier',
  'healBonus',
  'targetRuleOverride',
  'evasionChance',
  'activeCooldownRate',
]);
const STATUS_EFFECT_STATS = new Set([
  'atk',
  'def',
  'reg',
  'damageTaken',
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

function requireBuffOrDebuffModifier(
  obj: Record<string, unknown>,
  context: string,
  multiplierKey: string,
  flatBonusKey: string,
): void {
  const multiplier = obj[multiplierKey];
  const flatBonus = obj[flatBonusKey];
  const hasMultiplier =
    typeof multiplier === 'number' && !Number.isNaN(multiplier);
  const hasFlatBonus =
    typeof flatBonus === 'number' && !Number.isNaN(flatBonus);
  if (!hasMultiplier && !hasFlatBonus) {
    invalidField(
      context,
      `${multiplierKey} or ${flatBonusKey}`,
      'at least one is required',
    );
  }
  if (hasFlatBonus && flatBonus <= 0) {
    invalidField(context, flatBonusKey, 'must be a positive number');
  }
}

function requireStatusEffectStat(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): StatusEffectStat | StatusEffectStat[] {
  const value = obj[key];
  if (typeof value === 'string') {
    if (!STATUS_EFFECT_STATS.has(value)) {
      invalidField(
        context,
        key,
        `must be one of ${[...STATUS_EFFECT_STATS].join(', ')}`,
      );
    }
    return value as StatusEffectStat;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      invalidField(context, key, 'must not be empty');
    }
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item !== 'string' || !STATUS_EFFECT_STATS.has(item)) {
        invalidField(
          context,
          `${key}[${i}]`,
          `must be one of ${[...STATUS_EFFECT_STATS].join(', ')}`,
        );
      }
    }
    return value as StatusEffectStat[];
  }
  missingField(context, key);
}

function parseOptionalRange(
  obj: Record<string, unknown>,
  context: string,
): number | undefined {
  const rangePx = obj.range;
  if (rangePx === undefined) return undefined;
  if (typeof rangePx !== 'number' || Number.isNaN(rangePx) || rangePx <= 0) {
    invalidField(context, 'range', 'must be a positive number');
  }
  return rangePx;
}

function parseSkillVfx(
  raw: unknown,
  context: string,
): SkillVfxDef | undefined {
  if (raw === undefined) return undefined;
  const obj = requireRecord(raw, context);
  const preset = requireEnum(obj, 'preset', context, VFX_PRESETS);
  const arc = obj.arc;
  if (arc !== undefined && typeof arc !== 'boolean') {
    invalidField(context, 'arc', 'must be a boolean');
  }
  const durationMs = obj.durationMs;
  if (
    durationMs !== undefined &&
    (typeof durationMs !== 'number' ||
      Number.isNaN(durationMs) ||
      durationMs <= 0)
  ) {
    invalidField(context, 'durationMs', 'must be a positive number');
  }
  return {
    preset,
    ...(typeof arc === 'boolean' ? { arc } : {}),
    ...(typeof durationMs === 'number' ? { durationMs } : {}),
  };
}

function parseSkillEffect(entry: unknown, context: string): SkillEffectDef {
  const obj = requireRecord(entry, context);
  const targetRule = requireEnum(obj, 'targetRule', context, TARGET_RULES);
  const type = requireEnum(obj, 'type', context, SKILL_EFFECTS);
  const range = parseOptionalRange(obj, context);

  if (type === 'damage') {
    const damageType = requireEnum(obj, 'damageType', context, DAMAGE_TYPES);
    const powerMultiplier = requireNumber(obj, 'powerMultiplier', context);
    return {
      targetRule,
      type,
      damageType,
      powerMultiplier,
      ...(range !== undefined ? { range } : {}),
    };
  }

  if (type === 'heal') {
    const powerMultiplier = requireNumber(obj, 'powerMultiplier', context);
    return {
      targetRule,
      type,
      powerMultiplier,
      ...(range !== undefined ? { range } : {}),
    };
  }

  if (type === 'buff') {
    const buffStat = requireStatusEffectStat(obj, 'buffStat', context);
    const buffDurationSec = requireNumber(obj, 'buffDurationSec', context);
    requireBuffOrDebuffModifier(
      obj,
      context,
      'buffMultiplier',
      'buffFlatBonus',
    );
    return {
      targetRule,
      type,
      buffStat,
      buffDurationSec,
      ...(typeof obj.buffMultiplier === 'number'
        ? { buffMultiplier: obj.buffMultiplier }
        : {}),
      ...(typeof obj.buffFlatBonus === 'number'
        ? { buffFlatBonus: obj.buffFlatBonus }
        : {}),
      ...(range !== undefined ? { range } : {}),
    };
  }

  if (type === 'hot') {
    const durationSec = requireNumber(obj, 'durationSec', context);
    const powerMultiplier = requireNumber(obj, 'powerMultiplier', context);
    return {
      targetRule,
      type: 'hot',
      durationSec,
      powerMultiplier,
      ...(range !== undefined ? { range } : {}),
    };
  }

  if (type === 'dot') {
    const durationSec = requireNumber(obj, 'durationSec', context);
    const powerMultiplier = requireNumber(obj, 'powerMultiplier', context);
    const damageType =
      obj.damageType === undefined
        ? undefined
        : requireEnum(obj, 'damageType', context, DAMAGE_TYPES);
    return {
      targetRule,
      type: 'dot',
      durationSec,
      powerMultiplier,
      ...(damageType !== undefined ? { damageType } : {}),
      ...(range !== undefined ? { range } : {}),
    };
  }

  const debuffStat = requireStatusEffectStat(obj, 'debuffStat', context);
  const debuffDurationSec = requireNumber(obj, 'debuffDurationSec', context);
  requireBuffOrDebuffModifier(
    obj,
    context,
    'debuffMultiplier',
    'debuffFlatBonus',
  );
  return {
    targetRule,
    type,
    debuffStat,
    debuffDurationSec,
    ...(typeof obj.debuffMultiplier === 'number'
      ? { debuffMultiplier: obj.debuffMultiplier }
      : {}),
    ...(typeof obj.debuffFlatBonus === 'number'
      ? { debuffFlatBonus: obj.debuffFlatBonus }
      : {}),
    ...(range !== undefined ? { range } : {}),
  };
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

    const effectsRaw = obj.effect;
    if (!Array.isArray(effectsRaw) || effectsRaw.length === 0) {
      invalidField(context, 'effect', 'must be a non-empty array');
    }
    const effect = (effectsRaw as unknown[]).map((entry, effectIndex) =>
      parseSkillEffect(entry, `${context}.effect[${effectIndex}]`),
    );

    const allowedClassIds = obj.allowedClassIds;
    if (allowedClassIds !== undefined) {
      requireStringArray(
        { allowedClassIds },
        'allowedClassIds',
        context,
      );
    }

    const vfx = parseSkillVfx(obj.vfx, `${context}.vfx`);

    return {
      id,
      name,
      interval,
      effect,
      ...(Array.isArray(allowedClassIds)
        ? { allowedClassIds: allowedClassIds as string[] }
        : {}),
      ...(vfx !== undefined ? { vfx } : {}),
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
  const enemyIds = new Set(enemies.map((e) => e.id));

  const classById = new Map(classes.map((cls) => [cls.id, cls] as const));

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
      const cls = classById.get(member.classId);
      if (!cls) {
        throw new Error(`Unknown classId "${member.classId}": ${context}`);
      }
      const classSkillPool = new Set(cls.starterActiveIds);
      for (const passiveId of member.build.learnedPassiveIds) {
        if (!passiveIds.has(passiveId)) {
          throw new Error(`Unknown learnedPassiveId "${passiveId}": ${context}`);
        }
      }
      for (const activeId of member.build.learnedActiveIds) {
        if (!activeIds.has(activeId)) {
          throw new Error(`Unknown learnedActiveId "${activeId}": ${context}`);
        }
        if (!classSkillPool.has(activeId)) {
          throw new Error(
            `learnedActiveId "${activeId}" is not in class starterActiveIds: ${context}`,
          );
        }
      }
      for (const activeId of member.build.equippedActiveSlots) {
        if (activeId.length > 0 && !activeIds.has(activeId)) {
          throw new Error(
            `Unknown equippedActiveSlot "${activeId}": ${context}`,
          );
        }
        if (activeId.length > 0 && !classSkillPool.has(activeId)) {
          throw new Error(
            `equippedActiveSlot "${activeId}" is not in class starterActiveIds: ${context}`,
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
