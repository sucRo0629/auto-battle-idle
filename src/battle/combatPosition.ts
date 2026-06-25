import type {
  CombatantState,
  MoveSkillEffect,
  GameData,
  MoveSkillEffect,
  SkillCooldown,
} from './types.ts';
import { isMeleeRangePx } from './types.ts';
import {
  BATTLE_ENEMY_MARCH_VISIBLE_MAX_X,
  BATTLE_ENEMY_VISIBLE_MAX_X,
  resolvePartyDeployTravelPx,
  enemyRangedRearGap,
  SPRITE_GAP,
  resolveEnemyMarchEngageGap,
  resolveEnemySpawnBattleX,
} from './battleConstants.ts';
import {
  computePartyFormationBattleX,
  type PartyFormationUnit,
} from './partyFormation.ts';
import { resolveSkillRangePx } from './skills/rangeUtils.ts';
import { flattenSkillEffectsForRuntime } from './skills/effectConditions.ts';
import { getEffectTarget, targetSpecFaction } from './skills/targetSpec.ts';
import type { SkillEffectDef } from './types.ts';

export function resolveFormationRangePx(unit: CombatantState): number {
  return unit.traits.rangePx;
}

/** 接敵停止・隊形 clamp・melee 帯判定（traits 攻撃射程のみ。回復等のスキル range は含めない） */
export function resolveApproachFormationRangePx(unit: CombatantState): number {
  return unit.traits.rangePx;
}

export function isMeleeUnit(
  unit: CombatantState,
  gameData: GameData,
): boolean {
  return isMeleeRangePx(resolveMaxEffectiveRangePx(unit, gameData));
}

export function getBattleX(unit: CombatantState): number {
  return unit.battleX;
}

/** 最前線生存敵の battleX（プレイヤーに最も近い = min） */
export function getEnemyContactX(enemies: CombatantState[]): number | null {
  const living = enemies.filter((e) => e.isAlive);
  if (living.length === 0) return null;
  return Math.min(...living.map((e) => e.battleX));
}

/** 最前線生存近接敵の battleX */
export function getMeleeEnemyContactX(
  enemies: CombatantState[],
  gameData: GameData,
): number | null {
  const living = enemies.filter(
    (e) => e.isAlive && isMeleeUnit(e, gameData),
  );
  if (living.length === 0) return null;
  return Math.min(...living.map((e) => e.battleX));
}

function livingPlayersOnLeadingRow(
  players: CombatantState[],
): CombatantState[] {
  const living = players.filter((a) => a.isAlive);
  if (living.length === 0) return [];
  const maxX = Math.max(...living.map((a) => a.battleX));
  return living.filter((a) => a.battleX === maxX);
}

/** 最前線（射程順一列の右端 = max battleX） */
export function getPlayerContactX(players: CombatantState[]): number | null {
  const living = players.filter((a) => a.isAlive);
  if (living.length === 0) return null;
  return Math.max(...living.map((a) => a.battleX));
}

/** 味方 peer frontline から外れた rear assault 判定の余白（`FRONT_ROW_SAME_RANGE_MELEE_DEPTH_PX` と同値） */
export const PLAYER_OFF_FRONTLINE_PEER_MARGIN_PX = 3;

export type PlayerRearAssaultBattleContext = {
  players: CombatantState[];
  enemies: CombatantState[];
};

/**
 * プレイヤーが rear assault / 戦線外アクセス中か（正本）。
 *
 * - `number`: 敵 anchor 基準（`battleX > anchor`）。`enemyForwardFacingPool` 等。
 * - `PlayerRearAssaultBattleContext`: 接敵中の統一判定。Threat / FrontlineOwner /
 *   formation / overlap / march follow / approach clamp はこちらを使う。
 *
 * Battle context の判定:
 * 1. `accessState === "rearAssault"`
 * 2. 固定点: 生存味方集合から「peer 最前線 + margin より前方」のユニットを除外
 * 3. 単独生存時のみ `battleX > getEnemyContactX` fallback
 */
export function isPlayerRearAssaultAccess(
  player: CombatantState,
  enemyAnchorBattleX: number,
): boolean;
export function isPlayerRearAssaultAccess(
  player: CombatantState,
  context: PlayerRearAssaultBattleContext,
): boolean;
export function isPlayerRearAssaultAccess(
  player: CombatantState,
  contextOrAnchor: number | PlayerRearAssaultBattleContext,
): boolean {
  if (typeof contextOrAnchor === "number") {
    if (player.accessState === "rearAssault") return true;
    return getBattleX(player) > contextOrAnchor;
  }
  return isPlayerRearAssaultAccessInBattle(
    player,
    contextOrAnchor.players,
    contextOrAnchor.enemies,
  );
}

