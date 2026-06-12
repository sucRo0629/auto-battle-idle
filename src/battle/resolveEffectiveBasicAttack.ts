import type {
  ActiveSkillDef,
  BasicAttackTransformSpec,
  CombatantState,
  ResourceAmountSpec,
  SkillEffectDef,
  StatusEffect,
} from './types.ts';

function cloneSkillEffect(effect: SkillEffectDef): SkillEffectDef {
  return structuredClone(effect);
}

function findPrimaryEffectIndex(effects: SkillEffectDef[]): number {
  return effects.findIndex((effect) => effect.type !== 'move');
}

function mergeResourceAmountPatch(
  base: ResourceAmountSpec | undefined,
  patch: Partial<ResourceAmountSpec> | undefined,
): ResourceAmountSpec | undefined {
  if (patch === undefined) return base;
  if (base === undefined) {
    return patch as ResourceAmountSpec;
  }
  return { ...base, ...patch };
}

function applyPrimaryPatch(
  effect: SkillEffectDef,
  patch: NonNullable<BasicAttackTransformSpec['primaryPatch']>,
): SkillEffectDef {
  const next = cloneSkillEffect(effect);
  if (patch.damageType !== undefined && next.type === 'damage') {
    next.damageType = patch.damageType;
  }
  if (patch.target !== undefined) {
    next.target = patch.target;
  }
  if (patch.targetShape !== undefined) {
    next.targetShape = patch.targetShape;
  }
  if (patch.aoeRadiusPx !== undefined) {
    next.aoeRadiusPx = patch.aoeRadiusPx;
  }
  if (patch.amount !== undefined) {
    if (next.type === 'damage') {
      next.amount = mergeResourceAmountPatch(next.amount, patch.amount)!;
    } else if (next.type === 'heal') {
      next.amount = mergeResourceAmountPatch(next.amount, patch.amount);
    }
  }
  return next;
}

function applyHitCountMultiplier(
  effect: SkillEffectDef,
  multiplier: number,
): SkillEffectDef {
  const next = cloneSkillEffect(effect);
  const baseHitCount = next.hitCount ?? 1;
  next.hitCount = Math.max(1, Math.round(baseHitCount * multiplier));
  if (next.hitCount >= 2 && next.hitDurationSec === undefined) {
    next.hitDurationSec = 0.2;
  }
  return next;
}

export function basicAttackTransformSpecFromEffect(
  effect: SkillEffectDef,
): BasicAttackTransformSpec | undefined {
  if (effect.type !== 'basicAttackTransform') return undefined;
  const spec: BasicAttackTransformSpec = {};
  if (effect.hitCountMultiplier !== undefined) {
    spec.hitCountMultiplier = effect.hitCountMultiplier;
  }
  if (effect.primaryEffectOverride !== undefined) {
    spec.primaryEffectOverride = effect.primaryEffectOverride;
  }
  if (effect.primaryPatch !== undefined) {
    spec.primaryPatch = effect.primaryPatch;
  }
  if (effect.appendEffects !== undefined && effect.appendEffects.length > 0) {
    spec.appendEffects = effect.appendEffects;
  }
  if (
    spec.hitCountMultiplier === undefined &&
    spec.primaryEffectOverride === undefined &&
    spec.primaryPatch === undefined &&
    spec.appendEffects === undefined
  ) {
    return undefined;
  }
  return spec;
}

export function basicAttackTransformSpecFromStatusEffect(
  effect: StatusEffect,
): BasicAttackTransformSpec | undefined {
  if (effect.overlay !== 'basicAttackTransform' || !effect.basicAttackTransform) {
    return undefined;
  }
  if (effect.remainingSec <= 0) return undefined;
  return effect.basicAttackTransform;
}

export function getActiveBasicAttackTransform(
  unit: CombatantState,
): BasicAttackTransformSpec | undefined {
  for (let i = unit.statusEffects.length - 1; i >= 0; i--) {
    const spec = basicAttackTransformSpecFromStatusEffect(unit.statusEffects[i]!);
    if (spec) return spec;
  }
  return undefined;
}

export function applyBasicAttackTransform(
  baseSkill: ActiveSkillDef,
  transform: BasicAttackTransformSpec,
): ActiveSkillDef {
  const effects = baseSkill.effect.map(cloneSkillEffect);
  const primaryIndex = findPrimaryEffectIndex(effects);
  if (primaryIndex < 0) return { ...baseSkill, effect: effects };

  if (transform.primaryEffectOverride !== undefined) {
    effects[primaryIndex] = cloneSkillEffect(transform.primaryEffectOverride);
  } else if (transform.primaryPatch !== undefined) {
    effects[primaryIndex] = applyPrimaryPatch(
      effects[primaryIndex]!,
      transform.primaryPatch,
    );
  }

  if (transform.hitCountMultiplier !== undefined) {
    effects[primaryIndex] = applyHitCountMultiplier(
      effects[primaryIndex]!,
      transform.hitCountMultiplier,
    );
  }

  if (transform.appendEffects !== undefined && transform.appendEffects.length > 0) {
    effects.push(...transform.appendEffects.map(cloneSkillEffect));
  }

  return { ...baseSkill, effect: effects };
}

export function resolveEffectiveBasicAttackSkill(
  unit: CombatantState,
  baseSkill: ActiveSkillDef,
): ActiveSkillDef {
  const transform = getActiveBasicAttackTransform(unit);
  if (!transform) return baseSkill;
  return applyBasicAttackTransform(baseSkill, transform);
}
