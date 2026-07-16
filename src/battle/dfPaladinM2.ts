import { getResolvedBasicCombatModuleId } from './ironGuardianM2.ts';
import type { DangerTargetSnapshot } from './dangerTargeting.ts';
import { collectDangerTargetSnapshots, resolveDangerTargets } from './dangerTargeting.ts';
import type { TargetingRuntimeContext } from './skills/targeting.ts';
import type {
  CombatModuleDef,
  CombatantState,
  StatusEffect,
  TargetSpec,
} from './types.ts';

/**
 * R12g-d2 M2 combat module ID（危険加護）。
 * 正式 ID 変更時は runtime・test・JSON を同時更新。
 */
export const DF_PALADIN_M2_COMBAT_MODULE_ID =
  'df_paladin_mod_danger_guard' as const;

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

export interface DfPaladinM2RuntimeParams {
  maxTargets: number;
  windowSec: number;
  allDamageTakenMultiplier: number;
  magicDamageTakenMultiplier: number;
  durationSec: number;
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

export function resolveDfPaladinM2RuntimeParams(
  combatModuleRegistry: Record<string, CombatModuleDef>,
): DfPaladinM2RuntimeParams | undefined {
  const module = combatModuleRegistry[DF_PALADIN_M2_COMBAT_MODULE_ID];
  const runtimeEffect = module?.runtimeEffect;
  if (runtimeEffect?.kind !== 'protectDangerTarget') return undefined;
  const {
    maxTargets,
    windowSec,
    allDamageTakenMultiplier,
    magicDamageTakenMultiplier,
    durationSec,
  } = runtimeEffect;
  if (
    !(maxTargets >= 1) ||
    !Number.isFinite(maxTargets) ||
    !(windowSec >= 0) ||
    !Number.isFinite(windowSec) ||
    !(allDamageTakenMultiplier > 0) ||
    allDamageTakenMultiplier > 1 ||
    !Number.isFinite(allDamageTakenMultiplier) ||
    !(magicDamageTakenMultiplier > 0) ||
    magicDamageTakenMultiplier > 1 ||
    !Number.isFinite(magicDamageTakenMultiplier) ||
    !(durationSec > 0) ||
    !Number.isFinite(durationSec)
  ) {
    return undefined;
  }
  return {
    maxTargets,
    windowSec,
    allDamageTakenMultiplier,
    magicDamageTakenMultiplier,
    durationSec,
  };
}

function buildDangerTargetSpec(
  params: DfPaladinM2RuntimeParams,
): TargetSpec & { kind: 'danger' } {
  return {
    kind: 'danger',
    side: 'ally',
    maxTargets: params.maxTargets,
    windowSec: params.windowSec,
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
  params: DfPaladinM2RuntimeParams,
): void {
  removeDfPaladinM2ProtectionFromTarget(target, protector.id);
  const appliedAt = Date.now();
  target.statusEffects.push({
    id: `${DF_PALADIN_M2_COMBAT_MODULE_ID}_${protector.id}_${target.id}_${appliedAt}`,
    kind: 'buff',
    stat: 'damageTaken',
    overlay: DF_PALADIN_M2_PROTECTION_OVERLAY,
    multiplier: params.allDamageTakenMultiplier,
    dfPaladinM2MagicTakenMultiplier: params.magicDamageTakenMultiplier,
    durationSec: params.durationSec,
    remainingSec: params.durationSec,
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
  if (!previousTargetId) {
    for (const unit of roster) {
      removeDfPaladinM2ProtectionFromTarget(unit, protectorId);
    }
    protectorTargetById.delete(protectorId);
    return null;
  }
  const previousTarget = roster.find((unit) => unit.id === previousTargetId);
  if (previousTarget) {
    removeDfPaladinM2ProtectionFromTarget(previousTarget, protectorId);
  }
  for (const unit of roster) {
    if (unit.id === previousTargetId) continue;
    removeDfPaladinM2ProtectionFromTarget(unit, protectorId);
  }
  protectorTargetById.delete(protectorId);
  return previousTargetId;
}

export function tryApplyDfPaladinM2Protection(
  protector: CombatantState,
  target: CombatantState,
  roster: readonly CombatantState[],
  params: DfPaladinM2RuntimeParams,
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

  applyDfPaladinM2ProtectionToTarget(protector, target, params);
  protectorTargetById.set(protector.id, target.id);

  return {
    protectorId: protector.id,
    selectedTargetId: target.id,
    previousTargetId,
    outcome,
    allDamageTakenMultiplier: params.allDamageTakenMultiplier,
    magicExtraTakenMultiplier: params.magicDamageTakenMultiplier,
    durationSec: params.durationSec,
  };
}

function resolveDangerProtectionTarget(
  protector: CombatantState,
  allies: readonly CombatantState[],
  enemies: readonly CombatantState[],
  runtime: TargetingRuntimeContext | undefined,
  params: DfPaladinM2RuntimeParams,
): {
  target: CombatantState | null;
  snapshots?: readonly DangerTargetSnapshot[];
} {
  if (!runtime?.resolveCurrentAttackTarget) {
    return { target: null };
  }

  const spec = buildDangerTargetSpec(params);
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
    return { target: null, snapshots };
  }

  const selected = targets[0] ?? null;
  if (!selected || selected.id === protector.id) {
    return { target: null, snapshots };
  }
  return { target: selected, snapshots };
}

export function executeDfPaladinM2DangerProtection(
  protector: CombatantState,
  allies: readonly CombatantState[],
  enemies: readonly CombatantState[],
  runtime: TargetingRuntimeContext | undefined,
  combatModuleRegistry: Record<string, CombatModuleDef>,
): DfPaladinM2ProtectionResult {
  const previousTargetId = protectorTargetById.get(protector.id) ?? null;
  const params = resolveDfPaladinM2RuntimeParams(combatModuleRegistry);
  if (!params) {
    return {
      protectorId: protector.id,
      selectedTargetId: null,
      previousTargetId,
      outcome: 'noTarget',
      allDamageTakenMultiplier: 1,
      magicExtraTakenMultiplier: 1,
      durationSec: 0,
    };
  }

  const { target, snapshots } = resolveDangerProtectionTarget(
    protector,
    allies,
    enemies,
    runtime,
    params,
  );

  if (!target) {
    return {
      protectorId: protector.id,
      selectedTargetId: null,
      previousTargetId,
      outcome: 'noTarget',
      allDamageTakenMultiplier: params.allDamageTakenMultiplier,
      magicExtraTakenMultiplier: params.magicDamageTakenMultiplier,
      durationSec: params.durationSec,
      dangerSnapshots: snapshots,
    };
  }

  const roster = [...allies, ...enemies];
  const result = tryApplyDfPaladinM2Protection(
    protector,
    target,
    roster,
    params,
  );
  return {
    ...result,
    dangerSnapshots: snapshots,
  };
}
