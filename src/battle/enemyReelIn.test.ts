import { describe, expect, it } from 'vitest';
import type { CombatantState, GameData } from './types.ts';
import { applyEnemyReelIn, resolveEnemyReelInBattleX } from './enemyReelIn.ts';

function mockDuelist(battleX: number): CombatantState {
  return {
    id: 'duelist',
    name: 'duelist',
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    res: 0,
    isAlive: true,
    role: 'defender',
    classId: 'df_duelist',
    formationRow: 'front',
    traits: { rangePx: 30, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: { learnedPassiveIds: [], learnedActiveIds: [], equippedActiveSlots: [] },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'df_duelist',
    iconKey: 'df_duelist',
    isEnemy: false,
    battleX,
    corpseVisible: true,
  };
}

function mockEnemy(battleX: number): CombatantState {
  return {
    id: 'ranged',
    name: 'ranged',
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    res: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test_ranged',
    formationRow: 'front',
    traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: { learnedPassiveIds: [], learnedActiveIds: [], equippedActiveSlots: [] },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'enemy',
    iconKey: 'enemy',
    isEnemy: true,
    battleX,
    corpseVisible: true,
  };
}

const gameData = { stages: [], enemyRegistry: {}, classRegistry: {} } as GameData;

describe('enemyReelIn', () => {
  it('pulls enemy into duelist melee range', () => {
    const duelist = mockDuelist(50);
    const enemy = mockEnemy(200);
    const pulledX = resolveEnemyReelInBattleX(duelist, enemy, gameData);
    expect(pulledX).toBe(80);
    const delta = applyEnemyReelIn(duelist, enemy, gameData);
    expect(delta).toBeLessThan(0);
    expect(enemy.battleX).toBe(80);
    expect(enemy.battleX).toBe(80);
  });

  it('uses actor traits.rangePx for destination, not skill targeting range', () => {
    const duelist = mockDuelist(80);
    duelist.traits.rangePx = 0;
    const enemy = mockEnemy(250);
    const pulledX = resolveEnemyReelInBattleX(duelist, enemy, gameData);
    expect(pulledX).toBe(80);
    const delta = applyEnemyReelIn(duelist, enemy, gameData);
    expect(delta).toBe(-170);
    expect(enemy.battleX).toBe(80);
  });

  it('returns zero delta when enemy is already at pull destination', () => {
    const duelist = mockDuelist(80);
    duelist.traits.rangePx = 0;
    const enemy = mockEnemy(80);
    expect(applyEnemyReelIn(duelist, enemy, gameData)).toBe(0);
  });
});
