import type { CombatantState, GameData, TargetSpec } from './types.ts';
import { getPassiveDefs } from './combatMath.ts';
import {
  getEnemyContactX,
  getMeleeEnemyContactX,
  resolveApproachAttackBattleX,
  resolveAttackBattleX,
  resolveApproachRangePx,
} from './combatPosition.ts';
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

function resolveUnitTargetSpec(
  unit: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): TargetSpec {
  const passives = getPassiveDefs(unit, gameData.skillRegistry.passives);
  const defaultSpec = resolveBasicAttackTarget(unit, gameData);
  return resolveTargetSpec(passives, defaultSpec, {
    actor: unit,
    allies: players,
    enemies,
    applyScope: 'enemy',
  });
}

/** 味方: attacker/supporter の chase（敵編成の奥 = battleX 最大） */
export function resolvePlayerChaseTargetEnemy(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  const spec = resolveUnitTargetSpec(player, players, enemies, gameData);
  const pool = getTargetPool(spec, player, players, enemies);
  return pickTargetFromPool(spec, player, pool);
}

/** 味方: 射程内の攻撃対象（停止判定・攻撃と同じプール） */
export function resolvePlayerAttackTargetEnemy(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  const spec = resolveUnitTargetSpec(player, players, enemies, gameData);
  const range = resolveApproachRangePx(player, gameData);
  const pool = getAttackablePool(spec, player, players, enemies, range);
  if (pool.length === 0) return null;
  return pickTargetFromPool(spec, player, pool);
}

/** 敵: 全生存プレイヤーからヘイト最大を chase（毎 tick 再評価） */
export function resolveEnemyChaseTargetPlayer(
  enemy: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  const spec = resolveUnitTargetSpec(enemy, players, enemies, gameData);
  const pool = getTargetPool(spec, enemy, players, enemies);
  return pickTargetFromPool(spec, enemy, pool);
}

/** 敵: 射程内プレイヤーからヘイト最大（停止・攻撃） */
export function resolveEnemyAttackTargetPlayer(
  enemy: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  const spec = resolveUnitTargetSpec(enemy, players, enemies, gameData);
  const range = resolveApproachRangePx(enemy, gameData);
  const pool = getAttackablePool(spec, enemy, players, enemies, range);
  if (pool.length === 0) return null;
  return pickTargetFromPool(spec, enemy, pool);
}

/** @deprecated resolveEnemyAttackTargetPlayer を使用 */
export function resolveEnemyBasicAttackTarget(
  enemy: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  return resolveEnemyAttackTargetPlayer(enemy, players, enemies, gameData);
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

function resolveDefenderApproachBattleX(
  player: CombatantState,
  enemies: CombatantState[],
  gameData: GameData,
  contact: number,
): number {
  const meleeContact = getMeleeEnemyContactX(enemies, gameData);
  const chaseContact = meleeContact ?? getEnemyContactX(enemies) ?? contact;
  return resolveApproachAttackBattleX(player, chaseContact, gameData);
}

function resolveNonDefenderApproachBattleX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  contact: number,
): number {
  const chase = resolvePlayerChaseTargetEnemy(
    player,
    players,
    enemies,
    gameData,
  );
  if (chase) {
    return resolveApproachAttackBattleX(player, chase.battleX, gameData);
  }
  return resolveApproachAttackBattleX(player, contact, gameData);
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

  const approachX =
    player.role === 'defender'
      ? resolveDefenderApproachBattleX(player, enemies, gameData, contact)
      : resolveNonDefenderApproachBattleX(
          player,
          players,
          enemies,
          gameData,
          contact,
        );

  if (player.formationRow !== 'back') {
    return capFrontRowBeforeEnemyContact(
      player,
      enemies,
      gameData,
      approachX,
    );
  }

  return capBackRowRangeStop(
    player,
    capForwardAfterMeleeWipe(
      player,
      enemies,
      gameData,
      approachX,
    ),
  );
}

export function resolveEnemyApproachBattleX(
  enemy: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): number {
  const chase = resolveEnemyChaseTargetPlayer(
    enemy,
    players,
    enemies,
    gameData,
  );
  if (!chase) {
    const contact = players.filter((p) => p.isAlive);
    if (contact.length === 0) return enemy.battleX;
    const frontX = Math.max(...contact.map((p) => p.battleX));
    return resolveAttackBattleX(enemy, frontX, gameData);
  }
  return resolveApproachAttackBattleX(enemy, chase.battleX, gameData);
}

/** 接敵中: 射程内に攻撃対象がいれば自動接近を止める */
export function shouldSkipEngagedAutoApproach(
  unit: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): boolean {
  if (unit.isEnemy) {
    return (
      resolveEnemyAttackTargetPlayer(unit, players, enemies, gameData) !==
      null
    );
  }
  return (
    resolvePlayerAttackTargetEnemy(unit, players, enemies, gameData) !== null
  );
}
