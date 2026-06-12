import type { DamageType, FormationRow, Role } from './types.ts';
import {
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

/** デプロイ列ソート: 後列ほど左（奥）、前列ほど右（前） */
const FORMATION_ROW_DEPLOY_ORDER: Record<FormationRow, number> = {
  back: 0,
  front: 1,
};

function rowRoleOrder(row: FormationRow, role: Role): number {
  if (row === 'front') return FRONT_ROW_ROLE_ORDER[role];
  if (row === 'back') return BACK_ROW_ROLE_ORDER[role];
  return FRONT_ROW_ROLE_ORDER[role];
}

/**
 * 同一 formationRow 内の前後順（左=後方、右=前方）。
 * 接敵深度・PartyDeploy で共通。
 */
export function compareFormationRowSlot(
  row: FormationRow,
  a: PartyFormationUnit,
  b: PartyFormationUnit,
): number {
  if (row === 'front') {
    const roleDelta = rowRoleOrder(row, a.role) - rowRoleOrder(row, b.role);
    if (roleDelta !== 0) return roleDelta;
    if (a.rangePx !== b.rangePx) return b.rangePx - a.rangePx;
    return a.id.localeCompare(b.id);
  }
  if (a.rangePx !== b.rangePx) return b.rangePx - a.rangePx;
  const roleDelta = rowRoleOrder(row, a.role) - rowRoleOrder(row, b.role);
  if (roleDelta !== 0) return roleDelta;
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

/** 隊列の最大奥行き（遠隔敵 cap 用） */
export function partyFormationDepthPx(unitCount: number): number {
  return Math.max(0, unitCount - 1) * PARTY_FORMATION_SLOT_SPACING;
}
