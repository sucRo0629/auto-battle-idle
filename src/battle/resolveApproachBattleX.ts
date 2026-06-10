import type { CombatantState, GameData, TargetSpec } from './types.ts';
import { isMeleeRangePx } from './types.ts';
import { getPassiveDefs } from './combatMath.ts';
import { SPRITE_GAP } from './battleConstants.ts';
import {
  getPlayerContactX,
  getEnemyContactX,
  getMeleeEnemyContactX,
  resolveApproachAttackBattleX,
  resolveAttackBattleX,
  resolveMaxEffectiveRangePx,
  resolveBasicAttackRangePx,
  resolveApproachRangePx,
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

function capForwardAfterMeleeWipe(
  player: CombatantState,
  enemies: CombatantState[],
  gameData: GameData,
  approachX: number,
): number {
  if (player.formationRow !== 'back') return approachX;
  if (getMeleeEnemyContactX(enemies, gameData) !== null) {
    return approachX;
  }
  // 近接全滅後: 後方敵接触点ジャンプによる後列の一斉右追いを防ぐ（後退は許可）
  if (approachX > player.battleX) {
    return player.battleX;
  }
  return approachX;
}

function resolveApproachEnemyContact(
  enemies: CombatantState[],
  gameData: GameData,
  frozenMeleeContactX: number | null,
): number | null {
  const meleeContact = getMeleeEnemyContactX(enemies, gameData);
  if (meleeContact !== null) return meleeContact;
  const front = getEnemyContactX(enemies);
  if (front === null) return null;
  if (frozenMeleeContactX !== null && front > frozenMeleeContactX) {
    return frozenMeleeContactX;
  }
  return front;
}

function capBackRowRangeStop(
  _player: CombatantState,
  rangeStopX: number,
): number {
  return rangeStopX;
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
  const maxForward = resolveApproachAttackBattleX(
    player,
    enemyContact,
    gameData,
  );
  return Math.min(approachX, maxForward);
}

export interface PlayerApproachOptions {
  /** 近接全滅直前の最前線 battleX（後方敵への接触点ジャンプ抑制） */
  frozenMeleeContactX?: number | null;
}

export function resolvePlayerApproachBattleX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  options: PlayerApproachOptions = {},
): number {
  const frozenMeleeContactX = options.frozenMeleeContactX ?? null;
  const contact = resolveApproachEnemyContact(
    enemies,
    gameData,
    frozenMeleeContactX,
  );
  if (contact === null) return player.battleX;

  if (player.formationRow !== 'back') {
    let approachX: number;
    const meleeContact = getMeleeEnemyContactX(enemies, gameData);
    if (meleeContact !== null) {
      approachX = resolveApproachAttackBattleX(player, meleeContact, gameData);
    } else {
      const target = resolvePlayerPriorityTarget(
        player,
        players,
        enemies,
        gameData,
      );
      if (target) {
        approachX = resolveApproachAttackBattleX(
          player,
          target.battleX,
          gameData,
        );
      } else {
        approachX = resolveApproachAttackBattleX(player, contact, gameData);
      }
    }
    return capFrontRowBeforeEnemyContact(
      player,
      enemies,
      gameData,
      approachX,
    );
  }

  const target = resolvePlayerPriorityTarget(
    player,
    players,
    enemies,
    gameData,
  );
  if (target) {
    return capBackRowRangeStop(
      player,
      capForwardAfterMeleeWipe(
        player,
        enemies,
        gameData,
        resolveApproachAttackBattleX(player, target.battleX, gameData),
      ),
    );
  }

  return capBackRowRangeStop(
    player,
    capForwardAfterMeleeWipe(
      player,
      enemies,
      gameData,
      resolveApproachAttackBattleX(player, contact, gameData),
    ),
  );
}

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

/** 接敵中: 接近停止射程（通常攻撃 or 使用可能な短い装備アクティブ）内に届くなら自動接近を止める */
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
  const range = resolveApproachRangePx(unit, gameData);
  const pool = getAttackablePool(spec, unit, players, enemies, range);
  return pool.some((opponent) => opponent.isAlive);
}
