import type { CombatantState, GameData, TargetSpec } from './types.ts';
import { isMeleeRangePx } from './types.ts';
import { getPassiveDefs } from './combatMath.ts';
import { SPRITE_GAP } from './battleConstants.ts';
import {
  getPlayerContactX,
  getEnemyContactX,
  getMeleeEnemyContactX,
  resolveAttackBattleX,
  resolveMaxEffectiveRangePx,
  leadingRowContactPlayer,
} from './combatPosition.ts';
import { engagedMinBodyGap } from './battleConstants.ts';
import { pickTargetFromPool, resolveTargetSpec } from './skills/targeting.ts';
import { getEffectTarget, getTargetPool } from './skills/targetSpec.ts';
import { getAttackablePool } from './skills/rangeUtils.ts';

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
  _players: CombatantState[],
  _enemies: CombatantState[],
  _gameData: GameData,
  rangeStopX: number,
): number {
  if (player.formationRow !== 'back') return rangeStopX;
  // 射程停止を正本とする。隊形深度で rangeStopX より前方へ引きずらない（過進軍時は戻す）
  return Math.min(Math.max(rangeStopX, player.battleX), rangeStopX);
}

function capRangedOnlyRetreat(
  player: CombatantState,
  enemies: CombatantState[],
  gameData: GameData,
  approachX: number,
): number {
  if (getMeleeEnemyContactX(enemies, gameData) !== null) return approachX;
  // 近接全滅後: 敵接触点の左流れに引きずられない（前進のみ）
  return Math.max(approachX, player.battleX);
}

/** 前列は敵最前線より左（rear 側）に留める — battleX 過進軍防止 */
function capFrontRowBeforeEnemyContact(
  player: CombatantState,
  enemies: CombatantState[],
  gameData: GameData,
  approachX: number,
): number {
  if (player.formationRow === 'back') return approachX;
  const meleeContact = getMeleeEnemyContactX(enemies, gameData);
  const enemyContact = meleeContact ?? getEnemyContactX(enemies);
  if (enemyContact === null) return approachX;
  const maxForward = resolveAttackBattleX(player, enemyContact, gameData);
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
    return capFrontRowBeforeEnemyContact(
      player,
      enemies,
      gameData,
      capRangedOnlyRetreat(player, enemies, gameData, approachX),
    );
  }

  const target = resolvePlayerPriorityTarget(
    player,
    players,
    enemies,
    gameData,
  );
  if (target) {
    return capBackRowToFormationDepth(
      player,
      players,
      enemies,
      gameData,
      resolveAttackBattleX(player, target.battleX, gameData),
    );
  }

  return capBackRowToFormationDepth(
    player,
    players,
    enemies,
    gameData,
    capRangedOnlyRetreat(
      player,
      enemies,
      gameData,
      resolveAttackBattleX(player, contact, gameData),
    ),
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
  if (isMeleeRangePx(resolveMaxEffectiveRangePx(enemy, gameData))) {
    const contact = getPlayerContactX(players);
    if (contact !== null) {
      pool = pool.filter((player) => player.battleX >= contact - SPRITE_GAP);
    }
  }
  return pickTargetFromPool(spec, enemy, pool);
}

/** 自動接近用: 前衛より後方のターゲットは前衛接触点へ（遠隔が後列追いで戦線ごと左流れするのを防ぐ） */
function resolveEnemyApproachTargetPlayer(
  enemy: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  const target = resolveEnemyBasicAttackTarget(
    enemy,
    players,
    enemies,
    gameData,
  );
  if (target === null) return null;
  const contact = getPlayerContactX(players);
  if (contact === null) return target;
  if (target.battleX >= contact - SPRITE_GAP) return target;
  return leadingRowContactPlayer(players) ?? target;
}

export function resolveEnemyApproachBattleX(
  enemy: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): number {
  const contact = getPlayerContactX(players);
  if (contact === null) return enemy.battleX;

  const target = resolveEnemyApproachTargetPlayer(
    enemy,
    players,
    enemies,
    gameData,
  );
  let approachX = target
    ? resolveEnemyMeleeStopBattleX(enemy, target, gameData)
    : resolveAttackBattleX(enemy, contact, gameData);

  // 遠隔: 攻撃可能位置へ接近（rearCap は layout 用。ここで引き止めると射程内に入れない）
  return approachX;
}

/** 近接敵: プレイヤー武器 reach を含めた停止位置（contact 追従ドリフト防止） */
function resolveEnemyMeleeStopBattleX(
  enemy: CombatantState,
  targetPlayer: CombatantState,
  gameData: GameData,
): number {
  const enemyRange = resolveMaxEffectiveRangePx(enemy, gameData);
  if (!isMeleeRangePx(enemyRange)) {
    return resolveAttackBattleX(enemy, targetPlayer.battleX, gameData);
  }
  const playerRange = resolveMaxEffectiveRangePx(targetPlayer, gameData);
  const playerReach = isMeleeRangePx(playerRange) ? playerRange : 0;
  return targetPlayer.battleX + engagedMinBodyGap() + playerReach;
}

/** 接敵中: 通常攻撃が射程内に届くなら自動接近を止める */
export function shouldSkipEngagedAutoApproach(
  unit: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): boolean {
  const passives = getPassiveDefs(unit, gameData.skillRegistry.passives);
  const spec = resolveTargetSpec(
    passives,
    resolveBasicAttackTarget(unit, gameData),
    {
      actor: unit,
      allies: players,
      enemies,
    },
  );
  const range = resolveMaxEffectiveRangePx(unit, gameData);
  const pool = getAttackablePool(spec, unit, players, enemies, range);
  return pool.some((opponent) => opponent.isAlive);
}
