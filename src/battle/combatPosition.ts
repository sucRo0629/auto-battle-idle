import type {
  CombatantState,
  FormationRow,
  GameData,
  MoveSkillEffect,
  Role,
} from './types.ts';
import {
  BATTLE_ENEMY_MARCH_VISIBLE_MAX_X,
  BATTLE_ENEMY_VISIBLE_MAX_X,
  engagedMinBodyGap,
  enemyRangedRearGap,
  PLAYER_ROW_SPACING,
  ROW_X,
  SPRITE_GAP,
  resolveEnemyMarchEngageGap,
  SCROLL_SPEED,
  APPROACH_SPEED,
} from './battleConstants.ts';
import { resolveSkillRangePx } from './skills/rangeUtils.ts';

export { SCROLL_SPEED, APPROACH_SPEED };

const ROW_ORDER: FormationRow[] = ['front', 'middle', 'back'];

/** Front row: lower order = left/rear; defender is most forward (right). */
const FRONT_ROW_ROLE_ORDER: Record<Role, number> = {
  attacker: 0,
  defender: 1,
  supporter: 2,
};

const BACK_ROW_ROLE_ORDER: Record<Role, number> = {
  supporter: 0,
  attacker: 1,
  defender: 2,
};

function rowRoleOrder(row: FormationRow, role: Role): number {
  if (row === 'front') return FRONT_ROW_ROLE_ORDER[role];
  if (row === 'back') return BACK_ROW_ROLE_ORDER[role];
  return FRONT_ROW_ROLE_ORDER[role];
}

/** 隊形スロット整列用（traits.rangePx。スキル最大射程とは別） */
export function resolveFormationRangePx(unit: CombatantState): number {
  return unit.traits.rangePx;
}

function compareFormationBattleSlot(
  row: FormationRow,
  a: CombatantState,
  b: CombatantState,
  _gameData?: GameData,
): number {
  const rangeA = resolveFormationRangePx(a);
  const rangeB = resolveFormationRangePx(b);
  if (rangeA !== rangeB) return rangeB - rangeA;
  const roleDelta = rowRoleOrder(row, a.role) - rowRoleOrder(row, b.role);
  if (roleDelta !== 0) return roleDelta;
  return a.id.localeCompare(b.id);
}

export function isMeleeUnit(
  unit: CombatantState,
  gameData: GameData,
): boolean {
  return resolveMaxEffectiveRangePx(unit, gameData) <= 0;
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
    (e) => e.isAlive && resolveMaxEffectiveRangePx(e, gameData) <= 0,
  );
  if (living.length === 0) return null;
  return Math.min(...living.map((e) => e.battleX));
}

function livingPlayersOnLeadingRow(
  players: CombatantState[],
): CombatantState[] {
  const living = players.filter((a) => a.isAlive);
  if (living.length === 0) return [];
  for (const row of ROW_ORDER) {
    const rowUnits = living.filter((a) => a.formationRow === row);
    if (rowUnits.length > 0) return rowUnits;
  }
  return [];
}

/** 最前線生存列のうち最も前方（max battleX） */
export function getPlayerContactX(players: CombatantState[]): number | null {
  const frontLine = livingPlayersOnLeadingRow(players);
  if (frontLine.length === 0) return null;
  return Math.max(...frontLine.map((a) => a.battleX));
}

/** 接敵中: 前線 contact を基準にした理想 battleX（非接敵の ROW_X 隊形と同じ相対位置） */
export function resolvePlayerFormationBattleX(
  player: CombatantState,
  players: CombatantState[],
  gameData?: GameData,
): number | null {
  const living = players.filter((p) => p.isAlive);
  const contact = getPlayerContactX(living);
  if (contact === null) return null;

  const row = player.formationRow;
  const rowUnits = living.filter((p) => p.formationRow === row);
  if (gameData) {
    rowUnits.sort((a, b) =>
      compareFormationBattleSlot(row, a, b, gameData),
    );
  } else {
    rowUnits.sort(
      (a, b) => rowRoleOrder(row, a.role) - rowRoleOrder(row, b.role),
    );
  }
  const slot = rowUnits.findIndex((p) => p.id === player.id);
  if (slot < 0) return null;

  const rowBase = ROW_X[row] - ROW_X.front;
  return contact + rowBase + slot * PLAYER_ROW_SPACING;
}

/** @deprecated getPlayerContactX */
export const getAllyContactX = getPlayerContactX;

