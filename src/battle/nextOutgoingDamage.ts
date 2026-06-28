import type { CombatantState } from "./types.ts";

export const NEXT_OUTGOING_DAMAGE_OVERLAY = "nextOutgoingDamage" as const;
const NEXT_OUTGOING_DAMAGE_ID_PREFIX = "next_outgoing_damage_";

export function scheduleNextOutgoingDamageCharge(
  actor: CombatantState,
  multiplier: number,
  skillId: string,
  armed: boolean
): void {
  if (multiplier <= 1) return;
  actor.nextOutgoingDamageCharge = { multiplier, armed, skillId };
  syncNextOutgoingDamageOverlay(actor);
}

export function armNextOutgoingDamageCharge(actor: CombatantState): void {
  const charge = actor.nextOutgoingDamageCharge;
  if (!charge || charge.armed) return;
  charge.armed = true;
  syncNextOutgoingDamageOverlay(actor);
}

export function clearNextOutgoingDamageCharge(actor: CombatantState): void {
  delete actor.nextOutgoingDamageCharge;
  actor.statusEffects = actor.statusEffects.filter(
    (effect) => effect.overlay !== NEXT_OUTGOING_DAMAGE_OVERLAY
  );
}

function syncNextOutgoingDamageOverlay(actor: CombatantState): void {
  const charge = actor.nextOutgoingDamageCharge;
  const effectId = `${NEXT_OUTGOING_DAMAGE_ID_PREFIX}${actor.id}`;
  actor.statusEffects = actor.statusEffects.filter(
    (effect) =>
      effect.id !== effectId && effect.overlay !== NEXT_OUTGOING_DAMAGE_OVERLAY
  );
  if (!charge?.armed) return;
  actor.statusEffects.push({
    id: effectId,
    kind: "buff",
    overlay: NEXT_OUTGOING_DAMAGE_OVERLAY,
    multiplier: charge.multiplier,
    durationSec: 99999,
    remainingSec: 99999,
    sourceId: actor.id,
    skillId: charge.skillId,
    displayName: "次のダメージ増加",
  });
}

export function peekNextOutgoingDamageMultiplier(
  actor: CombatantState
): number {
  const charge = actor.nextOutgoingDamageCharge;
  if (!charge?.armed || charge.multiplier <= 1) return 1;
  return charge.multiplier;
}

export function consumeNextOutgoingDamageMultiplier(
  actor: CombatantState
): number {
  const mul = peekNextOutgoingDamageMultiplier(actor);
  if (mul > 1) {
    clearNextOutgoingDamageCharge(actor);
  }
  return mul;
}

export function tickNextOutgoingDamageArming(
  units: CombatantState[],
  wasUseLocked: (actorId: string) => boolean,
  isUseLocked: (actorId: string) => boolean
): void {
  for (const unit of units) {
    if (!unit.nextOutgoingDamageCharge || unit.nextOutgoingDamageCharge.armed) {
      continue;
    }
    if (wasUseLocked(unit.id) && !isUseLocked(unit.id)) {
      armNextOutgoingDamageCharge(unit);
    }
  }
}
