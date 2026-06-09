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
    case 'targetHp': {
      if (target.maxHp <= 0) return false;
      return target.hp / target.maxHp <= condition.maxHpRatio;
    }
    case 'selfHp': {
      if (attacker.maxHp <= 0) return false;
      const hpRatio = attacker.hp / attacker.maxHp;
      if (condition.mode === 'scaling') {
        return hpRatio < 1;
      }
      return hpRatio <= condition.maxHpRatio;
    }
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

  if (condition.kind === 'selfHp' && condition.mode === 'scaling') {
    const missingRatio = 1 - attacker.hp / attacker.maxHp;
    const maxMul = condition.maxMul ?? scale;
    return Math.min(maxMul, 1 + scale * missingRatio);
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
