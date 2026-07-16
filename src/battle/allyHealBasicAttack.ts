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

function isAllyFactionEffect(
  effect: SkillEffectDef,
  unit: CombatantState,
): boolean {
  return targetSpecFaction(getEffectTarget(effect), unit) === 'ally';
}

/** 通常攻撃が味方対象 heal か（後方ヒーラーの接敵停止判定用） */
export function isAllyHealBasicAttack(
  unit: CombatantState,
  gameData: GameData,
): boolean {
  const effect = resolveBasicAttackEffect(unit, gameData);
  if (!effect || effect.type !== 'heal') return false;
  return isAllyFactionEffect(effect, unit);
}

/** 通常攻撃が味方対象 Barrier 付与か（結界師 CombatModule。敵 chase しない） */
export function isAllyBarrierBasicAttack(
  unit: CombatantState,
  gameData: GameData,
): boolean {
  const effect = resolveBasicAttackEffect(unit, gameData);
  if (!effect) return false;
  const isBarrier =
    effect.type === 'barrier' ||
    (effect.type === 'buff' && effect.buffSubKind === 'barrier');
  if (!isBarrier) return false;
  return isAllyFactionEffect(effect, unit);
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

/** 双刃士 M1: 前線接触 cap を越え、現在 HP 最低対象へ侵入接近する */
export const AT_ASSASSIN_M1_REAR_INTRUDE_MODULE_ID =
  'at_assassin_mod_rear_intrude';

/** 双刃士 M2: 前線を越えず中距離で仕留める */
export const AT_ASSASSIN_M2_FRONTLINE_FINISH_MODULE_ID =
  'at_assassin_mod_frontline_finish';

function resolveSelectedCombatModuleId(
  unit: CombatantState,
): string | undefined {
  return unit.cooldowns.find((cd) => cd.slotKind === 'basic')?.skillId;
}

/** 双刃士 M1 後方侵入 Module が basic として選択中か */
export function isAssassinRearIntrudeBasicAttack(
  unit: CombatantState,
  gameData: GameData,
): boolean {
  const moduleId = resolveSelectedCombatModuleId(unit);
  if (moduleId !== AT_ASSASSIN_M1_REAR_INTRUDE_MODULE_ID) return false;
  return gameData.combatModuleRegistry[moduleId]?.classId === 'at_assassin';
}

/** 双刃士 M2 前線内仕留め Module が basic として選択中か */
export function isAssassinFrontlineFinishBasicAttack(
  unit: CombatantState,
  gameData: GameData,
): boolean {
  const moduleId = resolveSelectedCombatModuleId(unit);
  if (moduleId !== AT_ASSASSIN_M2_FRONTLINE_FINISH_MODULE_ID) return false;
  return gameData.combatModuleRegistry[moduleId]?.classId === 'at_assassin';
}
