import type { DamageType, Role } from './types.ts';
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
}

/** 射程降順（長い＝左）。同射程は物理アタッカーを左 */
export function comparePartyFormationSlot(
  a: PartyFormationUnit,
  b: PartyFormationUnit,
): number {
  if (a.rangePx !== b.rangePx) return b.rangePx - a.rangePx;
  const aPhysAtk =
    a.damageType === 'physical' && a.role === 'attacker';
  const bPhysAtk =
    b.damageType === 'physical' && b.role === 'attacker';
  if (aPhysAtk !== bPhysAtk) return aPhysAtk ? -1 : 1;
  return a.id.localeCompare(b.id);
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
