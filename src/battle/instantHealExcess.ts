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
  return resolveExcessHealRedirectTargetExcluding(
    new Set([primaryTarget.id]),
    sameSideAllies,
  );
}

export function resolveExcessHealRedirectTargetExcluding(
  excludedIds: ReadonlySet<string>,
  sameSideAllies: CombatantState[],
): CombatantState | undefined {
  const candidates = sameSideAllies.filter(
    (unit) =>
      unit.isAlive &&
      !excludedIds.has(unit.id) &&
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

/** 単体回復行動 vs 範囲・複数対象回復行動。有効対象人数では決めない。 */
export type HealActionScope = 'single' | 'multi';

export function resolveHealActionScopeFromTargetShape(
  targetShape: import('./types.ts').TargetShape | undefined,
  effectRangeForm?: import('./types.ts').EffectRangeForm,
): HealActionScope {
  if (effectRangeForm !== undefined && effectRangeForm !== 'single') {
    return 'multi';
  }
  if (!targetShape || targetShape === 'single') {
    return 'single';
  }
  return 'multi';
}

function sumRedirectScale(
  owner: CombatantState,
  passives: Record<string, PassiveSkillDef>,
  source: ExcessHealSource,
  healActionScope: HealActionScope,
): number {
  let scaleSum = 0;
  for (const passive of getPassiveDefs(owner, passives)) {
    if (passive.effect !== 'excessHealRedirect') continue;
    if (!passiveExcessHealSourcesForRedirect(passive).includes(source)) continue;
    scaleSum +=
      healActionScope === 'multi'
        ? (passive.redirectScaleMulti ?? passive.redirectScale ?? 0)
        : (passive.redirectScale ?? 0);
  }
  return scaleSum;
}

export interface InstantHealExcessEffects {
  redirectTarget?: CombatantState;
  redirectAmount: number;
  outgoingBarrierGranted: number;
  incomingBarrierGranted: number;
}

export interface InstantHealTargetEntry {
  target: CombatantState;
  attemptedHeal: number;
}

export interface InstantHealBatchTargetResult {
  target: CombatantState;
  healed: number;
  excess: number;
  hpRatioBeforeHeal: number;
  outgoingBarrierGranted: number;
  incomingBarrierGranted: number;
}

export interface DirectHealBatchApplyResult {
  targets: InstantHealBatchTargetResult[];
  redirectTarget?: CombatantState;
  redirectHealed: number;
  redirectAmount: number;
  redirectHpRatioBeforeHeal?: number;
}

function allocateRemainingExcess(
  excessValues: number[],
  remainingTotal: number,
): number[] {
  if (remainingTotal <= 0 || excessValues.length === 0) {
    return excessValues.map(() => 0);
  }
  const totalExcess = excessValues.reduce((sum, value) => sum + value, 0);
  if (totalExcess <= 0) {
    return excessValues.map(() => 0);
  }
  let allocated = 0;
  return excessValues.map((value, index) => {
    if (index === excessValues.length - 1) {
      return Math.max(0, remainingTotal - allocated);
    }
    const share = Math.floor((value / totalExcess) * remainingTotal);
    allocated += share;
    return share;
  });
}

export function resolveInstantHealExcessEffects(
  healer: CombatantState,
  primaryTarget: CombatantState,
  attemptedHeal: number,
  sameSideAllies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  options: {
    allowRedirect?: boolean;
    healActionScope?: HealActionScope;
  } = {},
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
  const healActionScope = options.healActionScope ?? 'single';

  if (options.allowRedirect !== false) {
    const redirectScaleSum = sumRedirectScale(
      healer,
      passives,
      'outgoing',
      healActionScope,
    );
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
  options: {
    allowRedirect?: boolean;
    healActionScope?: HealActionScope;
  } = {},
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

export function applyDirectHealBatchWithExcess(
  healer: CombatantState,
  targetEntries: InstantHealTargetEntry[],
  sameSideAllies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  options: {
    allowRedirect?: boolean;
    /** 必須: 行動形状から決めた単体/範囲。有効対象人数では決めない */
    healActionScope: HealActionScope;
  },
): DirectHealBatchApplyResult {
  const targets = targetEntries
    .filter((entry) => entry.attemptedHeal > 0)
    .map((entry) => ({
      target: entry.target,
      attemptedHeal: entry.attemptedHeal,
      excess: computeInstantHealExcess(entry.target, entry.attemptedHeal),
      hpRatioBeforeHeal: currentHpRatio(entry.target),
    }));
  if (targets.length === 0) {
    return {
      targets: [],
      redirectHealed: 0,
      redirectAmount: 0,
    };
  }

  const totalExcess = targets.reduce((sum, entry) => sum + entry.excess, 0);
  const healActionScope = options.healActionScope;
  let redirectTarget: CombatantState | undefined;
  let redirectAmount = 0;
  let redirectHealed = 0;
  let redirectHpRatioBeforeHeal: number | undefined;
  let remainingTotal = totalExcess;

  if (options.allowRedirect !== false && totalExcess > 0) {
    const redirectScaleSum = sumRedirectScale(
      healer,
      passives,
      'outgoing',
      healActionScope,
    );
    if (redirectScaleSum > 0) {
      const redirectBase = Math.floor(totalExcess * redirectScaleSum);
      if (redirectBase > 0) {
        redirectTarget = resolveExcessHealRedirectTargetExcluding(
          new Set(targets.map((entry) => entry.target.id)),
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
          remainingTotal = Math.max(0, totalExcess - redirectBase);
        }
      }
    }
  }

  const remainingPerTarget = allocateRemainingExcess(
    targets.map((entry) => entry.excess),
    remainingTotal,
  );
  const targetResults: InstantHealBatchTargetResult[] = targets.map(
    (entry, index) => {
      const healed = applyHealToTarget(entry.target, entry.attemptedHeal);
      const remainingExcess = remainingPerTarget[index] ?? 0;
      const outgoingBarrierGranted =
        remainingExcess > 0
          ? applyExcessHealToBarrierFromExcess(
              healer,
              entry.target,
              remainingExcess,
              passives,
              'outgoing',
            )
          : 0;
      const incomingBarrierGranted =
        remainingExcess > 0
          ? applyExcessHealToBarrierFromExcess(
              entry.target,
              entry.target,
              remainingExcess,
              passives,
              'incoming',
            )
          : 0;
      return {
        target: entry.target,
        healed,
        excess: entry.excess,
        hpRatioBeforeHeal: entry.hpRatioBeforeHeal,
        outgoingBarrierGranted,
        incomingBarrierGranted,
      };
    },
  );

  if (redirectTarget && redirectAmount > 0) {
    redirectHpRatioBeforeHeal = currentHpRatio(redirectTarget);
    redirectHealed = applyHealToTarget(redirectTarget, redirectAmount);
  }

  return {
    targets: targetResults,
    redirectTarget,
    redirectHealed,
    redirectAmount,
    redirectHpRatioBeforeHeal,
  };
}

export function sameSideAlliesFrom(
  units: CombatantState[],
  unit: CombatantState,
): CombatantState[] {
  return units.filter((candidate) => candidate.isEnemy === unit.isEnemy);
}
