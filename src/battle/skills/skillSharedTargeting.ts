import type {
  ActiveSkillDef,
  SkillEffectDef,
  SkillEffectResolution,
} from '../types.ts';

/** ActiveSkillDef と effect で共有するターゲット形状フィールド */
export const SKILL_SHARED_TARGETING_KEYS = [
  'target',
  'targetRule',
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
] as const satisfies readonly (keyof SkillEffectDef)[];

export type SkillSharedTargetingFieldKey =
  (typeof SKILL_SHARED_TARGETING_KEYS)[number];

export type SkillSharedTargetingFields = Partial<
  Pick<SkillEffectDef, SkillSharedTargetingFieldKey>
>;

export function hasSkillSharedTargeting(skill: ActiveSkillDef): boolean {
  return SKILL_SHARED_TARGETING_KEYS.some((key) => skill[key] !== undefined);
}

export function effectOverridesSkillTarget(effect: SkillEffectDef): boolean {
  return effect.target !== undefined;
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
  for (const key of SKILL_SHARED_TARGETING_KEYS) {
    if (merged[key] === undefined && skill[key] !== undefined) {
      (merged as SkillSharedTargetingFields)[key] = skill[key] as never;
    }
  }
  return merged;
}

function pickTargetingLockFields(
  effect: SkillEffectDef,
): SkillSharedTargetingFields {
  const picked: SkillSharedTargetingFields = {};
  for (const key of SKILL_SHARED_TARGETING_KEYS) {
    const value = effect[key];
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
