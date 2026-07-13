import type { DamageType, FormationRow, Role } from './types.ts';
import { RANGED_ATTACK_MIN_PX } from './types.ts';
import {
  BATTLE_ALLY_MARCH_VISIBLE_MIN_X,
  resolvePartyDeployTravelPx,
  PARTY_FORMATION_LEFT_ANCHOR,
  PARTY_FORMATION_SLOT_SPACING,
} from './battleConstants.ts';

export interface PartyFormationUnit {
  id: string;
  role: Role;
  rangePx: number;
  damageType: DamageType;
  formationRow?: FormationRow;
}

/** クラスマスタの formationRow 既定（classes-and-skills.md §配置） */
export function resolveClassFormationRow(
  role: Role,
  rangePx: number,
): FormationRow {
  if (role === 'defender') return 'front';
  return rangePx < RANGED_ATTACK_MIN_PX ? 'front' : 'back';
}

/** 前列の近接最前帯: attacker/defender かつ rangePx < RANGED_ATTACK_MIN_PX */
export function isMeleeFormationSlot(unit: PartyFormationUnit): boolean {
  return (
    unit.rangePx < RANGED_ATTACK_MIN_PX &&
    (unit.role === 'attacker' || unit.role === 'defender')
  );
}

/**
 * 隊形スロット比較（§3.3）: 射程昇順 → id 辞書順。
 * formationRow・近接帯は X 配置に使わない。
 */
export function comparePartyFormationSlot(
  a: PartyFormationUnit,
  b: PartyFormationUnit,
): number {
  if (a.rangePx !== b.rangePx) return a.rangePx - b.rangePx;
  return a.id.localeCompare(b.id);
}

/** @deprecated comparePartyFormationSlot と同一（overlap 互換） */
export function compareFormationRowSlot(
  _row: FormationRow,
  a: PartyFormationUnit,
  b: PartyFormationUnit,
): number {
  return comparePartyFormationSlot(a, b);
}

/** 生存味方の理想 battleX（左端 20px、32px 間隔、右＝前） */
export function computePartyFormationBattleX(
  units: PartyFormationUnit[],
): Map<string, number> {
  const sorted = [...units].sort(comparePartyFormationSlot);
  const positions = new Map<string, number>();
  const count = sorted.length;
  sorted.forEach((unit, index) => {
    const slotFromLeft = count - 1 - index;
    positions.set(
      unit.id,
      PARTY_FORMATION_LEFT_ANCHOR + slotFromLeft * PARTY_FORMATION_SLOT_SPACING,
    );
  });

  return positions;
}

/** PartyDeploy: 目標位置より左外へ一括オフセット（px） */
export function resolvePartyDeployOffscreenOffset(
  pxPerSec?: number,
): number {
  return resolvePartyDeployTravelPx(pxPerSec);
}

export function partyDeployOffScreenBattleX(targetBattleX: number): number {
  return targetBattleX - resolvePartyDeployTravelPx();
}

/** 全員が画面外左から進軍する距離（最前列 target が HUD 内に見えないよう確保） */
export function resolvePartyDeployMarchDistancePx(
  partyDeployTargets: ReadonlyMap<string, number>,
): number {
  let maxTarget = 0;
  for (const x of partyDeployTargets.values()) {
    if (x > maxTarget) maxTarget = x;
  }
  const minDistance = maxTarget - BATTLE_ALLY_MARCH_VISIBLE_MIN_X;
  return Math.max(resolvePartyDeployTravelPx(), minDistance);
}

/** 隊列の最大奥行き（遠隔敵 cap 用） */
export function partyFormationDepthPx(unitCount: number): number {
  return Math.max(0, unitCount - 1) * PARTY_FORMATION_SLOT_SPACING;
}
