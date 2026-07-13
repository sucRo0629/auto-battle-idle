import { resolveClassFormationRow } from '../partyFormation.ts';
import {
  remapEffectTargetingToPassiveBuff,
  remapPassiveBuffTargetingToEffect,
} from '../passiveBuffBridge.ts';
import {
  remapEffectTargetingToPassiveDamageReduction,
  remapPassiveDamageReductionTargetingToEffect,
} from '../passiveDamageReductionBridge.ts';
import {
  remapEffectTargetingToPassiveHot,
  remapPassiveHotTargetingToEffect,
} from '../passiveHotBridge.ts';
import {
  remapEffectTargetingToPassiveDebuff,
  remapPassiveDebuffTargetingToEffect,
} from '../passiveDebuffBridge.ts';
import {
  remapEffectTargetingToPassiveDispel,
  remapPassiveDispelTargetingToEffect,
} from '../passiveDispelBridge.ts';
import type {
  ActiveSkillDef,
  AttackMethod,
  AttackSpeedTier,
  BasicAttackTransformPrimaryPatch,
  BasicAttackTransformSpec,
  ClassFeatureTags,
  ClassLocaleText,
  ClassPreset,
  ClassSkillUnlock,
  CombatModuleActionDef,
  CombatModuleDef,
  DamageType,
  EnemyTemplate,
  EntityTraits,
  FormationRow,
  GrowthPresetKey,
  GrowthTier,
  GrowthTierSet,
  PartyDef,
  PassiveEffectKind,
  PassivePeriodicTriggerKind,
  PassiveSkillDef,
  MoveMode,
  ResourceAmountKind,
  ResourceAmountSpec,
  Role,
  SkillEffectAnimId,
  SkillEffectDef,
  SkillEffectKind,
  LegacyHotSkillEffect,
  SkillTrigger,
  SkillTriggerKind,
  SkillRegistry,
  SkillVfxDef,
  StageDef,
  StageEnemyGroup,
  StatusEffectStat,
  StatBuffModifierEntry,
  TargetRule,
  TargetShape,
  TargetSpec,
  VfxAnchor,
  VfxLayer,
  VfxParticleDef,
  VfxPlacement,
  AnimPhaseFields,
  DebuffFilterTag,
  DispelPriority,
  DamageIncreaseCondition,
  FireCondition,
  FirePolicy,
  CounterResponseDef,
  CounterResponseKind,
  DamageIncreaseSpec,
  DefenseIgnoreSpec,
  OperationPassiveCatalogDef,
} from '../types.ts';
import { R5_COMBAT_MODULE_CLASS_IDS } from '../types.ts';
import {
  enrichClassPreset,
  getClassSkillIds,
  type ClassPresetBeforeEnrich,
} from '../../progression/skillUnlocks.ts';
import { normalizeEntityTraits } from './entityTraits.ts';
import { CONFIGURABLE_RANGE_PX_MAX } from '../rangeLimits.ts';
import {
  defaultBasicAttackId,
  synthesizeBasicAttackSkill,
} from './synthesizeBasicAttack.ts';
import { synthesizeCombatModuleSkill } from './synthesizeCombatModuleSkill.ts';
import { PASSIVE_DISPEL_TRIGGER_KINDS } from '../passivePeriodicTrigger.ts';
import { GLOBAL_MAX_CHARGES_CAP } from '../skills/chargeBank.ts';
import { STUN_MAX_DURATION_SEC } from '../ccEffects.ts';

import {
  ATTACK_SPEED_TIERS,
  DAMAGE_TYPES,
  FORMATION_ROWS,
  JOB_TIERS,
  PASSIVE_EFFECT_KINDS,
  RESOURCE_AMOUNT_KINDS,
  ROLES,
  SKILL_EFFECT_KINDS,
  HEAL_SUB_KINDS,
  BUFF_SUB_KINDS,
  DEBUFF_SUB_KINDS,
  SPECIAL_EFFECT_APPLY_TO_OPTIONS,
  BUFF_TARGET_KINDS,
  STAT_BUFF_TARGETS,
  TARGET_RULES,
  MOVE_MODES,
  ALL_SKILL_EFFECT_ANIM_IDS,
  SKILL_TRIGGER_KINDS,
  TARGET_SHAPES,
  VALID_RES_VALUES,
  VFX_ANCHORS,
  VFX_LAYERS,
  DEPRECATED_SKILL_VFX_DEF_FIELD_KEYS,
  DEPRECATED_THREAT_DAMAGE_FIELD_KEYS,
  DEPRECATED_THREAT_PASSIVE_EFFECT,
  DEPRECATED_THREAT_PASSIVE_FIELD_KEYS,
  PARTICLE_PRESET_IDS,
  VFX_PARTICLE_DEF_FIELD_KEYS,
  DEBUFF_FILTER_TAG_OPTIONS,
  DISPEL_PRIORITIES,
  BUFF_FILTER_TAG_OPTIONS,
  DOT_FLAVORS,
  DAMAGE_INCREASE_CONDITION_KINDS,
  DEFENSE_IGNORE_DEF_MODES,
  COUNTER_RESPONSE_KINDS,
  PASSIVE_COUNTER_TRIGGER_KINDS,
  TARGET_RULE_OVERRIDE_APPLY_TO_OPTIONS,
} from './gameDataSchema.ts';
import { normalizeTarget } from '../skills/targetSpec.ts';
import {
  activeEffectHasAmount,
  inferPassiveAmountField,
} from '../skillAmountOverride.ts';
import {
  isBuffFilterTag,
  isDebuffFilterTag,
} from '../statusMatching.ts';

const ROLES_SET = new Set<Role>(ROLES);
const FORMATION_ROWS_SET = new Set<FormationRow>(FORMATION_ROWS);
const ATTACK_SPEED_TIERS_SET = new Set<AttackSpeedTier>(ATTACK_SPEED_TIERS);
const SKILL_EFFECTS = new Set<SkillEffectKind>(SKILL_EFFECT_KINDS);
const COUNTER_RESPONSE_KINDS_SET = new Set<CounterResponseKind>(
  COUNTER_RESPONSE_KINDS,
);
const PASSIVE_COUNTER_TRIGGER_KINDS_SET = new Set<
  import('../types.ts').PassiveCounterTriggerKind
>(PASSIVE_COUNTER_TRIGGER_KINDS);
const DAMAGE_TYPES_SET = new Set<DamageType>(DAMAGE_TYPES);
const VFX_ANCHORS_SET = new Set<VfxAnchor>(VFX_ANCHORS);
const VFX_LAYERS_SET = new Set<VfxLayer>(VFX_LAYERS);
const PARTICLE_PRESET_IDS_SET = new Set<string>(PARTICLE_PRESET_IDS);
const TARGET_RULES_SET = new Set<TargetRule>(TARGET_RULES);
const TARGET_SHAPES_SET = new Set<TargetShape>(TARGET_SHAPES);
const MOVE_MODES_SET = new Set<MoveMode>(MOVE_MODES);
const SKILL_EFFECT_ANIM_IDS_SET = new Set<SkillEffectAnimId>(
  ALL_SKILL_EFFECT_ANIM_IDS,
);
const SKILL_TRIGGER_KINDS_SET = new Set<SkillTriggerKind>(SKILL_TRIGGER_KINDS);
const PASSIVE_EFFECTS = new Set<PassiveEffectKind>(PASSIVE_EFFECT_KINDS);
const STAT_BUFF_TARGETS_SET = new Set<string>(STAT_BUFF_TARGETS);
const VALID_RES = new Set<number>(VALID_RES_VALUES);
const GROWTH_TIERS = new Set<GrowthTier>([1, 2, 3]);
const GROWTH_PRESET_KEYS = new Set<GrowthPresetKey>(['attacker', 'caster']);
const JOB_TIERS_SET = new Set<number>(JOB_TIERS);
const DEBUFF_FILTER_TAGS_SET = new Set<string>(DEBUFF_FILTER_TAG_OPTIONS);
const DISPEL_PRIORITIES_SET = new Set<string>(DISPEL_PRIORITIES);
const DAMAGE_INCREASE_CONDITION_KINDS_SET = new Set<string>(
  DAMAGE_INCREASE_CONDITION_KINDS,
);
const DEFENSE_IGNORE_DEF_MODES_SET = new Set<string>(DEFENSE_IGNORE_DEF_MODES);
const HEAL_SUB_KINDS_SET = new Set<import('../types.ts').HealSubKind>(
  HEAL_SUB_KINDS,
);
const BUFF_SUB_KINDS_SET = new Set<import('../types.ts').BuffSubKind>(
  BUFF_SUB_KINDS,
);
const DEBUFF_SUB_KINDS_SET = new Set<import('../types.ts').DebuffSubKind>(
  DEBUFF_SUB_KINDS,
);
const DOT_FLAVORS_SET = new Set<string>(DOT_FLAVORS);

function parseOptionalDotFlavor(
  obj: Record<string, unknown>,
  context: string,
  field = 'dotFlavor',
): import('../types.ts').DotFlavor | undefined {
  if (obj[field] === undefined) return undefined;
  return requireEnum(obj, field, context, DOT_FLAVORS_SET);
}

function parseOptionalDebuffDisplayName(
  obj: Record<string, unknown>,
): string | undefined {
  return typeof obj.buffDisplayName === 'string' && obj.buffDisplayName.length > 0
    ? obj.buffDisplayName
    : undefined;
}
const SPECIAL_EFFECT_APPLY_TO_SET = new Set<
  import('../types.ts').SpecialEffectApplyTo
>(SPECIAL_EFFECT_APPLY_TO_OPTIONS);
const BUFF_TARGET_KINDS_SET = new Set<import('../types.ts').BuffTargetKind>(
  BUFF_TARGET_KINDS,
);
const TARGET_RULE_OVERRIDE_APPLY_TO_SET = new Set<
  import('../types.ts').TargetRuleOverrideApplyTo
>(TARGET_RULE_OVERRIDE_APPLY_TO_OPTIONS);

const LEGACY_PASSIVE_EFFECT_ALIASES: Record<string, PassiveEffectKind> = {
  healAppliesBarrier: 'excessHealToBarrier',
  partyHotAura: 'heal',
  hot: 'heal',
  evasionChance: 'buff',
  block: 'buff',
  counterChance: 'counter',
  damageIncrease: 'specialEffect',
  healReceivedIncrease: 'specialEffect',
  ignoredDefBonus: 'ignoredDefBonusDamage',
};

/** エディタ表示・保存前に旧 effect 名を新 taxonomy へ正規化 */
export function normalizePassiveSkillForEditor(
  passive: PassiveSkillDef,
): PassiveSkillDef {
  if (passive.effect === 'hot') {
    return { ...passive, effect: 'heal', healSubKind: 'hot' };
  }

  const effectRaw = passive.effect;
  const normalizedEffect = LEGACY_PASSIVE_EFFECT_ALIASES[effectRaw];
  if (!normalizedEffect) return passive;

  const next: PassiveSkillDef = { ...passive, effect: normalizedEffect };
  if (effectRaw === 'evasionChance') {
    next.buffSubKind = 'evasion';
    next.chance = passive.evasionChance ?? passive.chance;
  } else if (effectRaw === 'block') {
    next.buffSubKind = 'block';
    next.chance = passive.blockChance ?? passive.chance;
    next.buffTargetRule =
      passive.buffTargetRule ??
      passive.targetRuleOverride ??
      ({ kind: 'self' } as const);
  } else if (effectRaw === 'counterChance') {
    next.chance = passive.counterChance ?? passive.chance;
  } else if (effectRaw === 'damageIncrease') {
    next.specialEffectApplyTo = 'damage';
    next.specialEffect = passive.damageIncrease ?? passive.specialEffect;
  } else if (effectRaw === 'healReceivedIncrease') {
    const percent = passive.percent ?? 0;
    next.specialEffectApplyTo = 'heal';
    next.specialEffect = passive.specialEffect ?? {
      scale: 1 + percent,
      conditions: [{ kind: 'targetHp', maxHpRatio: 1 }],
    };
  } else if (String(effectRaw) === 'partyHotAura') {
    next.healSubKind = 'hot';
  }
  return next;
}

/** 保存前に UI デフォルト表示のみで未設定の buff フィールドを埋める */
export function normalizeActiveSkillEffectForEditor(
  effect: SkillEffectDef,
): SkillEffectDef {
  const normalized = normalizeSkillEffect(effect);
  if (normalized.type === 'debuff' && normalized.debuffSubKind === 'dot') {
    const amount =
      normalized.amount ??
      (normalized.powerMultiplier !== undefined
        ? { kind: 'atkBased' as const, atkScale: normalized.powerMultiplier }
        : { kind: 'atkBased' as const, atkScale: 0.2 });
    return {
      ...normalized,
      durationSec: normalized.durationSec ?? 5,
      amount,
      damageType: normalized.damageType ?? 'physical',
    };
  }
  if (normalized.type === 'heal' && (normalized.healSubKind ?? 'instant') === 'hot') {
    return {
      ...normalized,
      durationSec: normalized.durationSec ?? 5,
      amount:
        normalized.amount ??
        ({ kind: 'atkBased' as const, atkScale: 1 }),
    };
  }
  if (normalized.type !== 'buff') return normalized;

  const subKind = normalized.buffSubKind ?? 'stat';
  if (subKind === 'damageDelay') {
    return {
      ...normalized,
      ratio: normalized.ratio ?? 0.5,
      buffDurationSec: normalized.buffDurationSec ?? 5,
    };
  }
  if (subKind === 'block' || subKind === 'evasion') {
    return {
      ...normalized,
      chance: normalized.chance ?? 0.2,
      buffDurationSec: normalized.buffDurationSec ?? 5,
    };
  }
  if (normalized.type === 'basicAttackTransform') {
    return {
      ...normalized,
      target: { kind: 'self' },
      buffDurationSec: normalized.buffDurationSec ?? 5,
    };
  }
  return normalized;
}

const REMOVED_PASSIVE_EFFECTS = new Set([
  'damageVsDotTarget',
  'selfLowHpDamageScale',
  'extendSelfAppliedDebuff',
  'damageIncrease',
  'healReceivedIncrease',
  'evasionChance',
  'block',
  'counterChance',
  'damageTakenToHeal',
  DEPRECATED_THREAT_PASSIVE_EFFECT,
]);
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

function requireStunDurationSec(
  obj: Record<string, unknown>,
  context: string,
): number {
  const durationSec = requireNumber(obj, 'durationSec', context);
  if (durationSec <= 0) {
    invalidField(context, 'durationSec', 'must be a positive number');
  }
  if (durationSec > STUN_MAX_DURATION_SEC) {
    invalidField(
      context,
      'durationSec',
      `must be at most ${STUN_MAX_DURATION_SEC}`,
    );
  }
  return durationSec;
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

function parseStatBuffModifierEntry(
  entry: unknown,
  context: string,
  index: number,
): StatBuffModifierEntry {
  const entryContext = `${context}[${index}]`;
  if (typeof entry !== 'object' || entry === null) {
    invalidField(entryContext, 'entry', 'must be an object');
  }
  const obj = entry as Record<string, unknown>;
  const stat = requireStatBuffTarget(obj, 'stat', entryContext);
  if (Array.isArray(stat)) {
    invalidField(entryContext, 'stat', 'must be a single status stat');
  }
  const multiplier = parseOptionalNumber(obj, 'multiplier', entryContext);
  const flatBonus = parseOptionalNonNegativeNumber(obj, 'flatBonus', entryContext);
  const hasMultiplier =
    multiplier !== undefined && !Number.isNaN(multiplier);
  const hasFlatBonus = flatBonus !== undefined && !Number.isNaN(flatBonus);
  if (!hasMultiplier && !hasFlatBonus) {
    invalidField(
      entryContext,
      'multiplier or flatBonus',
      'at least one is required',
    );
  }
  if (hasFlatBonus && flatBonus <= 0) {
    invalidField(entryContext, 'flatBonus', 'must be a positive number');
  }
  return {
    stat,
    ...(hasMultiplier ? { multiplier } : {}),
    ...(hasFlatBonus ? { flatBonus } : {}),
  };
}

function parseStatBuffModifierEntries(
  obj: Record<string, unknown>,
  context: string,
): StatBuffModifierEntry[] | undefined {
  const raw = obj.buffStatModifiers;
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    invalidField(context, 'buffStatModifiers', 'must be an array');
  }
  if (raw.length === 0) {
    invalidField(context, 'buffStatModifiers', 'must not be empty');
  }
  return raw.map((entry, index) =>
    parseStatBuffModifierEntry(entry, `${context}.buffStatModifiers`, index),
  );
}

function requireStatBuffTarget(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): import('../types.ts').StatBuffTarget | import('../types.ts').StatBuffTarget[] {
  const value = obj[key];
  if (typeof value === 'string') {
    if (!STAT_BUFF_TARGETS_SET.has(value)) {
      invalidField(
        context,
        key,
        `must be one of ${[...STAT_BUFF_TARGETS_SET].join(', ')}`,
      );
    }
    return value as import('../types.ts').StatBuffTarget;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      invalidField(context, key, 'must not be empty');
    }
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item !== 'string' || !STAT_BUFF_TARGETS_SET.has(item)) {
        invalidField(
          context,
          `${key}[${i}]`,
          `must be one of ${[...STAT_BUFF_TARGETS_SET].join(', ')}`,
        );
      }
    }
    return value as import('../types.ts').StatBuffTarget[];
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
  if (rangePx > CONFIGURABLE_RANGE_PX_MAX) {
    invalidField(
      context,
      'range',
      `must be at most ${CONFIGURABLE_RANGE_PX_MAX}`,
    );
  }
  return rangePx;
}

function parsePassiveHotRange(
  obj: Record<string, unknown>,
  context: string,
): number | undefined {
  if (obj.hotRange === undefined) return undefined;
  return parseOptionalRange({ range: obj.hotRange }, context);
}

function parsePassiveHotTargetingFields(
  obj: Record<string, unknown>,
  context: string,
): Partial<PassiveSkillDef> {
  const remapped = remapPassiveHotTargetingToEffect(obj);
  const shapeFields = parseTargetShapeFields(remapped, context);
  const hotRange = parsePassiveHotRange(obj, context);
  return {
    ...remapEffectTargetingToPassiveHot(shapeFields),
    ...(hotRange !== undefined ? { hotRange } : {}),
  };
}

function parsePassiveDamageReductionRange(
  obj: Record<string, unknown>,
  context: string,
): number | undefined {
  if (obj.damageReductionRange === undefined) return undefined;
  return parseOptionalRange({ range: obj.damageReductionRange }, context);
}

function parsePassiveDamageReductionTargetingFields(
  obj: Record<string, unknown>,
  context: string,
): Partial<PassiveSkillDef> {
  const remapped = remapPassiveDamageReductionTargetingToEffect(obj);
  const shapeFields = parseTargetShapeFields(remapped, context);
  const damageReductionRange = parsePassiveDamageReductionRange(obj, context);
  return {
    ...remapEffectTargetingToPassiveDamageReduction(shapeFields),
    ...(damageReductionRange !== undefined ? { damageReductionRange } : {}),
  };
}

function parsePassiveBuffRange(
  obj: Record<string, unknown>,
  context: string,
): number | undefined {
  if (obj.buffRange === undefined) return undefined;
  return parseOptionalRange({ range: obj.buffRange }, context);
}

function parsePassiveBuffTargetingFields(
  obj: Record<string, unknown>,
  context: string,
): Partial<PassiveSkillDef> {
  const remapped = remapPassiveBuffTargetingToEffect(obj);
  const shapeFields = parseTargetShapeFields(remapped, context);
  const buffRange = parsePassiveBuffRange(obj, context);
  return {
    ...remapEffectTargetingToPassiveBuff(shapeFields),
    ...(buffRange !== undefined ? { buffRange } : {}),
  };
}

function parsePassiveDebuffRange(
  obj: Record<string, unknown>,
  context: string,
): number | undefined {
  if (obj.debuffRange === undefined) return undefined;
  return parseOptionalRange({ range: obj.debuffRange }, context);
}

function parsePassiveDebuffTargetingFields(
  obj: Record<string, unknown>,
  context: string,
): Partial<PassiveSkillDef> {
  const remapped = remapPassiveDebuffTargetingToEffect(obj);
  const shapeFields = parseTargetShapeFields(remapped, context);
  const debuffRange = parsePassiveDebuffRange(obj, context);
  return {
    ...remapEffectTargetingToPassiveDebuff(shapeFields),
    ...(debuffRange !== undefined ? { debuffRange } : {}),
  };
}

function parsePassiveDispelRange(
  obj: Record<string, unknown>,
  context: string,
): number | undefined {
  if (obj.dispelRange === undefined) return undefined;
  return parseOptionalRange({ range: obj.dispelRange }, context);
}

function parsePassiveDispelTargetingFields(
  obj: Record<string, unknown>,
  context: string,
): Partial<PassiveSkillDef> {
  const remapped = remapPassiveDispelTargetingToEffect(obj);
  const shapeFields = parseTargetShapeFields(remapped, context);
  const dispelRange = parsePassiveDispelRange(obj, context);
  return {
    ...remapEffectTargetingToPassiveDispel(shapeFields),
    ...(dispelRange !== undefined ? { dispelRange } : {}),
  };
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

function parseOptionalBoolean(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): boolean | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    invalidField(context, key, 'must be a boolean');
  }
  return value;
}

function parseCounterAttackRangeBandFields(
  obj: Record<string, unknown>,
  context: string,
): { counterMelee?: boolean; counterRanged?: boolean } {
  const counterMelee = obj.counterMelee === true ? true : undefined;
  const counterRanged = obj.counterRanged === true ? true : undefined;
  if (obj.counterMelee !== undefined && obj.counterMelee !== true) {
    invalidField(context, 'counterMelee', 'must be true when set');
  }
  if (obj.counterRanged !== undefined && obj.counterRanged !== true) {
    invalidField(context, 'counterRanged', 'must be true when set');
  }
  return {
    ...(counterMelee ? { counterMelee } : {}),
    ...(counterRanged ? { counterRanged } : {}),
  };
}

