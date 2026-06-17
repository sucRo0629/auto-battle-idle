import { describe, expect, it } from 'vitest';
import {
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
  it('sorts front row by role then range (defender right of attacker)', () => {
    const units = [
      { id: 'b', role: 'attacker' as const, rangePx: 50, damageType: 'magic' as const, formationRow: 'front' as const },
      { id: 'a', role: 'attacker' as const, rangePx: 50, damageType: 'physical' as const, formationRow: 'front' as const },
      { id: 'c', role: 'defender' as const, rangePx: 0, damageType: 'physical' as const, formationRow: 'front' as const },
    ];
    const sorted = [...units].sort(comparePartyFormationSlot);
    expect(sorted.map((u) => u.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders duelist forward of assassin on deploy (role over range)', () => {
    const units = [
      { id: 'df_duelist', role: 'defender' as const, rangePx: 10, damageType: 'physical' as const, formationRow: 'front' as const },
      { id: 'at_assassin', role: 'attacker' as const, rangePx: 5, damageType: 'physical' as const, formationRow: 'front' as const },
    ];
    const positions = computePartyFormationBattleX(units);
    expect(positions.get('at_assassin')!).toBeLessThan(positions.get('df_duelist')!);
    expect(positions.get('df_duelist')! - positions.get('at_assassin')!).toBe(
      PARTY_FORMATION_SLOT_SPACING,
    );
  });

  it('orders swordsman left of iron guard by range (deploy slots)', () => {
    const units = [
      { id: 'df_guardian', role: 'defender' as const, rangePx: 5, damageType: 'physical' as const, formationRow: 'front' as const },
      { id: 'at_warrior', role: 'attacker' as const, rangePx: 8, damageType: 'physical' as const, formationRow: 'front' as const },
    ];
    const positions = computePartyFormationBattleX(units);
    expect(positions.get('at_warrior')!).toBeLessThan(positions.get('df_guardian')!);
    expect(positions.get('df_guardian')! - positions.get('at_warrior')!).toBe(
      PARTY_FORMATION_SLOT_SPACING,
    );
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
    expect(resolveEnemySpawnBattleX(0)).toBe(240);
    expect(resolveEnemySpawnBattleX(SPAWN_X_MAX)).toBe(480);
    expect(resolveEnemySpawnBattleX(999)).toBe(480);
    expect(resolveEnemySpawnBattleX(-10)).toBe(240);
  });

  it('partyDeployOffScreenBattleX shifts left by speed-scaled deploy travel', () => {
    expect(partyDeployOffScreenBattleX(52)).toBe(
      52 - resolvePartyDeployOffscreenOffset(),
    );
  });
});
