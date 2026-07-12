import type { ActiveSkillDef, CombatModuleActionDef, CombatModuleDef } from '../types.ts';

/**
 * CombatModule → ActiveSkillDef（R5c: basic スロット解決用）。
 * trigger.value は attackIntervalSec を使用（旧 basic の trigger.value=2 秒は正本にしない）。
 */
export function synthesizeCombatModuleSkill(module: CombatModuleDef): ActiveSkillDef {
  const { id, displayName, attackIntervalSec, action } = module;
  const { effect, ...sharedTargeting } = action;
  return {
    id,
    name: displayName,
    trigger: { kind: 'time', value: attackIntervalSec },
    effect: effect.map((entry) => ({ ...entry })),
    ...sharedTargeting,
  };
}

export type { CombatModuleActionDef };
