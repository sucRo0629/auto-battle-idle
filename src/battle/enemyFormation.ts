import type { ResolvedEnemySpawnSpec } from './types.ts';
import {
  ENEMY_SPAWN_ORIGIN_X,
  PARTY_FORMATION_SLOT_SPACING,
  SPAWN_X_MAX,
  SPRITE_GAP,
} from './battleConstants.ts';
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
 * 射程順に slot 間隔を付けた理想 spawnX を割当し、SPRITE_GAP で右へ広げた後 spawnX に戻す。
 * 各 spawnX は [0, SPAWN_X_MAX] に clamp（5 体以上で cap 超過時は奥側が圧縮され得る）。
 */
export function computeEnemyFormationSpawnX(
  units: EnemyFormationUnit[],
): Map<string, number> {
  const sorted = [...units].sort(compareEnemyFormationSlot);
  const battleUnits = sorted.map((unit, slot) => ({
    id: unit.key,
    battleX: ENEMY_SPAWN_ORIGIN_X + slot * PARTY_FORMATION_SLOT_SPACING,
    isAlive: true,
  }));
  const separated = separateByGap(battleUnits, SPRITE_GAP);
  const positions = new Map<string, number>();

  for (const unit of sorted) {
    const battleX = separated.get(unit.key) ?? ENEMY_SPAWN_ORIGIN_X;
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
