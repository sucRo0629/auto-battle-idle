import type { CombatantState, GameData, TargetSpec } from "./types.ts";
import { getPassiveDefs } from "./combatMath.ts";
import {
  getEnemyContactX,
  isPlayerRearAssaultAccess,
  PLAYER_OFF_FRONTLINE_PEER_MARGIN_PX,
  resolvePlayerRearAssaultAttackRangePx,
  resolvePlayerRearAssaultHoldBattleX,
  type PlayerRearAssaultBattleContext,
  resolveApproachAttackBattleX,
  resolveApproachFormationRangePx,
  resolveAttackBattleX,
  resolveApproachRangePx,
  resolveFormationRangePx,
  resolvePlayerFrontlineOwners,
} from "./combatPosition.ts";
import { pickTargetFromPool, resolvePriorityHealTarget, resolveTargetSpec } from "./skills/targeting.ts";
import {
  getEffectTarget,
  getTargetPool,
  pickEnemySingleTargetFromPool,
  resolveApproachTargetSpec,
} from "./skills/targetSpec.ts";
import { getAttackablePool, isWithinSkillRange } from "./skills/rangeUtils.ts";
import { isRangedAttack, isStationaryUnit } from "./data/entityTraits.ts";
import { applyPartyFormationApproachSpacing } from "./battleLayout.ts";
import { FORMATION_DEPTH_STEP_PX } from "./battleLayout.ts";
import {
  comparePartyFormationSlot,
  computePartyFormationBattleX,
  isMeleeFormationSlot,
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
  const pool = getAttackablePool(spec, player, players, enemies, range);
  if (!pool.some((unit) => unit.id === pht.id)) return null;
  return pht;
}

/** 射程外の PHT（接近目標） */
function resolveOutOfRangeDamagedAllyHealTarget(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  if (!isAllyHealBasicAttack(player, gameData)) return null;
  const pht = resolvePriorityHealTarget(livingPlayers(players));
  if (!pht) return null;
  const range = resolveApproachRangePx(
    player,
    gameData,
    livingAllyCount(players),
  );
  if (isWithinSkillRange(player, pht, range)) return null;
  return pht;
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
  const pool = getAttackablePool(spec, player, players, enemies, range);
  if (pool.length === 0) return null;
  return pickTargetFromPool(spec, player, pool);
}

