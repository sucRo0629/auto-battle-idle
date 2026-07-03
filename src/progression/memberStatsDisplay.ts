import { getAttackSpeedTierLabel } from '../i18n/memberStatLabels.ts';
import type { AttackSpeedTier, ClassPreset } from '../battle/types.ts';
import { computeStatsAtLevel, type LevelCurvesConfig } from './levelGrowth.ts';

export interface MemberDisplayStats {
  level: number;
  maxHp: number;
  atk: number;
  def: number;
  res: number;
  spdLabel: string;
}

export function resolveAttackSpeedTier(preset: ClassPreset): AttackSpeedTier {
  return preset.attackSpeedTier ?? 'normal';
}

export function resolveMemberDisplayStats(
  preset: ClassPreset,
  level: number,
  curves: LevelCurvesConfig,
): MemberDisplayStats {
  const stats = computeStatsAtLevel(
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
  const tier = resolveAttackSpeedTier(preset);

  return {
    level,
    maxHp: stats.maxHp,
    atk: stats.atk,
    def: stats.def,
    res: stats.res,
    spdLabel: getAttackSpeedTierLabel(tier),
  };
}
