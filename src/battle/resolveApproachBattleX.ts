import type {
  CombatantState,
  GameData,
  TargetSpec,
} from './types.ts';
import { getPassiveDefs } from './combatMath.ts';
import {
  getEnemyContactX,
  resolveApproachAttackBattleX,
  resolveApproachFormationRangePx,
  resolveAttackBattleX,
  resolveApproachRangePx,
  resolveFormationRangePx,
} from './combatPosition.ts';
import { pickTargetFromPool, resolveTargetSpec } from './skills/targeting.ts';
import {
  getEffectTarget,
  getTargetPool,
  resolveApproachTargetSpec,
} from './skills/targetSpec.ts';
import { getAttackablePool, isWithinSkillRange } from './skills/rangeUtils.ts';
import { isStationaryUnit } from './data/entityTraits.ts';
import { applyFormationRowApproachSpacing } from './battleLayout.ts';
import { FORMATION_DEPTH_STEP_PX } from './battleLayout.ts';
import {
  compareFormationRowSlot,
  computePartyFormationBattleX,
} from './partyFormation.ts';
import {
  isAllyHealBasicAttack,
  resolveBasicAttackEffect,
} from './allyHealBasicAttack.ts';

function resolveBasicAttackTarget(
  unit: CombatantState,
  gameData: GameData,
): TargetSpec {
  const effect = resolveBasicAttackEffect(unit, gameData);
  if (effect) return getEffectTarget(effect);
  return { kind: 'distance', side: 'enemy', order: 'nearest' };
}

function resolveAllyHealBasicTargetSpec(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): TargetSpec {
  const effect = resolveBasicAttackEffect(player, gameData);
  if (!effect) return resolveBasicAttackTarget(player, gameData);
  const passives = getPassiveDefs(player, gameData.skillRegistry.passives);
  const defaultSpec = getEffectTarget(effect);
  return resolveTargetSpec(passives, defaultSpec, {
    actor: player,
    allies: players,
    enemies,
    applyScope: 'ally',
  });
}

function livingPlayers(players: CombatantState[]): CombatantState[] {
  return players.filter((player) => player.isAlive);
}

function livingAllyCount(players: CombatantState[]): number {
  return livingPlayers(players).length;
}

/** 射程内に負傷味方がいれば回復通常攻撃の停止対象 */
function resolveDamagedAllyHealTarget(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  if (!isAllyHealBasicAttack(player, gameData)) return null;
  const spec = resolveAllyHealBasicTargetSpec(
    player,
    players,
    enemies,
    gameData,
  );
  const range = resolveApproachRangePx(
    player,
    gameData,
    livingAllyCount(players),
  );
  const pool = getAttackablePool(spec, player, players, enemies, range);
  const damaged = pool.filter((unit) => unit.isAlive && unit.hp < unit.maxHp);
  if (damaged.length === 0) return null;
  return pickTargetFromPool(spec, player, damaged);
}

/** 射程外の負傷味方（接近目標） */
function resolveOutOfRangeDamagedAllyHealTarget(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  if (!isAllyHealBasicAttack(player, gameData)) return null;
  const spec = resolveAllyHealBasicTargetSpec(
    player,
    players,
    enemies,
    gameData,
  );
  const range = resolveApproachRangePx(
    player,
    gameData,
    livingAllyCount(players),
  );
  const pool = getTargetPool(spec, player, players, enemies);
  const outOfRange = pool.filter(
    (unit) =>
      unit.isAlive &&
      unit.hp < unit.maxHp &&
      !isWithinSkillRange(player, unit, range),
  );
  if (outOfRange.length === 0) return null;
  return pickTargetFromPool(spec, player, outOfRange);
}

