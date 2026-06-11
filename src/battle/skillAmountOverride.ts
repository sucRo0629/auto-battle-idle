import { getPassiveDefs } from './combatMath.ts';
import { isPassiveHot } from './types.ts';
import type {
  ActiveSkillDef,
  PassiveAmountField,
  PassiveSkillDef,
  ResourceAmountSpec,
  SkillEffectDef,
  CombatantState,
} from './types.ts';

export interface SkillAmountContext {
  skillId: string;
  effectIndex?: number;
  passiveAmountField?: PassiveAmountField;
}

export function isPassiveSkillAmountOverrideTarget(
  passive: PassiveSkillDef,
): boolean {
  return inferPassiveAmountField(passive) !== undefined;
}

export function isActiveSkillAmountOverrideTarget(
  active: ActiveSkillDef,
): boolean {
  return active.effect.some((effect) => activeEffectHasAmount(effect));
}

export function inferPassiveAmountField(
  passive: PassiveSkillDef,
): PassiveAmountField | undefined {
  if (isPassiveHot(passive) && passive.hotAmount !== undefined) {
    return 'hotAmount';
  }
  if (
    passive.effect === 'buff' &&
    passive.buffSubKind === 'barrier' &&
    passive.barrierAmount !== undefined
  ) {
    return 'barrierAmount';
  }
  return undefined;
}

export function activeEffectHasAmount(effect: SkillEffectDef): boolean {
  if (effect.type === 'damage') return true;
  if (effect.type === 'heal') {
    return effect.amount !== undefined;
  }
  if (effect.type === 'buff' && effect.buffSubKind === 'barrier') {
    return true;
  }
  if (effect.type === 'debuff' && effect.debuffSubKind === 'dot') {
    return (
      effect.amount !== undefined ||
      (effect.powerMultiplier !== undefined && effect.powerMultiplier > 0)
    );
  }
  return false;
}

export function getActiveEffectAmountSpec(
  effect: SkillEffectDef,
): ResourceAmountSpec | undefined {
  if (effect.type === 'damage') {
    return effect.amount;
  }
  if (effect.type === 'heal' && effect.amount !== undefined) {
    return effect.amount;
  }
  if (effect.type === 'buff' && effect.buffSubKind === 'barrier') {
    return effect.amount ?? { kind: 'flat', flatAmount: 0 };
  }
  if (effect.type === 'debuff' && effect.debuffSubKind === 'dot') {
    if (effect.amount !== undefined) return effect.amount;
    const scale = effect.powerMultiplier ?? 0;
    if (scale <= 0) return undefined;
    return { kind: 'atkBased', atkScale: scale };
  }
  return undefined;
}

export function getPassiveAmountSpec(
  passive: PassiveSkillDef,
  field: PassiveAmountField,
): ResourceAmountSpec | undefined {
  if (field === 'hotAmount') return passive.hotAmount;
  return passive.barrierAmount;
}

function matchesSkillAmountOverride(
  override: PassiveSkillDef,
  context: SkillAmountContext,
  learnedPassiveIds: string[],
  passives: Record<string, PassiveSkillDef>,
): boolean {
  if (override.effect !== 'skillAmountOverride' || !override.amount) {
    return false;
  }
  if (override.targetSkillId !== context.skillId) {
    return false;
  }

  if (context.passiveAmountField !== undefined) {
    if (!learnedPassiveIds.includes(context.skillId)) {
      return false;
    }
    if (override.effectIndex !== undefined) {
      return false;
    }
    const targetPassive = passives[context.skillId];
    if (!targetPassive) return false;
    const expectedField =
      override.passiveAmountField ?? inferPassiveAmountField(targetPassive);
    return expectedField === context.passiveAmountField;
  }

  if (override.passiveAmountField !== undefined) {
    return false;
  }

  if (
    override.effectIndex !== undefined &&
    context.effectIndex !== undefined &&
    override.effectIndex !== context.effectIndex
  ) {
    return false;
  }

  return true;
}

export function resolveEffectiveAmountSpec(
  actor: CombatantState,
  passives: Record<string, PassiveSkillDef>,
  original: ResourceAmountSpec,
  context: SkillAmountContext,
): ResourceAmountSpec {
  const defs = getPassiveDefs(actor, passives);
  for (let i = defs.length - 1; i >= 0; i--) {
    const passive = defs[i]!;
    if (
      !matchesSkillAmountOverride(
        passive,
        context,
        actor.build.learnedPassiveIds,
        passives,
      )
    ) {
      continue;
    }
    return passive.amount!;
  }
  return original;
}

export function resolveEffectiveAmountSpecForActiveEffect(
  actor: CombatantState,
  passives: Record<string, PassiveSkillDef>,
  skill: ActiveSkillDef,
  _effect: SkillEffectDef,
  effectIndex: number,
  original: ResourceAmountSpec,
): ResourceAmountSpec {
  return resolveEffectiveAmountSpec(actor, passives, original, {
    skillId: skill.id,
    effectIndex,
  });
}

export function resolveEffectivePassiveAmountSpec(
  actor: CombatantState,
  passives: Record<string, PassiveSkillDef>,
  targetPassiveId: string,
  field: PassiveAmountField,
  original: ResourceAmountSpec,
): ResourceAmountSpec {
  return resolveEffectiveAmountSpec(actor, passives, original, {
    skillId: targetPassiveId,
    passiveAmountField: field,
  });
}