function parseOptionalPassiveCounterTrigger(
  obj: Record<string, unknown>,
  context: string,
): import('../types.ts').PassiveCounterTriggerKind | undefined {
  if (obj.counterTrigger === undefined) return undefined;
  return requireEnum(
    obj,
    'counterTrigger',
    context,
    PASSIVE_COUNTER_TRIGGER_KINDS_SET,
  );
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
    if (spec.atkScale === undefined) {
      missingField(`${context}`, 'atkScale for atkBased amount');
    }
    return spec;
  }

  if (kind === 'defBased') {
    const spec: ResourceAmountSpec = { kind };
    const defOffset = parseOptionalNumber(obj, 'defOffset', context);
    const defScale = parseOptionalNumber(obj, 'defScale', context);
    if (defOffset !== undefined) spec.defOffset = defOffset;
    if (defScale !== undefined) spec.defScale = defScale;
    if (spec.defScale === undefined) {
      missingField(`${context}`, 'defScale for defBased amount');
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
  const spec: ResourceAmountSpec = { kind, percentOfMaxHp };
  if (obj.maxHpRef !== undefined) {
    const maxHpRef = requireEnum(
      obj,
      'maxHpRef',
      context,
      new Set(['self', 'target'] as const),
    );
    if (maxHpRef !== 'target') {
      spec.maxHpRef = maxHpRef;
    }
  }
  return spec;
}

function parseEffectAmount(
  obj: Record<string, unknown>,
  context: string,
  label: string,
): ResourceAmountSpec {
  if (obj.amount !== undefined) {
    return parseResourceAmountSpec(obj.amount, `${context}.amount`);
  }
  const legacyScale = obj.powerMultiplier;
  if (typeof legacyScale === 'number') {
    return { kind: 'atkBased', atkScale: legacyScale };
  }
  invalidField(context, 'amount', `is required for ${label}`);
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
    | 'chainDurationSec'
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
    'chainDurationSec',
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
      'chainDurationSec',
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
      ...parseOptionalPositiveNumber(obj, context, 'chainDurationSec'),
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

  if (effectiveShape === 'poolEach') {
    return { targetShape: 'poolEach' };
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

function normalizeLegacyPassivePeriodicFields(
  obj: Record<string, unknown>,
): void {
  if (obj.periodicTrigger === 'interval') {
    delete obj.periodicTrigger;
  }
  delete obj.intervalSec;
}

function parsePassivePeriodicTriggerFields(
  obj: Record<string, unknown>,
  context: string,
  options: {
    requireTrigger?: boolean;
    allowedKinds?: readonly PassivePeriodicTriggerKind[];
  } = {},
): Pick<PassiveSkillDef, 'periodicTrigger'> {
  normalizeLegacyPassivePeriodicFields(obj);

  const allowedKinds =
    options.allowedKinds ?? (['stageStart', 'waveStart'] as const);
  const allowedSet = new Set<string>(allowedKinds);

  const periodicTriggerRaw = obj.periodicTrigger;
  let periodicTrigger: PassivePeriodicTriggerKind | undefined;
  if (periodicTriggerRaw !== undefined) {
    periodicTrigger = requireEnum(
      obj,
      'periodicTrigger',
      context,
      allowedSet,
    ) as PassivePeriodicTriggerKind;
  }

  if (options.requireTrigger && periodicTrigger === undefined) {
    missingField(context, 'periodicTrigger');
  }

  return periodicTrigger !== undefined ? { periodicTrigger } : {};
}

function parseOptionalNonNegativeNumber(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): number | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    invalidField(context, key, 'must be a non-negative number');
  }
  return value;
}

function parseOptionalPositiveIntArray(
  value: unknown,
  context: string,
): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    invalidField(context, '', 'must be an array of positive integers');
  }
  const result: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 1) {
      invalidField(context, `[${i}]`, 'must be a positive integer');
    }
    result.push(entry);
  }
  return result;
}

function parseOptionalNumberArray(
  value: unknown,
  context: string,
): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    invalidField(context, '', 'must be an array of numbers');
  }
  const result: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry !== 'number' || Number.isNaN(entry)) {
      invalidField(context, `[${i}]`, 'must be a number');
    }
    result.push(entry);
  }
  return result;
}

function parseOptionalWaitAfterSec(
  obj: Record<string, unknown>,
  context: string,
): Partial<Pick<SkillEffectDef, 'waitAfterSec'>> {
  const value = obj.waitAfterSec;
  if (value === undefined) return {};
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    invalidField(context, 'waitAfterSec', 'must be a positive number');
  }
  return { waitAfterSec: value };
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

function parseOptionalAnimPhaseFields(
  obj: Record<string, unknown>,
  context: string,
): AnimPhaseFields {
  const result: AnimPhaseFields = {};
  const animStartFrameRaw = parseOptionalNumber(obj, 'animStartFrame', context);
  if (animStartFrameRaw !== undefined) {
    if (!Number.isInteger(animStartFrameRaw) || animStartFrameRaw < 0) {
      invalidField(context, 'animStartFrame', 'must be a non-negative integer');
    }
    result.animStartFrame = animStartFrameRaw;
  }
  const animIntroEndFrameRaw = parseOptionalNumber(
    obj,
    'animIntroEndFrame',
    context,
  );
  if (animIntroEndFrameRaw !== undefined) {
    if (!Number.isInteger(animIntroEndFrameRaw) || animIntroEndFrameRaw < 0) {
      invalidField(
        context,
        'animIntroEndFrame',
        'must be a non-negative integer',
      );
    }
    result.animIntroEndFrame = animIntroEndFrameRaw;
  }
  const animLoopFrameRaw = parseOptionalNumber(obj, 'animLoopFrame', context);
  if (animLoopFrameRaw !== undefined) {
    if (!Number.isInteger(animLoopFrameRaw) || animLoopFrameRaw < 0) {
      invalidField(context, 'animLoopFrame', 'must be a non-negative integer');
    }
    result.animLoopFrame = animLoopFrameRaw;
  }
  const animLoopEndFrameRaw = parseOptionalNumber(
    obj,
    'animLoopEndFrame',
    context,
  );
  if (animLoopEndFrameRaw !== undefined) {
    if (!Number.isInteger(animLoopEndFrameRaw) || animLoopEndFrameRaw < 0) {
      invalidField(
        context,
        'animLoopEndFrame',
        'must be a non-negative integer',
      );
    }
    result.animLoopEndFrame = animLoopEndFrameRaw;
  }
  const animOutroStartFrameRaw = parseOptionalNumber(
    obj,
    'animOutroStartFrame',
    context,
  );
  if (animOutroStartFrameRaw !== undefined) {
    if (!Number.isInteger(animOutroStartFrameRaw) || animOutroStartFrameRaw < 0) {
      invalidField(
        context,
        'animOutroStartFrame',
        'must be a non-negative integer',
      );
    }
    result.animOutroStartFrame = animOutroStartFrameRaw;
  }
  return result;
}

function parseVfxPlacement(
  raw: unknown,
  context: string,
): VfxPlacement | undefined {
  if (raw === undefined) return undefined;
  const obj = requireRecord(raw, context);
  const anchor = requireEnum(obj, 'anchor', context, VFX_ANCHORS_SET);
  const offsetX = parseOptionalNumber(obj, 'offsetX', context);
  const offsetY = parseOptionalNumber(obj, 'offsetY', context);
  const layer =
    obj.layer === undefined
      ? undefined
      : requireEnum(obj, 'layer', context, VFX_LAYERS_SET);
  return {
    anchor,
    ...(offsetX !== undefined ? { offsetX } : {}),
    ...(offsetY !== undefined ? { offsetY } : {}),
    ...(layer !== undefined ? { layer } : {}),
  };
}

function rejectDeprecatedSkillVfxFields(
  obj: Record<string, unknown>,
  context: string,
): void {
  for (const key of DEPRECATED_SKILL_VFX_DEF_FIELD_KEYS) {
    if (obj[key] !== undefined) {
      invalidField(
        context,
        key,
        'is deprecated (Canvas preset VFX was removed)',
      );
    }
  }
}

function rejectDeprecatedThreatPassiveFields(
  obj: Record<string, unknown>,
  context: string,
): void {
  for (const key of DEPRECATED_THREAT_PASSIVE_FIELD_KEYS) {
    if (obj[key] !== undefined) {
      invalidField(
        context,
        key,
        'is deprecated (threatControl was removed; use damageReduction for ally DR auras)',
      );
    }
  }
}

function rejectDeprecatedThreatDamageFields(
  obj: Record<string, unknown>,
  context: string,
): void {
  for (const key of DEPRECATED_THREAT_DAMAGE_FIELD_KEYS) {
    if (obj[key] !== undefined) {
      invalidField(
        context,
        key,
        'is deprecated (threatBurst* was removed)',
      );
    }
  }
}

function parseVfxParticles(
  raw: unknown,
  context: string,
): VfxParticleDef | undefined {
  if (raw === undefined) return undefined;
  const obj = requireRecord(raw, context);
  const enabled = obj.enabled;
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    invalidField(context, 'enabled', 'must be a boolean');
  }
  const preset = requireString(obj, 'preset', context);
  if (!PARTICLE_PRESET_IDS_SET.has(preset)) {
    invalidField(
      context,
      'preset',
      `must be one of ${[...PARTICLE_PRESET_IDS_SET].join(', ')}`,
    );
  }
  const count = parseOptionalNumber(obj, 'count', context);
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) {
    invalidField(context, 'count', 'must be a positive integer');
  }
  const durationSec = parseOptionalNumber(obj, 'durationSec', context);
  if (durationSec !== undefined && durationSec <= 0) {
    invalidField(context, 'durationSec', 'must be a positive number');
  }
  const delaySec = parseOptionalNonNegativeNumber(obj, 'delaySec', context);
  const tint = obj.tint;
  if (tint !== undefined) {
    if (typeof tint !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(tint)) {
      invalidField(context, 'tint', 'must be a #rrggbb hex color');
    }
  }
  const placement = parseVfxPlacement(obj.placement, `${context}.placement`);
  for (const key of Object.keys(obj)) {
    if (!(VFX_PARTICLE_DEF_FIELD_KEYS as readonly string[]).includes(key)) {
      invalidField(context, key, 'is not a valid particle field');
    }
  }
  return {
    preset,
    ...(typeof enabled === 'boolean' ? { enabled } : {}),
    ...(placement !== undefined ? { placement } : {}),
    ...(count !== undefined ? { count } : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(delaySec !== undefined ? { delaySec } : {}),
    ...(typeof tint === 'string' ? { tint } : {}),
  };
}

export function parseSkillVfx(
  raw: unknown,
  context: string,
): SkillVfxDef | undefined {
  if (raw === undefined) return undefined;
  const obj = requireRecord(raw, context);
  rejectDeprecatedSkillVfxFields(obj, context);
  const enabled = obj.enabled;
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    invalidField(context, 'enabled', 'must be a boolean');
  }
  const placement = parseVfxPlacement(obj.placement, `${context}.placement`);
  const particles = parseVfxParticles(obj.particles, `${context}.particles`);
  const animPhase = parseOptionalAnimPhaseFields(obj, context);
  return {
    ...animPhase,
    ...(typeof enabled === 'boolean' ? { enabled } : {}),
    ...(placement !== undefined ? { placement } : {}),
    ...(particles !== undefined ? { particles } : {}),
  };
}

function parseDispelPriority(
  raw: unknown,
  context: string,
): DispelPriority | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !DISPEL_PRIORITIES_SET.has(raw)) {
    invalidField(
      context,
      'dispelPriority',
      `must be one of ${[...DISPEL_PRIORITIES_SET].join(', ')}`,
    );
  }
  return raw as DispelPriority;
}

function parseDebuffFilterTags(
  raw: unknown,
  context: string,
  required: boolean,
): DebuffFilterTag[] | undefined {
  if (raw === undefined) {
    if (required) {
      invalidField(context, 'debuff tags', 'is required');
    }
    return undefined;
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    invalidField(context, 'tags', 'must be a non-empty array');
  }
  return raw.map((entry, index) => {
    const tagContext = `${context}[${index}]`;
    if (typeof entry !== 'string' || !DEBUFF_FILTER_TAGS_SET.has(entry)) {
      invalidField(
        tagContext,
        'tag',
        `must be one of ${[...DEBUFF_FILTER_TAGS_SET].join(', ')}`,
      );
    }
    return entry as DebuffFilterTag;
  });
}

function parseExcludeRoles(
  raw: unknown,
  context: string,
): Role[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    invalidField(context, 'excludeRoles', 'must be a non-empty array');
  }
  return raw.map((entry, index) => {
    const itemContext = `${context}[${index}]`;
    if (typeof entry !== 'string' || !ROLES_SET.has(entry as Role)) {
      invalidField(
        itemContext,
        'value',
        `must be one of ${[...ROLES_SET].join(', ')}`,
      );
    }
    return entry as Role;
  });
}

type ParsedAttackTypeFields = {
  physical?: true;
  magic?: true;
  melee?: true;
  ranged?: true;
  excludeRoles?: Role[];
};

function parseAttackTypeFields(
  obj: Record<string, unknown>,
  context: string,
): ParsedAttackTypeFields {
  const physical = obj.physical === true;
  const magic = obj.magic === true;
  const melee = obj.melee === true;
  const ranged = obj.ranged === true;
  if (!physical && !magic && !melee && !ranged) {
    invalidField(
      context,
      'attackType',
      'requires at least one of physical, magic, melee, ranged',
    );
  }
  const excludeRoles = parseExcludeRoles(
    obj.excludeRoles,
    `${context}.excludeRoles`,
  );
  return {
    ...(physical ? { physical: true } : {}),
    ...(magic ? { magic: true } : {}),
    ...(melee ? { melee: true } : {}),
    ...(ranged ? { ranged: true } : {}),
    ...(excludeRoles ? { excludeRoles } : {}),
  };
}

function parseDamageIncreaseCondition(
  raw: unknown,
  context: string,
): DamageIncreaseCondition {
  const obj = requireRecord(raw, context);
  const kind = requireEnum(
    obj,
    'kind',
    context,
    DAMAGE_INCREASE_CONDITION_KINDS_SET,
  ) as DamageIncreaseCondition['kind'];

  if (kind === 'debuff') {
    const tags = parseDebuffFilterTags(obj.tags, `${context}.tags`, true)!;
    return {
      kind,
      tags,
      ...(obj.selfAppliedOnly !== undefined
        ? { selfAppliedOnly: requireBoolean(obj, 'selfAppliedOnly', context) }
        : {}),
    };
  }

  if (kind === 'targetHp') {
    const maxHpRatio = requireNumber(obj, 'maxHpRatio', context);
    if (maxHpRatio < 0 || maxHpRatio > 1) {
      invalidField(context, 'maxHpRatio', 'must be between 0 and 1');
    }
    return { kind, maxHpRatio };
  }

  if (kind === 'attackType') {
    return {
      kind: 'attackType',
      ...parseAttackTypeFields(obj, context),
    };
  }

  if (kind === 'hasDot') {
    return { kind: 'hasDot' };
  }

  invalidField(context, 'kind', `unsupported condition kind: ${kind}`);
}

function parseFireCondition(raw: unknown, context: string): FireCondition {
  const obj = requireRecord(raw, context);
  const kind = requireString(obj, 'kind', context);

  if (kind === 'debuff') {
    const tags = parseDebuffFilterTags(obj.tags, `${context}.tags`, true)!;
    return {
      kind,
      tags,
      ...(obj.selfAppliedOnly !== undefined
        ? { selfAppliedOnly: requireBoolean(obj, 'selfAppliedOnly', context) }
        : {}),
    };
  }
  if (kind === 'targetHp' || kind === 'selfHp') {
    const maxHpRatio = requireNumber(obj, 'maxHpRatio', context);
    if (maxHpRatio < 0 || maxHpRatio > 1) {
      invalidField(context, 'maxHpRatio', 'must be between 0 and 1');
    }
    const compareRaw = obj.compare;
    let compare: 'lte' | 'gte' | undefined;
    if (compareRaw !== undefined) {
      if (compareRaw !== 'lte' && compareRaw !== 'gte') {
        invalidField(context, 'compare', 'must be lte or gte');
      }
      compare = compareRaw;
    }
    return {
      kind,
      maxHpRatio,
      ...(compare === 'gte' ? { compare } : {}),
    };
  }
  if (kind === 'allyDamaged') return { kind: 'allyDamaged' };
  if (kind === 'waveStart') return { kind: 'waveStart' };
  if (kind === 'finalWaveStart') return { kind: 'finalWaveStart' };
  if (kind === 'waveEnd') return { kind: 'waveEnd' };
  if (kind === 'enemyCount') {
    const min = parseOptionalNumber(obj, 'min', context);
    const max = parseOptionalNumber(obj, 'max', context);
    if (min !== undefined && (!Number.isInteger(min) || min < 0)) {
      invalidField(context, 'min', 'must be a non-negative integer');
    }
    if (max !== undefined && (!Number.isInteger(max) || max < 0)) {
      invalidField(context, 'max', 'must be a non-negative integer');
    }
    const scopeRaw = obj.scope;
    let scope: 'living' | 'inRange' | undefined;
    if (scopeRaw !== undefined) {
      if (scopeRaw !== 'living' && scopeRaw !== 'inRange') {
        invalidField(context, 'scope', 'must be living or inRange');
      }
      scope = scopeRaw;
    }
    return {
      kind: 'enemyCount',
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(scope !== undefined ? { scope } : {}),
    };
  }
  if (kind === 'pendingIncomingDamage') {
    const maxHpRatio = requireNumber(obj, 'maxHpRatio', context);
    if (maxHpRatio < 0 || maxHpRatio > 1) {
      invalidField(context, 'maxHpRatio', 'must be between 0 and 1');
    }
    const windowSec = requireNumber(obj, 'windowSec', context);
    if (windowSec <= 0) {
      invalidField(context, 'windowSec', 'must be a positive number');
    }
    return { kind, maxHpRatio, windowSec };
  }
  if (kind === 'targetBarrierBelowGrant') {
    return { kind: 'targetBarrierBelowGrant' };
  }
  if (kind === 'blockResonanceStacks') {
    const min = requireNumber(obj, 'min', context);
    if (!Number.isInteger(min) || min < 1) {
      invalidField(context, 'min', 'must be a positive integer');
    }
    return { kind: 'blockResonanceStacks', min };
  }
  if (kind === 'hasDot') {
    return { kind: 'hasDot' };
  }
  invalidField(context, 'kind', `unsupported fire condition kind: ${kind}`);
}

function parseFireConditions(
  raw: unknown,
  context: string,
): FireCondition[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    invalidField(context, 'fireConditions', 'must be a non-empty array');
  }
  return raw.map((entry, index) =>
    parseFireCondition(entry, `${context}[${index}]`),
  );
}

function parseRequiredConditions(
  raw: unknown,
  context: string,
  fieldName: string,
): FireCondition[] {
  if (raw === undefined) {
    missingField(context, fieldName);
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    invalidField(context, fieldName, 'must be a non-empty array');
  }
  return raw.map((entry, index) =>
    parseFireCondition(entry, `${context}.${fieldName}[${index}]`),
  );
}

function parseBranchEffectEntry(
  entry: unknown,
  context: string,
): SkillEffectDef {
  const effect = parseSkillEffect(entry, context);
  if (effect.type === 'conditionalEffect') {
    invalidField(context, 'type', 'nested conditionalEffect is not allowed');
  }
  return effect;
}

function parseBranchEffects(
  raw: unknown,
  context: string,
  fieldName: string,
): SkillEffectDef[] {
  if (raw === undefined) {
    missingField(context, fieldName);
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    invalidField(context, fieldName, 'must be a non-empty array');
  }
  return raw.map((entry, index) =>
    parseBranchEffectEntry(entry, `${context}.${fieldName}[${index}]`),
  );
}

function parseDamageIncreaseSpec(
  raw: unknown,
  context: string,
): DamageIncreaseSpec {
  const obj = requireRecord(raw, context);
  const scale = requireNumber(obj, 'scale', context);
  if (scale <= 0) {
    invalidField(context, 'scale', 'must be a positive number');
  }
  const conditionsRaw = obj.conditions;
  if (!Array.isArray(conditionsRaw) || conditionsRaw.length === 0) {
    invalidField(context, 'conditions', 'must be a non-empty array');
  }
  const conditions = conditionsRaw.map((entry, index) =>
    parseDamageIncreaseCondition(entry, `${context}.conditions[${index}]`),
  );
  return { scale, conditions };
}

function parseSpecialEffectSpec(
  raw: unknown,
  context: string,
): DamageIncreaseSpec {
  const obj = requireRecord(raw, context);
  const scale = requireNumber(obj, 'scale', context);
  if (scale <= 0) {
    invalidField(context, 'scale', 'must be a positive number');
  }
  const conditionsRaw = obj.conditions;
  if (!Array.isArray(conditionsRaw)) {
    invalidField(context, 'conditions', 'must be an array');
  }
  const conditions = conditionsRaw.map((entry, index) =>
    parseDamageIncreaseCondition(entry, `${context}.conditions[${index}]`),
  );
  return { scale, conditions };
}

function parseDefenseIgnoreSpec(
  raw: unknown,
  context: string,
): DefenseIgnoreSpec {
  const obj = requireRecord(raw, context);
  const result: DefenseIgnoreSpec = {};
  if (obj.chance !== undefined) {
    const chance = requireNumber(obj, 'chance', context);
    if (chance < 0 || chance > 1) {
      invalidField(context, 'chance', 'must be between 0 and 1');
    }
    result.chance = chance;
  }
  if (obj.def !== undefined) {
    const defObj = requireRecord(obj.def, `${context}.def`);
    const mode = requireEnum(
      defObj,
      'mode',
      `${context}.def`,
      DEFENSE_IGNORE_DEF_MODES_SET,
    ) as 'flat' | 'percent';
    const amount = requireNumber(defObj, 'amount', `${context}.def`);
    if (mode === 'percent' && (amount < 0 || amount > 1)) {
      invalidField(`${context}.def`, 'amount', 'percent must be between 0 and 1');
    }
    if (mode === 'flat' && amount < 0) {
      invalidField(`${context}.def`, 'amount', 'flat must be non-negative');
    }
    result.def = { mode, amount };
  }
  if (obj.res !== undefined) {
    const resObj = requireRecord(obj.res, `${context}.res`);
    const percent = requireNumber(resObj, 'percent', `${context}.res`);
    if (percent < 0 || percent > 1) {
      invalidField(`${context}.res`, 'percent', 'must be between 0 and 1');
    }
    result.res = { percent };
  }
  if (!result.def && !result.res) {
    invalidField(context, 'defenseIgnore', 'must specify def and/or res');
  }
  return result;
}

function parseTargetTagList<T extends string>(
  raw: unknown,
  context: string,
  allowed: readonly T[],
  isTag: (value: string) => value is T,
): T[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    invalidField(context, 'tags', 'must be a non-empty array');
  }
  const tags: T[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (typeof entry !== 'string' || !isTag(entry)) {
      invalidField(
        context,
        `[${i}]`,
        `must be one of ${[...allowed].join(', ')}`,
      );
    }
    tags.push(entry);
  }
  return tags;
}

/** JSON `"player"` をランタイム `ally` 側へ正規化（battle-field.md §1） */
function normalizeTargetSide(
  side: string,
  _context: string,
): 'ally' | 'enemy' {
  if (side === 'player' || side === 'ally') return 'ally';
  return 'enemy';
}

function parseTargetSpec(raw: unknown, context: string): TargetSpec {
  if (typeof raw === 'string') {
    if (!TARGET_RULES_SET.has(raw as TargetRule)) {
      invalidField(
        context,
        'value',
        `must be one of ${[...TARGET_RULES_SET].join(', ')}`,
      );
    }
    return normalizeTarget(raw);
  }
  const obj = requireRecord(raw, context);
  const kind = obj.kind;
  if (kind === 'self') return { kind: 'self' };
  if (kind === 'clusterCenter') {
    const side = normalizeTargetSide(
      requireEnum(obj, 'side', context, new Set(['ally', 'enemy', 'player'])),
      context,
    );
    return { kind: 'clusterCenter', side };
  }
  if (kind === 'all') {
    const side = normalizeTargetSide(
      requireEnum(obj, 'side', context, new Set(['ally', 'enemy', 'player'])),
      context,
    );
    return { kind: 'all', side };
  }
  if (kind === 'distance') {
    const side = normalizeTargetSide(
      requireEnum(obj, 'side', context, new Set(['ally', 'enemy', 'player'])),
      context,
    );
    const order = requireEnum(
      obj,
      'order',
      context,
      new Set(['nearest', 'farthest', 'selfOrigin']),
    );
    const includeSelf = obj.includeSelf === true ? true : undefined;
    return {
      kind: 'distance',
      side,
      order: order as 'nearest' | 'farthest' | 'selfOrigin',
      ...(includeSelf !== undefined ? { includeSelf } : {}),
    };
  }
  if (kind === 'stat') {
    const side = normalizeTargetSide(
      requireEnum(obj, 'side', context, new Set(['ally', 'enemy', 'player'])),
      context,
    );
    const stat = requireEnum(
      obj,
      'stat',
      context,
      new Set(['hp', 'atk', 'def', 'res', 'maxHp']),
    );
    const order = requireEnum(
      obj,
      'order',
      context,
      new Set(['highest', 'lowest', 'ratio']),
    );
    if (order === 'ratio' && stat !== 'hp') {
      invalidField(context, 'order', 'ratio is only valid when stat is hp');
    }
    const poolFromEffectIndex = obj.poolFromEffectIndex;
    if (poolFromEffectIndex !== undefined) {
      if (
        typeof poolFromEffectIndex !== 'number' ||
        !Number.isInteger(poolFromEffectIndex) ||
        poolFromEffectIndex < 0
      ) {
        invalidField(
          context,
          'poolFromEffectIndex',
          'must be a non-negative integer',
        );
      }
    }
    return {
      kind: 'stat',
      side,
      stat: stat as 'hp' | 'maxHp' | 'atk' | 'def' | 'res',
      order: order as 'highest' | 'lowest' | 'ratio',
      ...(typeof poolFromEffectIndex === 'number' &&
      Number.isInteger(poolFromEffectIndex) &&
      poolFromEffectIndex >= 0
        ? { poolFromEffectIndex }
        : {}),
    };
  }
  if (kind === 'attackType') {
    return {
      kind: 'attackType',
      ...parseAttackTypeFields(obj, context),
    };
  }
  if (kind === 'status') {
    const sideRaw = obj.side;
    if (
      sideRaw !== undefined &&
      sideRaw !== 'ally' &&
      sideRaw !== 'enemy' &&
      sideRaw !== 'player'
    ) {
      invalidField(context, 'side', 'must be ally, player, or enemy');
    }
    const debuffTags =
      obj.debuffTags === undefined
        ? undefined
        : parseTargetTagList(
            obj.debuffTags,
            `${context}.debuffTags`,
            DEBUFF_FILTER_TAG_OPTIONS,
            isDebuffFilterTag,
          );
    const buffTags =
      obj.buffTags === undefined
        ? undefined
        : parseTargetTagList(
            obj.buffTags,
            `${context}.buffTags`,
            BUFF_FILTER_TAG_OPTIONS,
            isBuffFilterTag,
          );
    if (
      (!debuffTags || debuffTags.length === 0) &&
      (!buffTags || buffTags.length === 0)
    ) {
      invalidField(
        context,
        'status',
        'requires debuffTags and/or buffTags',
      );
    }
    return {
      kind: 'status',
      ...(sideRaw !== undefined
        ? { side: normalizeTargetSide(String(sideRaw), context) }
        : {}),
      ...(debuffTags && debuffTags.length > 0 ? { debuffTags } : {}),
      ...(buffTags && buffTags.length > 0 ? { buffTags } : {}),
    };
  }
  invalidField(context, 'kind', `must be a valid target kind`);
}

