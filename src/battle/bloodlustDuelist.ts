import { resolveSelfHpRatioBuffScale } from './passiveEffects.ts';
import { getPassiveDefs } from './combatMath.ts';
import type { CombatantState, PassiveSkillDef, StatusEffect } from './types.ts';

const PASSIVE_AURA_DURATION_SEC = 99999;

const SELF_HP_BUFF_NEUTRAL_EPSILON = 0.0001;

export const BLOODLUST_BLOCK_CHANCE_DEFAULT = 0.05;
export const BLOODLUST_DEF_MAX_BUFF_AT_HP_RATIO_DEFAULT = 0.5;
export const BLOODLUST_DEF_BUFF_MULTIPLIER_MAX_DEFAULT = 1.6;
export const BLOODLUST_ATK_MAX_BUFF_AT_HP_RATIO_DEFAULT = 0;
export const BLOODLUST_ATK_BUFF_MULTIPLIER_MAX_DEFAULT = 4;
export const BLOODLUST_ATK_BUFF_CURVE_EXPONENT_DEFAULT = 1;

export function isBloodlustDuelistPassive(passive: PassiveSkillDef): boolean {
  return passive.effect === 'bloodlustDuelist';
}

function createBloodlustBlockEffect(
  unit: CombatantState,
  passive: PassiveSkillDef,
  chance: number,
): StatusEffect {
  return {
    id: `passive_bloodlust_block_${unit.id}_${passive.id}`,
    kind: 'buff',
    overlay: 'block',
    blockChance: chance,
    multiplier: 1,
    sourceId: unit.id,
    skillId: passive.id,
    durationSec: PASSIVE_AURA_DURATION_SEC,
    remainingSec: PASSIVE_AURA_DURATION_SEC,
  };
}

function createBloodlustHpBuffEffect(
  unit: CombatantState,
  passive: PassiveSkillDef,
  stat: 'def' | 'atk',
  multiplier: number,
): StatusEffect {
  return {
    id: `passive_bloodlust_hp_${unit.id}_${passive.id}_${stat}`,
    kind: 'buff',
    stat,
    multiplier,
    sourceId: unit.id,
    skillId: passive.id,
    durationSec: PASSIVE_AURA_DURATION_SEC,
    remainingSec: PASSIVE_AURA_DURATION_SEC,
  };
}

export function syncBloodlustDuelistAuras(
  units: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): void {
  for (const unit of units) {
    unit.statusEffects = unit.statusEffects.filter(
      (effect) =>
        !effect.id.startsWith('passive_bloodlust_block_') &&
        !effect.id.startsWith('passive_bloodlust_hp_'),
    );
  }

  for (const unit of units) {
    if (!unit.isAlive) continue;
    for (const passive of getPassiveDefs(unit, passives)) {
      if (!isBloodlustDuelistPassive(passive)) continue;

      const blockChance =
        passive.bloodlustBlockChance ?? BLOODLUST_BLOCK_CHANCE_DEFAULT;
      if (blockChance > 0) {
        unit.statusEffects.push(
          createBloodlustBlockEffect(unit, passive, blockChance),
        );
      }

      const defRatio =
        passive.bloodlustDefMaxBuffAtHpRatio ??
        BLOODLUST_DEF_MAX_BUFF_AT_HP_RATIO_DEFAULT;
      const defMulMax =
        passive.bloodlustDefBuffMultiplierMax ??
        BLOODLUST_DEF_BUFF_MULTIPLIER_MAX_DEFAULT;
      const defT = resolveSelfHpRatioBuffScale(unit, defRatio);
      if (defT > 0) {
        const defMul = 1 + (defMulMax - 1) * defT;
        if (Math.abs(defMul - 1) >= SELF_HP_BUFF_NEUTRAL_EPSILON) {
          unit.statusEffects.push(
            createBloodlustHpBuffEffect(unit, passive, 'def', defMul),
          );
        }
      }

      const atkRatio =
        passive.bloodlustAtkMaxBuffAtHpRatio ??
        BLOODLUST_ATK_MAX_BUFF_AT_HP_RATIO_DEFAULT;
      const atkMulMax =
        passive.bloodlustAtkBuffMultiplierMax ??
        BLOODLUST_ATK_BUFF_MULTIPLIER_MAX_DEFAULT;
      const atkTLinear = resolveSelfHpRatioBuffScale(unit, atkRatio);
      const atkCurveExponent =
        passive.bloodlustAtkBuffCurveExponent ??
        BLOODLUST_ATK_BUFF_CURVE_EXPONENT_DEFAULT;
      const atkT =
        atkCurveExponent === 1
          ? atkTLinear
          : atkTLinear ** atkCurveExponent;
      if (atkT > 0) {
        const atkMul = 1 + (atkMulMax - 1) * atkT;
        if (Math.abs(atkMul - 1) >= SELF_HP_BUFF_NEUTRAL_EPSILON) {
          unit.statusEffects.push(
            createBloodlustHpBuffEffect(unit, passive, 'atk', atkMul),
          );
        }
      }
    }
  }
}
