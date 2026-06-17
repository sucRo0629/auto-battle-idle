/**
 * battle-field.md §3.3 / §3.2 — pure formation layout (no BattleEngine).
 */
import { describe, expect, it } from 'vitest';
import {
  PARTY_FORMATION_LEFT_ANCHOR,
  PARTY_FORMATION_SLOT_SPACING,
  PLAYER_VISUAL_MIN_GAP,
  SPAWN_X_MAX,
  resolveEnemySpawnBattleX,
} from './battleConstants.ts';
import {
  clampEngagedEnemyGroupOnScreen,
  computeEnemyStopX,
  computePlayerPositions,
  isEngagedFormationRangePx,
  resolveOverlaps,
} from './battleLayout.ts';
import { RANGED_ATTACK_MIN_PX } from './types.ts';
import { loadGameData } from './data/loadGameData.ts';
import { CANVAS_W } from './battleConstants.ts';

describe('battle-field formation spec (F-*)', () => {
  it('F-3.3-01: longer range is left of shorter range', () => {
    const positions = computePlayerPositions([
      { id: 'guard', role: 'defender', formationRow: 'front', rangePx: 0, isAlive: true },
      { id: 'archer', role: 'attacker', formationRow: 'back', rangePx: 50, isAlive: true },
    ]);
    expect(positions.get('archer')!).toBeLessThan(positions.get('guard')!);
    expect(positions.get('guard')! - positions.get('archer')!).toBe(
      PARTY_FORMATION_SLOT_SPACING,
    );
  });

  it('F-3.3-02: same range back row sorts attacker left of supporter', () => {
    const positions = computePlayerPositions([
      { id: 'cleric', role: 'supporter', formationRow: 'back', rangePx: 50, damageType: 'magic', isAlive: true },
      { id: 'ranger', role: 'attacker', formationRow: 'back', rangePx: 50, damageType: 'physical', isAlive: true },
    ]);
    expect(positions.get('ranger')!).toBeLessThan(positions.get('cleric')!);
  });

  it('F-3.3-03: left anchor is 20px with 32px slot spacing (back to front)', () => {
    const positions = computePlayerPositions([
      { id: 'a', role: 'attacker', formationRow: 'front', rangePx: 60, isAlive: true },
      { id: 'b', role: 'attacker', formationRow: 'back', rangePx: 80, isAlive: true },
      { id: 'c', role: 'attacker', formationRow: 'back', rangePx: 100, isAlive: true },
    ]);
    expect(positions.get('c')).toBe(PARTY_FORMATION_LEFT_ANCHOR);
    expect(positions.get('b')).toBe(PARTY_FORMATION_LEFT_ANCHOR + PARTY_FORMATION_SLOT_SPACING);
    expect(positions.get('a')).toBe(PARTY_FORMATION_LEFT_ANCHOR + 2 * PARTY_FORMATION_SLOT_SPACING);
  });

  it('F-3.3-04: resolveOverlaps enforces PLAYER_VISUAL_MIN_GAP', () => {
    const placements = [
      {
        id: 'a',
        role: 'attacker' as const,
        formationRow: 'front' as const,
        rangePx: 0,
        x: 100,
      },
      {
        id: 'b',
        role: 'defender' as const,
        formationRow: 'front' as const,
        rangePx: 0,
        x: 110,
      },
    ];
    resolveOverlaps(placements, PLAYER_VISUAL_MIN_GAP);
    expect(placements[1]!.x - placements[0]!.x).toBeGreaterThanOrEqual(
      PLAYER_VISUAL_MIN_GAP - 0.01,
    );
  });

  it('F-3.2-01: stage enemy spawnX is center-relative offset 0..240', () => {
    const gameData = loadGameData();
    const stage1 = gameData.stages.find((s) => s.id === '1');
    expect(stage1).toBeDefined();
    for (const wave of stage1!.waves) {
      for (const spawn of wave.enemies) {
        expect(spawn.spawnX).toBeGreaterThanOrEqual(0);
        expect(spawn.spawnX).toBeLessThanOrEqual(SPAWN_X_MAX);
        expect(resolveEnemySpawnBattleX(spawn.spawnX)).toBeLessThanOrEqual(CANVAS_W);
      }
    }
  });

  it('F-§4.2-01: enemy stop uses effectiveRangePx without body-gap add-on (L10)', () => {
    expect(computeEnemyStopX(30, 200, 0)).toBe(230);
    expect(computeEnemyStopX(RANGED_ATTACK_MIN_PX, 200, 0)).toBe(
      200 + RANGED_ATTACK_MIN_PX,
    );
    expect(isEngagedFormationRangePx(RANGED_ATTACK_MIN_PX - 1)).toBe(false);
    expect(isEngagedFormationRangePx(RANGED_ATTACK_MIN_PX)).toBe(true);
  });

  it('clampEngagedEnemyGroupOnScreen keeps group inside canvas horizontally', () => {
    const ideals = [
      { id: 'e1', battleX: -100, isAlive: true as const },
      { id: 'e2', battleX: -60, isAlive: true as const },
    ];
    const clamped = clampEngagedEnemyGroupOnScreen(ideals);
    for (const x of clamped.values()) {
      expect(x).toBeGreaterThanOrEqual(-CANVAS_W);
      expect(x).toBeLessThanOrEqual(CANVAS_W);
    }
  });
});
