import {
  currentHpRatio,
  getPassiveDefs,
  matchesHpRatioThreshold,
} from './combatMath.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

export const PRIDE_HP_RATIO_MIN_DEFAULT = 0.5;
export const PRIDE_HEAL_MULTIPLIER_DEFAULT = 0.25;
export const DUELIST_PRIDE_OVERLAY = 'duelistPride' as const;

const DUELIST_PRIDE_ID_PREFIX = 'passive_duelist_pride_';
const DUELIST_PRIDE_AURA_DURATION_SEC = 99999;

export function isDuelistPridePassive(passive: PassiveSkillDef): boolean {
  return passive.effect === 'duelistPride';
}

export function resolveDuelistPrideIncomingHealMultiplier(
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): number {
  let mul = 1;
  for (const passive of getPassiveDefs(target, passives)) {
    if (!isDuelistPridePassive(passive)) continue;
    const minRatio = passive.prideHpRatioMin ?? PRIDE_HP_RATIO_MIN_DEFAULT;
    if (!matchesHpRatioThreshold(currentHpRatio(target), minRatio, 'gte')) {
      continue;
    }
    const prideMul = passive.prideHealMultiplier ?? PRIDE_HEAL_MULTIPLIER_DEFAULT;
    mul = Math.min(mul, prideMul);
  }
  return mul;
}

export function syncDuelistPrideAuras(
  units: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): void {
  for (const unit of units) {
    unit.statusEffects = unit.statusEffects.filter(
      (effect) => !effect.id.startsWith(DUELIST_PRIDE_ID_PREFIX),
    );
  }

  for (const unit of units) {
    if (!unit.isAlive) continue;
    for (const passive of getPassiveDefs(unit, passives)) {
      if (!isDuelistPridePassive(passive)) continue;
      const minRatio = passive.prideHpRatioMin ?? PRIDE_HP_RATIO_MIN_DEFAULT;
      if (!matchesHpRatioThreshold(currentHpRatio(unit), minRatio, 'gte')) {
        continue;
      }
      unit.statusEffects.push({
        id: `${DUELIST_PRIDE_ID_PREFIX}${unit.id}_${passive.id}`,
        kind: 'debuff',
        overlay: DUELIST_PRIDE_OVERLAY,
        multiplier: 1,
        sourceId: unit.id,
        skillId: passive.id,
        durationSec: DUELIST_PRIDE_AURA_DURATION_SEC,
        remainingSec: DUELIST_PRIDE_AURA_DURATION_SEC,
        displayName: '闘士の矜持',
      });
    }
  }
}
