import { describe, expect, it } from 'vitest';
import {
  applyEnemyStatScales,
  expandEnemyGroups,
  expandEnemyGroupsList,
  resolveEnemyStatScale,
} from './enemyGroupSpawn.ts';
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
      level: 1,
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

  it('uses ENEMY_GROUP_BASE_LEVEL (ignores recommendedLevel)', () => {
    const specs = expandEnemyGroups(
      stageWithEnemyGroups([{ classId: 'df_paladin', count: 1 }], 25),
    );

    expect(specs[0]?.level).toBe(1);
  });

  it('expands without recommendedLevel', () => {
    const stage: StageDef = {
      id: 'no_level',
      displayName: 'No Level',
      enemyGroups: [{ classId: 'df_paladin', count: 1 }],
      waves: [{ enemies: [] }],
    };
    const specs = expandEnemyGroups(stage);
    expect(specs).toHaveLength(1);
    expect(specs[0]?.level).toBe(1);
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
          resScale: 1.2,
        },
      ]),
    );

    expect(specs).toHaveLength(2);
    for (const spec of specs) {
      expect(spec).toMatchObject({
        hpScale: 1.5,
        atkScale: 2,
        defScale: 0.8,
        resScale: 1.2,
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

  it('delegates to expandEnemyGroupsList with the same groups', () => {
    const enemyGroups = [
      { classId: 'df_paladin' as const, count: 2 },
      { classId: 'at_hunter' as const, count: 1, atkScale: 1.5 },
    ];
    const fromStage = expandEnemyGroups(stageWithEnemyGroups(enemyGroups));
    const fromList = expandEnemyGroupsList(enemyGroups);

    expect(fromStage).toHaveLength(3);
    expect(fromStage).toEqual(fromList);
  });
});

describe('applyEnemyStatScales', () => {
  it('multiplies stats and rounds to integers', () => {
    const result = applyEnemyStatScales(
      { maxHp: 100, atk: 11, def: 7, res: 3 },
      { hpScale: 1.5, atkScale: 2, defScale: 0.8, resScale: 1.2 },
    );

    expect(result).toEqual({
      maxHp: 150,
      atk: 22,
      def: 6,
      res: 4,
    });
  });

  it('treats undefined scale as 1', () => {
    const stats = { maxHp: 80, atk: 12, def: 5, res: 2 };
    expect(applyEnemyStatScales(stats, {})).toEqual(stats);
    expect(resolveEnemyStatScale(undefined)).toBe(1);
  });

  it('floors maxHp and atk to at least 1 after rounding', () => {
    const result = applyEnemyStatScales(
      { maxHp: 100, atk: 10, def: 50, res: 0 },
      { hpScale: 0.001, atkScale: 0.01, defScale: 0.01, resScale: 1 },
    );

    expect(result).toEqual({
      maxHp: 1,
      atk: 1,
      def: 1,
      res: 0,
    });
  });

  it('allows def and reg to round to 0', () => {
    const result = applyEnemyStatScales(
      { maxHp: 100, atk: 10, def: 3, res: 0 },
      { hpScale: 1, atkScale: 1, defScale: 0.1, resScale: 0.5 },
    );

    expect(result).toEqual({
      maxHp: 100,
      atk: 10,
      def: 0,
      res: 0,
    });
  });
});
