import { hasMatchingDebuff, resolveDispelTags } from './debuffMatching.ts';
import type { CombatantState, DebuffFilterTag, StatusEffect } from './types.ts';

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

export function dispelDebuffsOnTarget(
  target: CombatantState,
  dispelCount: number,
  dispelTags?: DebuffFilterTag[],
  selfSourceId?: string,
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
      .sort(
        (a, b) =>
          b.effect.remainingSec - a.effect.remainingSec ||
          a.index - b.index,
      )
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