/** 敵: combat.md §敵の単体ターゲット選定 — defender 優先・最近傍 chase */
export function resolveEnemyChaseTargetPlayer(
  enemy: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState | null {
  const spec = resolveUnitTargetSpec(enemy, players, enemies, gameData);
  const pool = getTargetPool(spec, enemy, players, enemies);
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

function hasRangedPriorityChaseTargetRule(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): boolean {
  const spec = resolveUnitTargetSpec(player, players, enemies, gameData);
  if (spec.kind === "attackType" && spec.ranged === true) return true;
  return (
    spec.kind === "distance" &&
    spec.side === "enemy" &&
    spec.order === "farthest"
  );
}

/** 後列遠隔が前列味方の battleX を追い越さない上限（null = 自ユニットが前線帯） */
function resolveAllyFrontlineSafetyCapX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  contact: number,
): number | null {
  const owners = resolvePlayerFrontlineOwners(players, enemies);
  if (owners.length === 0) return null;
  if (owners.some((ally) => ally.id === player.id)) return null;

  const allyCount = livingAllyCount(players);
  let maxFrontlineX = Number.NEGATIVE_INFINITY;
  for (const ally of owners) {
    const allyApproach = resolveSharedPlayerApproachBattleX(
      ally,
      players,
      enemies,
      gameData,
      contact,
    );
    const allyContactCap = resolveApproachAttackBattleX(
      ally,
      contact,
      gameData,
      allyCount,
      contact,
    );
    maxFrontlineX = Math.max(
      maxFrontlineX,
      ally.battleX,
      Math.min(allyApproach, allyContactCap),
    );
  }
  return maxFrontlineX - FORMATION_DEPTH_STEP_PX;
}

/**
 * contact より奥の ranged 優先 ChaseTarget 向けに cap を緩和する。
 * chase 停止 X が contact cap より前進側なら、前列追越 cap まで許可する。
 */
function resolveRangedRearChaseContactCapX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  contact: number,
  contactCapX: number,
): number {
  if (!isRangedAttack(resolveApproachFormationRangePx(player))) {
    return contactCapX;
  }
  if (!hasRangedPriorityChaseTargetRule(player, players, enemies, gameData)) {
    return contactCapX;
  }
  const chase = resolvePlayerChaseTargetEnemy(
    player,
    players,
    enemies,
    gameData,
  );
  if (!chase || chase.battleX <= contact) {
    return contactCapX;
  }
  const chaseStopX = resolveApproachAttackBattleX(
    player,
    chase.battleX,
    gameData,
    livingAllyCount(players),
    contact,
  );
  if (chaseStopX <= contactCapX) {
    return contactCapX;
  }
  const safetyCap = resolveAllyFrontlineSafetyCapX(
    player,
    players,
    enemies,
    gameData,
    contact,
  );
  return safetyCap === null
    ? chaseStopX
    : Math.min(chaseStopX, safetyCap);
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
  const contactCapX = resolveApproachAttackBattleX(
    player,
    contact,
    gameData,
    livingAllyCount(players),
    contact,
  );
  const maxForward = resolveRangedRearChaseContactCapX(
    player,
    players,
    enemies,
    gameData,
    contact,
    contactCapX,
  );
  return Math.min(approachX, maxForward);
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
      const enemyStopX = resolvePlayerChaseApproachBattleX(
        player,
        players,
        enemies,
        gameData,
        contact,
      );
      return Math.min(healStop, enemyStopX);
    }
    return player.battleX;
  }
  return resolvePlayerChaseApproachBattleX(
    player,
    players,
    enemies,
    gameData,
    contact,
  );
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

function toMeleeFormationSlot(unit: CombatantState): {
  id: string;
  role: CombatantState["role"];
  rangePx: number;
  damageType: CombatantState["traits"]["damageType"];
  formationRow: CombatantState["formationRow"];
} {
  return {
    id: unit.id,
    role: unit.role,
    rangePx: resolveApproachFormationRangePx(unit),
    damageType: unit.traits.damageType,
    formationRow: unit.formationRow,
  };
}

