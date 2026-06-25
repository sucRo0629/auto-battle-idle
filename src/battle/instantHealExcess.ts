import {
  applyHealToTarget,
  computeInstantHealExcess,
  currentHpRatio,
  getEffectiveMaxHp,
  getPassiveDefs,
} from './combatMath.ts';
import { isAllySupportBlockedDuringArenaDominance } from './arenaDominance.ts';
import {
  applyExcessHealToBarrierFromExcess,
  getPassiveSpecialEffectMultiplier,
  resolveIncomingHealAmount,
} from './passiveEffects.ts';
import type {
  CombatantState,
  PassiveSkillDef,
} from './types.ts';
import type { ExcessHealSource } from './passiveEffects.ts';

export function resolveExcessHealRedirectTarget(
  primaryTarget: CombatantState,
  sameSideAllies: CombatantState[],
): CombatantState | undefined {
  const candidates = sameSideAllies.filter(
    (unit) =>
      unit.isAlive &&
      unit.id !== primaryTarget.id &&
      unit.hp < getEffectiveMaxHp(unit),
  );
  if (candidates.length === 0) return undefined;

  return candidates.reduce((best, current) => {
    const bestRatio = currentHpRatio(best);
    const currentRatio = currentHpRatio(current);
    if (currentRatio < bestRatio - 1e-9) return current;
    if (currentRatio > bestRatio + 1e-9) return best;
    if (getEffectiveMaxHp(current) < getEffectiveMaxHp(best)) return current;
    if (getEffectiveMaxHp(current) > getEffectiveMaxHp(best)) return best;
    return best;
  });
}

/** 転送 heal には specialEffect heal（慈悲の加護等）のみ。effect 特効・再転送は非対象。 */
export function resolveRedirectHealAmount(
  healer: CombatantState,
  redirectTarget: CombatantState,
  redirectBase: number,
  passives: Record<string, PassiveSkillDef>,
): number {
  if (redirectBase <= 0) return 0;
  const outgoingMul = getPassiveSpecialEffectMultiplier(
    'heal',
    healer,
    redirectTarget,
    passives,
  );
  const scaled = Math.floor(Math.max(0, redirectBase * outgoingMul));
  return resolveIncomingHealAmount(redirectTarget, scaled, passives);
}

function passiveExcessHealSourcesForRedirect(
  passive: PassiveSkillDef,
): ExcessHealSource[] {
  const sources = passive.excessHealSources;
  if (!sources || sources.length === 0) return ['outgoing'];
  return sources;
}

function sumRedirectScale(
  owner: CombatantState,
  passives: Record<string, PassiveSkillDef>,
  source: ExcessHealSource,
): number {
  let scaleSum = 0;
  for (const passive of getPassiveDefs(owner, passives)) {
    if (passive.effect !== 'excessHealRedirect') continue;
    if (!passiveExcessHealSourcesForRedirect(passive).includes(source)) continue;
    scaleSum += passive.redirectScale ?? 0;
  }
  return scaleSum;
}

export interface InstantHealExcessEffects {
  redirectTarget?: CombatantState;
  redirectAmount: number;
  outgoingBarrierGranted: number;
  incomingBarrierGranted: number;
}

export function resolveInstantHealExcessEffects(
  healer: CombatantState,
  primaryTarget: CombatantState,
  attemptedHeal: number,
  sameSideAllies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  options: { allowRedirect?: boolean } = {},
): InstantHealExcessEffects {
  const excess = computeInstantHealExcess(primaryTarget, attemptedHeal);
  if (excess <= 0) {
    return {
      redirectAmount: 0,
      outgoingBarrierGranted: 0,
      incomingBarrierGranted: 0,
    };
  }

  let remaining = excess;
  let redirectTarget: CombatantState | undefined;
  let redirectAmount = 0;

  if (options.allowRedirect !== false) {
    const redirectScaleSum = sumRedirectScale(healer, passives, 'outgoing');
    if (redirectScaleSum > 0) {
      const redirectBase = Math.floor(remaining * redirectScaleSum);
      if (redirectBase > 0) {
        redirectTarget = resolveExcessHealRedirectTarget(
          primaryTarget,
          sameSideAllies,
        );
        if (
          redirectTarget &&
          isAllySupportBlockedDuringArenaDominance(redirectTarget, healer)
        ) {
          redirectTarget = undefined;
        }
        if (redirectTarget) {
          redirectAmount = resolveRedirectHealAmount(
            healer,
            redirectTarget,
            redirectBase,
            passives,
          );
          remaining -= redirectBase;
        }
      }
    }
  }

  const outgoingBarrierGranted =
    remaining > 0
      ? applyExcessHealToBarrierFromExcess(
          healer,
          primaryTarget,
          remaining,
          passives,
          'outgoing',
        )
      : 0;
  const incomingBarrierGranted =
    remaining > 0
      ? applyExcessHealToBarrierFromExcess(
          primaryTarget,
          primaryTarget,
          remaining,
          passives,
          'incoming',
        )
      : 0;

  return {
    redirectTarget,
    redirectAmount,
    outgoingBarrierGranted,
    incomingBarrierGranted,
  };
}

export interface DirectHealApplyResult {
  healed: number;
  redirectTarget?: CombatantState;
  redirectHealed: number;
  redirectAmount: number;
  redirectHpRatioBeforeHeal?: number;
  outgoingBarrierGranted: number;
  incomingBarrierGranted: number;
}

export function applyDirectHealWithExcess(
  healer: CombatantState,
  primaryTarget: CombatantState,
  attemptedHeal: number,
  sameSideAllies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  options: { allowRedirect?: boolean } = {},
): DirectHealApplyResult {
  const effects = resolveInstantHealExcessEffects(
    healer,
    primaryTarget,
    attemptedHeal,
    sameSideAllies,
    passives,
    options,
  );

  const healed = applyHealToTarget(primaryTarget, attemptedHeal);
  let redirectHealed = 0;
  let redirectHpRatioBeforeHeal: number | undefined;
  if (effects.redirectTarget && effects.redirectAmount > 0) {
    redirectHpRatioBeforeHeal = currentHpRatio(effects.redirectTarget);
    redirectHealed = applyHealToTarget(
      effects.redirectTarget,
      effects.redirectAmount,
    );
  }

  return {
    healed,
    redirectTarget: effects.redirectTarget,
    redirectHealed,
    redirectAmount: effects.redirectAmount,
    redirectHpRatioBeforeHeal,
    outgoingBarrierGranted: effects.outgoingBarrierGranted,
    incomingBarrierGranted: effects.incomingBarrierGranted,
  };
}

export function sameSideAlliesFrom(
  units: CombatantState[],
  unit: CombatantState,
): CombatantState[] {
  return units.filter((candidate) => candidate.isEnemy === unit.isEnemy);
}
