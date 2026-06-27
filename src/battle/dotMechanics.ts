import { getBattleX } from './combatPosition.ts';
import { currentHpRatio, resolveDotAmountFromStatus } from './combatMath.ts';
import { hasMatchingDebuff } from './statusMatching.ts';
import type {
  CombatantState,
  DamageIncreaseCondition,
  PassiveSkillDef,
  StatusEffect,
} from './types.ts';
import { getPassiveDefs } from './combatMath.ts';

const DOT_TICK_SEC = 1;

export function hasActiveDot(unit: CombatantState): boolean {
  return hasMatchingDebuff(unit, ['dot']);
}

export function evaluateAuraCondition(
  target: CombatantState,
  condition: DamageIncreaseCondition,
): boolean {
  switch (condition.kind) {
    case 'hasDot':
      return hasActiveDot(target);
    case 'debuff':
      return hasMatchingDebuff(target, condition.tags, {
        selfAppliedOnly: condition.selfAppliedOnly,
      });
    case 'targetHp':
      return currentHpRatio(target) <= condition.maxHpRatio;
    case 'attackType':
      return false;
  }
}

export function evaluateAuraConditions(
  target: CombatantState,
  conditions: DamageIncreaseCondition[],
): boolean {
  if (conditions.length === 0) return true;
  return conditions.every((c) => evaluateAuraCondition(target, c));
}

export function resolveDotDurationOnApply(
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  baseDurationSec: number,
): number {
  let mul = 1;
  for (const ally of allies) {
    if (!ally.isAlive) continue;
    for (const passive of getPassiveDefs(ally, passives)) {
      if (passive.effect !== 'dotDurationMultiplierOnApply') continue;
      mul *= passive.dotDurationMultiplierOnApply ?? 1;
    }
  }
  return baseDurationSec * mul;
}

export function resolveHunterDotCompressRatio(
  actor: CombatantState,
  passives: Record<string, PassiveSkillDef>,
  baseRatio: number,
  stayBonus = 0,
): number {
  let ratio = baseRatio + stayBonus;
  for (const passive of getPassiveDefs(actor, passives)) {
    if (passive.effect === 'dotCompressAssist') {
      ratio = passive.dotCompressRatio ?? ratio;
    }
  }
  return Math.max(0.05, Math.min(1, ratio));
}

export function compressDotEffect(
  effect: StatusEffect,
  compressRatio: number,
): void {
  if (effect.overlay !== 'dot' || effect.remainingSec <= 0) return;
  if (effect.dotCompressImmune === true) return;
  if (compressRatio >= 1) return;
  const oldRemaining = effect.remainingSec;
  effect.remainingSec = Math.max(DOT_TICK_SEC, oldRemaining * compressRatio);
  const amp = oldRemaining / effect.remainingSec;
  effect.dotTickDamageMul = (effect.dotTickDamageMul ?? 1) * amp;
}

export function extendDotEffect(effect: StatusEffect, extendRatio: number): void {
  if (effect.overlay !== 'dot' || effect.remainingSec <= 0) return;
  if (extendRatio <= 1) return;
  effect.remainingSec *= extendRatio;
  effect.durationSec = Math.max(effect.durationSec, effect.remainingSec);
}

export function compressAllDotsOnUnit(
  target: CombatantState,
  compressRatio: number,
): number {
  let count = 0;
  for (const effect of target.statusEffects) {
    if (effect.overlay !== 'dot') continue;
    compressDotEffect(effect, compressRatio);
    count++;
  }
  return count;
}

export function extendAllDotsOnUnit(
  target: CombatantState,
  extendRatio: number,
): number {
  let count = 0;
  for (const effect of target.statusEffects) {
    if (effect.overlay !== 'dot') continue;
    extendDotEffect(effect, extendRatio);
    count++;
  }
  return count;
}

export function estimateRemainingDotDamage(
  source: CombatantState,
  target: CombatantState,
  effect: StatusEffect,
  passives: Record<string, PassiveSkillDef>,
): number {
  if (effect.overlay !== 'dot' || effect.remainingSec <= 0) return 0;
  const tickDamage = Math.floor(
    resolveDotAmountFromStatus(source, target, effect, passives) *
      (effect.dotTickDamageMul ?? 1),
  );
  const ticksLeft = Math.max(1, Math.ceil(effect.remainingSec / DOT_TICK_SEC));
  return tickDamage * ticksLeft;
}

export function harvestDotRemainingDamage(
  source: CombatantState,
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
  harvestRatio: number,
): number {
  let total = 0;
  for (const effect of target.statusEffects) {
    if (effect.overlay !== 'dot' || effect.remainingSec <= 0) continue;
    const dotSource =
      effect.sourceId !== undefined
        ? source
        : source;
    total += Math.floor(
      estimateRemainingDotDamage(dotSource, target, effect, passives) *
        harvestRatio,
    );
  }
  return total;
}

export function clonePoisonDotForSpread(
  effect: StatusEffect,
  sourceId: string,
  skillId: string | undefined,
  durationRatio: number,
): StatusEffect | null {
  if (effect.overlay !== 'dot' || effect.dotFlavor !== 'poison') return null;
  if (effect.remainingSec <= 0) return null;
  const newDuration = effect.remainingSec * durationRatio;
  if (newDuration <= 0) return null;
  const appliedAt = Date.now();
  return {
    ...effect,
    id: `${skillId ?? 'spread'}_poison_${appliedAt}_${Math.random().toString(36).slice(2, 8)}`,
    sourceId,
    skillId,
    durationSec: newDuration,
    remainingSec: newDuration,
    tickSec: DOT_TICK_SEC,
    dotTickDamageMul: effect.dotTickDamageMul,
  };
}

export function findUnitsInRadius(
  centerX: number,
  units: CombatantState[],
  radiusPx: number,
): CombatantState[] {
  return units.filter(
    (unit) =>
      unit.isAlive && Math.abs(getBattleX(unit) - centerX) <= radiusPx,
  );
}
