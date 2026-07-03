import { describe, expect, it } from 'vitest';
import { expandEnemyGroups } from './enemyGroupSpawn.ts';
import type { StageDef } from './types.ts';

function stageWithEnemyGroups(
  enemyGroups: NonNullable<StageDef['enemyGroups']>,
  recommendedLevel = 10,
): StageDef {
  return {
    id: 'test_stage',
    displayName: 'Test',
    recommendedLevel,
    enemyGroups,
    waves: [{ enemies: [] }],
  };
}

describe('expandEnemyGroups', () => {
  it('expands one group with count 1 into one spec', () => {
    const specs = expandEnemyGroups(
      stageWithEnemyGroups([{ classId: 'df_paladin', count: 1 }]),
    );

    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({
      classId: 'df_paladin',
      level: 10,
      groupIndex: 0,
      indexInGroup: 0,
      groupCount: 1,
      spawnUnitKey: 'g0_i0',
    });
  });

  it('expands one group with count 3 into three specs', () => {
    const specs = expandEnemyGroups(
      stageWithEnemyGroups([{ classId: 'df_paladin', count: 3 }]),
    );

    expect(specs).toHaveLength(3);
    expect(specs.map((s) => s.indexInGroup)).toEqual([0, 1, 2]);
    expect(specs.every((s) => s.groupIndex === 0 && s.groupCount === 3)).toBe(
      true,
    );
    expect(specs.map((s) => s.spawnUnitKey)).toEqual([
      'g0_i0',
      'g0_i1',
      'g0_i2',
    ]);
  });

  it('keeps stable groupIndex and indexInGroup across multiple groups', () => {
    const specs = expandEnemyGroups(
      stageWithEnemyGroups([
        { classId: 'df_paladin', count: 2 },
        { classId: 'at_hunter', count: 1 },
      ]),
    );

    expect(specs).toHaveLength(3);
    expect(specs.map((s) => [s.groupIndex, s.indexInGroup])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
    expect(specs[0]?.classId).toBe('df_paladin');
    expect(specs[2]?.classId).toBe('at_hunter');
    expect(specs[2]?.groupCount).toBe(1);
  });

  it('uses stage.recommendedLevel as level', () => {
    const specs = expandEnemyGroups(
      stageWithEnemyGroups([{ classId: 'df_paladin', count: 1 }], 25),
    );

    expect(specs[0]?.level).toBe(25);
  });

  it('preserves scales from the group', () => {
    const specs = expandEnemyGroups(
      stageWithEnemyGroups([
        {
          classId: 'df_paladin',
          count: 2,
          hpScale: 1.5,
          atkScale: 2,
          defScale: 0.8,
          regScale: 1.2,
        },
      ]),
    );

    expect(specs).toHaveLength(2);
    for (const spec of specs) {
      expect(spec).toMatchObject({
        hpScale: 1.5,
        atkScale: 2,
        defScale: 0.8,
        regScale: 1.2,
      });
    }
  });

  it('returns empty array when enemyGroups is absent', () => {
    const legacyStage: StageDef = {
      id: 'legacy',
      displayName: 'Legacy',
      waves: [{ enemies: [{ templateId: 'dummy', spawnX: 0 }] }],
    };

    expect(expandEnemyGroups(legacyStage)).toEqual([]);
  });

  it('returns empty array when enemyGroups is an empty array', () => {
    const stage: StageDef = {
      id: 'empty_groups',
      displayName: 'Empty Groups',
      recommendedLevel: 5,
      enemyGroups: [],
      waves: [{ enemies: [] }],
    };

    expect(expandEnemyGroups(stage)).toEqual([]);
  });
});