function parseOptionalEffectTarget(
  obj: Record<string, unknown>,
  context: string,
): TargetSpec | undefined {
  if (obj.target === undefined) {
    if (obj.targetDebuffFilter !== undefined) {
      invalidField(
        context,
        'targetDebuffFilter',
        'use target.kind status instead',
      );
    }
    if (obj.targetRule !== undefined) {
      invalidField(context, 'targetRule', 'use target instead');
    }
    return undefined;
  }
  return parseTargetSpec(obj.target, `${context}.target`);
}

function parseEffectTarget(
  obj: Record<string, unknown>,
  context: string,
): TargetSpec {
  if (obj.target !== undefined) {
    if (obj.targetDebuffFilter !== undefined) {
      invalidField(
        context,
        'targetDebuffFilter',
        'use target.kind status instead',
      );
    }
    if (obj.targetRule !== undefined) {
      invalidField(context, 'targetRule', 'use target instead');
    }
    return parseTargetSpec(obj.target, `${context}.target`);
  }
  missingField(context, 'target');
}

function parseOptionalPassiveTarget(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): TargetSpec | undefined {
  const raw = obj[key];
  if (raw === undefined) return undefined;
  return parseTargetSpec(raw, `${context}.${key}`);
}

function parseOptionalEffectCombatModifiers(
  obj: Record<string, unknown>,
  context: string,
): Pick<
  SkillEffectDef,
  'damageIncrease' | 'defenseIgnore' | 'effectConditions'
> {
  const result: Pick<
    SkillEffectDef,
    'damageIncrease' | 'defenseIgnore' | 'effectConditions'
  > = {};
  if (obj.targetDebuffFilter !== undefined) {
    invalidField(
      context,
      'targetDebuffFilter',
      'use target.kind status instead',
    );
  }
  if (obj.damageIncrease !== undefined) {
    result.damageIncrease = parseDamageIncreaseSpec(
      obj.damageIncrease,
      `${context}.damageIncrease`,
    );
  }
  if (obj.defenseIgnore !== undefined) {
    result.defenseIgnore = parseDefenseIgnoreSpec(
      obj.defenseIgnore,
      `${context}.defenseIgnore`,
    );
  }
  if (obj.effectConditions !== undefined) {
    result.effectConditions = parseRequiredConditions(
      obj.effectConditions,
      context,
      'effectConditions',
    );
  }
  return result;
}

function parseOptionalAttackMethod(
  obj: Record<string, unknown>,
  context: string,
): AttackMethod | undefined {
  const raw = obj.attackMethod;
  if (raw === undefined) return undefined;
  if (raw !== 'melee' && raw !== 'ranged') {
    invalidField(context, 'attackMethod', 'must be melee or ranged');
  }
  return raw;
}

function validateAttackMethodForBasicSkill(
  skillId: string,
  attackMethod: AttackMethod | undefined,
  effect: ActiveSkillDef['effect'] | CombatModuleActionDef['effect'],
  context: string,
): void {
  const primaryType = effect[0]?.type;
  const requiresAttackMethod =
    skillId.endsWith('_basic_attack') && primaryType === 'damage';
  if (requiresAttackMethod) {
    if (attackMethod === undefined) {
      invalidField(
        context,
        'attackMethod',
        'required on damage basic attack skills',
      );
    }
    return;
  }
  if (attackMethod !== undefined) {
    invalidField(
      context,
      'attackMethod',
      'only allowed on damage basic attack skills or combat module actions',
    );
  }
}

function validateAttackMethodForCombatModuleAction(
  attackMethod: AttackMethod | undefined,
  effect: CombatModuleActionDef['effect'],
  context: string,
): void {
  const primaryType = effect[0]?.type;
  if (primaryType === 'damage') {
    if (attackMethod === undefined) {
      invalidField(
        context,
        'attackMethod',
        'required when primary effect type is damage',
      );
    }
    return;
  }
  if (attackMethod !== undefined) {
    invalidField(
      context,
      'attackMethod',
      'must be omitted when primary effect is not damage',
    );
  }
}

function parseCombatModuleAction(
  raw: unknown,
  context: string,
): CombatModuleActionDef {
  const obj = requireRecord(raw, context);
  const sharedTargeting = parseSkillSharedTargetingFields(obj, context);
  const effectsRaw = obj.effect;
  if (!Array.isArray(effectsRaw) || effectsRaw.length === 0) {
    invalidField(context, 'effect', 'must be a non-empty array');
  }
  const effect = (effectsRaw as unknown[]).map((entry, effectIndex) =>
    parseSkillEffect(entry, `${context}.effect[${effectIndex}]`),
  );
  effect.forEach((entry, effectIndex) => {
    validateEffectTargetPoolReference(
      entry,
      effectIndex,
      `${context}.effect[${effectIndex}]`,
    );
  });
  validateActiveSkillEffectTargeting(
    {
      id: '__combat_module_action__',
      name: '__combat_module_action__',
      effect,
      ...sharedTargeting,
    },
    context,
  );
  const attackMethod = parseOptionalAttackMethod(obj, context);
  validateAttackMethodForCombatModuleAction(attackMethod, effect, context);
  return {
    effect,
    ...sharedTargeting,
    ...(attackMethod !== undefined ? { attackMethod } : {}),
  };
}

function requirePositiveNumber(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): number {
  const value = requireNumber(obj, key, context);
  if (value <= 0) {
    invalidField(context, key, 'must be a positive number');
  }
  return value;
}

function parseCombatModules(raw: unknown): CombatModuleDef[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error('combat-modules must be an array');
  }
  return raw.map((entry, index) => {
    const context = `combatModules[${index}]`;
    const obj = requireRecord(entry, context);
    const id = requireString(obj, 'id', context);
    const classId = requireString(obj, 'classId', context);
    const displayName = requireString(obj, 'displayName', context);
    const description = requireString(obj, 'description', context);
    const attackIntervalSec = requirePositiveNumber(
      obj,
      'attackIntervalSec',
      context,
    );
    if (obj.action === undefined) {
      missingField(context, 'action');
    }
    const action = parseCombatModuleAction(obj.action, `${context}.action`);
    return {
      id,
      classId,
      displayName,
      description,
      attackIntervalSec,
      action,
    };
  });
}

function parseCombatModuleIds(
  obj: Record<string, unknown>,
  context: string,
): [string, string] | undefined {
  if (obj.combatModuleIds === undefined) {
    return undefined;
  }
  const raw = obj.combatModuleIds;
  if (!Array.isArray(raw)) {
    invalidField(context, 'combatModuleIds', 'must be an array');
  }
  if (raw.length !== 2) {
    invalidField(context, 'combatModuleIds', 'must contain exactly 2 module ids');
  }
  const ids = raw.map((entry, index) => {
    const entryContext = `${context}.combatModuleIds[${index}]`;
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      missingField(entryContext, 'module id');
    }
    return entry.trim();
  }) as [string, string];
  if (ids[0] === ids[1]) {
    invalidField(context, 'combatModuleIds', 'must not contain duplicate module ids');
  }
  return ids;
}

function parseSkillSharedTargetingFields(
  obj: Record<string, unknown>,
  context: string,
): Partial<ActiveSkillDef> {
  const result: Partial<ActiveSkillDef> = {};
  const target = parseOptionalEffectTarget(obj, context);
  if (target !== undefined) {
    result.target = target;
  }
  const range = parseOptionalRange(obj, context);
  if (range !== undefined) {
    result.range = range;
  }
  Object.assign(result, parseTargetShapeFields(obj, context));
  return result;
}

function effectTypeRequiresTarget(type: string): boolean {
  return (
    type !== 'conditionalEffect' &&
    type !== 'counter' &&
    type !== 'basicAttackTransform' &&
    type !== 'blockResonanceConsume' &&
    type !== 'herbalPotencyConsume' &&
    type !== 'grantNextOutgoingDamage' &&
    type !== 'dotCompress' &&
    type !== 'dotExtend' &&
    type !== 'placedField'
  );
}

function validateActiveSkillEffectTargeting(
  skill: ActiveSkillDef,
  context: string,
): void {
  const skillHasSharedTargeting =
    skill.target !== undefined ||
    skill.targetShape !== undefined ||
    skill.range !== undefined ||
    skill.aoeRadiusPx !== undefined;
  skill.effect.forEach((effect, effectIndex) => {
    const effectContext = `${context}.effect[${effectIndex}]`;
    if (!effectTypeRequiresTarget(effect.type)) return;
    if (effect.target !== undefined) return;
    if (skillHasSharedTargeting) return;
    missingField(effectContext, 'target');
  });
}

function parseOptionalEffectPresentation(
  obj: Record<string, unknown>,
  context: string,
): Pick<
  SkillEffectDef,
  | 'anim'
  | 'animStartFrame'
  | 'animIntroEndFrame'
  | 'animLoopFrame'
  | 'animLoopEndFrame'
  | 'animOutroStartFrame'
  | 'applyFrame'
  | 'vfx'
  | 'hitVfx'
> {
  const result: Pick<
    SkillEffectDef,
    | 'anim'
    | 'animStartFrame'
    | 'animIntroEndFrame'
    | 'animLoopFrame'
    | 'animLoopEndFrame'
    | 'animOutroStartFrame'
    | 'applyFrame'
    | 'vfx'
    | 'hitVfx'
  > = {};
  if (obj.anim !== undefined) {
    result.anim = requireEnum(obj, 'anim', context, SKILL_EFFECT_ANIM_IDS_SET);
  }
  Object.assign(result, parseOptionalAnimPhaseFields(obj, context));

  const applyFrameRaw = parseOptionalNumber(obj, 'applyFrame', context);
  if (applyFrameRaw !== undefined) {
    if (!Number.isInteger(applyFrameRaw) || applyFrameRaw < 0) {
      invalidField(context, 'applyFrame', 'must be a non-negative integer');
    }
    result.applyFrame = applyFrameRaw;
  }

  const startFrame = result.animStartFrame ?? 0;
  const introEnd = result.animIntroEndFrame ?? result.animLoopFrame;
  const loopFrame = result.animLoopFrame;
  const loopEnd = result.animLoopEndFrame ?? loopFrame;
  const outroStart =
    result.animOutroStartFrame ??
    (loopFrame !== undefined ? (loopEnd ?? loopFrame) + 1 : undefined);

  if (result.animIntroEndFrame !== undefined && loopFrame === undefined) {
    invalidField(
      context,
      'animIntroEndFrame',
      'requires animLoopFrame',
    );
  }
  if (result.animLoopEndFrame !== undefined && loopFrame === undefined) {
    invalidField(
      context,
      'animLoopEndFrame',
      'requires animLoopFrame',
    );
  }
  if (result.animOutroStartFrame !== undefined && loopFrame === undefined) {
    invalidField(
      context,
      'animOutroStartFrame',
      'requires animLoopFrame',
    );
  }
  if (loopFrame !== undefined) {
    if (introEnd !== undefined && introEnd < startFrame) {
      invalidField(
        context,
        'animIntroEndFrame',
        'must be >= animStartFrame',
      );
    }
    if (loopFrame < (introEnd ?? loopFrame)) {
      invalidField(
        context,
        'animLoopFrame',
        'must be >= animIntroEndFrame',
      );
    }
    if (loopEnd !== undefined && loopEnd < loopFrame) {
      invalidField(
        context,
        'animLoopEndFrame',
        'must be >= animLoopFrame',
      );
    }
    if (outroStart !== undefined && outroStart <= (loopEnd ?? introEnd ?? loopFrame)) {
      invalidField(
        context,
        'animOutroStartFrame',
        'must be > animIntroEndFrame',
      );
    }
  }

  if (result.applyFrame !== undefined && result.applyFrame < startFrame) {
    invalidField(
      context,
      'applyFrame',
      'must be >= animStartFrame',
    );
  }

  const vfx = parseSkillVfx(obj.vfx, `${context}.vfx`);
  if (vfx !== undefined) {
    result.vfx = vfx;
  }
  const hitVfx = parseSkillVfx(obj.hitVfx, `${context}.hitVfx`);
  if (hitVfx !== undefined) {
    result.hitVfx = hitVfx;
  }
  return result;
}

function parseCounterResponseEntry(
  entry: unknown,
  context: string,
): CounterResponseDef {
  const obj = requireRecord(entry, context);
  const kind = requireEnum(obj, 'kind', context, COUNTER_RESPONSE_KINDS_SET);

  if (kind === 'damage') {
    const amount = parseEffectAmount(obj, context, 'counter damage response');
    const damageType =
      obj.damageType === undefined
        ? undefined
        : requireEnum(obj, 'damageType', context, DAMAGE_TYPES_SET);
    return {
      kind,
      amount,
      ...(damageType !== undefined ? { damageType } : {}),
    };
  }

  if (kind === 'debuff') {
    const debuffStat = requireStatBuffTarget(obj, 'debuffStat', context);
    const debuffDurationSec = requireNumber(obj, 'debuffDurationSec', context);
    requireBuffOrDebuffModifier(
      obj,
      context,
      'debuffMultiplier',
      'debuffFlatBonus',
    );
    return {
      kind,
      debuffStat,
      debuffDurationSec,
      ...(typeof obj.debuffMultiplier === 'number'
        ? { debuffMultiplier: obj.debuffMultiplier }
        : {}),
      ...(typeof obj.debuffFlatBonus === 'number'
        ? { debuffFlatBonus: obj.debuffFlatBonus }
        : {}),
    };
  }

  if (kind === 'dot') {
    const durationSec = requireNumber(obj, 'durationSec', context);
    const amount = parseEffectAmount(obj, context, 'counter dot');
    if (amount.kind !== 'atkBased' || amount.atkScale === undefined) {
      invalidField(context, 'amount', 'dot counter response requires atkBased amount');
    }
    const damageType =
      obj.damageType === undefined
        ? undefined
        : requireEnum(obj, 'damageType', context, DAMAGE_TYPES_SET);
    const combatModifiers = parseOptionalEffectCombatModifiers(obj, context);
    const dotFlavor = parseOptionalDotFlavor(obj, context);
    return {
      kind,
      durationSec,
      powerMultiplier: amount.atkScale!,
      ...(damageType !== undefined ? { damageType } : {}),
      ...(dotFlavor !== undefined ? { dotFlavor } : {}),
      ...combatModifiers,
    };
  }

  if (kind === 'stun') {
    const durationSec = requireStunDurationSec(obj, context);
    return { kind, durationSec };
  }

  const distancePx = requireNumber(obj, 'distancePx', context);
  if (distancePx <= 0) {
    invalidField(context, 'distancePx', 'must be a positive number');
  }
  return { kind: 'knockback', distancePx };
}

function parseCounterResponses(
  raw: unknown,
  context: string,
): CounterResponseDef[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    invalidField(context, 'responses', 'must be a non-empty array');
  }
  return raw.map((entry, index) =>
    parseCounterResponseEntry(entry, `${context}[${index}]`),
  );
}

function parseCounterEffectResponses(
  obj: Record<string, unknown>,
  context: string,
): CounterResponseDef[] {
  if (obj.responses !== undefined) {
    return parseCounterResponses(obj.responses, `${context}.responses`);
  }
  invalidField(context, 'responses', 'is required');
}

function normalizeSkillEffect(effect: SkillEffectDef | LegacyHotSkillEffect): SkillEffectDef {
  if (effect.type === 'hot') {
    return {
      ...effect,
      type: 'heal',
      healSubKind: 'hot',
      amount: effect.amount,
      durationSec: effect.durationSec,
    };
  }
  if (effect.type === 'dispel') {
    return {
      ...effect,
      type: 'heal',
      healSubKind: 'dispel',
      dispelCount: effect.dispelCount,
      ...(effect.dispelTags ? { dispelTags: effect.dispelTags } : {}),
      ...(effect.dispelPriority
        ? { dispelPriority: effect.dispelPriority }
        : {}),
    };
  }
  if (effect.type === 'barrier') {
    return {
      ...effect,
      type: 'buff',
      buffSubKind: 'barrier',
      amount: effect.amount,
      ...(effect.barrierStack !== undefined
        ? { barrierStack: effect.barrierStack }
        : {}),
    };
  }
  if (effect.type === 'block') {
    return {
      ...effect,
      type: 'buff',
      buffSubKind: 'block',
      chance: effect.blockChance,
      buffDurationSec: effect.durationSec,
    };
  }
  if (effect.type === 'dot') {
    const amount =
      effect.amount ??
      (effect.powerMultiplier !== undefined
        ? { kind: 'atkBased' as const, atkScale: effect.powerMultiplier }
        : undefined);
    return {
      ...effect,
      type: 'debuff',
      debuffSubKind: 'dot',
      durationSec: effect.durationSec,
      ...(amount !== undefined ? { amount } : {}),
      ...(effect.damageType !== undefined ? { damageType: effect.damageType } : {}),
    };
  }
  if (effect.type === 'stun') {
    return {
      ...effect,
      type: 'debuff',
      debuffSubKind: 'stun',
      durationSec: effect.durationSec,
    };
  }
  if (effect.type === 'heal' && effect.healSubKind === undefined) {
    return { ...effect, healSubKind: 'instant' };
  }
  if (
    effect.type === 'buff' &&
    effect.buffSubKind === 'basicAttackTransform'
  ) {
    const { buffSubKind: _sub, type: _type, ...rest } = effect;
    return normalizeSkillEffect({
      ...rest,
      type: 'basicAttackTransform',
      target: { kind: 'self' },
    });
  }
  if (effect.type === 'basicAttackTransform') {
    return { ...effect, target: { kind: 'self' } };
  }
  if (effect.type === 'buff' && effect.buffSubKind === undefined) {
    return { ...effect, buffSubKind: 'stat' };
  }
  if (effect.type === 'debuff' && effect.debuffSubKind === undefined) {
    return { ...effect, debuffSubKind: 'stat' };
  }
  if (effect.type === 'conditionalEffect') {
    return {
      ...effect,
      thenEffects: effect.thenEffects.map((branch) =>
        normalizeSkillEffect(branch),
      ),
      elseEffects: effect.elseEffects.map((branch) =>
        normalizeSkillEffect(branch),
      ),
    };
  }
  return normalizeEffectTargetForShape(effect);
}

function normalizeEffectTargetForShape(effect: SkillEffectDef): SkillEffectDef {
  if (
    effect.type === 'counter' ||
    effect.type === 'basicAttackTransform' ||
    effect.type === 'move' ||
    effect.type === 'conditionalEffect'
  ) {
    return effect;
  }
  const shape = effect.targetShape ?? 'single';
  if (shape !== 'pierce') return effect;

  const current = effect.target ?? { kind: 'distance' as const, side: 'enemy' as const, order: 'nearest' as const };
  const side =
    current.kind === 'distance'
      ? current.side
      : current.kind === 'all' || current.kind === 'stat'
        ? current.side
        : 'enemy';
  const includeSelf =
    current.kind === 'distance' && current.includeSelf === true
      ? true
      : undefined;
  return {
    ...effect,
    target: {
      kind: 'distance',
      side,
      order: 'selfOrigin',
      ...(includeSelf !== undefined ? { includeSelf } : {}),
    },
  };
}

function parsePartialResourceAmount(
  raw: unknown,
  context: string,
): Partial<ResourceAmountSpec> {
  const obj = requireRecord(raw, context);
  const patch: Partial<ResourceAmountSpec> = {};
  if (obj.kind !== undefined) {
    patch.kind = requireEnum(obj, 'kind', context, RESOURCE_AMOUNT_KINDS_SET);
  }
  const atkOffset = parseOptionalNumber(obj, 'atkOffset', context);
  const atkScale = parseOptionalNumber(obj, 'atkScale', context);
  const defOffset = parseOptionalNumber(obj, 'defOffset', context);
  const defScale = parseOptionalNumber(obj, 'defScale', context);
  const flatAmount = parseOptionalNumber(obj, 'flatAmount', context);
  const percentOfMaxHp = parseOptionalNumber(obj, 'percentOfMaxHp', context);
  if (atkOffset !== undefined) patch.atkOffset = atkOffset;
  if (atkScale !== undefined) patch.atkScale = atkScale;
  if (defOffset !== undefined) patch.defOffset = defOffset;
  if (defScale !== undefined) patch.defScale = defScale;
  if (flatAmount !== undefined) patch.flatAmount = flatAmount;
  if (percentOfMaxHp !== undefined) {
    if (percentOfMaxHp < 0 || percentOfMaxHp > 1) {
      invalidField(context, 'percentOfMaxHp', 'must be between 0 and 1');
    }
    patch.percentOfMaxHp = percentOfMaxHp;
  }
  if (obj.maxHpRef !== undefined) {
    patch.maxHpRef = requireEnum(
      obj,
      'maxHpRef',
      context,
      new Set(['self', 'target'] as const),
    );
  }
  if (Object.keys(patch).length === 0) {
    invalidField(context, 'amount patch', 'must specify at least one field');
  }
  return patch;
}

function parseBasicAttackPrimaryPatch(
  raw: unknown,
  context: string,
): BasicAttackTransformPrimaryPatch {
  const obj = requireRecord(raw, context);
  const patch: BasicAttackTransformPrimaryPatch = {};
  if (obj.damageType !== undefined) {
    patch.damageType = requireEnum(obj, 'damageType', context, DAMAGE_TYPES_SET);
  }
  if (obj.amount !== undefined) {
    patch.amount = parsePartialResourceAmount(obj.amount, `${context}.amount`);
  }
  if (obj.target !== undefined) {
    patch.target = parseTargetSpec(obj.target, `${context}.target`);
  }
  if (obj.targetShape !== undefined) {
    patch.targetShape = requireEnum(obj, 'targetShape', context, TARGET_SHAPES_SET);
  }
  const aoeRadiusPx = parseOptionalNumber(obj, 'aoeRadiusPx', context);
  if (aoeRadiusPx !== undefined) patch.aoeRadiusPx = aoeRadiusPx;
  const hitCount = parseOptionalNumber(obj, 'hitCount', context);
  if (hitCount !== undefined) {
    if (!Number.isInteger(hitCount) || hitCount < 1) {
      invalidField(context, 'hitCount', 'must be an integer >= 1');
    }
    patch.hitCount = hitCount;
  }
  const hitDurationSec = parseOptionalNonNegativeNumber(
    obj,
    'hitDurationSec',
    context,
  );
  if (hitDurationSec !== undefined) patch.hitDurationSec = hitDurationSec;
  if (Object.keys(patch).length === 0) {
    invalidField(context, 'primaryPatch', 'must specify at least one field');
  }
  return patch;
}

