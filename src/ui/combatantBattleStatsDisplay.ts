import { getMemberStatLabels, getAttackSpeedTierLabel } from '../i18n/memberStatLabels.ts';
import { getLocale } from '../i18n/locale.ts';
import {
  aggregateStatEffects,
  computeEffectiveStat,
  statEffectKind,
} from '../battle/statusEffectDisplay.ts';
import type {
  AttackSpeedTier,
  CombatantSnapshot,
  StatusEffect,
  StatusEffectStat,
} from '../battle/types.ts';
import { resolveAttackSpeedTier } from '../progression/memberStatsDisplay.ts';

const NEUTRAL_EPSILON = 0.001;

export type StatDeltaKind = 'up' | 'down';

export interface CombatantBattleStatRow {
  label: string;
  valueText: string;
  deltaText: string | null;
  deltaKind: StatDeltaKind | null;
  latinLabel?: boolean;
}

function formatIntDelta(delta: number): {
  text: string | null;
  kind: StatDeltaKind | null;
} {
  if (Math.abs(delta) < NEUTRAL_EPSILON) {
    return { text: null, kind: null };
  }
  const rounded = Math.round(delta);
  const signed = `${rounded > 0 ? '+' : ''}${rounded}`;
  return {
    text: `(${signed})`,
    kind: rounded > 0 ? 'up' : 'down',
  };
}

function wrapDeltaSuffix(
  deltaText: string | null,
  suffix: string,
): string | null {
  if (!deltaText) return null;
  return `${deltaText.slice(0, -1)}${suffix})`;
}

function buildNumericStatRow(
  label: string,
  base: number,
  stat: StatusEffectStat,
  effects: StatusEffect[],
  options?: { valueSuffix?: string; latinLabel?: boolean },
): CombatantBattleStatRow {
  const aggregation = aggregateStatEffects(effects, stat);
  const effective = computeEffectiveStat(base, aggregation);
  const delta = effective - base;
  const effectKind = statEffectKind(base, stat, aggregation);
  const { text: deltaText } = formatIntDelta(delta);
  const suffix = options?.valueSuffix ?? '';

  return {
    label,
    valueText: `${Math.round(effective)}${suffix}`,
    deltaText: deltaText ? wrapDeltaSuffix(deltaText, suffix) : null,
    deltaKind:
      effectKind === 'buff' ? 'up' : effectKind === 'debuff' ? 'down' : null,
    latinLabel: options?.latinLabel,
  };
}

function buildHpRow(ally: CombatantSnapshot): CombatantBattleStatRow {
  const labels = getMemberStatLabels();
  const baseMaxHp = ally.baseMaxHp;
  const aggregation = aggregateStatEffects(ally.statusEffects, 'hp');
  const effectKind = statEffectKind(baseMaxHp, 'hp', aggregation);
  const { text: deltaText, kind: numericKind } = formatIntDelta(
    ally.maxHp - baseMaxHp,
  );
  const deltaKind =
    effectKind === 'buff'
      ? 'up'
      : effectKind === 'debuff'
        ? 'down'
        : numericKind;

  return {
    label: labels.hp,
    valueText: `${Math.round(ally.hp)} / ${Math.round(ally.maxHp)}`,
    deltaText,
    deltaKind,
    latinLabel: true,
  };
}

function formatAttackSpeedMultiplierDelta(multiplier: number): {
  text: string | null;
  kind: StatDeltaKind | null;
} {
  if (Math.abs(multiplier - 1) < NEUTRAL_EPSILON) {
    return { text: null, kind: null };
  }
  const rounded = Math.round(multiplier * 100) / 100;
  return {
    text: `(×${rounded})`,
    kind: multiplier > 1 ? 'up' : 'down',
  };
}

function buildSpdRow(
  effects: StatusEffect[],
  attackSpeedTier: AttackSpeedTier,
): CombatantBattleStatRow {
  const aggregation = aggregateStatEffects(effects, 'attackSpeed');
  const multiplier = computeEffectiveStat(1, aggregation);
  const tier = resolveAttackSpeedTier({ attackSpeedTier });
  const { text: deltaText, kind: deltaKind } =
    formatAttackSpeedMultiplierDelta(multiplier);
  const labels = getMemberStatLabels();

  return {
    label: labels.spd,
    valueText: getAttackSpeedTierLabel(tier, getLocale()),
    deltaText,
    deltaKind,
  };
}

export function buildCombatantBattleStatRows(
  ally: CombatantSnapshot,
  attackSpeedTier: AttackSpeedTier,
): CombatantBattleStatRow[] {
  const labels = getMemberStatLabels();
  return [
    buildHpRow(ally),
    buildNumericStatRow(
      labels.atk,
      ally.atk,
      'atk',
      ally.statusEffects,
    ),
    buildNumericStatRow(
      labels.def,
      ally.def,
      'def',
      ally.statusEffects,
    ),
    buildNumericStatRow(
      labels.reg,
      ally.reg,
      'reg',
      ally.statusEffects,
      { valueSuffix: '%' },
    ),
    buildSpdRow(ally.statusEffects, attackSpeedTier),
  ];
}
