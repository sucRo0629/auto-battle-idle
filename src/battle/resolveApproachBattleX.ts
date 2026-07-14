import type { CombatantState, GameData, TargetSpec } from "./types.ts";
import { getPassiveDefs } from "./combatMath.ts";
import {
  getEnemyContactX,
  getPlayerFrontlineContactX,
  isPlayerRearAssaultAccess,
  PLAYER_OFF_FRONTLINE_PEER_MARGIN_PX,
  resolvePlayerRearAssaultAttackRangePx,
  resolvePlayerRearAssaultHoldBattleX,
  type PlayerRearAssaultBattleContext,
  resolveApproachAttackBattleX,
  resolveAttackBattleX,
  resolveApproachRangePx,
  resolveFormationRangePx,
} from "./combatPosition.ts";
import { pickTargetFromPool, resolvePriorityHealTarget, resolveTargetSpec } from "./skills/targeting.ts";
import {
  getEffectTarget,
  getTargetPool,
  pickEnemySingleTargetFromPool,
  resolveApproachTargetSpec,
} from "./skills/targetSpec.ts";
import { getAttackablePool, isWithinSkillRange } from "./skills/rangeUtils.ts";
import { isStationaryUnit } from "./data/entityTraits.ts";
import { SPRITE_WIDTH } from "./battleConstants.ts";
import { FRONT_ROW_SAME_RANGE_MELEE_DEPTH_PX } from "./battleLayout.ts";
import {
  comparePartyFormationSlot,
  computePartyFormationBattleX,
} from "./partyFormation.ts";
import {
  isAllyHealBasicAttack,
  isPierceEnemyBasicAttack,
  resolveBasicAttackEffect,
} from "./allyHealBasicAttack.ts";

/** `bodyAnimMarching.BODY_ANIM_APPROACH_SETTLED_PX` と同期 */
const APPROACH_SETTLE_EPSILON_PX = 0.5;

function resolveBasicAttackTarget(
  unit: CombatantState,
  gameData: GameData,
): TargetSpec {
  const effect = resolveBasicAttackEffect(unit, gameData);
  if (effect) return getEffectTarget(effect);
  return { kind: "distance", side: "enemy", order: "nearest" };
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
    applyScope: "ally",
    gameData,
  });
}

function livingPlayers(players: CombatantState[]): CombatantState[] {
  return players.filter((player) => player.isAlive);
}

function livingAllyCount(players: CombatantState[]): number {
  return livingPlayers(players).length;
}

/** 射程内に PHT がいれば回復通常攻撃の停止対象 */
function resolveDamagedAllyHealTarget(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  if (!isAllyHealBasicAttack(player, gameData)) return null;
  const pht = resolvePriorityHealTarget(livingPlayers(players));
  if (!pht) return null;
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
  const pool = getAttackablePool(spec, player, players, enemies, range, gameData);
  if (!pool.some((unit) => unit.id === pht.id)) return null;
  return pht;
}

/** ally-heal 接近の基準 X（PHT / 最前味方 / 接触線内前線の優先順） */
function resolveAllyHealApproachAnchorX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): number | null {
  const living = livingPlayers(players);
  if (living.length === 0) return null;

  const range = resolveApproachRangePx(player, gameData, living.length);
  const pht = resolvePriorityHealTarget(living);
  if (pht && !isWithinSkillRange(player, pht, range)) {
    return pht.battleX;
  }

  const frontlineContactX = getPlayerFrontlineContactX(players, enemies);
  const maxAllyX = Math.max(...living.map((ally) => ally.battleX));
  if (frontlineContactX !== null && maxAllyX > frontlineContactX + 1) {
    return maxAllyX;
  }
  return frontlineContactX ?? maxAllyX;
}

/** ally-heal: 味方最前線が heal 射程内か（接近停止の正本） */
function isAllyFrontlineInHealRange(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): boolean {
  if (!isAllyHealBasicAttack(player, gameData)) return false;
  const anchorX = resolveAllyHealApproachAnchorX(
    player,
    players,
    enemies,
    gameData,
  );
  if (anchorX === null) return false;
  const range = resolveApproachRangePx(
    player,
    gameData,
    livingAllyCount(players),
  );
  return Math.abs(anchorX - player.battleX) <= range;
}

