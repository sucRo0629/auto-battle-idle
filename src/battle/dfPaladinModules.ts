import {
  isDfPaladinM1Selected,
  removeDfPaladinM1ProtectionForProtector,
  syncDfPaladinM1FrontlineProtection,
} from './dfPaladinM1.ts';
import {
  executeDfPaladinM2DangerProtection,
  isDfPaladinM2Selected,
  removeDfPaladinM2ProtectionForProtector,
  type DfPaladinM2ProtectionResult,
} from './dfPaladinM2.ts';
import type { TargetingRuntimeContext } from './skills/targeting.ts';
import type { CombatModuleDef, CombatantState } from './types.ts';

/**
 * 護法士 M1/M2 の選択中効果を同期する。
 * - M1: 前線複数味方への永続防護
 * - M2: danger 再評価（戦闘状態反映。旧 active 周期ではない）
 * - 切替時は旧 module 効果を即時解除
 */
export function syncDfPaladinCombatModuleEffects(
  allies: readonly CombatantState[],
  enemies: readonly CombatantState[],
  combatModuleRegistry: Record<string, CombatModuleDef>,
  targetingRuntime: TargetingRuntimeContext | undefined,
  onM2Result?: (result: DfPaladinM2ProtectionResult) => void,
): void {
  const roster = [...allies, ...enemies];

  for (const unit of roster) {
    if (unit.classId !== 'df_paladin') continue;
    if (!isDfPaladinM2Selected(unit)) {
      removeDfPaladinM2ProtectionForProtector(unit.id, roster);
    }
    if (!isDfPaladinM1Selected(unit)) {
      removeDfPaladinM1ProtectionForProtector(unit.id, roster);
    }
  }

  syncDfPaladinM1FrontlineProtection(allies, enemies, combatModuleRegistry);

  for (const protector of roster) {
    if (!protector.isAlive) continue;
    if (!isDfPaladinM2Selected(protector)) continue;
    const result = executeDfPaladinM2DangerProtection(
      protector,
      allies,
      enemies,
      targetingRuntime,
      combatModuleRegistry,
    );
    // continuous sync: applied/switched は常に通知。refreshed/noTarget も debug 用に通知
    onM2Result?.(result);
  }
}
