import type {
  ActiveSkillDef,
  AttackRange,
  AttackSpeedTier,
  ClassPreset,
  ClassSkillUnlock,
  DamageType,
  EnemyTemplate,
  FormationRow,
  GrowthPresetKey,
  GrowthTier,
  GrowthTierSet,
  PartyDef,
  PassiveEffectKind,
  PassiveSkillDef,
  MoveMode,
  ResourceAmountKind,
  ResourceAmountSpec,
  Role,
  SkillEffectAnimId,
  SkillEffectDef,
  SkillEffectKind,
  SkillTrigger,
  SkillTriggerKind,
  SkillRegistry,
  SkillVfxDef,
  SkillVfxPresetId,
  StageDef,
  StatusEffectStat,
  TargetRule,
  TargetShape,
} from '../types.ts';
import {
  enrichClassPreset,
  getClassSkillIds,
  type ClassPresetBeforeEnrich,
} from '../../progression/skillUnlocks.ts';

import {
  ATTACK_RANGES,
  ATTACK_SPEED_TIERS,
  DAMAGE_TYPES,
  FORMATION_ROWS,
  JOB_TIERS,
  PASSIVE_EFFECT_KINDS,
  RESOURCE_AMOUNT_KINDS,
  ROLES,
  SKILL_EFFECT_KINDS,
  STATUS_EFFECT_STATS,
  TARGET_RULES,
  MOVE_MODES,
  SKILL_EFFECT_ANIM_IDS,
  SKILL_TRIGGER_KINDS,
  TARGET_SHAPES,
  VALID_REG_VALUES,
  VFX_PRESETS,
} from './gameDataSchema.ts';

const ROLES_SET = new Set<Role>(ROLES);
const FORMATION_ROWS_SET = new Set<FormationRow>(FORMATION_ROWS);
const ATTACK_RANGES_SET = new Set<AttackRange>(ATTACK_RANGES);
const ATTACK_SPEED_TIERS_SET = new Set<AttackSpeedTier>(ATTACK_SPEED_TIERS);
const SKILL_EFFECTS = new Set<SkillEffectKind>(SKILL_EFFECT_KINDS);
const DAMAGE_TYPES_SET = new Set<DamageType>(DAMAGE_TYPES);
const VFX_PRESETS_SET = new Set<SkillVfxPresetId>(VFX_PRESETS);
const TARGET_RULES_SET = new Set<TargetRule>(TARGET_RULES);
const TARGET_SHAPES_SET = new Set<TargetShape>(TARGET_SHAPES);
const MOVE_MODES_SET = new Set<MoveMode>(MOVE_MODES);
const SKILL_EFFECT_ANIM_IDS_SET = new Set<SkillEffectAnimId>(
  SKILL_EFFECT_ANIM_IDS,
);
const SKILL_TRIGGER_KINDS_SET = new Set<SkillTriggerKind>(SKILL_TRIGGER_KINDS);
const PASSIVE_EFFECTS = new Set<PassiveEffectKind>(PASSIVE_EFFECT_KINDS);
const STATUS_EFFECT_STATS_SET = new Set<string>(STATUS_EFFECT_STATS);
const VALID_REG = new Set<number>(VALID_REG_VALUES);
const GROWTH_TIERS = new Set<GrowthTier>([1, 2, 3]);
const GROWTH_PRESET_KEYS = new Set<GrowthPresetKey>(['attacker', 'caster']);
const JOB_TIERS_SET = new Set<number>(JOB_TIERS);
const RESOURCE_AMOUNT_KINDS_SET = new Set<ResourceAmountKind>(
  RESOURCE_AMOUNT_KINDS,
);

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

