import type { CombatantState, GameData, TargetSpec } from "./types.ts";
import { getPassiveDefs } from "./combatMath.ts";
import {
  getEnemyContactX,
  isPlayerRearAssaultAccess,
  type PlayerRearAssaultBattleContext,
  resolveApproachAttackBattleX,
  resolveApproachFormationRangePx,
  resolveAttackBattleX,
  resolveApproachRangePx,
  resolveFormationRangePx,
} from "./combatPosition.ts";
import { pickTargetFromPool, resolvePriorityHealTarget, resolveTargetSpec } from "./skills/targeting.ts";
import {
  getEffectTarget,
  getTargetPool,
  resolveApproachTargetSpec,
} from "./skills/targetSpec.ts";
import { getAttackablePool, isWithinSkillRange } from "./skills/rangeUtils.ts";
import { isStationaryUnit } from "./data/entityTraits.ts";
import { applyFormationRowApproachSpacing } from "./battleLayout.ts";
import { FORMATION_DEPTH_STEP_PX } from "./battleLayout.ts";
import {
  compareFormationRowSlot,
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
  const range = resolveApproachRangePx(
    player,
    gameData,
    livingAllyCount(players),
  );
  const pool = getAttackablePool(spec, player, players, enemies, range);
  if (pool.length === 0) return null;
  return pickTargetFromPool(spec, player, pool);
}

/** 敵: 全生存プレイヤーからヘイト最大を chase（Threat ヒステリシス付き） */
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

/** 敵: 射程内プレイヤーからヘイト最大（Threat ヒステリシス付き） */
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

/**
 * 共有 clamp / formation safety layer。
 * 前衛が敵最前線を越えて過進軍しないための cap であり、ChaseTarget の正本ではない。
 */
function capFrontRowBeforeEnemyContact(
  player: CombatantState,
  players: CombatantState[],
  gameData: GameData,
  contact: number,
  approachX: number,
): number {
  if (player.formationRow === "back") return approachX;
  const maxForward = resolveApproachAttackBattleX(
    player,
    contact,
    gameData,
    livingAllyCount(players),
    contact,
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
  if (player.formationRow !== "front" || player.role !== "supporter") {
    return approachX;
  }
  let maxMeleeFrontX = Number.NEGATIVE_INFINITY;
  for (const ally of players) {
    if (!ally.isAlive) continue;
    if (isPlayerRearAssaultAccess(ally, { players, enemies })) continue;
    if (ally.formationRow !== "front") continue;
    if (!isMeleeFormationSlot(toMeleeFormationSlot(ally))) continue;
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

function resolveRearAssaultReturnApproachBattleX(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  contact: number,
): number | null {
  if (!isPlayerRearAssaultAccess(player, { players, enemies })) return null;
  const chase = resolvePlayerChaseTargetEnemy(
    player,
    players,
    enemies,
    gameData,
  );
  const anchorX = chase?.battleX ?? contact;
  return resolveAttackBattleX(
    player,
    anchorX,
    gameData,
    livingAllyCount(players),
  );
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

  if (player.formationRow !== "back") {
    approachX = capFrontRowBeforeEnemyContact(
      player,
      players,
      gameData,
      contact,
      approachX,
    );
    return approachX;
  }

  return approachX;
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

/** 全味方の接敵目標 battleX（列内スペーシング適用済み） */
export function resolveAllPlayerApproachBattleX(
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): Map<string, number> {
  const contact = getEnemyContactX(enemies);
  if (contact === null) {
    return new Map(players.map((p) => [p.id, p.battleX]));
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
    if (isPlayerRearAssaultAccess(player, battleContext)) {
      const rearReturn = resolveRearAssaultReturnApproachBattleX(
        player,
        players,
        enemies,
        gameData,
        contact,
      );
      if (rearReturn !== null && rearReturn < player.battleX) {
        base = rearReturn;
      } else {
        base = Math.min(
          base,
          resolveApproachAttackBattleX(
            player,
            contact,
            gameData,
            livingAllyCount(players),
            contact,
          ),
        );
      }
    }
    baseApproach.set(player.id, base);
  }

  const spacingInputs = players.map(toPlacementInput);

  const spaced = applyFormationRowApproachSpacing(baseApproach, spacingInputs);
  capApproachFormationOrder(spaced, baseApproach, players);
  applyFormationMarchFollow(
    spaced,
    players.filter(
      (player) =>
        player.isAlive &&
        !isPlayerRearAssaultAccess(player, battleContext),
    ),
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
): boolean {
  if (isStationaryUnit(unit)) return true;
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
