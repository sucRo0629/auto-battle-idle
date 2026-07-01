import { describe, expect, it } from 'vitest';
import {
  COMBAT_CAMERA_CENTER_X,
  PARTY_FORMATION_LEFT_ANCHOR,
  PARTY_FORMATION_SLOT_SPACING,
  SPAWN_X_MAX,
  resolveEnemySpawnBattleX,
} from './battleConstants.ts';
import {
  comparePartyFormationSlot,
  computePartyFormationBattleX,
  partyDeployOffScreenBattleX,
  resolvePartyDeployOffscreenOffset,
} from './partyFormation.ts';

describe('partyFormation', () => {
  it('sorts front row melee band by range then id (not role)', () => {
    const units = [
      { id: 'b', role: 'attacker' as const, rangePx: 50, damageType: 'magic' as const, formationRow: 'front' as const },
      { id: 'a', role: 'attacker' as const, rangePx: 50, damageType: 'physical' as const, formationRow: 'front' as const },
      { id: 'c', role: 'defender' as const, rangePx: 0, damageType: 'physical' as const, formationRow: 'front' as const },
    ];
    const sorted = [...units].sort(comparePartyFormationSlot);
    expect(sorted.map((u) => u.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders shorter-range melee forward of longer-range on deploy', () => {
    const units = [
      { id: 'df_duelist', role: 'defender' as const, rangePx: 10, damageType: 'physical' as const, formationRow: 'front' as const },
      { id: 'at_assassin', role: 'attacker' as const, rangePx: 5, damageType: 'physical' as const, formationRow: 'front' as const },
    ];
    const positions = computePartyFormationBattleX(units);
    expect(positions.get('df_duelist')!).toBeLessThan(positions.get('at_assassin')!);
    expect(positions.get('at_assassin')! - positions.get('df_duelist')!).toBe(
      PARTY_FORMATION_SLOT_SPACING,
    );
  });

  it('orders swordsman left of iron guard by range (deploy slots)', () => {
    const units = [
      { id: 'df_guardian', role: 'defender' as const, rangePx: 5, damageType: 'physical' as const, formationRow: 'front' as const },
      { id: 'at_swordsman', role: 'attacker' as const, rangePx: 8, damageType: 'physical' as const, formationRow: 'front' as const },
    ];
    const positions = computePartyFormationBattleX(units);
    expect(positions.get('at_swordsman')!).toBeLessThan(positions.get('df_guardian')!);
    expect(positions.get('df_guardian')! - positions.get('at_swordsman')!).toBe(
      PARTY_FORMATION_SLOT_SPACING,
    );
  });

  it('orders front row melee trio swordsman / iron guard / duelist by range', () => {
    const units = [
      { id: 'at_swordsman', role: 'attacker' as const, rangePx: 8, damageType: 'physical' as const, formationRow: 'front' as const },
      { id: 'df_guardian', role: 'defender' as const, rangePx: 5, damageType: 'physical' as const, formationRow: 'front' as const },
      { id: 'at_assassin', role: 'attacker' as const, rangePx: 0, damageType: 'physical' as const, formationRow: 'front' as const },
    ];
    const sorted = [...units].sort(comparePartyFormationSlot);
    expect(sorted.map((u) => u.id)).toEqual(['at_swordsman', 'df_guardian', 'at_assassin']);
  });

  it('same-range melee front row uses id only (role does not invert depth)', () => {
    const units = [
      { id: 'z_defender', role: 'defender' as const, rangePx: 5, damageType: 'physical' as const, formationRow: 'front' as const },
      { id: 'a_attacker', role: 'attacker' as const, rangePx: 5, damageType: 'physical' as const, formationRow: 'front' as const },
    ];
    const sorted = [...units].sort(comparePartyFormationSlot);
    expect(sorted.map((u) => u.id)).toEqual(['a_attacker', 'z_defender']);
  });

  it('sorts back row by role before range (attacker left of supporter)', () => {
    const units = [
      { id: 'sp_cleric', role: 'supporter' as const, rangePx: 128, damageType: 'magic' as const, formationRow: 'back' as const },
      { id: 'at_ranger', role: 'attacker' as const, rangePx: 50, damageType: 'physical' as const, formationRow: 'back' as const },
    ];
    const sorted = [...units].sort(comparePartyFormationSlot);
    expect(sorted.map((u) => u.id)).toEqual(['at_ranger', 'sp_cleric']);
  });

  it('assigns 5-slot party with 32px spacing from anchor 20', () => {
    const units = Array.from({ length: 5 }, (_, i) => ({
      id: `u${i}`,
      role: 'attacker' as const,
      rangePx: 100 - i * 10,
      damageType: 'physical' as const,
    }));
    const positions = computePartyFormationBattleX(units);
    expect(positions.get('u0')).toBe(PARTY_FORMATION_LEFT_ANCHOR);
    expect(positions.get('u4')).toBe(
      PARTY_FORMATION_LEFT_ANCHOR + 4 * PARTY_FORMATION_SLOT_SPACING,
    );
  });

  it('resolveEnemySpawnBattleX maps offset to center-relative battleX', () => {
    expect(resolveEnemySpawnBattleX(0)).toBe(COMBAT_CAMERA_CENTER_X);
    expect(resolveEnemySpawnBattleX(SPAWN_X_MAX)).toBe(
      COMBAT_CAMERA_CENTER_X + SPAWN_X_MAX,
    );
    expect(resolveEnemySpawnBattleX(999)).toBe(
      COMBAT_CAMERA_CENTER_X + SPAWN_X_MAX,
    );
    expect(resolveEnemySpawnBattleX(-10)).toBe(COMBAT_CAMERA_CENTER_X);
  });

  it('partyDeployOffScreenBattleX shifts left by speed-scaled deploy travel', () => {
    expect(partyDeployOffScreenBattleX(52)).toBe(
      52 - resolvePartyDeployOffscreenOffset(),
    );
  });
});
