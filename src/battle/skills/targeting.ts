import type { CombatantState, PassiveSkillDef, TargetRule } from '../types.ts';

export function resolveTargetRule(
  passives: PassiveSkillDef[],
  defaultRule: TargetRule,
): TargetRule {
  for (let i = passives.length - 1; i >= 0; i--) {
    if (passives[i].targetRuleOverride) {
      return passives[i].targetRuleOverride!;
    }
  }
  return defaultRule;
}

function getBattleX(combatant: CombatantState): number {
  return combatant.visualX;
}

export function pickTarget(
  rule: TargetRule,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
): CombatantState | null {
  const livingAllies = allies.filter((a) => a.isAlive);
  const livingEnemies = enemies.filter((e) => e.isAlive);

  if (actor.isEnemy) {
    switch (rule) {
      case 'closestAlly': {
        if (livingAllies.length === 0) return null;
        return livingAllies.reduce((a, b) =>
          getBattleX(a) <= getBattleX(b) ? a : b,
        );
      }
      default:
        return livingAllies[0] ?? null;
    }
  }

  switch (rule) {
    case 'frontEnemy':
      if (livingEnemies.length === 0) return null;
      return livingEnemies.reduce((a, b) =>
        getBattleX(a) <= getBattleX(b) ? a : b,
      );
    case 'lowestHpEnemy':
      if (livingEnemies.length === 0) return null;
      return livingEnemies.reduce((a, b) => (a.hp <= b.hp ? a : b));
    case 'mostDamagedAlly': {
      if (livingAllies.length === 0) return null;
      return livingAllies.reduce((a, b) =>
        a.maxHp - a.hp >= b.maxHp - b.hp ? a : b,
      );
    }
    default:
      return livingEnemies[0] ?? null;
  }
}
