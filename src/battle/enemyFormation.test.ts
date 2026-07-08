import { describe, expect, it, beforeEach } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createEnemiesForStage, resetEntityIdCounter } from './entities.ts';
import {
  compareEnemyFormationSlot,
  computeEnemyFormationSpawnX,
  resolveEnemyGroupSpawnX,
} from './enemyFormation.ts';
import { expandEnemyGroups } from './enemyGroupSpawn.ts';
import {
  ENEMY_SPAWN_ORIGIN_X,
  PARTY_FORMATION_SLOT_SPACING,
  SPAWN_X_MAX,
  resolveEnemySpawnBattleX,
} from './battleConstants.ts';
import type { StageDef } from './types.ts';

const levelCurves = loadLevelCurves(levelCurvesJson);
const gameData = loadGameData();

function stageWithEnemyGroups(
  enemyGroups: NonNullable<StageDef['enemyGroups']>,
  recommendedLevel = 10,
): StageDef {
  return {
    id: 'formation_test',
    displayName: 'Formation Test',
    recommendedLevel,
    enemyGroups,
    waves: [{ enemies: [] }],
  };
}

function gameDataWithStage(stage: StageDef) {
  return {
    ...gameData,
    stages: [...gameData.stages.filter((s) => s.id !== stage.id), stage],
  };
}

function rangePx(classId: string): number {
  return gameData.classRegistry[classId]!.traits.rangePx;
}

describe('enemyFormation', () => {
  it('sorts shorter range before longer range', () => {
    const units = [
      {
        key: 'ranged',
        rangePx: rangePx('at_hunter'),
        groupIndex: 0,
        indexInGroup: 0,
      },
      {
        key: 'melee',
        rangePx: rangePx('at_assassin'),
        groupIndex: 1,
        indexInGroup: 0,
      },
    ];
    const sorted = [...units].sort(compareEnemyFormationSlot);
    expect(sorted.map((u) => u.key)).toEqual(['melee', 'ranged']);
  });

  it('tie-breaks same range by groupIndex then indexInGroup', () => {
    const units = [
      {
        key: 'g1_i1',
        rangePx: 10,
        groupIndex: 1,
        indexInGroup: 0,
      },
      {
        key: 'g0_i1',
        rangePx: 10,
        groupIndex: 0,
        indexInGroup: 1,
      },
      {
        key: 'g0_i0',
        rangePx: 10,
        groupIndex: 0,
        indexInGroup: 0,
      },
    ];
    const sorted = [...units].sort(compareEnemyFormationSlot);
    expect(sorted.map((u) => u.key)).toEqual(['g0_i0', 'g0_i1', 'g1_i1']);
  });

  it('assigns spawnX with PARTY_FORMATION_SLOT_SPACING between sorted slots', () => {
    const positions = computeEnemyFormationSpawnX([
      {
        key: 'rear',
        rangePx: rangePx('at_hunter'),
        groupIndex: 0,
        indexInGroup: 0,
      },
      {
        key: 'front',
        rangePx: rangePx('at_assassin'),
        groupIndex: 1,
        indexInGroup: 0,
      },
    ]);

    expect(positions.get('front')).toBe(0);
    expect(positions.get('rear')).toBe(PARTY_FORMATION_SLOT_SPACING);
  });

  it('resolveEnemyGroupSpawnX maps specs by spawnUnitKey', () => {
    const stage = stageWithEnemyGroups([
      { classId: 'at_hunter', count: 1 },
      { classId: 'at_assassin', count: 1 },
    ]);
    const specs = expandEnemyGroups(stage);
    const positions = resolveEnemyGroupSpawnX(specs, (classId) =>
      rangePx(classId),
    );

    expect(positions.get('g0_i0')).toBe(PARTY_FORMATION_SLOT_SPACING);
    expect(positions.get('g1_i0')).toBe(0);
  });

  it('clamps spawnX to SPAWN_X_MAX', () => {
    const unitCount = 8;
    const units = Array.from({ length: unitCount }, (_, i) => ({
      key: `u${i}`,
      rangePx: i,
      groupIndex: 0,
      indexInGroup: i,
    }));
    const positions = computeEnemyFormationSpawnX(units);

    for (const spawnX of positions.values()) {
      expect(spawnX).toBeGreaterThanOrEqual(0);
      expect(spawnX).toBeLessThanOrEqual(SPAWN_X_MAX);
      expect(resolveEnemySpawnBattleX(spawnX)).toBe(
        ENEMY_SPAWN_ORIGIN_X + spawnX,
      );
    }
  });

  it('compresses rear slots when ideal depth exceeds SPAWN_X_MAX', () => {
    const unitCount = 13;
    const idealRearSpawnX = (unitCount - 1) * PARTY_FORMATION_SLOT_SPACING;
    expect(idealRearSpawnX).toBeGreaterThan(SPAWN_X_MAX);

    const units = Array.from({ length: unitCount }, (_, i) => ({
      key: `u${i}`,
      rangePx: i,
      groupIndex: 0,
      indexInGroup: i,
    }));
    const positions = computeEnemyFormationSpawnX(units);
    const rearSpawnX = positions.get('u12')!;

    expect(rearSpawnX).toBe(SPAWN_X_MAX);
    expect(rearSpawnX).toBeLessThan(idealRearSpawnX);
  });
});

describe('createEnemiesForStage enemyGroups spawn placement', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('places shorter-range enemy in front of longer-range enemy', () => {
    const stage = stageWithEnemyGroups([
      { classId: 'at_hunter', count: 1 },
      { classId: 'at_assassin', count: 1 },
    ]);
    const enemies = createEnemiesForStage(
      gameDataWithStage(stage),
      stage.id,
      0,
      levelCurves,
    );

    const hunter = enemies.find((e) => e.classId === 'at_hunter')!;
    const assassin = enemies.find((e) => e.classId === 'at_assassin')!;
    expect(assassin.spawnX).toBeLessThan(hunter.spawnX);
    expect(hunter.spawnX - assassin.spawnX).toBe(PARTY_FORMATION_SLOT_SPACING);
  });

  it('keeps legacy stage spawnX from waves data', () => {
    const legacy = loadGameData();
    const stage = legacy.stages.find((s) => s.id === '1')!;
    const expectedSpawnX = stage.waves[0]!.enemies.map((e) => e.spawnX);

    const enemies = createEnemiesForStage(legacy, '1', 0);
    expect(enemies.map((e) => e.spawnX)).toEqual(expectedSpawnX);
  });
});
