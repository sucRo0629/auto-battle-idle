import { applyHealToTarget, getPassiveDefs, resolveResourceAmount } from './combatMath.ts';
import { applyKnockbackToTarget } from './ccEffects.ts';
import { findUnitsInRadius } from './dotMechanics.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

export function applyHealOnBlock(
  defender: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): number {
  let healed = 0;
  for (const passive of getPassiveDefs(defender, passives)) {
    if (passive.effect !== 'healOnBlock' || !passive.healOnBlockAmount) continue;
    const amount = resolveResourceAmount(
      defender,
      defender,
      passive.healOnBlockAmount,
      passives,
    );
    if (amount <= 0) continue;
    healed += applyHealToTarget(defender, amount);
  }
  return healed;
}

export function applyKnockbackOnBlock(
  defender: CombatantState,
  hostileUnits: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  onBattleXChanged?: (
    unit: CombatantState,
    beforeX: number,
    reason: 'knockback' | 'enemyReelIn',
  ) => void,
): CombatantState[] {
  const moved = new Set<CombatantState>();
  for (const passive of getPassiveDefs(defender, passives)) {
    if (passive.effect !== 'knockbackOnBlock') continue;
    const radiusPx = passive.knockbackOnBlockRadiusPx ?? 0;
    const distancePx = passive.knockbackOnBlockDistancePx ?? 0;
    if (radiusPx <= 0 || distancePx <= 0) continue;
    for (const target of findUnitsInRadius(defender.battleX, hostileUnits, radiusPx)) {
      const beforeX = target.battleX;
      if (
        !applyKnockbackToTarget(target, distancePx, {
          skillId: 'passive_knockback_on_block',
          sourceId: defender.id,
        })
      ) {
        continue;
      }
      moved.add(target);
      onBattleXChanged?.(target, beforeX, 'knockback');
    }
  }
  return [...moved];
}