function resolveUnitTargetSpec(
  unit: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): TargetSpec {
  const passives = getPassiveDefs(unit, gameData.skillRegistry.passives);
  const defaultSpec = resolveApproachTargetSpec(
    resolveBasicAttackTarget(unit, gameData),
  );
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
  const range = resolveApproachRangePx(
    player,
    gameData,
    livingAllyCount(players),
  );
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

/** 後衛: 敵前線が凍結点より奥へ退いたあと、右追いジャンプを抑止（§4.4） */
function capForwardAfterFrontContactJump(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  approachX: number,
  frozenFrontContactX: number | null,
): number {
  if (player.formationRow !== 'back') return approachX;
  const front = getEnemyContactX(enemies);
  if (
    front === null ||
    frozenFrontContactX === null ||
    front <= frozenFrontContactX
  ) {
    return approachX;
  }
  if (
    approachX > player.battleX &&
    resolveOutOfRangeDamagedAllyHealTarget(
      player,
      players,
      enemies,
      gameData,
    )
  ) {
    return approachX;
  }
  if (approachX > player.battleX) {
    return player.battleX;
  }
  return approachX;
}

function resolveApproachEnemyContact(
  enemies: CombatantState[],
  frozenFrontContactX: number | null,
): number | null {
  const front = getEnemyContactX(enemies);
  if (front === null) return null;
  if (frozenFrontContactX !== null && front > frozenFrontContactX) {
    return frozenFrontContactX;
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
  players: CombatantState[],
  gameData: GameData,
  contact: number,
  approachX: number,
): number {
  if (player.formationRow === 'back') return approachX;
  const maxForward = resolveApproachAttackBattleX(
    player,
    contact,
    gameData,
    livingAllyCount(players),
  );
  return Math.min(approachX, maxForward);
}

function resolveDefenderApproachBattleX(
  player: CombatantState,
  players: CombatantState[],
  gameData: GameData,
  contact: number,
): number {
  return resolveApproachAttackBattleX(
    player,
    contact,
    gameData,
    livingAllyCount(players),
  );
}

function resolveEnemyBasedApproachBattleX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  contact: number,
): number {
  const allyCount = livingAllyCount(players);
  const chase = resolvePlayerChaseTargetEnemy(
    player,
    players,
    enemies,
    gameData,
  );
  if (chase) {
    return resolveApproachAttackBattleX(
      player,
      chase.battleX,
      gameData,
      allyCount,
    );
  }
  return resolveApproachAttackBattleX(player, contact, gameData, allyCount);
}

function resolveNonDefenderApproachBattleX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  contact: number,
): number {
  const allyCount = livingAllyCount(players);
  if (isAllyHealBasicAttack(player, gameData)) {
    const outOfRange = resolveOutOfRangeDamagedAllyHealTarget(
      player,
      players,
      enemies,
      gameData,
    );
    if (outOfRange) {
      const healStop = resolveApproachAttackBattleX(
        player,
        outOfRange.battleX,
        gameData,
        allyCount,
      );
      const enemyStopX = resolveEnemyBasedApproachBattleX(
        player,
        players,
        enemies,
        gameData,
        contact,
      );
      return Math.min(healStop, enemyStopX);
    }
  }
  return resolveEnemyBasedApproachBattleX(
    player,
    players,
    enemies,
    gameData,
    contact,
  );
}

export interface PlayerApproachOptions {
  /** 敵前線凍結 battleX（前線退避後の後衛ジャンプ抑制。§4.4） */
  frozenMeleeContactX?: number | null;
}

function toPlacementInput(unit: CombatantState) {
  return {
    id: unit.id,
    role: unit.role,
    formationRow: unit.formationRow,
    rangePx: resolveApproachFormationRangePx(unit),
    isAlive: unit.isAlive,
  };
}

function capFrontRowSupporterBehindDefenders(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  contact: number,
  approachX: number,
): number {
  if (player.formationRow !== 'front' || player.role !== 'supporter') {
    return approachX;
  }
  let maxDefenderX = Number.NEGATIVE_INFINITY;
  for (const ally of players) {
    if (!ally.isAlive) continue;
    if (ally.formationRow !== 'front' || ally.role !== 'defender') continue;
    const defX = resolveDefenderApproachBattleX(
      ally,
      players,
      gameData,
      contact,
    );
    maxDefenderX = Math.max(maxDefenderX, defX);
  }
  if (maxDefenderX === Number.NEGATIVE_INFINITY) return approachX;
  return Math.min(approachX, maxDefenderX - FORMATION_DEPTH_STEP_PX);
}

/** 列内スペーシング前の個別接近目標 X */
function resolveIndividualPlayerApproachBattleX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  contact: number,
  frozenFrontContactX: number | null,
): number {
  let approachX =
    player.role === 'defender'
      ? resolveDefenderApproachBattleX(
          player,
          players,
          gameData,
          contact,
        )
      : resolveNonDefenderApproachBattleX(
          player,
          players,
          enemies,
          gameData,
          contact,
        );

  approachX = capFrontRowSupporterBehindDefenders(
    player,
    players,
    enemies,
    gameData,
    contact,
    approachX,
  );

  if (player.formationRow !== 'back') {
    approachX = capFrontRowBeforeEnemyContact(
      player,
      players,
      gameData,
      contact,
      approachX,
    );
    return approachX;
  }

  return capBackRowRangeStop(
    player,
    capForwardAfterFrontContactJump(
      player,
      players,
      enemies,
      gameData,
      approachX,
      frozenFrontContactX,
    ),
  );
}