function parseBasicAttackTransformFields(
  obj: Record<string, unknown>,
  context: string,
): BasicAttackTransformSpec {
  const spec: BasicAttackTransformSpec = {};
  const hitCountMultiplier = parseOptionalNumber(
    obj,
    'hitCountMultiplier',
    context,
  );
  if (hitCountMultiplier !== undefined) {
    if (hitCountMultiplier <= 0) {
      invalidField(context, 'hitCountMultiplier', 'must be a positive number');
    }
    spec.hitCountMultiplier = hitCountMultiplier;
  }
  if (obj.primaryEffectOverride !== undefined) {
    spec.primaryEffectOverride = parseSkillEffect(
      obj.primaryEffectOverride,
      `${context}.primaryEffectOverride`,
    );
    if (spec.primaryEffectOverride.type === 'move') {
      invalidField(
        context,
        'primaryEffectOverride',
        'move effects are not allowed',
      );
    }
  }
  if (obj.primaryPatch !== undefined) {
    spec.primaryPatch = parseBasicAttackPrimaryPatch(
      obj.primaryPatch,
      `${context}.primaryPatch`,
    );
  }
  if (obj.appendEffects !== undefined) {
    if (!Array.isArray(obj.appendEffects) || obj.appendEffects.length === 0) {
      invalidField(context, 'appendEffects', 'must be a non-empty array');
    }
    spec.appendEffects = obj.appendEffects.map((entry, index) =>
      parseSkillEffect(entry, `${context}.appendEffects[${index}]`),
    );
  }
  if (
    spec.hitCountMultiplier === undefined &&
    spec.primaryEffectOverride === undefined &&
    spec.primaryPatch === undefined &&
    (spec.appendEffects === undefined || spec.appendEffects.length === 0)
  ) {
    invalidField(
      context,
      'basicAttackTransform',
      'must specify hitCountMultiplier, primaryEffectOverride, primaryPatch, or appendEffects',
    );
  }
  return spec;
}

