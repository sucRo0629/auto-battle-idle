import { applyHealToTarget } from './combatMath.ts';
import type { DamageAppliedEvent } from './damageAppliedEvent.ts';
import type { CombatantState } from './types.ts';

/**
 * R12f / handoff M2 combat module ID (不屈・被弾自己回復).
 * Heal amount owner migrates to CombatModule JSON in R12g Survival Module data task.
 */
export const DF_GUARDIAN_M2_COMBAT_MODULE_ID =
  'df_guardian_mod_guard_focus' as const;

/** R12g-b2 placeholder flat self-heal per qualifying Hit (R12i tunes). */
export const IRON_GUARDIAN_M2_SELF_HEAL_FLAT_AMOUNT = 20;

export interface IronGuardianM2SelfHealResult {
  triggered: boolean;
  healed: number;
}

export function getResolvedBasicCombatModuleId(
  combatant: CombatantState,
): string | undefined {
  return combatant.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId;
}

export function isIronGuardianM2Selected(combatant: CombatantState): boolean {
  if (combatant.classId !== 'df_guardian') return false;
  return (
    getResolvedBasicCombatModuleId(combatant) ===
    DF_GUARDIAN_M2_COMBAT_MODULE_ID
  );
}

function areAdversaries(
  attacker: CombatantState,
  target: CombatantState,
): boolean {
  return attacker.isEnemy !== target.isEnemy;
}

export function shouldIronGuardianM2SelfHeal(
  event: DamageAppliedEvent,
  attacker: CombatantState,
  target: CombatantState,
): boolean {
  if (target.classId !== 'df_guardian') return false;
  if (!isIronGuardianM2Selected(target)) return false;
  if (!target.isAlive) return false;
  if (attacker.id === target.id) return false;
  if (!areAdversaries(attacker, target)) return false;
  if (event.sourceKind !== 'skillHit') return false;
  if (event.attackKind !== 'damage') return false;
  if (event.hpDamage <= 0) return false;
  if (event.lethal) return false;
  return true;
}

export function tryIronGuardianM2SelfHeal(
  event: DamageAppliedEvent,
  attacker: CombatantState,
  target: CombatantState,
): IronGuardianM2SelfHealResult {
  if (!shouldIronGuardianM2SelfHeal(event, attacker, target)) {
    return { triggered: false, healed: 0 };
  }
  const healed = applyHealToTarget(
    target,
    IRON_GUARDIAN_M2_SELF_HEAL_FLAT_AMOUNT,
  );
  return { triggered: true, healed };
}
