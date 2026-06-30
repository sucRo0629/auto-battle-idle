import { describe, expect, it } from 'vitest';
import { buildEnemyHudEntries } from './enemyHudTypes.ts';
import type { CombatantSnapshot } from '../battle/types.ts';

function mockEnemy(overrides: Partial<CombatantSnapshot> = {}): CombatantSnapshot {
  return {
    id: 'enemy_1',
    name: 'Test Enemy',
    hp: 100,
    maxHp: 100,
    baseMaxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    reg: 0,
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