/**
 * ally-heal: anchor を heal 射程内に入れる停止 battleX。
 * 前方／後方どちらも abs 距離で判定し、後方 PHT へは左へ接近する。
 * （`resolveApproachAttackBattleX` は接触線を常に前方前提にし、heal の左移動を潰すため使わない）
 */
export function resolveAllyFrontlineHealApproachBattleX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): number {
  const anchorX = resolveAllyHealApproachAnchorX(
    player,
    players,
    enemies,
    gameData,
  );
  if (anchorX === null) {
    return player.battleX;
  }
  const range = resolveApproachRangePx(
    player,
    gameData,
    livingAllyCount(players),
  );
  if (Math.abs(anchorX - player.battleX) <= range) {
    return player.battleX;
  }
  if (anchorX > player.battleX) {
    return anchorX - range;
  }
  return anchorX + range;
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
    applyScope: "enemy",
    gameData,
  });
}

/** 味方: target spec に従う ChaseTarget */
export function resolvePlayerChaseTargetEnemy(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  const spec = resolveUnitTargetSpec(player, players, enemies, gameData);
  const pool = getTargetPool(spec, player, players, enemies, gameData);
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
  const baseRange = resolveApproachRangePx(
    player,
    gameData,
    livingAllyCount(players),
  );
  const range = resolvePlayerRearAssaultAttackRangePx(
    player,
    players,
    enemies,
    baseRange,
  );
  const pool = getAttackablePool(spec, player, players, enemies, range, gameData);
  if (pool.length === 0) return null;
  return pickTargetFromPool(spec, player, pool);
}

/** 敵: combat.md §敵対単体ターゲット選定 — defender 優先・相手戦線最前 chase */
export function resolveEnemyChaseTargetPlayer(
  enemy: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  const spec = resolveUnitTargetSpec(enemy, players, enemies, gameData);
  const pool = getTargetPool(spec, enemy, players, enemies, gameData);
  return pickEnemySingleTargetFromPool(enemy, spec, pool);
}

/** 敵: ChaseTarget が effectiveRangePx 内のときのみ返す */
export function resolveEnemyAttackTargetPlayer(
  enemy: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  const chase = resolveEnemyChaseTargetPlayer(enemy, players, enemies, gameData);
  if (!chase) return null;
  const range = resolveApproachRangePx(enemy, gameData);
  return isWithinSkillRange(enemy, chase, range) ? chase : null;
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

/**
 * 共有 clamp / formation safety layer。
 * 前衛が敵最前線を越えて過進軍しないための cap であり、ChaseTarget の正本ではない。
 */
function capOnFieldBeforeEnemyContact(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  contact: number,
  approachX: number,
): number {
  if (isPlayerRearAssaultAccess(player, { players, enemies })) {
    return approachX;
  }
  // ally-heal: 接近目標は味方最前線基準。敵接触 cap で手前に抑えると PHT が射程外のままになる。
  if (isAllyHealBasicAttack(player, gameData)) {
    return approachX;
  }
  const contactCapX = resolveApproachAttackBattleX(
    player,
    contact,
    gameData,
    livingAllyCount(players),
    contact,
  );
  return Math.min(approachX, contactCapX);
}

/** pierce 敵向け通常攻撃の接近停止 X（contact − effectiveRangePx） */
export function resolvePierceApproachStopBattleX(
  player: CombatantState,
  contact: number,
  gameData: GameData,
  livingAllyCount?: number,
): number {
  const rangePx = resolveApproachRangePx(
    player,
    gameData,
    livingAllyCount,
  );
  return resolveAttackBattleX(player, contact, gameData, rangePx);
}

function isAtPierceApproachStop(
  unit: CombatantState,
  pierceStopX: number,
): boolean {
  if (unit.battleX > pierceStopX) return false;
  return unit.battleX >= pierceStopX - APPROACH_SETTLE_EPSILON_PX;
}

/** 味方: pierce 敵向け通常攻撃の接近目標 X（chase 個体ではなく contact 基準） */
export function resolvePlayerChaseApproachBattleX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  contact: number,
): number {
  const allyCount = livingAllyCount(players);
  if (isPierceEnemyBasicAttack(player, gameData)) {
    return resolvePierceApproachStopBattleX(
      player,
      contact,
      gameData,
      allyCount,
    );
  }
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
      contact,
    );
  }
  return resolveApproachAttackBattleX(
    player,
    contact,
    gameData,
    allyCount,
    contact,
  );
}

