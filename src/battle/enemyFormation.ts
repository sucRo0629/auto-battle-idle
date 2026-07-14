import type { ResolvedEnemySpawnSpec } from './types.ts';
import {
  ENEMY_SPAWN_ORIGIN_X,
  PARTY_FORMATION_SLOT_SPACING,
  SPAWN_X_MAX,
  SPRITE_GAP,
} from './battleConstants.ts';
import { COMBAT_SAFE_RIGHT } from './combatSafeArea.ts';
import { separateByGap } from './combatPosition.ts';

export interface EnemyFormationUnit {
  /** spawnUnitKey 等の安定キー */
  key: string;
  rangePx: number;
  groupIndex: number;
  indexInGroup: number;
}

/** 敵 deploy 列ソート: 短射程ほど前（spawnX 小）、同射程は group 順 */
export function compareEnemyFormationSlot(
  a: EnemyFormationUnit,
  b: EnemyFormationUnit,
): number {
  if (a.rangePx !== b.rangePx) return a.rangePx - b.rangePx;
  if (a.groupIndex !== b.groupIndex) return a.groupIndex - b.groupIndex;
  return a.indexInGroup - b.indexInGroup;
}

/**
 * 味方隊形（左端アンカー・右＝前）の鏡像: 右端 `COMBAT_SAFE_RIGHT` アンカー・左＝前。
 * 射程順に slot 間隔を付けた理想 battleX を割当し、SPRITE_GAP で右へ広げた後、
 * 右端超過分を左へ戻してから spawnX に変換する。
 * 各 spawnX は [0, SPAWN_X_MAX] に clamp（奥行きが帯を超えると前側が ORIGIN へ圧縮され得る）。
 */
export function computeEnemyFormationSpawnX(
  units: EnemyFormationUnit[],
): Map<string, number> {
  const sorted = [...units].sort(compareEnemyFormationSlot);
  const count = sorted.length;
  const battleUnits = sorted.map((unit, slot) => ({
    id: unit.key,
    // slot 0（短射程＝前）= 右端から (count-1) スロット左、最後列 = COMBAT_SAFE_RIGHT
    battleX:
      COMBAT_SAFE_RIGHT - (count - 1 - slot) * PARTY_FORMATION_SLOT_SPACING,
    isAlive: true,
  }));
  const separated = separateByGap(battleUnits, SPRITE_GAP);

  let maxBattleX = COMBAT_SAFE_RIGHT;
  for (const battleX of separated.values()) {
    if (battleX > maxBattleX) maxBattleX = battleX;
  }
  const overflowRight = maxBattleX - COMBAT_SAFE_RIGHT;

  const positions = new Map<string, number>();
  for (const unit of sorted) {
    const battleX =
      (separated.get(unit.key) ?? COMBAT_SAFE_RIGHT) - overflowRight;
    const spawnX = Math.max(
      0,
      Math.min(Math.round(battleX - ENEMY_SPAWN_ORIGIN_X), SPAWN_X_MAX),
    );
    positions.set(unit.key, spawnX);
  }

  return positions;
}

/** enemyGroups 展開スペックから class traits.rangePx で spawnX を一括割当 */
export function resolveEnemyGroupSpawnX(
  specs: ResolvedEnemySpawnSpec[],
  rangePxByClassId: (classId: string) => number,
): Map<string, number> {
  const units: EnemyFormationUnit[] = specs.map((spec) => ({
    key: spec.spawnUnitKey,
    rangePx: rangePxByClassId(spec.classId),
    groupIndex: spec.groupIndex,
    indexInGroup: spec.indexInGroup,
  }));
  return computeEnemyFormationSpawnX(units);
}