function requireBoolean(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): boolean {
  const value = obj[key];
  if (typeof value !== 'boolean') {
    invalidField(context, key, 'must be a boolean');
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
    if (!STATUS_EFFECT_STATS_SET.has(value)) {
      invalidField(
        context,
        key,
        `must be one of ${[...STATUS_EFFECT_STATS_SET].join(', ')}`,
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
      if (typeof item !== 'string' || !STATUS_EFFECT_STATS_SET.has(item)) {
        invalidField(
          context,
          `${key}[${i}]`,
          `must be one of ${[...STATUS_EFFECT_STATS_SET].join(', ')}`,
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
  if (typeof rangePx !== 'number' || Number.isNaN(rangePx) || rangePx < 0) {
    invalidField(context, 'range', 'must be a non-negative number');
  }
  return rangePx;
}

function parseOptionalNumber(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): number | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    invalidField(context, key, 'must be a number');
  }
  return value;
}

function parseResourceAmountSpec(
  raw: unknown,
  context: string,
): ResourceAmountSpec {
  const obj = requireRecord(raw, context);
  const kind = requireEnum(obj, 'kind', context, RESOURCE_AMOUNT_KINDS_SET);

  if (kind === 'atkBased') {
    const spec: ResourceAmountSpec = { kind };
    const atkOffset = parseOptionalNumber(obj, 'atkOffset', context);
    const atkScale = parseOptionalNumber(obj, 'atkScale', context);
    if (atkOffset !== undefined) spec.atkOffset = atkOffset;
    if (atkScale !== undefined) spec.atkScale = atkScale;

    if (spec.atkOffset === undefined || spec.atkScale === undefined) {
      const legacyAdd = parseOptionalNumber(obj, 'atkAdd', context);
      const legacyMultiply = parseOptionalNumber(obj, 'atkMultiply', context);
      const legacyDivide = parseOptionalNumber(obj, 'atkDivide', context);
      const legacySubtract = parseOptionalNumber(obj, 'atkSubtract', context);
      if (spec.atkOffset === undefined) {
        const offset = (legacyAdd ?? 0) - (legacySubtract ?? 0);
        if (offset !== 0) spec.atkOffset = offset;
      }
      if (spec.atkScale === undefined) {
        const scale = (legacyMultiply ?? 1) / (legacyDivide ?? 1);
        if (scale !== 1) spec.atkScale = scale;
      }
    }
    return spec;
  }

  if (kind === 'flat') {
    const flatAmount = requireNumber(obj, 'flatAmount', context);
    return { kind, flatAmount };
  }

  const percentOfMaxHp = requireNumber(obj, 'percentOfMaxHp', context);
  if (percentOfMaxHp < 0 || percentOfMaxHp > 1) {
    invalidField(context, 'percentOfMaxHp', 'must be between 0 and 1');
  }
  return { kind, percentOfMaxHp };
}

function parseEffectAmount(
  obj: Record<string, unknown>,
  context: string,
  label: string,
): ResourceAmountSpec {
  if (obj.amount !== undefined) {
    return parseResourceAmountSpec(obj.amount, `${context}.amount`);
  }
  const legacy = obj.powerMultiplier;
  if (typeof legacy === 'number' && !Number.isNaN(legacy)) {
    return { kind: 'atkBased', atkScale: legacy };
  }
  invalidField(context, 'amount', `or legacy powerMultiplier is required for ${label}`);
}

function parseOptionalRepeatedHitFields(
  obj: Record<string, unknown>,
  context: string,
): Partial<Pick<SkillEffectDef, 'hitCount' | 'hitDurationSec'>> {
  const hitCountRaw = obj.hitCount;
  if (hitCountRaw === undefined) {
    if (obj.hitDurationSec !== undefined) {
      invalidField(context, 'hitDurationSec', 'only allowed when hitCount >= 2');
    }
    return {};
  }
  const hitCount = requireNumber(obj, 'hitCount', context);
  if (!Number.isInteger(hitCount) || hitCount < 2) {
    invalidField(context, 'hitCount', 'must be an integer >= 2');
  }
  const hitDurationSec = requireNumber(obj, 'hitDurationSec', context);
  if (hitDurationSec <= 0) {
    invalidField(context, 'hitDurationSec', 'must be a positive number');
  }
  return { hitCount, hitDurationSec };
}

function parseTargetShapeFields(
  obj: Record<string, unknown>,
  context: string,
): Partial<
  Pick<
    SkillEffectDef,
    | 'targetShape'
    | 'aoeRadiusPx'
    | 'hitCount'
    | 'hitDurationSec'
    | 'piercePowerStepMultiplier'
    | 'piercePowerStepMode'
    | 'pierceDurationSec'
    | 'chainCount'
    | 'chainMaxDistancePx'
    | 'chainPowerStepMultiplier'
    | 'chainPowerStepMode'
    | 'scatterRadiusPx'
    | 'scatterSpreadRadiusPx'
    | 'scatterHitCount'
    | 'scatterDurationSec'
    | 'scatterSpreadRate'
  >
> {
  const targetShapeRaw = obj.targetShape;
  const targetShape =
    targetShapeRaw === undefined
      ? undefined
      : requireEnum(obj, 'targetShape', context, TARGET_SHAPES_SET);
  const effectiveShape = targetShape ?? 'single';

  const shapeOnlyFields = [
    'aoeRadiusPx',
    'hitCount',
    'hitDurationSec',
    'piercePowerStepMultiplier',
    'piercePowerStepMode',
    'pierceDurationSec',
    'chainCount',
    'chainMaxDistancePx',
    'chainPowerStepMultiplier',
    'chainPowerStepMode',
    'scatterRadiusPx',
    'scatterSpreadRadiusPx',
    'scatterHitCount',
    'scatterDurationSec',
    'scatterSpreadRate',
  ] as const;

  const singleAllowedFields = new Set(['hitCount', 'hitDurationSec']);

  for (const key of shapeOnlyFields) {
    if (
      effectiveShape === 'single' &&
      obj[key] !== undefined &&
      !singleAllowedFields.has(key)
    ) {
      invalidField(context, key, `only allowed when targetShape is not single`);
    }
  }

  if (effectiveShape !== 'aoe' && obj.aoeRadiusPx !== undefined) {
    invalidField(context, 'aoeRadiusPx', 'only allowed when targetShape is aoe');
  }
  if (
    effectiveShape !== 'multiLock' &&
    effectiveShape !== 'single' &&
    effectiveShape !== 'aoe' &&
    obj.hitCount !== undefined
  ) {
    invalidField(
      context,
      'hitCount',
      'only allowed when targetShape is single, aoe, or multiLock',
    );
  }
  if (
    effectiveShape !== 'single' &&
    effectiveShape !== 'aoe' &&
    obj.hitDurationSec !== undefined
  ) {
    invalidField(
      context,
      'hitDurationSec',
      'only allowed when targetShape is single or aoe',
    );
  }
  if (effectiveShape !== 'chain') {
    for (const key of [
      'chainCount',
      'chainMaxDistancePx',
      'chainPowerStepMultiplier',
      'chainPowerStepMode',
    ] as const) {
      if (obj[key] !== undefined) {
        invalidField(context, key, 'only allowed when targetShape is chain');
      }
    }
  }
  if (effectiveShape !== 'scatter') {
    for (const key of [
      'scatterRadiusPx',
      'scatterSpreadRadiusPx',
      'scatterHitCount',
      'scatterDurationSec',
      'scatterSpreadRate',
    ] as const) {
      if (obj[key] !== undefined) {
        invalidField(context, key, 'only allowed when targetShape is scatter');
      }
    }
  }
  if (effectiveShape !== 'pierce') {
    for (const key of [
      'piercePowerStepMultiplier',
      'piercePowerStepMode',
      'pierceDurationSec',
    ] as const) {
      if (obj[key] !== undefined) {
        invalidField(context, key, 'only allowed when targetShape is pierce');
      }
    }
  }

  if (effectiveShape === 'single') {
    return {
      ...(targetShape !== undefined ? { targetShape: 'single' } : {}),
      ...parseOptionalRepeatedHitFields(obj, context),
    };
  }

  if (effectiveShape === 'aoe') {
    const aoeRadiusPx = requireNumber(obj, 'aoeRadiusPx', context);
    if (aoeRadiusPx <= 0) {
      invalidField(context, 'aoeRadiusPx', 'must be a positive number');
    }
    return {
      targetShape: 'aoe',
      aoeRadiusPx,
      ...parseOptionalRepeatedHitFields(obj, context),
    };
  }

  if (effectiveShape === 'multiLock') {
    const hitCount = requireNumber(obj, 'hitCount', context);
    if (!Number.isInteger(hitCount) || hitCount < 2) {
      invalidField(context, 'hitCount', 'must be an integer >= 2');
    }
    return { targetShape: 'multiLock', hitCount };
  }

  if (effectiveShape === 'pierce') {
    return {
      targetShape: 'pierce',
      ...parseOptionalPowerStep(
        obj,
        context,
        'piercePowerStepMultiplier',
        'piercePowerStepMode',
      ),
      ...parseOptionalPositiveNumber(obj, context, 'pierceDurationSec'),
    };
  }

  if (effectiveShape === 'chain') {
    const chainCount = requireNumber(obj, 'chainCount', context);
    const chainMaxDistancePx = requireNumber(obj, 'chainMaxDistancePx', context);
    if (!Number.isInteger(chainCount) || chainCount < 1) {
      invalidField(context, 'chainCount', 'must be an integer >= 1');
    }
    if (chainMaxDistancePx <= 0) {
      invalidField(context, 'chainMaxDistancePx', 'must be a positive number');
    }
    return {
      targetShape: 'chain',
      chainCount,
      chainMaxDistancePx,
      ...parseOptionalPowerStep(
        obj,
        context,
        'chainPowerStepMultiplier',
        'chainPowerStepMode',
      ),
    };
  }

  if (effectiveShape === 'scatter') {
    const scatterRadiusPx = requireNumber(obj, 'scatterRadiusPx', context);
    const scatterHitCount = requireNumber(obj, 'scatterHitCount', context);
    const scatterDurationSec = requireNumber(obj, 'scatterDurationSec', context);
    if (scatterRadiusPx <= 0) {
      invalidField(context, 'scatterRadiusPx', 'must be a positive number');
    }
    if (!Number.isInteger(scatterHitCount) || scatterHitCount < 2) {
      invalidField(context, 'scatterHitCount', 'must be an integer >= 2');
    }
    if (scatterDurationSec <= 0) {
      invalidField(context, 'scatterDurationSec', 'must be a positive number');
    }
    const spreadRaw = obj.scatterSpreadRate;
    let scatterSpreadRate: number | undefined;
    if (spreadRaw !== undefined) {
      if (typeof spreadRaw !== 'number' || spreadRaw < 0 || spreadRaw > 1) {
        invalidField(context, 'scatterSpreadRate', 'must be a number from 0 to 1');
      }
      scatterSpreadRate = spreadRaw;
    }
    const spreadRadiusRaw = obj.scatterSpreadRadiusPx;
    let scatterSpreadRadiusPx: number | undefined;
    if (spreadRadiusRaw !== undefined) {
      if (typeof spreadRadiusRaw !== 'number' || spreadRadiusRaw <= 0) {
        invalidField(context, 'scatterSpreadRadiusPx', 'must be a positive number');
      }
      scatterSpreadRadiusPx = spreadRadiusRaw;
    }
    return {
      targetShape: 'scatter',
      scatterRadiusPx,
      scatterHitCount,
      scatterDurationSec,
      ...(scatterSpreadRadiusPx !== undefined ? { scatterSpreadRadiusPx } : {}),
      ...(scatterSpreadRate !== undefined ? { scatterSpreadRate } : {}),
    };
  }

  invalidField(context, 'targetShape', `unsupported shape ${effectiveShape}`);
}

function parseOptionalPositiveNumber(
  obj: Record<string, unknown>,
  context: string,
  key: string,
): Record<string, number> {
  const value = obj[key];
  if (value === undefined) return {};
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    invalidField(context, key, 'must be a positive number');
  }
  return { [key]: value };
}

function parseOptionalPowerStep(
  obj: Record<string, unknown>,
  context: string,
  multiplierKey: string,
  modeKey: string,
): Record<string, number | import('../types.ts').PowerStepMode> {
  const result: Record<string, number | import('../types.ts').PowerStepMode> =
    {};
  const mult = obj[multiplierKey];
  if (mult !== undefined) {
    if (typeof mult !== 'number' || Number.isNaN(mult) || mult <= 0) {
      invalidField(context, multiplierKey, 'must be a positive number');
    }
    result[multiplierKey] = mult;
  }
  const mode = obj[modeKey];
  if (mode !== undefined) {
    if (mode !== 'multiply' && mode !== 'divide') {
      invalidField(context, modeKey, 'must be multiply or divide');
    }
    result[modeKey] = mode;
  }
  return result;
}

function parseSkillVfx(
  raw: unknown,
  context: string,
): SkillVfxDef | undefined {
  if (raw === undefined) return undefined;
  const obj = requireRecord(raw, context);
  const preset = requireEnum(obj, 'preset', context, VFX_PRESETS_SET);
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

function parseOptionalEffectPresentation(
  obj: Record<string, unknown>,
  context: string,
): Pick<SkillEffectDef, 'anim' | 'vfx'> {
  const result: Pick<SkillEffectDef, 'anim' | 'vfx'> = {};
  if (obj.anim !== undefined) {
    result.anim = requireEnum(obj, 'anim', context, SKILL_EFFECT_ANIM_IDS_SET);
  }
  const vfx = parseSkillVfx(obj.vfx, `${context}.vfx`);
  if (vfx !== undefined) {
    result.vfx = vfx;
  }
  return result;
}

function parseSkillEffect(entry: unknown, context: string): SkillEffectDef {
  const obj = requireRecord(entry, context);
  const targetRule = requireEnum(obj, 'targetRule', context, TARGET_RULES_SET);
  const type = requireEnum(obj, 'type', context, SKILL_EFFECTS);
  const range = parseOptionalRange(obj, context);
  const targetShapeFields = parseTargetShapeFields(obj, context);
  const presentation = parseOptionalEffectPresentation(obj, context);

  if (type === 'damage') {
    const damageType = requireEnum(obj, 'damageType', context, DAMAGE_TYPES_SET);
    const amount = parseEffectAmount(obj, context, 'damage');
    return {
      targetRule,
      ...targetShapeFields,
      type,
      damageType,
      amount,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    };
  }

  if (type === 'heal') {
    const amount = parseEffectAmount(obj, context, 'heal');
    return {
      targetRule,
      ...targetShapeFields,
      type,
      amount,
      ...presentation,
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
      ...targetShapeFields,
      type,
      buffStat,
      buffDurationSec,
      ...(typeof obj.buffMultiplier === 'number'
        ? { buffMultiplier: obj.buffMultiplier }
        : {}),
      ...(typeof obj.buffFlatBonus === 'number'
        ? { buffFlatBonus: obj.buffFlatBonus }
        : {}),
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    };
  }

  if (type === 'hot') {
    const durationSec = requireNumber(obj, 'durationSec', context);
    const amount = parseEffectAmount(obj, context, 'hot');
    return {
      targetRule,
      ...targetShapeFields,
      type: 'hot',
      durationSec,
      amount,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    };
  }

  if (type === 'barrier') {
    const amount = parseEffectAmount(obj, context, 'barrier');
    const barrierStack = obj.barrierStack;
    if (barrierStack !== undefined && typeof barrierStack !== 'boolean') {
      invalidField(context, 'barrierStack', 'must be a boolean');
    }
    return {
      targetRule,
      ...targetShapeFields,
      type: 'barrier',
      amount,
      ...(typeof barrierStack === 'boolean' ? { barrierStack } : {}),
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    };
  }

  if (type === 'dot') {
    const durationSec = requireNumber(obj, 'durationSec', context);
    const powerMultiplier = requireNumber(obj, 'powerMultiplier', context);
    const damageType =
      obj.damageType === undefined
        ? undefined
        : requireEnum(obj, 'damageType', context, DAMAGE_TYPES_SET);
    return {
      targetRule,
      ...targetShapeFields,
      type: 'dot',
      durationSec,
      powerMultiplier,
      ...(damageType !== undefined ? { damageType } : {}),
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    };
  }

  if (type === 'stun') {
    const durationSec = requireNumber(obj, 'durationSec', context);
    if (durationSec <= 0) {
      invalidField(context, 'durationSec', 'must be a positive number');
    }
    return {
      targetRule,
      ...targetShapeFields,
      type: 'stun',
      durationSec,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    };
  }

  if (type === 'knockback') {
    const distancePx = requireNumber(obj, 'distancePx', context);
    if (distancePx <= 0) {
      invalidField(context, 'distancePx', 'must be a positive number');
    }
    return {
      targetRule,
      ...targetShapeFields,
      type: 'knockback',
      distancePx,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    };
  }

  if (type === 'move') {
    const effectiveShape = targetShapeFields.targetShape ?? 'single';
    if (effectiveShape !== 'single') {
      invalidField(context, 'targetShape', 'move effects must use single');
    }
    const moveDurationSec = requireNumber(obj, 'moveDurationSec', context);
    if (moveDurationSec <= 0) {
      invalidField(context, 'moveDurationSec', 'must be a positive number');
    }
    const moveModeRaw = obj.moveMode;
    let moveMode: MoveMode | undefined;
    if (moveModeRaw !== undefined) {
      moveMode = requireEnum(obj, 'moveMode', context, MOVE_MODES_SET);
    }
    const behindOffsetPx = parseOptionalNumber(obj, 'behindOffsetPx', context);
    return {
      targetRule,
      type: 'move',
      moveDurationSec,
      ...(moveMode !== undefined ? { moveMode } : {}),
      ...(behindOffsetPx !== undefined ? { behindOffsetPx } : {}),
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    };
  }

  if (type !== 'debuff') {
    invalidField(context, 'type', `unsupported effect type ${type}`);
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
    ...targetShapeFields,
    type,
    debuffStat,
    debuffDurationSec,
    ...(typeof obj.debuffMultiplier === 'number'
      ? { debuffMultiplier: obj.debuffMultiplier }
      : {}),
    ...(typeof obj.debuffFlatBonus === 'number'
      ? { debuffFlatBonus: obj.debuffFlatBonus }
      : {}),
    ...presentation,
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

function optionalStringArray(
  obj: Record<string, unknown>,
  key: string,
  context: string,
  options?: { allowEmptyItems?: boolean },
): string[] {
  const value = obj[key];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    invalidField(context, key, 'must be an array');
  }
  const items = value as unknown[];
  for (let i = 0; i < items.length; i++) {
    if (typeof items[i] !== 'string') {
      invalidField(context, `${key}[${i}]`, 'must be a string');
    }
    if (!options?.allowEmptyItems && (items[i] as string).length === 0) {
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

function parseOptionalIconKey(
  obj: Record<string, unknown>,
  context: string,
): string | undefined {
  return obj.iconKey === undefined
    ? undefined
    : requireString(obj, 'iconKey', context);
}

function requirePassiveEffectParams(
  obj: Record<string, unknown>,
  effect: PassiveEffectKind,
  context: string,
): PassiveSkillDef {
  const iconKey = parseOptionalIconKey(obj, context);
  const base = {
    id: requireString(obj, 'id', context),
    name: requireString(obj, 'name', context),
    effect,
    ...(iconKey !== undefined ? { iconKey } : {}),
  };

  switch (effect) {
    case 'targetRuleOverride':
      return {
        ...base,
        targetRuleOverride: requireEnum(
          obj,
          'targetRuleOverride',
          context,
          TARGET_RULES_SET,
        ),
      };
    case 'evasionChance':
      return {
        ...base,
        evasionChance: requireNumber(obj, 'evasionChance', context),
      };
    case 'damageVsDotTarget':
      return {
        ...base,
        scale: requireNumber(obj, 'scale', context),
        ...(obj.selfAppliedOnly !== undefined
          ? { selfAppliedOnly: requireBoolean(obj, 'selfAppliedOnly', context) }
          : {}),
      };
    case 'selfLowHpDamageScale':
      return {
        ...base,
        scale: requireNumber(obj, 'scale', context),
        maxMul: requireNumber(obj, 'maxMul', context),
      };
    case 'damageTakenToHeal':
      return { ...base, ratio: requireNumber(obj, 'ratio', context) };
    case 'partyHotAura':
      return {
        ...base,
        partyHotAuraAmount: parseResourceAmountSpec(
          obj.partyHotAuraAmount,
          `${context}.partyHotAuraAmount`,
        ),
      };
    case 'healAppliesBarrier': {
      const barrierScale =
        obj.barrierScale === undefined
          ? 1
          : requireNumber(obj, 'barrierScale', context);
      return {
        ...base,
        barrierScale,
      };
    }
    case 'extendSelfAppliedDebuff': {
      const extendSec = parseOptionalNumber(obj, 'extendSec', context);
      const durationMultiplier = parseOptionalNumber(
        obj,
        'durationMultiplier',
        context,
      );
      if (extendSec === undefined && durationMultiplier === undefined) {
        invalidField(
          context,
          'extendSec',
          'or durationMultiplier is required',
        );
      }
      return {
        ...base,
        ...(extendSec !== undefined ? { extendSec } : {}),
        ...(durationMultiplier !== undefined ? { durationMultiplier } : {}),
      };
    }
    case 'aoeCrowdBonus':
      return {
        ...base,
        perExtraTargetScale: requireNumber(
          obj,
          'perExtraTargetScale',
          context,
        ),
        maxExtraTargets: requireNumber(obj, 'maxExtraTargets', context),
      };
  }
}

function parseClassPromotion(
  raw: unknown,
  context: string,
): ClassPresetBeforeEnrich['promotion'] {
  if (raw === undefined) return undefined;
  const obj = requireRecord(raw, `${context}.promotion`);
  const minLevel = requireNumber(obj, 'minLevel', `${context}.promotion`);
  if (!Number.isInteger(minLevel) || minLevel < 1) {
    invalidField(`${context}.promotion`, 'minLevel', 'must be a positive integer');
  }
  const targetClassIds = requireStringArray(
    obj,
    'targetClassIds',
    `${context}.promotion`,
  );
  if (targetClassIds.length === 0) {
    invalidField(`${context}.promotion`, 'targetClassIds', 'must not be empty');
  }
  return { minLevel, targetClassIds };
}

function parseJobTier(
  raw: unknown,
  context: string,
): ClassPresetBeforeEnrich['jobTier'] {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'number' || !JOB_TIERS_SET.has(raw)) {
    invalidField(context, 'jobTier', `must be one of ${[...JOB_TIERS_SET].join(', ')}`);
  }
  return raw as 1 | 2;
}

function parseGrowthTierStat(raw: unknown, field: string, context: string): GrowthTier {
  if (typeof raw !== 'number' || !GROWTH_TIERS.has(raw as GrowthTier)) {
    invalidField(context, field, 'must be 1, 2, or 3');
  }
  return raw as GrowthTier;
}

function parseGrowthTier(raw: unknown, context: string): GrowthTierSet | undefined {
  if (raw === undefined) return undefined;
  const obj = requireRecord(raw, `${context}.growthTier`);
  return {
    maxHp: parseGrowthTierStat(obj.maxHp, 'maxHp', context),
    atk: parseGrowthTierStat(obj.atk, 'atk', context),
    def: parseGrowthTierStat(obj.def, 'def', context),
  };
}

function parseGrowthPresetKey(
  raw: unknown,
  role: Role,
  context: string,
): GrowthPresetKey | undefined {
  if (raw === undefined) return undefined;
  if (role !== 'attacker') {
    invalidField(context, 'growthPresetKey', 'only allowed for role attacker');
  }
  if (typeof raw !== 'string' || !GROWTH_PRESET_KEYS.has(raw as GrowthPresetKey)) {
    invalidField(context, 'growthPresetKey', 'must be attacker or caster');
  }
  return raw as GrowthPresetKey;
}

function parseClassSkills(raw: unknown, context: string): ClassSkillUnlock[] {
  if (!Array.isArray(raw)) {
    throw new Error(`${context}.skills must be an array`);
  }
  return raw.map((entry, index) => {
    const entryContext = `${context}.skills[${index}]`;
    const obj = requireRecord(entry, entryContext);
    const level = requireNumber(obj, 'level', entryContext);
    if (!Number.isInteger(level) || level < 0) {
      throw new Error(`${entryContext}.level must be a non-negative integer`);
    }
    const skillIds = requireStringArray(obj, 'skillIds', entryContext);
    return { level, skillIds };
  });
}

function parseClasses(raw: unknown): ClassPresetBeforeEnrich[] {
  if (!Array.isArray(raw)) {
    throw new Error('classes.json must be an array');
  }
  return raw.map((entry, index) => {
    const context = `classes[${index}]`;
    const obj = requireRecord(entry, context);
    const id = requireString(obj, 'id', context);
    const role = requireEnum(obj, 'role', context, ROLES_SET);
    const displayName = requireString(obj, 'displayName', context);
    const epithetEn =
      obj.epithetEn === undefined
        ? undefined
        : requireString(obj, 'epithetEn', context);
    const flavorJa =
      obj.flavorJa === undefined
        ? undefined
        : requireString(obj, 'flavorJa', context);
    const formationRow = requireEnum(obj, 'formationRow', context, FORMATION_ROWS_SET);
    const traitsObj = requireRecord(obj.traits, `${context}.traits`);
    const attackRange = requireEnum(
      traitsObj,
      'attackRange',
      `${context}.traits`,
      ATTACK_RANGES_SET,
    );
    if (traitsObj.rangePx !== undefined) {
      invalidField(
        `${context}.traits`,
        'rangePx',
        'removed; set effect.range on skills instead',
      );
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
    const passiveIds =
      obj.passiveIds === undefined
        ? []
        : requireStringArray(obj, 'passiveIds', context);
    const skills = parseClassSkills(obj.skills, context);
    if (skills.length === 0) {
      throw new Error(`${context}.skills must not be empty`);
    }
    const hasLevelZero = skills.some((entry) => entry.level === 0);
    if (!hasLevelZero) {
      throw new Error(`${context}.skills must include a level 0 entry`);
    }

    const jobTier = parseJobTier(obj.jobTier, context);
    const promotion = parseClassPromotion(obj.promotion, context);
    const promotesFrom =
      obj.promotesFrom === undefined
        ? undefined
        : requireString(obj, 'promotesFrom', context);
    const attackSpeedTier =
      obj.attackSpeedTier === undefined
        ? undefined
        : requireEnum(obj, 'attackSpeedTier', context, ATTACK_SPEED_TIERS_SET);
    const growthTier = parseGrowthTier(obj.growthTier, context);
    const growthPresetKey = parseGrowthPresetKey(
      obj.growthPresetKey,
      role,
      context,
    );
    if (jobTier === 1 && growthTier === undefined) {
      missingField(context, 'growthTier');
    }

    return {
      id,
      role,
      displayName,
      ...(epithetEn !== undefined ? { epithetEn } : {}),
      ...(flavorJa !== undefined ? { flavorJa } : {}),
      formationRow,
      traits: {
        attackRange,
      },
      maxHp,
      atk,
      def,
      reg,
      basicAttackSkillId,
      spriteKey,
      iconKey,
      ...(passiveIds.length > 0 ? { passiveIds } : {}),
      skills,
      ...(jobTier !== undefined ? { jobTier } : {}),
      ...(promotion !== undefined ? { promotion } : {}),
      ...(promotesFrom !== undefined ? { promotesFrom } : {}),
      ...(attackSpeedTier !== undefined ? { attackSpeedTier } : {}),
      ...(growthTier !== undefined ? { growthTier } : {}),
      ...(growthPresetKey !== undefined ? { growthPresetKey } : {}),
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

function parseSkillTrigger(
  obj: Record<string, unknown>,
  context: string,
): SkillTrigger {
  const triggerRaw = obj.trigger;
  if (triggerRaw !== undefined) {
    const triggerObj = requireRecord(triggerRaw, `${context}.trigger`);
    const kind = requireEnum(
      triggerObj,
      'kind',
      `${context}.trigger`,
      SKILL_TRIGGER_KINDS_SET,
    );
    const value = requireNumber(triggerObj, 'value', `${context}.trigger`);
    validateTriggerValue(kind, value, `${context}.trigger`);
    return { kind, value };
  }

  const intervalRaw = obj.interval;
  if (intervalRaw === undefined) {
    missingField(context, 'trigger or interval');
  }
  const value = requireNumber(obj, 'interval', context);
  validateTriggerValue('time', value, context);
  return { kind: 'time', value };
}

function validateTriggerValue(
  kind: SkillTriggerKind,
  value: number,
  context: string,
): void {
  if (kind === 'time') {
    if (value < 0.1) {
      invalidField(context, 'value', 'must be >= 0.1 for time trigger');
    }
    return;
  }
  if (!Number.isInteger(value) || value < 1) {
    invalidField(context, 'value', 'must be an integer >= 1 for count triggers');
  }
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
    const trigger = parseSkillTrigger(obj, context);

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
    const iconKey = parseOptionalIconKey(obj, context);

    return {
      id,
      name,
      trigger,
      effect,
      ...(Array.isArray(allowedClassIds)
        ? { allowedClassIds: allowedClassIds as string[] }
        : {}),
      ...(vfx !== undefined ? { vfx } : {}),
      ...(iconKey !== undefined ? { iconKey } : {}),
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
    const basicAttackSkillId =
      obj.basicAttackSkillId === undefined
        ? `${id}_basic_attack`
        : requireString(obj, 'basicAttackSkillId', context);
    const attackSpeedTier =
      obj.attackSpeedTier === undefined
        ? undefined
        : requireEnum(obj, 'attackSpeedTier', context, ATTACK_SPEED_TIERS_SET);
    const passiveSkillIds =
      obj.passiveSkillIds === undefined
        ? undefined
        : requireStringArray(obj, 'passiveSkillIds', context);
    const activeSkillIds =
      obj.activeSkillIds === undefined
        ? undefined
        : requireStringArray(obj, 'activeSkillIds', context);
    if (obj.rangePx !== undefined) {
      invalidField(context, 'rangePx', 'removed; set effect.range on skills instead');
    }
    const attackRangeRaw = obj.attackRange;
    let attackRange: AttackRange | undefined;
    if (attackRangeRaw !== undefined) {
      attackRange = requireEnum(
        obj,
        'attackRange',
        context,
        ATTACK_RANGES_SET,
      );
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
      basicAttackSkillId,
      ...(attackSpeedTier !== undefined ? { attackSpeedTier } : {}),
      ...(passiveSkillIds !== undefined ? { passiveSkillIds } : {}),
      ...(activeSkillIds !== undefined ? { activeSkillIds } : {}),
      ...(attackRange !== undefined ? { attackRange } : {}),
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
      const buildObj =
        memberObj.build === undefined
          ? {}
          : requireRecord(memberObj.build, `${memberContext}.build`);
      const learnedPassiveIds = optionalStringArray(
        buildObj,
        'learnedPassiveIds',
        `${memberContext}.build`,
      );
      const learnedActiveIds = optionalStringArray(
        buildObj,
        'learnedActiveIds',
        `${memberContext}.build`,
      );
      const equippedActiveSlots = optionalStringArray(
        buildObj,
        'equippedActiveSlots',
        `${memberContext}.build`,
        { allowEmptyItems: true },
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

export type GameDataValidationMode = 'strict' | 'editor';

export interface ParseAndValidateGameDataOptions {
  mode?: GameDataValidationMode;
}

function validateReferences(
  classes: ClassPreset[],
  passives: PassiveSkillDef[],
  actives: ActiveSkillDef[],
  enemies: EnemyTemplate[],
  stages: StageDef[],
  parties: Record<string, PartyDef>,
  mode: GameDataValidationMode,
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
    if (mode === 'editor') {
      continue;
    }
    for (const passiveId of cls.passiveIds ?? cls.starterPassiveIds) {
      if (!passiveIds.has(passiveId)) {
        throw new Error(`Unknown passiveId "${passiveId}": ${cls.id}`);
      }
    }
    for (const activeId of cls.starterActiveIds) {
      if (!activeIds.has(activeId)) {
        throw new Error(`Unknown starterActiveId "${activeId}": ${cls.id}`);
      }
    }
    for (const skillId of getClassSkillIds(cls.skills)) {
      if (passiveIds.has(skillId)) {
        throw new Error(
          `passive "${skillId}" must be listed in passiveIds, not skills[]: ${cls.id}`,
        );
      }
      if (!activeIds.has(skillId)) {
        throw new Error(`Unknown active skillId in skills[] "${skillId}": ${cls.id}`);
      }
      if (skillId === cls.basicAttackSkillId) {
        throw new Error(
          `basicAttackSkillId must not appear in skills[]: ${cls.id}`,
        );
      }
    }
    for (const skillId of cls.classSkillIds) {
      if (!passiveIds.has(skillId) && !activeIds.has(skillId)) {
        throw new Error(`Unknown class skillId "${skillId}": ${cls.id}`);
      }
    }
  }

  for (const enemy of enemies) {
    if (!activeIds.has(enemy.basicAttackSkillId)) {
      throw new Error(
        `Unknown basicAttackSkillId "${enemy.basicAttackSkillId}": ${enemy.id}`,
      );
    }
    for (const skillId of enemy.passiveSkillIds ?? []) {
      if (!passiveIds.has(skillId)) {
        throw new Error(`Unknown passiveSkillId "${skillId}": ${enemy.id}`);
      }
    }
    for (const skillId of enemy.activeSkillIds ?? []) {
      if (skillId === enemy.basicAttackSkillId) {
        throw new Error(
          `basicAttackSkillId must not appear in activeSkillIds: ${enemy.id}`,
        );
      }
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

  if (mode === 'editor') {
    return;
  }

  for (const [partyId, party] of Object.entries(parties)) {
    party.members.forEach((member, memberIndex) => {
      const context = `parties.${partyId}.members[${memberIndex}]`;
      const cls = classById.get(member.classId);
      if (!cls) {
        throw new Error(`Unknown classId "${member.classId}": ${context}`);
      }
      const classSkillPool = new Set(cls.classSkillIds);

      for (const passiveId of member.build.learnedPassiveIds) {
        if (!passiveIds.has(passiveId)) {
          throw new Error(`Unknown learnedPassiveId "${passiveId}": ${context}`);
        }
        const classPassiveIds = new Set(cls.passiveIds ?? cls.starterPassiveIds);
        if (!classPassiveIds.has(passiveId)) {
          throw new Error(
            `learnedPassiveId "${passiveId}" is not in class passiveIds: ${context}`,
          );
        }
      }
      for (const activeId of member.build.learnedActiveIds) {
        if (!activeIds.has(activeId)) {
          throw new Error(`Unknown learnedActiveId "${activeId}": ${context}`);
        }
        if (!classSkillPool.has(activeId)) {
          throw new Error(
            `learnedActiveId "${activeId}" is not in class skills[]: ${context}`,
          );
        }
      }
      const equippedActives: string[] = [];
      for (const activeId of member.build.equippedActiveSlots) {
        if (activeId.length > 0 && !activeIds.has(activeId)) {
          throw new Error(
            `Unknown equippedActiveSlot "${activeId}": ${context}`,
          );
        }
        if (activeId.length > 0 && !classSkillPool.has(activeId)) {
          throw new Error(
            `equippedActiveSlot "${activeId}" is not in class skills[]: ${context}`,
          );
        }
        if (
          activeId.length > 0 &&
          !member.build.learnedActiveIds.includes(activeId)
        ) {
          throw new Error(
            `equippedActiveSlot "${activeId}" is not learned: ${context}`,
          );
        }
        if (activeId.length > 0) {
          equippedActives.push(activeId);
        }
      }
      if (new Set(equippedActives).size !== equippedActives.length) {
        throw new Error(
          `equippedActiveSlots must not contain duplicate skills: ${context}`,
        );
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

export function parseAndValidateGameDataJson(
  raw: {
    classes: unknown;
    skills: unknown;
    enemies: unknown;
    stages: unknown;
    parties: unknown;
  },
  options?: ParseAndValidateGameDataOptions,
): ParsedGameDataJson {
  const mode = options?.mode ?? 'strict';
  const skillsRoot = requireRecord(raw.skills, 'skills.json');
  const passivesRaw = skillsRoot.passives;
  const activesRaw = skillsRoot.actives;
  if (passivesRaw === undefined) {
    missingField('skills.json', 'passives');
  }
  if (activesRaw === undefined) {
    missingField('skills.json', 'actives');
  }

  const classesRaw = parseClasses(raw.classes);
  const passives = parsePassives(passivesRaw);
  const actives = parseActives(activesRaw);
  const skillRegistry: SkillRegistry = {
    passives: Object.fromEntries(passives.map((skill) => [skill.id, skill])),
    actives: Object.fromEntries(actives.map((skill) => [skill.id, skill])),
  };
  const classes = classesRaw.map((cls) =>
    enrichClassPreset(cls, skillRegistry, { lenient: mode === 'editor' }),
  );
  const enemies = parseEnemies(raw.enemies);
  const stages = parseStages(raw.stages);
  const parties = parseParties(raw.parties);

  validateReferences(
    classes,
    passives,
    actives,
    enemies,
    stages,
    parties,
    mode,
  );

  return { classes, passives, actives, enemies, stages, parties };
}
