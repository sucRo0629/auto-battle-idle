import {
  applyHealToTarget,
  currentHpRatio,
  getPassiveDefs,
  resolveHealAmount,
} from './combatMath.ts';
import { applyExcessHealToBarrierFromPassive } from './passiveEffects.ts';
import type {
  CombatantState,
  PassiveSkillDef,
  ResourceAmountSpec,
} from './types.ts';

export const HEAL_RESERVATION_BUFF_DISPLAY_NAME = '癒しの残響';

export function resolveHealReservationBuffDisplayName(
  passive: PassiveSkillDef,
): string {
  return passive.buffDisplayName ?? HEAL_RESERVATION_BUFF_DISPLAY_NAME;
}

export function grantHealReservationStacks(
  healer: CombatantState,
  target: CombatantState,
  targetHpRatioBeforeHeal: number,
  passives: Record<string, PassiveSkillDef>,
): void {
  if (healer.isEnemy || target.isEnemy || !target.isAlive) return;

  for (const passive of getPassiveDefs(healer, passives)) {
    if (passive.effect !== 'healReservation') continue;
    const grantThreshold = passive.grantOnHealMaxHpRatio ?? 1;
    if (targetHpRatioBeforeHeal > grantThreshold) continue;

    const durationSec = passive.stackDurationSec ?? 8;
    const healAmount: ResourceAmountSpec =
      passive.healAmount ?? ({ kind: 'atkBased', atkScale: 0.8 } as const);

    target.statusEffects.push({
      id: `heal_reservation_${healer.id}_${passive.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      kind: 'buff',
      overlay: 'healReservation',
      displayName: resolveHealReservationBuffDisplayName(passive),
      multiplier: 1,
      durationSec,
      remainingSec: durationSec,
      sourceId: healer.id,
      skillId: passive.id,
      amount: structuredClone(healAmount),
    });
  }
}

export interface HealReservationTriggerResult {
  healed: number;
  healerId?: string;
  passiveId?: string;
  buffDisplayName?: string;
}

export function tryTriggerHealReservation(
  target: CombatantState,
  allUnits: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): HealReservationTriggerResult {
  if (!target.isAlive || target.isEnemy || target.hp <= 0) {
    return { healed: 0 };
  }

  const reservations = target.statusEffects.filter(
    (effect) =>
      effect.overlay === 'healReservation' && effect.remainingSec > 0,
  );
  if (reservations.length === 0) return { healed: 0 };

  for (const effect of reservations) {
    const passiveId = effect.skillId;
    if (!passiveId) continue;
    const passive = passives[passiveId];
    if (!passive || passive.effect !== 'healReservation') continue;

    const triggerThreshold = passive.triggerHpRatio ?? 0.35;
    if (currentHpRatio(target) > triggerThreshold) continue;

    const healer = allUnits.find((unit) => unit.id === effect.sourceId);
    if (!healer?.isAlive) continue;

    target.statusEffects = target.statusEffects.filter(
      (entry) => entry.id !== effect.id,
    );

    const healAmount: ResourceAmountSpec =
      effect.amount ??
      passive.healAmount ??
      ({ kind: 'atkBased', atkScale: 0.8 } as const);
    const amount = resolveHealAmount(healer, target, healAmount, passives);
    if (amount <= 0) {
      return { healed: 0, healerId: healer.id, passiveId };
    }

    applyExcessHealToBarrierFromPassive(
      healer,
      target,
      amount,
      passives,
      'outgoing',
    );
    const healed = applyHealToTarget(target, amount);
    return { healed, healerId: healer.id, passiveId, buffDisplayName: effect.displayName };
  }

  return { healed: 0 };
}
