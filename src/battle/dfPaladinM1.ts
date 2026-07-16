import { getResolvedBasicCombatModuleId } from './ironGuardianM2.ts';
import type {
  CombatModuleDef,
  CombatantState,
  StatusEffect,
} from './types.ts';

/**
 * R12g-d2 M1 combat module ID（前線加護・選択中永続）。
 * 正式 ID 変更時は runtime・test・JSON を同時更新。
 */
export const DF_PALADIN_M1_COMBAT_MODULE_ID =
  'df_paladin_mod_frontline_ward' as const;

export const DF_PALADIN_M1_PROTECTION_OVERLAY = 'dfPaladinM1Protection' as const;

const M1_MAGIC_STATUS_SUFFIX = 'magic';
const M1_ALL_STATUS_SUFFIX = 'all';

export function isDfPaladinM1Selected(combatant: CombatantState): boolean {
  if (combatant.classId !== 'df_paladin') return false;
  return (
    getResolvedBasicCombatModuleId(combatant) === DF_PALADIN_M1_COMBAT_MODULE_ID
  );
}

export function resolveDfPaladinM1RuntimeEffect(
  combatModuleRegistry: Record<string, CombatModuleDef>,
): Extract<
  CombatModuleDef['runtimeEffect'],
  { kind: 'protectFrontlineAllies' }
> | undefined {
  const module = combatModuleRegistry[DF_PALADIN_M1_COMBAT_MODULE_ID];
  const runtimeEffect = module?.runtimeEffect;
  if (runtimeEffect?.kind !== 'protectFrontlineAllies') return undefined;
  return runtimeEffect;
}

function isDfPaladinM1OwnedStatus(effect: StatusEffect): boolean {
  return (
    effect.overlay === DF_PALADIN_M1_PROTECTION_OVERLAY ||
    effect.skillId === DF_PALADIN_M1_COMBAT_MODULE_ID
  );
}

/** 護法士 M1 由来の前線防護を全対象から除去（source 単位） */
export function removeDfPaladinM1ProtectionForProtector(
  protectorId: string,
  roster: readonly CombatantState[],
): void {
  for (const unit of roster) {
    unit.statusEffects = unit.statusEffects.filter(
      (effect) =>
        !(
          isDfPaladinM1OwnedStatus(effect) &&
          effect.sourceId === protectorId
        ),
    );
  }
}

/** roster 全体から M1 防護を除去 */
export function clearAllDfPaladinM1Protection(
  roster: readonly CombatantState[],
): void {
  for (const unit of roster) {
    unit.statusEffects = unit.statusEffects.filter(
      (effect) => !isDfPaladinM1OwnedStatus(effect),
    );
  }
}

/**
 * 前線定義: 既存 formationRow === 'front'（複雑な前線 AI は作らない）。
 * 自身が前線なら含む。後衛は無条件に含めない。
 */
export function selectDfPaladinM1FrontlineTargets(
  protector: CombatantState,
  sameSide: readonly CombatantState[],
  maxTargets: number,
): CombatantState[] {
  const frontline = sameSide
    .filter(
      (unit) =>
        unit.isAlive &&
        unit.formationRow === 'front' &&
        unit.isEnemy === protector.isEnemy,
    )
    .slice()
    .sort((a, b) => {
      const xDiff = b.battleX - a.battleX;
      if (xDiff !== 0) return xDiff;
      return a.id.localeCompare(b.id);
    });
  return frontline.slice(0, Math.max(0, maxTargets));
}

function applyM1ProtectionToTarget(
  protector: CombatantState,
  target: CombatantState,
  magicDamageTakenMultiplier: number,
  allDamageTakenMultiplier: number | undefined,
): void {
  const baseId = `${DF_PALADIN_M1_COMBAT_MODULE_ID}_${protector.id}_${target.id}`;
  target.statusEffects.push({
    id: `${baseId}_${M1_MAGIC_STATUS_SUFFIX}`,
    kind: 'buff',
    stat: 'damageTaken',
    overlay: DF_PALADIN_M1_PROTECTION_OVERLAY,
    multiplier: magicDamageTakenMultiplier,
    damageTakenDamageTypes: ['magic'],
    durationSec: Number.POSITIVE_INFINITY,
    remainingSec: Number.POSITIVE_INFINITY,
    sourceId: protector.id,
    skillId: DF_PALADIN_M1_COMBAT_MODULE_ID,
    displayName: '前線加護',
  });
  if (
    allDamageTakenMultiplier !== undefined &&
    allDamageTakenMultiplier > 0 &&
    allDamageTakenMultiplier <= 1
  ) {
    target.statusEffects.push({
      id: `${baseId}_${M1_ALL_STATUS_SUFFIX}`,
      kind: 'buff',
      stat: 'damageTaken',
      overlay: DF_PALADIN_M1_PROTECTION_OVERLAY,
      multiplier: allDamageTakenMultiplier,
      durationSec: Number.POSITIVE_INFINITY,
      remainingSec: Number.POSITIVE_INFINITY,
      sourceId: protector.id,
      skillId: DF_PALADIN_M1_COMBAT_MODULE_ID,
      displayName: '前線加護',
    });
  }
}

export function hasDfPaladinM1ProtectionFrom(
  target: CombatantState,
  protectorId: string,
): boolean {
  return target.statusEffects.some(
    (effect) =>
      isDfPaladinM1OwnedStatus(effect) &&
      effect.sourceId === protectorId &&
      effect.remainingSec > 0,
  );
}

/**
 * 選択中 M1 の前線複数味方防護を同期する。
 * module 切替・Wave・対象変化（死亡/編成）に追従。
 */
export function syncDfPaladinM1FrontlineProtection(
  allies: readonly CombatantState[],
  enemies: readonly CombatantState[],
  combatModuleRegistry: Record<string, CombatModuleDef>,
): void {
  const roster = [...allies, ...enemies];
  clearAllDfPaladinM1Protection(roster);

  const runtimeEffect = resolveDfPaladinM1RuntimeEffect(combatModuleRegistry);
  if (!runtimeEffect) return;

  for (const protector of roster) {
    if (!protector.isAlive) continue;
    if (!isDfPaladinM1Selected(protector)) continue;

    const sameSide = protector.isEnemy ? enemies : allies;
    const targets = selectDfPaladinM1FrontlineTargets(
      protector,
      sameSide,
      runtimeEffect.maxTargets,
    );
    for (const target of targets) {
      applyM1ProtectionToTarget(
        protector,
        target,
        runtimeEffect.magicDamageTakenMultiplier,
        runtimeEffect.allDamageTakenMultiplier,
      );
    }
  }
}
