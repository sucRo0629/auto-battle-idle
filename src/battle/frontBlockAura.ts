import { getPassiveDefs } from './combatMath.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

const FRONT_BLOCK_AURA_ID_PREFIX = 'front_block_aura_';
const FRONT_BLOCK_AURA_DURATION_SEC = 99999;

export function isFrontBlockAuraPassive(passive: PassiveSkillDef): boolean {
  return passive.effect === 'frontBlockAura';
}

export interface MergedFrontBlockAuraConfig {
  blockChance: number;
  blocksMagic: boolean;
}

export function mergeFrontBlockAuraPassives(
  passives: PassiveSkillDef[],
): MergedFrontBlockAuraConfig {
  let blockChance = 0;
  let blocksMagic = false;

  for (const passive of passives) {
    if (!isFrontBlockAuraPassive(passive)) continue;
    if (passive.chance !== undefined) {
      blockChance += passive.chance;
    }
    if (passive.frontBlockAuraMagicBlock) {
      blocksMagic = true;
    }
  }

  return {
    blockChance: Math.min(1, Number(blockChance.toFixed(4))),
    blocksMagic,
  };
}

export function resolveFrontBlockAuraConfigForUnit(
  unit: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): MergedFrontBlockAuraConfig {
  return mergeFrontBlockAuraPassives(getPassiveDefs(unit, passives));
}

function stripFrontBlockAuras(units: CombatantState[]): void {
  for (const unit of units) {
    unit.statusEffects = unit.statusEffects.filter(
      (effect) => !effect.id.startsWith(FRONT_BLOCK_AURA_ID_PREFIX),
    );
  }
}

/** 生存中の持有者が前列味方へ block overlay を付与（syncBuffAuras とは別） */
export function syncFrontBlockAuras(
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): void {
  stripFrontBlockAuras(allies);

  for (const source of allies) {
    if (!source.isAlive) continue;
    const config = resolveFrontBlockAuraConfigForUnit(source, passives);
    if (config.blockChance <= 0) continue;

    for (const target of allies) {
      if (!target.isAlive || target.formationRow !== 'front') continue;
      target.statusEffects.push({
        id: `${FRONT_BLOCK_AURA_ID_PREFIX}${source.id}_${target.id}`,
        kind: 'buff',
        overlay: 'block',
        blockChance: config.blockChance,
        blocksMagic: config.blocksMagic,
        sourceId: source.id,
        multiplier: 1,
        durationSec: FRONT_BLOCK_AURA_DURATION_SEC,
        remainingSec: FRONT_BLOCK_AURA_DURATION_SEC,
        displayName: '護身手',
      });
    }
  }
}