function resolveOnFrontlinePlayerIds(players: CombatantState[]): Set<string> {
  let onFrontline = new Set(
    players
      .filter(
        (player) => player.isAlive && player.accessState !== "rearAssault",
      )
      .map((player) => player.id),
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...onFrontline]) {
      const unit = players.find((player) => player.id === id);
      if (!unit) continue;
      const peerIds = [...onFrontline].filter((peerId) => peerId !== id);
      if (peerIds.length === 0) continue;
      const maxPeerX = Math.max(
        ...peerIds.map(
          (peerId) => players.find((player) => player.id === peerId)!.battleX,
        ),
      );
      if (unit.battleX > maxPeerX + PLAYER_OFF_FRONTLINE_PEER_MARGIN_PX) {
        onFrontline.delete(id);
        changed = true;
      }
    }
  }

  return onFrontline;
}

function isPlayerRearAssaultAccessInBattle(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
  ignoreAccessState = false,
): boolean {
  if (!player.isAlive) return false;
  if (!ignoreAccessState && player.accessState === "rearAssault") return true;

  const probePlayers = ignoreAccessState
    ? players.map((unit) =>
        unit.id === player.id
          ? { ...unit, accessState: undefined as CombatantState["accessState"] }
          : unit,
      )
    : players;
  const onFrontline = resolveOnFrontlinePlayerIds(probePlayers);
  if (!onFrontline.has(player.id)) return true;

  const living = players.filter((unit) => unit.isAlive);
  if (living.length === 1) {
    const contact = getEnemyContactX(enemies);
    if (contact !== null && player.battleX > contact) return true;
  }

  return false;
}

/** 敵対 anchor への toAnchor で anchorOffsetPx > 0（味方→敵の背後側） */
export function isHostileRearAssaultMove(
  actor: CombatantState,
  anchor: CombatantState,
  effect: MoveSkillEffect,
): boolean {
  if (actor.isEnemy) return false;
  if ((effect.moveMode ?? "engage") !== "toAnchor") return false;
  if (actor.isEnemy === anchor.isEnemy) return false;
  return (effect.anchorOffsetPx ?? 0) > 0;
}

export function setPlayerRearAssaultAccess(player: CombatantState): void {
  if (player.isEnemy) return;
  player.accessState = "rearAssault";
}

export function clearPlayerRearAssaultAccess(player: CombatantState): void {
  if (player.accessState === "rearAssault") {
    delete player.accessState;
  }
}

/** スキル完了 / 接近後: accessState を外しても戦線外でなければ解除 */
export function shouldClearRearAssaultAccess(
  player: CombatantState,
  players: CombatantState[],
  enemies: CombatantState[],
): boolean {
  if (player.accessState !== "rearAssault") return false;
  return !isPlayerRearAssaultAccessInBattle(
    player,
    players,
    enemies,
    true,
  );
}

/** 敵接触線より手前にいる生存味方（FrontlineOwner 候補プール） */
export function resolvePlayerFrontlineOwnerCandidates(
  players: CombatantState[],
  enemies: CombatantState[],
): CombatantState[] {
  const living = players.filter((player) => player.isAlive);
  if (living.length === 0) return [];
  const enemyContact = getEnemyContactX(enemies);
  if (enemyContact === null) return living;
  const battleContext: PlayerRearAssaultBattleContext = { players, enemies };
  return living.filter(
    (player) => !isPlayerRearAssaultAccess(player, battleContext),
  );
}

/** 現在の FrontlineOwner（接触線手前で最も前の味方。同率は複数可） */
export function resolvePlayerFrontlineOwners(
  players: CombatantState[],
  enemies: CombatantState[],
): CombatantState[] {
  const candidates = resolvePlayerFrontlineOwnerCandidates(players, enemies);
  if (candidates.length === 0) return [];
  const contactX = Math.max(...candidates.map((player) => player.battleX));
  return candidates.filter((player) => player.battleX === contactX);
}

