import type { CombatantState, GameData, SkillEffectDef } from './types.ts';
import { getEffectTarget, targetSpecFaction } from './skills/targetSpec.ts';
import { resolveEffectiveBasicAttackSkill } from './resolveEffectiveBasicAttack.ts';

export function resolveBasicAttackEffect(
  unit: CombatantState,
  gameData: GameData,
): SkillEffectDef | undefined {
  const basicCd = unit.cooldowns.find((cd) => cd.slotKind === 'basic');
  const skillId = basicCd?.skillId;
  const baseSkill = skillId ? gameData.skillRegistry.actives[skillId] : undefined;
  if (!baseSkill) return undefined;
  const skill = resolveEffectiveBasicAttackSkill(unit, baseSkill);
  return skill.effect.find((entry) => entry.type !== 'move');
}

/** 通常攻撃が味方対象 heal か（後方ヒーラーの接敵停止判定用） */
export function isAllyHealBasicAttack(
  unit: CombatantState,
  gameData: GameData,
): boolean {
  const effect = resolveBasicAttackEffect(unit, gameData);
  if (!effect || effect.type !== 'heal') return false;
  return targetSpecFaction(getEffectTarget(effect), unit) === 'ally';
}

/** 通常攻撃が敵向け pierce か（contact 基準の接近停止用） */
export function isPierceEnemyBasicAttack(
  unit: CombatantState,
  gameData: GameData,
): boolean {
  const effect = resolveBasicAttackEffect(unit, gameData);
  if (!effect || effect.type !== 'damage') return false;
  if (effect.targetShape !== 'pierce') return false;
  return targetSpecFaction(getEffectTarget(effect), unit) === 'enemy';
}
