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
      return enemiesLive;
    case 'rangedAttackingEnemy':
      return enemiesLive.filter((e) => e.traits.attackRange === 'ranged');
    case 'mostDamagedAlly':
      return alliesLive;
    default:
      return enemiesLive;
  }
}