/** 前線所有 contact。敵接触線を越えた一時侵入は前線として扱わない。 */
export function getPlayerFrontlineContactX(
  players: CombatantState[],
  enemies: CombatantState[],
): number | null {
  const owners = resolvePlayerFrontlineOwners(players, enemies);
  if (owners.length === 0) return null;
  return Math.max(...owners.map((player) => player.battleX));
}

function toPartyFormationUnits(
  players: CombatantState[],
): PartyFormationUnit[] {
  return players
    .filter((p) => p.isAlive)
    .map((p) => ({
      id: p.id,
      role: p.role,
      rangePx: resolveFormationRangePx(p),
      damageType: p.traits.damageType,
      formationRow: p.formationRow,
    }));
}

/** 接敵中: 前線 contact を基準にした理想 battleX（非接敵隊列と同じ相対オフセット） */
export function resolvePlayerFormationBattleX(
  player: CombatantState,
  players: CombatantState[],
  _gameData?: GameData,
): number | null {
  const living = players.filter((p) => p.isAlive);
  const contact = getPlayerContactX(living);
  if (contact === null) return null;

  const formation = computePartyFormationBattleX(
    toPartyFormationUnits(living),
  );
  const ideal = formation.get(player.id);
  if (ideal === undefined) return null;

  const rightmostIdeal = Math.max(...formation.values());
  return contact + (ideal - rightmostIdeal);
}


function pickLeadingRowContact(
  frontLine: CombatantState[],
): CombatantState {
  return frontLine.reduce((best, player) =>
    player.battleX > best.battleX ? player : best,
  );
}

export function leadingRowContactPlayer(
  players: CombatantState[],
): CombatantState | null {
  const frontLine = livingPlayersOnLeadingRow(players);
  if (frontLine.length === 0) return null;
  return pickLeadingRowContact(frontLine);
}

/** @deprecated leadingRowContactPlayer と同一（R1-fix: battleX 単一） */
export const leadingRowVisualContactPlayer = leadingRowContactPlayer;

/** @deprecated leadingRowContactPlayer */
export const leadingRowContactAlly = leadingRowContactPlayer;

export function getBattleContactPlayerVisual(
  players: CombatantState[],
  gameData: GameData,
): { battleX: number; rangePx: number } | null {
  const contact = leadingRowContactPlayer(players);
  if (!contact) return null;
  return {
    battleX: contact.battleX,
    rangePx: resolveMaxEffectiveRangePx(contact, gameData),
  };
}


/** R1-fix: snapshot 互換のため visualX を battleX に同期 */
export function syncFieldX(unit: CombatantState): void {
  unit.visualX = unit.battleX;
}

export function syncAllFieldX(units: CombatantState[]): void {
  for (const unit of units) {
    syncFieldX(unit);
  }
}

/** 敵死亡: 以降の battleX を固定 */
export function freezeEnemyCorpseBattleAnchor(
  enemy: CombatantState,
): void {
  if (!enemy.isEnemy || enemy.isAlive) return;
  if (enemy.corpseBattleAnchorX === undefined) {
    enemy.corpseBattleAnchorX = enemy.battleX;
  }
  enemy.battleX = enemy.corpseBattleAnchorX;
  enemy.visualX = enemy.battleX;
}

/** 死体 battleX をアンカーから再同期 */
export function syncDeadEnemyCorpseBattleX(
  enemies: CombatantState[],
): void {
  for (const enemy of enemies) {
    if (enemy.isAlive || enemy.corpseBattleAnchorX === undefined) continue;
    enemy.battleX = enemy.corpseBattleAnchorX;
    enemy.visualX = enemy.battleX;
  }
}

/** 接敵アンカー: 最前列最短射程分だけ敵接触点より後方（body gap 加算なし） */
export function getEngagedFrontEnemyBattleAnchor(
  players: CombatantState[],
  enemies: CombatantState[],
): number | null {
  const frontEnemyBattleX = getEnemyContactX(enemies);
  if (frontEnemyBattleX === null) return null;
  const living = players.filter((p) => p.isAlive);
  if (living.length === 0) return frontEnemyBattleX;

  const hasFront = living.some((p) => p.formationRow === 'front');
  const contactPlayers = hasFront
    ? living.filter((p) => p.formationRow === 'front')
    : living;
  const minFrontRange = Math.min(
    ...contactPlayers.map((p) => resolveApproachFormationRangePx(p)),
  );
  return frontEnemyBattleX - minFrontRange;
}

