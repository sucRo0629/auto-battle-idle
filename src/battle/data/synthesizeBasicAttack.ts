import type {
  ActiveSkillDef,
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
    traits: _traits,
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
    interval: DEFAULT_BASIC_ATTACK_INTERVAL_SEC,
    effect: [synthesizedDamageEffect(amount)],
  };

  if (!jsonOverride) return synthesized;

  const merged: ActiveSkillDef = {
    ...synthesized,
    id,
    name: jsonOverride.name ?? synthesized.name,
    interval: jsonOverride.interval ?? synthesized.interval,
    trigger: jsonOverride.trigger,
    iconKey: jsonOverride.iconKey,
    effect: [
      synthesizedDamageEffect(amount),
      ...jsonOverride.effect.slice(1),
    ],
  };

  return merged;
}
