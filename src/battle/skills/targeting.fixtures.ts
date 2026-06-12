import type { SkillEffectDef, TargetRule } from '../types.ts';
import { normalizeTarget } from './targetSpec.ts';
import { mockTargetingGameData, mockUnit } from '../testFixtures.ts';

export { mockTargetingGameData, mockUnit };

export function damageEffect(
  fields: Record<string, unknown>,
  rule: TargetRule,
): SkillEffectDef {
  return {
    type: 'damage',
    damageType: 'physical',
    amount: { kind: 'atkBased', atkScale: 1 },
    target: normalizeTarget(rule),
    ...fields,
  } as SkillEffectDef;
}