export function leadingRowContactPlayer(
  players: CombatantState[],
): CombatantState | null {
  const frontLine = livingPlayersOnLeadingRow(players);
  if (frontLine.length === 0) return null;
  return frontLine.reduce((best, player) =>
    player.battleX > best.battleX ? player : best,
  );
}

/** @deprecated leadingRowContactPlayer */
export const leadingRowContactAlly = leadingRowContactPlayer;

export function getBattleContactPlayerVisual(
  players: CombatantState[],
  gameData: GameData,
): { visualX: number; rangePx: number } | null {
  const contact = leadingRowContactPlayer(players);
  if (!contact) return null;
  return {
    visualX: contact.visualX,
    rangePx: resolveMaxEffectiveRangePx(contact, gameData),
  };
}

/** @deprecated getBattleContactPlayerVisual */
export const getBattleContactAllyVisual = getBattleContactPlayerVisual;

export function getBattleVisualOffset(players: CombatantState[]): number | null {
  const contact = leadingRowContactPlayer(players);
  if (!contact) return null;
  return contact.visualX - contact.battleX;
}

export function getEngagedFrontEnemyVisualAnchor(
  players: CombatantState[],
  enemies: CombatantState[],
  battleVisualOffset?: number | null,
): number | null {
  const frontEnemyBattleX = getEnemyContactX(enemies);
  const offset = battleVisualOffset ?? getBattleVisualOffset(players);
  if (frontEnemyBattleX === null || offset === null) return null;
  return frontEnemyBattleX + offset;
}

export function syncEnemyVisualToBattleContact(
  players: CombatantState[],
  enemies: CombatantState[],
): void {
  const contact = leadingRowContactPlayer(players);
  if (!contact) return;
  const offset = contact.visualX - contact.battleX;
  for (const enemy of enemies) {
    if (!enemy.isAlive) continue;
    enemy.visualX = enemy.battleX + offset;
  }
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
  minGap: number = enemyRangedRearGap(),
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
  if (resolveMaxEffectiveRangePx(enemy, gameData) <= 0) return approachX;
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
    for (const effect of skill.effect) {
      if (effect.type === 'move') continue;
      max = Math.max(max, resolveSkillRangePx(unit, effect));
    }
  }
  return max >= 0 ? max : unit.traits.rangePx;
}

export function resolveMoveBattleX(
  actor: CombatantState,
  anchor: CombatantState,
  effect: MoveSkillEffect,
  gameData: GameData,
): number {
  const mode = effect.moveMode ?? 'engage';
  const range = resolveMaxEffectiveRangePx(actor, gameData);

  if (mode === 'toAnchor') {
    return anchor.battleX;
  }

  if (actor.isEnemy) {
    if (mode === 'behindTarget') {
      return anchor.battleX - (effect.behindOffsetPx ?? 0);
    }
    return anchor.battleX + range;
  }

  if (mode === 'behindTarget') {
    return anchor.battleX + (effect.behindOffsetPx ?? 0);
  }
  return anchor.battleX - range;
}

/** プレイヤー: contact − range / 敵: contact + range（近接は standoff 幅を挟む） */
export function resolveAttackBattleX(
  unit: CombatantState,
  contactX: number,
  gameData: GameData,
): number {
  const range = resolveMaxEffectiveRangePx(unit, gameData);
  if (range <= 0) {
    const standoff = engagedMinBodyGap();
    return unit.isEnemy ? contactX + standoff : contactX - standoff;
  }
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

export function assignInitialPlayerBattleX(
  players: CombatantState[],
  gameData?: GameData,
): void {
  const living = players.filter((a) => a.isAlive);
  const byRow = new Map<FormationRow, CombatantState[]>();
  for (const row of ROW_ORDER) {
    byRow.set(row, []);
  }
  for (const player of living) {
    byRow.get(player.formationRow)!.push(player);
  }
  for (const row of ROW_ORDER) {
    const rowPlayers = byRow.get(row)!;
    rowPlayers.sort((a, b) =>
      compareFormationBattleSlot(row, a, b, gameData),
    );
  }

  const rowSlot = new Map<FormationRow, number>();
  for (const row of ROW_ORDER) {
    for (const player of byRow.get(row)!) {
      const slot = rowSlot.get(row) ?? 0;
      rowSlot.set(row, slot + 1);
      player.battleX = ROW_X[row] + slot * PLAYER_ROW_SPACING;
    }
  }
}

/** @deprecated assignInitialPlayerBattleX */
export const assignInitialAllyBattleX = assignInitialPlayerBattleX;
