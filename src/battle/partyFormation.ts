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

const BACK_ROW_ROLE_ORDER: Record<Role, number> = {
  attacker: 0,
  supporter: 1,
  defender: 2,
};

/** デプロイ列ソート: 後列ほど左（奥）、前列ほど右（前） */
const FORMATION_ROW_DEPLOY_ORDER: Record<FormationRow, number> = {
  back: 0,
  front: 1,
};

/** 前列の近接最前帯: attacker/defender かつ rangePx < RANGED_ATTACK_MIN_PX */
export function isMeleeFormationSlot(unit: PartyFormationUnit): boolean {
  return (
    unit.rangePx < RANGED_ATTACK_MIN_PX &&
    (unit.role === 'attacker' || unit.role === 'defender')
  );
}

/**
 * 同一 formationRow 内の前後順（左=後方、右=前方）。
 * 接敵深度・PartyDeploy で共通。
 *
 * front: 近接 attacker/defender を最前帯、帯内は rangePx 降順 → id。
 * back: ロール順（attacker → supporter → defender）→ rangePx → id（従来どおり）。
 */
export function compareFormationRowSlot(
  row: FormationRow,
  a: PartyFormationUnit,
  b: PartyFormationUnit,
): number {
  if (row === 'back') {
    const roleDelta = BACK_ROW_ROLE_ORDER[a.role] - BACK_ROW_ROLE_ORDER[b.role];
    if (roleDelta !== 0) return roleDelta;
    if (a.rangePx !== b.rangePx) return b.rangePx - a.rangePx;
    return a.id.localeCompare(b.id);
  }

  const bandA = isMeleeFormationSlot(a) ? 1 : 0;
  const bandB = isMeleeFormationSlot(b) ? 1 : 0;
  const bandDelta = bandA - bandB;
  if (bandDelta !== 0) return bandDelta;
  if (a.rangePx !== b.rangePx) return b.rangePx - a.rangePx;
  return a.id.localeCompare(b.id);
}

export function comparePartyFormationSlot(
  a: PartyFormationUnit,
  b: PartyFormationUnit,
): number {
  const rowA = a.formationRow ?? 'front';
  const rowB = b.formationRow ?? 'front';
  const rowDelta =
    FORMATION_ROW_DEPLOY_ORDER[rowA] - FORMATION_ROW_DEPLOY_ORDER[rowB];
  if (rowDelta !== 0) return rowDelta;
  return compareFormationRowSlot(rowA, a, b);
}

/** 生存味方の理想 battleX（左端 20px、32px 間隔） */
export function computePartyFormationBattleX(
  units: PartyFormationUnit[],
): Map<string, number> {
  const sorted = [...units].sort(comparePartyFormationSlot);
  const positions = new Map<string, number>();
  sorted.forEach((unit, slot) => {
    positions.set(
      unit.id,
      PARTY_FORMATION_LEFT_ANCHOR + slot * PARTY_FORMATION_SLOT_SPACING,
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
