import { isRangedAttack } from '../data/entityTraits.ts';
import type { CombatantState, TargetRule } from '../types.ts';

function livingAllies(allies: CombatantState[]): CombatantState[] {
  return allies.filter((a) => a.isAlive);
}

function livingEnemies(enemies: CombatantState[]): CombatantState[] {
  return enemies.filter((e) => e.isAlive);
}

/** targetRule が参照する側の生存ユニット一覧（射程フィルタ前） */
export function getTargetPoolForRule(
  rule: TargetRule,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
): CombatantState[] {
  if (rule === 'self') {
    return actor.isAlive ? [actor] : [];
  }

  const alliesLive = livingAllies(allies);
  const enemiesLive = livingEnemies(enemies);

  if (actor.isEnemy) {
    if (rule === 'allAllies') {
      return enemiesLive;
    }
    if (rule === 'allEnemies') {
      return alliesLive;
    }
    return alliesLive;
  }

  if (rule === 'closestAlly') {
    return alliesLive;
  }

  switch (rule) {
    case 'frontEnemy':
    case 'lowestHpEnemy':
    case 'highestAtkEnemy':
    case 'lowestDefEnemy':
    case 'highestDefEnemy':
    case 'lowestRegEnemy':
    case 'highestRegEnemy':
    case 'highestHpEnemy':
    case 'farthestEnemy':
    case 'debuffedEnemy':
      return enemiesLive;
    case 'rangedAttackingEnemy':
      return enemiesLive.filter((e) => isRangedAttack(e.traits.rangePx));
    case 'magicAttackingEnemy':
      return enemiesLive.filter((e) => e.traits.damageType === 'magic');
    case 'mostDamagedAlly':
    case 'allAllies':
      return alliesLive;
    case 'allEnemies':
      return enemiesLive;
    default:
      return enemiesLive;
  }
}
