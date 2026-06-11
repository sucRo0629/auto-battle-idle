import { hasMatchingDebuff, resolveDispelTags } from './debuffMatching.ts';
import type {
  CombatantState,
  DebuffFilterTag,
  DispelPriority,
  StatusEffect,
} from './types.ts';

function isDispellableEffect(
  effect: StatusEffect,
  tags: DebuffFilterTag[],
  selfSourceId?: string,
): boolean {
  if (effect.remainingSec <= 0) return false;
  return hasMatchingDebuff(
    { statusEffects: [effect] } as CombatantState,
    tags,
    { selfSourceId },
  );
}

export function getDebuffMagnitude(effect: StatusEffect): number {
  if (effect.stat) {
    const flat = Math.abs(effect.flatBonus ?? 0);
    if (effect.stat === 'damageTaken') {
      return Math.max(0, effect.multiplier - 1) + flat;
    }
    return Math.max(0, 1 - effect.multiplier) + flat;
  }
  if (effect.overlay === 'dot') {
    if (effect.amount?.kind === 'atkBased') {
      return effect.amount.atkScale ?? 1;
    }
    if (effect.amount?.kind === 'flat') {
      return effect.amount.flatAmount ?? 0;
    }
    return effect.powerMultiplier ?? 0;
  }
  if (effect.overlay === 'stun' || effect.kind === 'cc') {
    return 1;
  }
  return 0;
}

function compareDispelCandidates(
  a: { effect: StatusEffect; index: number },
  b: { effect: StatusEffect; index: number },
  priority: DispelPriority,
): number {
  if (priority === 'strongest') {
    const magDiff = getDebuffMagnitude(b.effect) - getDebuffMagnitude(a.effect);
    if (magDiff !== 0) return magDiff;
    return a.index - b.index;
  }
  const timeDiff = b.effect.remainingSec - a.effect.remainingSec;
  if (timeDiff !== 0) return timeDiff;
  return a.index - b.index;
}

export function dispelDebuffsOnTarget(
  target: CombatantState,
  dispelCount: number,
  dispelTags?: DebuffFilterTag[],
  selfSourceId?: string,
  dispelPriority: DispelPriority = 'longest',
): number {
  const tags = resolveDispelTags(dispelTags);
  const candidates = target.statusEffects
    .map((effect, index) => ({ effect, index }))
    .filter(({ effect }) => isDispellableEffect(effect, tags, selfSourceId));

  if (candidates.length === 0) return 0;

  let toRemove: number[];
  if (dispelCount <= 0) {
    toRemove = candidates.map(({ index }) => index);
  } else {
    toRemove = [...candidates]
      .sort((a, b) => compareDispelCandidates(a, b, dispelPriority))
      .slice(0, dispelCount)
      .map(({ index }) => index);
  }

  const removeSet = new Set(toRemove);
  const before = target.statusEffects.length;
  target.statusEffects = target.statusEffects.filter(
    (_, index) => !removeSet.has(index),
  );
  return before - target.statusEffects.length;
}