export function parseSkillEffect(entry: unknown, context: string): SkillEffectDef {
  const obj = requireRecord(entry, context);
  const typeRaw = requireString(obj, 'type', context);
  if (typeRaw === 'hot') {
    const durationSec = requireNumber(obj, 'durationSec', context);
    const amount = parseEffectAmount(obj, context, 'hot');
    const target = parseEffectTarget(obj, context);
    const range = parseOptionalRange(obj, context);
    const targetShapeFields = parseTargetShapeFields(obj, context);
    const presentation = parseOptionalEffectPresentation(obj, context);
    const combatModifiers = parseOptionalEffectCombatModifiers(obj, context);
    const sequenceTiming = parseOptionalWaitAfterSec(obj, context);
    return normalizeSkillEffect({
      ...(target !== undefined ? { target } : {}),
      ...targetShapeFields,
      ...combatModifiers,
      type: 'heal',
      healSubKind: 'hot',
      durationSec,
      amount,
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }
  if (typeRaw === 'conditionalEffect') {
    const conditions = parseRequiredConditions(obj.conditions, context, 'conditions');
    const thenEffects = parseBranchEffects(obj.thenEffects, context, 'thenEffects');
    const elseEffects = parseBranchEffects(obj.elseEffects, context, 'elseEffects');
    const presentation = parseOptionalEffectPresentation(obj, context);
    const sequenceTiming = parseOptionalWaitAfterSec(obj, context);
    return normalizeSkillEffect({
      type: 'conditionalEffect',
      conditions,
      thenEffects,
      elseEffects,
      ...sequenceTiming,
      ...presentation,
    });
  }
  if (typeRaw === 'herbalPotencyConsume') {
    const target = parseEffectTarget(obj, context);
    const presentation = parseOptionalEffectPresentation(obj, context);
    const sequenceTiming = parseOptionalWaitAfterSec(obj, context);
    return normalizeSkillEffect({
      type: 'herbalPotencyConsume',
      ...(target !== undefined ? { target } : {}),
      ...sequenceTiming,
      ...presentation,
    });
  }
  if (typeRaw === 'blockResonanceConsume') {
    const presentation = parseOptionalEffectPresentation(obj, context);
    const sequenceTiming = parseOptionalWaitAfterSec(obj, context);
    return normalizeSkillEffect({
      type: 'blockResonanceConsume',
      target: { kind: 'self' },
      ...sequenceTiming,
      ...presentation,
    });
  }
  if (typeRaw === 'enemyReelIn') {
    const target = parseEffectTarget(obj, context);
    const presentation = parseOptionalEffectPresentation(obj, context);
    const sequenceTiming = parseOptionalWaitAfterSec(obj, context);
    const targetShapeFields = parseTargetShapeFields(obj, context);
    const range = parseOptionalRange(obj, context);
    return normalizeSkillEffect({
      type: 'enemyReelIn',
      ...(target !== undefined ? { target } : {}),
      ...targetShapeFields,
      ...(range !== undefined ? { range } : {}),
      ...sequenceTiming,
      ...presentation,
    });
  }
  if (typeRaw === 'arenaDominance') {
    const target = parseEffectTarget(obj, context);
    const presentation = parseOptionalEffectPresentation(obj, context);
    const sequenceTiming = parseOptionalWaitAfterSec(obj, context);
    const durationSec = parseOptionalNonNegativeNumber(obj, 'durationSec', context);
    const nonMarkDamageMultiplier = parseOptionalNumber(
      obj,
      'nonMarkDamageMultiplier',
      context,
    );
    return normalizeSkillEffect({
      type: 'arenaDominance',
      target: target.kind === 'self' ? target : { kind: 'self' },
      ...(durationSec !== undefined ? { durationSec } : {}),
      ...(nonMarkDamageMultiplier !== undefined
        ? { nonMarkDamageMultiplier }
        : {}),
      ...sequenceTiming,
      ...presentation,
    });
  }
  if (typeRaw === 'grantNextOutgoingDamage') {
    const target = parseEffectTarget(obj, context);
    const presentation = parseOptionalEffectPresentation(obj, context);
    const sequenceTiming = parseOptionalWaitAfterSec(obj, context);
    const nextOutgoingDamageMultiplier = parseOptionalNumber(
      obj,
      'nextOutgoingDamageMultiplier',
      context,
    );
    return normalizeSkillEffect({
      type: 'grantNextOutgoingDamage',
      target: target.kind === 'self' ? target : { kind: 'self' },
      ...(nextOutgoingDamageMultiplier !== undefined
        ? { nextOutgoingDamageMultiplier }
        : {}),
      ...sequenceTiming,
      ...presentation,
    });
  }
  if (typeRaw === 'placedField') {
    const target = parseEffectTarget(obj, context);
    const presentation = parseOptionalEffectPresentation(obj, context);
    const sequenceTiming = parseOptionalWaitAfterSec(obj, context);
    const range = parseOptionalRange(obj, context);
    const fieldRadiusPx = requireNumber(obj, 'fieldRadiusPx', context);
    const fieldDurationSec = requireNumber(obj, 'fieldDurationSec', context);
    if (fieldRadiusPx <= 0 || fieldDurationSec <= 0) {
      invalidField(context, 'fieldRadiusPx/fieldDurationSec', 'must be positive');
    }
    const stayTickIntervalSec = parseOptionalNumber(
      obj,
      'stayTickIntervalSec',
      context,
    );
    const stayCompressRatioBonusPerTick = parseOptionalNumber(
      obj,
      'stayCompressRatioBonusPerTick',
      context,
    );
    const enterEffects = obj.enterEffects === undefined
      ? []
      : parseBranchEffects(obj.enterEffects, context, 'enterEffects');
    const stayEffects = obj.stayEffects === undefined
      ? []
      : parseBranchEffects(obj.stayEffects, context, 'stayEffects');
    return normalizeSkillEffect({
      type: 'placedField',
      ...(target !== undefined ? { target } : {}),
      fieldRadiusPx,
      fieldDurationSec,
      ...(stayTickIntervalSec !== undefined ? { stayTickIntervalSec } : {}),
      ...(stayCompressRatioBonusPerTick !== undefined
        ? { stayCompressRatioBonusPerTick }
        : {}),
      enterEffects,
      stayEffects,
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }
  if (typeRaw === 'dotCompress') {
    const target = parseEffectTarget(obj, context);
    const presentation = parseOptionalEffectPresentation(obj, context);
    const sequenceTiming = parseOptionalWaitAfterSec(obj, context);
    const range = parseOptionalRange(obj, context);
    const compressRatio = requireNumber(obj, 'compressRatio', context);
    if (compressRatio <= 0 || compressRatio > 1) {
      invalidField(context, 'compressRatio', 'must be between 0 and 1');
    }
    return normalizeSkillEffect({
      type: 'dotCompress',
      ...(target !== undefined ? { target } : {}),
      compressRatio,
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }
  if (typeRaw === 'dotExtend') {
    const target = parseEffectTarget(obj, context);
    const presentation = parseOptionalEffectPresentation(obj, context);
    const sequenceTiming = parseOptionalWaitAfterSec(obj, context);
    const range = parseOptionalRange(obj, context);
    const extendRatio = requireNumber(obj, 'extendRatio', context);
    if (extendRatio <= 1) {
      invalidField(context, 'extendRatio', 'must be greater than 1');
    }
    return normalizeSkillEffect({
      type: 'dotExtend',
      ...(target !== undefined ? { target } : {}),
      extendRatio,
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }
  if (typeRaw === 'dotHarvest') {
    const target = parseEffectTarget(obj, context);
    const presentation = parseOptionalEffectPresentation(obj, context);
    const sequenceTiming = parseOptionalWaitAfterSec(obj, context);
    const range = parseOptionalRange(obj, context);
    const harvestRatio = requireNumber(obj, 'harvestRatio', context);
    if (harvestRatio <= 0 || harvestRatio > 1) {
      invalidField(context, 'harvestRatio', 'must be between 0 and 1');
    }
    return normalizeSkillEffect({
      type: 'dotHarvest',
      ...(target !== undefined ? { target } : {}),
      harvestRatio,
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }
  if (typeRaw === 'poisonSpread') {
    const target = parseEffectTarget(obj, context);
    const presentation = parseOptionalEffectPresentation(obj, context);
    const sequenceTiming = parseOptionalWaitAfterSec(obj, context);
    const range = parseOptionalRange(obj, context);
    const spreadRadiusPx = requireNumber(obj, 'spreadRadiusPx', context);
    const spreadDurationRatio = requireNumber(obj, 'spreadDurationRatio', context);
    if (spreadRadiusPx <= 0) {
      invalidField(context, 'spreadRadiusPx', 'must be positive');
    }
    if (spreadDurationRatio <= 0 || spreadDurationRatio > 1) {
      invalidField(context, 'spreadDurationRatio', 'must be between 0 and 1');
    }
    const dotFlavor =
      obj.dotFlavor === undefined
        ? undefined
        : requireEnum(obj, 'dotFlavor', context, new Set(['poison', 'bleed']));
    return normalizeSkillEffect({
      type: 'poisonSpread',
      ...(target !== undefined ? { target } : {}),
      spreadRadiusPx,
      spreadDurationRatio,
      ...(dotFlavor !== undefined ? { dotFlavor } : {}),
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }
  const type = requireEnum(obj, 'type', context, SKILL_EFFECTS);
  const target =
    type === 'counter' || type === 'basicAttackTransform'
      ? ({ kind: 'self' } satisfies TargetSpec)
      : parseOptionalEffectTarget(obj, context);
  const range = parseOptionalRange(obj, context);
  const targetShapeFields = parseTargetShapeFields(obj, context);
  const presentation = parseOptionalEffectPresentation(obj, context);
  const combatModifiers = parseOptionalEffectCombatModifiers(obj, context);
  const sequenceTiming = parseOptionalWaitAfterSec(obj, context);

  if (type === 'damage') {
    rejectDeprecatedThreatDamageFields(obj, context);
    const damageType =
      obj.damageType === undefined
        ? undefined
        : requireEnum(obj, 'damageType', context, DAMAGE_TYPES_SET);
    const amount = parseEffectAmount(obj, context, 'damage');
    const pierceBarrier = obj.pierceBarrier === true ? true : undefined;
    const pierceWard = obj.pierceWard === true ? true : undefined;
    const pierceBlock = obj.pierceBlock === true ? true : undefined;
    const ignoreDamageTakenReduction =
      obj.ignoreDamageTakenReduction === true ? true : undefined;
    return normalizeSkillEffect({
      ...(target !== undefined ? { target } : {}),
      ...targetShapeFields,
      ...combatModifiers,
      type,
      ...(damageType !== undefined ? { damageType } : {}),
      amount,
      ...(pierceBarrier ? { pierceBarrier } : {}),
      ...(pierceWard ? { pierceWard } : {}),
      ...(pierceBlock ? { pierceBlock } : {}),
      ...(ignoreDamageTakenReduction ? { ignoreDamageTakenReduction } : {}),
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }

  if (type === 'heal') {
    const healSubKind =
      obj.healSubKind === undefined
        ? 'instant'
        : requireEnum(obj, 'healSubKind', context, HEAL_SUB_KINDS_SET);
    if (healSubKind === 'hot') {
      const durationSec = requireNumber(obj, 'durationSec', context);
      const amount = parseEffectAmount(obj, context, 'heal hot');
      const stackOnApply = parseOptionalNonNegativeNumber(
        obj,
        'stackOnApply',
        context,
      );
      if (stackOnApply !== undefined && !Number.isInteger(stackOnApply)) {
        invalidField(context, 'stackOnApply', 'must be a non-negative integer');
      }
      const potencyStackScale =
        obj.potencyStackScale === true ? true : undefined;
      const buffDisplayName =
        typeof obj.buffDisplayName === 'string' && obj.buffDisplayName.length > 0
          ? obj.buffDisplayName
          : undefined;
      return normalizeSkillEffect({
        ...(target !== undefined ? { target } : {}),
        ...targetShapeFields,
        ...combatModifiers,
        type,
        healSubKind,
        amount,
        durationSec,
        ...(stackOnApply !== undefined ? { stackOnApply } : {}),
        ...(potencyStackScale ? { potencyStackScale } : {}),
        ...(buffDisplayName ? { buffDisplayName } : {}),
        ...sequenceTiming,
        ...presentation,
        ...(range !== undefined ? { range } : {}),
      });
    }
    if (healSubKind === 'dispel') {
      const dispelCount = requireNumber(obj, 'dispelCount', context);
      if (dispelCount < 0) {
        invalidField(context, 'dispelCount', 'must be a non-negative number');
      }
      const dispelTags = parseDebuffFilterTags(
        obj.dispelTags,
        `${context}.dispelTags`,
        false,
      );
      const dispelPriority = parseDispelPriority(
        obj.dispelPriority,
        `${context}.dispelPriority`,
      );
      return normalizeSkillEffect({
        ...(target !== undefined ? { target } : {}),
        ...targetShapeFields,
        ...combatModifiers,
        type,
        healSubKind,
        dispelCount,
        ...(dispelTags !== undefined ? { dispelTags } : {}),
        ...(dispelPriority !== undefined ? { dispelPriority } : {}),
        ...sequenceTiming,
        ...presentation,
        ...(range !== undefined ? { range } : {}),
      });
    }
    return normalizeSkillEffect({
      ...(target !== undefined ? { target } : {}),
      ...targetShapeFields,
      ...combatModifiers,
      type,
      healSubKind,
      amount: parseEffectAmount(obj, context, 'heal'),
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }

  if (type === 'buff') {
    if (obj.buffSubKind === 'basicAttackTransform') {
      const buffDurationSec = requireNumber(obj, 'buffDurationSec', context);
      const transform = parseBasicAttackTransformFields(obj, context);
      return normalizeSkillEffect({
        target: { kind: 'self' },
        ...combatModifiers,
        type: 'basicAttackTransform',
        buffDurationSec,
        ...(transform.hitCountMultiplier !== undefined
          ? { hitCountMultiplier: transform.hitCountMultiplier }
          : {}),
        ...(transform.primaryEffectOverride !== undefined
          ? { primaryEffectOverride: transform.primaryEffectOverride }
          : {}),
        ...(transform.primaryPatch !== undefined
          ? { primaryPatch: transform.primaryPatch }
          : {}),
        ...(transform.appendEffects !== undefined
          ? { appendEffects: transform.appendEffects }
          : {}),
        ...sequenceTiming,
        ...presentation,
      });
    }
    const buffSubKind =
      obj.buffSubKind === undefined
        ? 'stat'
        : requireEnum(obj, 'buffSubKind', context, BUFF_SUB_KINDS_SET);
    if (buffSubKind === 'stat') {
      const buffStat = requireStatBuffTarget(obj, 'buffStat', context);
      const buffDurationSec = requireNumber(obj, 'buffDurationSec', context);
      requireBuffOrDebuffModifier(
        obj,
        context,
        'buffMultiplier',
        'buffFlatBonus',
      );
      return normalizeSkillEffect({
        ...(target !== undefined ? { target } : {}),
        ...targetShapeFields,
        ...combatModifiers,
        type,
        buffSubKind,
        buffStat,
        buffDurationSec,
        ...(typeof obj.buffMultiplier === 'number'
          ? { buffMultiplier: obj.buffMultiplier }
          : {}),
        ...(typeof obj.buffFlatBonus === 'number'
          ? { buffFlatBonus: obj.buffFlatBonus }
          : {}),
        ...sequenceTiming,
        ...presentation,
        ...(range !== undefined ? { range } : {}),
      });
    }
    if (buffSubKind === 'barrier') {
      const amount = parseEffectAmount(obj, context, 'barrier');
      const barrierStack = obj.barrierStack;
      if (barrierStack !== undefined && typeof barrierStack !== 'boolean') {
        invalidField(context, 'barrierStack', 'must be a boolean');
      }
      return normalizeSkillEffect({
        ...(target !== undefined ? { target } : {}),
        ...targetShapeFields,
        ...combatModifiers,
        type,
        buffSubKind,
        amount,
        ...(typeof barrierStack === 'boolean' ? { barrierStack } : {}),
        ...sequenceTiming,
        ...presentation,
        ...(range !== undefined ? { range } : {}),
      });
    }
    if (buffSubKind === 'wardBarrier') {
      const stacks = requireNumber(obj, 'stacks', context);
      if (!Number.isInteger(stacks) || stacks < 1) {
        invalidField(context, 'stacks', 'must be a positive integer');
      }
      const damageReductionRatio =
        obj.damageReductionRatio === undefined
          ? 0.1
          : requireNumber(obj, 'damageReductionRatio', context);
      if (damageReductionRatio < 0 || damageReductionRatio > 1) {
        invalidField(
          context,
          'damageReductionRatio',
          'must be between 0 and 1',
        );
      }
      return normalizeSkillEffect({
        ...(target !== undefined ? { target } : {}),
        ...targetShapeFields,
        ...combatModifiers,
        type,
        buffSubKind,
        stacks,
        damageReductionRatio,
        ...sequenceTiming,
        ...presentation,
        ...(range !== undefined ? { range } : {}),
      });
    }
    if (buffSubKind === 'damageDelay') {
      const ratio =
        obj.ratio === undefined
          ? 0.5
          : requireNumber(obj, 'ratio', context);
      if (ratio < 0 || ratio > 1) {
        invalidField(context, 'ratio', 'must be between 0 and 1');
      }
      const buffDurationSec =
        obj.buffDurationSec === undefined
          ? 5
          : requireNumber(obj, 'buffDurationSec', context);
      return normalizeSkillEffect({
        ...(target !== undefined ? { target } : {}),
        ...targetShapeFields,
        ...combatModifiers,
        type,
        buffSubKind,
        ratio,
        buffDurationSec,
        ...sequenceTiming,
        ...presentation,
        ...(range !== undefined ? { range } : {}),
      });
    }
    if (buffSubKind === 'allyAttackFollowUp') {
      const buffDurationSec = requireNumber(obj, 'buffDurationSec', context);
      const allyFollowUpRadiusPx = parseOptionalNonNegativeNumber(
        obj,
        'allyFollowUpRadiusPx',
        context,
      );
      const followUpDefDebuffMultiplier = parseOptionalNumber(
        obj,
        'followUpDefDebuffMultiplier',
        context,
      );
      if (
        followUpDefDebuffMultiplier !== undefined &&
        (followUpDefDebuffMultiplier < 0 || followUpDefDebuffMultiplier > 1)
      ) {
        invalidField(
          context,
          'followUpDefDebuffMultiplier',
          'must be between 0 and 1',
        );
      }
      const followUpDefDebuffDurationSec = parseOptionalNonNegativeNumber(
        obj,
        'followUpDefDebuffDurationSec',
        context,
      );
      return normalizeSkillEffect({
        target: { kind: 'self' },
        ...combatModifiers,
        type,
        buffSubKind,
        buffDurationSec,
        ...(allyFollowUpRadiusPx !== undefined ? { allyFollowUpRadiusPx } : {}),
        ...(followUpDefDebuffMultiplier !== undefined
          ? { followUpDefDebuffMultiplier }
          : {}),
        ...(followUpDefDebuffDurationSec !== undefined
          ? { followUpDefDebuffDurationSec }
          : {}),
        ...sequenceTiming,
        ...presentation,
      });
    }
    const chance = requireNumber(obj, 'chance', context);
    if (chance < 0 || chance > 1) {
      invalidField(context, 'chance', 'must be between 0 and 1');
    }
    const buffDurationSec = requireNumber(obj, 'buffDurationSec', context);
    return normalizeSkillEffect({
      ...(target !== undefined ? { target } : {}),
      ...targetShapeFields,
      ...combatModifiers,
      type,
      buffSubKind,
      chance,
      buffDurationSec,
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }

  if (type === 'barrier') {
    const amount = parseEffectAmount(obj, context, 'barrier');
    const barrierStack = obj.barrierStack;
    if (barrierStack !== undefined && typeof barrierStack !== 'boolean') {
      invalidField(context, 'barrierStack', 'must be a boolean');
    }
    return normalizeSkillEffect({
      ...(target !== undefined ? { target } : {}),
      ...targetShapeFields,
      ...combatModifiers,
      type: 'barrier',
      amount,
      ...(typeof barrierStack === 'boolean' ? { barrierStack } : {}),
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }

  if (type === 'dot') {
    const durationSec = requireNumber(obj, 'durationSec', context);
    const amount = parseEffectAmount(obj, context, 'dot');
    if (amount.kind !== 'atkBased' || amount.atkScale === undefined) {
      invalidField(context, 'amount', 'dot effect requires atkBased amount');
    }
    const damageType =
      obj.damageType === undefined
        ? undefined
        : requireEnum(obj, 'damageType', context, DAMAGE_TYPES_SET);
    const dotFlavor = parseOptionalDotFlavor(obj, context);
    return normalizeSkillEffect({
      ...(target !== undefined ? { target } : {}),
      ...targetShapeFields,
      ...combatModifiers,
      type: 'dot',
      durationSec,
      amount,
      ...(damageType !== undefined ? { damageType } : {}),
      ...(dotFlavor !== undefined ? { dotFlavor } : {}),
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }

  if (type === 'stun') {
    const durationSec = requireStunDurationSec(obj, context);
    return normalizeSkillEffect({
      ...(target !== undefined ? { target } : {}),
      ...targetShapeFields,
      ...combatModifiers,
      type: 'stun',
      durationSec,
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }

  if (type === 'knockback') {
    const distancePx = requireNumber(obj, 'distancePx', context);
    if (distancePx <= 0) {
      invalidField(context, 'distancePx', 'must be a positive number');
    }
    return normalizeSkillEffect({
      ...(target !== undefined ? { target } : {}),
      ...targetShapeFields,
      ...combatModifiers,
      type: 'knockback',
      distancePx,
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
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
      const modeStr = requireString(obj, 'moveMode', context);
      if (modeStr === 'behindTarget') {
        moveMode = 'toAnchor';
      } else if (!MOVE_MODES_SET.has(modeStr as MoveMode)) {
        invalidField(
          context,
          'moveMode',
          `must be one of ${[...MOVE_MODES_SET, 'behindTarget'].join(', ')}`,
        );
      } else {
        moveMode = modeStr as MoveMode;
      }
    }
    const legacyBehindOffsetPx = parseOptionalNumber(
      obj,
      'behindOffsetPx',
      context,
    );
    const anchorOffsetPxRaw = parseOptionalNumber(
      obj,
      'anchorOffsetPx',
      context,
    );
    const anchorOffsetPx =
      anchorOffsetPxRaw ?? legacyBehindOffsetPx ?? undefined;
    if (moveMode === undefined && anchorOffsetPx !== undefined) {
      moveMode = 'toAnchor';
    }
    return normalizeSkillEffect({
      ...(target !== undefined ? { target } : {}),
      type: 'move',
      moveDurationSec,
      ...(moveMode !== undefined ? { moveMode } : {}),
      ...(anchorOffsetPx !== undefined && anchorOffsetPx !== 0
        ? { anchorOffsetPx }
        : {}),
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }

  if (type === 'dispel') {
    const dispelCount = requireNumber(obj, 'dispelCount', context);
    if (dispelCount < 0) {
      invalidField(context, 'dispelCount', 'must be a non-negative number');
    }
    const dispelTags = parseDebuffFilterTags(
      obj.dispelTags,
      `${context}.dispelTags`,
      false,
    );
    const dispelPriority = parseDispelPriority(
      obj.dispelPriority,
      `${context}.dispelPriority`,
    );
    return normalizeSkillEffect({
      ...(target !== undefined ? { target } : {}),
      ...targetShapeFields,
      ...combatModifiers,
      type: 'dispel',
      dispelCount,
      ...(dispelTags !== undefined ? { dispelTags } : {}),
      ...(dispelPriority !== undefined ? { dispelPriority } : {}),
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }

  if (type === 'counter') {
    if (obj.targetShape === 'multiLock') {
      invalidField(
        context,
        'targetShape',
        'multiLock is not allowed for counter effects',
      );
    }
    const durationSec = requireNumber(obj, 'durationSec', context);
    if (durationSec <= 0) {
      invalidField(context, 'durationSec', 'must be a positive number');
    }
    const responses = parseCounterEffectResponses(obj, context);
    return normalizeSkillEffect({
      target: { kind: 'self' },
      type: 'counter',
      ...(obj.chance !== undefined
        ? {
            chance: (() => {
              const chance = requireNumber(obj, 'chance', context);
              if (chance < 0 || chance > 1) {
                invalidField(context, 'chance', 'must be between 0 and 1');
              }
              return chance;
            })(),
          }
        : {}),
      responses,
      durationSec,
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
      ...parseCounterAttackRangeBandFields(obj, context),
    });
  }

  if (type === 'basicAttackTransform') {
    const buffDurationSec = requireNumber(obj, 'buffDurationSec', context);
    const transform = parseBasicAttackTransformFields(obj, context);
    return normalizeSkillEffect({
      target: { kind: 'self' },
      ...combatModifiers,
      type: 'basicAttackTransform',
      buffDurationSec,
      ...(transform.hitCountMultiplier !== undefined
        ? { hitCountMultiplier: transform.hitCountMultiplier }
        : {}),
      ...(transform.primaryEffectOverride !== undefined
        ? { primaryEffectOverride: transform.primaryEffectOverride }
        : {}),
      ...(transform.primaryPatch !== undefined
        ? { primaryPatch: transform.primaryPatch }
        : {}),
      ...(transform.appendEffects !== undefined
        ? { appendEffects: transform.appendEffects }
        : {}),
      ...sequenceTiming,
      ...presentation,
    });
  }

  if (type === 'block') {
    const blockChance = requireNumber(obj, 'blockChance', context);
    if (blockChance < 0 || blockChance > 1) {
      invalidField(context, 'blockChance', 'must be between 0 and 1');
    }
    const durationSec = requireNumber(obj, 'durationSec', context);
    if (durationSec <= 0) {
      invalidField(context, 'durationSec', 'must be a positive number');
    }
    return normalizeSkillEffect({
      ...(target !== undefined ? { target } : {}),
      ...targetShapeFields,
      ...combatModifiers,
      type: 'block',
      blockChance,
      durationSec,
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }

  if (type !== 'debuff') {
    invalidField(context, 'type', `unsupported effect type ${type}`);
  }

  const debuffSubKind =
    obj.debuffSubKind === undefined
      ? 'stat'
      : requireEnum(obj, 'debuffSubKind', context, DEBUFF_SUB_KINDS_SET);
  if (debuffSubKind === 'stat') {
    const debuffStat = requireStatBuffTarget(obj, 'debuffStat', context);
    const debuffDurationSec = requireNumber(obj, 'debuffDurationSec', context);
    requireBuffOrDebuffModifier(
      obj,
      context,
      'debuffMultiplier',
      'debuffFlatBonus',
    );
    return normalizeSkillEffect({
      ...(target !== undefined ? { target } : {}),
      ...targetShapeFields,
      ...combatModifiers,
      type,
      debuffSubKind,
      debuffStat,
      debuffDurationSec,
      ...(typeof obj.debuffMultiplier === 'number'
        ? { debuffMultiplier: obj.debuffMultiplier }
        : {}),
      ...(typeof obj.debuffFlatBonus === 'number'
        ? { debuffFlatBonus: obj.debuffFlatBonus }
        : {}),
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }
  if (debuffSubKind === 'dot') {
    const durationSec = requireNumber(obj, 'durationSec', context);
    const amount = parseEffectAmount(obj, context, 'debuff dot');
    if (amount.kind !== 'atkBased' || amount.atkScale === undefined) {
      invalidField(context, 'amount', 'debuff dot requires atkBased amount');
    }
    const damageType =
      obj.damageType === undefined
        ? undefined
        : requireEnum(obj, 'damageType', context, DAMAGE_TYPES_SET);
    const dotFlavor = parseOptionalDotFlavor(obj, context);
    const buffDisplayName = parseOptionalDebuffDisplayName(obj);
    return normalizeSkillEffect({
      ...(target !== undefined ? { target } : {}),
      ...targetShapeFields,
      ...combatModifiers,
      type,
      debuffSubKind,
      durationSec,
      amount,
      ...(damageType !== undefined ? { damageType } : {}),
      ...(dotFlavor !== undefined ? { dotFlavor } : {}),
      ...(buffDisplayName ? { buffDisplayName } : {}),
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }
  if (debuffSubKind === 'stun') {
    const durationSec = requireStunDurationSec(obj, context);
    return normalizeSkillEffect({
      ...(target !== undefined ? { target } : {}),
      ...targetShapeFields,
      ...combatModifiers,
      type,
      debuffSubKind,
      durationSec,
      ...sequenceTiming,
      ...presentation,
      ...(range !== undefined ? { range } : {}),
    });
  }
  invalidField(context, 'debuffSubKind', `unsupported debuff sub kind ${debuffSubKind}`);
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

function requireRes(value: number, context: string): void {
  if (!VALID_RES.has(value)) {
    invalidField(context, 'res', `must be one of ${[...VALID_RES].join(', ')}`);
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

const EXCESS_HEAL_SOURCES = ['outgoing', 'incoming'] as const;
const EXCESS_HEAL_SOURCES_SET = new Set<string>(EXCESS_HEAL_SOURCES);

function parseExcessHealSources(
  obj: Record<string, unknown>,
  context: string,
): PassiveSkillDef['excessHealSources'] | undefined {
  const raw = obj.excessHealSources;
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    invalidField(context, 'excessHealSources', 'must be a non-empty array');
  }
  const sources: Array<'outgoing' | 'incoming'> = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (typeof entry !== 'string' || !EXCESS_HEAL_SOURCES_SET.has(entry)) {
      invalidField(
        context,
        `excessHealSources[${i}]`,
        `must be one of ${[...EXCESS_HEAL_SOURCES_SET].join(', ')}`,
      );
    }
    if (!sources.includes(entry as 'outgoing' | 'incoming')) {
      sources.push(entry as 'outgoing' | 'incoming');
    }
  }
  return sources;
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
    case 'targetRuleOverride': {
      const targetRuleOverrideApplyTo =
        obj.targetRuleOverrideApplyTo === undefined
          ? undefined
          : requireEnum(
              obj,
              'targetRuleOverrideApplyTo',
              context,
              TARGET_RULE_OVERRIDE_APPLY_TO_SET,
            );
      return {
        ...base,
        targetRuleOverride: parseTargetSpec(
          obj.targetRuleOverride ?? obj.target,
          `${context}.targetRuleOverride`,
        ),
        ...(targetRuleOverrideApplyTo !== undefined
          ? { targetRuleOverrideApplyTo }
          : {}),
      };
    }
    case 'specialEffect': {
      const specialEffectApplyTo =
        obj.specialEffectApplyTo === undefined
          ? 'damage'
          : requireEnum(
              obj,
              'specialEffectApplyTo',
              context,
              SPECIAL_EFFECT_APPLY_TO_SET,
            );
      const defenseIgnore =
        obj.defenseIgnore === undefined
          ? undefined
          : parseDefenseIgnoreSpec(
              obj.defenseIgnore,
              `${context}.defenseIgnore`,
            );
      return {
        ...base,
        specialEffectApplyTo,
        specialEffect: parseSpecialEffectSpec(
          obj.specialEffect,
          `${context}.specialEffect`,
        ),
        ...(defenseIgnore !== undefined ? { defenseIgnore } : {}),
      };
    }
    case 'defenseIgnore':
      return {
        ...base,
        defenseIgnore: parseDefenseIgnoreSpec(
          obj.defenseIgnore,
          `${context}.defenseIgnore`,
        ),
      };
    case 'ignoredDefBonusDamage': {
      const ignoredDefBonusScale = requireNumber(
        obj,
        'ignoredDefBonusScale',
        context,
      );
      if (ignoredDefBonusScale < 0) {
        invalidField(
          context,
          'ignoredDefBonusScale',
          'must be non-negative',
        );
      }
      return {
        ...base,
        ignoredDefBonusScale,
      };
    }
    case 'bonusBasicAttackOnHit': {
      const chance =
        obj.chance === undefined
          ? 0.5
          : requireNumber(obj, 'chance', context);
      if (chance < 0 || chance > 1) {
        invalidField(context, 'chance', 'must be between 0 and 1');
      }
      const bonusBasicAttackConditions =
        obj.bonusBasicAttackConditions === undefined
          ? undefined
          : (() => {
              const raw = obj.bonusBasicAttackConditions;
              if (!Array.isArray(raw)) {
                invalidField(
                  context,
                  'bonusBasicAttackConditions',
                  'must be an array',
                );
              }
              return raw.map((entry, index) =>
                parseDamageIncreaseCondition(
                  entry,
                  `${context}.bonusBasicAttackConditions[${index}]`,
                ),
              );
            })();
      const hasConditions =
        bonusBasicAttackConditions !== undefined &&
        bonusBasicAttackConditions.length > 0;
      let bonusBasicAttackHpRatio: number | undefined;
      if (obj.bonusBasicAttackHpRatio !== undefined) {
        bonusBasicAttackHpRatio = requireNumber(
          obj,
          'bonusBasicAttackHpRatio',
          context,
        );
        if (bonusBasicAttackHpRatio < 0 || bonusBasicAttackHpRatio > 1) {
          invalidField(
            context,
            'bonusBasicAttackHpRatio',
            'must be between 0 and 1',
          );
        }
      } else if (!hasConditions) {
        bonusBasicAttackHpRatio = 0.3;
      }
      return {
        ...base,
        chance,
        ...(bonusBasicAttackHpRatio !== undefined
          ? { bonusBasicAttackHpRatio }
          : {}),
        ...(bonusBasicAttackConditions !== undefined
          ? { bonusBasicAttackConditions }
          : {}),
      };
    }
    case 'buff': {
      const buffSubKind =
        obj.buffSubKind === undefined
          ? 'stat'
          : requireEnum(obj, 'buffSubKind', context, BUFF_SUB_KINDS_SET);
      const buffTargetRule = parseOptionalPassiveTarget(
        obj,
        'buffTargetRule',
        context,
      );
      const targetingFields = parsePassiveBuffTargetingFields(obj, context);
      if (buffSubKind === 'block' || buffSubKind === 'evasion') {
        const chance = requireNumber(obj, 'chance', context);
        if (chance < 0 || chance > 1) {
          invalidField(context, 'chance', 'must be between 0 and 1');
        }
        const periodicFields = parsePassivePeriodicTriggerFields(obj, context);
        const buffDurationSec = parseOptionalNonNegativeNumber(
          obj,
          'buffDurationSec',
          context,
        );
        return {
          ...base,
          buffSubKind,
          chance,
          ...targetingFields,
          ...periodicFields,
          ...(buffTargetRule !== undefined ? { buffTargetRule } : {}),
          ...(buffDurationSec !== undefined ? { buffDurationSec } : {}),
        };
      }
      if (buffSubKind === 'damageDelay') {
        const ratio = requireNumber(obj, 'ratio', context);
        if (ratio < 0 || ratio > 1) {
          invalidField(context, 'ratio', 'must be between 0 and 1');
        }
        const periodicFields = parsePassivePeriodicTriggerFields(obj, context);
        const buffDurationSec = parseOptionalNonNegativeNumber(
          obj,
          'buffDurationSec',
          context,
        );
        return {
          ...base,
          buffSubKind,
          ratio,
          ...targetingFields,
          ...periodicFields,
          buffTargetRule: parseTargetSpec(
            obj.buffTargetRule ?? 'self',
            `${context}.buffTargetRule`,
          ),
          ...(buffDurationSec !== undefined ? { buffDurationSec } : {}),
        };
      }
      if (buffSubKind === 'barrier') {
        const amountSource = obj.barrierAmount ?? obj.amount;
        const barrierAmount = parseResourceAmountSpec(
          amountSource,
          `${context}.barrierAmount`,
        );
        const barrierStack = obj.barrierStack;
        if (barrierStack !== undefined && typeof barrierStack !== 'boolean') {
          invalidField(context, 'barrierStack', 'must be a boolean');
        }
        const periodicFields = parsePassivePeriodicTriggerFields(obj, context);
        return {
          ...base,
          buffSubKind,
          barrierAmount,
          ...targetingFields,
          buffTargetRule: parseTargetSpec(
            obj.buffTargetRule ?? 'self',
            `${context}.buffTargetRule`,
          ),
          ...(typeof barrierStack === 'boolean' ? { barrierStack } : {}),
          ...(periodicFields.periodicTrigger === undefined
            ? { periodicTrigger: 'stageStart' as const }
            : periodicFields),
        };
      }
      if (buffSubKind !== 'stat') {
        invalidField(
          context,
          'buffSubKind',
          'passive buff supports stat/block/evasion/damageDelay/barrier',
        );
      }
      const buffStatModifiers = parseStatBuffModifierEntries(obj, context);
      const periodicFields = parsePassivePeriodicTriggerFields(obj, context);
      const buffDurationSec = parseOptionalNonNegativeNumber(
        obj,
        'buffDurationSec',
        context,
      );
      if (buffStatModifiers !== undefined) {
        if (buffStatModifiers.length === 1) {
          const entry = buffStatModifiers[0]!;
          return {
            ...base,
            buffSubKind,
            buffStat: entry.stat,
            ...targetingFields,
            ...periodicFields,
            ...(entry.multiplier !== undefined
              ? { buffMultiplier: entry.multiplier }
              : {}),
            ...(entry.flatBonus !== undefined
              ? { buffFlatBonus: entry.flatBonus }
              : {}),
            ...(buffTargetRule !== undefined ? { buffTargetRule } : {}),
            ...(buffDurationSec !== undefined ? { buffDurationSec } : {}),
          };
        }
        return {
          ...base,
          buffSubKind,
          buffStatModifiers,
          buffStat: buffStatModifiers.map((entry) => entry.stat),
          ...targetingFields,
          ...periodicFields,
          ...(buffTargetRule !== undefined ? { buffTargetRule } : {}),
          ...(buffDurationSec !== undefined ? { buffDurationSec } : {}),
        };
      }
      const buffStatRaw = obj.buffStat;
      if (buffStatRaw === undefined) {
        missingField(context, 'buffStat');
      }
      const buffStatEntries = Array.isArray(buffStatRaw) ? buffStatRaw : [buffStatRaw];
      const buffStat = buffStatEntries.map((entry, index) => {
        const value = String(entry);
        if (typeof entry !== 'string' || !BUFF_TARGET_KINDS_SET.has(value as import('../types.ts').BuffTargetKind)) {
          invalidField(
            context,
            `buffStat[${index}]`,
            `must be one of ${[...BUFF_TARGET_KINDS_SET].join(', ')}`,
          );
        }
        return value;
      }) as PassiveSkillDef['buffStat'];
      requireBuffOrDebuffModifier(
        obj,
        context,
        'buffMultiplier',
        'buffFlatBonus',
      );
      return {
        ...base,
        buffSubKind,
        buffStat,
        ...targetingFields,
        ...periodicFields,
        ...(typeof obj.buffMultiplier === 'number'
          ? { buffMultiplier: obj.buffMultiplier }
          : {}),
        ...(typeof obj.buffFlatBonus === 'number'
          ? { buffFlatBonus: obj.buffFlatBonus }
          : {}),
        ...(buffTargetRule !== undefined ? { buffTargetRule } : {}),
        ...(buffDurationSec !== undefined ? { buffDurationSec } : {}),
      };
    }
    case 'debuff': {
      const debuffSubKind =
        obj.debuffSubKind === undefined
          ? ('stat' as const)
          : requireEnum(obj, 'debuffSubKind', context, DEBUFF_SUB_KINDS_SET);
      const debuffTargetRule: TargetSpec =
        parseOptionalPassiveTarget(obj, 'debuffTargetRule', context) ?? {
          kind: 'distance',
          side: 'enemy',
          order: 'nearest',
        };
      const targetingFields = parsePassiveDebuffTargetingFields(obj, context);
      const periodicFields = parsePassivePeriodicTriggerFields(obj, context);

      if (debuffSubKind === 'stat') {
        const debuffDurationSec = parseOptionalNonNegativeNumber(
          obj,
          'debuffDurationSec',
          context,
        );
        return {
          ...base,
          debuffSubKind,
          debuffTargetRule,
          ...targetingFields,
          ...periodicFields,
          debuffStat: requireStatBuffTarget(obj, 'debuffStat', context),
          ...(() => {
            requireBuffOrDebuffModifier(
              obj,
              context,
              'debuffMultiplier',
              'debuffFlatBonus',
            );
            return {};
          })(),
          ...(typeof obj.debuffMultiplier === 'number'
            ? { debuffMultiplier: obj.debuffMultiplier }
            : {}),
          ...(typeof obj.debuffFlatBonus === 'number'
            ? { debuffFlatBonus: obj.debuffFlatBonus }
            : {}),
          ...(debuffDurationSec !== undefined ? { debuffDurationSec } : {}),
        };
      }

      if (debuffSubKind === 'dot') {
        const debuffDotDurationSec = requireNumber(
          obj,
          'debuffDotDurationSec',
          context,
        );
        const amount = parseResourceAmountSpec(
          obj.debuffDotAmount ?? obj.amount,
          `${context}.debuffDotAmount`,
        );
        if (amount.kind !== 'atkBased' || amount.atkScale === undefined) {
          invalidField(
            context,
            'debuffDotAmount',
            'debuff dot requires atkBased amount',
          );
        }
        const damageType =
          obj.debuffDotDamageType === undefined
            ? undefined
            : requireEnum(obj, 'debuffDotDamageType', context, DAMAGE_TYPES_SET);
        const debuffDotFlavor = parseOptionalDotFlavor(
          obj,
          context,
          'debuffDotFlavor',
        );
        return {
          ...base,
          debuffSubKind,
          debuffTargetRule,
          ...targetingFields,
          ...periodicFields,
          debuffDotDurationSec,
          debuffDotAmount: amount,
          ...(damageType !== undefined ? { debuffDotDamageType: damageType } : {}),
          ...(debuffDotFlavor !== undefined ? { debuffDotFlavor } : {}),
        };
      }

      const debuffStunDurationSec = requireNumber(
        obj,
        'debuffStunDurationSec',
        context,
      );
      if (debuffStunDurationSec <= 0) {
        invalidField(context, 'debuffStunDurationSec', 'must be a positive number');
      }
      if (debuffStunDurationSec > STUN_MAX_DURATION_SEC) {
        invalidField(
          context,
          'debuffStunDurationSec',
          `must be at most ${STUN_MAX_DURATION_SEC}`,
        );
      }
      return {
        ...base,
        debuffSubKind,
        debuffTargetRule,
        ...targetingFields,
        ...periodicFields,
        debuffStunDurationSec,
      };
    }
    case 'periodicDispel': {
      const dispelCount = requireNumber(obj, 'dispelCount', context);
      if (dispelCount < 0) {
        invalidField(context, 'dispelCount', 'must be a non-negative number');
      }
      const dispelTags = parseDebuffFilterTags(
        obj.dispelTags,
        `${context}.dispelTags`,
        false,
      );
      const dispelPriority = parseDispelPriority(
        obj.dispelPriority,
        `${context}.dispelPriority`,
      );
      const dispelTriggerLimit = parseOptionalNonNegativeNumber(
        obj,
        'dispelTriggerLimit',
        context,
      );
      const periodicFields = parsePassivePeriodicTriggerFields(obj, context, {
        allowedKinds: PASSIVE_DISPEL_TRIGGER_KINDS,
      });
      const targetingFields = parsePassiveDispelTargetingFields(obj, context);
      return {
        ...base,
        ...(periodicFields.periodicTrigger === undefined
          ? { periodicTrigger: 'waveStart' as const }
          : periodicFields),
        dispelTargetRule: parseTargetSpec(
          obj.dispelTargetRule ?? 'self',
          `${context}.dispelTargetRule`,
        ),
        ...targetingFields,
        dispelCount,
        ...(dispelTags !== undefined ? { dispelTags } : {}),
        ...(dispelPriority !== undefined ? { dispelPriority } : {}),
        ...(dispelTriggerLimit !== undefined ? { dispelTriggerLimit } : {}),
      };
    }
    case 'herbalPotency': {
      const amountSource = obj.hotAmount ?? obj.partyHotAuraAmount;
      const targetSource = obj.hotTargetRule ?? obj.partyHotTargetRule;
      const hotDurationSec = parseOptionalNonNegativeNumber(
        obj,
        'hotDurationSec',
        context,
      );
      const targetingFields = parsePassiveHotTargetingFields(obj, context);
      const maxStacks = requireNumber(obj, 'herbalPotencyMaxStacks', context);
      if (!Number.isInteger(maxStacks) || maxStacks < 1) {
        invalidField(
          context,
          'herbalPotencyMaxStacks',
          'must be a positive integer',
        );
      }
      const hotPerStackPercent = parseOptionalNonNegativeNumber(
        obj,
        'herbalPotencyHotPerStackPercent',
        context,
      );
      const hotTickSec = parseOptionalNonNegativeNumber(
        obj,
        'herbalPotencyHotTickSec',
        context,
      );
      const accumulateSec = parseOptionalNonNegativeNumber(
        obj,
        'herbalPotencyAccumulateSec',
        context,
      );
      const constitutionThresholds = parseOptionalPositiveIntArray(
        obj.herbalPotencyConstitutionThresholds,
        `${context}.herbalPotencyConstitutionThresholds`,
      );
      const constitutionHpMultipliers = parseOptionalNumberArray(
        obj.herbalPotencyConstitutionHpMultipliers,
        `${context}.herbalPotencyConstitutionHpMultipliers`,
      );
      const constitutionDisplayName =
        typeof obj.herbalPotencyConstitutionDisplayName === 'string' &&
        obj.herbalPotencyConstitutionDisplayName.length > 0
          ? obj.herbalPotencyConstitutionDisplayName
          : undefined;
      if (
        constitutionThresholds !== undefined &&
        constitutionHpMultipliers !== undefined &&
        constitutionThresholds.length !== constitutionHpMultipliers.length
      ) {
        invalidField(
          context,
          'herbalPotencyConstitutionHpMultipliers',
          'length must match herbalPotencyConstitutionThresholds',
        );
      }
      return {
        ...base,
        ...(amountSource !== undefined
          ? {
              hotAmount: parseResourceAmountSpec(
                amountSource,
                `${context}.hotAmount`,
              ),
            }
          : {}),
        ...(targetSource !== undefined
          ? {
              hotTargetRule: parseTargetSpec(
                targetSource,
                `${context}.hotTargetRule`,
              ),
            }
          : {}),
        ...targetingFields,
        herbalPotencyMaxStacks: maxStacks,
        ...(hotPerStackPercent !== undefined
          ? { herbalPotencyHotPerStackPercent: hotPerStackPercent }
          : {}),
        ...(hotTickSec !== undefined
          ? { herbalPotencyHotTickSec: hotTickSec }
          : {}),
        ...(accumulateSec !== undefined
          ? { herbalPotencyAccumulateSec: accumulateSec }
          : {}),
        ...(constitutionThresholds !== undefined
          ? { herbalPotencyConstitutionThresholds: constitutionThresholds }
          : {}),
        ...(constitutionHpMultipliers !== undefined
          ? { herbalPotencyConstitutionHpMultipliers: constitutionHpMultipliers }
          : {}),
        ...(constitutionDisplayName !== undefined
          ? { herbalPotencyConstitutionDisplayName: constitutionDisplayName }
          : {}),
        ...(hotDurationSec !== undefined ? { hotDurationSec } : {}),
      };
    }
    case 'blockResonance': {
      const maxStacks = requireNumber(obj, 'blockResonanceMaxStacks', context);
      if (!Number.isInteger(maxStacks) || maxStacks < 1) {
        invalidField(
          context,
          'blockResonanceMaxStacks',
          'must be a positive integer',
        );
      }
      const damageTakenPerStack = requireNumber(
        obj,
        'blockResonanceDamageTakenPerStack',
        context,
      );
      if (damageTakenPerStack < 0 || damageTakenPerStack > 1) {
        invalidField(
          context,
          'blockResonanceDamageTakenPerStack',
          'must be between 0 and 1',
        );
      }
      const decayIntervalSec = parseOptionalNonNegativeNumber(
        obj,
        'blockResonanceDecayIntervalSec',
        context,
      );
      const chance = parseOptionalNonNegativeNumber(obj, 'chance', context);
      return {
        ...base,
        blockResonanceMaxStacks: maxStacks,
        blockResonanceDamageTakenPerStack: damageTakenPerStack,
        ...(decayIntervalSec !== undefined
          ? { blockResonanceDecayIntervalSec: decayIntervalSec }
          : {}),
        ...(chance !== undefined ? { chance } : {}),
      };
    }
    case 'lastStandInvulnerable':
      return { ...base };
    case 'frontBlockAura': {
      const chance = parseOptionalNonNegativeNumber(obj, 'chance', context);
      const frontBlockAuraMagicBlock =
        obj.frontBlockAuraMagicBlock === undefined
          ? undefined
          : requireBoolean(obj, 'frontBlockAuraMagicBlock', context);
      const frontBlockAuraRadiusPx = parseOptionalNumber(
        obj,
        'frontBlockAuraRadiusPx',
        context,
      );
      const buffDisplayName =
        typeof obj.buffDisplayName === 'string' && obj.buffDisplayName.length > 0
          ? obj.buffDisplayName
          : undefined;
      if (
        frontBlockAuraRadiusPx !== undefined &&
        frontBlockAuraRadiusPx <= 0
      ) {
        invalidField(context, 'frontBlockAuraRadiusPx', 'must be positive');
      }
      return {
        ...base,
        ...(chance !== undefined ? { chance } : {}),
        ...(frontBlockAuraMagicBlock !== undefined
          ? { frontBlockAuraMagicBlock }
          : {}),
        ...(frontBlockAuraRadiusPx !== undefined
          ? { frontBlockAuraRadiusPx }
          : {}),
        ...(buffDisplayName !== undefined ? { buffDisplayName } : {}),
      };
    }
    case 'lastStandRecovery': {
      const hpRatio = parseOptionalNumber(obj, 'lastStandRecoveryHpRatio', context);
      const selfMul = parseOptionalNumber(
        obj,
        'lastStandRecoverySelfDamageTakenMultiplier',
        context,
      );
      const frontMul = parseOptionalNumber(
        obj,
        'lastStandRecoveryFrontAllyDamageTakenMultiplier',
        context,
      );
      const durationSec = parseOptionalNonNegativeNumber(
        obj,
        'lastStandRecoveryDurationSec',
        context,
      );
      const frontAllyAuraRadiusPx = parseOptionalNumber(
        obj,
        'lastStandRecoveryFrontAllyAuraRadiusPx',
        context,
      );
      if (
        frontAllyAuraRadiusPx !== undefined &&
        frontAllyAuraRadiusPx <= 0
      ) {
        invalidField(
          context,
          'lastStandRecoveryFrontAllyAuraRadiusPx',
          'must be positive',
        );
      }
      return {
        ...base,
        ...(hpRatio !== undefined ? { lastStandRecoveryHpRatio: hpRatio } : {}),
        ...(selfMul !== undefined
          ? { lastStandRecoverySelfDamageTakenMultiplier: selfMul }
          : {}),
        ...(frontMul !== undefined
          ? { lastStandRecoveryFrontAllyDamageTakenMultiplier: frontMul }
          : {}),
        ...(frontAllyAuraRadiusPx !== undefined
          ? { lastStandRecoveryFrontAllyAuraRadiusPx: frontAllyAuraRadiusPx }
          : {}),
        ...(durationSec !== undefined
          ? { lastStandRecoveryDurationSec: durationSec }
          : {}),
      };
    }
    case 'duelistPride': {
      const prideHpRatioMin = parseOptionalNumber(obj, 'prideHpRatioMin', context);
      const prideHealMultiplier = parseOptionalNumber(
        obj,
        'prideHealMultiplier',
        context,
      );
      if (prideHpRatioMin !== undefined && (prideHpRatioMin < 0 || prideHpRatioMin > 1)) {
        invalidField(context, 'prideHpRatioMin', 'must be between 0 and 1');
      }
      if (
        prideHealMultiplier !== undefined &&
        (prideHealMultiplier < 0 || prideHealMultiplier > 1)
      ) {
        invalidField(context, 'prideHealMultiplier', 'must be between 0 and 1');
      }
      return {
        ...base,
        ...(prideHpRatioMin !== undefined ? { prideHpRatioMin } : {}),
        ...(prideHealMultiplier !== undefined ? { prideHealMultiplier } : {}),
      };
    }
    case 'lowHpCover': {
      const coverHpRatioThreshold = parseOptionalNumber(
        obj,
        'coverHpRatioThreshold',
        context,
      );
      const coverWaveLimit = parseOptionalNonNegativeNumber(
        obj,
        'coverWaveLimit',
        context,
      );
      return {
        ...base,
        ...(coverHpRatioThreshold !== undefined ? { coverHpRatioThreshold } : {}),
        ...(coverWaveLimit !== undefined ? { coverWaveLimit } : {}),
      };
    }
    case 'lastStandGuts': {
      const durationSec = parseOptionalNonNegativeNumber(
        obj,
        'lastStandGutsDurationSec',
        context,
      );
      const endStunSec = parseOptionalNonNegativeNumber(
        obj,
        'lastStandGutsEndStunSec',
        context,
      );
      const endKnockbackPx = parseOptionalNonNegativeNumber(
        obj,
        'lastStandGutsEndKnockbackPx',
        context,
      );
      return {
        ...base,
        ...(durationSec !== undefined ? { lastStandGutsDurationSec: durationSec } : {}),
        ...(endStunSec !== undefined ? { lastStandGutsEndStunSec: endStunSec } : {}),
        ...(endKnockbackPx !== undefined
          ? { lastStandGutsEndKnockbackPx: endKnockbackPx }
          : {}),
      };
    }
    case 'bloodlustDuelist': {
      const blockChance = parseOptionalNumber(obj, 'bloodlustBlockChance', context);
      const defRatio = parseOptionalNumber(
        obj,
        'bloodlustDefMaxBuffAtHpRatio',
        context,
      );
      const defMul = parseOptionalNumber(obj, 'bloodlustDefBuffMultiplierMax', context);
      const atkRatio = parseOptionalNumber(
        obj,
        'bloodlustAtkMaxBuffAtHpRatio',
        context,
      );
      const atkMul = parseOptionalNumber(obj, 'bloodlustAtkBuffMultiplierMax', context);
      const atkCurveExponent = parseOptionalNumber(
        obj,
        'bloodlustAtkBuffCurveExponent',
        context,
      );
      if (atkCurveExponent !== undefined && atkCurveExponent < 1) {
        invalidField(context, 'bloodlustAtkBuffCurveExponent', 'must be >= 1');
      }
      return {
        ...base,
        ...(blockChance !== undefined ? { bloodlustBlockChance: blockChance } : {}),
        ...(defRatio !== undefined ? { bloodlustDefMaxBuffAtHpRatio: defRatio } : {}),
        ...(defMul !== undefined ? { bloodlustDefBuffMultiplierMax: defMul } : {}),
        ...(atkRatio !== undefined ? { bloodlustAtkMaxBuffAtHpRatio: atkRatio } : {}),
        ...(atkMul !== undefined ? { bloodlustAtkBuffMultiplierMax: atkMul } : {}),
        ...(atkCurveExponent !== undefined
          ? { bloodlustAtkBuffCurveExponent: atkCurveExponent }
          : {}),
      };
    }
    case 'heal': {
      const healSubKind =
        obj.healSubKind === undefined
          ? ('hot' as const)
          : requireEnum(obj, 'healSubKind', context, HEAL_SUB_KINDS_SET);
      if (healSubKind !== 'hot') {
        invalidField(
          context,
          'healSubKind',
          'passive heal currently supports hot only',
        );
      }
      const amountSource = obj.hotAmount ?? obj.partyHotAuraAmount;
      const targetSource = obj.hotTargetRule ?? obj.partyHotTargetRule;
      const hotDurationSec = parseOptionalNonNegativeNumber(
        obj,
        'hotDurationSec',
        context,
      );
      const targetingFields = parsePassiveHotTargetingFields(obj, context);
      return {
        ...base,
        healSubKind: 'hot',
        hotAmount: parseResourceAmountSpec(
          amountSource,
          `${context}.hotAmount`,
        ),
        hotTargetRule: parseTargetSpec(
          targetSource ?? 'self',
          `${context}.hotTargetRule`,
        ),
        ...targetingFields,
        ...parsePassivePeriodicTriggerFields(obj, context),
        ...(hotDurationSec !== undefined ? { hotDurationSec } : {}),
      };
    }
    case 'damageReduction': {
      const percent = requireNumber(obj, 'damageReductionPercent', context);
      if (percent < 0 || percent > 1) {
        invalidField(
          context,
          'damageReductionPercent',
          'must be between 0 and 1',
        );
      }
      const targetingFields = parsePassiveDamageReductionTargetingFields(
        obj,
        context,
      );
      return {
        ...base,
        damageReductionPercent: percent,
        ...targetingFields,
        damageReductionTargetRule: parseTargetSpec(
          obj.damageReductionTargetRule ?? 'self',
          `${context}.damageReductionTargetRule`,
        ),
      };
    }
    case 'excessHealToBarrier': {
      const barrierScale =
        obj.barrierScale === undefined
          ? 1
          : requireNumber(obj, 'barrierScale', context);
      const excessHealSources = parseExcessHealSources(obj, context);
      return {
        ...base,
        barrierScale,
        ...(excessHealSources !== undefined ? { excessHealSources } : {}),
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
    case 'counter': {
      const chance = requireNumber(obj, 'chance', context);
      if (chance < 0 || chance > 1) {
        invalidField(context, 'chance', 'must be between 0 and 1');
      }
      const responseSource =
        obj.counterResponses !== undefined
          ? { responses: obj.counterResponses }
          : obj;
      const counterResponses = parseCounterEffectResponses(
        responseSource,
        context,
      );
      const counterRange = parseOptionalNumber(obj, 'counterRange', context);
      if (counterRange !== undefined && counterRange < 0) {
        invalidField(context, 'counterRange', 'must be a non-negative number');
      }
      const counterTrigger = parseOptionalPassiveCounterTrigger(obj, context);
      return {
        ...base,
        chance,
        counterResponses,
        ...(counterRange !== undefined ? { counterRange } : {}),
        ...(counterTrigger !== undefined ? { counterTrigger } : {}),
        ...parseCounterAttackRangeBandFields(obj, context),
      };
    }
    case 'excessHealRedirect': {
      const redirectScale = requireNumber(obj, 'redirectScale', context);
      if (redirectScale <= 0 || redirectScale > 1) {
        invalidField(context, 'redirectScale', 'must be between 0 and 1');
      }
      const excessHealSources = parseExcessHealSources(obj, context);
      return {
        ...base,
        redirectScale,
        ...(excessHealSources !== undefined ? { excessHealSources } : {}),
      };
    }
    case 'targetHpRatioHealScale': {
      const healScaleMax = requireNumber(obj, 'healScaleMax', context);
      if (healScaleMax <= 1) {
        invalidField(context, 'healScaleMax', 'must be greater than 1');
      }
      const maxScaleAtHpRatio = requireNumber(obj, 'maxScaleAtHpRatio', context);
      if (maxScaleAtHpRatio < 0 || maxScaleAtHpRatio >= 1) {
        invalidField(
          context,
          'maxScaleAtHpRatio',
          'must be between 0 and 1 (exclusive of 1)',
        );
      }
      return {
        ...base,
        healScaleMax,
        maxScaleAtHpRatio,
      };
    }
    case 'targetHpRatioDamageScale': {
      const damageScaleMax = requireNumber(obj, 'damageScaleMax', context);
      if (damageScaleMax <= 1) {
        invalidField(context, 'damageScaleMax', 'must be greater than 1');
      }
      const minScaleAtHpRatio = requireNumber(obj, 'minScaleAtHpRatio', context);
      if (minScaleAtHpRatio < 0 || minScaleAtHpRatio >= 1) {
        invalidField(
          context,
          'minScaleAtHpRatio',
          'must be between 0 and 1 (exclusive of 1)',
        );
      }
      return {
        ...base,
        damageScaleMax,
        minScaleAtHpRatio,
      };
    }
    case 'idleAtkRamp': {
      const rampToMaxSec = requireNumber(obj, 'rampToMaxSec', context);
      if (rampToMaxSec <= 0) {
        invalidField(context, 'rampToMaxSec', 'must be positive');
      }
      const atkMulMin = requireNumber(obj, 'atkMulMin', context);
      const atkMulMax = requireNumber(obj, 'atkMulMax', context);
      if (atkMulMin <= 0 || atkMulMax <= 0) {
        invalidField(context, 'atkMulMin/atkMulMax', 'must be positive');
      }
      if (atkMulMax < atkMulMin) {
        invalidField(context, 'atkMulMax', 'must be >= atkMulMin');
      }
      const fullRampAttackSpeedMul = requireNumber(
        obj,
        'fullRampAttackSpeedMul',
        context,
      );
      if (fullRampAttackSpeedMul <= 0 || fullRampAttackSpeedMul >= 1) {
        invalidField(
          context,
          'fullRampAttackSpeedMul',
          'must be between 0 and 1 (exclusive)',
        );
      }
      return {
        ...base,
        rampToMaxSec,
        atkMulMin,
        atkMulMax,
        fullRampAttackSpeedMul,
      };
    }
    case 'ballistaMark': {
      const ballistaMarkSplashRadiusPx = requireNumber(
        obj,
        'ballistaMarkSplashRadiusPx',
        context,
      );
      if (ballistaMarkSplashRadiusPx <= 0) {
        invalidField(context, 'ballistaMarkSplashRadiusPx', 'must be positive');
      }
      const ballistaMarkSplashDamageScale = requireNumber(
        obj,
        'ballistaMarkSplashDamageScale',
        context,
      );
      if (
        ballistaMarkSplashDamageScale <= 0 ||
        ballistaMarkSplashDamageScale > 1
      ) {
        invalidField(
          context,
          'ballistaMarkSplashDamageScale',
          'must be between 0 and 1 (exclusive of 0)',
        );
      }
      const ballistaMarkSelfAttackSpeedMul = parseOptionalNumber(
        obj,
        'ballistaMarkSelfAttackSpeedMul',
        context,
      );
      const targetRuleOverride =
        obj.targetRuleOverride !== undefined
          ? parseTargetSpec(
              obj.targetRuleOverride,
              `${context}.targetRuleOverride`,
            )
          : undefined;
      return {
        ...base,
        ballistaMarkSplashRadiusPx,
        ballistaMarkSplashDamageScale,
        ...(ballistaMarkSelfAttackSpeedMul !== undefined
          ? { ballistaMarkSelfAttackSpeedMul }
          : {}),
        ...(targetRuleOverride !== undefined ? { targetRuleOverride } : {}),
      };
    }
    case 'dotCompressAssist': {
      const dotCompressRatio = requireNumber(obj, 'dotCompressRatio', context);
      if (dotCompressRatio <= 0 || dotCompressRatio > 1) {
        invalidField(context, 'dotCompressRatio', 'must be between 0 and 1');
      }
      return { ...base, dotCompressRatio };
    }
    case 'allyBasicAttackDotProc': {
      const chance = requireNumber(obj, 'chance', context);
      if (chance <= 0 || chance > 1) {
        invalidField(context, 'chance', 'must be between 0 and 1');
      }
      const debuffDotDurationSec = requireNumber(
        obj,
        'debuffDotDurationSec',
        context,
      );
      if (debuffDotDurationSec <= 0) {
        invalidField(context, 'debuffDotDurationSec', 'must be positive');
      }
      const debuffDotAmount = parseResourceAmountSpec(
        obj.debuffDotAmount,
        `${context}.debuffDotAmount`,
      );
      const debuffDotDamageType =
        obj.debuffDotDamageType === undefined
          ? undefined
          : requireEnum(obj, 'debuffDotDamageType', context, DAMAGE_TYPES_SET);
      const debuffDotFlavor =
        obj.debuffDotFlavor === undefined
          ? undefined
          : requireEnum(obj, 'debuffDotFlavor', context, new Set(['poison', 'bleed']));
      return {
        ...base,
        chance,
        debuffDotDurationSec,
        debuffDotAmount,
        ...(debuffDotDamageType !== undefined ? { debuffDotDamageType } : {}),
        ...(debuffDotFlavor !== undefined ? { debuffDotFlavor } : {}),
      };
    }
    case 'dotDurationMultiplierOnApply': {
      const dotDurationMultiplierOnApply = requireNumber(
        obj,
        'dotDurationMultiplierOnApply',
        context,
      );
      if (dotDurationMultiplierOnApply <= 0) {
        invalidField(
          context,
          'dotDurationMultiplierOnApply',
          'must be positive',
        );
      }
      const dottedEnemyHealReceivedMultiplier = parseOptionalNumber(
        obj,
        'dottedEnemyHealReceivedMultiplier',
        context,
      );
      if (
        dottedEnemyHealReceivedMultiplier !== undefined &&
        (dottedEnemyHealReceivedMultiplier <= 0 ||
          dottedEnemyHealReceivedMultiplier > 1)
      ) {
        invalidField(
          context,
          'dottedEnemyHealReceivedMultiplier',
          'must be between 0 and 1',
        );
      }
      return {
        ...base,
        dotDurationMultiplierOnApply,
        ...(dottedEnemyHealReceivedMultiplier !== undefined
          ? { dottedEnemyHealReceivedMultiplier }
          : {}),
      };
    }
    case 'dottedEnemyHealReceivedDebuff': {
      const dottedEnemyHealReceivedMultiplier = requireNumber(
        obj,
        'dottedEnemyHealReceivedMultiplier',
        context,
      );
      if (
        dottedEnemyHealReceivedMultiplier <= 0 ||
        dottedEnemyHealReceivedMultiplier > 1
      ) {
        invalidField(
          context,
          'dottedEnemyHealReceivedMultiplier',
          'must be between 0 and 1',
        );
      }
      return { ...base, dottedEnemyHealReceivedMultiplier };
    }
    case 'conditionalEnemyDamageTakenAura': {
      const enemyDamageTakenMultiplier = requireNumber(
        obj,
        'enemyDamageTakenMultiplier',
        context,
      );
      if (enemyDamageTakenMultiplier <= 0) {
        invalidField(
          context,
          'enemyDamageTakenMultiplier',
          'must be positive',
        );
      }
      const auraConditions =
        obj.auraConditions === undefined
          ? undefined
          : (obj.auraConditions as unknown[]).map((entry, index) =>
              parseDamageIncreaseCondition(
                entry,
                `${context}.auraConditions[${index}]`,
              ),
            );
      return {
        ...base,
        enemyDamageTakenMultiplier,
        ...(auraConditions !== undefined ? { auraConditions } : {}),
      };
    }
    case 'seedFlameOnActiveHit': {
      const seedFlameMaxStacks = parseOptionalPositiveNumber(
        obj,
        context,
        'seedFlameMaxStacks',
      );
      const seedFlameDurationSec = parseOptionalPositiveNumber(
        obj,
        context,
        'seedFlameDurationSec',
      );
      const seedFlameDotAtkScale =
        obj.seedFlameDotAtkScale === undefined
          ? {}
          : { seedFlameDotAtkScale: requireNumber(obj, 'seedFlameDotAtkScale', context) };
      const blazingFlameDotAtkScale =
        obj.blazingFlameDotAtkScale === undefined
          ? {}
          : {
              blazingFlameDotAtkScale: requireNumber(
                obj,
                'blazingFlameDotAtkScale',
                context,
              ),
            };
      const blazingFlameMagicTakenPerStack =
        obj.blazingFlameMagicTakenPerStack === undefined
          ? {}
          : {
              blazingFlameMagicTakenPerStack: requireNumber(
                obj,
                'blazingFlameMagicTakenPerStack',
                context,
              ),
            };
      const blazingFlameMaxStacksDefault = parseOptionalPositiveNumber(
        obj,
        context,
        'blazingFlameMaxStacksDefault',
      );
      return {
        ...base,
        ...seedFlameMaxStacks,
        ...seedFlameDurationSec,
        ...seedFlameDotAtkScale,
        ...blazingFlameDotAtkScale,
        ...blazingFlameMagicTakenPerStack,
        ...blazingFlameMaxStacksDefault,
      };
    }
    case 'bonusActiveOnHit': {
      const bonusActiveSkillId = requireString(
        obj,
        'bonusActiveSkillId',
        context,
      );
      return { ...base, bonusActiveSkillId };
    }
    case 'blazingFlameDetonate': {
      const blazingFlameDetonateSpreadRadiusPx =
        obj.blazingFlameDetonateSpreadRadiusPx === undefined
          ? 50
          : requireNumber(
              obj,
              'blazingFlameDetonateSpreadRadiusPx',
              context,
            );
      const blazingFlameDetonatePerSeedScale =
        obj.blazingFlameDetonatePerSeedScale === undefined
          ? 0.5
          : requireNumber(obj, 'blazingFlameDetonatePerSeedScale', context);
      const blazingFlameDetonateMultiplier =
        obj.blazingFlameDetonateMultiplier === undefined
          ? 1.3
          : requireNumber(obj, 'blazingFlameDetonateMultiplier', context);
      const blazingFlameUncap = obj.blazingFlameUncap === true;
      return {
        ...base,
        blazingFlameDetonateSpreadRadiusPx,
        blazingFlameDetonatePerSeedScale,
        blazingFlameDetonateMultiplier,
        ...(blazingFlameUncap ? { blazingFlameUncap: true } : {}),
      };
    }
    case 'healReservation': {
      const grantOnHealMaxHpRatio = requireNumber(
        obj,
        'grantOnHealMaxHpRatio',
        context,
      );
      if (grantOnHealMaxHpRatio < 0 || grantOnHealMaxHpRatio > 1) {
        invalidField(
          context,
          'grantOnHealMaxHpRatio',
          'must be between 0 and 1',
        );
      }
      const stackDurationSec = requireNumber(obj, 'stackDurationSec', context);
      if (stackDurationSec <= 0) {
        invalidField(context, 'stackDurationSec', 'must be a positive number');
      }
      const triggerHpRatio = requireNumber(obj, 'triggerHpRatio', context);
      if (triggerHpRatio < 0 || triggerHpRatio > 1) {
        invalidField(context, 'triggerHpRatio', 'must be between 0 and 1');
      }
      const healAmount = parseResourceAmountSpec(
        obj.healAmount,
        `${context}.healAmount`,
      );
      const buffDisplayName =
        obj.buffDisplayName === undefined
          ? undefined
          : requireString(obj, 'buffDisplayName', context);
      return {
        ...base,
        grantOnHealMaxHpRatio,
        stackDurationSec,
        triggerHpRatio,
        healAmount,
        ...(buffDisplayName !== undefined ? { buffDisplayName } : {}),
      };
    }
    case 'barrierBreakRegen': {
      const barrierAmount = parseResourceAmountSpec(
        obj.barrierAmount,
        `${context}.barrierAmount`,
      );
      return {
        ...base,
        barrierAmount,
      };
    }
    case 'barrierDepletionHeal': {
      const healAmount = parseResourceAmountSpec(
        obj.healAmount,
        `${context}.healAmount`,
      );
      return {
        ...base,
        healAmount,
      };
    }
    case 'selfHpRatioBuff': {
      const buffStat = requireStatBuffTarget(obj, 'buffStat', context);
      const buffMultiplierMax = parseOptionalNumber(
        obj,
        'buffMultiplierMax',
        context,
      );
      const buffFlatBonusMax = parseOptionalNumber(
        obj,
        'buffFlatBonusMax',
        context,
      );
      if (buffMultiplierMax === undefined && buffFlatBonusMax === undefined) {
        invalidField(
          context,
          'buffMultiplierMax',
          'or buffFlatBonusMax is required',
        );
      }
      if (
        buffMultiplierMax !== undefined &&
        buffMultiplierMax <= 0
      ) {
        invalidField(context, 'buffMultiplierMax', 'must be a positive number');
      }
      if (
        buffFlatBonusMax !== undefined &&
        buffFlatBonusMax <= 0
      ) {
        invalidField(context, 'buffFlatBonusMax', 'must be a positive number');
      }
      const maxBuffAtHpRatio = requireNumber(obj, 'maxBuffAtHpRatio', context);
      if (maxBuffAtHpRatio < 0 || maxBuffAtHpRatio >= 1) {
        invalidField(
          context,
          'maxBuffAtHpRatio',
          'must be between 0 and 1 (exclusive of 1)',
        );
      }
      return {
        ...base,
        buffStat,
        maxBuffAtHpRatio,
        ...(buffMultiplierMax !== undefined ? { buffMultiplierMax } : {}),
        ...(buffFlatBonusMax !== undefined ? { buffFlatBonusMax } : {}),
      };
    }
    case 'skillAmountOverride': {
      const targetSkillId = requireString(obj, 'targetSkillId', context);
      const amount = parseResourceAmountSpec(
        obj.amount,
        `${context}.amount`,
      );
      const effectIndexRaw = parseOptionalNumber(obj, 'effectIndex', context);
      if (
        effectIndexRaw !== undefined &&
        (!Number.isInteger(effectIndexRaw) || effectIndexRaw < 0)
      ) {
        invalidField(context, 'effectIndex', 'must be a non-negative integer');
      }
      const passiveAmountFieldRaw = obj.passiveAmountField;
      let passiveAmountField: PassiveSkillDef['passiveAmountField'];
      if (passiveAmountFieldRaw !== undefined) {
        if (
          passiveAmountFieldRaw !== 'hotAmount' &&
          passiveAmountFieldRaw !== 'barrierAmount'
        ) {
          invalidField(
            context,
            'passiveAmountField',
            'must be hotAmount or barrierAmount',
          );
        }
        passiveAmountField = passiveAmountFieldRaw;
      }
      if (effectIndexRaw !== undefined && passiveAmountField !== undefined) {
        invalidField(
          context,
          'effectIndex',
          'cannot be used with passiveAmountField',
        );
      }
      return {
        ...base,
        targetSkillId,
        amount,
        ...(effectIndexRaw !== undefined ? { effectIndex: effectIndexRaw } : {}),
        ...(passiveAmountField !== undefined ? { passiveAmountField } : {}),
      };
    }
    case 'skillPropertyOverride': {
      const maxChargesBonus = requireNumber(obj, 'maxChargesBonus', context);
      if (!Number.isInteger(maxChargesBonus) || maxChargesBonus < 1) {
        invalidField(
          context,
          'maxChargesBonus',
          'must be a positive integer',
        );
      }
      const targetIdsRaw = obj.skillPropertyTargetSkillIds;
      const skillPropertyTargetSkillIds =
        targetIdsRaw === undefined
          ? undefined
          : requireStringArray(
              obj,
              'skillPropertyTargetSkillIds',
              context,
            );
      return {
        ...base,
        maxChargesBonus,
        ...(skillPropertyTargetSkillIds !== undefined
          ? { skillPropertyTargetSkillIds }
          : {}),
      };
    }
    default:
      invalidField(context, 'effect', `unsupported passive effect ${effect}`);
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

function parseEntityTraits(
  raw: unknown,
  context: string,
): EntityTraits {
  if (raw === undefined) return {};
  const obj = requireRecord(raw, context);
  if (obj.attackRange !== undefined) {
    invalidField(context, 'attackRange', 'removed; use rangePx instead');
  }
  const traits: EntityTraits = {};
  const rangePx = parseOptionalNumber(obj, 'rangePx', context);
  if (rangePx !== undefined) {
    if (rangePx < 0) {
      invalidField(context, 'rangePx', 'must be a non-negative number');
    }
    if (rangePx > CONFIGURABLE_RANGE_PX_MAX) {
      invalidField(
        context,
        'rangePx',
        `must be at most ${CONFIGURABLE_RANGE_PX_MAX}`,
      );
    }
    traits.rangePx = rangePx;
  }
  const damageTypeRaw = obj.damageType;
  if (damageTypeRaw !== undefined) {
    traits.damageType = requireEnum(
      obj,
      'damageType',
      context,
      DAMAGE_TYPES_SET,
    );
  }
  const basicAttackVfx = parseSkillVfx(obj.basicAttackVfx, `${context}.basicAttackVfx`);
  if (basicAttackVfx !== undefined) {
    traits.basicAttackVfx = basicAttackVfx;
  }
  const stationary = parseOptionalBoolean(obj, 'stationary', context);
  if (stationary !== undefined) {
    traits.stationary = stationary;
  }
  return traits;
}

function defaultAttackSpeedTierForRole(role: Role): AttackSpeedTier {
  switch (role) {
    case 'defender':
      return 'somewhatSlow';
    case 'supporter':
      return 'slow';
    default:
      return 'normal';
  }
}

function isBasicAttackSkillId(skillId: string, entityIds: Set<string>): boolean {
  for (const entityId of entityIds) {
    if (skillId === defaultBasicAttackId(entityId)) return true;
  }
  return false;
}

/** damage effect から廃止 threatBurst* を除去（エディタ保存用） */
export function stripDeprecatedThreatFieldsFromEffect(
  effect: SkillEffectDef,
): SkillEffectDef {
  if (effect.type !== 'damage') return effect;
  const next = { ...effect };
  for (const key of DEPRECATED_THREAT_DAMAGE_FIELD_KEYS) {
    delete (next as Record<string, unknown>)[key];
  }
  return next;
}

/** 通常攻撃 JSON から traits 由来のフィールドを除去（エディタ保存・ロード用） */
export function stripBasicAttackTraitFieldsFromEffect(
  effect: SkillEffectDef,
): SkillEffectDef {
  const next = stripDeprecatedThreatFieldsFromEffect(effect);
  delete (next as { damageType?: unknown }).damageType;
  delete (next as { range?: unknown }).range;
  delete (next as { vfx?: unknown }).vfx;
  return next;
}

export function sanitizeBasicAttackSkillForJson(
  skill: ActiveSkillDef,
): ActiveSkillDef {
  const { vfx: _vfx, ...rest } = skill;
  return {
    ...rest,
    effect: skill.effect.map(stripBasicAttackTraitFieldsFromEffect),
  };
}

/** パッシブ JSON から effect 種別に無関係なフィールドを除去（エディタ保存用） */
export function sanitizePassiveSkillForJson(
  passive: PassiveSkillDef,
): PassiveSkillDef {
  return requirePassiveEffectParams(
    passive as unknown as Record<string, unknown>,
    passive.effect,
    `passiveSkill(${passive.id})`,
  );
}

function validateBasicAttackJsonOverride(
  skill: ActiveSkillDef,
  context: string,
): void {
  if (skill.vfx !== undefined) {
    invalidField(context, 'vfx', 'basic attack VFX must be set on entity traits');
  }
  skill.effect.forEach((effect, effectIndex) => {
    const effectContext = `${context}.effect[${effectIndex}]`;
    if (effect.vfx !== undefined) {
      invalidField(
        effectContext,
        'vfx',
        'basic attack VFX must be set on entity traits',
      );
    }
    if (effect.type === 'move') return;
    if (effect.range !== undefined) {
      invalidField(
        effectContext,
        'range',
        'basic attack range must be set on entity traits',
      );
    }
    if ('damageType' in effect && effect.damageType !== undefined) {
      invalidField(
        effectContext,
        'damageType',
        'basic attack damageType must be set on entity traits',
      );
    }
  });
}

function injectSynthesizedCombatModuleSkills(
  combatModules: CombatModuleDef[],
  activesById: Map<string, ActiveSkillDef>,
): void {
  for (const module of combatModules) {
    activesById.set(module.id, synthesizeCombatModuleSkill(module));
  }
}

function injectSynthesizedBasicAttacks(
  classes: ClassPresetBeforeEnrich[],
  enemies: EnemyTemplate[],
  activesById: Map<string, ActiveSkillDef>,
): void {
  for (const cls of classes) {
    const traits = normalizeEntityTraits(cls.traits);
    const basicId = cls.basicAttackSkillId;
    const jsonOverride = activesById.get(basicId);
    activesById.set(
      basicId,
      synthesizeBasicAttackSkill({
        entityId: cls.id,
        isEnemy: false,
        traits,
        attackSpeedTier:
          cls.attackSpeedTier ?? defaultAttackSpeedTierForRole(cls.role),
        displayName: cls.displayName,
        jsonOverride,
      }),
    );
  }
  for (const enemy of enemies) {
    const basicId = enemy.basicAttackSkillId;
    const ownedBasicId = defaultBasicAttackId(enemy.id);
    // Enemies may reference a class (or other entity) basic attack by ID.
    // Re-synthesizing with enemy.id would replace the map entry with a mismatched skill.id.
    if (basicId !== ownedBasicId) {
      continue;
    }
    const traits = normalizeEntityTraits(enemy.traits);
    const jsonOverride = activesById.get(basicId);
    activesById.set(
      basicId,
      synthesizeBasicAttackSkill({
        entityId: enemy.id,
        isEnemy: true,
        traits,
        attackSpeedTier: enemy.attackSpeedTier ?? 'normal',
        displayName: enemy.displayName,
        jsonOverride,
      }),
    );
  }
}

function parseClassSummary(
  raw: unknown,
  context: string,
): ClassLocaleText | undefined {
  if (raw === undefined) return undefined;
  const obj = requireRecord(raw, `${context}.summary`);
  const ja = requireString(obj, 'ja', `${context}.summary`);
  const en =
    obj.en === undefined
      ? undefined
      : requireString(obj, 'en', `${context}.summary.en`);
  return { ja, ...(en !== undefined ? { en } : {}) };
}

function parseClassFeatureTags(
  raw: unknown,
  context: string,
): ClassFeatureTags | undefined {
  if (raw === undefined) return undefined;
  const obj = requireRecord(raw, context);
  const ja = requireStringArray(obj, 'ja', `${context}.ja`, 1);
  const en =
    obj.en === undefined
      ? undefined
      : requireStringArray(obj, 'en', `${context}.en`, 1);
  return { ja, ...(en !== undefined ? { en } : {}) };
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
    if (obj.summary === undefined) {
      missingField(context, 'summary');
    }
    const summary = parseClassSummary(obj.summary, context);
    const featureTags = parseClassFeatureTags(obj.featureTags, `${context}.featureTags`);
    const traitsRaw = parseEntityTraits(obj.traits, `${context}.traits`);
    const formationRow =
      obj.formationRow === undefined
        ? resolveClassFormationRow(role)
        : requireEnum(obj, 'formationRow', context, FORMATION_ROWS_SET);
    const maxHp = requireNumber(obj, 'maxHp', context);
    const atk = requireNumber(obj, 'atk', context);
    const def = requireNumber(obj, 'def', context);
    const res = requireNumber(obj, 'res', context);
    requireRes(res, context);
    const basicAttackSkillId =
      obj.basicAttackSkillId === undefined
        ? defaultBasicAttackId(id)
        : requireString(obj, 'basicAttackSkillId', context);
    if (obj.spriteKey !== undefined) {
      invalidField(
        context,
        'spriteKey',
        'removed; use sprites/{id}.png or sheets/{id}/',
      );
    }
    if (obj.iconKey !== undefined) {
      invalidField(
        context,
        'iconKey',
        'removed; use class-icons/{id}.png',
      );
    }
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
    const combatModuleIds = parseCombatModuleIds(obj, context);
    if (jobTier === 1 && growthTier === undefined) {
      missingField(context, 'growthTier');
    }

    return {
      id,
      role,
      displayName,
      ...(epithetEn !== undefined ? { epithetEn } : {}),
      summary,
      ...(featureTags !== undefined ? { featureTags } : {}),
      formationRow,
      traits: traitsRaw,
      maxHp,
      atk,
      def,
      res,
      basicAttackSkillId,
      ...(passiveIds.length > 0 ? { passiveIds } : {}),
      skills,
      ...(jobTier !== undefined ? { jobTier } : {}),
      ...(promotion !== undefined ? { promotion } : {}),
      ...(promotesFrom !== undefined ? { promotesFrom } : {}),
      ...(attackSpeedTier !== undefined ? { attackSpeedTier } : {}),
      ...(growthTier !== undefined ? { growthTier } : {}),
      ...(growthPresetKey !== undefined ? { growthPresetKey } : {}),
      ...(combatModuleIds !== undefined ? { combatModuleIds } : {}),
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
    const effectRaw = requireString(obj, 'effect', context);
    const normalizedEffect =
      LEGACY_PASSIVE_EFFECT_ALIASES[effectRaw] ?? effectRaw;
    const effectObj: Record<string, unknown> = {
      ...obj,
      effect: normalizedEffect,
    };

    if (REMOVED_PASSIVE_EFFECTS.has(normalizedEffect)) {
      const migrationHint =
        normalizedEffect === DEPRECATED_THREAT_PASSIVE_EFFECT
          ? `${effectRaw} was removed; migrate ally DR to passive damageReduction (see combat.md)`
          : `${effectRaw} was removed; migrate to specialEffect/buff/debuff/counter as needed`;
      invalidField(context, 'effect', migrationHint);
    }

    rejectDeprecatedThreatPassiveFields(effectObj, context);

    normalizeLegacyPassivePeriodicFields(effectObj);

    if (effectRaw !== normalizedEffect) {
      if (effectRaw === 'evasionChance') {
        effectObj.buffSubKind = 'evasion';
        effectObj.chance = obj.evasionChance;
      } else if (effectRaw === 'block') {
        effectObj.buffSubKind = 'block';
        effectObj.chance = obj.blockChance;
        effectObj.buffTargetRule =
          obj.targetRuleOverride ?? obj.targetRule ?? obj.target;
      } else if (effectRaw === 'counterChance') {
        effectObj.chance = obj.counterChance;
      } else if (effectRaw === 'damageIncrease') {
        effectObj.specialEffectApplyTo = 'damage';
        effectObj.specialEffect = obj.damageIncrease;
      } else if (effectRaw === 'healReceivedIncrease') {
        const percent = requireNumber(obj, 'percent', context);
        effectObj.specialEffectApplyTo = 'heal';
        effectObj.specialEffect = {
          scale: 1 + percent,
          conditions: [{ kind: 'targetHp', maxHpRatio: 1 }],
        };
      } else if (
        effectRaw === 'hot' ||
        effectRaw === 'partyHotAura' ||
        normalizedEffect === 'heal'
      ) {
        effectObj.healSubKind = obj.healSubKind ?? 'hot';
      }
    }

    const effect = requireEnum(
      effectObj,
      'effect',
      context,
      PASSIVE_EFFECTS,
    );
    return requirePassiveEffectParams(effectObj, effect, context);
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

  if (triggerRaw === undefined) {
    missingField(context, 'trigger');
  }
  throw new Error('unreachable');
}

function validateTriggerValue(
  kind: SkillTriggerKind,
  value: number,
  context: string,
): void {
  if (kind === 'time') {
    if (value < 0) {
      invalidField(context, 'value', 'must be >= 0 for time trigger');
    }
    return;
  }
  if (!Number.isInteger(value) || value < 1) {
    invalidField(context, 'value', 'must be an integer >= 1 for count triggers');
  }
}

function validateNoChargeTimeTriggerActive(
  trigger: SkillTrigger,
  firePolicy: FirePolicy | undefined,
  fireConditions: FireCondition[] | undefined,
  stageTriggerLimit: number | undefined,
  context: string,
): void {
  if (trigger.kind !== 'time' || trigger.value !== 0) return;
  const hasFireGate =
    firePolicy === 'smart' &&
    ((fireConditions?.length ?? 0) > 0 || stageTriggerLimit !== undefined);
  if (!hasFireGate) {
    invalidField(
      context,
      'trigger.value',
      'time trigger value 0 requires smart firePolicy and fireConditions or stageTriggerLimit',
    );
  }
}

function parseOptionalUseDurationSec(
  obj: Record<string, unknown>,
  context: string,
): number | undefined {
  const value = parseOptionalNonNegativeNumber(obj, 'useDurationSec', context);
  if (value === undefined || value === 0) return undefined;
  return value;
}

function validateEffectTargetPoolReference(
  effect: SkillEffectDef,
  effectIndex: number,
  context: string,
): void {
  if (effect.type === 'conditionalEffect') {
    effect.thenEffects.forEach((branch, branchIndex) => {
      validateEffectTargetPoolReference(
        branch,
        effectIndex,
        `${context}.thenEffects[${branchIndex}]`,
      );
    });
    effect.elseEffects.forEach((branch, branchIndex) => {
      validateEffectTargetPoolReference(
        branch,
        effectIndex,
        `${context}.elseEffects[${branchIndex}]`,
      );
    });
    return;
  }
  const target = effect.target;
  if (target?.kind === 'stat' && target.poolFromEffectIndex !== undefined) {
    if (target.poolFromEffectIndex >= effectIndex) {
      invalidField(
        context,
        'target.poolFromEffectIndex',
        'must refer to a prior effect index',
      );
    }
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
    const sharedTargeting = parseSkillSharedTargetingFields(obj, context);

    const effectsRaw = obj.effect;
    if (!Array.isArray(effectsRaw) || effectsRaw.length === 0) {
      invalidField(context, 'effect', 'must be a non-empty array');
    }
    const effect = (effectsRaw as unknown[]).map((entry, effectIndex) =>
      parseSkillEffect(entry, `${context}.effect[${effectIndex}]`),
    );
    effect.forEach((entry, effectIndex) => {
      validateEffectTargetPoolReference(
        entry,
        effectIndex,
        `${context}.effect[${effectIndex}]`,
      );
    });

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
    const useDurationSec = parseOptionalUseDurationSec(obj, context);
    const useDurationPauseApproach =
      useDurationSec !== undefined && useDurationSec > 0
        ? parseOptionalBoolean(obj, 'useDurationPauseApproach', context)
        : undefined;
    const firePolicyRaw = obj.firePolicy;
    let firePolicy: FirePolicy | undefined;
    if (firePolicyRaw !== undefined) {
      if (firePolicyRaw !== 'immediate' && firePolicyRaw !== 'smart') {
        invalidField(context, 'firePolicy', 'must be immediate or smart');
      }
      firePolicy = firePolicyRaw;
    }
    const fireConditions = parseFireConditions(obj.fireConditions, `${context}.fireConditions`);
    const fireConditionMatchRaw = obj.fireConditionMatch;
    let fireConditionMatch: 'all' | 'any' | undefined;
    if (fireConditionMatchRaw !== undefined) {
      if (fireConditionMatchRaw !== 'all' && fireConditionMatchRaw !== 'any') {
        invalidField(context, 'fireConditionMatch', 'must be all or any');
      }
      fireConditionMatch = fireConditionMatchRaw;
    }
    const fireTimeoutSec = parseOptionalNonNegativeNumber(
      obj,
      'fireTimeoutSec',
      context,
    );
    const maxChargesRaw = parseOptionalNumber(obj, 'maxCharges', context);
    let maxCharges: number | undefined;
    if (maxChargesRaw !== undefined) {
      if (
        !Number.isInteger(maxChargesRaw) ||
        maxChargesRaw < 0 ||
        maxChargesRaw > GLOBAL_MAX_CHARGES_CAP
      ) {
        invalidField(
          context,
          'maxCharges',
          `must be an integer from 0 to ${GLOBAL_MAX_CHARGES_CAP}`,
        );
      }
      if (maxChargesRaw > 0) {
        maxCharges = maxChargesRaw;
      }
    }
    const blockResonanceStanceDurationBaseSec = parseOptionalNonNegativeNumber(
      obj,
      'blockResonanceStanceDurationBaseSec',
      context,
    );
    const blockResonanceStanceDamageTakenPerStack = parseOptionalNonNegativeNumber(
      obj,
      'blockResonanceStanceDamageTakenPerStack',
      context,
    );
    const blockResonanceStanceDefPerStack = parseOptionalNonNegativeNumber(
      obj,
      'blockResonanceStanceDefPerStack',
      context,
    );
    const blockResonanceStanceBlockPerStack = parseOptionalNonNegativeNumber(
      obj,
      'blockResonanceStanceBlockPerStack',
      context,
    );
    const blockResonanceOnBlockDamage = obj.blockResonanceOnBlockDamage;
    let parsedBlockResonanceOnBlockDamage:
      | import('../types.ts').ResourceAmountSpec
      | undefined;
    if (blockResonanceOnBlockDamage !== undefined) {
      parsedBlockResonanceOnBlockDamage = parseResourceAmountSpec(
        blockResonanceOnBlockDamage,
        `${context}.blockResonanceOnBlockDamage`,
      );
    }
    const blockResonanceOnBlockKnockbackRadiusPx = parseOptionalNonNegativeNumber(
      obj,
      'blockResonanceOnBlockKnockbackRadiusPx',
      context,
    );
    const blockResonanceOnBlockKnockbackDistancePx = parseOptionalNonNegativeNumber(
      obj,
      'blockResonanceOnBlockKnockbackDistancePx',
      context,
    );
    if (firePolicy === 'smart' && !fireConditions?.length) {
      invalidField(
        context,
        'fireConditions',
        'required when firePolicy is smart',
      );
    }
    const stageTriggerLimit = parseOptionalNonNegativeNumber(
      obj,
      'stageTriggerLimit',
      context,
    );
    const arenaDominanceDurationSec = parseOptionalNonNegativeNumber(
      obj,
      'arenaDominanceDurationSec',
      context,
    );
    const arenaDominanceNonMarkDamageMultiplier = parseOptionalNumber(
      obj,
      'arenaDominanceNonMarkDamageMultiplier',
      context,
    );
    const attackMethod = parseOptionalAttackMethod(obj, context);

    validateNoChargeTimeTriggerActive(
      trigger,
      firePolicy,
      fireConditions,
      stageTriggerLimit,
      context,
    );

    const skill: ActiveSkillDef = {
      id,
      name,
      trigger,
      effect,
      ...sharedTargeting,
      ...(Array.isArray(allowedClassIds)
        ? { allowedClassIds: allowedClassIds as string[] }
        : {}),
      ...(vfx !== undefined ? { vfx } : {}),
      ...(iconKey !== undefined ? { iconKey } : {}),
      ...(useDurationSec !== undefined ? { useDurationSec } : {}),
      ...(useDurationPauseApproach === true
        ? { useDurationPauseApproach: true }
        : {}),
      ...(firePolicy !== undefined ? { firePolicy } : {}),
      ...(fireConditions !== undefined ? { fireConditions } : {}),
      ...(fireConditionMatch !== undefined ? { fireConditionMatch } : {}),
      ...(fireTimeoutSec !== undefined ? { fireTimeoutSec } : {}),
      ...(maxCharges !== undefined ? { maxCharges } : {}),
      ...(blockResonanceStanceDurationBaseSec !== undefined
        ? { blockResonanceStanceDurationBaseSec }
        : {}),
      ...(blockResonanceStanceDamageTakenPerStack !== undefined
        ? { blockResonanceStanceDamageTakenPerStack }
        : {}),
      ...(blockResonanceStanceDefPerStack !== undefined
        ? { blockResonanceStanceDefPerStack }
        : {}),
      ...(blockResonanceStanceBlockPerStack !== undefined
        ? { blockResonanceStanceBlockPerStack }
        : {}),
      ...(parsedBlockResonanceOnBlockDamage !== undefined
        ? { blockResonanceOnBlockDamage: parsedBlockResonanceOnBlockDamage }
        : {}),
      ...(blockResonanceOnBlockKnockbackRadiusPx !== undefined
        ? { blockResonanceOnBlockKnockbackRadiusPx }
        : {}),
      ...(blockResonanceOnBlockKnockbackDistancePx !== undefined
        ? { blockResonanceOnBlockKnockbackDistancePx }
        : {}),
      ...(stageTriggerLimit !== undefined ? { stageTriggerLimit } : {}),
      ...(arenaDominanceDurationSec !== undefined
        ? { arenaDominanceDurationSec }
        : {}),
      ...(arenaDominanceNonMarkDamageMultiplier !== undefined
        ? { arenaDominanceNonMarkDamageMultiplier }
        : {}),
      ...(attackMethod !== undefined ? { attackMethod } : {}),
    };
    validateActiveSkillEffectTargeting(skill, context);
    return skill;
  });
}

type EnemyTemplateParsed = Omit<EnemyTemplate, 'traits'> & {
  traits: EntityTraits;
};

function parseEnemies(raw: unknown): EnemyTemplateParsed[] {
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
    const res = requireNumber(obj, 'res', context);
    requireRes(res, context);
    const exp = requireNumber(obj, 'exp', context);
    if (exp < 0) {
      invalidField(context, 'exp', 'must be >= 0');
    }
    if (obj.spriteKey !== undefined) {
      invalidField(
        context,
        'spriteKey',
        'removed; use sprites/{id}.png or sheets/{id}/',
      );
    }
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
    if (obj.attackRange !== undefined) {
      invalidField(context, 'attackRange', 'removed; use traits.rangePx instead');
    }
    if (obj.rangePx !== undefined) {
      invalidField(context, 'rangePx', 'removed; use traits.rangePx instead');
    }
    const traitsRaw = parseEntityTraits(obj.traits, `${context}.traits`);

    return {
      id,
      displayName,
      maxHp,
      atk,
      def,
      res,
      exp,
      basicAttackSkillId,
      traits: traitsRaw,
      ...(attackSpeedTier !== undefined ? { attackSpeedTier } : {}),
      ...(passiveSkillIds !== undefined ? { passiveSkillIds } : {}),
      ...(activeSkillIds !== undefined ? { activeSkillIds } : {}),
    };
  });
}

function parseStageEnemyScale(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): number {
  const scale = parseOptionalNumber(obj, key, context) ?? 1;
  if (scale <= 0) {
    invalidField(context, key, 'must be a positive number');
  }
  return scale;
}

function parseOptionalNonEmptyString(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): string | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    invalidField(context, key, 'must be a non-empty string');
  }
  return value;
}

function parseStageEnemyGroup(entry: unknown, context: string): StageEnemyGroup {
  const obj = requireRecord(entry, context);
  const classId = requireString(obj, 'classId', context);
  const count = requireNumber(obj, 'count', context);
  if (!Number.isInteger(count) || count < 1) {
    invalidField(context, 'count', 'must be a positive integer');
  }
  const hpScale = parseStageEnemyScale(obj, 'hpScale', context);
  const atkScale = parseStageEnemyScale(obj, 'atkScale', context);
  const defScale = parseStageEnemyScale(obj, 'defScale', context);
  const resScale = parseStageEnemyScale(obj, 'resScale', context);
  const selectedCombatModuleId = parseOptionalNonEmptyString(
    obj,
    'selectedCombatModuleId',
    context,
  );
  return {
    classId,
    count,
    ...(hpScale !== 1 ? { hpScale } : {}),
    ...(atkScale !== 1 ? { atkScale } : {}),
    ...(defScale !== 1 ? { defScale } : {}),
    ...(resScale !== 1 ? { resScale } : {}),
    ...(selectedCombatModuleId !== undefined ? { selectedCombatModuleId } : {}),
  };
}

function parseOptionalStageEnemyGroups(
  obj: Record<string, unknown>,
  context: string,
): StageEnemyGroup[] | undefined {
  const enemyGroupsRaw = obj.enemyGroups;
  if (enemyGroupsRaw === undefined) return undefined;
  if (!Array.isArray(enemyGroupsRaw) || enemyGroupsRaw.length === 0) {
    invalidField(context, 'enemyGroups', 'must be a non-empty array');
  }
  return (enemyGroupsRaw as unknown[]).map((groupEntry, groupIndex) =>
    parseStageEnemyGroup(groupEntry, `${context}.enemyGroups[${groupIndex}]`),
  );
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

    const enemyGroups = parseOptionalStageEnemyGroups(obj, context);

    const recommendedLevelRaw = obj.recommendedLevel;
    let recommendedLevel: number | undefined;
    if (recommendedLevelRaw !== undefined) {
      if (
        typeof recommendedLevelRaw !== 'number' ||
        Number.isNaN(recommendedLevelRaw) ||
        !Number.isInteger(recommendedLevelRaw) ||
        recommendedLevelRaw < 1
      ) {
        invalidField(context, 'recommendedLevel', 'must be a positive integer');
      }
      recommendedLevel = recommendedLevelRaw;
    }

    const unlockClassIdsOnClearRaw = obj.unlockClassIdsOnClear;
    let unlockClassIdsOnClear: string[] | undefined;
    if (unlockClassIdsOnClearRaw !== undefined) {
      const ids = requireStringArray(obj, 'unlockClassIdsOnClear', context, 1);
      unlockClassIdsOnClear = [...new Set(ids)];
    }

    const formationHintJaRaw = obj.formationHintJa;
    let formationHintJa: string | undefined;
    if (formationHintJaRaw !== undefined) {
      formationHintJa = requireString(obj, 'formationHintJa', context);
    }

    const wavesRaw = obj.waves;
    if (!Array.isArray(wavesRaw) || wavesRaw.length === 0) {
      invalidField(context, 'waves', 'must be a non-empty array');
    }

    const waves = (wavesRaw as unknown[]).map((waveEntry, waveIndex) => {
      const waveContext = `${context}.waves[${waveIndex}]`;
      const waveObj = requireRecord(waveEntry, waveContext);
      const waveEnemyGroups = parseOptionalStageEnemyGroups(waveObj, waveContext);
      const enemiesRaw = waveObj.enemies;
      if (!Array.isArray(enemiesRaw)) {
        invalidField(waveContext, 'enemies', 'must be an array');
      }
      if (
        enemiesRaw.length === 0 &&
        enemyGroups === undefined &&
        waveEnemyGroups === undefined
      ) {
        invalidField(waveContext, 'enemies', 'must be a non-empty array');
      }

      const enemies = (enemiesRaw as unknown[]).map((enemyEntry, enemyIndex) => {
        const enemyContext = `${waveContext}.enemies[${enemyIndex}]`;
        const enemyObj = requireRecord(enemyEntry, enemyContext);
        const rawSpawnX = requireNumber(enemyObj, 'spawnX', enemyContext);
        if (rawSpawnX < 0 || rawSpawnX > 240) {
          invalidField(
            enemyContext,
            'spawnX',
            'must be between 0 and 240 (offset right from screen center)',
          );
        }
        return {
          templateId: requireString(enemyObj, 'templateId', enemyContext),
          spawnX: rawSpawnX,
        };
      });

      return {
        enemies,
        ...(waveEnemyGroups !== undefined ? { enemyGroups: waveEnemyGroups } : {}),
      };
    });

    const anyWaveHasEnemyGroups = waves.some((wave) => wave.enemyGroups !== undefined);
    if (
      (enemyGroups !== undefined || anyWaveHasEnemyGroups) &&
      recommendedLevel === undefined
    ) {
      invalidField(
        context,
        'recommendedLevel',
        'is required when enemyGroups is set',
      );
    }

    return {
      id,
      displayName,
      waves,
      ...(recommendedLevel !== undefined ? { recommendedLevel } : {}),
      ...(enemyGroups !== undefined ? { enemyGroups } : {}),
      ...(unlockClassIdsOnClear !== undefined ? { unlockClassIdsOnClear } : {}),
      ...(formationHintJa !== undefined ? { formationHintJa } : {}),
    };
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

function validateCombatModuleData(
  combatModules: CombatModuleDef[],
  classById: Map<string, ClassPreset>,
): void {
  const moduleIds = new Set<string>();
  for (const module of combatModules) {
    if (moduleIds.has(module.id)) {
      throw new Error(`Duplicate combat module id "${module.id}"`);
    }
    moduleIds.add(module.id);
    if (!classById.has(module.classId)) {
      throw new Error(
        `Unknown classId "${module.classId}" for combat module "${module.id}"`,
      );
    }
  }
}

function validateClassCombatModuleRefs(
  classes: ClassPreset[],
  moduleById: Map<string, CombatModuleDef>,
): void {
  const r5ClassSet = new Set<string>(R5_COMBAT_MODULE_CLASS_IDS);

  for (const cls of classes) {
    const refs = cls.combatModuleIds;
    if (refs === undefined) {
      if (r5ClassSet.has(cls.id)) {
        throw new Error(`R5 class "${cls.id}" must define combatModuleIds`);
      }
      continue;
    }

    if (refs.length !== 2) {
      throw new Error(
        `combatModuleIds must contain exactly 2 entries: ${cls.id}`,
      );
    }
    if (new Set(refs).size !== refs.length) {
      throw new Error(`combatModuleIds must not duplicate module ids: ${cls.id}`);
    }

    for (const moduleId of refs) {
      const module = moduleById.get(moduleId);
      if (!module) {
        throw new Error(
          `Unknown combatModuleId "${moduleId}" referenced by class "${cls.id}"`,
        );
      }
      if (module.classId !== cls.id) {
        throw new Error(
          `combat module "${moduleId}" belongs to class "${module.classId}", not "${cls.id}"`,
        );
      }
    }
  }
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
  combatModules: CombatModuleDef[],
  operationPassiveCatalog: OperationPassiveCatalogDef,
  mode: GameDataValidationMode,
): void {
  const passiveIds = new Set(passives.map((p) => p.id));
  const activeIds = new Set(actives.map((a) => a.id));
  const enemyIds = new Set(enemies.map((e) => e.id));
  const passiveById = new Map(passives.map((p) => [p.id, p] as const));
  const activeById = new Map(actives.map((a) => [a.id, a] as const));

  for (const passive of passives) {
    if (passive.effect !== 'skillAmountOverride') continue;
    const ctx = `passive skillAmountOverride id=${passive.id}`;
    const targetId = passive.targetSkillId;
    if (!targetId) {
      throw new Error(`Missing targetSkillId: ${ctx}`);
    }
    const active = activeById.get(targetId);
    const targetPassive = passiveById.get(targetId);
    if (!active && !targetPassive) {
      throw new Error(`Unknown targetSkillId "${targetId}": ${ctx}`);
    }
    if (active) {
      if (passive.passiveAmountField !== undefined) {
        throw new Error(
          `passiveAmountField is not allowed for active target: ${ctx}`,
        );
      }
      if (passive.effectIndex !== undefined) {
        const effect = active.effect[passive.effectIndex];
        if (!effect || !activeEffectHasAmount(effect)) {
          throw new Error(
            `effect[${passive.effectIndex}] is not amount-bearing: ${ctx}`,
          );
        }
      } else if (!active.effect.some((effect) => activeEffectHasAmount(effect))) {
        throw new Error(`active has no amount-bearing effects: ${ctx}`);
      }
    } else if (targetPassive) {
      if (passive.effectIndex !== undefined) {
        throw new Error(`effectIndex is not allowed for passive target: ${ctx}`);
      }
      const field =
        passive.passiveAmountField ?? inferPassiveAmountField(targetPassive);
      if (!field) {
        throw new Error(`passive target has no amount field: ${ctx}`);
      }
    }
  }

  const classById = new Map(classes.map((cls) => [cls.id, cls] as const));
  const moduleById = new Map(combatModules.map((module) => [module.id, module] as const));

  validateCombatModuleData(combatModules, classById);
  validateClassCombatModuleRefs(classes, moduleById);
  validateOperationPassiveCatalogRefs(
    operationPassiveCatalog,
    classById,
    passiveIds,
  );

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
    const classPassiveIds = new Set(cls.passiveIds ?? cls.starterPassiveIds);
    for (const skillId of getClassSkillIds(cls.skills)) {
      if (passiveIds.has(skillId)) {
        if (!classPassiveIds.has(skillId)) {
          throw new Error(
            `passive "${skillId}" in skills[] must also be listed in passiveIds: ${cls.id}`,
          );
        }
        continue;
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

  const entityIds = new Set([
    ...classes.map((cls) => cls.id),
    ...enemies.map((enemy) => enemy.id),
  ]);
  for (let i = 0; i < actives.length; i++) {
    const skill = actives[i]!;
    if (!isBasicAttackSkillId(skill.id, entityIds)) continue;
    actives[i] = sanitizeBasicAttackSkillForJson(skill);
    validateBasicAttackJsonOverride(actives[i]!, `actives id=${skill.id}`);
  }

  for (const stage of stages) {
    const validateEnemyGroupRefs = (
      groups: StageEnemyGroup[],
      contextPrefix: string,
    ) => {
      groups.forEach((group, groupIndex) => {
        const groupContext = `${contextPrefix}[${groupIndex}]`;
        const cls = classById.get(group.classId);
        if (!cls) {
          throw new Error(
            `Unknown classId "${group.classId}": ${groupContext}`,
          );
        }
        const selectedId = group.selectedCombatModuleId;
        if (selectedId === undefined) return;

        const moduleIds = cls.combatModuleIds;
        if (!moduleIds || moduleIds.length === 0) {
          throw new Error(
            `selectedCombatModuleId is not allowed for legacy class "${group.classId}": ${groupContext}`,
          );
        }
        const module = moduleById.get(selectedId);
        if (!module) {
          throw new Error(
            `Unknown selectedCombatModuleId "${selectedId}": ${groupContext}`,
          );
        }
        if (module.classId !== group.classId) {
          throw new Error(
            `selectedCombatModuleId "${selectedId}" belongs to class "${module.classId}", not "${group.classId}": ${groupContext}`,
          );
        }
        if (!moduleIds.includes(selectedId)) {
          throw new Error(
            `selectedCombatModuleId "${selectedId}" is not listed in combatModuleIds for class "${group.classId}": ${groupContext}`,
          );
        }
      });
    };

    if (stage.enemyGroups !== undefined) {
      validateEnemyGroupRefs(stage.enemyGroups, `${stage.id} enemyGroups`);
    }
    stage.unlockClassIdsOnClear?.forEach((classId, index) => {
      if (!classById.has(classId)) {
        throw new Error(
          `Unknown classId "${classId}": ${stage.id} unlockClassIdsOnClear[${index}]`,
        );
      }
    });
    stage.waves.forEach((wave, waveIndex) => {
      if (wave.enemyGroups !== undefined) {
        validateEnemyGroupRefs(
          wave.enemyGroups,
          `${stage.id} wave[${waveIndex}].enemyGroups`,
        );
      }
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
  combatModules: CombatModuleDef[];
  enemies: EnemyTemplate[];
  stages: StageDef[];
  parties: Record<string, PartyDef>;
  operationPassiveCatalog: OperationPassiveCatalogDef;
}

const DEFAULT_OPERATION_PASSIVE_CATALOG: OperationPassiveCatalogDef = {
  passiveAcquireCost: 1,
  waveClearResourceGrant: 1,
  candidatesByClass: {},
};

function parsePositiveIntegerField(
  record: Record<string, unknown>,
  field: string,
  context: string,
): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(
      `${context}: ${field} must be a positive integer, got ${String(value)}`,
    );
  }
  return value;
}

function parseNonNegativeIntegerField(
  record: Record<string, unknown>,
  field: string,
  context: string,
): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(
      `${context}: ${field} must be a non-negative integer, got ${String(value)}`,
    );
  }
  return value;
}

export function parseOperationPassiveCatalog(
  raw: unknown,
): OperationPassiveCatalogDef {
  if (raw === undefined || raw === null) {
    return structuredClone(DEFAULT_OPERATION_PASSIVE_CATALOG);
  }

  const record = requireRecord(raw, 'operation-passive-catalog.json');
  const context = 'operation-passive-catalog.json';
  const passiveAcquireCost = parsePositiveIntegerField(
    record,
    'passiveAcquireCost',
    context,
  );
  const waveClearResourceGrant = parseNonNegativeIntegerField(
    record,
    'waveClearResourceGrant',
    context,
  );

  const candidatesRaw = record.candidatesByClass;
  if (candidatesRaw === undefined) {
    return {
      passiveAcquireCost,
      waveClearResourceGrant,
      candidatesByClass: {},
    };
  }

  const candidatesRecord = requireRecord(
    candidatesRaw,
    `${context}.candidatesByClass`,
  );
  const candidatesByClass: OperationPassiveCatalogDef['candidatesByClass'] = {};

  for (const [classId, passiveIdsRaw] of Object.entries(candidatesRecord)) {
    if (!classId.trim()) {
      throw new Error(`${context}.candidatesByClass: empty classId key`);
    }
    if (!Array.isArray(passiveIdsRaw)) {
      throw new Error(
        `${context}.candidatesByClass["${classId}"] must be an array`,
      );
    }
    const passiveIds: string[] = [];
    const seen = new Set<string>();
    for (const passiveIdRaw of passiveIdsRaw) {
      if (typeof passiveIdRaw !== 'string' || !passiveIdRaw.trim()) {
        throw new Error(
          `${context}.candidatesByClass["${classId}"] contains invalid passive id`,
        );
      }
      const passiveId = passiveIdRaw.trim();
      if (seen.has(passiveId)) {
        throw new Error(
          `${context}.candidatesByClass["${classId}"] contains duplicate "${passiveId}"`,
        );
      }
      seen.add(passiveId);
      passiveIds.push(passiveId);
    }
    candidatesByClass[classId] = passiveIds;
  }

  return {
    passiveAcquireCost,
    waveClearResourceGrant,
    candidatesByClass,
  };
}

function validateOperationPassiveCatalogRefs(
  catalog: OperationPassiveCatalogDef,
  classById: Map<string, ClassPreset>,
  passiveIds: Set<string>,
): void {
  const context = 'operation-passive-catalog.json';
  for (const [classId, passiveIdList] of Object.entries(
    catalog.candidatesByClass,
  )) {
    if (!classById.has(classId)) {
      throw new Error(`${context}: unknown classId "${classId}"`);
    }
    for (const passiveId of passiveIdList) {
      if (!passiveIds.has(passiveId)) {
        throw new Error(
          `${context}: unknown passiveId "${passiveId}" for class "${classId}"`,
        );
      }
    }
  }
}

export function normalizeOperationPassiveCatalogForSave(
  catalog: OperationPassiveCatalogDef,
): OperationPassiveCatalogDef {
  const candidatesByClass: OperationPassiveCatalogDef['candidatesByClass'] = {};
  const classIds = Object.keys(catalog.candidatesByClass).sort();
  for (const classId of classIds) {
    const passiveIds = catalog.candidatesByClass[classId] ?? [];
    const normalized = [...new Set(passiveIds.map((id) => id.trim()).filter(Boolean))];
    if (normalized.length > 0) {
      candidatesByClass[classId] = normalized;
    }
  }
  return {
    passiveAcquireCost: catalog.passiveAcquireCost,
    waveClearResourceGrant: catalog.waveClearResourceGrant,
    candidatesByClass,
  };
}

export function parseAndValidateGameDataJson(
  raw: {
    classes: unknown;
    skills: unknown;
    combatModules?: unknown;
    enemies: unknown;
    stages: unknown;
    parties: unknown;
    operationPassiveCatalog?: unknown;
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
  const combatModules = parseCombatModules(raw.combatModules);
  const operationPassiveCatalog = parseOperationPassiveCatalog(
    raw.operationPassiveCatalog,
  );
  const passives = parsePassives(passivesRaw);
  const activesParsed = parseActives(activesRaw);
  const activesById = new Map(activesParsed.map((skill) => [skill.id, skill]));
  const enemiesRaw = parseEnemies(raw.enemies);

  const classesWithTraits = classesRaw.map((cls) => ({
    ...cls,
    traits: normalizeEntityTraits(cls.traits),
  }));
  const enemiesWithTraits = enemiesRaw.map((enemy) => ({
    ...enemy,
    traits: normalizeEntityTraits(enemy.traits),
  }));

  injectSynthesizedCombatModuleSkills(combatModules, activesById);

  injectSynthesizedBasicAttacks(
    classesWithTraits,
    enemiesWithTraits,
    activesById,
  );

  for (const [skillId, skill] of activesById) {
    if (skillId.endsWith('_basic_attack')) {
      validateAttackMethodForBasicSkill(
        skillId,
        skill.attackMethod,
        skill.effect,
        `activesById[${skillId}]`,
      );
    }
  }

  const actives = [...activesById.values()];
  const skillRegistry: SkillRegistry = {
    passives: Object.fromEntries(passives.map((skill) => [skill.id, skill])),
    actives: Object.fromEntries(actives.map((skill) => [skill.id, skill])),
  };
  const classes = classesWithTraits.map((cls) =>
    enrichClassPreset(cls, skillRegistry, { lenient: mode === 'editor' }),
  );
  const enemies = enemiesWithTraits;
  const stages = parseStages(raw.stages);
  const parties = parseParties(raw.parties);

  validateReferences(
    classes,
    passives,
    actives,
    enemies,
    stages,
    parties,
    combatModules,
    operationPassiveCatalog,
    mode,
  );

  return {
    classes,
    passives,
    actives,
    combatModules,
    enemies,
    stages,
    parties,
    operationPassiveCatalog,
  };
}
