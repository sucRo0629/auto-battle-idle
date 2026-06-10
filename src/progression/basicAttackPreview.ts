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
): number {
  const cdRate = getBasicCooldownRate(attackSpeedTier, curves);
  return baseIntervalSec / cdRate;
}

export function computeBasicAttackDps(
  atk: number,
  attackSpeedTier: AttackSpeedTier,
  curves: LevelCurvesConfig,
): number {
  const damagePerHit = Math.floor(Math.max(0, atk));
  const intervalSec = computeEffectiveBasicAttackIntervalSec(
    attackSpeedTier,
    curves,
  );
  if (intervalSec <= 0) return 0;
  return damagePerHit / intervalSec;
}

export function formatBasicAttackDps(dps: number): string {
  return dps.toFixed(1);
}
