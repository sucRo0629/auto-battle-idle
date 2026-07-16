import { applyHealToTarget } from './combatMath.ts';
import type { DamageAppliedEvent } from './damageAppliedEvent.ts';
import type {
  CombatModuleDef,
  CombatantState,
  GameData,
  StatusEffect,
} from './types.ts';

/**
 * R12g-d1 M1 combat module ID（物理堅守・選択中永続）。
 * ID は R5 プレースホルダを維持。内容は R12f 物理堅守型。
 */
export const DF_GUARDIAN_M1_COMBAT_MODULE_ID =
  'df_guardian_mod_nearest_strike' as const;

/**
 * R12g-d1 M2 combat module ID（不屈・被弾自己回復）。
 * Heal amount owner: CombatModule.runtimeEffect。
 */
export const DF_GUARDIAN_M2_COMBAT_MODULE_ID =
  'df_guardian_mod_guard_focus' as const;

const M1_PHYSICAL_DR_STATUS_ID_PREFIX = 'df_guardian_m1_physical_dr_';

export interface IronGuardianM2SelfHealResult {
  triggered: boolean;
  healed: number;
}

export function getResolvedBasicCombatModuleId(
  combatant: CombatantState,
): string | undefined {
  return combatant.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId;
}

export function isIronGuardianM1Selected(combatant: CombatantState): boolean {
  if (combatant.classId !== 'df_guardian') return false;
  return (
    getResolvedBasicCombatModuleId(combatant) ===
    DF_GUARDIAN_M1_COMBAT_MODULE_ID
  );
}

export function isIronGuardianM2Selected(combatant: CombatantState): boolean {
  if (combatant.classId !== 'df_guardian') return false;
  return (
    getResolvedBasicCombatModuleId(combatant) ===
    DF_GUARDIAN_M2_COMBAT_MODULE_ID
  );
}

export function resolveIronGuardianM1PhysicalTakenMultiplier(
  combatModuleRegistry: Record<string, CombatModuleDef>,
): number | undefined {
  const module = combatModuleRegistry[DF_GUARDIAN_M1_COMBAT_MODULE_ID];
  const runtimeEffect = module?.runtimeEffect;
  if (runtimeEffect?.kind !== 'physicalDamageTakenReduction') return undefined;
  const { takenMultiplier } = runtimeEffect;
  if (
    !(takenMultiplier > 0) ||
    !Number.isFinite(takenMultiplier) ||
    takenMultiplier > 1
  ) {
    return undefined;
  }
  return takenMultiplier;
}

export function resolveIronGuardianM2SelfHealFlatAmount(
  combatModuleRegistry: Record<string, CombatModuleDef>,
): number | undefined {
  const module = combatModuleRegistry[DF_GUARDIAN_M2_COMBAT_MODULE_ID];
  const runtimeEffect = module?.runtimeEffect;
  if (runtimeEffect?.kind !== 'healOnEnemyAttackHpHit') return undefined;
  if (!(runtimeEffect.flatAmount > 0) || !Number.isFinite(runtimeEffect.flatAmount)) {
    return undefined;
  }
  return runtimeEffect.flatAmount;
}

function isIronGuardianModuleOwnedStatus(effect: StatusEffect): boolean {
  return (
    effect.skillId === DF_GUARDIAN_M1_COMBAT_MODULE_ID ||
    effect.skillId === DF_GUARDIAN_M2_COMBAT_MODULE_ID ||
    effect.id.startsWith(M1_PHYSICAL_DR_STATUS_ID_PREFIX)
  );
}

/** M1/M2 module 由来の一時・永続 status を除去 */
export function clearIronGuardianCombatModuleStatusEffects(
  combatant: CombatantState,
): void {
  if (combatant.classId !== 'df_guardian') return;
  combatant.statusEffects = combatant.statusEffects.filter(
    (effect) => !isIronGuardianModuleOwnedStatus(effect),
  );
}

function applyPermanentM1PhysicalDr(
  combatant: CombatantState,
  takenMultiplier: number,
): void {
  combatant.statusEffects.push({
    id: `${M1_PHYSICAL_DR_STATUS_ID_PREFIX}${combatant.id}`,
    kind: 'buff',
    stat: 'damageTaken',
    multiplier: takenMultiplier,
    durationSec: Number.POSITIVE_INFINITY,
    remainingSec: Number.POSITIVE_INFINITY,
    skillId: DF_GUARDIAN_M1_COMBAT_MODULE_ID,
    sourceId: combatant.id,
    damageTakenDamageTypes: ['physical'],
    displayName: '物理堅守',
  });
}

/**
 * 選択中 module に合わせて鉄衛士 M1 永続物理軽減を同期する。
 * Wave 生成・module 切替・syncPartyBuilds 用。
 */
export function syncIronGuardianModuleStatusEffects(
  combatant: CombatantState,
  combatModuleRegistry: Record<string, CombatModuleDef>,
): void {
  if (combatant.classId !== 'df_guardian') return;
  clearIronGuardianCombatModuleStatusEffects(combatant);
  if (!isIronGuardianM1Selected(combatant)) return;
  const takenMultiplier =
    resolveIronGuardianM1PhysicalTakenMultiplier(combatModuleRegistry);
  if (takenMultiplier === undefined) return;
  applyPermanentM1PhysicalDr(combatant, takenMultiplier);
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
  gameData: Pick<GameData, 'combatModuleRegistry'>,
): IronGuardianM2SelfHealResult {
  if (!shouldIronGuardianM2SelfHeal(event, attacker, target)) {
    return { triggered: false, healed: 0 };
  }
  const flatAmount = resolveIronGuardianM2SelfHealFlatAmount(
    gameData.combatModuleRegistry,
  );
  if (flatAmount === undefined) {
    return { triggered: false, healed: 0 };
  }
  const healed = applyHealToTarget(target, flatAmount);
  return { triggered: true, healed };
}
