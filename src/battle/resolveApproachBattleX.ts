import type { CombatantState, GameData, TargetSpec } from './types.ts';
import { getPassiveDefs } from './combatMath.ts';
import {
  getAllyContactX,
  getEnemyContactX,
  getMeleeEnemyContactX,
  resolveAttackBattleX,
  resolveMaxEffectiveRangePx,
  resolveRangedRearBattleXCap,
} from './combatPosition.ts';
import { pickTargetFromPool, resolveTargetSpec } from './skills/targeting.ts';
import { getEffectTarget, getTargetPool } from './skills/targetSpec.ts';

function resolveBasicAttackTarget(
  unit: CombatantState,
  gameData: GameData,
): TargetSpec {
  const basicCd = unit.cooldowns.find((cd) => cd.slotKind === 'basic');
  const skillId = basicCd?.skillId;
  const skill = skillId ? gameData.skillRegistry.actives[skillId] : undefined;
  const effect = skill?.effect[0];
  if (effect) return getEffectTarget(effect);
  return { kind: 'distance', side: 'enemy', order: 'nearest' };
}

function resolveAllyPriorityTarget(
  ally: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  const passives = getPassiveDefs(ally, gameData.skillRegistry.passives);
  const defaultSpec = resolveBasicAttackTarget(ally, gameData);
  const spec = resolveTargetSpec(passives, defaultSpec, {
    actor: ally,
    allies,
    enemies,
  });
  const pool = getTargetPool(spec, ally, allies, enemies);
  return pickTargetFromPool(spec, ally, pool);
}

/** 後列の接敵 battleX: パッシブ等で決まる狙い先が射程外なら、その敵まで届く位置を目指す */
export function resolveAllyApproachBattleX(
  ally: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): number {
  const contact = getEnemyContactX(enemies);
  if (contact === null) return ally.battleX;

  if (ally.formationRow !== 'back') {
    const meleeContact = getMeleeEnemyContactX(enemies);
    if (meleeContact !== null) {
      return resolveAttackBattleX(ally, meleeContact, gameData);
    }

    const target = resolveAllyPriorityTarget(ally, allies, enemies, gameData);
    if (target) {
      const range = resolveMaxEffectiveRangePx(ally, gameData);
      return target.battleX + range;
    }

    return resolveAttackBattleX(ally, contact, gameData);
  }

  const target = resolveAllyPriorityTarget(ally, allies, enemies, gameData);
  if (target) {
    const range = resolveMaxEffectiveRangePx(ally, gameData);
    return target.battleX + range;
  }

  return resolveAttackBattleX(ally, contact, gameData);
}

export function resolveEnemyBasicAttackTarget(
  enemy: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  const passives = getPassiveDefs(enemy, gameData.skillRegistry.passives);
  const defaultSpec = resolveBasicAttackTarget(enemy, gameData);
  const spec = resolveTargetSpec(passives, defaultSpec, {
    actor: enemy,
    allies,
    enemies,
  });
  const pool = getTargetPool(spec, enemy, allies, enemies);
  return pickTargetFromPool(spec, enemy, pool);
}

/** 敵の接敵 battleX: 狙い先が射程外なら、その味方まで届く位置を目指す */
export function resolveEnemyApproachBattleX(
  enemy: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): number {
  const contact = getAllyContactX(allies);
  if (contact === null) return enemy.battleX;

  const target = resolveEnemyBasicAttackTarget(enemy, allies, enemies, gameData);
  let approachX = target
    ? target.battleX - resolveMaxEffectiveRangePx(enemy, gameData)
    : resolveAttackBattleX(enemy, contact, gameData);

  if (enemy.traits.rangePx > 0) {
    const rearCap = resolveRangedRearBattleXCap(enemies);
    if (rearCap !== null) {
      approachX = Math.min(approachX, rearCap);
    }
  }

  return approachX;
}