/** 全味方の接敵目標 battleX（列内スペーシング適用済み） */
export function resolveAllPlayerApproachBattleX(
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  options: PlayerApproachOptions = {},
): Map<string, number> {
  const frozenFrontContactX = options.frozenMeleeContactX ?? null;
  const contact = resolveApproachEnemyContact(enemies, frozenFrontContactX);
  if (contact === null) {
    return new Map(players.map((p) => [p.id, p.battleX]));
  }

  const baseApproach = new Map<string, number>();
  for (const player of players) {
    baseApproach.set(
      player.id,
      resolveIndividualPlayerApproachBattleX(
        player,
        players,
        enemies,
        gameData,
        contact,
        frozenFrontContactX,
      ),
    );
  }

  const spacingInputs = players.map(toPlacementInput);

  const spaced = applyFormationRowApproachSpacing(baseApproach, spacingInputs);
  applyFormationMarchFollow(spaced, players);

  return spaced;
}

/**
 * 進軍中: 列リーダーが停止位置に達するまで、後方ユニットは
 * PartyDeploy と同じ相対オフセットを維持（同速で隊列を保つ）。
 */
function applyFormationMarchFollow(
  targets: Map<string, number>,
  players: CombatantState[],
): void {
  const living = players.filter((p) => p.isAlive);
  if (living.length < 2) return;

  const formation = computePartyFormationBattleX(
    living.map((p) => ({
      id: p.id,
      role: p.role,
      rangePx: resolveFormationRangePx(p),
      damageType: p.traits.damageType,
      formationRow: p.formationRow,
    })),
  );

  const rows = new Set(living.map((p) => p.formationRow));
  for (const row of rows) {
    const rowUnits = living.filter((p) => p.formationRow === row);
    if (rowUnits.length < 2) continue;

    const sorted = [...rowUnits].sort((a, b) =>
      compareFormationRowSlot(
        row,
        {
          id: a.id,
          role: a.role,
          rangePx: resolveFormationRangePx(a),
          damageType: a.traits.damageType,
          formationRow: a.formationRow,
        },
        {
          id: b.id,
          role: b.role,
          rangePx: resolveFormationRangePx(b),
          damageType: b.traits.damageType,
          formationRow: b.formationRow,
        },
      ),
    );
    const leader = sorted[sorted.length - 1]!;
    const leaderTarget = targets.get(leader.id);
    const leaderFormX = formation.get(leader.id);
    if (leaderTarget === undefined || leaderFormX === undefined) continue;
    if (leader.battleX >= leaderTarget - 0.5) continue;

    for (const unit of sorted.slice(0, -1)) {
      const unitFormX = formation.get(unit.id);
      if (unitFormX === undefined) continue;

      const deployGap = leaderFormX - unitFormX;
      const currentGap = leader.battleX - unit.battleX;
      if (Math.abs(currentGap - deployGap) > 2) continue;

      const followTarget = leaderTarget + (unitFormX - leaderFormX);
      const spaced = targets.get(unit.id);
      if (spaced !== undefined && spaced > followTarget) {
        targets.set(unit.id, Math.max(followTarget, unit.battleX));
      }
    }
  }
}

export function resolvePlayerApproachBattleX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  options: PlayerApproachOptions = {},
): number {
  const all = resolveAllPlayerApproachBattleX(
    players,
    enemies,
    gameData,
    options,
  );
  return all.get(player.id) ?? player.battleX;
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
  if (isStationaryUnit(unit)) return true;
  if (unit.isEnemy) {
    return (
      resolveEnemyAttackTargetPlayer(unit, players, enemies, gameData) !==
      null
    );
  }
  if (isAllyHealBasicAttack(unit, gameData)) {
    return (
      resolveDamagedAllyHealTarget(unit, players, enemies, gameData) !== null
    );
  }
  return (
    resolvePlayerAttackTargetEnemy(unit, players, enemies, gameData) !== null
  );
}