function resolveSharedPlayerApproachBattleX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  contact: number,
): number {
  if (isAllyHealBasicAttack(player, gameData)) {
    return resolveAllyFrontlineHealApproachBattleX(
      player,
      players,
      enemies,
      gameData,
    );
  }
  return resolvePlayerChaseApproachBattleX(
    player,
    players,
    enemies,
    gameData,
    contact,
  );
}

function resolvePlayerApproachWithoutEnemyContact(
  players: CombatantState[],
): Map<string, number> {
  const living = players.filter((player) => player.isAlive);
  if (living.length === 0) {
    return new Map(players.map((player) => [player.id, player.battleX]));
  }
  const formation = computePartyFormationBattleX(
    living.map((player) => ({
      id: player.id,
      role: player.role,
      rangePx: resolveFormationRangePx(player),
      damageType: player.traits.damageType,
      formationRow: player.formationRow,
    })),
  );
  const partyFrontDeployX = Math.max(...formation.values());
  const targets = new Map<string, number>();
  for (const player of living) {
    const deployX = formation.get(player.id) ?? player.battleX;
    if (player.battleX > partyFrontDeployX + FRONT_ROW_SAME_RANGE_MELEE_DEPTH_PX) {
      targets.set(player.id, deployX);
    } else {
      targets.set(player.id, player.battleX);
    }
  }
  for (const player of players) {
    if (!player.isAlive) continue;
    if (!targets.has(player.id)) {
      targets.set(player.id, player.battleX);
    }
  }
  return targets;
}

/** 列内スペーシング前の個別接近目標 X */
function resolveIndividualPlayerApproachBattleX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  contact: number,
): number {
  const approachX = resolveSharedPlayerApproachBattleX(
    player,
    players,
    enemies,
    gameData,
    contact,
  );

  return capOnFieldBeforeEnemyContact(
    player,
    players,
    enemies,
    gameData,
    contact,
    approachX,
  );
}

/**
 * 戦線外 rear assault の接近目標は march follow で前進側へ押し出さない。
 * 個別 base（rear return 等）より手前に出ると射程外で停止デッドロックになる。
 */
function clampRearAssaultApproachAfterMarchFollow(
  targets: Map<string, number>,
  baseApproach: Map<string, number>,
  players: CombatantState[],
  battleContext: PlayerRearAssaultBattleContext,
): void {
  for (const player of players) {
    if (!player.isAlive) continue;
    if (!isPlayerRearAssaultAccess(player, battleContext)) continue;
    const base = baseApproach.get(player.id);
    const target = targets.get(player.id);
    if (base === undefined || target === undefined) continue;
    if (target > base) {
      targets.set(player.id, base);
    }
  }
}

