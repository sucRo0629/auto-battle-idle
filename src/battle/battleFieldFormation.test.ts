/**
 * battle-field.md §3.3 / §2.6 / L10 — pure formation layout (no BattleEngine).
 */
import { describe, expect, it } from 'vitest';
import {
  BATTLE_ENEMY_SPAWN_MIN_X,
  PLAYER_ROW_SPACING,
  PLAYER_VISUAL_MIN_GAP,
  ROW_X,
} from './battleConstants.ts';
import {
  clampEngagedEnemyGroupOnScreen,
  computePlayerPositions,
  resolveFormationScreenTargets,
  resolveOverlaps,
} from './battleLayout.ts';
import { loadGameData } from './data/loadGameData.ts';
import { CANVAS_W } from './battleConstants.ts';

describe('battle-field formation spec (F-*)', () => {
  it('F-3.3-01: front row defender is right of attacker', () => {
    const positions = computePlayerPositions([
      { id: 'guard', role: 'defender', formationRow: 'front', rangePx: 0, isAlive: true },
      { id: 'sword', role: 'attacker', formationRow: 'front', rangePx: 0, isAlive: true },
    ]);
    expect(positions.get('guard')!).toBeGreaterThan(positions.get('sword')!);
    expect(positions.get('guard')! - positions.get('sword')!).toBeCloseTo(
      PLAYER_ROW_SPACING,
      0,
    );
  });

  it('F-3.3-02: same row shorter range is further right', () => {
    const positions = computePlayerPositions([
      { id: 'cleric', role: 'supporter', formationRow: 'back', rangePx: 40, isAlive: true },
      { id: 'archer', role: 'attacker', formationRow: 'back', rangePx: 50, isAlive: true },
    ]);
    expect(positions.get('cleric')!).toBeGreaterThan(positions.get('archer')!);
  });

  it('F-3.3-03: ROW_X back < middle < front', () => {
    expect(ROW_X.back).toBeLessThan(ROW_X.middle);
    expect(ROW_X.middle).toBeLessThan(ROW_X.front);
  });

  it('F-3.3-04: resolveOverlaps enforces PLAYER_VISUAL_MIN_GAP', () => {
    const placements = [
      {
        id: 'a',
        role: 'attacker' as const,
        formationRow: 'front' as const,
        rangePx: 0,
        x: ROW_X.front,
      },
      {
        id: 'b',
        role: 'defender' as const,
        formationRow: 'front' as const,
        rangePx: 0,
        x: ROW_X.front + 10,
      },
    ];
    resolveOverlaps(placements, PLAYER_VISUAL_MIN_GAP);
    expect(placements[1]!.x - placements[0]!.x).toBeGreaterThanOrEqual(
      PLAYER_VISUAL_MIN_GAP - 0.01,
    );
  });

  it('F-3.3-05: resolveFormationScreenTargets preserves front-row slot spacing', () => {
    const targets = resolveFormationScreenTargets([
      { id: 'guard', role: 'defender', formationRow: 'front', rangePx: 0, isAlive: true },
      { id: 'sword', role: 'attacker', formationRow: 'front', rangePx: 0, isAlive: true },
    ]);
    expect(targets.get('guard')! - targets.get('sword')!).toBe(PLAYER_ROW_SPACING);
    expect(targets.get('guard')!).toBeGreaterThan(targets.get('sword')!);
  });

  it('F-3.2-01: stage enemy spawnX meets forward minimum', () => {
    const gameData = loadGameData();
    const stage1 = gameData.stages.find((s) => s.id === '1');
    expect(stage1).toBeDefined();
    for (const wave of stage1!.waves) {
      for (const spawn of wave.enemies) {
        expect(spawn.spawnX).toBeGreaterThanOrEqual(BATTLE_ENEMY_SPAWN_MIN_X);
      }
    }
  });

  it('clampEngagedEnemyGroupOnScreen keeps group inside canvas horizontally', () => {
    const ideals = [
      { id: 'e1', visualX: -100, isAlive: true as const },
      { id: 'e2', visualX: -60, isAlive: true as const },
    ];
    const clamped = clampEngagedEnemyGroupOnScreen(ideals, 0);
    for (const x of clamped.values()) {
      expect(x).toBeGreaterThanOrEqual(-CANVAS_W);
      expect(x).toBeLessThanOrEqual(CANVAS_W);
    }
  });
});
