import { getPassiveDefs } from './combatMath.ts';
import {
  DEFAULT_SURROUND_AURA_RADIUS_PX,
  isAllyWithinBattleXRadius,
} from './combatPosition.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

const FRONT_BLOCK_AURA_ID_SEGMENT = 'frontBlockAura';
const LEGACY_FRONT_BLOCK_AURA_ID_PREFIX = 'front_block_aura_';
const FRONT_BLOCK_AURA_DURATION_SEC = 99999;

function frontBlockAuraEffectId(sourceId: string, targetId: string): string {
  return `passive_buff_aura_${sourceId}_${FRONT_BLOCK_AURA_ID_SEGMENT}_${targetId}`;
}

function isFrontBlockAuraEffectId(id: string): boolean {
  return (
    id.startsWith(LEGACY_FRONT_BLOCK_AURA_ID_PREFIX) ||
    (id.startsWith('passive_buff_aura_') &&
      id.includes(`_${FRONT_BLOCK_AURA_ID_SEGMENT}_`))
  );
}

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
      (effect) => !isFrontBlockAuraEffectId(effect.id),
    );
  }
}

function resolveFrontBlockAuraDisplayName(
  source: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): string {
  for (const passive of getPassiveDefs(source, passives)) {
    if (!isFrontBlockAuraPassive(passive)) continue;
    if (passive.buffDisplayName) return passive.buffDisplayName;
  }
  return '護身手';
}

function resolveFrontBlockAuraRadiusPx(
  source: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): number {
  for (const passive of getPassiveDefs(source, passives)) {
    if (!isFrontBlockAuraPassive(passive)) continue;
    if (passive.frontBlockAuraRadiusPx !== undefined) {
      return passive.frontBlockAuraRadiusPx;
    }
  }
  return DEFAULT_SURROUND_AURA_RADIUS_PX;
}

/** 生存中の持有者が周囲味方へ block overlay を付与（syncBuffAuras とは別） */
export function syncFrontBlockAuras(
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): void {
  stripFrontBlockAuras(allies);

  for (const source of allies) {
    if (!source.isAlive) continue;
    const config = resolveFrontBlockAuraConfigForUnit(source, passives);
    if (config.blockChance <= 0) continue;
    const displayName = resolveFrontBlockAuraDisplayName(source, passives);
    const radiusPx = resolveFrontBlockAuraRadiusPx(source, passives);

    for (const target of allies) {
      const withinRadius =
        target.id === source.id ||
        isAllyWithinBattleXRadius(source, target, radiusPx);
      if (!withinRadius) continue;
      target.statusEffects.push({
        id: frontBlockAuraEffectId(source.id, target.id),
        kind: 'buff',
        overlay: 'block',
        blockChance: config.blockChance,
        blocksMagic: config.blocksMagic,
        sourceId: source.id,
        multiplier: 1,
        durationSec: FRONT_BLOCK_AURA_DURATION_SEC,
        remainingSec: FRONT_BLOCK_AURA_DURATION_SEC,
        displayName,
      });
    }
  }
}
