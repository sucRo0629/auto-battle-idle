import { getEffectiveAtk } from './combatMath.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

const BLOCK_ATK_BASE_RATIO = 0.25;
const BLOCK_ATK_DIVISOR = 1000;
export const MAGIC_BLOCK_MITIGATION_RATIO = 0.15;

function sumBlockChanceFromEffects(
  defender: CombatantState,
  magicOnly: boolean,
): number {
  let chance = 0;

  for (const effect of defender.statusEffects) {
    if (effect.remainingSec <= 0) continue;
    if (effect.overlay !== 'block') continue;
    if (magicOnly && !effect.blocksMagic) continue;
    if (effect.blockChance === undefined || effect.blockChance <= 0) continue;
    chance += effect.blockChance;
  }

  return Math.min(1, chance);
}

export function getBlockChance(
  defender: CombatantState,
  _passives: Record<string, PassiveSkillDef>,
): number {
  return sumBlockChanceFromEffects(defender, false);
}

export function getMagicBlockChance(defender: CombatantState): number {
  return sumBlockChanceFromEffects(defender, true);
}

export function defenderHasMagicBlock(defender: CombatantState): boolean {
  return defender.statusEffects.some(
    (effect) =>
      effect.remainingSec > 0 &&
      effect.overlay === 'block' &&
      effect.blocksMagic === true,
  );
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

export function applyBlockToMagicDamage(
  defender: CombatantState,
  magicDamage: number,
): { finalDamage: number; blockedAmount: number; didBlock: boolean } {
  if (magicDamage <= 0 || !defenderHasMagicBlock(defender)) {
    return { finalDamage: magicDamage, blockedAmount: 0, didBlock: false };
  }

  const chance = getMagicBlockChance(defender);
  if (!rollBlock(chance)) {
    return {
      finalDamage: magicDamage,
      blockedAmount: 0,
      didBlock: false,
    };
  }

  const blockedAmount = Math.floor(magicDamage * MAGIC_BLOCK_MITIGATION_RATIO);
  return {
    finalDamage: Math.max(0, magicDamage - blockedAmount),
    blockedAmount,
    didBlock: true,
  };
}