/** 全味方の接敵目標 battleX */
export function resolveAllPlayerApproachBattleX(
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): Map<string, number> {
  const contact = getEnemyContactX(enemies);
  if (contact === null) {
    return resolvePlayerApproachWithoutEnemyContact(players);
  }

  const battleContext: PlayerRearAssaultBattleContext = { players, enemies };
  const targets = new Map<string, number>();
  const baseApproach = new Map<string, number>();
  for (const player of players) {
    let base = resolveIndividualPlayerApproachBattleX(
      player,
      players,
      enemies,
      gameData,
      contact,
    );
    // 敵接触線（min）より奥＝敵の背後側。chase stop（左・味方側）へは戻さない。
    // いま背後にいる敵（最奥の左隣敵）+ hold offset を追従する。
    // 前衛 contact 固定だと後衛背後から contact 側へ左引きになる。
    if (
      isPlayerRearAssaultAccess(player, battleContext) &&
      player.battleX > contact + PLAYER_OFF_FRONTLINE_PEER_MARGIN_PX
    ) {
      const hold = resolvePlayerRearAssaultHoldBattleX(player, enemies);
      if (hold !== null) {
        base = hold;
      }
    }
    baseApproach.set(player.id, base);
    targets.set(player.id, base);
  }

  applyFormationMarchFollow(
    targets,
    players.filter(
      (player) =>
        player.isAlive &&
        !isPlayerRearAssaultAccess(player, battleContext),
    ),
  );
  clampRearAssaultApproachAfterMarchFollow(
    targets,
    baseApproach,
    players,
    battleContext,
  );

  return targets;
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

  if (living.length < 2) return;

  const sorted = [...living].sort((a, b) =>
    comparePartyFormationSlot(
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
  const leader = sorted[0]!;
  const leaderTarget = targets.get(leader.id);
  const leaderFormX = formation.get(leader.id);
  if (leaderTarget === undefined || leaderFormX === undefined) return;
  if (leader.battleX >= leaderTarget - 0.5) return;

  for (const unit of sorted.slice(1)) {
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

export function resolvePlayerApproachBattleX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): number {
  const all = resolveAllPlayerApproachBattleX(players, enemies, gameData);
  return all.get(player.id) ?? player.battleX;
}

/**
 * 描画向き用 AttackTarget。
 * ally-heal は heal 停止条件（PHT 射程内 / 最前線 anchor 射程内）を満たすときだけ focus を返す。
 * 接近中に後方味方だけ射程内の場合は null（既定 +X）とし、進軍向きと背後向きの揺れを防ぐ。
 */
export function resolvePlayerFacingFocus(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  const attackFocus = resolvePlayerAttackTargetEnemy(
    player,
    players,
    enemies,
    gameData,
  );
  if (!isAllyHealBasicAttack(player, gameData)) {
    return attackFocus;
  }
  if (
    resolveDamagedAllyHealTarget(player, players, enemies, gameData) !== null ||
    isAllyFrontlineInHealRange(player, players, enemies, gameData)
  ) {
    return attackFocus;
  }
  return null;
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
    const contact = players.filter(
      (p) => p.isAlive && p.battleX <= enemy.battleX,
    );
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
  options?: { approachTargetX?: number },
): boolean {
  if (isStationaryUnit(unit)) return true;
  if (unit.isEnemy) {
    return (
      resolveEnemyAttackTargetPlayer(unit, players, enemies, gameData) !== null
    );
  }

  const approachTargetX = options?.approachTargetX;
  const retreatingToApproachTarget =
    approachTargetX !== undefined &&
    approachTargetX < unit.battleX - APPROACH_SETTLE_EPSILON_PX;

  if (isAllyHealBasicAttack(unit, gameData)) {
    if (resolveDamagedAllyHealTarget(unit, players, enemies, gameData) !== null) {
      return true;
    }
    if (isAllyFrontlineInHealRange(unit, players, enemies, gameData)) {
      return true;
    }
    if (retreatingToApproachTarget) return false;
    return false;
  }

  if (!isPierceEnemyBasicAttack(unit, gameData)) {
    const attackTarget = resolvePlayerAttackTargetEnemy(
      unit,
      players,
      enemies,
      gameData,
    );
    if (attackTarget !== null) {
      const allyCount = livingAllyCount(players);
      const stopX = resolveApproachAttackBattleX(
        unit,
        attackTarget.battleX,
        gameData,
        allyCount,
        getEnemyContactX(enemies) ?? attackTarget.battleX,
      );
      const approachRange = resolveApproachRangePx(unit, gameData, allyCount);
      const meleeStandoffRetreat =
        approachRange <= SPRITE_WIDTH &&
        unit.battleX < attackTarget.battleX &&
        unit.battleX > stopX + APPROACH_SETTLE_EPSILON_PX;
      if (meleeStandoffRetreat) return false;
      return true;
    }
    if (retreatingToApproachTarget) return false;
  }

  if (isPierceEnemyBasicAttack(unit, gameData)) {
    const contact = getEnemyContactX(enemies);
    if (contact === null) return true;
    const pierceStopX = resolvePierceApproachStopBattleX(
      unit,
      contact,
      gameData,
      livingAllyCount(players),
    );
    return isAtPierceApproachStop(unit, pierceStopX);
  }
  return (
    resolvePlayerAttackTargetEnemy(unit, players, enemies, gameData) !== null
  );
}
