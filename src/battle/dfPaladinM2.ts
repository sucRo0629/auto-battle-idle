import { getResolvedBasicCombatModuleId } from './ironGuardianM2.ts';
import type { DangerTargetSnapshot } from './dangerTargeting.ts';
import { collectDangerTargetSnapshots, resolveDangerTargets } from './dangerTargeting.ts';
import type { TargetingRuntimeContext } from './skills/targeting.ts';
import type { CombatantState, StatusEffect, TargetSpec } from './types.ts';

/**
 * R12g-c4 provisional CombatModule ID (danger-target protection).
 * Migrates to CombatModule JSON in R12g Survival Module data task.
 */
export const DF_PALADIN_M2_COMBAT_MODULE_ID =
  'df_paladin_mod_danger_guard' as const;

/** R12g-c4 placeholder action interval (R12i tunes). Owner: CombatModule data. */
export const DF_PALADIN_M2_ATTACK_INTERVAL_SEC = 3;

/** R12g-c4 placeholder danger window (R12i tunes). Owner: CombatModule action TargetSpec. */
export const DF_PALADIN_M2_DANGER_WINDOW_SEC = 2;

/** R12g-c4 placeholder all-damage taken multiplier (R12i tunes). Owner: CombatModule effect data. */
export const DF_PALADIN_M2_ALL_DAMAGE_TAKEN_MULTIPLIER = 0.85;

/** R12g-c4 placeholder extra magic taken multiplier (R12i tunes). Owner: CombatModule effect data. */
export const DF_PALADIN_M2_MAGIC_EXTRA_TAKEN_MULTIPLIER = 0.85;

/** R12g-c4 placeholder protection duration (R12i tunes). Owner: CombatModule effect data. */
export const DF_PALADIN_M2_PROTECTION_DURATION_SEC = 4;

export const DF_PALADIN_M2_PROTECTION_OVERLAY = 'dfPaladinM2Protection' as const;

export type DfPaladinM2ProtectionOutcome =
  | 'applied'
  | 'refreshed'
  | 'switched'
  | 'noTarget';

export interface DfPaladinM2ProtectionResult {
  protectorId: string;
  selectedTargetId: string | null;
  previousTargetId: string | null;
  outcome: DfPaladinM2ProtectionOutcome;
  allDamageTakenMultiplier: number;
  magicExtraTakenMultiplier: number;
  durationSec: number;
  dangerSnapshots?: readonly DangerTargetSnapshot[];
}

const protectorTargetById = new Map<string, string>();

export function clearDfPaladinM2RuntimeState(): void {
  protectorTargetById.clear();
}

export function isDfPaladinM2Selected(combatant: CombatantState): boolean {
  if (combatant.classId !== 'df_paladin') return false;
  return (
    getResolvedBasicCombatModuleId(combatant) === DF_PALADIN_M2_COMBAT_MODULE_ID
  );
}

function protectedSideForActor(
  _actor: CombatantState,
): TargetSpec & { kind: 'danger' } {
  return {
    kind: 'danger',
    side: 'ally',
    maxTargets: 1,
    windowSec: DF_PALADIN_M2_DANGER_WINDOW_SEC,
  };
}

function findDfPaladinM2ProtectionEffect(
  target: CombatantState,
  protectorId: string,
): StatusEffect | undefined {
  return target.statusEffects.find(
    (effect) =>
      effect.overlay === DF_PALADIN_M2_PROTECTION_OVERLAY &&
      effect.sourceId === protectorId &&
      effect.remainingSec > 0,
  );
}

export function hasDfPaladinM2ProtectionFrom(
  target: CombatantState,
  protectorId: string,
): boolean {
  return findDfPaladinM2ProtectionEffect(target, protectorId) !== undefined;
}

export function resolveDfPaladinM2MagicExtraDamageTakenMultiplier(
  target: CombatantState,
): number {
  const effect = target.statusEffects.find(
    (entry) =>
      entry.overlay === DF_PALADIN_M2_PROTECTION_OVERLAY &&
      entry.remainingSec > 0 &&
      entry.dfPaladinM2MagicTakenMultiplier !== undefined,
  );
  return effect?.dfPaladinM2MagicTakenMultiplier ?? 1;
}

function removeDfPaladinM2ProtectionFromTarget(
  target: CombatantState,
  protectorId: string,
): void {
  target.statusEffects = target.statusEffects.filter(
    (effect) =>
      !(
        effect.overlay === DF_PALADIN_M2_PROTECTION_OVERLAY &&
        effect.sourceId === protectorId
      ),
  );
}

