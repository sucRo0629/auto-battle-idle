import type {
  ActiveSkillDef,
  AttackMethod,
  AttackSpeedTier,
  DamageSkillEffect,
  NormalizedEntityTraits,
  ResourceAmountSpec,
} from '../types.ts';

export const DEFAULT_BASIC_ATTACK_INTERVAL_SEC = 2;

export function defaultBasicAttackId(entityId: string): string {
  return `${entityId.trim()}_basic_attack`;
}

function synthesizedDamageEffect(
  amount: ResourceAmountSpec,
): DamageSkillEffect {
  return {
    target: { kind: 'distance', side: 'enemy', order: 'nearest' },
    type: 'damage',
    amount,
  };
}

function inferAttackMethodFromTraits(
  primaryEffectType: string | undefined,
): AttackMethod | undefined {
  if (primaryEffectType !== 'damage') return undefined;
  return 'melee';
}

export function synthesizeBasicAttackSkill(params: {
  entityId: string;
  isEnemy: boolean;
  traits: NormalizedEntityTraits;
  attackSpeedTier: AttackSpeedTier;
  displayName?: string;
  jsonOverride?: ActiveSkillDef;
}): ActiveSkillDef {
  const {
    entityId,
    isEnemy,
    traits,
    attackSpeedTier: _attackSpeedTier,
    displayName,
    jsonOverride,
  } = params;

  const id = defaultBasicAttackId(entityId);
  const overrideEffect = jsonOverride?.effect[0];
  const amount: ResourceAmountSpec =
    overrideEffect?.type === 'damage' && overrideEffect.amount
      ? { ...overrideEffect.amount }
      : { kind: 'atkBased', atkScale: 1 };

  const synthesized: ActiveSkillDef = {
    id,
    name: displayName ?? (isEnemy ? entityId : '打撃'),
    trigger: { kind: 'time', value: DEFAULT_BASIC_ATTACK_INTERVAL_SEC },
    effect: [synthesizedDamageEffect(amount)],
  };

  if (!jsonOverride) {
    const attackMethod = inferAttackMethodFromTraits(
      synthesized.effect[0]?.type,
    );
    return attackMethod !== undefined
      ? { ...synthesized, attackMethod }
      : synthesized;
  }

  const primaryEffect =
    overrideEffect?.type === 'damage'
      ? { ...overrideEffect, amount }
      : overrideEffect ?? synthesizedDamageEffect(amount);

  const primaryType = primaryEffect?.type;
  const attackMethod =
    jsonOverride?.attackMethod ??
    inferAttackMethodFromTraits(primaryType);

  const merged: ActiveSkillDef = {
    ...synthesized,
    id,
    name: jsonOverride.name ?? synthesized.name,
    trigger: jsonOverride.trigger ?? synthesized.trigger,
    iconKey: jsonOverride.iconKey,
    effect: [primaryEffect, ...jsonOverride.effect.slice(1)],
    ...(attackMethod !== undefined ? { attackMethod } : {}),
  };

  return merged;
}
