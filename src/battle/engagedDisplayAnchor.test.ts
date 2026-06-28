import { describe, expect, it } from 'vitest';
import {
  clearEngagedDisplayAnchor,
  getEngagedDisplayAnchorPlayerId,
  setEngagedDisplayAnchorPlayerId,
} from './battleDisplay.ts';
import type { CombatantState } from './types.ts';

function makeEnemy(overrides: Partial<CombatantState> = {}): CombatantState {
  return {
    id: 'enemy-1',
    name: 'test',
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test',
    formationRow: 'front',
    traits: { rangePx: 100, damageType: 'physical' },
    build: { learnedPassiveIds: [], learnedActiveIds: [], equippedActiveSlots: [] },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'test',
    iconKey: 'test',
    isEnemy: true,
    battleX: 200,
    corpseVisible: false,
    ...overrides,
  };
}

describe('engagedDisplayAnchor helpers', () => {
  it('set writes engagedDisplayAnchorPlayerId', () => {
    const enemy = makeEnemy();
    setEngagedDisplayAnchorPlayerId(enemy, 'player-a');
    expect(enemy.engagedDisplayAnchorPlayerId).toBe('player-a');
  });

  it('get reads engagedDisplayAnchorPlayerId', () => {
    const enemy = makeEnemy({ engagedDisplayAnchorPlayerId: 'player-a' });
    expect(getEngagedDisplayAnchorPlayerId(enemy)).toBe('player-a');
  });

  it('clear removes engagedDisplayAnchorPlayerId', () => {
    const enemy = makeEnemy();
    setEngagedDisplayAnchorPlayerId(enemy, 'player-a');
    clearEngagedDisplayAnchor(enemy);
    expect(enemy.engagedDisplayAnchorPlayerId).toBeUndefined();
  });
});
