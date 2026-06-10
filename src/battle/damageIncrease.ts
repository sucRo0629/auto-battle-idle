import { currentHpRatio } from './combatMath.ts';
import { hasMatchingDebuff } from './debuffMatching.ts';
import type {
  CombatantState,
  DamageIncreaseCondition,
  DamageIncreaseSpec,
} from './types.ts';

function evaluateCondition(
  attacker: CombatantState,
  target: CombatantState,
  condition: DamageIncreaseCondition,
): boolean {
  switch (condition.kind) {
    case 'debuff':
      return hasMatchingDebuff(target, condition.tags, {
        selfSourceId: attacker.id,
        selfAppliedOnly: condition.selfAppliedOnly,
      });
    case 'targetHp':
      return currentHpRatio(target) <= condition.maxHpRatio;
  }
}

function resolveConditionMultiplier(
  attacker: CombatantState,
  target: CombatantState,
  condition: DamageIncreaseCondition,
  scale: number,
): number {
  if (!evaluateCondition(attacker, target, condition)) {
    return 1;
  }
  return scale;
}

export function resolveDamageIncreaseMultiplier(
  attacker: CombatantState,
  target: CombatantState,
  spec: DamageIncreaseSpec | undefined,
): number {
  if (!spec || spec.conditions.length === 0) return 1;

  let mul = 1;
  for (const condition of spec.conditions) {
    mul *= resolveConditionMultiplier(attacker, target, condition, spec.scale);
  }
  return mul;
}

export function resolveDamageIncreaseSpecsMultiplier(
  attacker: CombatantState,
  target: CombatantState,
  specs: Array<DamageIncreaseSpec | undefined>,
): number {
  let mul = 1;
  for (const spec of specs) {
    mul *= resolveDamageIncreaseMultiplier(attacker, target, spec);
  }
  return mul;
}
