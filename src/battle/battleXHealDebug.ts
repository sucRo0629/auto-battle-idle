import { isAllyHealBasicAttack, resolveBasicAttackEffect } from './allyHealBasicAttack.ts';
import { getPassiveDefs } from './combatMath.ts';
import {
  getPlayerFrontlineContactX,
  resolvePlayerFrontlineOwners,
} from './combatPosition.ts';
import {
  evaluateHealWithholdReason,
  resolvePriorityHealTarget,
} from './skills/targeting.ts';
import type {
  BattleXDebugTraceEntry,
  CombatantState,
  GameData,
} from './types.ts';

/** verify モード approach 行に載せる PHT / heal withhold 情報 */
export function resolveApproachHealDebugDetails(
  unit: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): BattleXDebugTraceEntry['details'] | undefined {
  if (unit.isEnemy) return undefined;

  const living = players.filter((player) => player.isAlive);
  const pht = resolvePriorityHealTarget(living);
  const frontlineOwners = resolvePlayerFrontlineOwners(players, enemies);
  const frontlineContactX = getPlayerFrontlineContactX(players, enemies);
  const details: NonNullable<BattleXDebugTraceEntry['details']> = {
    priorityHealTargetId: pht?.id,
    frontlineContactX: frontlineContactX ?? undefined,
    frontlineOwnerIds:
      frontlineOwners.length > 0
        ? frontlineOwners.map((owner) => owner.id).join(',')
        : undefined,
  };

  const passives = getPassiveDefs(unit, gameData.skillRegistry.passives);
  const withholdNotes: string[] = [];

  if (isAllyHealBasicAttack(unit, gameData)) {
    const basicEffect = resolveBasicAttackEffect(unit, gameData);
    if (basicEffect) {
      const reason = evaluateHealWithholdReason(
        basicEffect,
        unit,
        players,
        enemies,
        gameData,
        passives,
      );
      if (reason) withholdNotes.push(`basic:${reason}`);
    }
  }

  for (const skillId of unit.build.equippedActiveSlots ?? []) {
    const skill = gameData.skillRegistry.actives[skillId];
    if (!skill) continue;
    for (const effect of skill.effect) {
      if (effect.type !== 'heal' || (effect.healSubKind ?? 'instant') === 'dispel') {
        continue;
      }
      const reason = evaluateHealWithholdReason(
        effect,
        unit,
        players,
        enemies,
        gameData,
        passives,
        skill,
      );
      if (reason) {
        withholdNotes.push(`${skillId}:${reason}`);
        break;
      }
    }
  }

  if (withholdNotes.length > 0) {
    details.healWithholdReason = withholdNotes.join('; ');
  }

  return details;
}
