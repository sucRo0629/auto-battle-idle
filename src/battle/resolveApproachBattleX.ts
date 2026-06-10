import type { CombatantState, GameData, TargetSpec } from './types.ts';
import { getPassiveDefs } from './combatMath.ts';
import { SPRITE_GAP } from './battleConstants.ts';
import {
  getPlayerContactX,
  getEnemyContactX,
  getMeleeEnemyContactX,
  resolveAttackBattleX,
  resolveMaxEffectiveRangePx,
  resolvePlayerFormationBattleX,
  resolveRangedRearBattleXCap,
} from './combatPosition.ts';
import { engagedMinBodyGap } from './battleConstants.ts';
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

function resolvePlayerPriorityTarget(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  const passives = getPassiveDefs(player, gameData.skillRegistry.passives);
  const defaultSpec = resolveBasicAttackTarget(player, gameData);
  const spec = resolveTargetSpec(passives, defaultSpec, {
    actor: player,
    allies: players,
    enemies,
  });
  const pool = getTargetPool(spec, player, players, enemies);
  return pickTargetFromPool(spec, player, pool);
}

function capBackRowToFormationDepth(
  player: CombatantState,
  players: CombatantState[],
  gameData: GameData,
  approachX: number,
): number {
  if (player.formationRow !== 'back') return approachX;
  const living = players.filter((p) => p.isAlive);
  const hasForwardRow = living.some(
    (p) => p.formationRow === 'front' || p.formationRow === 'middle',
  );
  if (!hasForwardRow) return approachX;
  const formationX = resolvePlayerFormationBattleX(player, players, gameData);
  if (formationX === null) return approachX;
  return Math.min(approachX, formationX);
}

/** 前列は敵最前線より左（rear 側）に留める — battleX 過進軍防止 */
function capFrontRowBeforeEnemyContact(
  player: CombatantState,
  enemies: CombatantState[],
  approachX: number,
): number {
  if (player.formationRow === 'back') return approachX;
  const enemyContact = getEnemyContactX(enemies);
  if (enemyContact === null) return approachX;
  const maxForward = enemyContact - engagedMinBodyGap();
  return Math.min(approachX, maxForward);
}

export function resolvePlayerApproachBattleX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): number {
  const contact = getEnemyContactX(enemies);
  if (contact === null) return player.battleX;

  if (player.formationRow !== 'back') {
    let approachX: number;
    const meleeContact = getMeleeEnemyContactX(enemies, gameData);
    if (meleeContact !== null) {
      approachX = resolveAttackBattleX(player, meleeContact, gameData);
    } else {
      const target = resolvePlayerPriorityTarget(
        player,
        players,
        enemies,
        gameData,
      );
      if (target) {
        approachX = resolveAttackBattleX(player, target.battleX, gameData);
      } else {
        approachX = resolveAttackBattleX(player, contact, gameData);
      }
    }
    return capFrontRowBeforeEnemyContact(player, enemies, approachX);
  }

  const target = resolvePlayerPriorityTarget(
    player,
    players,
    enemies,
    gameData,
  );
  if (target) {
    const range = resolveMaxEffectiveRangePx(player, gameData);
    return capBackRowToFormationDepth(
      player,
      players,
      gameData,
      target.battleX - range,
    );
  }

  return capBackRowToFormationDepth(
    player,
    players,
    gameData,
    resolveAttackBattleX(player, contact, gameData),
  );
}

/** @deprecated resolvePlayerApproachBattleX */
export const resolveAllyApproachBattleX = resolvePlayerApproachBattleX;

export function resolveEnemyBasicAttackTarget(
  enemy: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  const passives = getPassiveDefs(enemy, gameData.skillRegistry.passives);
  const defaultSpec = resolveBasicAttackTarget(enemy, gameData);
  const spec = resolveTargetSpec(passives, defaultSpec, {
    actor: enemy,
    allies: players,
    enemies,
  });
  let pool = getTargetPool(spec, enemy, players, enemies);
  if (resolveMaxEffectiveRangePx(enemy, gameData) <= 0) {
    const contact = getPlayerContactX(players);
    if (contact !== null) {
      pool = pool.filter((player) => player.battleX >= contact - SPRITE_GAP);
    }
  }
  return pickTargetFromPool(spec, enemy, pool);
}

export function resolveEnemyApproachBattleX(
  enemy: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): number {
  const contact = getPlayerContactX(players);
  if (contact === null) return enemy.battleX;

  const target = resolveEnemyBasicAttackTarget(
    enemy,
    players,
    enemies,
    gameData,
  );
  let approachX = target
    ? resolveAttackBattleX(enemy, target.battleX, gameData)
    : resolveAttackBattleX(enemy, contact, gameData);

  if (resolveMaxEffectiveRangePx(enemy, gameData) > 0) {
    const rearCap = resolveRangedRearBattleXCap(enemies, gameData);
    if (rearCap !== null) {
      approachX = Math.max(approachX, rearCap);
    }
  }

  return approachX;
}
