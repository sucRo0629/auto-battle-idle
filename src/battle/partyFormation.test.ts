import { describe, expect, it } from 'vitest';
import {
  ENEMY_SPAWN_ORIGIN_X,
  PARTY_FORMATION_LEFT_ANCHOR,
  PARTY_FORMATION_SLOT_SPACING,
  SPAWN_X_MAX,
  resolveEnemySpawnBattleX,
} from './battleConstants.ts';
import {
  comparePartyFormationSlot,
  computePartyFormationBattleX,
  partyDeployOffScreenBattleX,
  resolveClassFormationRow,
  resolvePartyDeployOffscreenOffset,
} from './partyFormation.ts';

describe('partyFormation', () => {
  it('sorts by range ASC then id (ignores role and formationRow)', () => {
    const units = [
      { id: 'b', role: 'attacker' as const, rangePx: 50, damageType: 'magic' as const, formationRow: 'front' as const },
      { id: 'a', role: 'attacker' as const, rangePx: 50, damageType: 'physical' as const, formationRow: 'front' as const },
      { id: 'c', role: 'defender' as const, rangePx: 0, damageType: 'physical' as const, formationRow: 'front' as const },
    ];
    const sorted = [...units].sort(comparePartyFormationSlot);
    expect(sorted.map((u) => u.id)).toEqual(['c', 'a', 'b']);
  });

  it('places shorter range right of longer range on deploy (§3.3)', () => {
    const units = [
      { id: 'df_duelist', role: 'defender' as const, rangePx: 10, damageType: 'physical' as const, formationRow: 'front' as const },
      { id: 'at_assassin', role: 'attacker' as const, rangePx: 5, damageType: 'physical' as const, formationRow: 'front' as const },
    ];
    const positions = computePartyFormationBattleX(units);
    expect(positions.get('at_assassin')!).toBeGreaterThan(positions.get('df_duelist')!);
    expect(positions.get('at_assassin')! - positions.get('df_duelist')!).toBe(
      PARTY_FORMATION_SLOT_SPACING,
    );
  });

  it('places swordsman left of iron guard by range (deploy slots)', () => {
    const units = [
      { id: 'df_guardian', role: 'defender' as const, rangePx: 5, damageType: 'physical' as const, formationRow: 'front' as const },
      { id: 'at_swordsman', role: 'attacker' as const, rangePx: 8, damageType: 'physical' as const, formationRow: 'front' as const },
    ];
    const positions = computePartyFormationBattleX(units);
    expect(positions.get('df_guardian')!).toBeGreaterThan(positions.get('at_swordsman')!);
    expect(positions.get('df_guardian')! - positions.get('at_swordsman')!).toBe(
      PARTY_FORMATION_SLOT_SPACING,
    );
  });

  it('orders melee trio by range ASC (assassin / guardian / swordsman)', () => {
    const units = [
      { id: 'at_swordsman', role: 'attacker' as const, rangePx: 8, damageType: 'physical' as const, formationRow: 'front' as const },
      { id: 'df_guardian', role: 'defender' as const, rangePx: 5, damageType: 'physical' as const, formationRow: 'front' as const },
      { id: 'at_assassin', role: 'attacker' as const, rangePx: 0, damageType: 'physical' as const, formationRow: 'front' as const },
    ];
    const sorted = [...units].sort(comparePartyFormationSlot);
    expect(sorted.map((u) => u.id)).toEqual(['at_assassin', 'df_guardian', 'at_swordsman']);
  });

  it('same-range tie uses id only (role does not invert depth)', () => {
    const units = [
      { id: 'z_defender', role: 'defender' as const, rangePx: 5, damageType: 'physical' as const, formationRow: 'front' as const },
      { id: 'a_attacker', role: 'attacker' as const, rangePx: 5, damageType: 'physical' as const, formationRow: 'front' as const },
    ];
    const sorted = [...units].sort(comparePartyFormationSlot);
    expect(sorted.map((u) => u.id)).toEqual(['a_attacker', 'z_defender']);
  });

  it('same range sorts by id regardless of role or formationRow', () => {
    const units = [
      { id: 'sp_cleric', role: 'supporter' as const, rangePx: 50, damageType: 'magic' as const, formationRow: 'back' as const },
      { id: 'at_ranger', role: 'attacker' as const, rangePx: 50, damageType: 'physical' as const, formationRow: 'back' as const },
    ];
    const sorted = [...units].sort(comparePartyFormationSlot);
    expect(sorted.map((u) => u.id)).toEqual(['at_ranger', 'sp_cleric']);
  });

  it('§3.3 acceptance: rangePx 40 is rightmost among 40/60/100/300', () => {
    const units = [
      { id: 'r300', role: 'attacker' as const, rangePx: 300, damageType: 'physical' as const },
      { id: 'r40', role: 'attacker' as const, rangePx: 40, damageType: 'physical' as const },
      { id: 'r100', role: 'attacker' as const, rangePx: 100, damageType: 'physical' as const },
      { id: 'r60', role: 'attacker' as const, rangePx: 60, damageType: 'physical' as const },
    ];
    const positions = computePartyFormationBattleX(units);
    const xs = [...positions.values()];
    expect(positions.get('r40')).toBe(Math.max(...xs));
    expect(positions.get('r300')).toBe(PARTY_FORMATION_LEFT_ANCHOR);
    expect(positions.get('r60')).toBe(
      PARTY_FORMATION_LEFT_ANCHOR + 2 * PARTY_FORMATION_SLOT_SPACING,
    );
  });

  it('assigns 5-slot party right-fill from left anchor', () => {
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

  it('resolveEnemySpawnBattleX maps offset to origin-relative battleX', () => {
    expect(resolveEnemySpawnBattleX(0)).toBe(ENEMY_SPAWN_ORIGIN_X);
    expect(resolveEnemySpawnBattleX(SPAWN_X_MAX)).toBe(
      ENEMY_SPAWN_ORIGIN_X + SPAWN_X_MAX,
    );
    expect(resolveEnemySpawnBattleX(999)).toBe(
      ENEMY_SPAWN_ORIGIN_X + SPAWN_X_MAX,
    );
    expect(resolveEnemySpawnBattleX(-10)).toBe(ENEMY_SPAWN_ORIGIN_X);
  });

  it('partyDeployOffScreenBattleX shifts left by speed-scaled deploy travel', () => {
    expect(partyDeployOffScreenBattleX(52)).toBe(
      52 - resolvePartyDeployOffscreenOffset(),
    );
  });

  it('resolveClassFormationRow follows role and range band defaults', () => {
    expect(resolveClassFormationRow('defender', 200)).toBe('front');
    expect(resolveClassFormationRow('attacker', 50)).toBe('front');
    expect(resolveClassFormationRow('attacker', 100)).toBe('back');
    expect(resolveClassFormationRow('supporter', 50)).toBe('front');
    expect(resolveClassFormationRow('supporter', 128)).toBe('back');
  });
});