function capFrontRowSupporterBehindMeleeFront(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  contact: number,
  approachX: number,
): number {
  if (player.role !== "supporter") {
    return approachX;
  }
  const livingOnField = players.filter(
    (ally) =>
      ally.isAlive &&
      !isPlayerRearAssaultAccess(ally, { players, enemies }),
  );
  if (livingOnField.length === 0) return approachX;
  const contactX = Math.max(...livingOnField.map((ally) => ally.battleX));
  let maxMeleeFrontX = Number.NEGATIVE_INFINITY;
  for (const ally of players) {
    if (!ally.isAlive) continue;
    if (isPlayerRearAssaultAccess(ally, { players, enemies })) continue;
    if (!isMeleeFormationSlot(toMeleeFormationSlot(ally))) continue;
    if (ally.battleX < contactX - FORMATION_DEPTH_STEP_PX) continue;
    const meleeX = resolvePlayerChaseApproachBattleX(
      ally,
      players,
      enemies,
      gameData,
      contact,
    );
    maxMeleeFrontX = Math.max(maxMeleeFrontX, meleeX);
  }
  if (maxMeleeFrontX === Number.NEGATIVE_INFINITY) return approachX;
  return Math.min(approachX, maxMeleeFrontX - FORMATION_DEPTH_STEP_PX);
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
    if (player.battleX > partyFrontDeployX + FORMATION_DEPTH_STEP_PX) {
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
  let approachX = resolveSharedPlayerApproachBattleX(
    player,
    players,
    enemies,
    gameData,
    contact,
  );

  approachX = capFrontRowSupporterBehindMeleeFront(
    player,
    players,
    enemies,
    gameData,
    contact,
    approachX,
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
 * spacing 後: supporter の個別接近意図を連鎖で上書きしない。
 * 後列 attacker の深追い chase が heal supporter の現位置維持を引きずらない。
 */
function capApproachFormationOrder(
  targets: Map<string, number>,
  individualBases: Map<string, number>,
  players: CombatantState[],
): void {
  for (const player of players) {
    if (!player.isAlive || player.role !== "supporter") continue;
    const base = individualBases.get(player.id);
    const spaced = targets.get(player.id);
    if (base === undefined || spaced === undefined) continue;
    if (spaced > base) {
      targets.set(player.id, base);
    }
  }
}

/**
 * 戦線外 rear assault の接近目標は spacing で前進側へ押し出さない。
 * 個別 base（rear return 等）より手前に出ると射程外で停止デッドロックになる。
 */
function clampRearAssaultApproachAfterSpacing(
  spaced: Map<string, number>,
  baseApproach: Map<string, number>,
  players: CombatantState[],
  battleContext: PlayerRearAssaultBattleContext,
): void {
  for (const player of players) {
    if (!player.isAlive) continue;
    if (!isPlayerRearAssaultAccess(player, battleContext)) continue;
    const base = baseApproach.get(player.id);
    const target = spaced.get(player.id);
    if (base === undefined || target === undefined) continue;
    if (target > base) {
      spaced.set(player.id, base);
    }
  }
}

function capRangedRearChaseAfterFormationSpacing(
  targets: Map<string, number>,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  contact: number,
): void {
  const battleContext: PlayerRearAssaultBattleContext = { players, enemies };
  for (const player of players) {
    if (!player.isAlive) continue;
    if (isPlayerRearAssaultAccess(player, battleContext)) continue;
    const contactCapX = resolveApproachAttackBattleX(
      player,
      contact,
      gameData,
      livingAllyCount(players),
      contact,
    );
    const maxForward = resolveRangedRearChaseContactCapX(
      player,
      players,
      enemies,
      gameData,
      contact,
      contactCapX,
    );
    if (maxForward <= contactCapX) continue;
    const target = targets.get(player.id);
    if (target !== undefined && target > maxForward) {
      targets.set(player.id, maxForward);
    }
  }
}

/** 全味方の接敵目標 battleX（列内スペーシング適用済み） */
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
  }

  const spacingInputs = players.map(toPlacementInput);

  const spaced = applyPartyFormationApproachSpacing(baseApproach, spacingInputs);
  capApproachFormationOrder(spaced, baseApproach, players);
  clampRearAssaultApproachAfterSpacing(
    spaced,
    baseApproach,
    players,
    battleContext,
  );
  applyFormationMarchFollow(
    spaced,
    players.filter(
      (player) =>
        player.isAlive &&
        !isPlayerRearAssaultAccess(player, battleContext),
    ),
  );
  capRangedRearChaseAfterFormationSpacing(
    spaced,
    players,
    enemies,
    gameData,
    contact,
  );

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
  const leader = sorted[sorted.length - 1]!;
  const leaderTarget = targets.get(leader.id);
  const leaderFormX = formation.get(leader.id);
  if (leaderTarget === undefined || leaderFormX === undefined) return;
  if (leader.battleX >= leaderTarget - 0.5) return;

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

export function resolvePlayerApproachBattleX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): number {
  const all = resolveAllPlayerApproachBattleX(players, enemies, gameData);
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
  const approachTargetX = options?.approachTargetX;
  if (
    !unit.isEnemy &&
    approachTargetX !== undefined &&
    approachTargetX < unit.battleX - APPROACH_SETTLE_EPSILON_PX
  ) {
    return false;
  }
  if (unit.isEnemy) {
    return (
      resolveEnemyAttackTargetPlayer(unit, players, enemies, gameData) !== null
    );
  }
  if (isAllyHealBasicAttack(unit, gameData)) {
    return (
      resolveDamagedAllyHealTarget(unit, players, enemies, gameData) !== null
    );
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
