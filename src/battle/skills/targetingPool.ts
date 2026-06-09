import type { CombatantState, TargetRule, TargetSpec } from '../types.ts';
import { getEffectTarget, getTargetPool, normalizeTarget } from './targetSpec.ts';

/** @deprecated Use getTargetPool with TargetSpec */
export function getTargetPoolForRule(
  rule: TargetRule,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
): CombatantState[] {
  return getTargetPool(normalizeTarget(rule), actor, allies, enemies);
}

export function getTargetPoolForSpec(
  spec: TargetSpec,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
): CombatantState[] {
  return getTargetPool(spec, actor, allies, enemies);
}

export function getTargetPoolForEffect(
  effect: {
    target?: TargetSpec;
    targetRule?: TargetRule;
    targetDebuffFilter?: import('../types.ts').DebuffFilterTag[];
  },
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
): CombatantState[] {
  return getTargetPool(getEffectTarget(effect), actor, allies, enemies);
}
