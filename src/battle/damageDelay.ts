import { isInvulnerable } from './invulnerable.ts';
import {
  applyConfirmedHpDamage,
  applyDamageToTarget,
  type DamageApplicationResult,
} from './combatMath.ts';
import type { CombatantState, StatusEffect } from './types.ts';

export interface IncomingDamageResult {
  damageResult: DamageApplicationResult;
  immediateDamage: number;
  delayedDamage: number;
  totalDamage: number;
}

export function getEffectiveDamageDelayRatio(
  statusEffects: StatusEffect[],
): number {
  let sum = 0;
  for (const effect of statusEffects) {
    if (effect.remainingSec <= 0) continue;
    if (effect.overlay !== 'damageDelay') continue;
    sum += effect.ratio ?? 0;
  }
  return Math.min(1, sum);
}

export function hasActiveDamageDelay(statusEffects: StatusEffect[]): boolean {
  return getEffectiveDamageDelayRatio(statusEffects) > 0;
}

export function getDamageDelayRemainingSec(
  statusEffects: StatusEffect[],
): number {
  let maxRemaining = 0;
  for (const effect of statusEffects) {
    if (effect.remainingSec <= 0) continue;
    if (effect.overlay !== 'damageDelay') continue;
    maxRemaining = Math.max(maxRemaining, effect.remainingSec);
  }
  return maxRemaining;
}

export function computeDamageDelayTickAmount(
  pool: number,
  remainingSec: number,
): number {
  if (pool <= 0) return 0;
  if (remainingSec <= 0) return pool;
  const intervals = Math.max(1, Math.ceil(remainingSec));
  return Math.min(pool, Math.max(1, Math.floor(pool / intervals)));
}

export interface ApplyIncomingDamageOptions {
  /** barrierHp を消費せず HP に直接適用 */
  skipBarrier?: boolean;
}

export function applyIncomingDamage(
  target: CombatantState,
  finalDamage: number,
  options: ApplyIncomingDamageOptions = {},
): IncomingDamageResult {
  if (finalDamage <= 0 || !target.isAlive || isInvulnerable(target)) {
    return {
      damageResult: { hpDamage: 0, barrierDamage: 0, lethal: false },
      immediateDamage: 0,
      delayedDamage: 0,
      totalDamage: 0,
    };
  }

  const ratio = getEffectiveDamageDelayRatio(target.statusEffects);
  const delayedDamage =
    ratio > 0 ? Math.floor(finalDamage * ratio) : 0;
  const immediateDamage = finalDamage - delayedDamage;
  const damageResult = options.skipBarrier
    ? applyConfirmedHpDamage(target, immediateDamage)
    : applyDamageToTarget(target, immediateDamage);

  if (delayedDamage > 0) {
    target.delayedDamagePool = (target.delayedDamagePool ?? 0) + delayedDamage;
  }

  return {
    damageResult,
    immediateDamage,
    delayedDamage,
    totalDamage: finalDamage,
  };
}

export function applyDelayedDamageTick(
  target: CombatantState,
  amount: number,
): DamageApplicationResult {
  if (amount <= 0 || !target.isAlive) {
    return { hpDamage: 0, barrierDamage: 0, lethal: false };
  }
  const pool = target.delayedDamagePool ?? 0;
  const applied = Math.min(pool, amount);
  target.delayedDamagePool = Math.max(0, pool - applied);
  return applyConfirmedHpDamage(target, applied);
}

export function flushDelayedDamagePool(
  target: CombatantState,
): DamageApplicationResult {
  const pool = target.delayedDamagePool ?? 0;
  if (pool <= 0 || !target.isAlive) {
    return { hpDamage: 0, barrierDamage: 0, lethal: false };
  }
  target.delayedDamagePool = 0;
  return applyConfirmedHpDamage(target, pool);
}
