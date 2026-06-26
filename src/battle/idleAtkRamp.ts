import {
  aggregateStatEffects,
  computeEffectiveStat,
} from './statusEffectDisplay.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

export interface MergedIdleAtkRampConfig {
  rampToMaxSec: number;
  atkMulMin: number;
  atkMulMax: number;
  fullRampAttackSpeedMul: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getPassiveDefs(
  combatant: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): PassiveSkillDef[] {
  return combatant.build.learnedPassiveIds
    .map((id) => passives[id])
    .filter((p): p is PassiveSkillDef => p !== undefined);
}

function getEffectiveAttackSpeedMultiplier(
  combatant: CombatantState,
): number {
  const agg = aggregateStatEffects(combatant.statusEffects, 'attackSpeed');
  return computeEffectiveStat(1, agg);
}

export function mergeIdleAtkRampPassives(
  passives: PassiveSkillDef[],
): MergedIdleAtkRampConfig | undefined {
  let config: MergedIdleAtkRampConfig | undefined;
  for (const passive of passives) {
    if (passive.effect !== 'idleAtkRamp') continue;
    config = {
      rampToMaxSec: passive.rampToMaxSec ?? 2.5,
      atkMulMin: passive.atkMulMin ?? 1.25,
      atkMulMax: passive.atkMulMax ?? 1.6,
      fullRampAttackSpeedMul: passive.fullRampAttackSpeedMul ?? 0.7,
    };
  }
  return config;
}

export function resolveIdleAtkRampSeverity(
  actor: CombatantState,
  fullRampAttackSpeedMul: number,
): number {
  const attackSpeedMul = getEffectiveAttackSpeedMultiplier(actor);
  const denom = 1 - fullRampAttackSpeedMul;
  if (denom <= 0) return 0;
  return clamp01((1 - attackSpeedMul) / denom);
}

export function resolveIdleAtkRampMultiplier(
  actor: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): number {
  const config = mergeIdleAtkRampPassives(getPassiveDefs(actor, passives));
  if (!config) return 1;

  const severity = resolveIdleAtkRampSeverity(
    actor,
    config.fullRampAttackSpeedMul,
  );
  const maxAtkMul =
    config.atkMulMin + (config.atkMulMax - config.atkMulMin) * severity;
  const elapsed = actor.idleAtkRampElapsedSec ?? 0;
  const rampProgress = Math.min(
    elapsed / Math.max(config.rampToMaxSec, 1e-6),
    1,
  );
  return 1 + (maxAtkMul - 1) * rampProgress;
}

export function tickIdleAtkRamp(
  units: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  deltaTime: number,
): void {
  if (deltaTime <= 0) return;
  for (const unit of units) {
    if (!unit.isAlive) continue;
    if (!mergeIdleAtkRampPassives(getPassiveDefs(unit, passives))) continue;
    unit.idleAtkRampElapsedSec = (unit.idleAtkRampElapsedSec ?? 0) + deltaTime;
  }
}

export function resetIdleAtkRampOnAttack(actor: CombatantState): void {
  actor.idleAtkRampElapsedSec = 0;
}
