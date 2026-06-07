import type { StatusEffect } from './types.ts';

export type StatusDisplayCategory = 'atk' | 'def' | 'reg' | 'hot' | 'dot';

export const STATUS_BADGE_SLOT_ORDER: StatusDisplayCategory[] = [
  'atk',
  'def',
  'reg',
  'hot',
  'dot',
];

export const STATUS_BADGE_SLOT_COUNT = 5;

const NEUTRAL_EPSILON = 0.001;

export interface StatAggregation {
  netFlat: number;
  netMul: number;
}

export interface AggregatedCategoryEffect {
  category: StatusDisplayCategory;
  netFlat: number;
  netMul: number;
  kind: 'buff' | 'debuff';
  /** 1 = 残り時間満タン / 0 = 切れ */
  remainingRatio: number;
}

export interface StatBadgeBaseStats {
  atk: number;
  def: number;
  reg: number;
}

function effectsForCategory(
  effects: StatusEffect[],
  category: StatusDisplayCategory,
): StatusEffect[] {
  if (category === 'hot') {
    return effects.filter((effect) => effect.overlay === 'hot');
  }
  if (category === 'dot') {
    return effects.filter((effect) => effect.overlay === 'dot');
  }
  if (category === 'atk') {
    return effects.filter((effect) => effect.stat === 'atk');
  }
  if (category === 'def') {
    return effects.filter((effect) => effect.stat === 'def');
  }
  if (category === 'reg') {
    return effects.filter((effect) => effect.stat === 'reg');
  }
  return [];
}

export function categoryRemainingRatio(
  effects: StatusEffect[],
  category: StatusDisplayCategory,
): number {
  const relevant = effectsForCategory(effects, category);
  if (relevant.length === 0) return 1;

  let minRatio = 1;
  for (const effect of relevant) {
    const duration = effect.durationSec > 0 ? effect.durationSec : effect.remainingSec;
    if (duration <= 0) continue;
    const ratio = Math.max(0, Math.min(1, effect.remainingSec / duration));
    minRatio = Math.min(minRatio, ratio);
  }
  return minRatio;
}

function aggregateStatCategory(
  effects: StatusEffect[],
  category: 'atk' | 'def' | 'reg',
  base: number,
): AggregatedCategoryEffect | null {
  const agg = aggregateStatEffects(effects, category);
  const kind = statEffectKind(base, category, agg);
  if (!kind) return null;

  return {
    category,
    netFlat: agg.netFlat,
    netMul: agg.netMul,
    kind,
    remainingRatio: categoryRemainingRatio(effects, category),
  };
}

function aggregateOverlayCategory(
  effects: StatusEffect[],
  category: 'hot' | 'dot',
): AggregatedCategoryEffect | null {
  const relevant = effectsForCategory(effects, category);
  if (relevant.length === 0) return null;

  return {
    category,
    netFlat: 0,
    netMul: 1,
    kind: category === 'hot' ? 'buff' : 'debuff',
    remainingRatio: categoryRemainingRatio(effects, category),
  };
}

export function aggregateStatEffects(
  effects: StatusEffect[],
  stat: StatusEffect['stat'],
): StatAggregation {
  let netFlat = 0;
  let netMul = 1;

  for (const effect of effects) {
    if (effect.stat !== stat) continue;
    const flat = effect.flatBonus ?? 0;
    netFlat += effect.kind === 'buff' ? flat : -flat;
    netMul *= effect.multiplier;
  }

  return { netFlat, netMul };
}

export function computeEffectiveStat(
  base: number,
  aggregation: StatAggregation,
): number {
  return Math.max(0, (base + aggregation.netFlat) * aggregation.netMul);
}

export function isStatNeutral(
  base: number,
  aggregation: StatAggregation,
): boolean {
  const effective = computeEffectiveStat(base, aggregation);
  return Math.abs(effective - base) < NEUTRAL_EPSILON;
}

export function statEffectKind(
  base: number,
  stat: NonNullable<StatusEffect['stat']>,
  aggregation: StatAggregation,
): 'buff' | 'debuff' | null {
  if (isStatNeutral(base, aggregation)) return null;

  const effective = computeEffectiveStat(base, aggregation);
  if (stat === 'damageTaken') {
    return effective < base ? 'buff' : 'debuff';
  }
  return effective > base ? 'buff' : 'debuff';
}

export function aggregateStatStatusEffects(
  effects: StatusEffect[],
  baseStats: StatBadgeBaseStats,
): AggregatedCategoryEffect[] {
  const result: AggregatedCategoryEffect[] = [];

  for (const category of ['atk', 'def', 'reg'] as const) {
    const badge = aggregateStatCategory(
      effects,
      category,
      baseStats[category],
    );
    if (badge) result.push(badge);
  }

  for (const category of ['hot', 'dot'] as const) {
    const badge = aggregateOverlayCategory(effects, category);
    if (badge) result.push(badge);
  }

  return result;
}

export function isCategoryEffectVisible(
  agg: AggregatedCategoryEffect,
): boolean {
  return agg.kind === 'buff' || agg.kind === 'debuff';
}