export function isEnemyVisibleOnScreen(enemy: CombatantState): boolean {
  return enemy.battleX <= BATTLE_ENEMY_VISIBLE_MAX_X;
}

export function isEnemyMarchVisible(enemy: CombatantState): boolean {
  return enemy.battleX <= BATTLE_ENEMY_MARCH_VISIBLE_MAX_X;
}

function getFrontEnemyForEngage(
  enemies: CombatantState[],
): CombatantState | null {
  const living = enemies.filter((e) => e.isAlive);
  if (living.length === 0) return null;
  return living.reduce((best, enemy) =>
    enemy.battleX < best.battleX ? enemy : best,
  );
}

export function resolveEngageLineX(
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): number | null {
  const frontEnemy = getFrontEnemyForEngage(enemies);
  if (frontEnemy === null) return null;
  return resolveEnemyMarchCapX(frontEnemy, players, gameData, enemies);
}

/** 近接前線より後方（battleX 大）に ranged を置く下限 */
export function resolveRangedRearBattleXCap(
  enemies: CombatantState[],
  gameData: GameData,
  minGap: number = enemyRangedRearGap(5),
): number | null {
  const meleeContact = getMeleeEnemyContactX(enemies, gameData);
  if (meleeContact === null) return null;
  return meleeContact + minGap;
}

function capRangedApproachBehindMelee(
  enemy: CombatantState,
  enemies: CombatantState[],
  gameData: GameData,
  approachX: number,
): number {
  if (isMeleeUnit(enemy, gameData)) return approachX;
  const rearCap = resolveRangedRearBattleXCap(enemies, gameData);
  if (rearCap === null) return approachX;
  return Math.max(approachX, rearCap);
}

export function resolveEnemyMarchCapX(
  enemy: CombatantState,
  players: CombatantState[],
  gameData: GameData,
  enemies: CombatantState[] = [],
): number | null {
  const playerContact = getPlayerContactX(players);
  const contactPlayer = leadingRowContactPlayer(players);
  if (playerContact === null || contactPlayer === null) return null;
  const gap = resolveEnemyMarchEngageGap(
    resolveMaxEffectiveRangePx(contactPlayer, gameData),
    resolveMaxEffectiveRangePx(enemy, gameData),
  );
  let cap = playerContact + gap;
  return capRangedApproachBehindMelee(enemy, enemies, gameData, cap);
}

export function shouldStartApproach(
  players: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): boolean {
  const frontEnemy = getFrontEnemyForEngage(enemies);
  if (frontEnemy === null) return false;
  const cap = resolveEnemyMarchCapX(frontEnemy, players, gameData, enemies);
  if (cap === null) return false;
  return frontEnemy.battleX <= cap;
}

export function resolveMaxEffectiveRangePx(
  unit: CombatantState,
  gameData: GameData,
): number {
  let max = -1;
  for (const cd of unit.cooldowns) {
    const skill = gameData.skillRegistry.actives[cd.skillId];
    if (!skill) continue;
    for (const effect of flattenSkillEffectsForRuntime(skill.effect)) {
      if (effect.type === 'move') continue;
      max = Math.max(max, resolveSkillRangePx(unit, effect));
    }
  }
  return max >= 0 ? max : unit.traits.rangePx;
}

/** 自動接近の停止距離: 通常攻撃射程（traits / basic の range）のみ */
export function resolveBasicAttackRangePx(
  unit: CombatantState,
  gameData: GameData,
  livingAllyCount?: number,
): number {
  const basicCd = unit.cooldowns.find((cd) => cd.slotKind === 'basic');
  const skillId = basicCd?.skillId;
  const skill = skillId ? gameData.skillRegistry.actives[skillId] : undefined;
  const effect = skill?.effect.find((e) => e.type !== 'move');
  if (effect && effect.type !== 'counter') {
    return resolveSkillRangePx(unit, effect, livingAllyCount);
  }
  return unit.traits.rangePx;
}

/** 装備中アクティブの最短射程（move 効果は除外） */
export function resolveMinEquippedActiveRangePx(
  unit: CombatantState,
  gameData: GameData,
): number | null {
  let min: number | null = null;
  for (const cd of unit.cooldowns) {
    if (cd.slotKind !== 'active') continue;
    const skill = gameData.skillRegistry.actives[cd.skillId];
    if (!skill) continue;
    for (const effect of flattenSkillEffectsForRuntime(skill.effect)) {
      if (effect.type === 'move') continue;
      const range = resolveSkillRangePx(unit, effect);
      min = min === null ? range : Math.min(min, range);
    }
  }
  return min;
}

