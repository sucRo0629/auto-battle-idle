import { DEFAULT_BASIC_ATTACK_INTERVAL_SEC } from '../battle/data/synthesizeBasicAttack.ts';
import type { AttackSpeedTier } from '../battle/types.ts';
import {
  getBasicCooldownRate,
  type LevelCurvesConfig,
} from './levelGrowth.ts';

export function computeEffectiveBasicAttackIntervalSec(
  attackSpeedTier: AttackSpeedTier,
  curves: LevelCurvesConfig,
  baseIntervalSec = DEFAULT_BASIC_ATTACK_INTERVAL_SEC,
  attackSpeedMultiplier = 1,
): number {
  const cdRate = getBasicCooldownRate(attackSpeedTier, curves);
  const rate = cdRate * Math.max(0, attackSpeedMultiplier);
  if (rate <= 0) return Number.POSITIVE_INFINITY;
  return baseIntervalSec / rate;
}

export function computeBasicAttackDps(
  atk: number,
  attackSpeedTier: AttackSpeedTier,
  curves: LevelCurvesConfig,
  attackSpeedMultiplier = 1,
): number {
  const damagePerHit = Math.floor(Math.max(0, atk));
  const intervalSec = computeEffectiveBasicAttackIntervalSec(
    attackSpeedTier,
    curves,
    DEFAULT_BASIC_ATTACK_INTERVAL_SEC,
    attackSpeedMultiplier,
  );
  if (!Number.isFinite(intervalSec) || intervalSec <= 0) return 0;
  return damagePerHit / intervalSec;
}

export function formatBasicAttackDps(dps: number): string {
  return dps.toFixed(1);
}
