import type { CombatantState, GameData, TargetRule } from './types.ts';
import { getPassiveDefs } from './combatMath.ts';
import {
  getEnemyContactX,
  resolveAttackBattleX,
  resolveMaxEffectiveRangePx,
} from './combatPosition.ts';
import { pickTargetFromPool, resolveTargetRule } from './skills/targeting.ts';
import { getTargetPoolForRule } from './skills/targetingPool.ts';

function resolveBasicAttackTargetRule(
  unit: CombatantState,
  gameData: GameData,
): TargetRule {
  const basicCd = unit.cooldowns.find((cd) => cd.slotKind === 'basic');
  const skillId = basicCd?.skillId;
  const skill = skillId ? gameData.skillRegistry.actives[skillId] : undefined;
  return skill?.effect[0]?.targetRule ?? 'frontEnemy';
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
    return resolveAttackBattleX(ally, contact, gameData);
  }

  const passives = getPassiveDefs(ally, gameData.skillRegistry.passives);
  const defaultRule = resolveBasicAttackTargetRule(ally, gameData);
  const rule = resolveTargetRule(passives, defaultRule, {
    actor: ally,
    allies,
    enemies,
  });
  const pool = getTargetPoolForRule(rule, ally, allies, enemies);
  const target = pickTargetFromPool(rule, ally, pool);

  if (target) {
    const range = resolveMaxEffectiveRangePx(ally, gameData);
    return target.battleX + range;
  }

  return resolveAttackBattleX(ally, contact, gameData);
}
