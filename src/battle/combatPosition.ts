import type {
  CombatantState,
  FormationRow,
  GameData,
  MoveSkillEffect,
  Role,
} from './types.ts';
import {
  BATTLE_ENEMY_VISIBLE_MIN_X,
  DEFAULT_MELEE_ATTACK_RANGE_PX,
  DEFAULT_RANGED_RANGE_PX,
} from './types.ts';
import { resolveSkillRangePx } from './skills/rangeUtils.ts';
import {
  ALLY_ROW_SPACING,
  ROW_X,
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

/** 最前線生存味方の battleX（敵から最も近い味方） */
export function getAllyContactX(allies: CombatantState[]): number | null {
  const living = allies.filter((a) => a.isAlive);
  if (living.length === 0) return null;
  return Math.min(...living.map((a) => a.battleX));
}

export function isEnemyVisibleOnScreen(enemy: CombatantState): boolean {
  return enemy.battleX >= BATTLE_ENEMY_VISIBLE_MIN_X;
}

export function shouldStartApproach(enemies: CombatantState[]): boolean {
  return enemies.some((e) => e.isAlive && isEnemyVisibleOnScreen(e));
}

export function resolveMaxEffectiveRangePx(
  unit: CombatantState,
  gameData: GameData,
): number {
  const traitDefault =
    unit.traits.rangePx ??
    (unit.traits.attackRange === 'melee'
      ? DEFAULT_MELEE_ATTACK_RANGE_PX
      : DEFAULT_RANGED_RANGE_PX);
  let max = traitDefault;
  for (const cd of unit.cooldowns) {
    const skill = gameData.skillRegistry.actives[cd.skillId];
    if (!skill) continue;
    for (const effect of skill.effect) {
      max = Math.max(max, resolveSkillRangePx(unit, effect));
    }
  }
  return max;
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

/** 接敵中: 味方は左（敵方向）へ、敵は右（味方方向）へ前進のみ */
export function updateUnitApproach(
  unit: CombatantState,
  targetBattleX: number,
  approachStep: number,
): void {
  if (!unit.isAlive) return;
  if (unit.isEnemy) {
    if (targetBattleX > unit.battleX) {
      unit.battleX = moveTowardX(unit.battleX, targetBattleX, approachStep);
    }
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
