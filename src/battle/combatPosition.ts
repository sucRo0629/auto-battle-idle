import type {
  CombatantState,
  FormationRow,
  GameData,
  MoveSkillEffect,
  Role,
} from './types.ts';
import {
  BATTLE_ENEMY_MARCH_VISIBLE_MIN_X,
  BATTLE_ENEMY_VISIBLE_MIN_X,
} from './types.ts';
import { resolveSkillRangePx } from './skills/rangeUtils.ts';
import {
  ALLY_ROW_SPACING,
  ROW_X,
  resolveEnemyMarchEngageGap,
} from '../render/formationLayout.ts';

/** 非戦闘時: 背景スクロール・敵進軍速度（px/秒） */
export const SCROLL_SPEED = 160;
/** 接敵後: 攻撃可能位置への接近速度（px/秒） */
export const APPROACH_SPEED = 200;

const ROW_ORDER: FormationRow[] = ['front', 'middle', 'back'];

const FRONT_ROW_ROLE_ORDER: Record<Role, number> = {
  defender: 0,
  attacker: 1,
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

export function getBattleX(unit: CombatantState): number {
  return unit.battleX;
}

/** 最前線生存敵の battleX（味方から最も近い敵） */
export function getEnemyContactX(enemies: CombatantState[]): number | null {
  const living = enemies.filter((e) => e.isAlive);
  if (living.length === 0) return null;
  return Math.max(...living.map((e) => e.battleX));
}

function livingAlliesOnLeadingRow(
  allies: CombatantState[],
): CombatantState[] {
  const living = allies.filter((a) => a.isAlive);
  if (living.length === 0) return [];
  for (const row of ROW_ORDER) {
    const rowUnits = living.filter((a) => a.formationRow === row);
    if (rowUnits.length > 0) return rowUnits;
  }
  return [];
}

/** 最前線生存列のうち最も敵側（min battleX）— 後列の射程調整は含めない */
export function getAllyContactX(allies: CombatantState[]): number | null {
  const frontLine = livingAlliesOnLeadingRow(allies);
  if (frontLine.length === 0) return null;
  return Math.min(...frontLine.map((a) => a.battleX));
}

export function leadingRowContactAlly(
  allies: CombatantState[],
): CombatantState | null {
  const frontLine = livingAlliesOnLeadingRow(allies);
  if (frontLine.length === 0) return null;
  return frontLine.reduce((best, ally) =>
    ally.battleX < best.battleX ? ally : best,
  );
}

/** 接敵ロジック（最前線列の min battleX）と同じ味方の visual 基準点 */
export function getBattleContactAllyVisual(
  allies: CombatantState[],
  gameData: GameData,
): { visualX: number; rangePx: number } | null {
  const contact = leadingRowContactAlly(allies);
  if (!contact) return null;
  return {
    visualX: contact.visualX,
    rangePx: resolveMaxEffectiveRangePx(contact, gameData),
  };
}

/** 最前線味方の visualX − battleX（接敵中の battle→visual 写像オフセット） */
export function getBattleVisualOffset(allies: CombatantState[]): number | null {
  const contact = leadingRowContactAlly(allies);
  if (!contact) return null;
  return contact.visualX - contact.battleX;
}

/** 味方接触オフセットを保ったまま、最前線敵 battleX を visual 座標へ写像 */
export function getEngagedFrontEnemyVisualAnchor(
  allies: CombatantState[],
  enemies: CombatantState[],
  battleVisualOffset?: number | null,
): number | null {
  const frontEnemyBattleX = getEnemyContactX(enemies);
  const offset = battleVisualOffset ?? getBattleVisualOffset(allies);
  if (frontEnemyBattleX === null || offset === null) return null;
  return frontEnemyBattleX + offset;
}

/** 敵 visualX を battleX ベースの接敵位置へ写像（最前線味方の visual−battle オフセット） */
export function syncEnemyVisualToBattleContact(
  allies: CombatantState[],
  enemies: CombatantState[],
): void {
  const contact = leadingRowContactAlly(allies);
  if (!contact) return;
  const offset = contact.visualX - contact.battleX;
  for (const enemy of enemies) {
    if (!enemy.isAlive) continue;
    enemy.visualX = enemy.battleX + offset;
  }
}

export function isEnemyVisibleOnScreen(enemy: CombatantState): boolean {
  return enemy.battleX >= BATTLE_ENEMY_VISIBLE_MIN_X;
}

export function isEnemyMarchVisible(enemy: CombatantState): boolean {
  return enemy.battleX >= BATTLE_ENEMY_MARCH_VISIBLE_MIN_X;
}

function getFrontEnemyForEngage(
  enemies: CombatantState[],
): CombatantState | null {
  const living = enemies.filter((e) => e.isAlive);
  if (living.length === 0) return null;
  return living.reduce((best, enemy) =>
    enemy.battleX > best.battleX ? enemy : best,
  );
}

/** 最前線敵が standoff 距離まで近づいた battleX（ここで接敵開始） */
export function resolveEngageLineX(
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): number | null {
  const frontEnemy = getFrontEnemyForEngage(enemies);
  if (frontEnemy === null) return null;
  return resolveEnemyMarchCapX(frontEnemy, allies, gameData);
}

/** 敵1体の進軍上限 battleX（味方接触点 − その敵の射程） */
export function resolveEnemyMarchCapX(
  enemy: CombatantState,
  allies: CombatantState[],
  gameData: GameData,
): number | null {
  const allyContact = getAllyContactX(allies);
  const contactAlly = leadingRowContactAlly(allies);
  if (allyContact === null || contactAlly === null) return null;
  const gap = resolveEnemyMarchEngageGap(
    resolveMaxEffectiveRangePx(contactAlly, gameData),
    resolveMaxEffectiveRangePx(enemy, gameData),
  );
  return allyContact - gap;
}

export function shouldStartApproach(
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): boolean {
  const frontEnemy = getFrontEnemyForEngage(enemies);
  if (frontEnemy === null) return false;
  const cap = resolveEnemyMarchCapX(frontEnemy, allies, gameData);
  if (cap === null) return false;
  return frontEnemy.battleX >= cap;
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

/** move 効果の目標 battleX（anchor 基準） */
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
      return anchor.battleX + (effect.behindOffsetPx ?? 0);
    }
    return anchor.battleX - range;
  }

  if (mode === 'behindTarget') {
    return anchor.battleX - (effect.behindOffsetPx ?? 0);
  }
  return anchor.battleX + range;
}

