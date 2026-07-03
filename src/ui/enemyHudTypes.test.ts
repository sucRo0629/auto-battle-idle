import { describe, expect, it } from 'vitest';
import {
  buildEnemyHudEntries,
  buildEnemyHudGroups,
  resolveEnemyHudGroupKey,
} from './enemyHudTypes.ts';
import type { CombatantSnapshot } from '../battle/types.ts';

function mockEnemy(overrides: Partial<CombatantSnapshot> = {}): CombatantSnapshot {
  return {
    id: 'enemy_1',
    name: 'Test Enemy',
    classId: 'test_enemy',
    hp: 100,
    maxHp: 100,
    baseMaxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    res: 0,
    rangePx: 40,
    effectiveRangePx: 40,
    damageType: 'physical',
    spriteKey: 'test',
    iconKey: 'test_class',
    formationRow: 'front',
    isEnemy: true,
    battleX: 300,
    bodyAnimMarching: false,
    statusEffects: [],
    activeCooldowns: [],
    ...overrides,
  };
}

describe('resolveEnemyHudGroupKey', () => {
  it('prefers enemyTypeId over classId', () => {
    expect(
      resolveEnemyHudGroupKey({
        id: 'e1',
        classId: 'test_enemy',
        enemyTypeId: 'stage_boss_slime',
      }),
    ).toBe('stage_boss_slime');
  });

  it('falls back to classId then id', () => {
    expect(resolveEnemyHudGroupKey({ id: 'e1', classId: 'test_enemy' })).toBe(
      'test_enemy',
    );
    expect(resolveEnemyHudGroupKey({ id: 'solo' })).toBe('solo');
  });
});

describe('buildEnemyHudGroups', () => {
  it('groups alive enemies by classId', () => {
    const groups = buildEnemyHudGroups([
      mockEnemy({ id: 'e1', classId: 'slime', name: 'Slime' }),
      mockEnemy({ id: 'e2', classId: 'slime', name: 'Slime' }),
      mockEnemy({ id: 'e3', classId: 'bat', name: 'Bat' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      groupId: 'slime',
      classId: 'slime',
      count: 2,
      representativeName: 'Slime',
    });
    expect(groups[0]?.enemies.map((enemy) => enemy.id)).toEqual(['e1', 'e2']);
    expect(groups[1]?.count).toBe(1);
  });

  it('excludes defeated enemies and drops empty groups', () => {
    const groups = buildEnemyHudGroups([
      mockEnemy({ id: 'e1', classId: 'slime', hp: 0 }),
      mockEnemy({ id: 'e2', classId: 'slime', hp: 50 }),
      mockEnemy({ id: 'e3', classId: 'bat', hp: 0 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(1);
    expect(groups[0]?.representativeEnemy.id).toBe('e2');
  });

  it('limits visible groups to ten slots', () => {
    const enemies = Array.from({ length: 12 }, (_, i) =>
      mockEnemy({ id: `e${i}`, classId: `type_${i}` }),
    );
    expect(buildEnemyHudGroups(enemies)).toHaveLength(10);
  });

  it('merges importantStates across group members', () => {
    const groups = buildEnemyHudGroups([
      mockEnemy({
        id: 'e1',
        classId: 'slime',
        statusEffects: [{ id: 'burn', kind: 'debuff', stacks: 1 }],
      }),
      mockEnemy({
        id: 'e2',
        classId: 'slime',
        statusEffects: [{ id: 'burn', kind: 'debuff', stacks: 3 }],
      }),
    ]);
    expect(groups[0]?.importantStates).toEqual([
      { id: 'burn', kind: 'debuff', stacks: 3 },
    ]);
  });
});

describe('buildEnemyHudEntries', () => {
  it('maps combatant snapshots to enemy hud rows', () => {
    const entries = buildEnemyHudEntries([
      mockEnemy({ id: 'e1', name: 'Slime' }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.displayName).toBe('Slime');
    expect(entries[0]?.isAlive).toBe(true);
  });

  it('limits the list to ten enemies', () => {
    const enemies = Array.from({ length: 12 }, (_, i) =>
      mockEnemy({ id: `e${i}`, name: `Enemy ${i}` }),
    );
    expect(buildEnemyHudEntries(enemies)).toHaveLength(10);
  });
});
