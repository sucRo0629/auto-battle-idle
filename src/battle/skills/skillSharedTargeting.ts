import type {
  ActiveSkillDef,
  SkillEffectDef,
  SkillEffectResolution,
  SkillSharedTargetingFields as TypesSkillSharedTargetingFields,
} from '../types.ts';

/** ActiveSkillDef と effect で共有するターゲット形状フィールド */
export const SKILL_SHARED_TARGETING_KEYS = [
  'target',
  'targetRule',
  'effectRange',
  'targetShape',
  'range',
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
] as const satisfies readonly (keyof TypesSkillSharedTargetingFields)[];

export type SkillSharedTargetingFieldKey =
  (typeof SKILL_SHARED_TARGETING_KEYS)[number];

export type SkillSharedTargetingFields = Partial<
  Pick<TypesSkillSharedTargetingFields, SkillSharedTargetingFieldKey>
>;

export function hasSkillSharedTargeting(skill: ActiveSkillDef): boolean {
  const fields = skill as SkillSharedTargetingFields;
  return SKILL_SHARED_TARGETING_KEYS.some((key) => fields[key] !== undefined);
}

export function effectOverridesSkillTarget(effect: SkillEffectDef): boolean {
  return (effect as SkillSharedTargetingFields).target !== undefined;
}

export function effectInheritsSkillSharedTargeting(
  skill: ActiveSkillDef,
  effect: SkillEffectDef,
): boolean {
  return hasSkillSharedTargeting(skill) && !effectOverridesSkillTarget(effect);
}

export function mergeEffectWithSkillTargeting(
  skill: ActiveSkillDef | undefined,
  effect: SkillEffectDef,
): SkillEffectDef {
  if (!skill || !hasSkillSharedTargeting(skill)) return effect;
  const merged = { ...effect } as SkillEffectDef;
  const mergedFields = merged as SkillSharedTargetingFields;
  const skillFields = skill as SkillSharedTargetingFields;
  for (const key of SKILL_SHARED_TARGETING_KEYS) {
    if (mergedFields[key] === undefined && skillFields[key] !== undefined) {
      (mergedFields as Record<string, unknown>)[key] = skillFields[key];
    }
  }
  return merged;
}

function pickTargetingLockFields(
  effect: SkillEffectDef,
): SkillSharedTargetingFields {
  const picked: SkillSharedTargetingFields = {};
  const effectFields = effect as SkillSharedTargetingFields;
  for (const key of SKILL_SHARED_TARGETING_KEYS) {
    const value = effectFields[key];
    if (value !== undefined) {
      (picked as Record<string, unknown>)[key] = value;
    }
  }
  return picked;
}

export function computeTargetingLockKey(
  skill: ActiveSkillDef,
  effect: SkillEffectDef,
): string | null {
  if (!effectInheritsSkillSharedTargeting(skill, effect)) return null;
  return JSON.stringify(pickTargetingLockFields(mergeEffectWithSkillTargeting(skill, effect)));
}

export function ensureSharedTargetingLock(
  skill: ActiveSkillDef,
  effect: SkillEffectDef,
  resolve: () => SkillEffectResolution | null,
  locks: Map<string, SkillEffectResolution>,
): void {
  const key = computeTargetingLockKey(skill, effect);
  if (!key || locks.has(key)) return;
  const resolution = resolve();
  if (resolution) {
    locks.set(key, resolution);
  }
}
