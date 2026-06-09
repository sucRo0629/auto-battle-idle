import { getEffectiveAtk, getPassiveDefs } from './combatMath.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

const BLOCK_ATK_BASE_RATIO = 0.25;
const BLOCK_ATK_DIVISOR = 100;

export function getBlockChance(
  defender: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): number {
  let chance = 0;

  for (const passive of getPassiveDefs(defender, passives)) {
    if (passive.effect !== 'block') continue;
    chance += passive.blockChance ?? 0;
  }

  for (const effect of defender.statusEffects) {
    if (effect.remainingSec <= 0) continue;
    if (effect.blockChance === undefined || effect.blockChance <= 0) continue;
    chance += effect.blockChance;
  }

  return Math.min(1, chance);
}

export function rollBlock(chance: number): boolean {
  if (chance <= 0) return false;
  return Math.random() < Math.min(1, chance);
}

export function computeBlockMitigationRatio(defender: CombatantState): number {
  return Math.min(
    1,
    BLOCK_ATK_BASE_RATIO + getEffectiveAtk(defender) / BLOCK_ATK_DIVISOR,
  );
}

export function applyBlockToPhysicalDamage(
  defender: CombatantState,
  physicalDamage: number,
  passives: Record<string, PassiveSkillDef>,
): { finalDamage: number; blockedAmount: number; didBlock: boolean } {
  if (physicalDamage <= 0) {
    return { finalDamage: 0, blockedAmount: 0, didBlock: false };
  }

  const chance = getBlockChance(defender, passives);
  if (!rollBlock(chance)) {
    return {
      finalDamage: physicalDamage,
      blockedAmount: 0,
      didBlock: false,
    };
  }

  const blockedAmount = Math.floor(
    physicalDamage * computeBlockMitigationRatio(defender),
  );
  return {
    finalDamage: Math.max(0, physicalDamage - blockedAmount),
    blockedAmount,
    didBlock: true,
  };
}