/** 使用可能（CD 完了）な装備アクティブのみ対象 */
export function isEquippedActiveSkillReady(cd: SkillCooldown): boolean {
  return cd.slotKind === 'active' && cd.remaining <= 0;
}

function activeEffectNeedsEnemyProximity(
  unit: CombatantState,
  effect: SkillEffectDef,
): boolean {
  if (effect.type === 'move' || effect.type === 'conditionalEffect') return false;
  const faction = targetSpecFaction(getEffectTarget(effect), unit);
  return faction === 'enemy';
}

/** 使用可能な装備アクティブの最短射程（move 効果は除外） */
export function resolveMinReadyEquippedActiveRangePx(
  unit: CombatantState,
  gameData: GameData,
): number | null {
  let min: number | null = null;
  const effectRanges: Array<{ skillId: string; type: string; range: number }> =
    [];
  for (const cd of unit.cooldowns) {
    if (!isEquippedActiveSkillReady(cd)) continue;
    const skill = gameData.skillRegistry.actives[cd.skillId];
    if (!skill) continue;
    for (const effect of flattenSkillEffectsForRuntime(skill.effect)) {
      if (!activeEffectNeedsEnemyProximity(unit, effect)) continue;
      const range = resolveSkillRangePx(unit, effect);
      effectRanges.push({ skillId: cd.skillId, type: effect.type, range });
      min = min === null ? range : Math.min(min, range);
    }
  }

  return min;
}

/** 自動接近の停止距離: 使用可能な短い装備アクティブがあればその最短射程、なければ通常攻撃 */
export function resolveApproachRangePx(
  unit: CombatantState,
  gameData: GameData,
  livingAllyCount?: number,
): number {
  const basic = resolveBasicAttackRangePx(unit, gameData, livingAllyCount);
  const minReadyActive = resolveMinReadyEquippedActiveRangePx(unit, gameData);
  if (minReadyActive !== null && minReadyActive < basic) {
    return minReadyActive;
  }
  return basic;
}

export function resolveApproachAttackBattleX(
  unit: CombatantState,
  contactX: number,
  gameData: GameData,
  livingAllyCount?: number,
  enemyFrontContact?: number,
): number {
  const rangePx = resolveApproachRangePx(unit, gameData, livingAllyCount);
  const stopX = resolveAttackBattleX(unit, contactX, gameData, rangePx);
  if (!unit.isEnemy && stopX < unit.battleX) {
    if (
      enemyFrontContact !== undefined &&
      unit.battleX > enemyFrontContact
    ) {
      return stopX;
    }
    return unit.battleX;
  }
  return stopX;
}

export function resolveMoveBattleX(
  actor: CombatantState,
  anchor: CombatantState,
  effect: MoveSkillEffect,
  gameData: GameData,
): number {
  const mode = effect.moveMode ?? 'engage';

  if (mode === 'toAnchor') {
    const offset = effect.anchorOffsetPx ?? 0;
    const isHostileAnchor = actor.isEnemy !== anchor.isEnemy;
    const idealToX = isHostileAnchor
      ? actor.isEnemy
        ? anchor.battleX - offset
        : anchor.battleX + offset
      : anchor.battleX + offset;
    const toX = isHostileAnchor
      ? moveTowardX(
          actor.battleX,
          idealToX,
          resolveSkillRangePx(actor, effect) === 0
            ? Infinity // If melee, move without cap to achieve offset
            : resolveSkillRangePx(actor, effect) // Otherwise, cap by skill range
        )
      : idealToX;
    return toX;
  }

  if (actor.isEnemy) {
    return resolveAttackBattleX(actor, anchor.battleX, gameData);
  }

  return resolveAttackBattleX(actor, anchor.battleX, gameData);
}

/** プレイヤー: target.battleX − effectiveRangePx / 敵: target.battleX + effectiveRangePx */
export function resolveAttackBattleX(
  unit: CombatantState,
  contactX: number,
  gameData: GameData,
  rangePx?: number,
): number {
  const range = rangePx ?? resolveMaxEffectiveRangePx(unit, gameData);
  return unit.isEnemy ? contactX + range : contactX - range;
}

