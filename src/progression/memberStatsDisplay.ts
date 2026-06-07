import { ATTACK_SPEED_TIER_LABELS } from '../battle/data/gameDataSchema.ts';
import type { AttackSpeedTier, ClassPreset } from '../battle/types.ts';
import { computeStatsAtLevel, type LevelCurvesConfig } from './levelGrowth.ts';

export interface MemberDisplayStats {
  level: number;
  maxHp: number;
  atk: number;
  def: number;
  reg: number;
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
      reg: preset.reg,
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
    reg: stats.reg,
    spdLabel: ATTACK_SPEED_TIER_LABELS[tier],
  };
}
