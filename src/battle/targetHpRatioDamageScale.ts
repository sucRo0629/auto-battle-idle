import { currentHpRatio, getPassiveDefs } from './combatMath.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function resolveTargetHpRatioDamageScale(
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
  attacker: CombatantState,
): number {
  let mul = 1;
  for (const passive of getPassiveDefs(attacker, passives)) {
    if (passive.effect !== 'targetHpRatioDamageScale') continue;
    const damageScaleMax = passive.damageScaleMax ?? 1;
    const minScaleAtHpRatio = passive.minScaleAtHpRatio ?? 0;
    if (damageScaleMax <= 1) continue;

    const hpRatio = currentHpRatio(target);
    if (hpRatio >= 1) {
      mul *= damageScaleMax;
      continue;
    }
    if (hpRatio <= minScaleAtHpRatio) {
      continue;
    }
    const span = 1 - minScaleAtHpRatio;
    if (span <= 0) {
      mul *= damageScaleMax;
      continue;
    }
    const t = clamp01((hpRatio - minScaleAtHpRatio) / span);
    mul *= 1 + (damageScaleMax - 1) * t;
  }
  return mul;
}