/** 味方: contactX + range / 敵: contactX - range */
export function resolveAttackBattleX(
  unit: CombatantState,
  contactX: number,
  gameData: GameData,
): number {
  const range = resolveMaxEffectiveRangePx(unit, gameData);
  return unit.isEnemy ? contactX - range : contactX + range;
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

export function marchEnemiesRight(
  enemies: Array<{ id: string; battleX: number; isAlive: boolean }>,
  deltaX: number,
): Map<string, number> {
  const positions = new Map<string, number>();
  for (const enemy of enemies) {
    positions.set(
      enemy.id,
      enemy.isAlive ? enemy.battleX + deltaX : enemy.battleX,
    );
  }
  return positions;
}

/** 左から出現する敵: 重なりは左へ広げ、右端が画面外に残るようにする */
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

  for (let i = living.length - 2; i >= 0; i--) {
    const right = living[i + 1];
    const cur = living[i];
    const maxX = (positions.get(right.id) ?? right.battleX) - minGap;
    const curX = positions.get(cur.id) ?? cur.battleX;
    if (curX > maxX) {
      positions.set(cur.id, maxX);
    }
  }

  return positions;
}

/** 接敵中: 味方は左（敵方向）へ、敵は右（味方方向）へ目標 battleX へ接近 */
export function updateUnitApproach(
  unit: CombatantState,
  targetBattleX: number,
  approachStep: number,
): void {
  if (!unit.isAlive) return;
  if (unit.isEnemy) {
    unit.battleX = moveTowardX(unit.battleX, targetBattleX, approachStep);
  } else if (targetBattleX < unit.battleX) {
    unit.battleX = moveTowardX(unit.battleX, targetBattleX, approachStep);
  }
}

/** 非接敵時の味方 battleX（隊列ベースの初期配置） */
export function assignInitialAllyBattleX(allies: CombatantState[]): void {
  const living = allies.filter((a) => a.isAlive);
  const byRow = new Map<FormationRow, CombatantState[]>();
  for (const row of ROW_ORDER) {
    byRow.set(row, []);
  }
  for (const ally of living) {
    byRow.get(ally.formationRow)!.push(ally);
  }
  for (const row of ROW_ORDER) {
    byRow
      .get(row)!
      .sort((a, b) => rowRoleOrder(row, a.role) - rowRoleOrder(row, b.role));
  }

  const rowSlot = new Map<FormationRow, number>();
  for (const row of ROW_ORDER) {
    for (const ally of byRow.get(row)!) {
      const slot = rowSlot.get(row) ?? 0;
      rowSlot.set(row, slot + 1);
      ally.battleX = ROW_X[row] + slot * ALLY_ROW_SPACING;
    }
  }
}