export function moveTowardX(
  current: number,
  target: number,
  maxDelta: number,
): number {
  if (maxDelta <= 0) return current;
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

/** 敵を左へ進軍（battleX 減少） */
export function marchEnemiesLeft(
  enemies: Array<{ id: string; battleX: number; isAlive: boolean }>,
  deltaX: number,
): Map<string, number> {
  const positions = new Map<string, number>();
  for (const enemy of enemies) {
    positions.set(
      enemy.id,
      enemy.isAlive ? enemy.battleX - deltaX : enemy.battleX,
    );
  }
  return positions;
}

/** @deprecated marchEnemiesLeft */
export const marchEnemiesRight = marchEnemiesLeft;

/** 右側から出現する敵: 重なりは右へ広げる */
export function separateByGap(
  units: Array<{ id: string; battleX: number; isAlive: boolean }>,
  minGap: number,
): Map<string, number> {
  const living = units
    .filter((unit) => unit.isAlive)
    .sort((a, b) => a.battleX - b.battleX);
  const positions = new Map<string, number>();

  for (const unit of living) {
    positions.set(unit.id, unit.battleX);
  }

  for (let i = 1; i < living.length; i++) {
    const prev = living[i - 1];
    const cur = living[i];
    const minX = (positions.get(prev.id) ?? prev.battleX) + minGap;
    const curX = positions.get(cur.id) ?? cur.battleX;
    if (curX < minX) {
      positions.set(cur.id, minX);
    }
  }

  return positions;
}

/** 接敵中: standoff 目標へ双方向補間（過進軍後の離脱も許可） */
export function updateUnitApproach(
  unit: CombatantState,
  targetBattleX: number,
  approachStep: number,
): void {
  if (!unit.isAlive) return;
  unit.battleX = moveTowardX(unit.battleX, targetBattleX, approachStep);
}

/** 接敵中: 敵の自動接近は左（battleX 減少）のみ — 遠隔の右逃げを防ぐ */
export function capEngagedEnemyApproachBattleX(
  enemy: CombatantState,
  approachX: number,
): number {
  return Math.min(approachX, enemy.battleX);
}

export function assignInitialPlayerBattleX(
  players: CombatantState[],
  _gameData?: GameData,
): void {
  const living = players.filter((a) => a.isAlive);
  const positions = computePartyFormationBattleX(
    toPartyFormationUnits(living),
  );
  for (const player of living) {
    const x = positions.get(player.id);
    if (x !== undefined) {
      player.battleX = x;
    }
  }
}

/** PartyDeploy 目標 battleX */
export function resolvePartyDeployTargets(
  players: CombatantState[],
): Map<string, number> {
  return computePartyFormationBattleX(toPartyFormationUnits(players));
}

/** PartyDeploy: 左外からの開始 battleX */
export function placePartyOffScreenForDeploy(
  players: CombatantState[],
  targets: Map<string, number>,
): void {
  for (const player of players) {
    if (!player.isAlive) continue;
    const target = targets.get(player.id);
    if (target === undefined) continue;
    player.battleX = target - resolvePartyDeployTravelPx();
    player.visualX = player.battleX;
  }
}

/** EnemyDeploy: spawn 解決位置（gap 適用後） */
export function resolveEnemyDeployTargets(
  enemies: Array<Pick<CombatantState, 'id' | 'spawnX' | 'isAlive'>>,
): Map<string, number> {
  const units = enemies.map((enemy) => ({
    id: enemy.id,
    battleX: resolveEnemySpawnBattleX(enemy.spawnX ?? 0),
    isAlive: enemy.isAlive,
  }));
  const separated = separateByGap(units, SPRITE_GAP);
  const positions = new Map<string, number>();
  for (const enemy of enemies) {
    const x = separated.get(enemy.id);
    if (x !== undefined) {
      positions.set(enemy.id, x);
    }
  }
  return positions;
}

/** EnemyDeploy: 目標より右外へ一括オフセット */
export function enemyDeployOffScreenBattleX(targetBattleX: number): number {
  return targetBattleX + resolvePartyDeployTravelPx();
}

/** EnemyDeploy: 右外からの開始 battleX */
export function placeEnemiesOffScreenForDeploy(
  enemies: CombatantState[],
  targets: Map<string, number>,
): void {
  for (const enemy of enemies) {
    if (!enemy.isAlive) continue;
    const target = targets.get(enemy.id);
    if (target === undefined) continue;
    enemy.battleX = enemyDeployOffScreenBattleX(target);
    enemy.visualX = enemy.battleX;
  }
}

