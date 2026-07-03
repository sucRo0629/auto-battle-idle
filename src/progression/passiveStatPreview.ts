import {
  aggregateStatEffects,
  computeEffectiveStat,
} from '../battle/statusEffectDisplay.ts';
import type {
  PassiveSkillDef,
  SkillRegistry,
  StatusEffect,
  StatusEffectStat,
  StatBuffTarget,
} from '../battle/types.ts';
import { asStatusEffectStatList, filterStatusEffectStats } from '../battle/types.ts';
import { parseStatBuffModifiers } from '../battle/statBuffModifiers.ts';
import {
  computeStatsAtLevel,
  type LevelCurvesConfig,
} from './levelGrowth.ts';
import {
  enrichClassPreset,
  resolveLearnedSkills,
  type ClassPresetBeforeEnrich,
} from './skillUnlocks.ts';

const SELF_HP_BUFF_NEUTRAL_EPSILON = 0.001;

export interface PreviewCombatStats {
  base: { maxHp: number; atk: number; def: number; res: number };
  effective: { maxHp: number; atk: number; def: number; res: number };
  attackSpeedMultiplier: number;
  hasPassiveStatModifiers: boolean;
}

function resolveHpRatioBuffScale(
  hpRatio: number,
  maxBuffAtHpRatio: number,
): number {
  if (maxBuffAtHpRatio >= 1) return 0;
  const denom = 1 - maxBuffAtHpRatio;
  if (denom <= 0) return 0;
  return Math.max(0, Math.min(1, (1 - hpRatio) / denom));
}

function isSelfTargetRule(
  rule: PassiveSkillDef['buffTargetRule'] | PassiveSkillDef['damageReductionTargetRule'],
): boolean {
  return (rule ?? { kind: 'self' }).kind === 'self';
}

function pushStatBuffEffect(
  effects: StatusEffect[],
  stat: StatBuffTarget,
  multiplier?: number,
  flatBonus?: number,
): void {
  if (multiplier === undefined && flatBonus === undefined) return;
  effects.push({
    id: `preview_${effects.length}`,
    kind: 'buff',
    stat,
    multiplier: multiplier ?? 1,
    ...(flatBonus !== undefined ? { flatBonus: Math.abs(flatBonus) } : {}),
    sourceId: 'preview',
    durationSec: 1,
    remainingSec: 1,
  });
}

function collectSelfHpRatioBuffEffects(
  passive: PassiveSkillDef,
  hpRatio: number,
  effects: StatusEffect[],
): void {
  const maxBuffAtHpRatio = passive.maxBuffAtHpRatio ?? 0;
  const scale = resolveHpRatioBuffScale(hpRatio, maxBuffAtHpRatio);
  if (scale <= 0) return;

  const stats = filterStatusEffectStats(passive.buffStat);
  if (stats.length === 0) return;

  for (const stat of stats) {
    let multiplier = 1;
    let flatBonus: number | undefined;

    if (passive.buffMultiplierMax !== undefined) {
      multiplier = 1 + (passive.buffMultiplierMax - 1) * scale;
    }
    if (passive.buffFlatBonusMax !== undefined) {
      flatBonus = passive.buffFlatBonusMax * scale;
    }

    const hasMul =
      Math.abs(multiplier - 1) >= SELF_HP_BUFF_NEUTRAL_EPSILON;
    const hasFlat = flatBonus !== undefined && flatBonus > 0;
    if (!hasMul && !hasFlat) continue;

    pushStatBuffEffect(effects, stat, multiplier, flatBonus);
  }
}

function collectBuffPassiveStatEffects(
  passive: PassiveSkillDef,
  effects: StatusEffect[],
): void {
  if (passive.effect !== 'buff') return;
  const subKind = passive.buffSubKind ?? 'stat';
  if (subKind !== 'stat') return;
  if (!isSelfTargetRule(passive.buffTargetRule)) return;

  const modifiers = parseStatBuffModifiers(passive);
  if (modifiers.length === 0) return;

  for (const entry of modifiers) {
    pushStatBuffEffect(
      effects,
      entry.stat,
      entry.multiplier,
      entry.flatBonus,
    );
  }
}

function collectDamageReductionStatEffects(
  passive: PassiveSkillDef,
  effects: StatusEffect[],
): void {
  if (passive.effect !== 'damageReduction') return;
  if (!isSelfTargetRule(passive.damageReductionTargetRule)) return;
  const percent = passive.damageReductionPercent ?? 0;
  if (percent <= 0) return;
  pushStatBuffEffect(effects, 'damageTaken', Math.max(0, 1 - percent));
}

export function collectSelfPassiveStatEffects(
  passiveIds: string[],
  passives: Record<string, PassiveSkillDef>,
  hpRatio = 1,
): StatusEffect[] {
  const effects: StatusEffect[] = [];

  for (const passiveId of passiveIds) {
    const passive = passives[passiveId];
    if (!passive) continue;

    collectBuffPassiveStatEffects(passive, effects);

    if (passive.effect === 'selfHpRatioBuff') {
      collectSelfHpRatioBuffEffects(passive, hpRatio, effects);
    }

    collectDamageReductionStatEffects(passive, effects);
  }

  return effects;
}

function applyPreviewStat(
  base: number,
  effects: StatusEffect[],
  stat: StatusEffectStat,
): number {
  return computeEffectiveStat(
    base,
    aggregateStatEffects(effects, stat),
  );
}

export function computePreviewCombatStats(
  preset: ClassPresetBeforeEnrich,
  level: number,
  curves: LevelCurvesConfig,
  registry: SkillRegistry,
  options?: { hpRatio?: number },
): PreviewCombatStats {
  const base = computeStatsAtLevel(
    {
      maxHp: preset.maxHp,
      atk: preset.atk,
      def: preset.def,
      res: preset.res,
    },
    preset,
    level,
    curves,
  );

  const enriched = enrichClassPreset(preset, registry, { lenient: true });
  const { learnedPassiveIds } = resolveLearnedSkills(
    enriched,
    level,
    registry,
  );
  const effects = collectSelfPassiveStatEffects(
    learnedPassiveIds,
    registry.passives,
    options?.hpRatio ?? 1,
  );

  const effective = {
    maxHp: applyPreviewStat(base.maxHp, effects, 'hp'),
    atk: applyPreviewStat(base.atk, effects, 'atk'),
    def: applyPreviewStat(base.def, effects, 'def'),
    res: applyPreviewStat(base.res, effects, 'res'),
  };
  const attackSpeedMultiplier = applyPreviewStat(1, effects, 'attackSpeed');

  const hasPassiveStatModifiers =
    effective.maxHp !== base.maxHp ||
    effective.atk !== base.atk ||
    effective.def !== base.def ||
    effective.res !== base.res ||
    attackSpeedMultiplier !== 1;

  return {
    base,
    effective,
    attackSpeedMultiplier,
    hasPassiveStatModifiers,
  };
}