function applyDfPaladinM2ProtectionToTarget(
  protector: CombatantState,
  target: CombatantState,
  durationSec: number,
): void {
  removeDfPaladinM2ProtectionFromTarget(target, protector.id);
  const appliedAt = Date.now();
  target.statusEffects.push({
    id: `${DF_PALADIN_M2_COMBAT_MODULE_ID}_${protector.id}_${target.id}_${appliedAt}`,
    kind: 'buff',
    stat: 'damageTaken',
    overlay: DF_PALADIN_M2_PROTECTION_OVERLAY,
    multiplier: DF_PALADIN_M2_ALL_DAMAGE_TAKEN_MULTIPLIER,
    dfPaladinM2MagicTakenMultiplier: DF_PALADIN_M2_MAGIC_EXTRA_TAKEN_MULTIPLIER,
    durationSec,
    remainingSec: durationSec,
    sourceId: protector.id,
    skillId: DF_PALADIN_M2_COMBAT_MODULE_ID,
    displayName: '危険対象防護',
  });
}

export function removeDfPaladinM2ProtectionForProtector(
  protectorId: string,
  roster: readonly CombatantState[],
): string | null {
  const previousTargetId = protectorTargetById.get(protectorId) ?? null;
  if (!previousTargetId) return null;
  const previousTarget = roster.find((unit) => unit.id === previousTargetId);
  if (previousTarget) {
    removeDfPaladinM2ProtectionFromTarget(previousTarget, protectorId);
  }
  return previousTargetId;
}

export function tryApplyDfPaladinM2Protection(
  protector: CombatantState,
  target: CombatantState,
  roster: readonly CombatantState[],
  durationSec: number = DF_PALADIN_M2_PROTECTION_DURATION_SEC,
): DfPaladinM2ProtectionResult {
  const previousTargetId = protectorTargetById.get(protector.id) ?? null;
  let outcome: DfPaladinM2ProtectionOutcome = 'applied';

  if (
    previousTargetId === target.id &&
    hasDfPaladinM2ProtectionFrom(target, protector.id)
  ) {
    outcome = 'refreshed';
  } else if (previousTargetId && previousTargetId !== target.id) {
    removeDfPaladinM2ProtectionForProtector(protector.id, roster);
    outcome = 'switched';
  }

  applyDfPaladinM2ProtectionToTarget(protector, target, durationSec);
  protectorTargetById.set(protector.id, target.id);

  return {
    protectorId: protector.id,
    selectedTargetId: target.id,
    previousTargetId,
    outcome,
    allDamageTakenMultiplier: DF_PALADIN_M2_ALL_DAMAGE_TAKEN_MULTIPLIER,
    magicExtraTakenMultiplier: DF_PALADIN_M2_MAGIC_EXTRA_TAKEN_MULTIPLIER,
    durationSec,
  };
}

function resolveDangerProtectionTarget(
  protector: CombatantState,
  allies: readonly CombatantState[],
  enemies: readonly CombatantState[],
  runtime: TargetingRuntimeContext | undefined,
): {
  target: CombatantState | null;
  snapshots?: readonly DangerTargetSnapshot[];
} {
  if (!runtime?.resolveCurrentAttackTarget) {
    return { target: null };
  }

  const spec = protectedSideForActor(protector);
  const targets = resolveDangerTargets(
    spec,
    protector,
    allies,
    enemies,
    {
      pendingHits: runtime.pendingHits,
      battleSec: runtime.battleSec,
      resolveCurrentAttackTarget: runtime.resolveCurrentAttackTarget,
    },
  );
  if (targets.length === 0) {
    const candidates = (protector.isEnemy ? enemies : allies).filter(
      (unit) => unit.isAlive,
    );
    const opponents = (protector.isEnemy ? allies : enemies).filter(
      (unit) => unit.isAlive,
    );
    const snapshots = collectDangerTargetSnapshots({
      candidates,
      opponents,
      pendingHits: runtime.pendingHits,
      battleSec: runtime.battleSec,
      windowSec: spec.windowSec,
      resolveCurrentAttackTarget: runtime.resolveCurrentAttackTarget,
    });
    return { target: null, snapshots };
  }

  const selected = targets[0] ?? null;
  if (!selected || selected.id === protector.id) {
    return { target: null };
  }
  return { target: selected };
}

export function executeDfPaladinM2DangerProtection(
  protector: CombatantState,
  allies: readonly CombatantState[],
  enemies: readonly CombatantState[],
  runtime: TargetingRuntimeContext | undefined,
): DfPaladinM2ProtectionResult {
  const previousTargetId = protectorTargetById.get(protector.id) ?? null;
  const { target, snapshots } = resolveDangerProtectionTarget(
    protector,
    allies,
    enemies,
    runtime,
  );

  if (!target) {
    return {
      protectorId: protector.id,
      selectedTargetId: null,
      previousTargetId,
      outcome: 'noTarget',
      allDamageTakenMultiplier: DF_PALADIN_M2_ALL_DAMAGE_TAKEN_MULTIPLIER,
      magicExtraTakenMultiplier: DF_PALADIN_M2_MAGIC_EXTRA_TAKEN_MULTIPLIER,
      durationSec: DF_PALADIN_M2_PROTECTION_DURATION_SEC,
      dangerSnapshots: snapshots,
    };
  }

  const roster = [...allies, ...enemies];
  const result = tryApplyDfPaladinM2Protection(protector, target, roster);
  return {
    ...result,
    dangerSnapshots: snapshots,
  };
}
